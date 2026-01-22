import { Payment } from '../models/Payment';
import { Escrow } from '../models/Escrow';
import { Refund } from '../models/Refund';
import { Wallet } from '../models/Wallet';
import { stripeService } from './StripeService';
import { ledgerService } from './LedgerService'; // Assuming we have one, or we use transaction logic directly
import { emailService } from './EmailService';
import { ReceiptService } from './ReceiptService';
import { sequelize } from '../config/database';
import { logger } from '../utils/logger';

export class RefundService {

    // Helper to find Payment and Escrow
    private static async getPaymentAndEscrow(paymentId: string) {
        const payment = await Payment.findByPk(paymentId);
        if (!payment) throw new Error('Payment not found');

        // Find associated escrow using related task ID
        const escrow = await Escrow.findOne({ where: { related_task_id: payment.related_task_id, status: 'HELD' } });
        // Note: If escrow is already released, we can't refund typically, unless it's a dispute after release (Scenario 2 maybe?)
        // For now, assume refund happens while funds are HELD. 
        // If funds are released, we'd need to claw back from Wallet, which is Scenario 2 logic mostly.

        return { payment, escrow };
    }

    /**
     * Scenario 1: Refund Poster, Platform keeps Service Fee.
     */
    static async processStandardRefund(paymentId: string, reason: string) {
        const transaction = await sequelize.transaction();
        try {
            const { payment, escrow } = await this.getPaymentAndEscrow(paymentId);
            
            if (!escrow) { 
                 // If escrow not found/released strategies differ. For now fail if not held.
                 throw new Error('Active Escrow not found. Funds may have been released.');
            }

            // Amount to refund = Payment Amount - Service Fee
            const refundAmount = Number(payment.amount) - Number(payment.service_fee);

            if (refundAmount <= 0) throw new Error('Refund amount invalid');

            // 1. Stripe Refund
            await stripeService.createRefund(refundAmount, payment.stripe_payment_intent_id!);

            // 2. Create Refund Record
            const refund = await Refund.create({
                payment_id: payment.id,
                amount: refundAmount,
                type: 'STANDARD',
                reason,
                status: 'COMPLETED',
                penalty_amount: 0
            }, { transaction });

            // 3. Update Payment Status
            payment.status = 'REFUNDED'; // Or PARTIAL_REFUNDED, but semantics vary. Let's use REFUNDED for clarity.
            await payment.save({ transaction });

            // 4. Close Escrow
            escrow.status = 'REFUNDED';
            await escrow.save({ transaction });

            // 5. Ledger
            await ledgerService.record({
                type: 'REFUND',
                amount: refundAmount,
                currency: payment.currency,
                referenceId: refund.id,
                transaction,
                fromWalletId: undefined, // External
                toWalletId: undefined // External
            });

            await transaction.commit();

            this.sendRefundEmail(refund, payment);

            return refund;
        } catch (error) {
            await transaction.rollback();
            logger.error('Standard Refund Failed', { error, paymentId });
            throw error;
        }
    }

    /**
     * Scenario 2: Refund Poster (User gets task amount), Penalize Tasker.
     * Tasker penalty debt is recorded.
     */
    static async processPenaltyRefund(paymentId: string, penaltyAmount: number, reason: string) {
        const transaction = await sequelize.transaction();
        try {
            const { payment, escrow } = await this.getPaymentAndEscrow(paymentId);

            if (!escrow) throw new Error('Active Escrow not found.');

            // Refund Amount to Poster (Task Price usually)
            const refundAmount = Number(payment.amount) - Number(payment.service_fee);

            // 1. Stripe Refund (Partial)
            await stripeService.createRefund(refundAmount, payment.stripe_payment_intent_id!);

            // 2. Create Refund Record
            const refund = await Refund.create({
                payment_id: payment.id,
                amount: refundAmount,
                type: 'PENALTY',
                reason,
                status: 'COMPLETED',
                penalty_amount: penaltyAmount
            }, { transaction });

            // 3. Penalize Tasker Wallet
            // We need to find the Tasker's wallet.
            const taskerWallet = await Wallet.findOne({ where: { external_user_id: escrow.payee_external_id } });
            
            if (taskerWallet) {
                // Deduct from available balance. It can go negative.
                taskerWallet.available_balance = Number(taskerWallet.available_balance) - penaltyAmount;
                await taskerWallet.save({ transaction });

                // Ledger Entry for Penalty
                await ledgerService.record({
                    type: 'COMMISSION', // or PENALTY
                    amount: penaltyAmount,
                    currency: payment.currency,
                    referenceId: refund.id,
                    transaction,
                    fromWalletId: taskerWallet.id, // Taking from Tasker
                    toWalletId: undefined // To Platform
                });
            } else {
                logger.warn('Tasker wallet not found for penalty', { payeeId: escrow.payee_external_id });
            }

            // 4. Update Statuses
            payment.status = 'REFUNDED';
            await payment.save({ transaction });
            escrow.status = 'REFUNDED';
            await escrow.save({ transaction });

           // 5. Ledger for Refund
           await ledgerService.record({
                type: 'REFUND',
                amount: refundAmount,
                currency: payment.currency,
                referenceId: refund.id,
                transaction,
            });

            await transaction.commit();
            this.sendRefundEmail(refund, payment);

            return refund;

        } catch (error) {
            await transaction.rollback();
            logger.error('Penalty Refund Failed', { error, paymentId });
            throw error;
        }
    }

    /**
     * Scenario 3: Full Refund (incl. fees).
     */
    static async processFullRefund(paymentId: string, reason: string) {
        const transaction = await sequelize.transaction();
        try {
            const { payment, escrow } = await this.getPaymentAndEscrow(paymentId);

            // Refund everything
            const refundAmount = Number(payment.amount);

            // 1. Stripe Refund (Full)
            await stripeService.createRefund(refundAmount, payment.stripe_payment_intent_id!);

            // 2. Create Refund Record
            const refund = await Refund.create({
                payment_id: payment.id,
                amount: refundAmount,
                type: 'FULL',
                reason,
                status: 'COMPLETED',
                penalty_amount: 0
            }, { transaction });

            // 3. Update Statuses
            payment.status = 'REFUNDED';
            await payment.save({ transaction });
            if (escrow) {
                escrow.status = 'REFUNDED';
                await escrow.save({ transaction });
            }

             // 4. Ledger - Reverse Fee? 
             // Ideally we record a negative Fee entry or just a Refund entry that covers it.
             await ledgerService.record({
                type: 'REFUND',
                amount: refundAmount,
                currency: payment.currency,
                referenceId: refund.id,
                transaction,
            });

            await transaction.commit();
            this.sendRefundEmail(refund, payment);

            return refund;

        } catch (error) {
            await transaction.rollback();
            logger.error('Full Refund Failed', { error, paymentId });
            throw error;
        }
    }

    private static async sendRefundEmail(refund: Refund, payment: Payment) {
        try {
            const pdfBuffer = await ReceiptService.generateRefundReceipt(refund, payment);
            // Fetch User Email logic needed (mocked)
            const userEmail = "poster@example.com"; 

            await emailService.sendEmailWithAttachment(
                userEmail,
                `Refund Notification #${refund.id}`,
                `Your refund of $${refund.amount} has been processed.`,
                {
                    filename: `refund-${refund.id}.pdf`,
                    content: pdfBuffer
                }
            );
        } catch (e) {
            logger.warn('Failed to send refund email', { error: e, refundId: refund.id });
        }
    }
}
