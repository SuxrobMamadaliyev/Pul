const { Telegraf, Markup } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

// ═══════════════════════════════════════════════════════
//  SOZLAMALAR
// ═══════════════════════════════════════════════════════
const API_TOKEN   = process.env.API_TOKEN   || 'YOUR_BOT_TOKEN_HERE';
const ADMIN_ID    = Number(process.env.ADMIN_ID) || 7250754904;
const CHANNELS    = (process.env.CHANNELS   || '@instagram_top_sxema2').split(',').map(c => c.trim());
const REFERRAL_SUM = Number(process.env.REFERRAL_SUM) || 3000;
const MIN_WITHDRAW = Number(process.env.MIN_WITHDRAW)  || 50000;
const BET_AMOUNT   = Number(process.env.BET_AMOUNT)    || 5000;
const WIN_CHANCE   = Number(process.env.WIN_CHANCE)    || 45; // %

const bot = new Telegraf(API_TOKEN);

// ═══════════════════════════════════════════════════════
//  MA'LUMOTLAR BAZASI
// ═══════════════════════════════════════════════════════
const dbPath = path.join(__dirname, 'bot_bazasi.db');
const db = new sqlite3.Database(dbPath, err => {
  if (err) console.error('❌ Database xatosi:', err.message);
  else     console.log('✅ Database ulandi');
});

function initDb() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id         INTEGER PRIMARY KEY,
        balance    INTEGER DEFAULT 0,
        ref_count  INTEGER DEFAULT 0,
        game_count INTEGER DEFAULT 0,
        created_at TEXT    DEFAULT (datetime('now'))
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL,
        amount     INTEGER NOT NULL,
        status     TEXT    DEFAULT 'pending',
        created_at TEXT    DEFAULT (datetime('now'))
      )
    `);
  });
}
initDb();

// ── DB yordamchi funksiyalari ──────────────────────────

const dbGet = (sql, params = []) =>
  new Promise((res, rej) => db.get(sql, params, (err, row) => err ? rej(err) : res(row)));

const dbRun = (sql, params = []) =>
  new Promise((res, rej) => db.run(sql, params, function(err) { err ? rej(err) : res(this); }));

async function getUser(userId) {
  return dbGet('SELECT * FROM users WHERE id = ?', [userId]);
}

async function addUser(userId, refId = null) {
  const existing = await getUser(userId);
  if (existing) return false;

  await dbRun('INSERT INTO users (id) VALUES (?)', [userId]);

  if (refId) {
    const refInt = parseInt(refId, 10);
    if (!isNaN(refInt) && refInt !== userId) {
      const refUser = await getUser(refInt);
      if (refUser) {
        await dbRun(
          'UPDATE users SET balance = balance + ?, ref_count = ref_count + 1 WHERE id = ?',
          [REFERRAL_SUM, refInt]
        );
      }
    }
  }
  return true;
}

const updateBalance   = (id, delta)  => dbRun('UPDATE users SET balance    = balance    + ? WHERE id = ?', [delta, id]);
const setBalance      = (id, amount) => dbRun('UPDATE users SET balance    = ?            WHERE id = ?', [amount, id]);
const incGameCount    = (id)         => dbRun('UPDATE users SET game_count = game_count + 1 WHERE id = ?', [id]);

async function saveWithdrawal(userId, amount) {
  return dbRun(
    'INSERT INTO withdrawals (user_id, amount) VALUES (?, ?)',
    [userId, amount]
  );
}

// ═══════════════════════════════════════════════════════
//  KLAVIATURALAR
// ═══════════════════════════════════════════════════════
const mainMenu = () =>
  Markup.keyboard([
    ['🎰 Kazino', '👥 Referal'],
    ['💰 Balans', '💸 Pul yechish'],
  ]).resize();

// ═══════════════════════════════════════════════════════
//  MIDDLEWARE — Kanal obunasini tekshirish
// ═══════════════════════════════════════════════════════
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId || userId === ADMIN_ID) return next();

  for (const channel of CHANNELS) {
    try {
      const member = await ctx.telegram.getChatMember(channel, userId);
      if (['left', 'kicked'].includes(member.status)) {
        const name = channel.startsWith('@') ? channel.slice(1) : channel;
        return ctx.reply(
          '🔒 <b>Botdan foydalanish uchun kanalga a\'zo bo\'lishingiz kerak!</b>\n\n'
          + `📢 Kanal: ${channel}\n\n`
          + 'A\'zo bo\'lgach, /start ni bosing.',
          {
            parse_mode: 'HTML',
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.url(`✅ ${channel} — A\'zo bo\'lish`, `https://t.me/${name}`)],
            ]).reply_markup,
          }
        );
      }
    } catch (e) {
      console.warn(`Kanal tekshiruv xatosi (${channel}):`, e.message);
    }
  }
  return next();
});

