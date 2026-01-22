import { stripe } from '../config/stripe';
import { settings } from '../config/settings';

export class StripeService {
  /**
   * Transfer funds from Platform Account to Connected Account.
   * "Separate Charges and Transfers" flow.
   * Pre-requisite: Platform Account must have available balance.
   */
  async createTransfer(amountParams: {
    amount: number; // Decimal (e.g. 10.50)
    currency: string;
    destinationAccountId: string;
    transferGroup?: string;
    description?: string;
    metadata?: Record<string, string>;
  }) {
    // Stripe expects amount in cents
    const amountInCents = Math.round(amountParams.amount * 100);

    return stripe.transfers.create({
      amount: amountInCents,
      currency: amountParams.currency.toLowerCase(),
      destination: amountParams.destinationAccountId,
      transfer_group: amountParams.transferGroup,
      description: amountParams.description,
      metadata: amountParams.metadata,
    });
  }

  /**
   * Create a payout from the Connect account to their external bank account.
   * Note: Usually Stripe Connect takes care of this automatically if set to automatic payouts.
   * If manual, we trigger it here.
   */
  async createPayout(params: {
    amount: number;
    currency: string;
    stripeAccountId: string;
  }) {
    const amountInCents = Math.round(params.amount * 100);
    
    return stripe.payouts.create({
        amount: amountInCents,
        currency: params.currency.toLowerCase(),
      }, {
        stripeAccount: params.stripeAccountId, // Perform request on behalf of the connected user
    });
  }

  async createAccountLink(accountId: string, refreshUrl: string, returnUrl: string) {
    return stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });
  }

  async createConnectedAccount(email: string) {
    return stripe.accounts.create({
      type: 'express', // or 'standard' / 'custom'
      email,
      capabilities: {
        transfers: { requested: true },
      },
      settings: {
        payouts: {
          schedule: {
            interval: settings.payouts.schedule.interval as any,
          },
        },
        payments: {
          settlement_timing: {
            delay_days_override: settings.payments.settlement_timing.delay_days_override,
          },
        },
      } as any,
    });
  }

  async getAccountStatus(accountId: string) {
    const account = await stripe.accounts.retrieve(accountId);
    return {
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
    };
  }
  async createPaymentIntent(amount: number, currency: string, customerId?: string) {
    const amountInCents = Math.round(amount * 100);
    return stripe.paymentIntents.create({
      amount: amountInCents,
      currency: currency.toLowerCase(),
      customer: customerId, // Optional: if we have Stripe Customer ID stored
      automatic_payment_methods: {
        enabled: true,
      },
    });
  }

  async createRefund(amount: number, paymentIntentId: string) {
    const amountInCents = Math.round(amount * 100);
    return stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: amountInCents,
    });
  }
}

export const stripeService = new StripeService();
