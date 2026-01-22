import PDFDocument from 'pdfkit';
import { Payment } from '../models/Payment';
import { Payout } from '../models/Payout';
import { Refund } from '../models/Refund';
import fs from 'fs';
import path from 'path';

export class ReceiptService {
  
  static async generatePaymentReceipt(payment: Payment): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      let buffers: Buffer[] = [];
      
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      doc.fontSize(20).text('Payment Receipt', { align: 'center' });
      doc.moveDown();
      
      doc.fontSize(12).text(`Receipt ID: ${payment.id}`);
      doc.text(`Date: ${payment.createdAt.toISOString()}`);
      doc.text(`Payer ID: ${payment.user_id}`);
      doc.moveDown();
      
      doc.text('Description: Marketplace Task Payment');
      doc.text(`Task ID: ${payment.related_task_id || 'N/A'}`);
      doc.moveDown();
      
      doc.text(`Subtotal: $${(Number(payment.amount) - Number(payment.service_fee)).toFixed(2)}`);
      doc.text(`Service Fee: $${Number(payment.service_fee).toFixed(2)}`);
      doc.moveDown();
      doc.moveDown();
      doc.font('Helvetica-Bold').fontSize(16).text(`Total Paid: $${Number(payment.amount).toFixed(2)}`);
      
      doc.end();
    });
  }

  static async generatePayoutReceipt(payout: Payout): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      let buffers: Buffer[] = [];
      
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      doc.fontSize(20).text('Payout Receipt', { align: 'center' });
      doc.moveDown();
      
      doc.fontSize(12).text(`Payout ID: ${payout.id}`);
      doc.text(`Date: ${payout.createdAt.toISOString()}`);
      doc.text(`Payee ID: ${payout.external_user_id}`);
      doc.moveDown();
      
      doc.font('Helvetica-Bold').fontSize(16).text(`Total Paid Out: $${Number(payout.amount).toFixed(2)}`);
      doc.font('Helvetica').fontSize(10).text(`Status: ${payout.status}`);
      
      doc.end();
    });
  }

  static async generateRefundReceipt(refund: Refund, payment: Payment): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      let buffers: Buffer[] = [];
      
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      doc.fontSize(20).text('Refund Receipt', { align: 'center' });
      doc.moveDown();
      
      doc.fontSize(12).text(`Refund ID: ${refund.id}`);
      doc.text(`Original Payment ID: ${payment.id}`);
      doc.text(`Date: ${new Date().toISOString()}`);
      doc.moveDown();
      
      doc.text(`Refund Type: ${refund.type}`);
      doc.text(`Reason: ${refund.reason || 'N/A'}`);
      doc.moveDown();
      
      doc.font('Helvetica-Bold').fontSize(16).text(`Total Refunded: $${Number(refund.amount).toFixed(2)}`);
      
      if (refund.penalty_amount > 0) {
           doc.moveDown();
           doc.fontSize(10).text(`* Note: A penalty of $${Number(refund.penalty_amount).toFixed(2)} was assessed to the counterparty.`);
      }

      doc.end();
    });
  }
}
