import { Router } from 'express';
import { PaymentController } from '../controllers/PaymentController';
import { CompanyController } from '../controllers/CompanyController';
import { UserController } from '../controllers/UserController';

const router = Router();

// --- Core Payment Flow (Revised) ---

/**
 * @swagger
 * /users/payout-details:
 *   post:
 *     summary: Update Payout Details
 *     description: Saves or updates the Stripe Connect Account ID for a user.
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id, stripe_connect_account_id]
 *             properties:
 *               user_id: { type: string }
 *               stripe_connect_account_id: { type: string }
 *     responses:
 *       200: { description: Updated successfully }
 */
router.post('/users/payout-details', UserController.updatePayoutDetails);

/**
 * @swagger
 * /payments/create:
 *   post:
 *     summary: Create Task Payment (Pending)
 *     description: |
 *       Initializes payment for a task. 
 *       Calculates amounts and holds them as PENDING balances for Tasker and Company.
 *       No funds are released yet.
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [task_price, tasker_id, poster_id, task_id]
 *             properties:
 *               task_price:
 *                 type: number
 *                 description: The base price of the task.
 *               service_fee:
 *                 type: number
 *                 description: Additional fee for the platform (Poster pays).
 *               commission:
 *                 type: number
 *                 description: Commission deducted from Tasker.
 *               tasker_id:
 *                 type: string
 *               poster_id:
 *                 type: string
 *               task_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Funds held successfully.
 *       409:
 *         description: Payment already exists for this task.
 */
router.post('/payments/create', PaymentController.createTaskPayment);

/**
 * @swagger
 * /payments/action:
 *   post:
 *     summary: Task Action (Complete / Cancel / Refund)
 *     description: |
 *       Handles the final movement of funds.
 *       COMPLETE: Releases pending funds to Tasker (triggers Stripe Payout) and Company. 
 *       CANCEL / REFUND_FULL: Reverses pending funds (Full Refund).
 *       REFUND_KEEP_FEE: Task Amount Refunded, Fee Kept.
 *       REFUND_WITH_PENALTY: Full Refund, Tasker fined (Negative Balance).
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [task_id, poster_id, action]
 *             properties:
 *               task_id:
 *                 type: string
 *               poster_id:
 *                 type: string
 *               action:
 *                 type: string
 *                 enum: [COMPLETE, CANCEL, REFUND_KEEP_FEE, REFUND_WITH_PENALTY, REFUND_FULL]
 *     responses:
 *       200:
 *         description: Action processed successfully.
 *       400:
 *         description: Tasker missing Stripe Connect Account (Funds not released).
 */
router.post('/payments/action', PaymentController.handleTaskAction);

// --- Admin ---
import { AdminController } from '../controllers/AdminController';

/**
 * @swagger
 * /admin/stripe-errors:
 *   post:
 *     summary: Add Stripe Error Code (Manual)
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [error_code]
 *             properties:
 *               error_code: { type: string }
 *               description: { type: string }
 *     responses:
 *       200: { description: Added }
 */
router.post('/admin/stripe-errors', AdminController.addStripeErrorCode);

/**
 * @swagger
 * /admin/payouts/retry:
 *   post:
 *     summary: Retry Failed Payouts
 *     tags: [Admin]
 *     responses:
 *       200: 
 *         description: Retry processed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: object
 *                   properties:
 *                     success: { type: number }
 *                     failed: { type: number }
 */
router.post('/admin/payouts/retry', AdminController.retryPayouts);

/**
 * @swagger
 * /admin/company-account:
 *   get:
 *     summary: View Company Account (Admin Only)
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Company details
 */
router.get('/admin/company-account', CompanyController.getStats);

// --- Disabled/Removed Endpoints ---
// - /earnings
// - /payouts
// - /escrow
// - /refunds 
// These are removed from the router as per redesign instructions.

export default router;
