import { Request, Response } from 'express';
import { StripeErrorCode } from '../models/StripeErrorCode';
import { serviceHandler } from '../utils';
import { payoutRetryService } from '../services/PayoutRetryService';
import { AppError } from '../utils/AppError';

export class AdminController {

    /**
     * Add Stripe Error Code to Allowlist
     */
    static addStripeErrorCode = serviceHandler(async (req: Request, res: Response) => {
        const { error_code, description } = req.body;

        if (!error_code) throw new AppError("error_code is required", 400);

        const entry = await StripeErrorCode.create({
            error_code,
            description
        });

        res.json({ success: true, entry });
    });

    /**
     * Manually Trigger Retry for Failed Payouts
     */
    static retryPayouts = serviceHandler(async (req: Request, res: Response) => {
        const results = await payoutRetryService.retryPayouts();
        res.json({ success: true, results });
    });
    /**
     * Get Failed Payouts for Admin Review
     */
    static getReviewPayouts = serviceHandler(async (req: Request, res: Response) => {
        const { FailedRequestAdminReview } = require('../models/FailedRequestAdminReview');
        const payouts = await FailedRequestAdminReview.findAll({
            where: { status: 'ADMIN_REVIEW_REQUIRED' }
        });
        res.json({ success: true, payouts });
    });

    /**
     * Update Failed Payout Details (Admin)
     */
    static updateReviewPayout = serviceHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const { stripe_connect_account_id } = req.body;

        if (!stripe_connect_account_id) throw new AppError("stripe_connect_account_id is required", 400);

        const { FailedRequestAdminReview } = require('../models/FailedRequestAdminReview');
        const request = await FailedRequestAdminReview.findByPk(id);

        if (!request) throw new AppError("Request not found", 404);

        if (request.status !== 'ADMIN_REVIEW_REQUIRED') throw new AppError("Request is not in review status", 400);

        request.stripe_connect_account_id = stripe_connect_account_id;
        await request.save();

        res.json({ success: true, request });
    });

    /**
     * Retry Failed Payout from Admin Review
     */
    static retryReviewPayout = serviceHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const { FailedRequestAdminReview } = require('../models/FailedRequestAdminReview');
        const { stripeService } = require('../services/StripeService');
        const { Wallet } = require('../models/Wallet');
        const { Payout } = require('../models/Payout');
        const { logger } = require('../utils/logger');

        const request = await FailedRequestAdminReview.findByPk(id);
        if (!request) throw new AppError("Request not found", 404);

        if (request.status !== 'ADMIN_REVIEW_REQUIRED') throw new AppError("Request is not in review status", 400);

        // Get wallet for record-keeping (not for balance validation)
        const wallet = await Wallet.findOne({ where: { external_user_id: request.user_id } });
        if (!wallet) throw new AppError("User wallet not found", 404);

        // Log: Admin retry using stored request amount
        // NOTE: No internal wallet balance check - Stripe validates its own platform balance
        logger.info('Admin Retry Payout: Initiating', {
            request_id: id,
            task_id: request.task_id,
            amount: request.amount,
            currency: request.currency,
            stripe_account: request.stripe_connect_account_id,
            internal_wallet_balance: wallet.available_balance,
            note: 'Using stored request.amount, not wallet balance'
        });

        try {
            // Attempt Transfer - Stripe validates its own balance
            const transfer = await stripeService.createTransfer({
                amount: Number(request.amount),
                currency: request.currency,
                destinationAccountId: request.stripe_connect_account_id,
                transferGroup: request.task_id,
                description: `Retry Admin Payout for Task ${request.task_id}`,
                metadata: {
                    task_id: request.task_id,
                    tasker_id: request.user_id,
                    type: 'admin_retry_payout'
                }
            });

            // NOTE: No wallet.decrement - original transaction was rolled back
            // The funds exist in Stripe platform balance, not internal wallet tracking

            // Create Payout Record for audit trail
            await Payout.create({
                external_user_id: request.user_id,
                wallet_id: wallet.id,
                amount: request.amount,
                currency: request.currency,
                method: 'BANK',
                status: 'COMPLETED',
                stripe_payout_id: transfer.id,
                related_task_id: request.task_id,
                details: {
                    destination: request.stripe_connect_account_id,
                    admin_retry: true,
                    original_error: request.error_code
                }
            });

            // Update Request Status
            request.status = 'PROCESSED';
            await request.save();

            logger.info('Admin Retry Payout: Success', {
                request_id: id,
                task_id: request.task_id,
                transfer_id: transfer.id,
                amount: request.amount
            });

            res.json({
                success: true,
                message: "Payout successfully processed",
                transfer_id: transfer.id,
                amount: request.amount
            });

        } catch (error: any) {
            const errorCode = error.raw?.code || error.code || 'UNKNOWN_RETRY_ERROR';
            const errorMessage = error.message || 'Unknown error';

            logger.error('Admin Retry Payout: Failed', {
                request_id: id,
                task_id: request.task_id,
                error_code: errorCode,
                error_message: errorMessage,
                stripe_account: request.stripe_connect_account_id
            });

            request.last_error_message = errorMessage;
            request.error_code = errorCode;
            await request.save();

            // Return exact Stripe error to admin
            res.status(400).json({
                success: false,
                message: "Retry failed",
                error_code: errorCode,
                error: errorMessage
            });
        }
    });
}
