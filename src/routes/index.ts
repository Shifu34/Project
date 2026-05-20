import { Router } from 'express';
import { body } from 'express-validator';
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
import notificationRoutes        from './notification.routes';
import * as apptCtrl from '../controllers/appointment.controller';
import * as callCtrl from '../controllers/call.controller';
import * as notifCtrl from '../controllers/notification.controller';
import * as billingCtrl from '../controllers/billing.controller';
import { getDashboardStats } from '../controllers/dashboard.controller';
import {
	addDoctorSchedule,
	deleteDoctorSchedule,
	getDoctorAvailableSlots,
	getDoctorBookedAppointments,
	getDoctorProfile,
	getDoctorScheduleByDate,
	updateDoctorSchedule,
	upsertDoctorProfileByDoctor,
} from '../controllers/doctor.controller';
import { authenticate, authorize }   from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

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
router.use('/notifications',        notificationRoutes);
router.post('/add-fcm-token',
	authenticate,
	body('token').notEmpty().withMessage('token is required'),
	body('platform').optional().isIn(['android', 'ios', 'web']).withMessage("platform must be 'android', 'ios', or 'web'"),
	validate,
	notifCtrl.registerFcmToken,
);
router.get('/fcm-tokens', authenticate, notifCtrl.getFcmTokens);
router.delete('/deactivate-fcm-token',
	authenticate,
	body('token').optional().isString(),
	body('device_id').optional().isString(),
	validate,
	notifCtrl.deactivateFcmToken,
);
router.get('/get-notifications', authenticate, notifCtrl.getNotifications);
router.patch('/update-notification',
	authenticate,
	body('type').optional().isIn(['appointment','lab_result','prescription','billing','system','alert']),
	body('is_read').optional().isBoolean(),
	validate,
	notifCtrl.updateNotification,
);
router.get('/my-payments', authenticate, billingCtrl.getMyPayments);
router.post('/add-payment',
	authenticate,
	authorize('patient'),
	body('amount').isFloat({ min: 0.01 }),
	body('payment_method').optional().isIn(['cash','credit_card','debit_card','insurance','bank_transfer','cheque','online']),
	body('payment_status').optional().isIn(['completed','pending','failed','refunded']),
	body('paid_at').optional().isISO8601(),
	body('patient_user_id').optional().isInt(),
	validate,
	billingCtrl.recordPayment,
);
router.post('/create-call-room',
	authenticate,
	authorize('admin', 'doctor', 'patient'),
	body('appointment_id').isInt(),
	validate,
	callCtrl.createCallRoom,
);
router.get('/call-room', authenticate, callCtrl.getCallRoom);
router.get('/call-room-detail', authenticate, callCtrl.getRoomDetail);
router.post('/call-token',
	authenticate,
	body('room_id').isString().notEmpty(),
	body('user_id').isString().notEmpty(),
	body('role').isIn(['doctor', 'patient']),
	validate,
	callCtrl.generateToken,
);
router.get('/call-rooms', authenticate, authorize('admin'), callCtrl.listRooms);
router.get('/my-appointments', authenticate, apptCtrl.getMyAppointments);
router.get('/upcoming-appointment', authenticate, apptCtrl.getUpcomingAppointment);
router.post('/create-appointment',
	authenticate,
	authorize('admin', 'doctor', 'patient'),
	body('appointment_date').isISO8601(),
	body('appointment_time').matches(/^\d{2}:\d{2}$/),
	body('patient_user_id').optional().isInt(),
	body('patient_id').optional().isInt(),
	body('doctor_user_id').optional().isInt(),
	body('doctor_id').optional().isInt(),
	body('doctor_branch_id').optional().isInt(),
	validate,
	apptCtrl.createAppointment,
);
router.patch('/cancel-appointment',
	authenticate,
	authorize('admin', 'doctor', 'patient'),
	apptCtrl.cancelAppointment,
);
router.patch('/update-appointment',
	authenticate,
	authorize('admin', 'doctor', 'patient'),
	apptCtrl.patchAppointment,
);
router.get('/doctor-profile', authenticate, getDoctorProfile);
router.post('/update-doctor-profile', authenticate, authorize('admin', 'doctor'), upsertDoctorProfileByDoctor);
router.get('/doctor-schedule', authenticate, getDoctorScheduleByDate);
router.get('/doctor-available-slots', authenticate, getDoctorAvailableSlots);
router.get('/doctor-booked-appointments', authenticate, getDoctorBookedAppointments);
router.post('/add-doctor-schedule', authenticate, authorize('admin', 'doctor'), addDoctorSchedule);
router.patch('/update-doctor-schedule', authenticate, authorize('admin', 'doctor'), updateDoctorSchedule);
router.delete('/delete-doctor-schedule', authenticate, authorize('admin', 'doctor'), deleteDoctorSchedule);
router.get('/dashboard',     authenticate, getDashboardStats);

export default router;
