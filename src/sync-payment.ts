/**
 * One-time script to sync the Payment model (add missing columns like poster_email, tasker_email).
 * 
 * Usage:
 *   1. Build: npx tsc
 *   2. Run:   node dist/sync-payment.js
 *   3. Delete this file after successful sync.
 */
import dotenv from 'dotenv';
dotenv.config();

import { Sequelize } from 'sequelize-typescript';
import { Payment } from './models/Payment';

const sequelize = new Sequelize({
  dialect: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'password',
  database: process.env.DB_NAME || 'payment_service',
  models: [Payment],
  logging: console.log, // Show SQL so you can see what it does
});

(async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected.');

    // Sync ONLY the Payment model — adds missing columns
    await Payment.sync({ alter: true });
    console.log('✅ Payment table synced successfully! Missing columns have been added.');

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Sync failed:', error);
    process.exit(1);
  }
})();
