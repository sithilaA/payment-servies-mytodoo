import { Request, Response } from 'express';
import { payoutService } from '../services/PayoutService';
import { walletService } from '../services/WalletService';
import { stripeService } from '../services/StripeService';

export class PayoutController {
  
  static async requestPayout(req: Request, res: Response) {
    try {
      const { external_user_id, amount } = req.body;
      
      const payout = await payoutService.requestPayout({
          externalUserId: external_user_id,
          amount
      });

      return res.json({ success: true, payout });
    } catch (error: any) {
      console.error(error);
      const status = error.message.includes('INSUFFICIENT') ? 400 : 500;
      return res.status(status).json({ error: error.message });
    }
  }

  static async stripeWebhook(req: Request, res: Response) {
      const sig = req.headers['stripe-signature'];
      // Verification logic omitted for brevity but CRITICAL for storage. 
      // Middleware usually handles raw body parsing.
      
      const event = req.body; // Assuming parsed for now, but in prod use stripe.webhooks.constructEvent

      try {
          if (event.type === 'payout.paid') {
              const payoutId = event.data.object.id;
              await payoutService.handlePayoutSuccess(payoutId);
          } else if (event.type === 'payout.failed') {
              const payoutId = event.data.object.id;
              const failureCode = event.data.object.failure_code;
              await payoutService.handlePayoutFailure(payoutId, failureCode);
          }
          res.json({ received: true });
      } catch (error) {
          res.status(400).send(`Webhook Error`);
      }
  }
  
  static async updateStripeAccount(req: Request, res: Response) {
      const { external_user_id, stripe_account_id } = req.body;
      // Simple update logic
      // Ideally verify ownership
      const wallet = await walletService.getOrCreate(external_user_id, external_user_id); // using ID as dummy username
      wallet.stripe_account_id = stripe_account_id;
      wallet.stripe_account_status = 'ACTIVE'; // Assume active for demo
      await wallet.save();
      res.json({ success: true });
  }
}
