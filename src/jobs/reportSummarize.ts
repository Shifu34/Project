import https from 'https';
import { query } from '../config/database';
import { env } from '../config/env';
import logger from '../config/logger';

// Check every 60 seconds for unsummarized reports
const POLL_INTERVAL_MS = 60_000;

function deepseekChat(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
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

async function buildPrompt(reportId: number): Promise<string | null> {
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

  if (reportRes.rows.length === 0) return null;
  const r = reportRes.rows[0];

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

  if (r.lab_order_id) {
    const labRes = await query(
      `SELECT ltc.name, loi.result_value, loi.unit, loi.normal_range, loi.interpretation
       FROM lab_order_items loi
       JOIN lab_test_catalog ltc ON ltc.id = loi.lab_test_id
       WHERE loi.lab_order_id = $1 AND loi.result_value IS NOT NULL`,
      [r.lab_order_id],
    );
    if (labRes.rows.length > 0) {
      const labLines = labRes.rows
        .map((row) => `  - ${row.name}: ${row.result_value} ${row.unit || ''} (normal: ${row.normal_range || 'N/A'}, interpretation: ${row.interpretation || 'N/A'})`)
        .join('\n');
      lines.push(`Lab results:\n${labLines}`);
    }
  }

  if (r.radiology_order_id) {
    const radioRes = await query(
      `SELECT rtc.name, roi.findings, roi.impression
       FROM radiology_order_items roi
       JOIN radiology_test_catalog rtc ON rtc.id = roi.radiology_test_id
       WHERE roi.radiology_order_id = $1`,
      [r.radiology_order_id],
    );
    if (radioRes.rows.length > 0) {
      const radioLines = radioRes.rows
        .map((row) => `  - ${row.name}: Findings: ${row.findings || 'N/A'} | Impression: ${row.impression || 'N/A'}`)
        .join('\n');
      lines.push(`Radiology results:\n${radioLines}`);
    }
  }

  lines.push('\nPlease write a short, warm, patient-friendly summary of this medical report in plain English.');
  return lines.join('\n');
}

async function run(): Promise<void> {
  if (!env.deepseekApiKey) return; // silently skip if not configured

  // Fetch up to 5 reports with no summary per tick to avoid hammering the API
  const pending = await query(
    `SELECT id FROM medical_reports WHERE (summary IS NULL OR summary = '') ORDER BY created_at ASC LIMIT 5`,
    [],
  );

  if (pending.rows.length === 0) return;

  logger.info(`[ReportSummarizeJob] ${pending.rows.length} report(s) to summarize`);

  for (const row of pending.rows) {
    try {
      const prompt = await buildPrompt(row.id as number);
      if (!prompt) continue;

      const summary = await deepseekChat(prompt);
      await query(
        'UPDATE medical_reports SET summary = $1, updated_at = NOW() WHERE id = $2',
        [summary, row.id],
      );
      logger.info(`[ReportSummarizeJob] Summarized report #${row.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[ReportSummarizeJob] Failed to summarize report #${row.id}: ${msg}`);
      // Continue to next report — don't let one failure block others
    }
  }
}

export function startReportSummarizeJob(): void {
  if (!env.deepseekApiKey) {
    logger.warn('[ReportSummarizeJob] DEEPSEEK_API_KEY not set — job disabled');
    return;
  }
  logger.info('[ReportSummarizeJob] Started — poll interval: 60s');
  // Run once immediately on startup, then on interval
  void run();
  setInterval(() => { void run(); }, POLL_INTERVAL_MS);
}
