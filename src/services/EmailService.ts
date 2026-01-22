import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false, 
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendEmailWithAttachment(to: string, subject: string, text: string, attachment: { filename: string, content: Buffer }) {
    if (!to) {
      console.warn('No recipient email provided, skipping email.');
      return;
    }

    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@marketplace.com',
        to,
        subject,
        text,
        attachments: [
          {
            filename: attachment.filename,
            content: attachment.content
          }
        ]
      });
      console.log(`Email sent to ${to}`);
    } catch (error) {
      console.error('Failed to send email:', error);
      // We don't throw here to avoid failing the transaction/process just because email failed
    }
  }
}

export const emailService = new EmailService();
