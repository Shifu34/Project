"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateDepartment = exports.createDepartment = exports.getDepartmentById = exports.getDepartments = exports.getDepartmentLocations = void 0;
const database_1 = require("../config/database");
// GET /departments/locations  — distinct location values
const getDepartmentLocations = async (_req, res, next) => {
    try {
        const result = await (0, database_1.query)(`SELECT DISTINCT location FROM departments
       WHERE location IS NOT NULL AND location != ''
       ORDER BY location ASC`);
        res.json({ success: true, data: result.rows.map((r) => r.location) });
    }
    catch (err) {
        next(err);
    }
};
exports.getDepartmentLocations = getDepartmentLocations;
// GET /departments
const getDepartments = async (_req, res, next) => {
    try {
        const result = await (0, database_1.query)(`SELECT d.*, CONCAT(u.first_name,' ',u.last_name) AS head_doctor_name
      FROM departments d
       LEFT JOIN users u ON u.id = d.head_user_id
       ORDER BY d.name ASC`);
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        next(err);
    }
};
exports.getDepartments = getDepartments;
// GET /departments/:id
const getDepartmentById = async (req, res, next) => {
    try {
        const result = await (0, database_1.query)(`SELECT d.*, CONCAT(u.first_name,' ',u.last_name) AS head_doctor_name
      FROM departments d
       LEFT JOIN users u ON u.id = d.head_user_id
       WHERE d.id = $1`, [req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Department not found' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.getDepartmentById = getDepartmentById;
// POST /departments
const createDepartment = async (req, res, next) => {
    try {
        const { name, description, branch_id, head_user_id, phone, location } = req.body;
        const result = await (0, database_1.query)(`INSERT INTO departments (name, description, branch_id, head_user_id, phone, location)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [name, description, branch_id, head_user_id ?? null, phone, location]);
        res.status(201).json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.createDepartment = createDepartment;
// PUT /departments/:id
const updateDepartment = async (req, res, next) => {
    try {
        const { name, description, branch_id, head_user_id, phone, location, is_active } = req.body;
        const result = await (0, database_1.query)(`UPDATE departments
       SET name=$1, description=$2, branch_id=$3, head_user_id=$4, phone=$5, location=$6, is_active=$7
       WHERE id = $8 RETURNING *`, [name, description, branch_id, head_user_id ?? null, phone, location, is_active, req.params.id]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Department not found' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        next(err);
    }
};
exports.updateDepartment = updateDepartment;
//# sourceMappingURL=department.controller.js.map