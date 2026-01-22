import { Request, Response } from 'express';
import { earningService } from '../services/EarningService';
import { walletService } from '../services/WalletService';
import { serviceHandler } from '../utils';
import { AppError } from '../middlewares/errorHandler';

export class EarningController {
  
  static recordEarning = serviceHandler(async (req: Request, res: Response) => {
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
          throw new AppError("Missing required fields", 400);
      }

      const earning = await earningService.recordEarning({
          external_user_id,
          external_username,
          task_price,
          service_fee,
          commission_fee,
          transaction_ref
      });

      res.json({ success: true, earning });
  });

  static getBalance = serviceHandler(async (req: Request, res: Response) => {
      const { userId } = req.params;
      const wallet = await walletService.getBalance(userId as string);
      
      if (!wallet) throw new AppError("Wallet not found", 404);
      
      res.json({ 
          available: wallet.available_balance, 
          pending: wallet.pending_balance,
          currency: wallet.currency
      });
  });
}
