import { TaskerList } from '../models/TaskerList';
import { PosterList } from '../models/PosterList';
import { TaskFinancialHistory } from '../models/TaskFinancialHistory';
import { logger } from '../utils/logger';

/**
 * FinancialService
 * 
 * Writes to the 3 new summary/history tables:
 * - tasker_list (one row per tasker)
 * - poster_list (one row per poster)
 * - task_financial_history (one row per task)
 * 
 * All methods are fire-and-forget safe — they catch errors internally.
 */
export class FinancialService {

    /**
     * Called after a payment is successfully created (createTaskPayment).
     * - Upserts poster in poster_list (increment total_payment, current_balance)
     * - Creates initial task_financial_history row with status 'complete'
     */
    static async recordPaymentCreated(data: {
        task_id: string;
        poster_user_id: string;
        tasker_user_id: string;
        task_price: number;
        total_payment: number; // task_price + service_fee (what poster actually paid)
    }): Promise<void> {
        try {
            const { task_id, poster_user_id, tasker_user_id, task_price, total_payment } = data;

            // Upsert poster_list
            const [poster, created] = await PosterList.findOrCreate({
                where: { user_id: poster_user_id },
                defaults: {
                    user_id: poster_user_id,
                    total_payment: total_payment,
                    total_refund: 0,
                    current_balance: total_payment,
                    last_updated_at: new Date()
                }
            });

            if (!created) {
                await poster.increment('total_payment', { by: total_payment });
                await poster.increment('current_balance', { by: total_payment });
                poster.last_updated_at = new Date();
                await poster.save();
            }

            // Create task_financial_history
            await TaskFinancialHistory.create({
                task_id,
                poster_user_id,
                tasker_user_id,
                task_price,
                status: 'complete',
                penalty_owner: 'none',
                penalty_amount: 0,
                refund_amount: 0,
                payout_amount: 0
            });

            logger.info('FinancialService: Payment recorded', { task_id, poster_user_id });
        } catch (err) {
            logger.error('FinancialService: recordPaymentCreated failed', { error: (err as any)?.message, data });
        }
    }

    /**
     * Called after COMPLETE action succeeds.
     * - Upserts tasker in tasker_list (increment total_payout)
     * - Updates task_financial_history status → 'payout_complete', sets payout_amount
     */
    static async recordTaskCompleted(data: {
        task_id: string;
        tasker_user_id: string;
        payout_amount: number;
    }): Promise<void> {
        try {
            const { task_id, tasker_user_id, payout_amount } = data;

            // Upsert tasker_list
            const [tasker, created] = await TaskerList.findOrCreate({
                where: { user_id: tasker_user_id },
                defaults: {
                    user_id: tasker_user_id,
                    total_payout: payout_amount,
                    current_balance: payout_amount,
                    last_updated_at: new Date()
                }
            });

            if (!created) {
                await tasker.increment('total_payout', { by: payout_amount });
                await tasker.increment('current_balance', { by: payout_amount });
                tasker.last_updated_at = new Date();
                await tasker.save();
            }

            // Update task_financial_history
            await TaskFinancialHistory.update(
                {
                    status: 'payout_complete',
                    payout_amount
                },
                { where: { task_id } }
            );

            logger.info('FinancialService: Task completed recorded', { task_id, tasker_user_id, payout_amount });
        } catch (err) {
            logger.error('FinancialService: recordTaskCompleted failed', { error: (err as any)?.message, data });
        }
    }

    /**
     * Called after CANCEL or REFUND action succeeds (full refund, no penalty).
     * - Updates poster_list (increment total_refund, decrement current_balance)
     * - Updates task_financial_history status → 'refund', sets refund_amount
     */
    static async recordRefund(data: {
        task_id: string;
        poster_user_id: string;
        refund_amount: number;
    }): Promise<void> {
        try {
            const { task_id, poster_user_id, refund_amount } = data;

            // Update poster_list
            const poster = await PosterList.findOne({ where: { user_id: poster_user_id } });
            if (poster) {
                await poster.increment('total_refund', { by: refund_amount });
                await poster.decrement('current_balance', { by: refund_amount });
                poster.last_updated_at = new Date();
                await poster.save();
            }

            // Update task_financial_history
            await TaskFinancialHistory.update(
                {
                    status: 'refund',
                    refund_amount
                },
                { where: { task_id } }
            );

            logger.info('FinancialService: Refund recorded', { task_id, poster_user_id, refund_amount });
        } catch (err) {
            logger.error('FinancialService: recordRefund failed', { error: (err as any)?.message, data });
        }
    }

    /**
     * Called after CANCEL_FULL action succeeds (full refund + tasker penalty).
     * - Updates poster_list (increment total_refund, decrement current_balance)
     * - Updates tasker_list (decrement current_balance by penalty)
     * - Updates task_financial_history status → 'refund_with_penalty'
     */
    static async recordRefundWithPenalty(data: {
        task_id: string;
        poster_user_id: string;
        tasker_user_id: string;
        refund_amount: number;
        penalty_amount: number;
        penalty_owner: 'tasker' | 'poster';
    }): Promise<void> {
        try {
            const { task_id, poster_user_id, tasker_user_id, refund_amount, penalty_amount, penalty_owner } = data;

            // Update poster_list
            const poster = await PosterList.findOne({ where: { user_id: poster_user_id } });
            if (poster) {
                await poster.increment('total_refund', { by: refund_amount });
                await poster.decrement('current_balance', { by: refund_amount });
                poster.last_updated_at = new Date();
                await poster.save();
            }

            // Update tasker_list (penalty deduction)
            const [tasker, created] = await TaskerList.findOrCreate({
                where: { user_id: tasker_user_id },
                defaults: {
                    user_id: tasker_user_id,
                    total_payout: 0,
                    current_balance: -penalty_amount, // Starts negative due to penalty
                    last_updated_at: new Date()
                }
            });

            if (!created) {
                await tasker.decrement('current_balance', { by: penalty_amount });
                tasker.last_updated_at = new Date();
                await tasker.save();
            }

            // Update task_financial_history
            await TaskFinancialHistory.update(
                {
                    status: 'refund_with_penalty',
                    refund_amount,
                    penalty_amount,
                    penalty_owner
                },
                { where: { task_id } }
            );

            logger.info('FinancialService: Refund with penalty recorded', { task_id, poster_user_id, tasker_user_id, penalty_amount });
        } catch (err) {
            logger.error('FinancialService: recordRefundWithPenalty failed', { error: (err as any)?.message, data });
        }
    }
}
