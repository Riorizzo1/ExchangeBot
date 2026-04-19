# ExchangeBot

Discord BST reputation bot for tracking proposed deals, dual-party confirmations, and admin approval.

## Planned flow
- A member creates a deal proposal
- Buyer and seller both confirm
- Admin approves or rejects
- Approved deals count toward public reputation history

## Admin model
Hybrid admin authorization:
- Discord role-based access via configured admin role IDs
- explicit Discord user allowlist via configured admin user IDs

## Commands
- `/deal-create`
- `/deal-confirm`
- `/deal-cancel`
- `/deal-view`
- `/rep`
- `/deal-history`
- `/admin-deal-approve`
- `/admin-deal-reject`

## Setup
1. Copy `.env.example` to `.env`
2. Fill in bot token, client ID, guild ID, and admin config
3. Install deps with `npm install`
4. Register commands with `npm run register`
5. Run with `npm start`
