import { Request, Response } from 'express';
import { StripeErrorCode } from '../models/StripeErrorCode';
import { serviceHandler } from '../utils';
import { payoutRetryService } from '../services/PayoutRetryService';
import { AppError } from '../middlewares/errorHandler';

export class AdminController {

    /**
     * Add Stripe Error Code to Allowlist
     */
    static addStripeErrorCode = serviceHandler(async (req: Request, res: Response) => {
        const { error_code, description } = req.body;
        
        if (!error_code) throw new AppError("error_code is required", 400);

        const entry = await StripeErrorCode.create({
            error_code,
            description
        });

        res.json({ success: true, entry });
    });

    /**
     * Manually Trigger Retry for Failed Payouts
     */
    static retryPayouts = serviceHandler(async (req: Request, res: Response) => {
        const results = await payoutRetryService.retryPayouts();
        res.json({ success: true, results });
    });
}
