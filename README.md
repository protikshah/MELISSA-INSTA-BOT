# MELISSA-INSTA-BOT

Instagram chatbot built on Meta's official Instagram Messaging API.

## Features
- Command & event plugin architecture
- Role hierarchy (OWNER > VIP > PREMIUM > DEVELOPER > BOT_ADMIN > GROUP_ADMIN > USER)
- JSON / SQLite / MongoDB database adapters
- Webhook signature verification (HMAC SHA-256)
- Anti-spam, thread memory, rate limiting
- Graceful shutdown

## Setup
1. Clone the repo
2. `cp .env.example .env` and fill in your Meta credentials
3. `npm install`
4. `npm start`

## Health check
`GET /health` returns bot status.

## Webhook
Point your Meta App webhook to `https://<your-domain>/webhook`.
