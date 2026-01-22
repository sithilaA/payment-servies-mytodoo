import { Request, Response } from 'express';
import { escrowService } from '../services/EscrowService';
import { payoutService } from '../services/PayoutService';
import { serviceHandler } from '../utils';
import { logger } from '../utils/logger';

export class EscrowController {

    static create = serviceHandler(async (req: Request, res: Response) => {
        const { payer_id, payee_id, amount, task_id } = req.body;
        const escrow = await escrowService.createEscrow({
            payerId: payer_id,
            payeeId: payee_id,
            amount,
            taskId: task_id
        });
        res.json({ success: true, escrow });
    });

    static release = serviceHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const escrow = await escrowService.releaseEscrow(id as string);
        
        // Auto-Trigger Payout
        try {
            const netAmount = Number(escrow.amount) - (Number(escrow.commission) || 0);
            if (netAmount > 0) {
                 await payoutService.requestPayout({
                     externalUserId: escrow.payee_external_id,
                     amount: netAmount,
                     method: 'BANK'
                 });
            }
        } catch (payoutError) {
            logger.error("Auto-payout failed after escrow release:", { error: payoutError, escrowId: id });
            // We do not fail the request because Escrow IS released. Payout can be retried.
        }

        res.json({ success: true, escrow });
    });

    static refund = serviceHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const escrow = await escrowService.refundEscrow(id as string);
        res.json({ success: true, escrow });
    });
}
