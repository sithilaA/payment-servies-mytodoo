import Stripe from 'stripe';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';

dotenv.config();

if (!process.env.STRIPE_SECRET_KEY) {
  logger.error("STRIPE_SECRET_KEY is missing!");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-06-20' as any,
  typescript: true,
});

export const STRIPE_PLATFORM_ACCOUNT_ID = process.env.STRIPE_PLATFORM_ACCOUNT_ID;
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
