import { emailService } from '../services/EmailService';
import { logger } from '../utils/logger';
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

process.env.EMAIL_DEBUG = 'true';

async function verifySmtp() {
    console.log('--- DIAGNOSTIC START ---');
    try {
        const recipients = ['sithila.effectivesolutions@gmail.com'];
        console.log(`Sending to: ${recipients}`);

        await emailService.sendEmail(
            recipients,
            `Diagnostics Test [${new Date().toISOString()}]`,
            'This is a plain text test to verify delivery.'
        );
        console.log('--- DIAGNOSTIC END (Success?) ---');
    } catch (error) {
        console.error('--- DIAGNOSTIC END (Failed) ---');
        console.error(error);
    }
}

verifySmtp();
