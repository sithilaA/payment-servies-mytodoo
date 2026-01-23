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

        // Check if error code is in the allowlist
        const isKnownError = await StripeErrorCode.findOne({ where: { error_code: errorCode } });

        if (isKnownError) {
            // KNOWN ERROR -> FailedPayout (with dedup)
            const existing = await FailedPayout.findOne({ where: { task_id: taskId }, transaction });

            if (existing) {
                existing.status = 'PENDING';
                existing.error_code = errorCode;
                existing.last_error_message = error.message || "Unknown error";
                existing.retry_count = 0;
                await existing.save({ transaction });
                logger.warn('Updated existing FailedPayout record (Known Error)', { taskId, errorCode });
            } else {
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
                logger.warn('Created new FailedPayout record (Known Error)', { taskId, errorCode });
            }
        } else {
            // UNKNOWN ERROR -> Admin Review (with dedup)
            const { FailedRequestAdminReview } = require('../models/FailedRequestAdminReview');

            const existingReview = await FailedRequestAdminReview.findOne({ where: { task_id: taskId }, transaction });

            if (existingReview) {
                existingReview.status = 'ADMIN_REVIEW_REQUIRED';
                existingReview.error_code = errorCode;
                existingReview.last_error_message = error.message || "Unknown error";
                await existingReview.save({ transaction });
                logger.warn('Updated existing Admin Review record (Unknown Error)', { taskId, errorCode });
            } else {
                await FailedRequestAdminReview.create({
                    task_id: taskId,
                    user_id: userId,
                    stripe_connect_account_id: stripeAccountId,
                    amount,
                    currency,
                    error_code: errorCode,
                    last_error_message: error.message || "Unknown error",
                    status: 'ADMIN_REVIEW_REQUIRED'
                }, { transaction });
                logger.warn('Created new Admin Review record (Unknown Error)', { taskId, errorCode });
            }
        }

        return true;
    }

    /**
     * Process retries for failed payouts (known errors)
     * NOTE: Does NOT validate internal wallet balance - uses stored payout.amount 
     * and lets Stripe validate its own platform balance.
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

        logger.info('Retry Payouts: Starting batch', { count: pending.length });

        for (const payout of pending) {
            results.processed++;

            // Get wallet for record-keeping only (not for balance validation)
            const wallet = await Wallet.findOne({ where: { external_user_id: payout.user_id } });

            // Log retry attempt with context
            logger.info('Retry Payout: Attempting', {
                payout_id: payout.id,
                task_id: payout.task_id,
                amount: payout.amount,
                currency: payout.currency,
                stripe_account: payout.stripe_connect_account_id,
                internal_wallet_balance: wallet?.available_balance || 0,
                note: 'Using stored payout.amount - Stripe validates platform balance'
            });

            if (!wallet) {
                payout.status = 'FAILED';
                payout.last_error_message = "Wallet not found";
                await payout.save();

                logger.error('Retry Payout: Wallet not found', { payout_id: payout.id, user_id: payout.user_id });
                results.failed++;
                results.details.push({
                    payout_id: payout.id,
                    task_id: payout.task_id,
                    amount: payout.amount,
                    status: 'FAILED',
                    error_code: 'WALLET_NOT_FOUND',
                    message: 'Wallet not found for user'
                });
                continue;
            }

            // NOTE: No internal wallet balance check
            // The stored payout.amount is the source of truth
            // Stripe API will validate if platform has sufficient balance

            try {
                // Attempt Stripe Transfer
                const transfer = await stripeService.createTransfer({
                    amount: Number(payout.amount),
                    currency: payout.currency,
                    destinationAccountId: payout.stripe_connect_account_id,
                    transferGroup: payout.task_id,
                    description: `Retry Payout for Task ${payout.task_id}`,
                    metadata: {
                        task_id: payout.task_id,
                        user_id: payout.user_id,
                        type: 'retry_payout',
                        original_error: payout.error_code
                    }
                });

                // NOTE: No wallet.decrement - original transaction was rolled back
                // The funds exist in Stripe platform balance, not internal wallet tracking

                payout.status = 'SUCCESS';
                await payout.save();

                logger.info('Retry Payout: Success', {
                    payout_id: payout.id,
                    task_id: payout.task_id,
                    transfer_id: transfer.id,
                    amount: payout.amount
                });

                results.success++;
                results.details.push({
                    payout_id: payout.id,
                    task_id: payout.task_id,
                    amount: payout.amount,
                    status: 'SUCCESS',
                    transfer_id: transfer.id
                });

            } catch (e: any) {
                const errorCode = e.raw?.code || e.code || 'UNKNOWN_ERROR';
                const errorMessage = e.message || 'Unknown error';

                logger.error('Retry Payout: Failed', {
                    payout_id: payout.id,
                    task_id: payout.task_id,
                    error_code: errorCode,
                    error_message: errorMessage,
                    stripe_account: payout.stripe_connect_account_id
                });

                payout.retry_count++;
                payout.last_error_message = errorMessage;
                payout.error_code = errorCode;
                await payout.save();

                results.failed++;
                results.details.push({
                    payout_id: payout.id,
                    task_id: payout.task_id,
                    amount: payout.amount,
                    status: 'FAILED',
                    error_code: errorCode,
                    message: errorMessage
                });
            }
        }

        logger.info('Retry Payouts: Batch complete', {
            processed: results.processed,
            success: results.success,
            failed: results.failed
        });

        return results;
    }
}

export const payoutRetryService = new PayoutRetryService();
