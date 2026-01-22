import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

export enum ViolationType {
  PAYOUT_EXCEEDS_BALANCE = 'PAYOUT_EXCEEDS_BALANCE',
  NEGATIVE_BALANCE_ATTEMPT = 'NEGATIVE_BALANCE_ATTEMPT',
  PAYMENT_BELOW_PRICE = 'PAYMENT_BELOW_PRICE',
  BYPASSED_VALIDATION = 'BYPASSED_VALIDATION',
  STRIPE_FAILURE = 'STRIPE_FAILURE',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS'
}

interface AlertDetails {
  externalUserId?: string;
  walletId?: string;
  amount?: number;
  availableBalance?: number;
  endpoint?: string;
  error?: string;
}

class ViolationAlertService {
  private transporter: nodemailer.Transporter;
  private alertEmails: string[];

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    try {
      this.alertEmails = JSON.parse(process.env.ALERT_EMAILS || '[]');
    } catch (e) {
      console.error('Failed to parse ALERT_EMAILS', e);
      this.alertEmails = [];
    }
  }

  public async sendAlert(type: ViolationType, details: AlertDetails) {
    if (this.alertEmails.length === 0) {
      console.warn('No alert emails configured, skipping alert:', type);
      return;
    }

    const subject = `[URGENT] Financial Violation Alert: ${type}`;
    const text = `
      VIOLATION DETECTED: ${type}
      ----------------------------------------
      Timestamp: ${new Date().toISOString()}
      User: ${details.externalUserId || 'N/A'}
      Wallet: ${details.walletId || 'N/A'}
      Attempted Amount: ${details.amount || 'N/A'}
      Available Balance: ${details.availableBalance || 'N/A'}
      Endpoint: ${details.endpoint || 'N/A'}
      Error Details: ${details.error || 'N/A'}
      
      Please investigate immediately.
    `;

    // Fire and forget - non-blocking
    this.transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: this.alertEmails,
      subject,
      text,
    }).catch(err => {
      console.error('Failed to send violation alert email:', err);
    });
  }
}

export const violationAlertService = new ViolationAlertService();
