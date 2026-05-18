# Doctor Branch + Composite Key Changes

## Database and schema
- Added branches with per-organization sequencing and branch_code.
- Doctors now use composite PK (employee_id, branch_id), with account_status and branch_id required.
- Added doctor_branch_id columns to doctor-linked tables (appointments, encounters, diagnoses, prescriptions, lab_orders, radiology_orders, doctor_schedules, video_call_rooms, medical_reports, call_ai_notes, ai_summaries).
- Backfilled doctor_branch_id from doctors, dropped old single-column doctor_id FKs and the unique index on doctors.employee_id, and added composite FKs.
- Added departments.head_doctor_branch_id with a composite FK to doctors for branch-level head assignment.
- Dropped fk_head_doctor; department head joins now scope by organization_id.

## Controllers and queries updated
- Doctor joins now include branch_id across appointments, encounters, prescriptions, lab orders, reports, call notes, AI summaries, dashboard, and call transcription views.
- Call room creation now stores doctor_branch_id in video_call_rooms.
- Doctor endpoints now use composite key lookups and schedule queries keyed by (doctor_id, doctor_branch_id).
- Department head joins now also consider head_doctor_branch_id when provided.

## API changes (requests)
- doctor_id now requires doctor_branch_id for composite-keyed tables.
- Added validation for doctor_branch_id:
  - POST /appointments
  - POST /encounters
  - POST /encounters/:id/diagnoses
  - POST /lab/orders
  - POST /prescriptions
- Doctor endpoints now require branch_id (query or body as noted):
  - GET /doctors/:id
  - GET /doctors/:id/profile
  - GET /doctors/:id/schedule
  - GET /doctors/:id/available-slots
  - GET /doctors/:id/appointments
  - GET /doctors/:id/booked-appointments
  - GET /doctors/:id/specialization
  - PUT /doctors/:id
  - POST /doctors/:id/profile
  - POST /doctors/:id/schedule
- Call notes and AI summaries: if doctor_id is provided, doctor_branch_id must be provided together.
- Departments create/update can accept head_doctor_branch_id (optional).

## API changes (responses)
- Appointment, encounter, diagnosis, prescription, lab order, and radiology order responses now include doctor_branch_id from the underlying rows.
- Doctor list/search endpoints now include branch_id.
- Doctor schedule and availability responses include doctor_branch_id where applicable.

## Types updated
- Added doctor_branch_id to: DoctorSchedule, Appointment, Encounter, Diagnosis, Prescription, LabOrder, RadiologyOrder.
- Added head_doctor_branch_id to Department.

## Files touched
- database/migrations/014_branches_and_doctor_employee_id.sql
- database/migrations/015_doctors_composite_pk.sql
- database/migrations/016_doctor_branch_composite_fk.sql
- database/migrations/017_departments_head_doctor_branch_id.sql
- database/schema.sql
- src/controllers/ai-summary.controller.ts
- src/controllers/appointment.controller.ts
- src/controllers/billing.controller.ts
- src/controllers/call-notes.controller.ts
- src/controllers/call-transcription.controller.ts
- src/controllers/call.controller.ts
- src/controllers/dashboard.controller.ts
- src/controllers/department.controller.ts
- src/controllers/doctor.controller.ts
- src/controllers/lab.controller.ts
- src/controllers/patient.controller.ts
- src/controllers/prescription.controller.ts
- src/controllers/report.controller.ts
- src/controllers/visit.controller.ts
- src/jobs/reportSummarize.ts
- src/routes/appointment.routes.ts
- src/routes/department.routes.ts
- src/routes/lab.routes.ts
- src/routes/prescription.routes.ts
- src/routes/visit.routes.ts
- src/types/index.ts
