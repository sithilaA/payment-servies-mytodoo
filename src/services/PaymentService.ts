import { Payment } from '../models/Payment';
import { Wallet } from '../models/Wallet';
import { PlatformAccount } from '../models/PlatformAccount';
import { FailedRefundRequest } from '../models/FailedRefundRequest';
import { walletService } from './WalletService';
import { ledgerService } from './LedgerService';
import { sequelize } from '../config/database';
import { logger } from '../utils/logger';
import { settings } from '../config/settings';
import { AppError } from '../utils/AppError';
import { emailService } from './EmailService';
import {
    paymentSuccessPosterEmail,
    // paymentSuccessTaskerEmail, // Removed: Only poster gets email on success
    payoutPaidEmail,
    fullRefundPosterEmail, // Renamed from refundEmail
    cancellationPenaltyPosterEmail, // New: For poster cancellation with penalty
    fullRefundTaskerEmail, // New: For tasker cancellation with full refund + penalty
} from '../utils/notificationEmails';

// Helper to record failed refund requests
async function recordFailedRefund(data: {
    payment: any;
    task_id: string;
    user_id: string;
    amount: number;
    action: string;
    error: any;
}): Promise<void> {
    try {
        await FailedRefundRequest.create({
            payment_id: data.payment.id,
            task_id: data.task_id,
            user_id: data.user_id,
            amount: data.amount,
            currency: data.payment.currency || settings.currency,
            stripe_payment_intent_id: data.payment.stripe_payment_intent_id,
            action: data.action,
            error_code: data.error.code || data.error.name || 'UNKNOWN',
            error_message: data.error.message || JSON.stringify(data.error),
            status: 'PENDING',
            retry_count: 0
        });
        logger.info('Failed refund recorded for admin review', {
            task_id: data.task_id,
            payment_id: data.payment.id,
            action: data.action
        });
    } catch (recordErr) {
        logger.error('Failed to record failed refund request', { recordErr, data });
    }
}

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
        payment_intent?: string; // Stripe Payment Intent ID (optional)
        posterEmail?: string;
        taskerEmail?: string;
    }) {
        const { task_price, commission, service_fee, tasker_id, poster_id, task_id, payment_intent, posterEmail, taskerEmail } = data;

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

            // 2. Create Payment record with optional Stripe Payment Intent
            const payment = await Payment.create({
                user_id: poster_id,
                amount: totalAmount,
                service_fee: service_fee,
                commission: commission,
                currency: settings.currency,
                status: 'PENDING',
                related_task_id: task_id,
                stripe_payment_intent_id: payment_intent || null,
                poster_email: posterEmail || null,
                tasker_email: taskerEmail || null
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

            // Fire-and-forget email notifications
            if (process.env.NOTIFICATION_EMAILS_ENABLED !== 'false') {
                const emailData = {
                    taskId: task_id,
                    amount: totalAmount.toFixed(2),
                    currency: settings.currency,
                    paymentId: payment.id,
                    date: new Date().toISOString().split('T')[0],
                };
                if (posterEmail) {
                    const { subject, html, text } = paymentSuccessPosterEmail(emailData);
                    emailService.sendHtmlEmail(posterEmail, subject, html, text).catch(e =>
                        logger.error('Notification email failed (poster, payment)', { error: (e as any).message })
                    );
                }
                // Removed Tasker Email Logic per requirements
                /* 
                if (taskerEmail) {
                    const { subject, html, text } = paymentSuccessTaskerEmail(emailData);
                    emailService.sendHtmlEmail(taskerEmail, subject, html, text).catch(e =>
                        logger.error('Notification email failed (tasker, payment)', { error: (e as any).message })
                    );
                }
                */
            }

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
     * Endpoint 2: Task Action (Complete or Cancel/Refund)
     */
    static async handleTaskAction(data: {
        task_id: string;
        poster_id: string;
        action: 'COMPLETE' | 'CANCEL' | 'CANCEL_FULL' | 'REFUND';
        penalty_amount?: number;
    }) {
        const { task_id, poster_id, action, penalty_amount } = data;

        const transaction = await sequelize.transaction();
        try {
            // Find Payment associated with Task
            // For COMPLETE: Must be PENDING
            // For REFUND actions: Can be PENDING or COMPLETED (but not already REFUNDED)
            let payment;

            if (action === 'COMPLETE') {
                payment = await Payment.findOne({
                    where: { related_task_id: task_id, status: 'PENDING' },
                    transaction
                });

                if (!payment) {
                    throw new AppError('No pending payment found for this task.', 404);
                }
            } else {
                // CANCEL, REFUND_FULL, REFUND_KEEP_FEE, REFUND_WITH_PENALTY
                // Can work on PENDING or COMPLETED payments
                const { Op } = require('sequelize');
                payment = await Payment.findOne({
                    where: {
                        related_task_id: task_id,
                        status: { [Op.in]: ['PENDING', 'COMPLETED'] }
                    },
                    order: [['createdAt', 'DESC']], // Get latest if multiple
                    transaction
                });

                if (!payment) {
                    // Check if already refunded
                    const refundedPayment = await Payment.findOne({
                        where: {
                            related_task_id: task_id,
                            status: { [Op.in]: ['REFUNDED', 'REFUNDED_FULL', 'REFUNDED_KEEP_FEE', 'REFUNDED_WITH_PENALTY'] }
                        },
                        transaction
                    });

                    if (refundedPayment) {
                        throw new AppError('Payment for this task has already been refunded.', 400);
                    }

                    throw new AppError('No payment found for this task.', 404);
                }
            }

            logger.info('Task Action: Payment found', {
                task_id,
                action,
                payment_id: payment.id,
                payment_status: payment.status,
                amount: payment.amount,
                has_stripe_pi: !!payment.stripe_payment_intent_id
            });

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

                // Fire-and-forget: payout funded notification to tasker
                // Amount = task_price - commission (what the tasker actually earns from this task)
                if (process.env.NOTIFICATION_EMAILS_ENABLED !== 'false' && payment.tasker_email) {
                    const { subject, html, text } = payoutPaidEmail({
                        payoutId: payment.id,
                        amount: taskerPendingAmount.toFixed(2),
                        currency: settings.currency,
                        date: new Date().toISOString().split('T')[0],
                        // Added breakdown for clarity (Task Price - Commission - Poster's Service Fee)
                        // Note: Current backend model: Payment.amount includes service_fee. 
                        // Logic: payment.amount = task_price + service_fee.
                        // So task_price = payment.amount - service_fee. 
                        // Payout = task_price - commission.
                        taskPrice: (Number(payment.amount) - Number(payment.service_fee)).toFixed(2),
                        commission: Number(payment.commission).toFixed(2),
                        serviceFee: Number(payment.service_fee).toFixed(2) // We display poster service fee as info, or 0 if "tasker service fee" is meant to be implicit.
                        // Since user asked for "Tasker Service Fee", but only poster fee exists, we show what we have.
                    });
                    emailService.sendHtmlEmail(payment.tasker_email, subject, html, text).catch(e =>
                        logger.error('Notification email failed (tasker, payout)', { error: (e as any).message })
                    );
                }

                return { success: true, status: responseStatus, message: responseMessage };

            } else if (action === 'CANCEL') {
                // CANCEL: Partial refund (keep service fee), tasker not affected
                // Refund = payment.amount - service_fee
                // Service fee is NOT refunded (company keeps it)
                // Tasker balance is NOT affected

                const refundAmount = Number(payment.amount) - Number(payment.service_fee);
                const feePart = Number(payment.service_fee);

                logger.info('CANCEL: Processing', {
                    task_id,
                    payment_id: payment.id,
                    payment_status: payment.status,
                    total_amount: payment.amount,
                    refund_amount: refundAmount,
                    fee_kept: feePart
                });

                // 1. Stripe Refund (Partial - exclude service fee)
                if (payment.stripe_payment_intent_id) {
                    try {
                        await import('./StripeService').then(m => m.stripeService.createRefund(refundAmount, payment.stripe_payment_intent_id!));
                        logger.info('CANCEL: Stripe refund issued', {
                            task_id,
                            amount: refundAmount,
                            stripe_pi: payment.stripe_payment_intent_id
                        });
                    } catch (stripeErr: any) {
                        logger.error('CANCEL: Stripe refund failed', {
                            task_id,
                            error: stripeErr.message
                        });
                        // Record failed refund for admin retry
                        await recordFailedRefund({
                            payment,
                            task_id,
                            user_id: poster_id,
                            amount: refundAmount,
                            action: 'CANCEL',
                            error: stripeErr
                        });
                        throw new AppError(`Stripe refund failed: ${stripeErr.message}`, 502);
                    }
                } else {
                    logger.warn('CANCEL: No Stripe Payment Intent - internal refund only', { task_id });
                }

                // 2. Reverse balances based on payment state
                // Tasker balance NOT affected
                if (payment.status === 'PENDING') {
                    // Release tasker pending
                    await taskerWallet.decrement('pending_balance', { by: taskerPendingAmount, transaction });
                    // Company: Move from pending to balance (keeps fee)
                    await companyAccount.decrement('pending_balance', { by: companyPendingAmount, transaction });
                    await companyAccount.increment('balance', { by: feePart, transaction });
                    await companyAccount.increment('total_revenue', { by: feePart, transaction });
                } else if (payment.status === 'COMPLETED') {
                    // Reverse tasker available balance
                    await taskerWallet.decrement('available_balance', { by: taskerPendingAmount, transaction });
                    // Company: Deduct commission only (keeps fee)
                    const commissionPart = Number(payment.commission);
                    await companyAccount.decrement('balance', { by: commissionPart, transaction });
                    await companyAccount.decrement('total_revenue', { by: commissionPart, transaction });
                }

                // 3. Update Statuses
                await import('../models/Transaction').then(m => m.Transaction.update(
                    { status: 'CANCELLED' },
                    { where: { reference_id: payment.id }, transaction }
                ));
                payment.status = 'REFUNDED';
                await payment.save({ transaction });

                await transaction.commit();

                logger.info('CANCEL: Complete', { task_id, payment_id: payment.id, refund_amount: refundAmount });

                // Fire-and-forget: refund notification to poster
                if (process.env.NOTIFICATION_EMAILS_ENABLED !== 'false' && payment.poster_email) {
                    // Use cancellationPenaltyPosterEmail for CANCEL (partial refund)
                    const { subject, html, text } = cancellationPenaltyPosterEmail({
                        taskId: task_id,
                        refundAmount: refundAmount.toFixed(2),
                        penaltyDeducted: feePart.toFixed(2), // The service fee is the "penalty" here effectively
                        currency: settings.currency,
                        paymentId: payment.id,
                        date: new Date().toISOString().split('T')[0],
                    });
                    emailService.sendHtmlEmail(payment.poster_email, subject, html, text).catch(e =>
                        logger.error('Notification email failed (poster, cancel refund)', { error: (e as any).message })
                    );
                }

                return { success: true, status: 'CANCELLED', refund_amount: refundAmount, fee_kept: feePart };

            } else if (action === 'CANCEL_FULL') {
                // CANCEL_FULL: Full refund to poster + tasker penalty
                // Refund = payment.amount (full amount)
                // Tasker = deduct commission as negative balance
                // Company = gets commission as income

                const penalty = Number(payment.commission);

                logger.info('CANCEL_FULL: Processing', {
                    task_id,
                    payment_id: payment.id,
                    payment_status: payment.status,
                    refund_amount: payment.amount,
                    penalty_amount: penalty
                });

                // 1. Stripe Refund (Full)
                if (payment.stripe_payment_intent_id) {
                    try {
                        await import('./StripeService').then(m => m.stripeService.createRefund(Number(payment.amount), payment.stripe_payment_intent_id!));
                        logger.info('CANCEL_FULL: Stripe refund issued', {
                            task_id,
                            amount: payment.amount,
                            stripe_pi: payment.stripe_payment_intent_id
                        });
                    } catch (stripeErr: any) {
                        logger.error('CANCEL_FULL: Stripe refund failed', {
                            task_id,
                            error: stripeErr.message
                        });
                        await recordFailedRefund({
                            payment,
                            task_id,
                            user_id: poster_id,
                            amount: Number(payment.amount),
                            action: 'CANCEL_FULL',
                            error: stripeErr
                        });
                        throw new AppError(`Stripe refund failed: ${stripeErr.message}`, 502);
                    }
                } else {
                    logger.warn('CANCEL_FULL: No Stripe Payment Intent - internal refund only', { task_id });
                }

                // 2. Reverse balances based on payment state
                if (payment.status === 'PENDING') {
                    await taskerWallet.decrement('pending_balance', { by: taskerPendingAmount, transaction });
                    await companyAccount.decrement('pending_balance', { by: companyPendingAmount, transaction });
                } else if (payment.status === 'COMPLETED') {
                    await taskerWallet.decrement('available_balance', { by: taskerPendingAmount, transaction });
                    await companyAccount.decrement('balance', { by: companyPendingAmount, transaction });
                    await companyAccount.decrement('total_revenue', { by: companyPendingAmount, transaction });
                }

                // 3. Apply Penalty to Tasker (goes negative if needed)
                await taskerWallet.decrement('available_balance', { by: penalty, transaction });

                // 4. Credit Company (Penalty Income)
                await companyAccount.increment('balance', { by: penalty, transaction });
                await companyAccount.increment('total_revenue', { by: penalty, transaction });

                // 5. Update Statuses
                await import('../models/Transaction').then(m => m.Transaction.update(
                    { status: 'CANCELLED' },
                    { where: { reference_id: payment.id }, transaction }
                ));
                payment.status = 'REFUNDED';
                await payment.save({ transaction });

                await transaction.commit();
                logger.info('CANCEL_FULL: Complete', { task_id, penalty });

                // Fire-and-forget: full refund notification to poster
                if (process.env.NOTIFICATION_EMAILS_ENABLED !== 'false' && payment.poster_email) {
                    const { subject, html, text } = fullRefundPosterEmail({ // Updated function name
                        taskId: task_id,
                        amount: Number(payment.amount).toFixed(2), // Full Amount
                        currency: settings.currency,
                        paymentId: payment.id,
                        date: new Date().toISOString().split('T')[0],
                    });
                    emailService.sendHtmlEmail(payment.poster_email, subject, html, text).catch(e =>
                        logger.error('Notification email failed (poster, cancel_full refund)', { error: (e as any).message })
                    );
                }

                // Fire-and-forget: penalty notification to tasker
                if (process.env.NOTIFICATION_EMAILS_ENABLED !== 'false' && payment.tasker_email) {
                    const { subject, html, text } = fullRefundTaskerEmail({ // Updated to new template
                        taskId: task_id,
                        penaltyAmount: penalty.toFixed(2),
                        currency: settings.currency,
                        paymentId: payment.id,
                        date: new Date().toISOString().split('T')[0],
                    });
                    emailService.sendHtmlEmail(payment.tasker_email, subject, html, text).catch(e =>
                        logger.error('Notification email failed (tasker, cancel_full penalty)', { error: (e as any).message })
                    );
                }

                return { success: true, status: 'CANCELLED_FULL', refund_amount: Number(payment.amount), penalty };

            } else if (action === 'REFUND') {
                // REFUND: Full Stripe refund only
                // Refund = payment.amount (full amount)
                // Tasker = no change
                // Company = no income

                logger.info('REFUND: Processing', {
                    task_id,
                    payment_id: payment.id,
                    payment_status: payment.status,
                    refund_amount: payment.amount
                });

                // 1. Stripe Refund (Full) - REQUIRED
                if (!payment.stripe_payment_intent_id) {
                    throw new AppError('No Stripe Payment Intent found. Cannot process refund.', 400);
                }

                try {
                    await import('./StripeService').then(m => m.stripeService.createRefund(Number(payment.amount), payment.stripe_payment_intent_id!));
                    logger.info('REFUND: Stripe refund issued', {
                        task_id,
                        amount: payment.amount,
                        stripe_pi: payment.stripe_payment_intent_id
                    });
                } catch (stripeErr: any) {
                    logger.error('REFUND: Stripe refund failed', {
                        task_id,
                        error: stripeErr.message
                    });
                    await recordFailedRefund({
                        payment,
                        task_id,
                        user_id: poster_id,
                        amount: Number(payment.amount),
                        action: 'REFUND',
                        error: stripeErr
                    });
                    throw new AppError(`Stripe refund failed: ${stripeErr.message}`, 502);
                }

                // 2. Reverse balances based on payment state
                if (payment.status === 'PENDING') {
                    await taskerWallet.decrement('pending_balance', { by: taskerPendingAmount, transaction });
                    await companyAccount.decrement('pending_balance', { by: companyPendingAmount, transaction });
                } else if (payment.status === 'COMPLETED') {
                    await taskerWallet.decrement('available_balance', { by: taskerPendingAmount, transaction });
                    await companyAccount.decrement('balance', { by: companyPendingAmount, transaction });
                    await companyAccount.decrement('total_revenue', { by: companyPendingAmount, transaction });
                }

                // 3. Update Statuses
                await import('../models/Transaction').then(m => m.Transaction.update(
                    { status: 'REFUNDED' },
                    { where: { reference_id: payment.id }, transaction }
                ));
                payment.status = 'REFUNDED';
                await payment.save({ transaction });

                await transaction.commit();
                logger.info('REFUND: Complete', { task_id, payment_id: payment.id });

                // Fire-and-forget: refund notification to poster
                if (process.env.NOTIFICATION_EMAILS_ENABLED !== 'false' && payment.poster_email) {
                    const { subject, html, text } = fullRefundPosterEmail({ // Updated function name
                        taskId: task_id,
                        amount: Number(payment.amount).toFixed(2),
                        currency: settings.currency,
                        paymentId: payment.id,
                        date: new Date().toISOString().split('T')[0],
                    });
                    emailService.sendHtmlEmail(payment.poster_email, subject, html, text).catch(e =>
                        logger.error('Notification email failed (poster, refund)', { error: (e as any).message })
                    );
                }

                return { success: true, status: 'REFUNDED', refund_amount: Number(payment.amount) };

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
