import { sequelize } from '../config/database';
import { Payout } from '../models/Payout';
import { walletService } from './WalletService';
import { ledgerService } from './LedgerService';
import { stripeService } from './StripeService';
import { violationAlertService, ViolationType } from './ViolationAlertService';
import { Transaction } from 'sequelize';
import { ReceiptService } from './ReceiptService';
import { emailService } from './EmailService';

export class PayoutService {
  
  /**
   * Request a payout for a user.
   */
  async requestPayout(data: {
    externalUserId: string;
    amount: number;
    method?: 'BANK' | 'CARD';
  }) {
    const { externalUserId, amount, method = 'BANK' } = data;

    // 1. Basic Input Validation
    if (amount <= 0) {
      throw new Error("Payout amount must be positive");
    }

    const t = await sequelize.transaction({
      isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE // Highest safety
    });

    try {
      // 2. Get Wallet with Lock
      const wallet = await walletService.findByExternalId(externalUserId, t);
      
      if (!wallet) {
        throw new Error("Wallet not found");
      }

      // 3. Validation Rules
      
      // Rule: available_balance >= payout_amount
      if (wallet.available_balance < amount) {
        // Violation Alert? Yes, if they tried to request more than they have.
        violationAlertService.sendAlert(ViolationType.PAYOUT_EXCEEDS_BALANCE, {
            externalUserId,
            walletId: wallet.id,
            amount,
            availableBalance: wallet.available_balance,
            endpoint: 'requestPayout'
        });
        throw new Error("INSUFFICIENT_AVAILABLE_BALANCE");
      }

      // Rule: Stripe Account Readiness
      if (!wallet.stripe_account_id || wallet.stripe_account_status !== 'ACTIVE') {
         throw new Error("Stripe account not connected or active");
      }

      // 4. Update Balances (Atomic)
      // Deduct from Available, Add to Pending
      await wallet.decrement('available_balance', { by: amount, transaction: t });
      await wallet.increment('pending_balance', { by: amount, transaction: t });

      // Double check for negative balance
      const reloadedWallet = await wallet.reload({ transaction: t });
      if (reloadedWallet.available_balance < 0) {
          // This should be caught by DB constraint or previous check, but extra safety
          await t.rollback();
          violationAlertService.sendAlert(ViolationType.NEGATIVE_BALANCE_ATTEMPT, {
              externalUserId,
              walletId: wallet.id,
              amount,
              availableBalance: reloadedWallet.available_balance
          });
          throw new Error("CRITICAL_BALANCE_ERROR");
      }

      // 5. Create Payout Record
      const payout = await Payout.create({
        external_user_id: externalUserId,
        wallet_id: wallet.id,
        amount,
        method,
        status: 'PROCESSING'
      }, { transaction: t });

      // 6. Ledger Entry (Pending Payout)
      await ledgerService.record({
        fromWalletId: wallet.id,
        amount,
        currency: wallet.currency,
        type: 'PAYOUT',
        status: 'PENDING',
        referenceId: payout.id, // Internal Ref
        transaction: t
      });

      // Commit DB changes before calling Stripe to avoid "Stripe Charged but DB Failed"
      // However, if Stripe fails, we need to revert.
      // Better: Commit DB 'PROCESSING', then Call Stripe. If Stripe fails, fail Payout.
      await t.commit();

      
      // 7. Stripe Interaction (Async)
      try {
          // Transfer to Connected Account
          const transfer = await stripeService.createTransfer({
              amount,
              currency: wallet.currency,
              destinationAccountId: wallet.stripe_account_id,
              transferGroup: payout.id
          });

          // Payout to Bank (Optional - Stripe Connect can be auto)
          // For this impl, assuming Instant Payout or manual trigger
          const stripePayout = await stripeService.createPayout({
              amount,
              currency: wallet.currency,
              stripeAccountId: wallet.stripe_account_id
          });

          // Update Payout with Stripe ID
          payout.stripe_payout_id = stripePayout.id;
          await payout.save();

      } catch (stripeError: any) {
          console.error("Stripe Payout Failed", stripeError);
          
          // Revert Balance Logic
          // We need a new transaction
          const refundTx = await sequelize.transaction();
          try {
              await wallet.increment('available_balance', { by: amount, transaction: refundTx });
              await wallet.decrement('pending_balance', { by: amount, transaction: refundTx });
              
              payout.status = 'FAILED';
              payout.details = { error: stripeError.message };
              await payout.save({ transaction: refundTx });
              
              await ledgerService.record({
                  toWalletId: wallet.id,
                  amount,
                  currency: wallet.currency,
                  type: 'REFUND', // Or REVERSAL
                  status: 'COMPLETED',
                  referenceId: payout.id,
                  transaction: refundTx
              });

              await refundTx.commit();

              violationAlertService.sendAlert(ViolationType.STRIPE_FAILURE, {
                  externalUserId,
                  walletId: wallet.id,
                  amount,
                  error: stripeError.message
              });

          } catch (revertError) {
              console.error("CRITICAL: Failed to revert failed payout", revertError);
              // This is a catastrophic state requiring manual intervention
          }
          throw new Error("Payout initiation failed via Stripe");
      }

      return payout;

    } catch (error) {
      // If transaction wasn't committed, rollback
      // We can't easily check t.finished in all Sequelize versions, 
      // but if we are here and the error happened BEFORE commit, we should rollback.
      // If it happened in the Stripe block (inner try), we already handled it.
      // However, the inner catch throws a new Error, which lands here.
      // If the error came from inner catch, the transaction `t` was ALREADY committed.
      // We need to know if `t` was committed.
      
      // Since we don't have a variable tracking `isCommitted`, we can rely on asking Sequelize
      // or we can structure the code to not throw from the inner block to the outer block
      // without knowing.
      
      // For now, silencing the t.finished error by casting or just ignoring if explicitly committed.
      // But robust way:
      try {
        await t.rollback();
      } catch (e) {
        // Ignore rollback error if transaction was already committed
      }
      throw error;
    }
  }

