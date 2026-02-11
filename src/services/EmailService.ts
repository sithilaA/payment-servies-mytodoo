import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';

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
      logger.warn('No recipient email provided, skipping email.');
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
      logger.info(`Email with attachment sent to ${to}`);
    } catch (error) {
      logger.error('Failed to send email with attachment', { error: (error as any)?.message || error });
      // We don't throw here to avoid failing the transaction/process just because email failed
    }
  }

  async sendEmail(to: string | string[], subject: string, text: string) {
    const debug = process.env.EMAIL_DEBUG === 'true';

    if (!to || (Array.isArray(to) && to.length === 0)) {
      if (debug) logger.warn('EmailService: No recipients provided.');
      return;
    }

    if (debug) {
      logger.info('EMAIL_DEBUG: Attempting Send', {
        recipients: Array.isArray(to) ? to.join(',') : to,
        subject,
        smtpHost: `${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`,
        smtpUser: process.env.SMTP_USER
      });
    }

    try {
      const info = await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@payment-service.com',
        to,
        subject,
        text
      });

      // Minimal info (Always log success)
      logger.info('Alert email sent', {
        recipients: to,
        messageId: info.messageId
      });

      if (debug) {
        logger.info('EMAIL_DEBUG: Send Success', {
          response: info.response,
          messageId: info.messageId,
          envelope: info.envelope
        });
      }

    } catch (error: any) {
      // Minimal info (Always log error)
      logger.error('Failed to send alert email', { error: error.message });

      if (debug) {
        logger.error('EMAIL_DEBUG: Send Failure', {
          fullError: error,
          stack: error.stack
        });
      }
    }
  }

  async sendHtmlEmail(to: string | string[], subject: string, html: string, text?: string) {
    const debug = process.env.EMAIL_DEBUG === 'true';

    if (!to || (Array.isArray(to) && to.length === 0)) {
      if (debug) logger.warn('EmailService: No recipients provided.');
      return;
    }

    if (debug) {
      logger.info('EMAIL_DEBUG: Attempting HTML Send', {
        recipients: Array.isArray(to) ? to.join(',') : to,
        subject,
        smtpHost: `${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`,
        smtpUser: process.env.SMTP_USER
      });
    }

    try {
      const info = await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@payment-service.com',
        to,
        subject,
        text: text || subject,
        html
      });

      logger.info('HTML email sent', {
        recipients: to,
        messageId: info.messageId
      });

      if (debug) {
        logger.info('EMAIL_DEBUG: HTML Send Success', {
          response: info.response,
          messageId: info.messageId,
          envelope: info.envelope
        });
      }

    } catch (error: any) {
      logger.error('Failed to send HTML email', { error: error.message });

      if (debug) {
        logger.error('EMAIL_DEBUG: HTML Send Failure', {
          fullError: error,
          stack: error.stack
        });
      }
    }
  }
}

export const emailService = new EmailService();
