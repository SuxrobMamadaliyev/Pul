const { Telegraf, Markup } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

// --- SETTINGS ---
const API_TOKEN = process.env.API_TOKEN || '8611357164:AAHkJ0YywP7zvKW4nGY84dRsMSMva_pTOfM';
const ADMIN_ID = 7250754904;
const CHANNELS = ['@pulishla_z_community'];
const REFERRAL_SUM = 3000;
const MIN_WITHDRAW = 50000;

const bot = new Telegraf(API_TOKEN);

// --- DATABASE ---
const dbPath = path.join(__dirname, 'bot_bazasi.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Database error:', err);
  else console.log('Connected to database');
});

// Initialize database
function initDb() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      balance INTEGER DEFAULT 0,
      ref_count INTEGER DEFAULT 0,
      game_count INTEGER DEFAULT 0
    )
  `);
}

initDb();

// Database helper functions
function getUser(userId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function addUser(userId, refId = null) {
  return new Promise(async (resolve, reject) => {
    try {
      const user = await getUser(userId);
      if (user) {
        resolve(false);
        return;
      }

      db.run('INSERT INTO users (id, balance) VALUES (?, 0)', [userId], async (err) => {
        if (err) {
          reject(err);
          return;
        }

        if (refId && !isNaN(refId)) {
          const refInt = parseInt(refId);
          if (refInt !== userId) {
            const refUser = await getUser(refInt);
            if (refUser) {
              db.run(
                'UPDATE users SET balance = balance + ?, ref_count = ref_count + 1 WHERE id = ?',
                [REFERRAL_SUM, refInt]
              );
            }
          }
        }
        resolve(true);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function updateUserBalance(userId, amount) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [amount, userId], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function setUserBalance(userId, amount) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE users SET balance = ? WHERE id = ?', [amount, userId], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function incrementGameCount(userId) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE users SET game_count = game_count + 1 WHERE id = ?', [userId], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// --- MIDDLEWARE: Check subscription ---
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  
  if (userId && userId !== ADMIN_ID) {
    for (const channel of CHANNELS) {
      try {
        const member = await ctx.telegram.getChatMember(channel, userId);
        if (member.status === 'left' || member.status === 'kicked') {
          const keyboard = Markup.inlineKeyboard([
            Markup.button.url('✅ A\'zo bo\'lish', `https://t.me/${channel.substring(1)}`)
          ]);
          
          await ctx.reply(
            '<b>❌ Botdan foydalanish uchun kanalga a\'zo bo\'ling!</b>\n\n' +
            'A\'zo bo\'lgach, /start buyrug\'ini yuboring.',
            { parse_mode: 'HTML', reply_markup: keyboard.reply_markup }
          );
          return;
        }
      } catch (error) {
        console.warn(`Channel check error: ${error.message}`);
      }
    }
  }
  
  return next();
});

// --- MAIN MENU ---
function mainMenuKeyboard() {
  return Markup.keyboard([
    ['🎰 Kazino', '👥 Referal'],
    ['💰 Balans', '💸 Pul yechish']
  ]).resize();
}

// --- /start ---
bot.command('start', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const args = ctx.match ? ctx.match.trim() : '';
    
    const isNew = await addUser(userId, args);
    
    if (isNew && args && !isNaN(args) && parseInt(args) !== userId) {
      try {
        await ctx.telegram.sendMessage(
          parseInt(args),
          '🎉 <b>Yangi referal!</b> +3 000 so\'m hisobingizga qo\'shildi!',
          { parse_mode: 'HTML' }
        );
      } catch (error) {
        console.log('Could not notify referrer');
      }
    }

    await ctx.reply(
      `👋 <b>Xush kelibsiz, ${ctx.from.first_name}!</b>\n\n` +
      '💸 Referal ulashing va pul ishlang!\n' +
      '🎰 Kazinoda omadingizni sinab ko\'ring!\n\n' +
      'Quyidagi menyudan tanlang:',
      { parse_mode: 'HTML', reply_markup: mainMenuKeyboard().reply_markup }
    );
  } catch (error) {
    console.error('Start error:', error);
    await ctx.reply('❌ Xato yuz berdi. Keyinroq urinib ko\'ring.');
  }
});

