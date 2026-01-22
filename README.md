# Payment Microservice

A production-ready microservice for managing wallets, payments, escrows, and payouts via Stripe Connect.

## Core Features
- **User-less Architecture**: Relies on `external_user_id` from Main Backend.
- **Double-Entry Ledger**: Immutable transaction records for auditability.
- **Stripe Connect Integration**: Automated payouts and earnings.
- **Escrow System**: Hold and release funds for marketplace tasks.
- **Violation Alerts**: Real-time email alerts for financial anomalies (e.g. negative balance attempts).

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   Copy `.env.example` to `.env` and fill in:
   - MySQL Credentials
   - Stripe Keys (`STRIPE_SECRET_KEY`, etc.)
   - SMTP Settings for Alerts

3. **Database**
   Ensure MySQL is running and create the database:
   ```sql
   CREATE DATABASE payment_service;
   ```
   (The service will auto-sync tables on start, though migrations are recommended for prod).

4. **Build & Run**
   ```bash
   npm run build   # Compile TypeScript
   npm start       # Run from dist/
   # OR for dev
   npm run dev
   ```

## API Documentation

### Earnings (Internal)
- `POST /api/v1/earnings` - Record user earning from Main Backend.

### Payouts
- `POST /api/v1/payouts` - Request payout (triggers Stripe Transfer).
- `POST /api/v1/wallets/stripe` - internal: Link Stripe Account ID to user wallet.
- `POST /api/v1/webhooks/stripe` - Handle Payout status changes.

### Escrow
- `POST /api/v1/escrow` - Create Escrow lock.
- `POST /api/v1/escrow/:id/release` - Release funds to Payee.
- `POST /api/v1/escrow/:id/refund` - Refund to Payer.

### Wallet
- `GET /api/v1/wallets/:userId/balance` - View balance.

## Financial Rules
- **No Negative Balances**: Strictly enforced via DB transaction checks and Alert systems.
- **Atomic Transactions**: All balance updates are wrapped in Serializable transactions.