// ═══════════════════════════════════════════════════════
//  /start
// ═══════════════════════════════════════════════════════
bot.command('start', async ctx => {
  try {
    const userId = ctx.from.id;
    const args   = ctx.message.text.split(' ')[1] || '';

    const isNew = await addUser(userId, args);

    // Referal beruvchini xabardor qilish
    if (isNew && args && !isNaN(parseInt(args, 10)) && parseInt(args, 10) !== userId) {
      ctx.telegram.sendMessage(
        parseInt(args, 10),
        `🎉 <b>Yangi referal keldi!</b>\n`
        + `👤 ${ctx.from.first_name} sizning havolangizdan ro'yxatdan o'tdi.\n`
        + `💰 +${REFERRAL_SUM.toLocaleString('uz-UZ')} so'm hisobingizga qo'shildi!`,
        { parse_mode: 'HTML' }
      ).catch(() => {});
    }

    await ctx.reply(
      `👋 <b>Assalomu alaykum, ${ctx.from.first_name}!</b>\n\n`
      + `🤑 Do'stlaringizni taklif qiling — har biri uchun <b>${REFERRAL_SUM.toLocaleString('uz-UZ')} so'm</b>!\n`
      + `🎰 Kazinoda omadingizni sinab ko'ring!\n`
      + `💸 ${MIN_WITHDRAW.toLocaleString('uz-UZ')} so'mdan boshlab pul yechishingiz mumkin.\n\n`
      + `Menyudan kerakli bo'limni tanlang 👇`,
      { parse_mode: 'HTML', reply_markup: mainMenu().reply_markup }
    );
  } catch (err) {
    console.error('/start xatosi:', err);
    ctx.reply("❌ Xatolik yuz berdi. Iltimos, keyinroq urinib ko'ring.").catch(() => {});
  }
});

