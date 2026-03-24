"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyRegistrationOtp = exports.sendRegistrationOtp = exports.resetPassword = exports.verifyResetCode = exports.resendResetCode = exports.forgotPassword = exports.getMe = exports.changePassword = exports.refreshToken = exports.login = exports.registerPatient = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = require("../config/database");
const env_1 = require("../config/env");
const mailer_1 = require("../config/mailer");
// POST /auth/register — patient self-registration
const registerPatient = async (req, res, next) => {
    try {
        const { first_name, last_name, date_of_birth, cnic, phone, email, password, gender } = req.body;
        // Check for duplicate email or CNIC before doing anything
        const dup = await (0, database_1.query)(`SELECT id FROM users WHERE email = $1 OR (cnic = $2 AND cnic IS NOT NULL)`, [email, cnic ?? null]);
        if (dup.rows.length > 0) {
            res.status(409).json({ success: false, message: 'Email or CNIC is already registered' });
            return;
        }
        const hash = await bcryptjs_1.default.hash(password, 12);
        const client = await (0, database_1.getClient)();
        try {
            await client.query('BEGIN');
            const roleRes = await client.query(`SELECT id, permissions FROM roles WHERE name = 'patient' LIMIT 1`);
            const patientRole = roleRes.rows[0];
            // Create login account in users table
            const userRes = await client.query(`INSERT INTO users (role_id, first_name, last_name, email, password_hash, phone, cnic, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true)
         RETURNING id, email, first_name, last_name, phone, cnic`, [patientRole.id, first_name, last_name, email, hash, phone, cnic ?? null]);
            const newUser = userRes.rows[0];
            // Link or create patient record
            let patientCode = null;
            if (cnic) {
                // Check if a migrated patient record already exists with this CNIC
                const existing = await client.query(`SELECT id FROM patients WHERE cnic = $1 LIMIT 1`, [cnic]);
                if (existing.rows.length > 0) {
                    // Link the migrated record to this new user account
                    const updated = await client.query(`UPDATE patients SET user_id = $1, email = $2, phone = $3, updated_at = CURRENT_TIMESTAMP
             WHERE cnic = $4 RETURNING patient_code`, [newUser.id, email, phone, cnic]);
                    patientCode = updated.rows[0]?.patient_code ?? null;
                }
            }
            if (!patientCode) {
                // No migrated record found — create a fresh patient row
                const ins = await client.query(`INSERT INTO patients (user_id, first_name, last_name, email, phone, gender, date_of_birth, cnic)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING patient_code`, [newUser.id, first_name, last_name, email, phone, gender ?? null, date_of_birth, cnic ?? null]);
                patientCode = ins.rows[0]?.patient_code ?? null;
            }
            await client.query('COMMIT');
            res.status(201).json({ success: true, message: 'Registration successful' });
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    catch (err) {
        next(err);
    }
};
exports.registerPatient = registerPatient;
const login = async (req, res, next) => {
    try {
        const { identifier, password } = req.body;
        const isEmail = identifier.includes('@');
        const result = await (0, database_1.query)(`SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name,
              u.phone, u.cnic, u.is_active,
              r.id AS role_id, r.name AS role_name, r.permissions
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE ${isEmail ? 'u.email = $1' : 'u.cnic = $1'}`, [identifier]);
        if (result.rows.length === 0) {
            res.status(401).json({ success: false, message: 'Invalid credentials' });
            return;
        }
        const user = result.rows[0];
        if (!user.is_active) {
            res.status(403).json({ success: false, message: 'Account is deactivated' });
            return;
        }
        const isMatch = await bcryptjs_1.default.compare(password, user.password_hash);
        if (!isMatch) {
            res.status(401).json({ success: false, message: 'Invalid credentials' });
            return;
        }
        // Update last_login
        await (0, database_1.query)('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
        // Patient CNIC sync — link migrated records or create patient row if missing
        let patientData = {};
        if (user.role_name === 'patient') {
            if (user.cnic) {
                const patientRes = await (0, database_1.query)(`SELECT id, gender, date_of_birth FROM patients WHERE cnic = $1 LIMIT 1`, [user.cnic]);
                if (patientRes.rows.length > 0) {
                    patientData = patientRes.rows[0];
                    // Ensure migrated patient is linked to this user account
                    await (0, database_1.query)(`UPDATE patients SET user_id = $1, email = $2, phone = $3, updated_at = CURRENT_TIMESTAMP
             WHERE cnic = $4 AND (user_id IS NULL OR user_id = $1)`, [user.id, user.email, user.phone, user.cnic]);
                }
            }
            else {
                const patientRes = await (0, database_1.query)(`SELECT gender, date_of_birth FROM patients WHERE user_id = $1 LIMIT 1`, [user.id]);
                if (patientRes.rows.length > 0)
                    patientData = patientRes.rows[0];
            }
        }
        // Fetch doctor_id if the user is a doctor
        let doctorId = null;
        if (user.role_name === 'doctor') {
            const doctorRes = await (0, database_1.query)(`SELECT id FROM doctors WHERE user_id = $1 LIMIT 1`, [user.id]);
            if (doctorRes.rows.length > 0)
                doctorId = doctorRes.rows[0].id;
        }
        const payload = { userId: user.id, roleId: user.role_id, roleName: user.role_name, email: user.email };
        const token = jsonwebtoken_1.default.sign(payload, env_1.env.jwtSecret, { expiresIn: env_1.env.jwtExpiresIn });
        const refreshToken = jsonwebtoken_1.default.sign(payload, env_1.env.jwtRefreshSecret, { expiresIn: env_1.env.jwtRefreshExpiresIn });
        res.json({
            success: true,
            data: {
                token,
                refreshToken,
                user: {
                    id: user.id,
                    role: user.role_name,
                    permissions: user.permissions ? JSON.parse(user.permissions) : null,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    email: user.email,
                    phone: user.phone,
                    cnic: user.cnic,
                    gender: patientData.gender ?? null,
                    date_of_birth: patientData.date_of_birth ?? null,
                    ...(doctorId !== null && { doctor_id: doctorId }),
                },
            },
        });
    }
    catch (err) {
        next(err);
    }
};
exports.login = login;
const refreshToken = async (req, res, next) => {
    try {
        const { refreshToken: token } = req.body;
        if (!token) {
            res.status(400).json({ success: false, message: 'Refresh token required' });
            return;
        }
        const decoded = jsonwebtoken_1.default.verify(token, env_1.env.jwtRefreshSecret);
        const newToken = jsonwebtoken_1.default.sign({ userId: decoded.userId, roleId: decoded.roleId, roleName: decoded.roleName, email: decoded.email }, env_1.env.jwtSecret, { expiresIn: env_1.env.jwtExpiresIn });
        res.json({ success: true, data: { token: newToken } });
    }
    catch {
        res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
    }
};
exports.refreshToken = refreshToken;
const changePassword = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const { currentPassword, newPassword } = req.body;
        const result = await (0, database_1.query)('SELECT password_hash FROM users WHERE id = $1', [userId]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, message: 'User not found' });
            return;
        }
        const isMatch = await bcryptjs_1.default.compare(currentPassword, result.rows[0].password_hash);
        if (!isMatch) {
            res.status(400).json({ success: false, message: 'Current password is incorrect' });
            return;
        }
        const hash = await bcryptjs_1.default.hash(newPassword, 12);
        await (0, database_1.query)('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
        res.json({ success: true, message: 'Password changed successfully' });
    }
    catch (err) {
        next(err);
    }
};
exports.changePassword = changePassword;
const getMe = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const result = await (0, database_1.query)(`SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.cnic,
              u.gender, u.date_of_birth, u.last_login, u.created_at,
              r.name AS role, r.permissions
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1`, [userId]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, message: 'User not found' });
            return;
        }
        const row = result.rows[0];
        res.json({
            success: true,
            data: {
                ...row,
                permissions: row.permissions ? JSON.parse(row.permissions) : null,
            },
        });
    }
    catch (err) {
        next(err);
    }
};
exports.getMe = getMe;
// POST /auth/forgot-password
const forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;
        const result = await (0, database_1.query)(`SELECT id, first_name FROM users WHERE email = $1 AND is_active = true LIMIT 1`, [email]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, message: 'No account found with that email address.' });
            return;
        }
        const user = result.rows[0];
        const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        // Delete any existing tokens for this user, then insert new one
        await (0, database_1.query)(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [user.id]);
        await (0, database_1.query)(`INSERT INTO password_reset_tokens (user_id, code, expires_at) VALUES ($1, $2, $3)`, [user.id, code, expiresAt]);
        await (0, mailer_1.sendPasswordResetCode)(email, code, user.first_name);
        res.json({ success: true, message: 'A reset code has been sent to your email.' });
    }
    catch (err) {
        next(err);
    }
};
exports.forgotPassword = forgotPassword;
// POST /auth/resend-reset-code
const resendResetCode = async (req, res, next) => {
    try {
        const { email } = req.body;
        const result = await (0, database_1.query)(`SELECT id, first_name FROM users WHERE email = $1 AND is_active = true LIMIT 1`, [email]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, message: 'No account found with that email address.' });
            return;
        }
        const user = result.rows[0];
        // Rate-limit: block resend if a code was issued less than 60 seconds ago
        const recent = await (0, database_1.query)(`SELECT created_at FROM password_reset_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [user.id]);
        if (recent.rows.length > 0) {
            const secondsSinceLast = (Date.now() - new Date(recent.rows[0].created_at).getTime()) / 1000;
            if (secondsSinceLast < 60) {
                const waitSeconds = Math.ceil(60 - secondsSinceLast);
                res.status(429).json({ success: false, message: `Please wait ${waitSeconds} seconds before requesting a new code.` });
                return;
            }
        }
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        await (0, database_1.query)(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [user.id]);
        await (0, database_1.query)(`INSERT INTO password_reset_tokens (user_id, code, expires_at) VALUES ($1, $2, $3)`, [user.id, code, expiresAt]);
        await (0, mailer_1.sendPasswordResetCode)(email, code, user.first_name);
        res.json({ success: true, message: 'A new reset code has been sent to your email.' });
    }
    catch (err) {
        next(err);
    }
};
exports.resendResetCode = resendResetCode;
// POST /auth/verify-reset-code
const verifyResetCode = async (req, res, next) => {
    try {
        const { email, code } = req.body;
        const result = await (0, database_1.query)(`SELECT prt.id
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE u.email = $1
         AND prt.code = $2
         AND prt.expires_at > CURRENT_TIMESTAMP
       LIMIT 1`, [email, code]);
        if (result.rows.length === 0) {
            res.status(400).json({ success: false, message: 'Invalid or expired code.' });
            return;
        }
        res.json({ success: true, message: 'Code is valid.' });
    }
    catch (err) {
        next(err);
    }
};
exports.verifyResetCode = verifyResetCode;
// POST /auth/reset-password
const resetPassword = async (req, res, next) => {
    try {
        const { email, code, new_password } = req.body;
        const result = await (0, database_1.query)(`SELECT prt.id, u.id AS user_id
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE u.email = $1
         AND prt.code = $2
         AND prt.expires_at > CURRENT_TIMESTAMP
       LIMIT 1`, [email, code]);
        if (result.rows.length === 0) {
            res.status(400).json({ success: false, message: 'Invalid or expired code.' });
            return;
        }
        const { user_id, id: tokenId } = result.rows[0];
        const hash = await bcryptjs_1.default.hash(new_password, 12);
        await (0, database_1.query)(`UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [hash, user_id]);
        await (0, database_1.query)(`DELETE FROM password_reset_tokens WHERE id = $1`, [tokenId]);
        res.json({ success: true, message: 'Password has been reset successfully.' });
    }
    catch (err) {
        next(err);
    }
};
exports.resetPassword = resetPassword;
// POST /auth/send-registration-code
// Sends a 6-digit OTP to the given email (no account needed yet).
// Rate-limited to one send per 60 seconds per email.
const sendRegistrationOtp = async (req, res, next) => {
    try {
        const { email } = req.body;
        // Block if already registered
        const existing = await (0, database_1.query)(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [email]);
        if (existing.rows.length > 0) {
            res.status(409).json({ success: false, message: 'This email is already registered.' });
            return;
        }
        // Rate-limit: one code per 60 seconds per email
        const recent = await (0, database_1.query)(`SELECT created_at FROM email_verification_tokens WHERE email = $1 ORDER BY created_at DESC LIMIT 1`, [email]);
        if (recent.rows.length > 0) {
            const secondsSinceLast = (Date.now() - new Date(recent.rows[0].created_at).getTime()) / 1000;
            if (secondsSinceLast < 60) {
                const waitSeconds = Math.ceil(60 - secondsSinceLast);
                res.status(429).json({ success: false, message: `Please wait ${waitSeconds} seconds before requesting a new code.` });
                return;
            }
        }
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        await (0, database_1.query)(`DELETE FROM email_verification_tokens WHERE email = $1`, [email]);
        await (0, database_1.query)(`INSERT INTO email_verification_tokens (email, code, expires_at) VALUES ($1, $2, $3)`, [email, code, expiresAt]);
        await (0, mailer_1.sendRegistrationCode)(email, code);
        res.json({ success: true, message: 'Verification code sent to your email.' });
    }
    catch (err) {
        next(err);
    }
};
exports.sendRegistrationOtp = sendRegistrationOtp;
// POST /auth/verify-registration-code
const verifyRegistrationOtp = async (req, res, next) => {
    try {
        const { email, code } = req.body;
        const result = await (0, database_1.query)(`SELECT id FROM email_verification_tokens
       WHERE email = $1 AND code = $2 AND expires_at > CURRENT_TIMESTAMP
       LIMIT 1`, [email, code]);
        if (result.rows.length === 0) {
            res.status(400).json({ success: false, message: 'Invalid or expired code.' });
            return;
        }
        res.json({ success: true, message: 'Email verified successfully.' });
    }
    catch (err) {
        next(err);
    }
};
exports.verifyRegistrationOtp = verifyRegistrationOtp;
//# sourceMappingURL=auth.controller.js.map