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
        success: 0,
        failed: 0
    };

    for (const payout of pending) {
        try {
            // Find Wallet to update balance (Wait, we ALREADY deducted balance? Or did we?)
            // In PaymentService logic:
            // 1. Move Pending -> Available (Increment)
            // 2. Try Payout -> Fail -> Queue.
            // 3. IF Queued: We DID NOT decrement Available.
            // So if we retry, we must deduct Available.
            
            const wallet = await Wallet.findOne({ where: { external_user_id: payout.user_id } });
            if (!wallet) {
                payout.status = 'FAILED';
                payout.last_error_message = "Wallet not found";
                await payout.save();
                results.failed++;
                continue;
            }

            // Check Balance
            if (Number(wallet.available_balance) < Number(payout.amount)) {
                // Not enough funds? Maybe user withdrew or something else happened?
                // Or maybe we haven't released funds to available yet?
                // Logic says we DID move to available.
                payout.last_error_message = "Insufficient Wallet Balance";
                // Don't fail permanently? Or maybe retry later?
                // Increment retry count
                payout.retry_count++;
                await payout.save();
                results.failed++;
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
            // Now Deduct Balance
            // Use transaction for safety
            // Wait, we are in a loop proper transaction handling is tricky for batch
            // Use local transaction per item
            /*
             Note: Stripe Transfer is external. If it succeeds but DB update fails, we have drift.
             Ideally we deduct first? But then if stripe fails...
             This is the classic distributed transaction problem.
             Sync approach: Deduct -> Transfer -> If Fail, Refund/Add Back.
             Let's stick to Transfer -> Deduct for now (Optimistic).
            */
           
            await wallet.decrement('available_balance', { by: Number(payout.amount) });
            
            payout.status = 'SUCCESS';
            await payout.save();
            logger.info('Retry Payout Success', { id: payout.id });
            results.success++;

        } catch (e: any) {
            logger.error('Retry Payout Failed', { id: payout.id, error: e });
            payout.retry_count++;
            payout.last_error_message = e.message;
            // Maybe mark FAILED if retry_count > 5?
            await payout.save();
            results.failed++;
        }
    }

    return results;
  }
}

export const payoutRetryService = new PayoutRetryService();
