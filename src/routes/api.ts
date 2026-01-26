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
 *       
 *       **Note:** Pass `payment_intent` to enable Stripe refunds later.
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
 *                 description: The base price of the task
 *                 example: 100
 *               service_fee:
 *                 type: number
 *                 description: Additional fee for the platform (Poster pays)
 *                 example: 10
 *               commission:
 *                 type: number
 *                 description: Commission deducted from Tasker
 *                 example: 15
 *               tasker_id:
 *                 type: string
 *                 description: User ID of the tasker
 *                 example: "USR-002"
 *               poster_id:
 *                 type: string
 *                 description: User ID of the poster
 *                 example: "USR-001"
 *               task_id:
 *                 type: string
 *                 description: Unique task identifier
 *                 example: "TSK-001"
 *               payment_intent:
 *                 type: string
 *                 description: Stripe Payment Intent ID (required for refunds)
 *                 example: "pi_3xyz"
 *           example:
 *             task_id: "TSK-001"
 *             tasker_id: "USR-002"
 *             poster_id: "USR-001"
 *             task_price: 100
 *             service_fee: 10
 *             commission: 15
 *             payment_intent: "pi_3xyz"
 *     responses:
 *       200:
 *         description: Funds held successfully
 *       409:
 *         description: Payment already exists for this task
 */
router.post('/payments/create', PaymentController.createTaskPayment);

/**
 * @swagger
 * /payments/action:
 *   post:
 *     summary: Task Action (Complete / Cancel / Refund)
 *     description: |
 *       Handles the final movement of funds for a task.
 *       
 *       **Actions:**
 *       - `COMPLETE`: Releases pending funds to Tasker via Stripe Connect payout. Company receives commission + service fee.
 *       - `CANCEL`: Partial refund (amount - service_fee). Company keeps service fee. Tasker not affected.
 *       - `CANCEL_FULL`: Full refund to poster. Tasker gets commission as negative balance (penalty). Company gets commission.
 *       - `REFUND`: Full Stripe refund. Requires payment_intent. No fees kept.
 *       
 *       **Note:** All actions work on both PENDING and COMPLETED payments.
 *       If the payment is already refunded, returns 400 error.
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
 *                 description: Unique identifier of the task
 *                 example: "TSK-001"
 *               poster_id:
 *                 type: string
 *                 description: User ID of the task poster
 *                 example: "USR-001"
 *               action:
 *                 type: string
 *                 description: |
 *                   Action to perform on the task payment:
 *                   - `COMPLETE`: Release funds to tasker
 *                   - `CANCEL`: Partial refund (keep service fee)
 *                   - `CANCEL_FULL`: Full refund + tasker penalty
 *                   - `REFUND`: Full Stripe refund
 *                 enum: [COMPLETE, CANCEL, CANCEL_FULL, REFUND]
 *                 example: "COMPLETE"
 *           examples:
 *             complete:
 *               summary: Complete task
 *               value:
 *                 task_id: "TSK-001"
 *                 poster_id: "USR-001"
 *                 action: "COMPLETE"
 *             cancel:
 *               summary: Cancel (keep fee)
 *               value:
 *                 task_id: "TSK-001"
 *                 poster_id: "USR-001"
 *                 action: "CANCEL"
 *             cancel_full:
 *               summary: Cancel full (with penalty)
 *               value:
 *                 task_id: "TSK-001"
 *                 poster_id: "USR-001"
 *                 action: "CANCEL_FULL"
 *             refund:
 *               summary: Full Stripe refund
 *               value:
 *                 task_id: "TSK-001"
 *                 poster_id: "USR-001"
 *                 action: "REFUND"
 *     responses:
 *       200:
 *         description: Action processed successfully
 *         content:
 *           application/json:
 *             examples:
 *               completed:
 *                 value:
 *                   success: true
 *                   status: "COMPLETED"
 *                   message: "Task completed, funds released to Stripe Connect account."
 *               cancelled:
 *                 value:
 *                   success: true
 *                   status: "CANCELLED"
 *                   refund_amount: 90
 *                   fee_kept: 10
 *               refunded:
 *                 value:
 *                   success: true
 *                   status: "REFUNDED"
 *                   refund_amount: 100
 *       400:
 *         description: |
 *           - Payment already refunded
 *           - Invalid action
 *           - No Stripe Payment Intent found (for REFUND)
 *       404:
 *         description: No payment found for this task
 *       502:
 *         description: Stripe operation failed
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

// --- Admin Review Endpoints ---

/**
 * @swagger
 * /admin/payouts/review:
 *   get:
 *     summary: Get Failed Payouts for Admin Review
 *     description: Returns all failed payout requests that require admin intervention (unknown error codes).
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: List of payouts requiring review
 */
router.get('/admin/payouts/review', AdminController.getReviewPayouts);

/**
 * @swagger
 * /admin/payouts/review/{id}:
 *   put:
 *     summary: Update Failed Payout Details (Admin)
 *     description: Allows admin to update ONLY the stripe_connect_account_id field.
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [stripe_connect_account_id]
 *             properties:
 *               stripe_connect_account_id: { type: string }
 *     responses:
 *       200: { description: Updated successfully }
 *       404: { description: Request not found }
 */
router.put('/admin/payouts/review/:id', AdminController.updateReviewPayout);

/**
 * @swagger
 * /admin/payouts/review/{id}/retry:
 *   post:
 *     summary: Retry Failed Payout from Admin Review
 *     description: Manually execute the payout after admin has reviewed and potentially updated the stripe_account_id.
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200: { description: Payout processed successfully }
 *       400: { description: Retry failed }
 *       404: { description: Request not found }
 */
router.post('/admin/payouts/review/:id/retry', AdminController.retryReviewPayout);

/**
 * @swagger
 * /admin/refunds/failed:
 *   get:
 *     summary: Get Failed Refund Requests
 *     description: List all failed refund requests for admin review. Filter by status.
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, RETRYING, SUCCESS, FAILED]
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: List of failed refunds
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 count: { type: number }
 *                 refunds:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       payment_id: { type: string }
 *                       task_id: { type: string }
 *                       user_id: { type: string }
 *                       amount: { type: number }
 *                       action: { type: string }
 *                       error_code: { type: string }
 *                       error_message: { type: string }
 *                       status: { type: string }
 *                       retry_count: { type: number }
 */
router.get('/admin/refunds/failed', AdminController.getFailedRefunds);

/**
 * @swagger
 * /admin/refunds/failed/{id}/retry:
 *   post:
 *     summary: Retry a Failed Refund
 *     description: Manually retry a failed Stripe refund.
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Failed refund request ID
 *     responses:
 *       200:
 *         description: Refund processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string }
 *                 refund_id: { type: string }
 *                 amount: { type: number }
 *       400:
 *         description: Retry failed
 *       404:
 *         description: Refund request not found
 */
router.post('/admin/refunds/failed/:id/retry', AdminController.retryFailedRefund);

export default router;