// --- BALANCE ---
bot.hears('💰 Balans', async (ctx) => {
  try {
    const user = await getUser(ctx.from.id);
    if (!user) {
      await ctx.reply('Avval /start bosing.');
      return;
    }

    await ctx.reply(
      `💰 <b>Hisobingiz:</b> ${user.balance.toLocaleString('en')} so'm\n` +
      `👥 <b>Referallar:</b> ${user.ref_count} ta\n\n` +
      `Har bir referal uchun: <b>${REFERRAL_SUM.toLocaleString('en')} so'm</b>`,
      { parse_mode: 'HTML' }
    );
  } catch (error) {
    console.error('Balance error:', error);
    await ctx.reply('❌ Xato yuz berdi.');
  }
});

// --- REFERRAL ---
bot.hears('👥 Referal', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const botInfo = await ctx.telegram.getMe();
    const link = `https://t.me/${botInfo.username}?start=${userId}`;
    
    const user = await getUser(userId);
    const refs = user?.ref_count || 0;
    const bal = user?.balance || 0;

    await ctx.reply(
      `👥 <b>Referal tizimi</b>\n\n` +
      `Do'stlaringizni taklif qiling va har biri uchun <b>${REFERRAL_SUM.toLocaleString('en')} so'm</b> oling!\n\n` +
      `🔗 Sizning havolangiz:\n<code>${link}</code>\n\n` +
      `📊 Jami referallar: <b>${refs} ta</b>\n` +
      `💰 Balans: <b>${bal.toLocaleString('en')} so'm</b>`,
      { parse_mode: 'HTML' }
    );
  } catch (error) {
    console.error('Referral error:', error);
    await ctx.reply('❌ Xato yuz berdi.');
  }
});

// --- CASINO ---
bot.hears('🎰 Kazino', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const user = await getUser(userId);
    
    if (!user) {
      await ctx.reply('Avval /start bosing.');
      return;
    }

    const bal = user.balance;
    const bet = 5000;

    if (bal < bet) {
      await ctx.reply(
        `❌ O'yin uchun kamida <b>${bet.toLocaleString('en')} so'm</b> kerak!\n` +
        `Sizda: <b>${bal.toLocaleString('en')} so'm</b>\n\n` +
        'Referal ulashing va balans to\'ldiring 👥',
        { parse_mode: 'HTML' }
      );
      return;
    }

    await ctx.reply('🎰 G\'ildirak aylanmoqda...');
    await ctx.replyWithDice('🎰');
    
    // Wait 3 seconds
    await new Promise(resolve => setTimeout(resolve, 3000));

    const chance = 45;
    const won = Math.random() * 100 <= chance;

    await incrementGameCount(userId);

    if (won) {
      await updateUserBalance(userId, bet);
      await ctx.reply(
        `🎉 <b>Tabriklaymiz! Yutdingiz!</b>\n` +
        `💰 +${bet.toLocaleString('en')} so'm\n` +
        `💼 Yangi balans: <b>${(bal + bet).toLocaleString('en')} so'm</b>`,
        { parse_mode: 'HTML' }
      );
    } else {
      await updateUserBalance(userId, -bet);
      const newBal = bal - bet;
      await ctx.reply(
        `😔 <b>Yutqazdingiz.</b>\n` +
        `💸 -${bet.toLocaleString('en')} so'm\n` +
        `💼 Yangi balans: <b>${newBal.toLocaleString('en')} so'm</b>\n\n` +
        'Yana bir bor urinib ko\'ring! 🍀',
        { parse_mode: 'HTML' }
      );
    }
  } catch (error) {
    console.error('Casino error:', error);
    await ctx.reply('❌ O\'yinni boshlashda xato. Keyinroq urinib ko\'ring.');
  }
});

