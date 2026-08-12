# Escalation Rules

## Overview
Escalation rules define when and how support cases should be escalated to senior staff or specialized teams.

## Automatic Escalation Triggers
The following situations require immediate escalation without waiting for resolution attempts:
- Any report of unauthorized account access or fraud
- Payment disputes exceeding $500
- Cases involving regulatory or legal implications
- Data breach or privacy concern
- Complete service unavailability affecting multiple customers

## Escalation Levels

### Level 1 — Standard Support Agent
- Handles routine inquiries
- Can approve refunds up to $100
- Can create and assign support tickets
- Cannot access payment gateway directly

### Level 2 — Senior Support Agent
- Handles complex billing disputes
- Can approve refunds up to $500
- Can access billing system read-only
- Handles escalations from Level 1

### Level 3 — Billing Manager
- Handles all payment disputes
- Has full access to billing systems
- Can process refunds of any amount
- Coordinates with payment gateway for charge disputes

### Level 4 — Security / Legal Team
- Handles fraud, unauthorized access, regulatory issues
- Works with law enforcement if required

## Escalation for Payment + Order Issues
Specifically for cases where "payment was deducted but order was not created":

1. Classify as HIGH priority immediately
2. Assign to billing-capable agent (Level 2 or above)
3. Check payment gateway within 30 minutes
4. If payment confirmed and order missing: refund or recreate order within 2 hours
5. If unresolved in 2 hours: escalate to Level 3 (Billing Manager)
6. Document all steps taken in the ticket

## SLA for Escalated Tickets
| Priority | Initial Response | Resolution Target |
|----------|-----------------|-------------------|
| Critical | 15 minutes | 2 hours |
| High | 30 minutes | 4 hours |
| Medium | 2 hours | 24 hours |
| Low | 4 hours | 72 hours |

## Creating Escalation Tickets
When escalating, the new ticket must include:
- Original ticket ID
- All steps taken so far
- Why escalation is needed
- Customer impact assessment
- Any commitments made to the customer
