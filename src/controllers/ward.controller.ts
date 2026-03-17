import { Request, Response, NextFunction } from 'express';

// Ward management has been removed from this version of the schema.
// Inpatient tracking is handled via encounters with encounter_type = 'inpatient'.

export const getWards = (_req: Request, res: Response, _next: NextFunction): void => {
  res.status(410).json({ success: false, message: 'Ward management is not available in this version.' });
};

export const getWardById    = getWards;
export const createWard     = getWards;
export const addRoom        = getWards;
export const addBed         = getWards;
export const createAdmission = getWards;
export const getAdmissionById = getWards;
export const dischargePatient = getWards;
export const getAdmissions    = getWards;
