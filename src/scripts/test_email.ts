import { emailService } from '../services/EmailService';
import { logger } from '../utils/logger';
import dotenv from 'dotenv';
import path from 'path';

// Force load env from correct path
const envPath = path.resolve(__dirname, '../../.env');
const result = dotenv.config({ path: envPath });

console.log('Loaded .env from:', envPath);
if (result.error) {
    console.error('Error loading .env', result.error);
}

// Force enable debug for this test script
process.env.EMAIL_DEBUG = 'true';

async function verifySmtp() {
    console.log('--- STARTING EMAIL DEBUG TEST ---');
    console.log(`EMAIL_DEBUG is: ${process.env.EMAIL_DEBUG}`);

    // Attempt verification
    try {
        const fs = require('fs');
        const configPath = path.resolve(__dirname, '../../alert-config.json');
        let recipients = '';

        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            recipients = config.dbFailureAlertEmails ? config.dbFailureAlertEmails.join(',') : config.dbFailureAlertEmail;
        } else {
            console.warn("Config file not found, falling back to static");
            recipients = 'sithila.effectivesolutions@gmail.com'; // Fallback
        }

        console.log(`Target Recipients: ${recipients}`);

        await emailService.sendEmail(
            recipients.split(','), // Send as array
            `Debug Test Email [${new Date().toISOString()}]`,
            'This is a debug test email to verify SMTP logs.'
        );
        console.log('--- TEST SEQUENCE FINISHED ---');
    } catch (error) {
        console.error('Test script crashed:', error);
    }
}

verifySmtp();
