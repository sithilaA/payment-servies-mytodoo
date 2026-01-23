import { Request, Response } from 'express';
import { walletService } from '../services/WalletService';
import { serviceHandler } from '../utils';
import { AppError } from '../utils/AppError';

export class UserController {
  /**
   * Update Payout Details
   */
  static updatePayoutDetails = serviceHandler(async (req: Request, res: Response) => {
    const { user_id, stripe_connect_account_id, role } = req.body;

    if (!user_id || !stripe_connect_account_id) {
      throw new AppError("Missing required fields", 400);
    }

    // Find Wallet and Update
    const wallet = await walletService.getOrCreate(user_id, user_id, role);
    wallet.stripe_account_id = stripe_connect_account_id;
    wallet.stripe_account_status = 'ACTIVE';
    await wallet.save();

    // TRIGGER PENDING PAYOUTS
    try {
      const { PendingPayout } = require('../models/PendingPayout');
      const { FailedPayout } = require('../models/FailedPayout');
      const { stripeService } = require('../services/StripeService');
      const { Payout } = require('../models/Payout');
      const { logger } = require('../utils/logger');
      const { settings } = require('../config/settings');

      const pendingPayouts = await PendingPayout.findAll({
        where: { user_id, status: 'PENDING' }
      });

      let processedCount = 0;
      let failCount = 0;

      if (pendingPayouts.length > 0) {
        logger.info(`Found ${pendingPayouts.length} pending payouts for user ${user_id}. Processing...`);

        for (const payout of pendingPayouts) {
          try {
            // Check available balance? 
            // Logic: We assume the balance sits in the wallet because we moved it to Available in PaymentService.
            // We should check wallet again to be safe.
            await wallet.reload();
            const amountToPay = Number(payout.amount); // Or wallet.available_balance

            // Security: Cannot pay more than available balance.
            if (Number(wallet.available_balance) >= amountToPay) {

              const transfer = await stripeService.createTransfer({
                amount: amountToPay,
                currency: payout.currency,
                destinationAccountId: stripe_connect_account_id,
                transferGroup: payout.task_id,
                description: `Delayed Payout for Task ${payout.task_id}`,
                metadata: {
                  task_id: payout.task_id,
                  tasker_id: user_id,
                  type: 'delayed_task_payout'
                }
              });

              // Deduct
              await wallet.decrement('available_balance', { by: amountToPay });

              // Record Success
              await Payout.create({
                external_user_id: user_id,
                wallet_id: wallet.id,
                amount: amountToPay,
                currency: payout.currency,
                method: 'BANK',
                status: 'COMPLETED',
                stripe_payout_id: transfer.id,
                related_task_id: payout.task_id,
                details: { destination: stripe_connect_account_id, delayed: true }
              });

              // Update Pending Record
              payout.status = 'PROCESSED';
              await payout.save();

              logger.info(`Processed pending payout ${payout.id}`);
              processedCount++;
            } else {
              logger.warn(`Insufficient balance for pending payout ${payout.id}. Wallet: ${wallet.available_balance}, Req: ${amountToPay}`);
              failCount++;
            }

          } catch (err: any) {
            logger.error(`Failed to process pending payout ${payout.id}`, { error: err });

            // Handle Payout Failures
            const errorCode = err.raw?.code || err.code || 'UNKNOWN_ERROR';
            const { StripeErrorCode } = require('../models/StripeErrorCode');
            const { FailedRequestAdminReview } = require('../models/FailedRequestAdminReview');

            // Check if error is in allowed list
            const isKnownError = await StripeErrorCode.findOne({ where: { error_code: errorCode } });

            if (isKnownError) {
              // KNOWN ERROR -> FailedPayout
              try {
                const existingFail = await FailedPayout.findOne({ where: { task_id: payout.task_id } });

                if (existingFail) {
                  existingFail.status = 'PENDING';
                  existingFail.error_code = errorCode;
                  existingFail.last_error_message = err.message;
                  // existingFail.retry_count // Optional: reset or keep? 
                  await existingFail.save();
                  logger.info(`Updated existing FailedPayout for ${payout.id} (Known Error: ${errorCode})`);
                } else {
                  await FailedPayout.create({
                    task_id: payout.task_id,
                    user_id: user_id,
                    stripe_connect_account_id: stripe_connect_account_id,
                    amount: Number(payout.amount),
                    currency: payout.currency,
                    error_code: errorCode,
                    last_error_message: err.message,
                    status: 'PENDING'
                  });
                  logger.info(`Created new FailedPayout for ${payout.id} (Known Error: ${errorCode})`);
                }
              } catch (innerErr) {
                logger.error(`Failed to record FailedPayout for ${payout.id}`, innerErr);
              }
            } else {
              // UNKNOWN ERROR -> Admin Review
              try {
                const existingReview = await FailedRequestAdminReview.findOne({ where: { task_id: payout.task_id } });

                if (existingReview) {
                  existingReview.status = 'ADMIN_REVIEW_REQUIRED'; // Re-open if it was previously processed or something?
                  existingReview.error_code = errorCode;
                  existingReview.last_error_message = err.message;
                  await existingReview.save();
                  logger.warn(`Updated existing Admin Review Request for ${payout.id} (Unknown Error: ${errorCode})`);
                } else {
                  await FailedRequestAdminReview.create({
                    task_id: payout.task_id,
                    user_id: user_id,
                    stripe_connect_account_id: stripe_connect_account_id,
                    amount: Number(payout.amount),
                    currency: payout.currency,
                    error_code: errorCode,
                    last_error_message: err.message
                  });
                  logger.warn(`Created new Admin Review Request for ${payout.id} (Unknown Error: ${errorCode})`);
                }
              } catch (innerErr) {
                logger.error(`Failed to record FailedRequestAdminReview for ${payout.id}`, innerErr);
              }
            }

            // Always mark the PendingPayout as FAILED so we don't loop endlessly
            payout.status = 'FAILED';
            await payout.save();

            failCount++;
          }
        }
      }

      // Add summary to response if needed, for now we just log.
      if (processedCount > 0 || failCount > 0) {
        logger.info(`Payout Retry Summary: ${processedCount} Success, ${failCount} Failed.`);
      }

    } catch (e) {
      // Do not block the User Update response
      console.error('Error processing pending payouts hook', e);
    }

    res.json({ success: true, message: "Payout details updated and pending payouts triggered." });
  });
}
