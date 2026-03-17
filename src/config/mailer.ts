import nodemailer from 'nodemailer';
import { env } from './env';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: env.gmailUser,
    pass: env.gmailAppPassword.replace(/\s/g, ''),
  },
});

export const sendRegistrationCode = async (toEmail: string, code: string): Promise<void> => {
  await transporter.sendMail({
    from: `"Murshid Hospital - No Reply" <${env.gmailUser}>`,
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

export const sendPasswordResetCode = async (toEmail: string, code: string, firstName: string): Promise<void> => {
  await transporter.sendMail({
    from: `"Murshid Hospital - No Reply" <${env.gmailUser}>`,
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
