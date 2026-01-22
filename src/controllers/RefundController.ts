import { Request, Response } from 'express';
import { RefundService } from '../services/RefundService';
import { serviceHandler } from '../utils';

export class RefundController {

    static standardRefund = serviceHandler(async (req: Request, res: Response) => {
        const { paymentId, reason } = req.body;
        if (!paymentId) throw new Error('paymentId is required');

        const refund = await RefundService.processStandardRefund(paymentId, reason);
        res.json({ success: true, refund });
    });

    static penaltyRefund = serviceHandler(async (req: Request, res: Response) => {
        const { paymentId, penaltyAmount, reason } = req.body;
        if (!paymentId || !penaltyAmount) throw new Error('paymentId and penaltyAmount are required');

        const refund = await RefundService.processPenaltyRefund(paymentId, penaltyAmount, reason);
        res.json({ success: true, refund });
    });

    static fullRefund = serviceHandler(async (req: Request, res: Response) => {
        const { paymentId, reason } = req.body;
        if (!paymentId) throw new Error('paymentId is required');

        const refund = await RefundService.processFullRefund(paymentId, reason);
        res.json({ success: true, refund });
    });
}
