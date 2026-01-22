import { Request, Response } from 'express';
import { PlatformAccount } from '../models/PlatformAccount';
import { Transaction } from '../models/Transaction';
import { serviceHandler } from '../utils';

export class CompanyController {

    /**
     * Get Company Account Stats (Admin Only)
     */
    static getStats = serviceHandler(async (req: Request, res: Response) => {
        // In a real app, middleware would ensure this is admin.
        // For now, we assume the route is protected or we trust it.

        const account = await PlatformAccount.findOne();
        
        if (!account) {
             return res.json({
                 balance: 0,
                 total_revenue: 0,
                 message: "No company account activity yet."
             });
        }

        // Fetch recent transactions for the company
        const transactions = await Transaction.findAll({
            where: { platform_account_id: account.id },
            order: [['created_at', 'DESC']],
            limit: 20
        });

        res.json({
            success: true,
            account: {
                id: account.id,
                balance: account.balance,
                total_revenue: account.total_revenue
            },
            recent_transactions: transactions
        });
    });
}
