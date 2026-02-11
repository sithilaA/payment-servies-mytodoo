import { sequelize } from '../config/database';
import { Earning } from '../models/Earning';
import { walletService } from './WalletService';
import { ledgerService } from './LedgerService';
import { violationAlertService, ViolationType } from './ViolationAlertService';
import { logger } from '../utils/logger';

export class EarningService {
  async recordEarning(data: {
    external_user_id: string;
    external_username: string; // Passed from main backend for sync
    task_price: number;
    service_fee: number;
    commission_fee: number;
    transaction_ref: string;
  }) {
    const { external_user_id, external_username, task_price, service_fee, commission_fee, transaction_ref } = data;

    // 1. Validation Logic
    const calculatedNet = task_price - service_fee - commission_fee;

    // Safety check (floating point handling might need epsilon, but assuming simplified for now)
    if (calculatedNet < 0) {
      throw new Error("Net earning cannot be negative");
    }

    // Logic: net = price - fees. Verification.
    // If the main backend sends 'net_earning' explicit, we should compare. 
    // Here we compute it to be safe.

    // 2. Transaction
    const t = await sequelize.transaction();

    try {
      // 3. Get Wallet
      const wallet = await walletService.getOrCreate(external_user_id, external_username, 'service_provider', t);

      // 4. Record Earning
      const earning = await Earning.create({
        external_user_id,
        wallet_id: wallet.id,
        task_price,
        service_fee,
        commission_fee,
        net_earning: calculatedNet,
        status: 'PROCESSED',
        transaction_ref
      }, { transaction: t });

      // 5. Update Wallet Balance
      // Atomic increment
      await wallet.increment('available_balance', { by: calculatedNet, transaction: t });

      // 6. Ledger Entry
      await ledgerService.record({
        toWalletId: wallet.id,
        amount: calculatedNet,
        currency: wallet.currency,
        type: 'EARNING',
        status: 'COMPLETED',
        referenceId: transaction_ref,
        transaction: t
      });

      await t.commit();
      return earning;

    } catch (error: any) {
      await t.rollback();
      // Alert?
      logger.error("Earning record failed", { error: error.message, stack: error.stack });
      throw error;
    }
  }
}

export const earningService = new EarningService();
