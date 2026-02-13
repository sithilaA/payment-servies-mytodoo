/**
 * HTML email templates for transactional notifications.
 * Clean, responsive design compatible with major email clients.
 * Uses inline styles and table-based layout for maximum compatibility.
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
  taskPrice?: string;
  commission?: string;
  serviceFee?: string;
}

interface RefundData {
  taskId?: string;
  amount: string;
  currency: string;
  paymentId: string;
  date: string;
}

interface PenaltyData {
  taskId: string;
  penaltyAmount: string;
  currency: string;
  paymentId: string;
  date: string;
}

interface CancellationData {
  taskId: string;
  refundAmount: string;
  penaltyDeducted: string;
  currency: string;
  paymentId: string;
  date: string;
}

// ─── Shared Layout ──────────────────────────────────────────────────

function emailLayout(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${title}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f4f5f7;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="max-width:560px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color:#1a1a2e;padding:24px 32px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="color:#ffffff;font-size:18px;font-weight:600;letter-spacing:0.5px;">
                    Payment Service
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #eaedf0;">
              <p style="margin:0;font-size:12px;line-height:18px;color:#8c8c9a;">
                This is an automated notification from Payment Service. Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 12px;font-size:13px;color:#6b6b76;white-space:nowrap;vertical-align:top;">${label}</td>
    <td style="padding:8px 12px;font-size:13px;color:#1a1a2e;font-weight:500;word-break:break-all;">${value}</td>
  </tr>`;
}

function statusBadge(text: string, color: string, bgColor: string): string {
  return `<span style="display:inline-block;padding:4px 12px;font-size:12px;font-weight:600;color:${color};background-color:${bgColor};border-radius:4px;letter-spacing:0.3px;">${text}</span>`;
}

// ─── Payment Success — Poster ───────────────────────────────────────

export function paymentSuccessPosterEmail(data: PaymentSuccessData) {
  const content = `
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1a1a2e;">Payment Confirmed</h1>
    <p style="margin:0 0 24px;font-size:14px;line-height:22px;color:#4a4a5a;">
      Your payment has been successfully processed.
    </p>

    <!-- Amount highlight -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:24px;">
      <tr>
        <td style="background-color:#f0f4f8;border-radius:6px;padding:20px;text-align:center;">
          <p style="margin:0 0 4px;font-size:12px;color:#6b6b76;text-transform:uppercase;letter-spacing:1px;">Amount Paid</p>
          <p style="margin:0;font-size:28px;font-weight:700;color:#1a1a2e;">${data.currency} ${data.amount}</p>
        </td>
      </tr>
    </table>

    <!-- Details table -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#fafbfc;border-radius:6px;border:1px solid #eaedf0;margin-bottom:24px;">
      ${detailRow('Task ID', data.taskId)}
      <tr><td colspan="2" style="border-bottom:1px solid #eaedf0;"></td></tr>
      ${detailRow('Payment ID', data.paymentId)}
      <tr><td colspan="2" style="border-bottom:1px solid #eaedf0;"></td></tr>
      ${detailRow('Date', data.date)}
      <tr><td colspan="2" style="border-bottom:1px solid #eaedf0;"></td></tr>
      ${detailRow('Status', statusBadge('CONFIRMED', '#0d7237', '#e6f4ed'))}
    </table>

    <p style="margin:0;font-size:13px;line-height:20px;color:#6b6b76;">
      No action is required on your part.
    </p>`;

  return {
    subject: `Payment Confirmed — ${data.currency} ${data.amount}`,
    html: emailLayout('Payment Confirmed', content),
    text: `Payment Confirmed\n\nYour payment of ${data.currency} ${data.amount} has been successfully processed.\n\nTask ID: ${data.taskId}\nPayment ID: ${data.paymentId}\nDate: ${data.date}\n\nThis is an automated notification.`
  };
}

// ─── Payment Success — Tasker ───────────────────────────────────────

export function paymentSuccessTaskerEmail(data: PaymentSuccessData) {
  const content = `
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1a1a2e;">Task Funded</h1>
    <p style="margin:0 0 24px;font-size:14px;line-height:22px;color:#4a4a5a;">
      A payment has been received for a task assigned to you.
    </p>

    <!-- Amount highlight -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:24px;">
      <tr>
        <td style="background-color:#f0f4f8;border-radius:6px;padding:20px;text-align:center;">
          <p style="margin:0 0 4px;font-size:12px;color:#6b6b76;text-transform:uppercase;letter-spacing:1px;">Task Value</p>
          <p style="margin:0;font-size:28px;font-weight:700;color:#1a1a2e;">${data.currency} ${data.amount}</p>
        </td>
      </tr>
    </table>

    <!-- Details table -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#fafbfc;border-radius:6px;border:1px solid #eaedf0;margin-bottom:24px;">
      ${detailRow('Task ID', data.taskId)}
      <tr><td colspan="2" style="border-bottom:1px solid #eaedf0;"></td></tr>
      ${detailRow('Payment ID', data.paymentId)}
      <tr><td colspan="2" style="border-bottom:1px solid #eaedf0;"></td></tr>
      ${detailRow('Date', data.date)}
      <tr><td colspan="2" style="border-bottom:1px solid #eaedf0;"></td></tr>
      ${detailRow('Status', statusBadge('FUNDED', '#0d5aa7', '#e8f1fb'))}
    </table>

    <p style="margin:0;font-size:13px;line-height:20px;color:#6b6b76;">
      Funds will be released to your account upon task completion.
    </p>`;

  return {
    subject: `Task Funded — ${data.currency} ${data.amount}`,
    html: emailLayout('Task Funded', content),
    text: `Task Funded\n\nA payment of ${data.currency} ${data.amount} has been received for a task assigned to you.\n\nTask ID: ${data.taskId}\nPayment ID: ${data.paymentId}\nDate: ${data.date}\n\nFunds will be released upon task completion.\n\nThis is an automated notification.`
  };
}

// ─── Payout Success ─────────────────────────────────────────────────

export function payoutPaidEmail(data: PayoutData) {
  const content = `
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1a1a2e;">Payout Processed</h1>
    <p style="margin:0 0 24px;font-size:14px;line-height:22px;color:#4a4a5a;">
      Your payout has been processed and sent to your connected bank account.
    </p>

    <!-- Amount highlight -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:24px;">
      <tr>
        <td style="background-color:#e6f4ed;border-radius:6px;padding:20px;text-align:center;">
          <p style="margin:0 0 4px;font-size:12px;color:#0d7237;text-transform:uppercase;letter-spacing:1px;">Payout Amount</p>
          <p style="margin:0;font-size:28px;font-weight:700;color:#0d7237;">${data.currency} ${data.amount}</p>
        </td>
      </tr>
    </table>

    <!-- Details table -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#fafbfc;border-radius:6px;border:1px solid #eaedf0;margin-bottom:24px;">
      ${detailRow('Payout ID', data.payoutId)}
      <tr><td colspan="2" style="border-bottom:1px solid #eaedf0;"></td></tr>
      ${detailRow('Date', data.date)}
      <tr><td colspan="2" style="border-bottom:1px solid #eaedf0;"></td></tr>
      ${detailRow('Task Price', `${data.currency} ${data.taskPrice}`)}
      <tr><td colspan="2" style="border-bottom:1px solid #eaedf0;"></td></tr>
      ${detailRow('Commission', `-${data.currency} ${data.commission}`)}
      <tr><td colspan="2" style="border-bottom:1px solid #eaedf0;"></td></tr>
      ${detailRow('Service Fee', `-${data.currency} ${data.serviceFee}`)}
      <tr><td colspan="2" style="border-bottom:1px solid #eaedf0;"></td></tr>
      ${detailRow('Total Payout', `<strong>${data.currency} ${data.amount}</strong>`)}
      <tr><td colspan="2" style="border-bottom:1px solid #eaedf0;"></td></tr>
      ${detailRow('Status', statusBadge('COMPLETED', '#0d7237', '#e6f4ed'))}
    </table>

    <p style="margin:0;font-size:13px;line-height:20px;color:#6b6b76;">
      Please allow 1–3 business days for the funds to appear in your account.
    </p>`;

  return {
    subject: `Payout Processed — ${data.currency} ${data.amount}`,
    html: emailLayout('Payout Processed', content),
    text: `Payout Processed\n\nYour payout of ${data.currency} ${data.amount} has been sent to your bank account.\n\nPayout Breakdown:\nTask Price: ${data.currency} ${data.taskPrice}\nCommission: -${data.currency} ${data.commission}\nService Fee: -${data.currency} ${data.serviceFee}\n\nPayout ID: ${data.payoutId}\nDate: ${data.date}\n\nPlease allow 1-3 business days for the funds to appear.\n\nThis is an automated notification.`
  };
}

// ─── Payout Failed ──────────────────────────────────────────────────

export function payoutFailedEmail(data: PayoutData) {
  const content = `
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1a1a2e;">Payout Failed</h1>
    <p style="margin:0 0 24px;font-size:14px;line-height:22px;color:#4a4a5a;">
      A payout to your bank account could not be completed.
    </p>

    <!-- Amount highlight -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:24px;">
      <tr>
        <td style="background-color:#fef2f2;border-radius:6px;padding:20px;text-align:center;">
          <p style="margin:0 0 4px;font-size:12px;color:#b91c1c;text-transform:uppercase;letter-spacing:1px;">Failed Amount</p>
          <p style="margin:0;font-size:28px;font-weight:700;color:#b91c1c;">${data.currency} ${data.amount}</p>
        </td>
      </tr>
    </table>

    <!-- Details table -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#fafbfc;border-radius:6px;border:1px solid #eaedf0;margin-bottom:24px;">
      ${detailRow('Payout ID', data.payoutId)}
      <tr><td colspan="2" style="border-bottom:1px solid #eaedf0;"></td></tr>
      ${detailRow('Date', data.date)}
      <tr><td colspan="2" style="border-bottom:1px solid #eaedf0;"></td></tr>
      ${detailRow('Reason', data.failureReason || 'Unknown')}
      <tr><td colspan="2" style="border-bottom:1px solid #eaedf0;"></td></tr>
      ${detailRow('Status', statusBadge('FAILED', '#b91c1c', '#fef2f2'))}
    </table>

    <p style="margin:0;font-size:13px;line-height:20px;color:#6b6b76;">
      Please verify your bank account details. Contact support if the issue persists.
    </p>`;

  return {
    subject: `Payout Failed — Action Required`,
    html: emailLayout('Payout Failed', content),
    text: `Payout Failed\n\nA payout of ${data.currency} ${data.amount} could not be completed.\n\nPayout ID: ${data.payoutId}\nDate: ${data.date}\nReason: ${data.failureReason || 'Unknown'}\n\nPlease verify your bank account details.\n\nThis is an automated notification.`
  };
}

// ─── Refund ─────────────────────────────────────────────────────────

// ─── Full Refund — Poster ───────────────────────────────────────────

export function fullRefundPosterEmail(data: RefundData) {
  const taskRow = data.taskId
    ? `${detailRow('Task ID', data.taskId)}<tr><td colspan="2" style="border-bottom:1px solid #eaedf0;"></td></tr>`
    : '';

  const content = `
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1a1a2e;">Full Refund Processed</h1>
    <p style="margin:0 0 24px;font-size:14px;line-height:22px;color:#4a4a5a;">
      Your total payment (Task Price + Service Fee) has been fully refunded.
    </p>

    <!-- Amount highlight -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:24px;">
      <tr>
        <td style="background-color:#f0f4f8;border-radius:6px;padding:20px;text-align:center;">
          <p style="margin:0 0 4px;font-size:12px;color:#6b6b76;text-transform:uppercase;letter-spacing:1px;">Total Refund Amount</p>
          <p style="margin:0;font-size:28px;font-weight:700;color:#1a1a2e;">${data.currency} ${data.amount}</p>
        </td>
      </tr>
    </table>

    <!-- Details table -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#fafbfc;border-radius:6px;border:1px solid #eaedf0;margin-bottom:24px;">
      ${taskRow}
      ${detailRow('Payment ID', data.paymentId)}
      <tr><td colspan="2" style="border-bottom:1px solid #eaedf0;"></td></tr>
      ${detailRow('Date', data.date)}
      <tr><td colspan="2" style="border-bottom:1px solid #eaedf0;"></td></tr>
      ${detailRow('Status', statusBadge('FULL REFUND', '#7c3aed', '#f3f0ff'))}
    </table>

    <p style="margin:0;font-size:13px;line-height:20px;color:#6b6b76;">
      Please allow 5–10 business days for the refund to appear on your statement.
    </p>`;

  return {
    subject: `Full Refund Processed — ${data.currency} ${data.amount}`,
    html: emailLayout('Full Refund Processed', content),
    text: `Full Refund Processed\n\nYour total payment of ${data.currency} ${data.amount} has been fully refunded.\n\n${data.taskId ? `Task ID: ${data.taskId}\n` : ''}Payment ID: ${data.paymentId}\nDate: ${data.date}\n\nPlease allow 5-10 business days for the refund to appear on your statement.\n\nThis is an automated notification.`
  };
}

// ─── Cancellation with Penalty — Poster ─────────────────────────────

export function cancellationPenaltyPosterEmail(data: CancellationData) {
  const content = `
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1a1a2e;">Cancellation Processed</h1>
    <p style="margin:0 0 24px;font-size:14px;line-height:22px;color:#4a4a5a;">
      Your cancellation has been processed. As per the cancellation policy, a penalty has been applied.
    </p>

    <!-- Amount highlight -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:24px;">
      <tr>
        <td style="background-color:#f0f4f8;border-radius:6px;padding:20px;text-align:center;">
          <p style="margin:0 0 4px;font-size:12px;color:#6b6b76;text-transform:uppercase;letter-spacing:1px;">Refund Amount</p>
          <p style="margin:0;font-size:28px;font-weight:700;color:#1a1a2e;">${data.currency} ${data.refundAmount}</p>
        </td>
      </tr>
    </table>

    <!-- Details table -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#fafbfc;border-radius:6px;border:1px solid #eaedf0;margin-bottom:24px;">
      ${detailRow('Task ID', data.taskId)}
      <tr><td colspan="2" style="border-bottom:1px solid #eaedf0;"></td></tr>
      ${detailRow('Penalty Deducted', `${data.currency} ${data.penaltyDeducted}`)}
      <tr><td colspan="2" style="border-bottom:1px solid #eaedf0;"></td></tr>
      ${detailRow('Payment ID', data.paymentId)}
      <tr><td colspan="2" style="border-bottom:1px solid #eaedf0;"></td></tr>
      ${detailRow('Date', data.date)}
      <tr><td colspan="2" style="border-bottom:1px solid #eaedf0;"></td></tr>
      ${detailRow('Status', statusBadge('REFUNDED', '#7c3aed', '#f3f0ff'))}
    </table>

    <p style="margin:0;font-size:13px;line-height:20px;color:#6b6b76;">
      The refund amount (Task Amount only) has been sent to your original payment method. The service fee is non-refundable.
    </p>`;

  return {
    subject: `Cancellation Refund — ${data.currency} ${data.refundAmount}`,
    html: emailLayout('Cancellation Processed', content),
    text: `Cancellation Processed\n\nYour cancellation has been processed with a penalty applied.\n\nRefund Amount: ${data.currency} ${data.refundAmount}\nPenalty Deducted: ${data.currency} ${data.penaltyDeducted}\n\nTask ID: ${data.taskId}\nPayment ID: ${data.paymentId}\nDate: ${data.date}\n\nThe service fee is non-refundable.\n\nThis is an automated notification.`
  };
}

// ─── Full Refund Notification — Tasker ──────────────────────────────

export function fullRefundTaskerEmail(data: PenaltyData) {
  const content = `
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1a1a2e;">Task Cancelled & Refunded</h1>
    <p style="margin:0 0 24px;font-size:14px;line-height:22px;color:#4a4a5a;">
      A task assigned to you has been fully refunded to the poster. 
    </p>
    <p style="margin:0 0 24px;font-size:14px;line-height:22px;color:#4a4a5a;">
      As a result, a penalty has been applied to your account. This amount will be adjusted/deducted from your next task payout.
    </p>

    <!-- Amount highlight -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:24px;">
      <tr>
        <td style="background-color:#fef2f2;border-radius:6px;padding:20px;text-align:center;">
          <p style="margin:0 0 4px;font-size:12px;color:#b91c1c;text-transform:uppercase;letter-spacing:1px;">Penalty Amount</p>
          <p style="margin:0;font-size:28px;font-weight:700;color:#b91c1c;">${data.currency} ${data.penaltyAmount}</p>
        </td>
      </tr>
    </table>

    <!-- Details table -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#fafbfc;border-radius:6px;border:1px solid #eaedf0;margin-bottom:24px;">
      ${detailRow('Task ID', data.taskId)}
      <tr><td colspan="2" style="border-bottom:1px solid #eaedf0;"></td></tr>
      ${detailRow('Payment ID', data.paymentId)}
      <tr><td colspan="2" style="border-bottom:1px solid #eaedf0;"></td></tr>
      ${detailRow('Date', data.date)}
      <tr><td colspan="2" style="border-bottom:1px solid #eaedf0;"></td></tr>
      ${detailRow('Status', statusBadge('PENALTY APPLIED', '#b91c1c', '#fef2f2'))}
    </table>

    <p style="margin:0;font-size:13px;line-height:20px;color:#6b6b76;">
      If you check your dashboard, you will see this deduction recorded.
    </p>`;

  return {
    subject: `Task Refunded — Penalty Applied`,
    html: emailLayout('Task Refunded', content),
    text: `Task Cancelled & Refunded\n\nA task assigned to you has been fully refunded to the poster.\n\nA penalty of ${data.currency} ${data.penaltyAmount} has been applied to your account and will be deducted from your next payout.\n\nTask ID: ${data.taskId}\nPayment ID: ${data.paymentId}\n\nThis is an automated notification.`
  };
}
