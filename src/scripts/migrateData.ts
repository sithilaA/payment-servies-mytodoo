/**
 * Data Migration Script
 * 
 * Migrates historical data from old tables (payments, transactions, wallets, refunds, payouts)
 * into the new 3-table system (tasker_list, poster_list, task_financial_history).
 * 
 * Usage:
 *   Dry-run (default):  npx ts-node src/scripts/migrateData.ts
 *   Execute:            npx ts-node src/scripts/migrateData.ts --execute
 * 
 * Safe to delete after migration is complete.
 */

import { dbConnect } from '../config/database';
import { Payment } from '../models/Payment';
import { Transaction } from '../models/Transaction';
import { Wallet } from '../models/Wallet';
import { Refund } from '../models/Refund';
import { Payout } from '../models/Payout';
import { TaskerList } from '../models/TaskerList';
import { PosterList } from '../models/PosterList';
import { TaskFinancialHistory } from '../models/TaskFinancialHistory';

const isDryRun = !process.argv.includes('--execute');

interface MigrationStats {
    totalPayments: number;
    historyInserted: number;
    historySkipped: number;
    postersUpserted: number;
    taskersUpserted: number;
    errors: string[];
}

async function migrate() {
    const stats: MigrationStats = {
        totalPayments: 0,
        historyInserted: 0,
        historySkipped: 0,
        postersUpserted: 0,
        taskersUpserted: 0,
        errors: []
    };

    console.log('='.repeat(60));
    console.log(`DATA MIGRATION — ${isDryRun ? '🔍 DRY RUN (no writes)' : '⚡ EXECUTING (writing to DB)'}`);
    console.log('='.repeat(60));

    // 1. Connect to database
    console.log('\n[1/4] Connecting to database...');
    await dbConnect();
    console.log('  ✅ Connected');

    // 2. Fetch all payments with a related_task_id
    console.log('\n[2/4] Fetching payments with related_task_id...');
    const payments = await Payment.findAll({
        where: {
            related_task_id: { [require('sequelize').Op.ne]: null }
        },
        order: [['created_at', 'ASC']]
    });
    stats.totalPayments = payments.length;
    console.log(`  Found ${payments.length} payments with task references`);

    if (payments.length === 0) {
        console.log('\n  ⚠️  No payments found to migrate. Exiting.');
        process.exit(0);
    }

    // 3. Process each payment → task_financial_history
    console.log('\n[3/4] Processing payments → task_financial_history...');

    // Accumulators for poster and tasker aggregation
    const posterTotals: Record<string, { total_payment: number; total_refund: number }> = {};
    const taskerTotals: Record<string, { total_payout: number; pending_payout: number }> = {};

    for (const payment of payments) {
        const taskId = payment.related_task_id!;
        const posterUserId = payment.user_id; // External poster ID
        const paymentAmount = Number(payment.amount);
        const serviceFee = Number(payment.service_fee);
        const commission = Number(payment.commission || 0);
        const taskPrice = paymentAmount - serviceFee;
        const taskerPendingAmount = taskPrice - commission;

        try {
            // Resolve tasker via Transaction (EARNING_PENDING) → Wallet
            // This is the same strategy used in PaymentService.handleTaskAction
            let taskerUserId = 'UNKNOWN';
            const earningTx = await Transaction.findOne({
                where: { reference_id: payment.id, type: 'EARNING_PENDING' }
            });

            if (earningTx?.to_wallet_id) {
                const taskerWallet = await Wallet.findByPk(earningTx.to_wallet_id);
                if (taskerWallet) {
                    taskerUserId = taskerWallet.external_user_id;
                }
            }

            if (taskerUserId === 'UNKNOWN') {
                stats.errors.push(`Task ${taskId}: Could not resolve tasker_user_id`);
            }

            // Determine status and amounts from payment status + refund
            let status: string = 'complete';
            let penaltyOwner: string = 'none';
            let penaltyAmount = 0;
            let refundAmount = 0;
            let payoutAmount = 0;

            const refund = await Refund.findOne({ where: { payment_id: payment.id } });
            const payout = await Payout.findOne({ where: { related_task_id: taskId } });

            switch (payment.status) {
                case 'COMPLETED':
                    status = 'payout_complete';
                    payoutAmount = payout ? Number(payout.amount) : taskerPendingAmount;
                    break;

                case 'PENDING':
                    status = 'complete';
                    break;

                case 'REFUNDED':
                case 'REFUNDED_FULL':
                    status = 'refund';
                    refundAmount = refund ? Number(refund.amount) : paymentAmount;
                    break;

                case 'REFUNDED_KEEP_FEE':
                    status = 'refund';
                    refundAmount = refund ? Number(refund.amount) : (paymentAmount - serviceFee);
                    break;

                case 'REFUNDED_WITH_PENALTY':
                    status = 'refund_with_penalty';
                    refundAmount = refund ? Number(refund.amount) : paymentAmount;
                    penaltyAmount = refund ? Number(refund.penalty_amount) : 0;
                    penaltyOwner = 'tasker';
                    break;

                case 'FAILED':
                    // Skip failed payments — no financial record needed
                    stats.historySkipped++;
                    console.log(`  ⏭️  Task ${taskId}: FAILED payment — skipped`);
                    continue;

                default:
                    stats.errors.push(`Task ${taskId}: Unknown payment status '${payment.status}'`);
                    stats.historySkipped++;
                    continue;
            }

            // Accumulate poster totals
            if (!posterTotals[posterUserId]) {
                posterTotals[posterUserId] = { total_payment: 0, total_refund: 0 };
            }
            posterTotals[posterUserId].total_payment += paymentAmount;
            posterTotals[posterUserId].total_refund += refundAmount;

            // Accumulate tasker totals
            if (taskerUserId !== 'UNKNOWN') {
                if (!taskerTotals[taskerUserId]) {
                    taskerTotals[taskerUserId] = { total_payout: 0, pending_payout: 0 };
                }
                if (status === 'payout_complete') {
                    taskerTotals[taskerUserId].total_payout += payoutAmount;
                } else if (status === 'complete') {
                    taskerTotals[taskerUserId].pending_payout += taskerPendingAmount;
                }
                // For refund/refund_with_penalty: tasker gets nothing, so no accumulation
            }

            // Check if task_financial_history already exists
            const existing = await TaskFinancialHistory.findOne({ where: { task_id: taskId } });
            if (existing) {
                stats.historySkipped++;
                console.log(`  ⏭️  Task ${taskId}: Already exists — skipped`);
                continue;
            }

            console.log(`  📝 Task ${taskId}: poster=${posterUserId}, tasker=${taskerUserId}, status=${status}, task_price=${taskPrice}, refund=${refundAmount}, penalty=${penaltyAmount}, payout=${payoutAmount}`);

            if (!isDryRun) {
                await TaskFinancialHistory.create({
                    task_id: taskId,
                    poster_user_id: posterUserId,
                    tasker_user_id: taskerUserId,
                    task_price: taskPrice,
                    status,
                    penalty_owner: penaltyOwner,
                    penalty_amount: penaltyAmount,
                    refund_amount: refundAmount,
                    payout_amount: payoutAmount
                });
            }

            stats.historyInserted++;
        } catch (err: any) {
            stats.errors.push(`Task ${taskId}: ${err.message}`);
            console.error(`  ❌ Task ${taskId}: ${err.message}`);
        }
    }

    // 4. Upsert poster_list and tasker_list from aggregated data
    console.log('\n[4/4] Upserting poster_list and tasker_list...');

    // Poster list
    for (const [userId, totals] of Object.entries(posterTotals)) {
        const currentBalance = totals.total_payment - totals.total_refund;
        console.log(`  👤 Poster ${userId}: total_payment=${totals.total_payment.toFixed(4)}, total_refund=${totals.total_refund.toFixed(4)}, balance=${currentBalance.toFixed(4)}`);

        if (!isDryRun) {
            const [poster, created] = await PosterList.findOrCreate({
                where: { user_id: userId },
                defaults: {
                    user_id: userId,
                    total_payment: totals.total_payment,
                    total_refund: totals.total_refund,
                    current_balance: currentBalance,
                    last_updated_at: new Date()
                }
            });

            if (!created) {
                poster.total_payment = totals.total_payment;
                poster.total_refund = totals.total_refund;
                poster.current_balance = currentBalance;
                poster.last_updated_at = new Date();
                await poster.save();
            }
        }
        stats.postersUpserted++;
    }

    // Tasker list
    for (const [userId, totals] of Object.entries(taskerTotals)) {
        console.log(`  🔧 Tasker ${userId}: total_payout=${totals.total_payout.toFixed(4)}, pending_payout=${totals.pending_payout.toFixed(4)}, balance=${totals.total_payout.toFixed(4)}`);

        if (!isDryRun) {
            const [tasker, created] = await TaskerList.findOrCreate({
                where: { user_id: userId },
                defaults: {
                    user_id: userId,
                    total_payout: totals.total_payout,
                    pending_payout: totals.pending_payout,
                    current_balance: totals.total_payout,
                    last_updated_at: new Date()
                }
            });

            if (!created) {
                tasker.total_payout = totals.total_payout;
                tasker.pending_payout = totals.pending_payout;
                tasker.current_balance = totals.total_payout;
                tasker.last_updated_at = new Date();
                await tasker.save();
            }
        }
        stats.taskersUpserted++;
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`  Mode:               ${isDryRun ? 'DRY RUN' : 'EXECUTED'}`);
    console.log(`  Total payments:     ${stats.totalPayments}`);
    console.log(`  History inserted:   ${stats.historyInserted}`);
    console.log(`  History skipped:    ${stats.historySkipped}`);
    console.log(`  Posters upserted:   ${stats.postersUpserted}`);
    console.log(`  Taskers upserted:   ${stats.taskersUpserted}`);
    console.log(`  Errors:             ${stats.errors.length}`);

    if (stats.errors.length > 0) {
        console.log('\n⚠️  ERRORS:');
        stats.errors.forEach(e => console.log(`    - ${e}`));
    }

    if (isDryRun) {
        console.log('\n💡 This was a DRY RUN. To execute, run:');
        console.log('   npx ts-node src/scripts/migrateData.ts --execute');
    }

    console.log('');
    process.exit(0);
}

migrate().catch(err => {
    console.error('\n💥 Migration failed:', err);
    process.exit(1);
});
