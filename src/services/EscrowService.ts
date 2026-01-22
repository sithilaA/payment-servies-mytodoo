import { sequelize } from '../config/database';
import { Escrow } from '../models/Escrow';
import { walletService } from './WalletService';
import { ledgerService } from './LedgerService';
import { violationAlertService, ViolationType } from './ViolationAlertService';

export class EscrowService {

  async createEscrow(data: {
    payerId: string;
    payeeId: string;
    amount: number;
    taskId?: string;
  }) {
    const { payerId, payeeId, amount, taskId } = data;
    
    if (amount <= 0) throw new Error("Amount must be positive");

    const t = await sequelize.transaction();
    try {
      const payerWallet = await walletService.getOrCreate(payerId, 'Unknown Payer', 'customer', t);
      
      // Check Balance
      if (payerWallet.available_balance < amount) {
          throw new Error("INSUFFICIENT_AVAILABLE_BALANCE");
      }

      // Lock funds: Available -> Escrow
      await payerWallet.decrement('available_balance', { by: amount, transaction: t });
      await payerWallet.increment('escrow_balance', { by: amount, transaction: t });

      // Create Record
      const escrow = await Escrow.create({
        payer_external_id: payerId,
        payee_external_id: payeeId,
        amount,
        status: 'HELD',
        related_task_id: taskId
      }, { transaction: t });

      // Ledger
      await ledgerService.record({
        fromWalletId: payerWallet.id,
        amount,
        currency: payerWallet.currency,
        type: 'ESCROW_LOCK',
        referenceId: escrow.id,
        transaction: t
      });

      await t.commit();
      return escrow;
    } catch (e: any) {
      await t.rollback();
      throw e;
    }
  }

  async releaseEscrow(escrowId: string) {
    const t = await sequelize.transaction();
    try {
      const escrow = await Escrow.findByPk(escrowId, { transaction: t });
      if (!escrow) throw new Error("Escrow not found");
      if (escrow.status !== 'HELD') throw new Error("Escrow not in HELD status");

      const payerWallet = await walletService.findByExternalId(escrow.payer_external_id, t);
      const payeeWallet = await walletService.getOrCreate(escrow.payee_external_id, 'Unknown Payee', 'service_provider', t);

      if (!payerWallet) throw new Error("Payer wallet not found"); // Should not happen

      // Move: Payer(Escrow) -> Payee(Available) - Commission
      const commission = Number(escrow.commission) || 0;
      const netAmount = Number(escrow.amount) - commission;

      await payerWallet.decrement('escrow_balance', { by: escrow.amount, transaction: t });
      await payeeWallet.increment('available_balance', { by: netAmount, transaction: t });

      escrow.status = 'RELEASED';
      await escrow.save({ transaction: t });

      // Record Transfer to Payee
      await ledgerService.record({
        fromWalletId: payerWallet.id,
        toWalletId: payeeWallet.id,
        amount: netAmount,
        currency: payeeWallet.currency,
        type: 'ESCROW_RELEASE',
        referenceId: escrow.id,
        transaction: t
      });

      // Record Commission (Platform Income)
      if (commission > 0) {
        await ledgerService.record({
          fromWalletId: payerWallet.id, // Strictly speaking, it comes from the escrowed funds
          amount: commission,
          currency: payeeWallet.currency,
          type: 'COMMISSION',
          referenceId: escrow.id,
          transaction: t
        });
      }

      await t.commit();
      return escrow;
    } catch (e: any) {
      await t.rollback();
      throw e;
    }
  }

  async refundEscrow(escrowId: string) {
      const t = await sequelize.transaction();
      try {
        const escrow = await Escrow.findByPk(escrowId, { transaction: t });
        if (!escrow) throw new Error("Escrow not found");
        if (escrow.status !== 'HELD') throw new Error("Escrow not in HELD status");
  
        const payerWallet = await walletService.findByExternalId(escrow.payer_external_id, t);
        if (!payerWallet) throw new Error("Payer wallet not found");
  
        // Move: Payer(Escrow) -> Payer(Available)
        await payerWallet.decrement('escrow_balance', { by: escrow.amount, transaction: t });
        await payerWallet.increment('available_balance', { by: escrow.amount, transaction: t });
  
        escrow.status = 'REFUNDED';
        await escrow.save({ transaction: t });
  
        await ledgerService.record({
          toWalletId: payerWallet.id,
          amount: escrow.amount,
          currency: payerWallet.currency,
          type: 'REFUND',
          referenceId: escrow.id,
          transaction: t
        });
  
        await t.commit();
        return escrow;
      } catch (e: any) {
        await t.rollback();
        throw e;
      }
    }
}

export const escrowService = new EscrowService();
