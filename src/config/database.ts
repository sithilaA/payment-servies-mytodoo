import { Sequelize } from 'sequelize-typescript';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';
import { Wallet } from '../models/Wallet';
import { Transaction } from '../models/Transaction';
import { Earning } from '../models/Earning';
import { Payout } from '../models/Payout';
import { Escrow } from '../models/Escrow';
import { PlatformAccount } from '../models/PlatformAccount';
import { Payment } from '../models/Payment';

import { PendingPayout } from '../models/PendingPayout';

import { FailedRequestAdminReview } from '../models/FailedRequestAdminReview';
import { StripeErrorCode } from '../models/StripeErrorCode';
import { FailedPayout } from '../models/FailedPayout';
import { FailedRefundRequest } from '../models/FailedRefundRequest';

dotenv.config();

export const sequelize = new Sequelize({
  dialect: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'password',
  database: process.env.DB_NAME || 'payment_service',
  models: [Wallet, Transaction, Earning, Payout, Escrow, PlatformAccount, Payment, StripeErrorCode, FailedPayout, PendingPayout, FailedRequestAdminReview, FailedRefundRequest],
  logging: false, // Set to console.log to see SQL queries
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

export const dbConnect = async (retries = 5, delay = 5000) => {
  for (let i = 0; i < retries; i++) {
    try {
      await sequelize.authenticate();
      logger.info('Database connection has been established successfully.');
      // Sync models only on successful connection
      // NOTE: alter:true disabled due to MySQL 64 key limit error
      // Run this SQL manually: ALTER TABLE transactions MODIFY COLUMN status ENUM('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED') NOT NULL DEFAULT 'PENDING';
      await sequelize.sync({ alter: false });
      return;
    } catch (error: any) {
      logger.error(`Unable to connect to the database (Attempt ${i + 1}/${retries})`, { error: error.message });
      if (i < retries - 1) {
        logger.info(`Retrying database connection in ${delay / 1000} seconds...`);
        await new Promise(res => setTimeout(res, delay));
      } else {
        logger.error('Max retries reached. Database connection failed. Application will start but DB features will be unavailable.');

        // ALERT LOGIC
        const emailAlertsEnabled = process.env.EMAIL_ALERTS_ENABLED !== 'false';
        if (emailAlertsEnabled) {
          try {
            const fs = require('fs');
            const path = require('path');
            const configPath = path.resolve(__dirname, '../../alert-config.json');

            if (fs.existsSync(configPath)) {
              const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

              // Support both single string (legacy) and array of strings
              let recipients = config.dbFailureAlertEmails || config.dbFailureAlertEmail;

              if (Array.isArray(recipients)) {
                // Keep as array for updated EmailService
                // But database.ts might use legacy logic? Let's assume EmailService now accepts array.
                // Actually EmailService accepts string | string[].
                // So we can pass it directly.
              } else if (recipients) {
                recipients = [recipients]; // normalize to array
              }

              if (recipients && recipients.length > 0) {
                const { emailService } = require('../services/EmailService'); // Lazy import to avoid circular dep issues if any

                const subject = 'Database Connection Failed – Max Retries Reached';
                const body = `
    URGENT: Database connection failed after max retries.
    
    Environment: ${process.env.NODE_ENV || 'development'}
    Timestamp: ${new Date().toISOString()}
    DB Host: ${process.env.DB_HOST}:${process.env.DB_PORT}
    Error Details: ${error.message}
    Error Code: ${(error as any).original?.code || error.name}
    
    The application has started in a degraded state. Database features are unavailable.
                        `;

                // Send Alert (Fire & Forget)
                emailService.sendEmail(recipients, subject, body).catch((err: any) => logger.error('Email send trigger failed', { error: err.message }));
              }
            }
          } catch (alertError) {
            logger.error('Failed to process alert configuration', { error: (alertError as any)?.message || alertError });
          }
        } else {
          logger.info('Database failure alert email skipped (EMAIL_ALERTS_ENABLED is false)');
        }

        // Do NOT exit process.
      }
    }
  }
};
