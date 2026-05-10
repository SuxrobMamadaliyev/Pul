# Pul Bot - Telegram Casino & Referral Bot

Node.js version of the Telegram bot with casino games and referral system.

## Features

- 🎰 Casino games with 45% win chance
- 👥 Referral system (3000 so'm per referral)
- 💰 Balance management
- 💸 Withdrawal system
- 📊 Admin statistics
- ✅ Channel subscription requirement

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Create `.env` file:
```
API_TOKEN=your_bot_token_here
WEBHOOK_URL=https://your-app-name.onrender.com
PORT=3000
```

### 3. Run Locally
```bash
npm run dev
```

### 4. Deploy to Render

1. Push code to GitHub
2. Go to [render.com](https://render.com)
3. Create new Web Service
4. Connect your GitHub repo
5. Set Build Command: `npm install`
6. Set Start Command: `node bot.js`
7. Add Environment Variables from `.env`
8. Deploy!

## Bot Commands

- `/start` - Start bot and register
- `/stats` - View bot statistics (admin only)

## Menu Options

- 🎰 Kazino - Play casino game
- 👥 Referal - Get referral link
- 💰 Balans - Check balance
- 💸 Pul yechish - Withdraw money

## Database

SQLite database (`bot_bazasi.db`) stores:
- User balances
- Referral counts
- Game statistics

## API

Uses Telegraf library for Telegram Bot API integration.

## License

MIT
