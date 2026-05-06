import { Router } from 'express';
import authRoutes         from './auth.routes';
import patientRoutes      from './patient.routes';
import doctorRoutes       from './doctor.routes';
import departmentRoutes   from './department.routes';
import appointmentRoutes  from './appointment.routes';
import visitRoutes        from './visit.routes';
import prescriptionRoutes from './prescription.routes';
import labRoutes          from './lab.routes';
import wardRoutes         from './ward.routes';
import billingRoutes      from './billing.routes';
import pharmacyRoutes     from './pharmacy.routes';
import callRoutes         from './call.routes';
import livekitRoutes      from './livekit.routes';
import reportRoutes              from './report.routes';
import aiSummaryRoutes           from './ai-summary.routes';
import callTranscriptionRoutes   from './call-transcription.routes';
import organizationRoutes        from './organization.routes';
import { getDashboardStats } from '../controllers/dashboard.controller';
import { authenticate }   from '../middleware/auth.middleware';

const router = Router();

router.use('/auth',          authRoutes);
router.use('/patients',      patientRoutes);
router.use('/doctors',       doctorRoutes);
router.use('/departments',   departmentRoutes);
router.use('/appointments',  appointmentRoutes);
router.use('/encounters',    visitRoutes);   // renamed from /visits
router.use('/visits',        visitRoutes);   // backward-compat alias
router.use('/prescriptions', prescriptionRoutes);
router.use('/lab',           labRoutes);
router.use('/ward',          wardRoutes);
router.use('/billing',       billingRoutes);
router.use('/pharmacy',      pharmacyRoutes);
router.use('/calls',         callRoutes);
router.use('/livekit',       livekitRoutes);
router.use('/reports',              reportRoutes);
router.use('/ai-summaries',         aiSummaryRoutes);
router.use('/call-transcriptions',  callTranscriptionRoutes);
router.use('/organizations',        organizationRoutes);
router.get('/dashboard',     authenticate, getDashboardStats);

export default router;
