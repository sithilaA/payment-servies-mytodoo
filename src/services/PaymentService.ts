import { Payment } from '../models/Payment';
import { Wallet } from '../models/Wallet';
import { PlatformAccount } from '../models/PlatformAccount';
import { walletService } from './WalletService';
import { ledgerService } from './LedgerService';
import { sequelize } from '../config/database';
import { logger } from '../utils/logger';
import { settings } from '../config/settings';
import { AppError } from '../utils/AppError';

export class PaymentService {

    /**
     * Endpoint 1: Create Task Payment (Pending Balance)
     */
    static async createTaskPayment(data: {
        task_price: number;
        commission: number;
        service_fee: number;
        tasker_id: string; // External User ID
        poster_id: string; // External User ID
        task_id: string;
    }) {
        const { task_price, commission, service_fee, tasker_id, poster_id, task_id } = data;

        // Check for existing payment properly (Idempotency / Unique Constraint Logic)
        const existingPayment = await Payment.findOne({ where: { related_task_id: task_id } });
        if (existingPayment) {
            throw new AppError("Payment already exists for this task.", 409);
        }

        const transaction = await sequelize.transaction();
        try {
            // 1. Calculations
            const taskerPendingAmount = Number(task_price) - Number(commission);
            const companyPendingAmount = Number(commission) + Number(service_fee);
            const totalAmount = Number(task_price) + Number(service_fee);

            // 2. Mock Charge (In real life, integrated with Stripe here)
            // Just recording the Payment entity as PENDING
            const payment = await Payment.create({
                user_id: poster_id,
                amount: totalAmount,
                service_fee: service_fee,
                commission: commission,
                currency: settings.currency,
                status: 'PENDING', // Payment itself is pending/held
                related_task_id: task_id
            }, { transaction });

            // 3. Update Tasker Pending Balance
            const taskerWallet = await walletService.getOrCreate(tasker_id, tasker_id, 'service_provider', transaction);
            // Removed check for !taskerWallet because getOrCreate always returns one.

            await taskerWallet.increment('pending_balance', { by: taskerPendingAmount, transaction });

            // 4. Update Company Pending Balance
            const [companyAccount] = await PlatformAccount.findOrCreate({
                where: {},
                defaults: { balance: 0, total_revenue: 0, pending_balance: 0 },
                transaction
            });
            await companyAccount.increment('pending_balance', { by: companyPendingAmount, transaction });

            // 5. Ledger Entries (PENDING)

            // a. Tasker Credit (Pending)
            await ledgerService.record({
                toWalletId: taskerWallet.id,
                amount: taskerPendingAmount,
                currency: settings.currency,
                type: 'EARNING_PENDING',
                status: 'PENDING',
                referenceId: payment.id,
                transaction
            });

            // b. Company Credit (Pending)
            await ledgerService.record({
                platformAccountId: companyAccount.id,
                amount: companyPendingAmount,
                currency: settings.currency,
                type: 'FEE_PENDING',
                status: 'PENDING',
                referenceId: payment.id,
                transaction
            });

            await transaction.commit();

            logger.info('Task Payment Created (Funds Held)', {
                taskId: task_id,
                posterId: poster_id,
                taskerId: tasker_id,
                totalAmount
            });

            return {
                message: "Payment created, funds held.",
                paymentId: payment.id,
                breakdown: {
                    tasker_pending: taskerPendingAmount,
                    company_pending: companyPendingAmount
                }
            };

        } catch (error) {
            await transaction.rollback();
            logger.error('Create Task Payment Failed', { error, data });
            throw error;
        }
    }

