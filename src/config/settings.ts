import dotenv from 'dotenv';
dotenv.config();

export const settings = {
    currency: process.env.DEFAULT_CURRENCY || 'USD',
    payouts: {
        schedule: {
            interval: 'daily'
        }
    },
    payments: {
        settlement_timing: {
            delay_days_override: 2
        }
    }
};
