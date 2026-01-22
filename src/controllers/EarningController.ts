import { Request, Response } from 'express';
import { earningService } from '../services/EarningService';
import { walletService } from '../services/WalletService';

export class EarningController {
  
  static async recordEarning(req: Request, res: Response) {
    try {
      // Input from Main Backend
      const { 
          external_user_id, 
          external_username,
          task_price, 
          service_fee, 
          commission_fee, 
          transaction_ref 
      } = req.body;
        
      if (!external_user_id || !task_price) {
          return res.status(400).json({ error: "Missing required fields" });
      }

      const earning = await earningService.recordEarning({
          external_user_id,
          external_username,
          task_price,
          service_fee,
          commission_fee,
          transaction_ref
      });

      return res.json({ success: true, earning });

    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ error: error.message });
    }
  }

  static async getBalance(req: Request, res: Response) {
      try {
          const { userId } = req.params;
          const wallet = await walletService.getBalance(userId as string);
          if (!wallet) return res.status(404).json({ error: "Wallet not found" });
          return res.json({ 
              available: wallet.available_balance, 
              pending: wallet.pending_balance,
              currency: wallet.currency
          });
      } catch (error) {
          return res.status(500).json({ error: "Internal Error" });
      }
  }
}
