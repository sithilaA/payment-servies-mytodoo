import { Transaction } from '../models/Transaction';
import { Wallet } from '../models/Wallet';
import { sequelize } from '../config/database';

export class LedgerService {
  /**
   * Record a transaction in the ledger. 
   * MUST be called within a transaction.
   */
  async record({
    fromWalletId,
    toWalletId,
    platformAccountId,
    amount,
    currency,
    type,
    status = 'COMPLETED',
    referenceId,
    transaction // Sequelize Transaction
  }: {
    fromWalletId?: string;
    toWalletId?: string;
    platformAccountId?: string;
    amount: number;
    currency: string;
    type: string;
    status?: string;
    referenceId?: string;
    transaction: any;

  }) {
    return Transaction.create({
      from_wallet_id: fromWalletId,
      to_wallet_id: toWalletId,
      platform_account_id: platformAccountId,
      amount,
      currency,
      type,
      status,
      reference_id: referenceId
    }, { transaction });
  }
}

export const ledgerService = new LedgerService();
