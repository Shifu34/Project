"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listRooms = exports.getRoomDetail = exports.updateRoomStatus = exports.getAppointmentVideo = exports.generateToken = exports.getCallRoom = exports.createCallRoom = void 0;
const https_1 = __importDefault(require("https"));
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = require("../config/database");
const env_1 = require("../config/env");
// ── helper: make JSON request to 100ms API ─────────────────────
function hmsRequest(method, path, body) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : undefined;
        const req = https_1.default.request({
            hostname: 'api.100ms.live',
            path,
            method,
            headers: {
                Authorization: `Bearer ${env_1.env.hmsManagementToken}`,
                'Content-Type': 'application/json',
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
            },
        }, (res) => {
            let raw = '';
            res.on('data', (chunk) => (raw += chunk));
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(JSON.parse(raw));
                }
                else {
                    reject(new Error(`100ms API ${res.statusCode}: ${raw}`));
                }
            });
        });
        req.on('error', reject);
        if (data)
            req.write(data);
        req.end();
    });
}
// ── POST /calls/room  — create room + get codes ───────────────
const createCallRoom = async (req, res, next) => {
    try {
        const { appointment_id } = req.body;
        if (!appointment_id) {
            res.status(400).json({ success: false, message: 'appointment_id is required' });
            return;
        }
        // 1. Fetch appointment ------------------------------------------------
        const apptResult = await (0, database_1.query)(`SELECT a.id, a.patient_id, a.doctor_id, a.appointment_type, a.reason
       FROM appointments a
       WHERE a.id = $1`, [appointment_id]);
        if (apptResult.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Appointment not found' });
            return;
        }
        const appt = apptResult.rows[0];
        // 1b. If room already exists for this appointment, return it ----------
        const existing = await (0, database_1.query)(`SELECT * FROM video_call_rooms WHERE appointment_id = $1`, [appointment_id]);
        if (existing.rows.length > 0) {
            res.json({ success: true, data: existing.rows[0] });
            return;
        }
        // 2. Create 100ms room ------------------------------------------------
        const roomName = `${appt.id}-${appt.doctor_id}-${appt.patient_id}`;
        const description = `${appt.appointment_type || 'Consultation'}${appt.reason ? ' - ' + appt.reason : ''}`;
        const roomRes = await hmsRequest('POST', '/v2/rooms', {
            name: roomName,
            description,
            template_id: env_1.env.hmsTemplateId,
        });
        const roomId = roomRes.id;
        // 3. Generate room codes ----------------------------------------------
        const codesRes = await hmsRequest('POST', `/v2/room-codes/room/${roomId}`);
        let patientRoomCode = '';
        let doctorRoomCode = '';
        for (const entry of codesRes.data) {
            if (entry.role === 'patient')
                patientRoomCode = entry.code;
            if (entry.role === 'doctor')
                doctorRoomCode = entry.code;
        }
        // 4. Persist to DB ----------------------------------------------------
        const insertResult = await (0, database_1.query)(`INSERT INTO video_call_rooms
         (appointment_id, patient_id, doctor_id, room_id, patient_room_code, doctor_room_code)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`, [appointment_id, appt.patient_id, appt.doctor_id, roomId, patientRoomCode, doctorRoomCode]);
        res.status(201).json({ success: true, data: insertResult.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.createCallRoom = createCallRoom;
// ── GET /calls/room/:appointment_id  — fetch existing room ────
const getCallRoom = async (req, res, next) => {
    try {
        const { appointment_id } = req.params;
        const result = await (0, database_1.query)(`SELECT * FROM video_call_rooms WHERE appointment_id = $1`, [appointment_id]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, message: 'No call room found for this appointment' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.getCallRoom = getCallRoom;
// ── POST /calls/token  — generate 100ms auth token ────────────
const generateToken = async (req, res, next) => {
    try {
        const { room_id, user_id, role } = req.body;
        if (!room_id || !user_id || !role) {
            res.status(400).json({ success: false, message: 'room_id, user_id, and role are required' });
            return;
        }
        const now = Math.floor(Date.now() / 1000);
        const payload = {
            access_key: env_1.env.hmsAccessKey,
            room_id,
            user_id,
            role,
            type: 'app',
            version: 2,
            iat: now,
            nbf: now,
            exp: now + 86400, // 24 hours
            jti: crypto_1.default.randomUUID(),
        };
        const token = jsonwebtoken_1.default.sign(payload, env_1.env.hmsAppSecret, { algorithm: 'HS256' });
        res.json({ success: true, token });
    }
    catch (err) {
        next(err);
    }
};
exports.generateToken = generateToken;
// ── GET /appointments/:appointment_id/video  — video call detail ──
const getAppointmentVideo = async (req, res, next) => {
    try {
        const { appointment_id } = req.params;
        const result = await (0, database_1.query)(`SELECT id, appointment_id, room_id, doctor_room_code, patient_room_code
       FROM video_call_rooms WHERE appointment_id = $1`, [appointment_id]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, message: 'No video call found for this appointment' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.getAppointmentVideo = getAppointmentVideo;
// ── PATCH /calls/room/:appointment_id/status  — enable/disable room ──
const updateRoomStatus = async (req, res, next) => {
    try {
        const { appointment_id } = req.params;
        const { enabled } = req.body;
        if (typeof enabled !== 'boolean') {
            res.status(400).json({ success: false, message: 'enabled (boolean) is required' });
            return;
        }
        const roomResult = await (0, database_1.query)(`SELECT room_id FROM video_call_rooms WHERE appointment_id = $1`, [appointment_id]);
        if (roomResult.rows.length === 0) {
            res.status(404).json({ success: false, message: 'No call room found for this appointment' });
            return;
        }
        const roomId = roomResult.rows[0].room_id;
        const data = await hmsRequest('POST', `/v2/rooms/${roomId}`, { enabled });
        res.json({ success: true, data });
    }
    catch (err) {
        next(err);
    }
};
exports.updateRoomStatus = updateRoomStatus;
// ── GET /calls/room/:appointment_id/detail  — get 100ms room detail ──
const getRoomDetail = async (req, res, next) => {
    try {
        const { appointment_id } = req.params;
        const roomResult = await (0, database_1.query)(`SELECT room_id FROM video_call_rooms WHERE appointment_id = $1`, [appointment_id]);
        if (roomResult.rows.length === 0) {
            res.status(404).json({ success: false, message: 'No call room found for this appointment' });
            return;
        }
        const roomId = roomResult.rows[0].room_id;
        const data = await hmsRequest('GET', `/v2/rooms/${roomId}`);
        res.json({ success: true, data });
    }
    catch (err) {
        next(err);
    }
};
exports.getRoomDetail = getRoomDetail;
// ── GET /calls/rooms  — list all 100ms rooms ─────────────────
const listRooms = async (_req, res, next) => {
    try {
        const data = await hmsRequest('GET', '/v2/rooms');
        res.json({ success: true, data });
    }
    catch (err) {
        next(err);
    }
};
exports.listRooms = listRooms;
//# sourceMappingURL=call.controller.js.map