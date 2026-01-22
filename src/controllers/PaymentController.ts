import { Request, Response } from 'express';
import { PaymentService } from '../services/PaymentService';
import { serviceHandler } from '../utils';
import { AppError } from '../middlewares/errorHandler';

export class PaymentController {
  
  /**
   * Endpoint 1: Create Task Payment (Pending Balance)
   */
  static createTaskPayment = serviceHandler(async (req: Request, res: Response) => {
    const { task_price, commission, service_fee, tasker_id, poster_id, task_id } = req.body;
    
    // Basic validation
    if (!task_price || !tasker_id || !poster_id || !task_id) {
         throw new AppError("Missing required fields", 400);
    }

    // Call Service
    const result = await PaymentService.createTaskPayment({
        task_price,
        commission: commission || 0,
        service_fee: service_fee || 0,
        tasker_id,
        poster_id,
        task_id
    });
    res.json(result);
  });

  /**
   * Endpoint 2: Task Action (Complete or Cancel)
   */
  static handleTaskAction = serviceHandler(async (req: Request, res: Response) => {
     const { task_id, poster_id, action } = req.body;
     
     if (!task_id || !poster_id || !action) {
         throw new AppError("Missing required fields: task_id, poster_id, action", 400);
     }

     const result = await PaymentService.handleTaskAction({
         task_id,
         poster_id,
         action
     });
     res.json(result);
  });
}