// ═══════════════════════════════════════════════════════
//  💰 BALANS
// ═══════════════════════════════════════════════════════
bot.hears('💰 Balans', async ctx => {
  try {
    let user = await getUser(ctx.from.id);
    if (!user) {
      await addUser(ctx.from.id);
      user = await getUser(ctx.from.id);
    }

    const earned = user.ref_count * REFERRAL_SUM;

    await ctx.reply(
      `💰 <b>Hisobingiz</b>\n`
      + `━━━━━━━━━━━━━━━━━━\n`
      + `💵 Balans:       <b>${user.balance.toLocaleString('uz-UZ')} so'm</b>\n`
      + `👥 Referallar:   <b>${user.ref_count} ta</b>\n`
      + `🏆 O'yinlar:     <b>${user.game_count} ta</b>\n`
      + `💹 Jami daromad: <b>${earned.toLocaleString('uz-UZ')} so'm</b>\n`
      + `━━━━━━━━━━━━━━━━━━\n`
      + `📌 Minimal yechish: <b>${MIN_WITHDRAW.toLocaleString('uz-UZ')} so'm</b>`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    console.error('Balans xatosi:', err);
    ctx.reply('❌ Xatolik yuz berdi.').catch(() => {});
  }
});

// ═══════════════════════════════════════════════════════
//  👥 REFERAL
// ═══════════════════════════════════════════════════════
bot.hears('👥 Referal', async ctx => {
  try {
    const userId  = ctx.from.id;
    let user = await getUser(userId);
    if (!user) {
      await addUser(userId);
      user = await getUser(userId);
    }

    const botInfo = await ctx.telegram.getMe();
    const link    = `https://t.me/${botInfo.username}?start=${userId}`;

    await ctx.reply(
      `👥 <b>Referal tizimi</b>\n`
      + `━━━━━━━━━━━━━━━━━━\n`
      + `💰 Har bir do'st uchun: <b>${REFERRAL_SUM.toLocaleString('uz-UZ')} so'm</b>\n\n`
      + `🔗 <b>Sizning havola:</b>\n<code>${link}</code>\n\n`
      + `📊 Taklif qilganlar: <b>${user.ref_count} ta</b>\n`
      + `💵 Balans:           <b>${user.balance.toLocaleString('uz-UZ')} so'm</b>\n`
      + `━━━━━━━━━━━━━━━━━━\n`
      + `📤 Havolani nusxalab do'stlaringizga yuboring!`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    console.error('Referal xatosi:', err);
    ctx.reply('❌ Xatolik yuz berdi.').catch(() => {});
  }
});

// ═══════════════════════════════════════════════════════
//  🎰 KAZINO
// ═══════════════════════════════════════════════════════

// Foydalanuvchilar o'yindami? (flood oldini olish)
const activePlayers = new Set();

bot.hears('🎰 Kazino', async ctx => {
  const userId = ctx.from.id;

  if (activePlayers.has(userId)) {
    return ctx.reply('⏳ O\'yin hali tugamadi. Biroz kuting...');
  }

  try {
    let user = await getUser(userId);
    if (!user) {
      await addUser(userId);
      user = await getUser(userId);
    }

    if (user.balance < BET_AMOUNT) {
      return ctx.reply(
        `❌ <b>Mablag' yetarli emas!</b>\n\n`
        + `🎲 O'yin narxi:    <b>${BET_AMOUNT.toLocaleString('uz-UZ')} so'm</b>\n`
        + `💵 Sizda:          <b>${user.balance.toLocaleString('uz-UZ')} so'm</b>\n`
        + `🔺 Kerak bo'ladi:  <b>${(BET_AMOUNT - user.balance).toLocaleString('uz-UZ')} so'm</b>\n\n`
        + `👥 Referallar orqali balansni to'ldiring!`,
        { parse_mode: 'HTML' }
      );
    }

    activePlayers.add(userId);

    await ctx.reply('🎰 <b>G\'ildirak aylanmoqda...</b> Omad tilaymiz! 🍀', { parse_mode: 'HTML' });
    const diceMsg = await ctx.replyWithDice('🎰');
    const diceValue = diceMsg.dice?.value ?? 0;

    // Telegram slot: 64 = jackpot (777). Har qanday holatda random foydalanamiz.
    await new Promise(r => setTimeout(r, 3500));

    const won = Math.random() * 100 < WIN_CHANCE;
    const newBalance = won ? user.balance + BET_AMOUNT : user.balance - BET_AMOUNT;

    await updateBalance(userId, won ? BET_AMOUNT : -BET_AMOUNT);
    await incGameCount(userId);

    activePlayers.delete(userId);

    if (won) {
      await ctx.reply(
        `🎉 <b>YUTDINGIZ!</b> 🎉\n`
        + `━━━━━━━━━━━━━━━━━━\n`
        + `💰 Yutuq:      +<b>${BET_AMOUNT.toLocaleString('uz-UZ')} so'm</b>\n`
        + `💵 Yangi balans: <b>${newBalance.toLocaleString('uz-UZ')} so'm</b>\n`
        + `━━━━━━━━━━━━━━━━━━\n`
        + `🔄 Yana o'ynash uchun 🎰 tugmasini bosing!`,
        { parse_mode: 'HTML' }
      );
    } else {
      await ctx.reply(
        `😔 <b>Yutqazdingiz...</b>\n`
        + `━━━━━━━━━━━━━━━━━━\n`
        + `💸 Yutqazildi:   -<b>${BET_AMOUNT.toLocaleString('uz-UZ')} so'm</b>\n`
        + `💵 Yangi balans:  <b>${newBalance.toLocaleString('uz-UZ')} so'm</b>\n`
        + `━━━━━━━━━━━━━━━━━━\n`
        + `🍀 Yana urinib ko'ring! Omad sizi kutmoqda.`,
        { parse_mode: 'HTML' }
      );
    }
  } catch (err) {
    activePlayers.delete(userId);
    console.error('Kazino xatosi:', err);
    ctx.reply('❌ O\'yinni boshlashda xato yuz berdi. Keyinroq urinib ko\'ring.').catch(() => {});
  }
});

// ═══════════════════════════════════════════════════════
//  💸 PUL YECHISH
// ═══════════════════════════════════════════════════════
bot.hears('💸 Pul yechish', async ctx => {
  try {
    const userId = ctx.from.id;
    let user = await getUser(userId);
    if (!user) {
      await addUser(userId);
      user = await getUser(userId);
    }

    if (user.balance < MIN_WITHDRAW) {
      const needed = MIN_WITHDRAW - user.balance;
      return ctx.reply(
        `❌ <b>Pul yechish uchun mablag' yetarli emas.</b>\n\n`
        + `💵 Sizda:           <b>${user.balance.toLocaleString('uz-UZ')} so'm</b>\n`
        + `📌 Minimal summa:   <b>${MIN_WITHDRAW.toLocaleString('uz-UZ')} so'm</b>\n`
        + `🔺 Yana kerak:      <b>${needed.toLocaleString('uz-UZ')} so'm</b>\n\n`
        + `👥 Ko'proq referal jalb qiling!`,
        { parse_mode: 'HTML' }
      );
    }

    const amount = user.balance;

    // Avval bazaga yozamiz, keyin balansi nolga tushiramiz
    await saveWithdrawal(userId, amount);
    await setBalance(userId, 0);

    await ctx.reply(
      `✅ <b>So'rovingiz qabul qilindi!</b>\n\n`
      + `💰 Yechilayotgan summa: <b>${amount.toLocaleString('uz-UZ')} so'm</b>\n\n`
      + `⏳ So'rovingiz 24 soat ichida ko'rib chiqiladi.\n`
      + `📞 Savollar uchun adminga murojaat qiling.`,
      { parse_mode: 'HTML' }
    );

    // Admin xabardorlik
    await ctx.telegram.sendMessage(
      ADMIN_ID,
      `💸 <b>Yangi pul yechish so'rovi</b>\n`
      + `━━━━━━━━━━━━━━━━━━\n`
      + `👤 Ism:   ${ctx.from.first_name}${ctx.from.last_name ? ' ' + ctx.from.last_name : ''}\n`
      + `🆔 ID:    <code>${userId}</code>\n`
      + `📛 Login: ${ctx.from.username ? '@' + ctx.from.username : 'Yo\'q'}\n`
      + `💰 Summa: <b>${amount.toLocaleString('uz-UZ')} so'm</b>\n`
      + `━━━━━━━━━━━━━━━━━━`,
      {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Tasdiqlash', `approve_${userId}_${amount}`),
            Markup.button.callback('❌ Rad etish',  `reject_${userId}`),
          ],
        ]).reply_markup,
      }
    );
  } catch (err) {
    console.error('Pul yechish xatosi:', err);
    ctx.reply('❌ Xatolik yuz berdi. Keyinroq urinib ko\'ring.').catch(() => {});
  }
});

