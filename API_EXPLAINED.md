# Payment Microservice API Guide

This document explains the available API endpoints in simple, non-technical English. It is helpful for understanding how to integrate with the payment system.

## 1. Core Payment Flow
The payment flow has been simplified to just two steps.

- **Step 1: Create Task Payment** (`POST /api/v1/payments/create`)
  - **What it does:** Starts the process. The Poster pays (or authorizes) the full amount.
  - **Internal Logic:** The system calculates who gets what (Tasker vs Company) and puts that money in a "Pending" (Held) state. 
  - **Result:** Money is safe in the system, but nobody can spend it yet.

- **Step 2: Task Action** (`POST /api/v1/payments/action`)
  - **What it does:** Decides what happens to the held money based on the task outcome.
  - **Action = COMPLETE:** The task went well. The system moves the "Pending" money to "Available". The Tasker gets paid, and the Company collects its fee.
  - **Action = CANCEL:** The task didn't happen. The system reverses the "Pending" balances. The money is effectively returned/unlocked.

## 2. Admin
- **Company Account** (`GET /api/v1/admin/company-account`)
  - **What it does:** Shows how much money the Platform has made and currently holds.
