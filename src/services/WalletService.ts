import { Wallet } from '../models/Wallet';
import { Transaction } from 'sequelize';
import { settings } from '../config/settings';

export class WalletService {
  
  /**
   * Get or create a wallet for an external user.
   */
  async getOrCreate(externalUserId: string, externalUsername: string, role: string = 'customer', transaction?: Transaction): Promise<Wallet> {
    
    const existing = await Wallet.findOne({
       where: { external_user_id: externalUserId }, 
       transaction 
    });

    if (existing) {
        // Optional: Update username if changed
        if (existing.external_username !== externalUsername) {
            existing.external_username = externalUsername;
            await existing.save({ transaction });
        }
        return existing;
    }

    return Wallet.create({
      external_user_id: externalUserId,
      external_username: externalUsername,
      role: role,
      currency: settings.currency,
      available_balance: 0,
      pending_balance: 0,
      escrow_balance: 0
    }, { transaction });
  }

  async getBalance(externalUserId: string) {
    return Wallet.findOne({ where: { external_user_id: externalUserId } });
  }

  async findByExternalId(externalUserId: string, transaction?: Transaction) {
    return Wallet.findOne({ where: { external_user_id: externalUserId }, transaction });
  }
}

export const walletService = new WalletService();
