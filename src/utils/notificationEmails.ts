/**
 * Plain-text email templates for Stripe webhook notifications.
 * Professional, system-notification style — no marketing language.
 */

interface PaymentSuccessData {
    taskId: string;
    amount: string;
    currency: string;
    paymentId: string;
    date: string;
}

interface PayoutData {
    payoutId: string;
    amount: string;
    currency: string;
    date: string;
    failureReason?: string;
}

interface RefundData {
    taskId?: string;
    amount: string;
    currency: string;
    paymentId: string;
    date: string;
}

// ─── Payment Success ────────────────────────────────────────────────

export function paymentSuccessPosterEmail(data: PaymentSuccessData) {
    return {
        subject: `Payment Confirmed — ${data.currency} ${data.amount}`,
        body: `Payment Confirmation

A payment has been successfully processed for your task.

Details:
  Task ID:    ${data.taskId}
  Amount:     ${data.currency} ${data.amount}
  Payment ID: ${data.paymentId}
  Date:       ${data.date}

This is an automated notification. No action is required.

— Payment Service`
    };
}

export function paymentSuccessTaskerEmail(data: PaymentSuccessData) {
    return {
        subject: `Task Funded — ${data.currency} ${data.amount}`,
        body: `Task Funding Notification

A payment has been received for a task assigned to you.

Details:
  Task ID:    ${data.taskId}
  Amount:     ${data.currency} ${data.amount}
  Payment ID: ${data.paymentId}
  Date:       ${data.date}

Funds will be released upon task completion.

This is an automated notification.

— Payment Service`
    };
}

// ─── Payout Success ─────────────────────────────────────────────────

export function payoutPaidEmail(data: PayoutData) {
    return {
        subject: `Payout Processed — ${data.currency} ${data.amount}`,
        body: `Payout Confirmation

Your payout has been processed and sent to your connected bank account.

Details:
  Payout ID: ${data.payoutId}
  Amount:    ${data.currency} ${data.amount}
  Date:      ${data.date}

Please allow 1–3 business days for the funds to appear in your account.

This is an automated notification.

— Payment Service`
    };
}

// ─── Payout Failed ──────────────────────────────────────────────────

export function payoutFailedEmail(data: PayoutData) {
    return {
        subject: `Payout Failed — Action Required`,
        body: `Payout Failure Notice

A payout to your bank account could not be completed.

Details:
  Payout ID: ${data.payoutId}
  Amount:    ${data.currency} ${data.amount}
  Date:      ${data.date}
  Reason:    ${data.failureReason || 'Unknown'}

Please verify your bank account details and contact support if the issue persists.

This is an automated notification.

— Payment Service`
    };
}

// ─── Refund ─────────────────────────────────────────────────────────

export function refundEmail(data: RefundData) {
    return {
        subject: `Refund Processed — ${data.currency} ${data.amount}`,
        body: `Refund Confirmation

A refund has been processed for your payment.

Details:
  ${data.taskId ? `Task ID:    ${data.taskId}\n  ` : ''}Payment ID: ${data.paymentId}
  Amount:     ${data.currency} ${data.amount}
  Date:       ${data.date}

Please allow 5–10 business days for the refund to appear on your statement.

This is an automated notification.

— Payment Service`
    };
}