// ═══════════════════════════════════════════════════════
//  ADMIN — Inline callback (tasdiqlash/rad etish)
// ═══════════════════════════════════════════════════════
bot.action(/^approve_(\d+)_(\d+)$/, async ctx => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('❌ Ruxsat yo\'q');

  const targetId = parseInt(ctx.match[1], 10);
  const amount   = parseInt(ctx.match[2], 10);

  try {
    await ctx.telegram.sendMessage(
      targetId,
      `✅ <b>Pul yechish tasdiqlandi!</b>\n`
      + `💰 <b>${amount.toLocaleString('uz-UZ')} so'm</b> tez orada hisobingizga o'tkaziladi.`,
      { parse_mode: 'HTML' }
    );
    await ctx.editMessageText(
      ctx.callbackQuery.message.text + '\n\n✅ <b>TASDIQLANDI</b>',
      { parse_mode: 'HTML' }
    );
    await ctx.answerCbQuery('✅ Tasdiqlandi');
  } catch (err) {
    console.error('Approve xatosi:', err);
    ctx.answerCbQuery('❌ Xato yuz berdi');
  }
});

bot.action(/^reject_(\d+)$/, async ctx => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('❌ Ruxsat yo\'q');

  const targetId = parseInt(ctx.match[1], 10);

  try {
    // Balansi 0 bo'lgani uchun qayta tiklaymiz (minimal summa qaytariladi)
    await updateBalance(targetId, MIN_WITHDRAW);

    await ctx.telegram.sendMessage(
      targetId,
      `❌ <b>Pul yechish rad etildi.</b>\n\n`
      + `Mablag' hisobingizga qaytarildi.\n`
      + `📞 Batafsil ma'lumot uchun adminga murojaat qiling.`,
      { parse_mode: 'HTML' }
    );
    await ctx.editMessageText(
      ctx.callbackQuery.message.text + '\n\n❌ <b>RAD ETILDI</b>',
      { parse_mode: 'HTML' }
    );
    await ctx.answerCbQuery('❌ Rad etildi');
  } catch (err) {
    console.error('Reject xatosi:', err);
    ctx.answerCbQuery('❌ Xato yuz berdi');
  }
});

