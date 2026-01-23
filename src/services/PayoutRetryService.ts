import { FailedPayout } from '../models/FailedPayout';
import { StripeErrorCode } from '../models/StripeErrorCode';
import { Wallet } from '../models/Wallet';
import { Transaction } from 'sequelize';
import { stripeService } from './StripeService';
import { logger } from '../utils/logger';

export class PayoutRetryService {

    /**
     * Checks if an error is retryable and queues it if so.
     * Returns true if queued, false if not retryable.
     */
    async checkAndQueue(params: {
        taskId: string,
        userId: string,
        stripeAccountId: string,
        amount: number,
        currency: string,
        error: any,
        transaction?: Transaction | null
    }): Promise<boolean> {
        const { taskId, userId, stripeAccountId, amount, currency, error, transaction } = params;

        const errorCode = error?.code || error?.raw?.code || 'UNKNOWN_ERROR';

        // Always Queue it (Requirement: Do not skip saving failures)
        await FailedPayout.create({
            task_id: taskId,
            user_id: userId,
            stripe_connect_account_id: stripeAccountId,
            amount,
            currency,
            error_code: errorCode,
            last_error_message: error.message || "Unknown error",
            status: 'PENDING',
            retry_count: 0
        }, { transaction });

        logger.warn('Payout queued for retry', { taskId, errorCode });
        return true;
    }

    /**
     * Process retries
     */
    async retryPayouts() {
        const pending = await FailedPayout.findAll({
            where: { status: 'PENDING' },
            limit: 50 // process in chunks
        });

        const results = {
            processed: 0,
            success: 0,
            failed: 0,
            details: [] as any[]
        };

        for (const payout of pending) {
            results.processed++;
            try {
                // Find Wallet to update balance
                const wallet = await Wallet.findOne({ where: { external_user_id: payout.user_id } });
                if (!wallet) {
                    payout.status = 'FAILED';
                    payout.last_error_message = "Wallet not found";
                    await payout.save();

                    results.failed++;
                    results.details.push({
                        payout_id: payout.id,
                        amount: payout.amount,
                        status: 'FAILED',
                        error_code: 'WALLET_NOT_FOUND',
                        message: 'Wallet not found for user'
                    });
                    continue;
                }

                // Check Balance
                if (Number(wallet.available_balance) < Number(payout.amount)) {
                    payout.last_error_message = "Insufficient Wallet Balance";
                    payout.retry_count++;
                    await payout.save();

                    results.failed++;
                    results.details.push({
                        payout_id: payout.id,
                        amount: payout.amount,
                        status: 'FAILED',
                        error_code: 'INSUFFICIENT_WALLET_BALANCE',
                        message: `Insufficient internal wallet balance. Available: ${wallet.available_balance}`
                    });
                    continue;
                }

                // Attempt Payout
                await stripeService.createTransfer({
                    amount: Number(payout.amount),
                    currency: payout.currency,
                    destinationAccountId: payout.stripe_connect_account_id,
                    transferGroup: payout.task_id
                });

                // Success!!
                await wallet.decrement('available_balance', { by: Number(payout.amount) });

                payout.status = 'SUCCESS';
                await payout.save();
                logger.info('Retry Payout Success', { id: payout.id });
                results.success++;
                results.details.push({
                    payout_id: payout.id,
                    amount: payout.amount,
                    status: 'SUCCESS'
                });

            } catch (e: any) {
                const errorCode = e.raw?.code || e.code || 'UNKNOWN_ERROR';
                const errorMessage = e.message || 'Unknown error';

                logger.error('Retry Payout Failed', { id: payout.id, error: e, errorCode, errorMessage });

                payout.retry_count++;
                payout.last_error_message = errorMessage;
                payout.error_code = errorCode; // Update latest error code
                await payout.save();

                results.failed++;
                results.details.push({
                    payout_id: payout.id,
                    amount: payout.amount,
                    status: 'FAILED',
                    error_code: errorCode,
                    message: errorMessage
                });
            }
        }

        return results;
    }
}

export const payoutRetryService = new PayoutRetryService();
