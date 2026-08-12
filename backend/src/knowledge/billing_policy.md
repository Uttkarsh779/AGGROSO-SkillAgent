# Billing Policy

## Overview
This document outlines billing procedures, payment handling, and dispute resolution for customer accounts.

## Accepted Payment Methods
- Credit cards (Visa, Mastercard, American Express)
- Debit cards
- UPI (for Indian customers)
- Net banking
- Digital wallets (PayPal, Google Pay)

## Billing Cycle
- One-time purchases are charged immediately upon order confirmation
- Subscriptions are billed at the start of each billing period (monthly or annual)
- Failed payments trigger retry attempts at 24h, 48h, and 72h intervals

## Payment Failure Handling
If a payment fails:
1. Customer is notified immediately via email
2. Order is placed in "pending payment" state (not cancelled)
3. Customer has 72 hours to resolve the payment method
4. After 72 hours without resolution, order is automatically cancelled
5. A payment failure record is created for audit purposes

## Payment Deduction Without Order Confirmation
This is a known edge case that can occur due to network timeouts between payment gateway and our order system:
- Payment is captured by the gateway but order creation fails
- This results in a "ghost charge" — money deducted, no order created
- Resolution: Create a support ticket with HIGH priority
- The billing team reconciles such cases within 24 hours
- Customer receives either: (a) order created retroactively, or (b) full refund

## Invoice and Receipts
- Invoices are generated automatically for all successful transactions
- Receipts are emailed within 15 minutes of payment confirmation
- Customers can download invoices from their account dashboard

## Disputed Charges
- Customers must report disputed charges within 60 days of the transaction
- Disputes are investigated within 5 business days
- Fraudulent charges are escalated to the security team immediately

## Tax Handling
- Applicable taxes are calculated at checkout based on customer location
- Tax receipts are included in order invoices
- GST invoices available for Indian business customers upon request