// ═══════════════════════════════════════════════════════
//  ADMIN BUYRUQLARI
// ═══════════════════════════════════════════════════════

// /stats — Statistika
bot.command('stats', async ctx => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('❌ Siz admin emassiz!');

  try {
    const row = await dbGet(`
      SELECT
        COUNT(*)       AS users,
        SUM(balance)   AS total_balance,
        SUM(ref_count) AS total_refs,
        SUM(game_count) AS total_games
      FROM users
    `);

    const wRow = await dbGet(`
      SELECT COUNT(*) AS wcount, COALESCE(SUM(amount), 0) AS wtotal
      FROM withdrawals
    `);

    await ctx.reply(
      `📊 <b>Bot statistikasi</b>\n`
      + `━━━━━━━━━━━━━━━━━━\n`
      + `👥 Foydalanuvchilar:  <b>${row.users || 0}</b>\n`
      + `💰 Jami balans:       <b>${(row.total_balance || 0).toLocaleString('uz-UZ')} so'm</b>\n`
      + `🔗 Jami referallar:   <b>${row.total_refs  || 0}</b>\n`
      + `🎰 Jami o'yinlar:     <b>${row.total_games || 0}</b>\n`
      + `━━━━━━━━━━━━━━━━━━\n`
      + `💸 Yechish so'rovlari: <b>${wRow.wcount || 0} ta</b>\n`
      + `💵 Jami yechilgan:    <b>${(wRow.wtotal || 0).toLocaleString('uz-UZ')} so'm</b>`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    console.error('Stats xatosi:', err);
    ctx.reply('❌ Statistikani yuklab bo\'lmadi.');
  }
});

