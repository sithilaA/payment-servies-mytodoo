import { Request, Response } from 'express';
import { PaymentService } from '../services/PaymentService';
import { serviceHandler } from '../utils';

export class PaymentController {
  
  /**
   * Endpoint 1: Create Task Payment (Pending Balance)
   */
  static createTaskPayment = serviceHandler(async (req: Request, res: Response) => {
    const { task_price, commission, service_fee, tasker_id, poster_id, task_id } = req.body;
    
    // Basic validation
    if (!task_price || !tasker_id || !poster_id || !task_id) {
         throw new Error("Missing required fields");
    }

    // Call Service
    try {
        const result = await PaymentService.createTaskPayment({
            task_price,
            commission: commission || 0,
            service_fee: service_fee || 0,
            tasker_id,
            poster_id,
            task_id
        });
        res.json(result);
    } catch (e: any) {
        if (e.message.includes("Payment already exists")) {
            res.status(409).json({ error: e.message });
            return;
        }
        throw e; // Pass to global handler
    }
  });

  /**
   * Endpoint 2: Task Action (Complete or Cancel)
   */
  static handleTaskAction = serviceHandler(async (req: Request, res: Response) => {
     const { task_id, poster_id, action } = req.body;
     
     if (!task_id || !poster_id || !action) {
         throw new Error("Missing required fields: task_id, poster_id, action");
     }

     try {
         const result = await PaymentService.handleTaskAction({
             task_id,
             poster_id,
             action
         });
         res.json(result);
     } catch (e: any) {
         if (e.message.includes("Tasker has no linked Stripe Connect account")) {
             res.status(400).json({ 
                 status: "error",
                 code: "MISSING_STRIPE_ACCOUNT",
                 message: e.message 
             });
             return;
         }
         if (e.message.includes("insufficient available funds")) {
             res.status(400).json({
                 status: "error",
                 code: "STRIPE_INSUFFICIENT_FUNDS",
                 message: "Platform Stripe account has insufficient available balance to process this payout. Please trigger a deposit in Stripe Dashboard."
             });
             return;
         }
         throw e;
     }
  });

  // Removed old endpoints (initiate, handleWebhook) as requested.
}
