import { Request, Response, NextFunction } from 'express';
import https from 'https';
import { query } from '../config/database';
import { env } from '../config/env';

// ─── API 4 ──────────────────────────────────────────────────────────────────
// GET /reports/:id  – full report details including attached files
export const getReportById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [reportRes, filesRes] = await Promise.all([
      query(
        `SELECT mr.*,
                p.first_name       AS patient_first_name,
                p.last_name        AS patient_last_name,
                p.patient_code,
                p.date_of_birth,
                DATE_PART('year', AGE(p.date_of_birth))::INT AS patient_age,
                p.gender           AS patient_gender,
                p.blood_type       AS patient_blood_type,
                p.phone            AS patient_phone,
                CONCAT(u.first_name,' ',u.last_name) AS doctor_name,
                d.specialization   AS doctor_specialization,
                dept.name          AS department_name,
                e.encounter_type,
                e.chief_complaint,
                e.assessment,
                e.plan,
                e.encounter_date,
                lo.order_date      AS lab_order_date,
                lo.priority        AS lab_priority,
                lo.status          AS lab_status,
                ro.order_date      AS radiology_order_date,
                ro.priority        AS radiology_priority,
                ro.status          AS radiology_status
         FROM medical_reports mr
         JOIN patients p ON p.id = mr.patient_id
         LEFT JOIN doctors d ON d.id = mr.doctor_id
         LEFT JOIN users u ON u.id = d.user_id
         LEFT JOIN departments dept ON dept.id = (
             SELECT department_id FROM appointments
             WHERE id = (SELECT appointment_id FROM encounters WHERE id = mr.encounter_id LIMIT 1)
             LIMIT 1
         )
         LEFT JOIN encounters e ON e.id = mr.encounter_id
         LEFT JOIN lab_orders lo ON lo.id = mr.lab_order_id
         LEFT JOIN radiology_orders ro ON ro.id = mr.radiology_order_id
         WHERE mr.id = $1`,
        [req.params.id],
      ),
      query(
        `SELECT id, file_name, file_type, file_size, storage_url, uploaded_at
         FROM report_files
         WHERE report_id = $1
         ORDER BY uploaded_at ASC`,
        [req.params.id],
      ),
    ]);

    if (reportRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Report not found' });
      return;
    }

    const report = reportRes.rows[0];

    // Fetch lab order items if linked
    let labResults: unknown[] = [];
    if (report.lab_order_id) {
      const labItemsRes = await query(
        `SELECT loi.*, ltc.name AS test_name, ltc.code, ltc.category, ltc.unit AS catalog_unit
         FROM lab_order_items loi
         JOIN lab_test_catalog ltc ON ltc.id = loi.lab_test_id
         WHERE loi.lab_order_id = $1
         ORDER BY loi.id`,
        [report.lab_order_id],
      );
      labResults = labItemsRes.rows;
    }

    // Fetch radiology order items if linked
    let radiologyResults: unknown[] = [];
    if (report.radiology_order_id) {
      const radioItemsRes = await query(
        `SELECT roi.*, rtc.name AS test_name, rtc.modality, rtc.description
         FROM radiology_order_items roi
         JOIN radiology_test_catalog rtc ON rtc.id = roi.radiology_test_id
         WHERE roi.radiology_order_id = $1
         ORDER BY roi.id`,
        [report.radiology_order_id],
      );
      radiologyResults = radioItemsRes.rows;
    }

    res.json({
      success: true,
      data: {
        ...report,
        lab_results:       labResults,
        radiology_results: radiologyResults,
        files:             filesRes.rows,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /reports?patient_id=&type=&page=&limit=  – list reports with basic info
export const getReports = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page      = Math.max(1,   parseInt(req.query.page  as string || '1',  10));
    const limit     = Math.min(100, parseInt(req.query.limit as string || '20', 10));
    const patientId = req.query.patient_id as string | undefined;
    const type      = req.query.type       as string | undefined;
    const offset    = (page - 1) * limit;

    const params: unknown[] = [limit, offset];
    const conditions: string[] = [];
    let idx = 3;

    if (patientId) { conditions.push(`mr.patient_id = $${idx++}`); params.push(patientId); }
    if (type)      { conditions.push(`mr.report_type = $${idx++}`); params.push(type); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countWhere = conditions.length
      ? `WHERE ${conditions.map((c, i) => c.replace(`$${i + 3}`, `$${i + 1}`)).join(' AND ')}`
      : '';

    const [dataRes, countRes] = await Promise.all([
      query(
        `SELECT mr.id, mr.report_type, mr.title, mr.summary, mr.report_date, mr.status,
                mr.encounter_id, mr.lab_order_id, mr.radiology_order_id,
                CONCAT(p.first_name,' ',p.last_name) AS patient_name, p.patient_code,
                CONCAT(u.first_name,' ',u.last_name) AS doctor_name,
                (SELECT COUNT(*) FROM report_files rf WHERE rf.report_id = mr.id) AS file_count
         FROM medical_reports mr
         JOIN patients p ON p.id = mr.patient_id
         LEFT JOIN doctors d ON d.id = mr.doctor_id
         LEFT JOIN users u ON u.id = d.user_id
         ${where}
         ORDER BY mr.report_date DESC, mr.created_at DESC
         LIMIT $1 OFFSET $2`,
        params,
      ),
      query(
        `SELECT COUNT(*) FROM medical_reports mr ${countWhere}`,
        conditions.length ? params.slice(2) : [],
      ),
    ]);

    const total = parseInt(countRes.rows[0].count, 10);
    res.json({
      success: true,
      data: dataRes.rows,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// POST /reports/:id/summarize
// Calls DeepSeek to generate a patient-friendly summary and saves it to
// medical_reports.summary. Returns the updated summary.
// ---------------------------------------------------------------------------

function deepseekChat(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!env.deepseekApiKey) {
      reject(new Error('DEEPSEEK_API_KEY is not configured'));
      return;
    }

    const body = JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content:
            'You are a medical assistant that writes clear, compassionate, patient-friendly summaries of medical reports. ' +
            'Avoid jargon. Use simple language a non-medical person can understand. ' +
            'Be concise (3-5 sentences). Do not make diagnoses or give advice beyond what the report states.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 400,
    });

    const options = {
      hostname: 'api.deepseek.com',
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.deepseekApiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data) as {
            choices?: { message?: { content?: string } }[];
            error?: { message?: string };
          };
          if (parsed.error) { reject(new Error(parsed.error.message || 'DeepSeek error')); return; }
          const content = parsed.choices?.[0]?.message?.content?.trim();
          if (!content) { reject(new Error('Empty response from DeepSeek')); return; }
          resolve(content);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

export const summarizeReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const reportId = parseInt(req.params.id, 10);

    // Fetch full report + related data (same joins as getReportById)
    const reportRes = await query(
      `SELECT mr.*,
              p.first_name       AS patient_first_name,
              p.last_name        AS patient_last_name,
              DATE_PART('year', AGE(p.date_of_birth))::INT AS patient_age,
              p.gender           AS patient_gender,
              CONCAT(u.first_name,' ',u.last_name) AS doctor_name,
              d.specialization   AS doctor_specialization,
              e.chief_complaint,
              e.assessment,
              e.plan
       FROM medical_reports mr
       JOIN patients p ON p.id = mr.patient_id
       LEFT JOIN doctors d ON d.id = mr.doctor_id
       LEFT JOIN users u ON u.id = d.user_id
       LEFT JOIN encounters e ON e.id = mr.encounter_id
       WHERE mr.id = $1`,
      [reportId],
    );

    if (reportRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Report not found' });
      return;
    }

    const r = reportRes.rows[0];

    // Gather lab results if linked
    let labLines = '';
    if (r.lab_order_id) {
      const labRes = await query(
        `SELECT ltc.name, loi.result_value, loi.unit, loi.normal_range, loi.interpretation
         FROM lab_order_items loi
         JOIN lab_test_catalog ltc ON ltc.id = loi.lab_test_id
         WHERE loi.lab_order_id = $1 AND loi.result_value IS NOT NULL`,
        [r.lab_order_id],
      );
      labLines = labRes.rows
        .map((row) => `  - ${row.name}: ${row.result_value} ${row.unit || ''} (normal: ${row.normal_range || 'N/A'}, interpretation: ${row.interpretation || 'N/A'})`)
        .join('\n');
    }

    // Gather radiology results if linked
    let radioLines = '';
    if (r.radiology_order_id) {
      const radioRes = await query(
        `SELECT rtc.name, roi.findings, roi.impression
         FROM radiology_order_items roi
         JOIN radiology_test_catalog rtc ON rtc.id = roi.radiology_test_id
         WHERE roi.radiology_order_id = $1`,
        [r.radiology_order_id],
      );
      radioLines = radioRes.rows
        .map((row) => `  - ${row.name}: Findings: ${row.findings || 'N/A'} | Impression: ${row.impression || 'N/A'}`)
        .join('\n');
    }

    // Build the prompt
    const lines: string[] = [
      `Report title: ${r.title}`,
      `Report type: ${r.report_type}`,
      `Patient: ${r.patient_first_name} ${r.patient_last_name}, Age: ${r.patient_age ?? 'N/A'}, Gender: ${r.patient_gender ?? 'N/A'}`,
      `Doctor: ${r.doctor_name ?? 'N/A'} (${r.doctor_specialization ?? 'N/A'})`,
      `Report date: ${r.report_date ?? 'N/A'}`,
      `Status: ${r.status}`,
    ];

    if (r.chief_complaint) lines.push(`Chief complaint: ${r.chief_complaint}`);
    if (r.assessment)      lines.push(`Doctor's assessment: ${r.assessment}`);
    if (r.plan)            lines.push(`Treatment plan: ${r.plan}`);
    if (labLines)          lines.push(`Lab results:\n${labLines}`);
    if (radioLines)        lines.push(`Radiology results:\n${radioLines}`);

    lines.push(
      '\nPlease write a short, warm, patient-friendly summary of this medical report in plain English.',
    );

    const aiSummary = await deepseekChat(lines.join('\n'));

    // Persist to DB
    await query(
      'UPDATE medical_reports SET summary = $1, updated_at = NOW() WHERE id = $2',
      [aiSummary, reportId],
    );

    res.json({
      success: true,
      data: {
        report_id: reportId,
        summary:   aiSummary,
      },
    });
  } catch (err) {
    next(err);
  }
};