// /addbalance <userId> <amount> — Balans qo'shish
bot.command('addbalance', async ctx => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('❌ Siz admin emassiz!');

  const parts = ctx.message.text.split(' ');
  if (parts.length < 3) return ctx.reply('❌ Format: /addbalance <userId> <miqdor>');

  const targetId = parseInt(parts[1], 10);
  const amount   = parseInt(parts[2], 10);

  if (isNaN(targetId) || isNaN(amount)) return ctx.reply('❌ Noto\'g\'ri format.');

  try {
    const user = await getUser(targetId);
    if (!user) return ctx.reply('❌ Foydalanuvchi topilmadi.');

    await updateBalance(targetId, amount);
    ctx.telegram.sendMessage(
      targetId,
      `💰 <b>Hisobingizga ${amount.toLocaleString('uz-UZ')} so'm qo'shildi!</b>`,
      { parse_mode: 'HTML' }
    ).catch(() => {});
    await ctx.reply(`✅ ${targetId} ga ${amount.toLocaleString('uz-UZ')} so'm qo'shildi.`);
  } catch (err) {
    console.error('addbalance xatosi:', err);
    ctx.reply('❌ Xatolik yuz berdi.');
  }
});

// /broadcast <xabar> — Barcha foydalanuvchilarga xabar
bot.command('broadcast', async ctx => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('❌ Siz admin emassiz!');

  const text = ctx.message.text.slice('/broadcast '.length).trim();
  if (!text) return ctx.reply('❌ Format: /broadcast <xabar matni>');

  db.all('SELECT id FROM users', [], async (err, rows) => {
    if (err) return ctx.reply('❌ Foydalanuvchilar ro\'yxatini olib bo\'lmadi.');

    let sent = 0, failed = 0;
    for (const row of rows) {
      try {
        await ctx.telegram.sendMessage(row.id, text, { parse_mode: 'HTML' });
        sent++;
      } catch {
        failed++;
      }
      // Telegram rate-limit: 30 msg/sec
      await new Promise(r => setTimeout(r, 35));
    }
    ctx.reply(`📢 Yuborildi: ${sent}, Xato: ${failed}`);
  });
});

// ═══════════════════════════════════════════════════════
//  NOMA'LUM XABAR
// ═══════════════════════════════════════════════════════
bot.on('message', async ctx => {
  ctx.reply(
    '❓ Bu buyruqni tushunmadim.\n\nMenyudan foydalaning 👇',
    { reply_markup: mainMenu().reply_markup }
  ).catch(() => {});
});

// ═══════════════════════════════════════════════════════
//  BOTNI ISHGA TUSHURISH  (Render.com — Webhook rejimi)
// ═══════════════════════════════════════════════════════
const express = require('express');
const app     = express();
const PORT    = Number(process.env.PORT) || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL; // masalan: https://myapp.onrender.com

if (!WEBHOOK_URL) {
  console.error('❌ WEBHOOK_URL env o\'zgaruvchisi topilmadi!');
  process.exit(1);
}

// Telegraf webhook uchun raw body kerak
app.use(express.json());

// Health-check
app.get('/', (_req, res) => res.send('OK'));

// Telegram webhook endpoint
app.post('/telegram', (req, res) => {
  bot.handleUpdate(req.body, res);
});

app.listen(PORT, async () => {
  console.log(`HTTP server port ${PORT} da ishlamoqda`);
  try {
    // Webhookni Telegram'ga ro'yxatdan o'tkazish
    await bot.telegram.setWebhook(`${WEBHOOK_URL}/telegram`);
    console.log(`✅ Webhook o'rnatildi: ${WEBHOOK_URL}/telegram`);
  } catch (err) {
    console.error('❌ Webhook o\'rnatishda xato:', err.message);
    process.exit(1);
  }
});

// Graceful shutdown
process.once('SIGINT',  () => { bot.telegram.deleteWebhook(); bot.stop('SIGINT');  });
process.once('SIGTERM', () => { bot.telegram.deleteWebhook(); bot.stop('SIGTERM'); });
