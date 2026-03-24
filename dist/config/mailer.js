"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPasswordResetCode = exports.sendRegistrationCode = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const env_1 = require("./env");
const transporter = nodemailer_1.default.createTransport({
    service: 'gmail',
    auth: {
        user: env_1.env.gmailUser,
        pass: env_1.env.gmailAppPassword.replace(/\s/g, ''),
    },
});
const sendRegistrationCode = async (toEmail, code) => {
    await transporter.sendMail({
        from: `"Murshid Hospital - No Reply" <${env_1.env.gmailUser}>`,
        replyTo: 'no-reply@murshidhospital.com',
        to: toEmail,
        subject: 'Your Email Verification Code',
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
        <h2 style="color: #1a73e8;">Verify Your Email</h2>
        <p>Use the code below to complete your registration:</p>
        <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1a73e8; padding: 16px 0;">
          ${code}
        </div>
        <p>This code expires in <strong>15 minutes</strong>.</p>
        <p>If you did not request this, please ignore this email.</p>
        <hr style="margin-top: 24px;" />
        <p style="font-size: 12px; color: #888;">Murshid Hospital — Patient Portal</p>
      </div>
    `,
    });
};
exports.sendRegistrationCode = sendRegistrationCode;
const sendPasswordResetCode = async (toEmail, code, firstName) => {
    await transporter.sendMail({
        from: `"Murshid Hospital - No Reply" <${env_1.env.gmailUser}>`,
        replyTo: 'no-reply@murshidhospital.com',
        to: toEmail,
        subject: 'Your Password Reset Code',
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
        <h2 style="color: #1a73e8;">Password Reset Request</h2>
        <p>Hello <strong>${firstName}</strong>,</p>
        <p>We received a request to reset your password. Use the code below:</p>
        <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1a73e8; padding: 16px 0;">
          ${code}
        </div>
        <p>This code expires in <strong>15 minutes</strong>.</p>
        <p>If you did not request this, please ignore this email. Your password will remain unchanged.</p>
        <hr style="margin-top: 24px;" />
        <p style="font-size: 12px; color: #888;">Murshid Hospital — Patient Portal</p>
      </div>
    `,
    });
};
exports.sendPasswordResetCode = sendPasswordResetCode;
//# sourceMappingURL=mailer.js.map