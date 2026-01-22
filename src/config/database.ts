import { Sequelize } from 'sequelize-typescript';
import dotenv from 'dotenv';
import { Wallet } from '../models/Wallet';
import { Transaction } from '../models/Transaction';
import { Earning } from '../models/Earning';
import { Payout } from '../models/Payout';
import { Escrow } from '../models/Escrow';
import { PlatformAccount } from '../models/PlatformAccount';
import { Payment } from '../models/Payment';

import { StripeErrorCode } from '../models/StripeErrorCode';
import { FailedPayout } from '../models/FailedPayout';

dotenv.config();

export const sequelize = new Sequelize({
  dialect: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'password',
  database: process.env.DB_NAME || 'payment_service',
  models: [Wallet, Transaction, Earning, Payout, Escrow, PlatformAccount, Payment, StripeErrorCode, FailedPayout],
  logging: false, // Set to console.log to see SQL queries
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

export const dbConnect = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connection has been established successfully.');
    // Sync models
    await sequelize.sync({ alter: true }); 
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    process.exit(1);
  }
};
