import { Request, Response } from 'express';
import { walletService } from '../services/WalletService';
import { serviceHandler } from '../utils';
import { AppError } from '../middlewares/errorHandler';

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
      wallet.stripe_account_status = 'ACTIVE'; // Assume active for now
      await wallet.save();

      res.json({ success: true, message: "Payout details updated" });
  });
}