// --- WITHDRAW ---
bot.hears('💸 Pul yechish', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const user = await getUser(userId);
    
    if (!user) {
      await ctx.reply('Avval /start bosing.');
      return;
    }

    const bal = user.balance;

    if (bal < MIN_WITHDRAW) {
      const needed = MIN_WITHDRAW - bal;
      await ctx.reply(
        `❌ <b>Yechish uchun yetarli mablag' yo'q.</b>\n\n` +
        `💰 Sizda: <b>${bal.toLocaleString('en')} so'm</b>\n` +
        `📌 Minimal summa: <b>${MIN_WITHDRAW.toLocaleString('en')} so'm</b>\n` +
        `🔺 Yana kerak: <b>${needed.toLocaleString('en')} so'm</b>\n\n` +
        'Referallar orqali balans to\'ldiring 👥',
        { parse_mode: 'HTML' }
      );
    } else {
      await setUserBalance(userId, 0);
      
      await ctx.reply(
        `✅ <b>Pul yechish so'rovi qabul qilindi!</b>\n\n` +
        `💰 Yechilayotgan summa: <b>${bal.toLocaleString('en')} so'm</b>\n\n` +
        'So\'rovingiz adminга yuborildi. 24 soat ichida ko\'rib chiqiladi.',
        { parse_mode: 'HTML' }
      );

      await ctx.telegram.sendMessage(
        ADMIN_ID,
        `💸 <b>Pul yechish so'rovi</b>\n\n` +
        `👤 Foydalanuvchi: ${ctx.from.first_name} ${ctx.from.last_name || ''}\n` +
        `🆔 ID: <code>${userId}</code>\n` +
        `💰 Summa: <b>${bal.toLocaleString('en')} so'm</b>`,
        { parse_mode: 'HTML' }
      );
    }
  } catch (error) {
    console.error('Withdraw error:', error);
    await ctx.reply('❌ Xato yuz berdi. Keyinroq urinib ko\'ring.');
  }
});

// --- ADMIN: Stats ---
bot.command('stats', async (ctx) => {
  try {
    if (ctx.from.id !== ADMIN_ID) {
      await ctx.reply('❌ Siz admin emassiz!');
      return;
    }

    db.get('SELECT COUNT(*) as count, SUM(balance) as total_bal, SUM(ref_count) as total_refs FROM users', [], async (err, row) => {
      if (err) {
        await ctx.reply('❌ Xato yuz berdi.');
        return;
      }

      const count = row.count || 0;
      const totalBal = row.total_bal || 0;
      const totalRefs = row.total_refs || 0;

      await ctx.reply(
        `📊 <b>Bot statistikasi</b>\n\n` +
        `👥 Foydalanuvchilar: <b>${count}</b>\n` +
        `💰 Jami balans: <b>${totalBal.toLocaleString('en')} so'm</b>\n` +
        `🔗 Jami referallar: <b>${totalRefs}</b>`,
        { parse_mode: 'HTML' }
      );
    });
  } catch (error) {
    console.error('Stats error:', error);
  }
});

// --- UNKNOWN MESSAGE ---
bot.on('message', async (ctx) => {
  try {
    await ctx.reply(
      '❓ Noto\'g\'ri buyruq. Menyudan foydalaning:',
      { reply_markup: mainMenuKeyboard().reply_markup }
    );
  } catch (error) {
    console.error('Unknown message error:', error);
  }
});

// --- START BOT ---
const PORT = process.env.PORT || 3000;

bot.launch({
  webhook: {
    domain: process.env.WEBHOOK_URL || `http://localhost:${PORT}`,
    port: PORT,
    path: '/telegram'
  }
}).then(() => {
  console.log('Bot started successfully');
}).catch((error) => {
  console.error('Bot start error:', error);
  process.exit(1);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