    /**
     * Endpoint 2: Task Action (Complete or Cancel)
     */
    static async handleTaskAction(data: {
        task_id: string;
        poster_id: string;
        action: 'COMPLETE' | 'CANCEL' | 'REFUND_KEEP_FEE' | 'REFUND_WITH_PENALTY' | 'REFUND_FULL';
        penalty_amount?: number;
    }) {
        const { task_id, poster_id, action, penalty_amount } = data;

        const transaction = await sequelize.transaction();
        try {
            // Find Payment associated with Task
            const payment = await Payment.findOne({
                where: { related_task_id: task_id, status: 'PENDING' },
                transaction
            });

            if (!payment) {
                // If not found in PENDING, maybe checks status?
                // For this strict flow, we expect it to be pending.
                throw new AppError('No pending payment found for this task.', 404);
            }

            // Security check
            // if (payment.user_id !== poster_id) throw new AppError('Poster ID mismatch', 403);

            const taskerPendingAmount = Number(payment.amount) - Number(payment.service_fee) - Number(payment.commission);
            const companyPendingAmount = Number(payment.commission) + Number(payment.service_fee);

            // Locate Tasker Wallet via Ledger or Relation
            const taskerLedgerEntry = await import('../models/Transaction').then(m => m.Transaction.findOne({
                where: { reference_id: payment.id, type: 'EARNING_PENDING' },
                transaction
            }));

            if (!taskerLedgerEntry?.to_wallet_id) throw new AppError('Tasker wallet trace failed.', 500);
            const taskerWallet = await Wallet.findByPk(taskerLedgerEntry.to_wallet_id, { transaction });
            if (!taskerWallet) throw new AppError('Tasker wallet not found.', 404);

            const companyAccount = await PlatformAccount.findOne({ transaction });
            if (!companyAccount) throw new AppError('Company account not found.', 500);

            // --- Handlers ---

            if (action === 'COMPLETE') {
                // 1. Internal Move: Pending -> Available
                await taskerWallet.decrement('pending_balance', { by: taskerPendingAmount, transaction });
                await taskerWallet.increment('available_balance', { by: taskerPendingAmount, transaction });

                await companyAccount.decrement('pending_balance', { by: companyPendingAmount, transaction });
                await companyAccount.increment('balance', { by: companyPendingAmount, transaction });
                await companyAccount.increment('total_revenue', { by: companyPendingAmount, transaction });

                let responseMessage = 'Task completed, funds released to Stripe Connect account.';
                let responseStatus = 'COMPLETED';

                // 2. Process Payout OR Queue if Account Missing
                if (!taskerWallet.stripe_account_id) {
                    // A. ACCOUNT MISSING -> QUEUE PAYOUT
                    await import('../models/PendingPayout').then(m => m.PendingPayout.create({
                        task_id,
                        user_id: taskerWallet.external_user_id,
                        amount: taskerPendingAmount,
                        currency: settings.currency,
                        status: 'PENDING'
                    }, { transaction }));

                    responseStatus = 'PAYOUT_QUEUED';
                    responseMessage = 'Stripe Connect account not found. Payout saved as pending.';

                    logger.info('Payout Queued (Missing Stripe Account)', { task_id, amount: taskerPendingAmount });

                    // Send Queued Alert
                    if (process.env.EMAIL_ALERTS_ENABLED !== 'false') {
                        try {
                            const fs = require('fs');
                            const path = require('path');
                            const configPath = path.resolve(__dirname, '../../alert-config.json');

                            if (fs.existsSync(configPath)) {
                                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                                let recipients = config.dbFailureAlertEmails || config.dbFailureAlertEmail;
                                if (!Array.isArray(recipients)) recipients = [recipients];
                                if (recipients && recipients.length > 0) {
                                    const { emailService } = require('./EmailService');
                                    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
                                    const subject = `Action Required: Payout Queued [${timestamp}]`;
                                    const body = `
Dear Admin,

A payout has been QUEUED for the following task because the Tasker has no linked Stripe Connect account.

Details:
- Task Reference: ${task_id}
- User ID: ${taskerWallet.external_user_id}
- Username: ${taskerWallet.external_username}
- Pending Amount: ${taskerPendingAmount} ${settings.currency}

The payout will be automatically triggered when the user updates their payment details.
                                     `;
                                    logger.info('Initiating alert email for Queued Payout.', { recipients });
                                    emailService.sendEmail(recipients, subject, body).catch((e: any) => logger.error("Email send failed (Async)", { error: e }));
                                }
                            }
                        } catch (e) {
                            logger.error('Failed to send queued payout alert email', { error: e });
                        }
                    }

                } else {
                    // B. ACCOUNT EXISTS -> PAYOUT
                    try {
                        // Reload to get fresh balance after increment
                        await taskerWallet.reload({ transaction });
                        const payoutAmount = Number(taskerWallet.available_balance);

                        if (payoutAmount > 0) {
                            const transfer = await import('./StripeService').then(m => m.stripeService.createTransfer({
                                amount: payoutAmount,
                                currency: settings.currency,
                                destinationAccountId: taskerWallet.stripe_account_id!,
                                transferGroup: task_id,
                                description: `Payout for Task ${task_id}`,
                                metadata: {
                                    task_id,
                                    poster_id,
                                    tasker_id: taskerWallet.external_user_id,
                                    type: 'task_payout'
                                }
                            }));

                            // Update Wallet (Deduct Payout)
                            await taskerWallet.decrement('available_balance', { by: payoutAmount, transaction });

                            // Log Payout in DB
                            await import('../models/Payout').then(m => m.Payout.create({
                                external_user_id: taskerWallet.external_user_id,
                                wallet_id: taskerWallet.id,
                                amount: payoutAmount,
                                currency: settings.currency,
                                method: 'BANK',
                                status: 'COMPLETED',
                                stripe_payout_id: transfer.id,
                                related_task_id: task_id,
                                details: { destination: taskerWallet.stripe_account_id }
                            }, { transaction }));

                            logger.info('Stripe Payout Triggered & Saved', { task_id, amount: payoutAmount, stripe_acc: taskerWallet.stripe_account_id });
                        }
                    } catch (stripeErr: any) {
                        logger.error('Stripe Payout Failed', { stripeErr });

                        // SAVE FAILURE RECORD INDEPENDENTLY
                        await import('./PayoutRetryService').then(m => m.payoutRetryService.checkAndQueue({
                            taskId: task_id,
                            userId: taskerWallet.external_user_id,
                            stripeAccountId: taskerWallet.stripe_account_id!,
                            amount: Number(taskerWallet.available_balance),
                            currency: settings.currency,
                            error: stripeErr,
                            transaction: null
                        }));

                        // Re-throw as AppError to return exact reason to client
                        const errorMessage = stripeErr.message || "Stripe payout failed";
                        throw new AppError(errorMessage, 502); // 502 Bad Gateway is appropriate for upstream failure, or 400.
                    }
                }

                // 3. Update Statuses
                await import('../models/Transaction').then(m => m.Transaction.update(
                    { status: 'COMPLETED' },
                    { where: { reference_id: payment.id }, transaction }
                ));
                payment.status = 'COMPLETED';
                await payment.save({ transaction });

                await transaction.commit();
                return { success: true, status: responseStatus, message: responseMessage };

            } else if (action === 'CANCEL' || action === 'REFUND_FULL') {
                // Scenario 3: Normal Refund (Reverse everything)
                // "Refund the full amount to the Poster. No service fee kept. No tasker penalty. Reverse all."

                // 1. Stripe Refund (Full)
                if (payment.stripe_payment_intent_id) {
                    await import('./StripeService').then(m => m.stripeService.createRefund(Number(payment.amount), payment.stripe_payment_intent_id!));
                }

                // 2. Reverse Pending
                await taskerWallet.decrement('pending_balance', { by: taskerPendingAmount, transaction });
                await companyAccount.decrement('pending_balance', { by: companyPendingAmount, transaction });

                // 3. Statuses
                await import('../models/Transaction').then(m => m.Transaction.update(
                    { status: 'CANCELLED' }, // or REFUNDED
                    { where: { reference_id: payment.id }, transaction }
                ));
                payment.status = 'REFUNDED';
                await payment.save({ transaction });

                await transaction.commit();
                return { success: true, status: 'REFUNDED_FULL' };

            } else if (action === 'REFUND_KEEP_FEE') {
                // Scenario 1: Keep Service Fee
                // Refund Task Price ONLY.

                const taskPrice = Number(payment.amount) - Number(payment.service_fee); // Total - Fee

                // 1. Stripe Refund (Partial)
                if (payment.stripe_payment_intent_id) {
                    await import('./StripeService').then(m => m.stripeService.createRefund(taskPrice, payment.stripe_payment_intent_id!));
                }

                // 2. Reverse Tasker Pending (They get nothing)
                await taskerWallet.decrement('pending_balance', { by: taskerPendingAmount, transaction });

                // 3. Company Pending Logic
                // "Keep the service fee as company income."
                // Company Pending was (Commission + Fee).
                // We keep Fee. We lose Commission.
                const commissionPart = Number(payment.commission);
                const feePart = Number(payment.service_fee);

                await companyAccount.decrement('pending_balance', { by: companyPendingAmount, transaction });
                await companyAccount.increment('balance', { by: feePart, transaction });
                await companyAccount.increment('total_revenue', { by: feePart, transaction });

                // 4. Statuses
                payment.status = 'REFUNDED';
                await payment.save({ transaction });

                await transaction.commit();
                return { success: true, status: 'REFUNDED_KEEP_FEE' };

            } else if (action === 'REFUND_WITH_PENALTY') {
                // Scenario 2: Full Refund Poster + Tasker Penalty
                // "Refund 100% ... Apply commission amount as negative balance to Tasker."

                // 1. Stripe Refund (Full)
                if (payment.stripe_payment_intent_id) {
                    await import('./StripeService').then(m => m.stripeService.createRefund(Number(payment.amount), payment.stripe_payment_intent_id!));
                }

                // 2. Reverse Pending
                await taskerWallet.decrement('pending_balance', { by: taskerPendingAmount, transaction });
                await companyAccount.decrement('pending_balance', { by: companyPendingAmount, transaction });

                // 3. Apply Penalty to Tasker
                const penalty = Number(payment.commission);
                await taskerWallet.decrement('available_balance', { by: penalty, transaction }); // Goes negative

                // 4. Credit Company (Penalty Income)
                await companyAccount.increment('balance', { by: penalty, transaction });
                await companyAccount.increment('total_revenue', { by: penalty, transaction });

                // 5. Statuses
                payment.status = 'REFUNDED';
                await payment.save({ transaction });

                await transaction.commit();
                return { success: true, status: 'REFUNDED_WITH_PENALTY' };

            } else {
                throw new AppError('Invalid action.', 400);
            }

        } catch (error) {
            await transaction.rollback();
            logger.error('Task Action Failed', { error, data });
            throw error;
        }
    }
}
