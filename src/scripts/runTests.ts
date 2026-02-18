/**
 * Integration Test Script
 * 
 * Tests all core API endpoints with TEST_E2E_ prefixed data.
 * Cleans up all test data after completion.
 * 
 * Prerequisites: Server must be running (npm run dev)
 * 
 * Usage:
 *   npx ts-node src/scripts/runTests.ts
 *   npx ts-node src/scripts/runTests.ts --port 4000
 * 
 * Safe to delete after testing.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { dbConnect } from '../config/database';
import { sequelize } from '../config/database';

// ─── Config ───────────────────────────────────────────────────────────
const PORT = process.argv.includes('--port')
    ? process.argv[process.argv.indexOf('--port') + 1]
    : '3000';
const BASE_URL = `http://localhost:${PORT}`;
const API_PREFIX = '/api/v1'; // Routes are mounted at /api/v1 in app.ts
const PREFIX = 'TEST_E2E_';

// Test data constants
const POSTER_ID = `${PREFIX}POSTER_001`;
const TASKER_ID = `${PREFIX}TASKER_001`;
const TASK_COMPLETE = `${PREFIX}TASK_001`;
const TASK_CANCEL = `${PREFIX}TASK_002`;
const TASK_CANCEL_FULL = `${PREFIX}TASK_003`;
const TASK_PRICE = 100;
const SERVICE_FEE = 10;
const COMMISSION = 15;
const TOTAL_AMOUNT = TASK_PRICE + SERVICE_FEE; // 110
const TASKER_EARNING = TASK_PRICE - COMMISSION; // 85

// ─── Test Result Tracking ─────────────────────────────────────────────
interface TestResult {
    name: string;
    passed: boolean;
    message: string;
    duration: number;
    response: { status: number; data: any } | null;
}

const results: TestResult[] = [];
let testNumber = 0;

// ─── HTTP Helper ──────────────────────────────────────────────────────
function httpRequest(method: string, urlPath: string, body?: any): Promise<{ status: number; data: any }> {
    return new Promise((resolve, reject) => {
        const url = new URL(urlPath, BASE_URL);
        const options: http.RequestOptions = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method,
            headers: { 'Content-Type': 'application/json' }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode || 0, data: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode || 0, data });
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

// ─── Test Runner ──────────────────────────────────────────────────────
let lastResponse: { status: number; data: any } | null = null;

async function test(name: string, fn: () => Promise<void>) {
    testNumber++;
    lastResponse = null; // Reset before each test
    const label = `[${String(testNumber).padStart(2, '0')}] ${name}`;
    const start = Date.now();
    try {
        await fn();
        const duration = Date.now() - start;
        results.push({ name: label, passed: true, message: 'OK', duration, response: null });
        console.log(`  ✅ ${label} (${duration}ms)`);
    } catch (err: any) {
        const duration = Date.now() - start;
        const capturedResponse = lastResponse as { status: number; data: any } | null;
        const responseInfo = capturedResponse
            ? `\n     📡 Response [${capturedResponse.status}]: ${JSON.stringify(capturedResponse.data)}`
            : '';
        results.push({
            name: label,
            passed: false,
            message: err.message,
            duration,
            response: lastResponse
        });
        console.log(`  ❌ ${label}: ${err.message} (${duration}ms)${responseInfo}`);
    }
}

function setResponse(res: { status: number; data: any }) {
    lastResponse = res;
}

function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(message);
}

// ─── Test Cases ───────────────────────────────────────────────────────

async function runAllTests() {
    console.log('='.repeat(65));
    console.log('  INTEGRATION TEST SUITE — Payment Service');
    console.log('='.repeat(65));
    console.log(`  Target: ${BASE_URL}`);
    console.log(`  Prefix: ${PREFIX}`);
    console.log('');

    // ── 1. Health Check ──────────────────────────────────────────────
    console.log('\n── Health Check ──');

    await test('API is reachable (GET /health)', async () => {
        const res = await httpRequest('GET', '/health');
        setResponse(res);
        assert(res.status === 200, `Expected 200, got ${res.status}`);
    });

    // ── 2. Create Payments ───────────────────────────────────────────
    console.log('\n── Payment Creation ──');

    await test(`Create payment for COMPLETE flow (${TASK_COMPLETE})`, async () => {
        const res = await httpRequest('POST', `${API_PREFIX}/payments/create`, {
            task_price: TASK_PRICE,
            service_fee: SERVICE_FEE,
            commission: COMMISSION,
            tasker_id: TASKER_ID,
            poster_id: POSTER_ID,
            task_id: TASK_COMPLETE
        });
        setResponse(res);
        assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
        assert(res.data.paymentId, 'Expected paymentId in response');
    });

    await test(`Create payment for CANCEL flow (${TASK_CANCEL})`, async () => {
        const res = await httpRequest('POST', `${API_PREFIX}/payments/create`, {
            task_price: TASK_PRICE,
            service_fee: SERVICE_FEE,
            commission: COMMISSION,
            tasker_id: TASKER_ID,
            poster_id: POSTER_ID,
            task_id: TASK_CANCEL
        });
        setResponse(res);
        assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
    });

    await test(`Create payment for CANCEL_FULL flow (${TASK_CANCEL_FULL})`, async () => {
        const res = await httpRequest('POST', `${API_PREFIX}/payments/create`, {
            task_price: TASK_PRICE,
            service_fee: SERVICE_FEE,
            commission: COMMISSION,
            tasker_id: TASKER_ID,
            poster_id: POSTER_ID,
            task_id: TASK_CANCEL_FULL
        });
        setResponse(res);
        assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
    });

    await test('Duplicate payment returns 409', async () => {
        const res = await httpRequest('POST', `${API_PREFIX}/payments/create`, {
            task_price: TASK_PRICE,
            service_fee: SERVICE_FEE,
            commission: COMMISSION,
            tasker_id: TASKER_ID,
            poster_id: POSTER_ID,
            task_id: TASK_COMPLETE
        });
        setResponse(res);
        assert(res.status === 409, `Expected 409, got ${res.status}`);
    });

    // ── 3. Verify Financial Summaries After Creation ─────────────────
    console.log('\n── Financial Summaries (After Payment Creation) ──');

    await test('Poster financial shows total_payment after 3 payments', async () => {
        const res = await httpRequest('GET', `${API_PREFIX}/posters/financial/${POSTER_ID}`);
        setResponse(res);
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(res.data.success === true, 'Expected success: true');
        const d = res.data.data;
        assert(d !== null, 'Expected data to exist');
        const expectedTotal = TOTAL_AMOUNT * 3; // 3 payments × 110
        assert(Number(d.total_payment) === expectedTotal, `Expected total_payment=${expectedTotal}, got ${d.total_payment}`);
    });

    await test('Tasker financial shows pending_payout after 3 payments', async () => {
        const res = await httpRequest('GET', `${API_PREFIX}/taskers/financial/${TASKER_ID}`);
        setResponse(res);
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const d = res.data.data;
        assert(d !== null, 'Expected data to exist');
        const expectedPending = TASKER_EARNING * 3; // 3 × 85
        assert(Number(d.pending_payout) === expectedPending, `Expected pending_payout=${expectedPending}, got ${d.pending_payout}`);
    });

    await test('Financial history has 3 records with status=pending', async () => {
        const res = await httpRequest('GET', `${API_PREFIX}/tasks/financial-history?poster_user_id=${POSTER_ID}`);
        setResponse(res);
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(res.data.total_records === 3, `Expected 3 records, got ${res.data.total_records}`);
        const allPending = res.data.data.every((r: any) => r.status === 'pending');
        assert(allPending, 'Expected all records to have status=pending');
    });

    // ── 4. COMPLETE Action ───────────────────────────────────────────
    console.log('\n── COMPLETE Action ──');

    await test(`COMPLETE task (${TASK_COMPLETE})`, async () => {
        const res = await httpRequest('POST', `${API_PREFIX}/payments/action`, {
            task_id: TASK_COMPLETE,
            poster_id: POSTER_ID,
            action: 'COMPLETE'
        });
        setResponse(res);
        assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
        assert(res.data.success === true, 'Expected success: true');
    });

    await test('After COMPLETE: tasker total_payout increased', async () => {
        const res = await httpRequest('GET', `${API_PREFIX}/taskers/financial/${TASKER_ID}`);
        setResponse(res);
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const d = res.data.data;
        assert(Number(d.total_payout) === TASKER_EARNING, `Expected total_payout=${TASKER_EARNING}, got ${d.total_payout}`);
        // pending_payout should decrease by TASKER_EARNING
        const expectedPending = TASKER_EARNING * 2; // 2 remaining
        assert(Number(d.pending_payout) === expectedPending, `Expected pending_payout=${expectedPending}, got ${d.pending_payout}`);
    });

    await test('After COMPLETE: history shows payout_complete', async () => {
        const res = await httpRequest('GET', `${API_PREFIX}/tasks/financial-history?poster_user_id=${POSTER_ID}`);
        setResponse(res);
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const completed = res.data.data?.find((r: any) => r.task_id === TASK_COMPLETE);
        assert(completed, 'Expected to find TASK_001 in history');
        assert(completed.status === 'payout_complete', `Expected status=payout_complete, got ${completed.status}`);
        assert(Number(completed.payout_amount) === TASKER_EARNING, `Expected payout_amount=${TASKER_EARNING}, got ${completed.payout_amount}`);
    });

    // ── 5. CANCEL Action ─────────────────────────────────────────────
    console.log('\n── CANCEL Action ──');

    await test(`CANCEL task (${TASK_CANCEL})`, async () => {
        const res = await httpRequest('POST', `${API_PREFIX}/payments/action`, {
            task_id: TASK_CANCEL,
            poster_id: POSTER_ID,
            action: 'CANCEL'
        });
        setResponse(res);
        assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
        assert(res.data.success === true, 'Expected success: true');
    });

    await test('After CANCEL: poster total_refund updated', async () => {
        const res = await httpRequest('GET', `${API_PREFIX}/posters/financial/${POSTER_ID}`);
        setResponse(res);
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const d = res.data.data;
        // CANCEL refunds (amount - service_fee) = 100
        const expectedRefund = TASK_PRICE; // task_price only (service fee kept)
        assert(Number(d.total_refund) >= expectedRefund, `Expected total_refund >= ${expectedRefund}, got ${d.total_refund}`);
    });

    await test('After CANCEL: history shows refund', async () => {
        const res = await httpRequest('GET', `${API_PREFIX}/tasks/financial-history?poster_user_id=${POSTER_ID}`);
        setResponse(res);
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const cancelled = res.data.data?.find((r: any) => r.task_id === TASK_CANCEL);
        assert(cancelled, 'Expected to find TASK_002 in history');
        assert(cancelled.status === 'refund', `Expected status=refund, got ${cancelled.status}`);
    });

    // ── 6. CANCEL_FULL Action ────────────────────────────────────────
    console.log('\n── CANCEL_FULL Action ──');

    await test(`CANCEL_FULL task (${TASK_CANCEL_FULL})`, async () => {
        const res = await httpRequest('POST', `${API_PREFIX}/payments/action`, {
            task_id: TASK_CANCEL_FULL,
            poster_id: POSTER_ID,
            action: 'CANCEL_FULL'
        });
        setResponse(res);
        assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
        assert(res.data.success === true, 'Expected success: true');
    });

    await test('After CANCEL_FULL: history shows refund_with_penalty', async () => {
        const res = await httpRequest('GET', `${API_PREFIX}/tasks/financial-history?poster_user_id=${POSTER_ID}`);
        setResponse(res);
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        const fullCancel = res.data.data?.find((r: any) => r.task_id === TASK_CANCEL_FULL);
        assert(fullCancel, 'Expected to find TASK_003 in history');
        assert(fullCancel.status === 'refund_with_penalty', `Expected status=refund_with_penalty, got ${fullCancel.status}`);
        assert(fullCancel.penalty_owner === 'tasker', `Expected penalty_owner=tasker, got ${fullCancel.penalty_owner}`);
    });

    // ── 7. Pagination & Filtering ────────────────────────────────────
    console.log('\n── Pagination & Filtering ──');

    await test('Pagination: limit=2 returns 2 records with correct metadata', async () => {
        const res = await httpRequest('GET', `${API_PREFIX}/tasks/financial-history?poster_user_id=${POSTER_ID}&page=1&limit=2`);
        setResponse(res);
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(res.data.data.length === 2, `Expected 2 records, got ${res.data.data.length}`);
        assert(res.data.total_records === 3, `Expected total_records=3, got ${res.data.total_records}`);
        assert(res.data.total_pages === 2, `Expected total_pages=2, got ${res.data.total_pages}`);
        assert(res.data.current_page === 1, `Expected current_page=1, got ${res.data.current_page}`);
    });

    await test('Filter by tasker_user_id returns correct records', async () => {
        const res = await httpRequest('GET', `${API_PREFIX}/tasks/financial-history?tasker_user_id=${TASKER_ID}`);
        setResponse(res);
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(res.data.total_records === 3, `Expected 3 records for tasker, got ${res.data.total_records}`);
    });

    // ── 8. Edge Cases ────────────────────────────────────────────────
    console.log('\n── Edge Cases ──');

    await test('Non-existent user returns null/empty', async () => {
        const res = await httpRequest('GET', `${API_PREFIX}/posters/financial/${PREFIX}NONEXISTENT`);
        setResponse(res);
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(res.data.data !== null, `Expected data to exist`);
        assert(Number(res.data.data.total_payment) === 0, `Expected total_payment=0 for non-existent user, got ${res.data.data.total_payment}`);
    });

    await test('Invalid action on completed task', async () => {
        const res = await httpRequest('POST', `${API_PREFIX}/payments/action`, {
            task_id: TASK_COMPLETE,
            poster_id: POSTER_ID,
            action: 'COMPLETE'
        });
        setResponse(res);
        // Should fail — payment already completed
        assert(res.status === 404 || res.status === 400, `Expected 404/400, got ${res.status}`);
    });
}

// ─── Cleanup ──────────────────────────────────────────────────────────
async function cleanup() {
    console.log('\n── Cleanup ──');
    console.log('  Connecting to database for cleanup...');
    await dbConnect();

    const queries = [
        { label: 'task_financial_history', sql: `DELETE FROM task_financial_history WHERE poster_user_id LIKE '${PREFIX}%' OR tasker_user_id LIKE '${PREFIX}%'` },
        { label: 'poster_list', sql: `DELETE FROM poster_list WHERE user_id LIKE '${PREFIX}%'` },
        { label: 'tasker_list', sql: `DELETE FROM tasker_list WHERE user_id LIKE '${PREFIX}%'` },
        { label: 'refunds (via payments)', sql: `DELETE r FROM refunds r INNER JOIN payments p ON r.payment_id = p.id WHERE p.related_task_id LIKE '${PREFIX}%'` },
        { label: 'earnings', sql: `DELETE FROM earnings WHERE external_user_id LIKE '${PREFIX}%'` },
        { label: 'pending_payouts', sql: `DELETE FROM pending_payouts WHERE task_id LIKE '${PREFIX}%'` },
        { label: 'failed_payouts', sql: `DELETE FROM failed_payouts WHERE user_id LIKE '${PREFIX}%'` },
        { label: 'payouts', sql: `DELETE FROM payouts WHERE external_user_id LIKE '${PREFIX}%'` },
        { label: 'escrows', sql: `DELETE FROM escrows WHERE related_task_id LIKE '${PREFIX}%'` },
        { label: 'transactions (via wallets)', sql: `DELETE t FROM transactions t INNER JOIN wallets w ON (t.from_wallet_id = w.id OR t.to_wallet_id = w.id) WHERE w.external_user_id LIKE '${PREFIX}%'` },
        { label: 'payments', sql: `DELETE FROM payments WHERE related_task_id LIKE '${PREFIX}%'` },
        { label: 'wallets', sql: `DELETE FROM wallets WHERE external_user_id LIKE '${PREFIX}%'` },
    ];

    for (const q of queries) {
        try {
            const [, meta]: any = await sequelize.query(q.sql);
            const affected = meta?.affectedRows ?? 0;
            console.log(`  🧹 ${q.label}: ${affected} rows deleted`);
        } catch (err: any) {
            console.log(`  ⚠️  ${q.label}: ${err.message}`);
        }
    }

    console.log('  ✅ Cleanup complete');
}

// ─── Log File ─────────────────────────────────────────────────────────
function writeLogFile() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const logPath = path.join(__dirname, `test-results-${timestamp}.log`);

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    const lines: string[] = [
        '═'.repeat(65),
        `  TEST RESULTS — ${new Date().toISOString()}`,
        '═'.repeat(65),
        '',
        `  Total:  ${results.length}`,
        `  Passed: ${passed}  ✅`,
        `  Failed: ${failed}  ${failed > 0 ? '❌' : ''}`,
        `  Time:   ${totalDuration}ms`,
        '',
        '─'.repeat(65),
        ''
    ];

    for (const r of results) {
        const icon = r.passed ? '✅' : '❌';
        lines.push(`${icon} ${r.name} (${r.duration}ms)`);
        if (!r.passed) {
            lines.push(`     → ${r.message}`);
            if (r.response) {
                lines.push(`     📡 Response [${r.response.status}]: ${JSON.stringify(r.response.data)}`);
            }
        }
    }

    lines.push('');
    lines.push('─'.repeat(65));

    if (failed > 0) {
        lines.push('');
        lines.push('FAILED TESTS:');
        for (const r of results.filter(r => !r.passed)) {
            lines.push(`  ❌ ${r.name}`);
            lines.push(`     ${r.message}`);
            if (r.response) {
                lines.push(`     📡 Response [${r.response.status}]: ${JSON.stringify(r.response.data)}`);
            }
        }
    }

    lines.push('');

    const content = lines.join('\n');
    fs.writeFileSync(logPath, content, 'utf-8');
    console.log(`\n📄 Log written to: ${logPath}`);
    return { passed, failed, logPath };
}

// ─── Main ─────────────────────────────────────────────────────────────
async function main() {
    try {
        // Run all tests
        await runAllTests();
    } catch (err: any) {
        console.error(`\n💥 Test suite crashed: ${err.message}`);
    }

    // Always cleanup + log, even if tests crash
    try {
        await cleanup();
    } catch (err: any) {
        console.error(`\n💥 Cleanup failed: ${err.message}`);
    }

    const { passed, failed } = writeLogFile();

    // Final summary
    console.log('\n' + '='.repeat(65));
    console.log(`  FINAL: ${passed} passed, ${failed} failed out of ${results.length}`);
    console.log('='.repeat(65));

    process.exit(failed > 0 ? 1 : 0);
}

main();
