export interface AuthPayload {
    userId: number;
    roleId: number;
    roleName: string;
    email: string;
    organizationId?: number;
}
export interface PaginationQuery {
    page?: string;
    limit?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
}
export interface PaginatedResult<T> {
    data: T[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}
export interface ApiResponse<T = unknown> {
    success: boolean;
    message?: string;
    data?: T;
    errors?: unknown[];
}
export interface Organization {
    id: number;
    name: string;
    slug: string;
    address?: string;
    phone?: string;
    email?: string;
    logo_url?: string;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}
export interface Role {
    id: number;
    name: 'admin' | 'doctor' | 'patient';
    description?: string;
    created_at: Date;
}
export interface User {
    id: number;
    role_id: number;
    first_name: string;
    last_name: string;
    email: string;
    password_hash: string;
    phone?: string;
    cnic?: string;
    is_active: boolean;
    last_login?: Date;
    created_at: Date;
    updated_at: Date;
}
export interface UserProfile {
    id: number;
    user_id: number;
    date_of_birth?: Date;
    gender?: 'male' | 'female' | 'other';
    cnic?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    profile_image_url?: string;
    bio?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    created_at: Date;
    updated_at: Date;
}
export interface Patient {
    id: number;
    organization_id?: number;
    user_id?: number;
    patient_code: string;
    first_name: string;
    last_name: string;
    date_of_birth: Date;
    gender: 'male' | 'female' | 'other';
    phone: string;
    email?: string;
    address?: string;
    blood_group?: string;
    marital_status?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    notes?: string;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}
export interface InsuranceProvider {
    id: number;
    name: string;
    code?: string;
    contact_phone?: string;
    contact_email?: string;
    address?: string;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}
export interface UserInsurance {
    id: number;
    patient_id: number;
    insurance_provider_id: number;
    policy_number: string;
    group_number?: string;
    coverage_type?: string;
    start_date?: Date;
    end_date?: Date;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}
export interface Department {
    id: number;
    organization_id?: number;
    name: string;
    description?: string;
    head_doctor_id?: number;
    phone?: string;
    location?: string;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}
export interface Doctor {
    id: number;
    user_id: number;
    department_id?: number;
    specialization?: string;
    license_number?: string;
    qualification?: string;
    experience_years?: number;
    consultation_fee?: number;
    bio?: string;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}
export interface DoctorSchedule {
    id: number;
    doctor_id: number;
    day_of_week: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
    start_time: string;
    end_time: string;
    max_appointments: number;
    is_available: boolean;
    created_at: Date;
    updated_at: Date;
}
export interface Appointment {
    id: number;
    patient_id: number;
    doctor_id: number;
    department_id?: number;
    appointment_date: Date;
    appointment_time: string;
    duration_minutes: number;
    appointment_type?: 'consultation' | 'follow_up' | 'emergency' | 'procedure' | 'checkup';
    status: 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
    reason?: string;
    notes?: string;
    booked_by?: number;
    cancelled_by?: number;
    cancellation_reason?: string;
    created_at: Date;
    updated_at: Date;
}
export interface Payment {
    id: number;
    appointment_id?: number;
    patient_id: number;
    amount: number;
    payment_method?: string;
    transaction_reference?: string;
    payment_status: 'completed' | 'pending' | 'failed' | 'refunded';
    paid_at: Date;
    notes?: string;
    received_by?: number;
    created_at: Date;
    updated_at: Date;
}
export interface PaymentRefund {
    id: number;
    payment_id: number;
    amount: number;
    reason?: string;
    status: 'pending' | 'approved' | 'rejected' | 'completed';
    refunded_by?: number;
    refunded_at?: Date;
    created_at: Date;
    updated_at: Date;
}
export interface Encounter {
    id: number;
    appointment_id?: number;
    patient_id: number;
    doctor_id: number;
    encounter_date: Date;
    encounter_type?: 'outpatient' | 'inpatient' | 'emergency' | 'telemedicine';
    chief_complaint?: string;
    history_of_present_illness?: string;
    physical_examination?: string;
    assessment?: string;
    plan?: string;
    follow_up_date?: Date;
    status: 'in_progress' | 'completed' | 'transferred';
    created_at: Date;
    updated_at: Date;
}
export interface Diagnosis {
    id: number;
    encounter_id: number;
    patient_id: number;
    doctor_id: number;
    icd_code?: string;
    diagnosis_text: string;
    diagnosis_type?: 'primary' | 'secondary' | 'differential';
    status: 'active' | 'resolved' | 'chronic' | 'remission';
    diagnosed_date: Date;
    notes?: string;
    created_at: Date;
}
export interface ClinicalNote {
    id: number;
    encounter_id: number;
    doctor_id: number;
    note_type?: 'progress' | 'admission' | 'discharge' | 'procedure' | 'consultation' | 'general';
    content: string;
    is_signed: boolean;
    created_at: Date;
    updated_at: Date;
}
export interface Vitals {
    id: number;
    encounter_id: number;
    patient_id: number;
    recorded_by?: number;
    temperature?: number;
    blood_pressure_systolic?: number;
    blood_pressure_diastolic?: number;
    heart_rate?: number;
    respiratory_rate?: number;
    oxygen_saturation?: number;
    weight?: number;
    height?: number;
    bmi?: number;
    blood_glucose?: number;
    pain_scale?: number;
    notes?: string;
    recorded_at: Date;
}
export interface Prescription {
    id: number;
    encounter_id: number;
    patient_id: number;
    doctor_id: number;
    prescription_date: Date;
    valid_until?: Date;
    status: 'active' | 'dispensed' | 'partially_dispensed' | 'expired' | 'cancelled';
    notes?: string;
    created_at: Date;
    updated_at: Date;
}
export interface InventoryItem {
    id: number;
    organization_id?: number;
    name: string;
    generic_name?: string;
    category?: string;
    dosage_form?: string;
    strength?: string;
    unit?: string;
    description?: string;
    reorder_level: number;
    quantity_available: number;
    is_controlled: boolean;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}
export interface PrescriptionItem {
    id: number;
    prescription_id: number;
    inventory_item_id?: number;
    medication_name: string;
    dosage: string;
    frequency: string;
    duration?: string;
    quantity: number;
    route?: string;
    instructions?: string;
    is_dispensed: boolean;
    created_at: Date;
}
export interface InventoryTransaction {
    id: number;
    inventory_item_id: number;
    transaction_type: 'stock_in' | 'stock_out' | 'adjustment' | 'dispense' | 'return' | 'expired';
    quantity: number;
    unit_price?: number;
    reference_id?: number;
    reference_type?: string;
    notes?: string;
    performed_by?: number;
    transaction_date: Date;
    created_at: Date;
}
export interface LabTestCatalog {
    id: number;
    name: string;
    code?: string;
    category?: string;
    description?: string;
    normal_range?: string;
    unit?: string;
    price?: number;
    turnaround_hours?: number;
    is_active: boolean;
    created_at: Date;
}
export interface LabOrder {
    id: number;
    encounter_id: number;
    patient_id: number;
    doctor_id: number;
    ordered_by: number;
    order_date: Date;
    priority: 'routine' | 'urgent' | 'stat';
    status: 'ordered' | 'sample_collected' | 'processing' | 'completed' | 'cancelled';
    clinical_notes?: string;
    created_at: Date;
    updated_at: Date;
}
export interface LabOrderItem {
    id: number;
    lab_order_id: number;
    lab_test_id: number;
    status: 'pending' | 'processing' | 'completed' | 'cancelled';
    result_value?: string;
    unit?: string;
    normal_range?: string;
    interpretation?: 'normal' | 'low' | 'high' | 'critical_low' | 'critical_high';
    result_notes?: string;
    result_date?: Date;
    performed_by?: number;
    verified_by?: number;
    verified_at?: Date;
    created_at: Date;
}
export interface RadiologyTestCatalog {
    id: number;
    name: string;
    code?: string;
    modality?: string;
    description?: string;
    price?: number;
    turnaround_hours?: number;
    is_active: boolean;
    created_at: Date;
}
export interface RadiologyOrder {
    id: number;
    encounter_id: number;
    patient_id: number;
    doctor_id: number;
    ordered_by: number;
    order_date: Date;
    priority: 'routine' | 'urgent' | 'stat';
    status: 'ordered' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
    clinical_notes?: string;
    created_at: Date;
    updated_at: Date;
}
export interface RadiologyOrderItem {
    id: number;
    radiology_order_id: number;
    radiology_test_id: number;
    status: 'ordered' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
    findings?: string;
    impression?: string;
    recommendation?: string;
    image_url?: string;
    report_date?: Date;
    performed_by?: number;
    verified_by?: number;
    verified_at?: Date;
    created_at: Date;
}
export interface SubscriptionPlan {
    id: number;
    name: string;
    description?: string;
    price: number;
    billing_cycle?: 'monthly' | 'yearly' | 'lifetime';
    features?: Record<string, unknown>;
    max_users?: number;
    max_patients?: number;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}
export interface UserSubscription {
    id: number;
    organization_id: number;
    plan_id: number;
    start_date: Date;
    end_date?: Date;
    status: 'active' | 'expired' | 'cancelled' | 'trial';
    payment_reference?: string;
    created_at: Date;
    updated_at: Date;
}
export interface AiSession {
    id: number;
    user_id?: number;
    patient_id?: number;
    session_type?: 'diagnosis_assist' | 'note_generation' | 'drug_info' | 'general';
    started_at: Date;
    ended_at?: Date;
    status: 'active' | 'completed' | 'abandoned';
    created_at: Date;
}
export interface AiOutput {
    id: number;
    session_id: number;
    output_type?: string;
    content: string;
    model_used?: string;
    tokens_used?: number;
    created_at: Date;
}
export interface AiTranscript {
    id: number;
    session_id: number;
    role: 'user' | 'assistant' | 'system';
    message: string;
    created_at: Date;
}
export interface Notification {
    id: number;
    user_id: number;
    title: string;
    message: string;
    type?: 'appointment' | 'lab_result' | 'prescription' | 'billing' | 'system' | 'alert';
    is_read: boolean;
    read_at?: Date;
    created_at: Date;
}
export interface AuditLog {
    id: number;
    user_id?: number;
    action: string;
    table_name?: string;
    record_id?: number;
    old_values?: Record<string, unknown>;
    new_values?: Record<string, unknown>;
    ip_address?: string;
    user_agent?: string;
    created_at: Date;
}
//# sourceMappingURL=index.d.ts.map