  async handleTransferSuccess(stripeTransferId: string) {
       // Logic to finalize if needed
  }
  
  async handlePayoutSuccess(stripePayoutId: string) {
       const payout = await Payout.findOne({ where: { stripe_payout_id: stripePayoutId } });
       if (!payout) return;

       if (payout.status === 'COMPLETED') return;

       const t = await sequelize.transaction();
       try {
           payout.status = 'COMPLETED';
           await payout.save({ transaction: t });

           // Pending balance is already deducted from available. 
           // We just need to remove it from "Pending" logic? 
           // Actually, `pending_balance` usually represents funds *held*.
           // When Payout Complete, the funds leave the system.
           // So we decrement pending_balance.
           
           const wallet = await walletService.findByExternalId(payout.external_user_id, t);
           if (wallet) {
               await wallet.decrement('pending_balance', { by: payout.amount, transaction: t });
           }

           await ledgerService.record({
               fromWalletId: wallet?.id,
               amount: payout.amount,
               currency: 'USD',
               type: 'PAYOUT',
               status: 'COMPLETED',
               referenceId: stripePayoutId,
               transaction: t
           });

           await t.commit();

           // 5. Generate Receipt & Send Email
           try {
             // Retrieve Payout with up-to-date status if needed or reuse object
             const receiptPdf = await ReceiptService.generatePayoutReceipt(payout);
             
             // Placeholder email. In real app, fetch from User Service
             const userEmail = "tasker@example.com"; 

             await emailService.sendEmailWithAttachment(
               userEmail,
               `Payout Receipt #${payout.id}`,
               `Your payout of $${payout.amount} has been processed successfully.`,
               {
                 filename: `payout-${payout.id}.pdf`,
                 content: receiptPdf
               }
             );
           } catch (receiptError) {
             console.error("Failed to generate/send payout receipt:", receiptError);
           }

       } catch (e) {
           await t.rollback();
           console.error("Webhook processing failed", e);
       }
  }

  async handlePayoutFailure(stripePayoutId: string, reason: string) {
       const payout = await Payout.findOne({ where: { stripe_payout_id: stripePayoutId } });
       if (!payout) return;
       
       const t = await sequelize.transaction();
       try {
           payout.status = 'FAILED';
           payout.details = { error: reason };
           await payout.save({ transaction: t });

           const wallet = await walletService.findByExternalId(payout.external_user_id, t);
           if (wallet) {
               // Refund
               await wallet.decrement('pending_balance', { by: payout.amount, transaction: t });
               await wallet.increment('available_balance', { by: payout.amount, transaction: t });
           }
           
           await t.commit();
           
           violationAlertService.sendAlert(ViolationType.STRIPE_FAILURE, {
               externalUserId: payout.external_user_id,
               walletId: wallet?.id,
               amount: payout.amount,
               error: reason
           });

       } catch (e) {
           await t.rollback();
       }
  }
}

export const payoutService = new PayoutService();
