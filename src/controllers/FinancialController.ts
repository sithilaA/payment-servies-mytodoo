import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { TaskerList } from '../models/TaskerList';
import { PosterList } from '../models/PosterList';
import { TaskFinancialHistory } from '../models/TaskFinancialHistory';
import { Payment } from '../models/Payment';
import { serviceHandler } from '../utils';
import { AppError } from '../utils/AppError';

export class FinancialController {

    /**
     * Get Tasker Financial Summary
     */
    static getTaskerFinancial = serviceHandler(async (req: Request, res: Response) => {
        const { external_user_id } = req.params;

        if (!external_user_id) {
            throw new AppError("Missing external_user_id", 400);
        }

        const tasker = await TaskerList.findOne({ where: { user_id: external_user_id } });

        if (!tasker) {
            return res.json({
                success: true,
                data: {
                    user_id: external_user_id,
                    total_payout: 0,
                    pending_payout: 0,
                    current_balance: 0
                }
            });
        }

        res.json({
            success: true,
            data: {
                user_id: tasker.user_id,
                total_payout: tasker.total_payout,
                pending_payout: tasker.pending_payout,
                current_balance: tasker.current_balance
            }
        });
    });

    /**
     * Get Poster Financial Summary
     */
    static getPosterFinancial = serviceHandler(async (req: Request, res: Response) => {
        const { external_user_id } = req.params;

        if (!external_user_id) {
            throw new AppError("Missing external_user_id", 400);
        }

        const poster = await PosterList.findOne({ where: { user_id: external_user_id } });

        if (!poster) {
            return res.json({
                success: true,
                data: {
                    user_id: external_user_id,
                    total_payment: 0,
                    total_refund: 0,
                    current_balance: 0
                }
            });
        }

        res.json({
            success: true,
            data: {
                user_id: poster.user_id,
                total_payment: poster.total_payment,
                total_refund: poster.total_refund,
                current_balance: poster.current_balance
            }
        });
    });

    /**
     * Get Task Financial History (Paginated)
     */
    static getTaskFinancialHistory = serviceHandler(async (req: Request, res: Response) => {
        const { poster_user_id, tasker_user_id, page = '1', limit = '20' } = req.query;

        const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
        const offset = (pageNum - 1) * limitNum;

        // Build filter
        const where: any = {};
        if (poster_user_id) where.poster_user_id = poster_user_id;
        if (tasker_user_id) where.tasker_user_id = tasker_user_id;

        const { count, rows } = await TaskFinancialHistory.findAndCountAll({
            where,
            order: [['created_at', 'DESC']],
            limit: limitNum,
            offset
        });

        // Enrich each row with amount, service_fee, commission from payments table
        const taskIds = rows.map(r => r.task_id);
        const payments = taskIds.length > 0
            ? await Payment.findAll({
                where: { related_task_id: { [Op.in]: taskIds } },
                attributes: ['related_task_id', 'amount', 'service_fee', 'commission']
            })
            : [];
        const paymentMap = new Map(payments.map(p => [p.related_task_id, p]));

        const enrichedRows = rows.map(row => {
            const plain = row.toJSON();
            const pay = paymentMap.get(plain.task_id);
            return {
                ...plain,
                amount: pay ? Number(pay.amount) : 0,
                service_fee: pay ? Number(pay.service_fee) : 0,
                commission: pay ? Number(pay.commission) : 0
            };
        });

        const totalPages = Math.ceil(count / limitNum);

        res.json({
            success: true,
            data: enrichedRows,
            total_records: count,
            total_pages: totalPages,
            current_page: pageNum
        });
    });
}
