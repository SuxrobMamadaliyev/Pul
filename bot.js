'use strict';
const { Telegraf, Markup } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();
const express = require('express');
const path    = require('path');
require('dotenv').config();

// ════════════════════════════════════════════════════════════════
//  BOSHLANG'ICH SOZLAMALAR  (env dan o'qiladi)
// ════════════════════════════════════════════════════════════════
const API_TOKEN   = process.env.API_TOKEN || '8611357164:AAHkJ0YywP7zvKW4nGY84dRsMSMva_pTOfM';
const ADMIN_ID    = Number(process.env.ADMIN_ID) || 7250754904;
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://pul-a0i4.onrender.com';
const PORT        = Number(process.env.PORT) || 3000;

// ════════════════════════════════════════════════════════════════
//  MA'LUMOTLAR BAZASI
// ════════════════════════════════════════════════════════════════
const db = new sqlite3.Database(path.join(__dirname, 'bot.db'), err => {
  if (err) console.error('DB xato:', err.message);
  else     console.log('✅ DB ulandi');
});

const dbGet  = (sql, p = []) => new Promise((ok, no) => db.get(sql, p, (e, r) => e ? no(e) : ok(r)));
const dbAll  = (sql, p = []) => new Promise((ok, no) => db.all(sql, p, (e, r) => e ? no(e) : ok(r)));
const dbRun  = (sql, p = []) => new Promise((ok, no) => db.run(sql, p, function(e){ e ? no(e) : ok(this); }));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS channels (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY,
    balance    INTEGER DEFAULT 0,
    ref_count  INTEGER DEFAULT 0,
    game_count INTEGER DEFAULT 0,
    wins       INTEGER DEFAULT 0,
    losses     INTEGER DEFAULT 0,
    created_at TEXT    DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS withdrawals (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER,
    amount     INTEGER,
    status     TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // Default sozlamalar
  db.run(`INSERT OR IGNORE INTO settings VALUES ('referral_sum',  '3000')`);
  db.run(`INSERT OR IGNORE INTO settings VALUES ('min_withdraw',  '50000')`);
  db.run(`INSERT OR IGNORE INTO settings VALUES ('bet_amount',    '5000')`);
  db.run(`INSERT OR IGNORE INTO settings VALUES ('win_chance',    '45')`);
  db.run(`INSERT OR IGNORE INTO settings VALUES ('sub_required',  '1')`);

  // Default kanal
  db.run(`INSERT OR IGNORE INTO channels (name) VALUES ('@pulishla_z_community')`);
});

// ════════════════════════════════════════════════════════════════
//  SOZLAMALAR YORDAMCHILARI
// ════════════════════════════════════════════════════════════════
const getSetting = async key => {
  const row = await dbGet('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : null;
};
const setSetting = (key, val) => dbRun('INSERT OR REPLACE INTO settings VALUES (?, ?)', [key, String(val)]);

const getChannels = () => dbAll('SELECT name FROM channels ORDER BY id');
const addChannel  = name => dbRun('INSERT OR IGNORE INTO channels (name) VALUES (?)', [name]);
const delChannel  = name => dbRun('DELETE FROM channels WHERE name = ?', [name]);

// ════════════════════════════════════════════════════════════════
//  FOYDALANUVCHI YORDAMCHILARI
// ════════════════════════════════════════════════════════════════
const getUser = id => dbGet('SELECT * FROM users WHERE id = ?', [id]);

async function ensureUser(id, refId = null) {
  const existing = await getUser(id);
  if (existing) return false;
  await dbRun('INSERT INTO users (id) VALUES (?)', [id]);
  if (refId) {
    const ref = parseInt(refId, 10);
    if (!isNaN(ref) && ref !== id) {
      const refUser = await getUser(ref);
      if (refUser) {
        const refSum = Number(await getSetting('referral_sum'));
        await dbRun('UPDATE users SET balance = balance + ?, ref_count = ref_count + 1 WHERE id = ?', [refSum, ref]);
      }
    }
  }
  return true;
}

const addBalance = (id, d)  => dbRun('UPDATE users SET balance = balance + ? WHERE id = ?', [d, id]);
const setBalance = (id, v)  => dbRun('UPDATE users SET balance = ? WHERE id = ?', [v, id]);
const incGame    = (id, win) => dbRun(
  `UPDATE users SET game_count = game_count+1,
   wins = wins + ?, losses = losses + ? WHERE id = ?`,
  [win ? 1 : 0, win ? 0 : 1, id]
);

// ════════════════════════════════════════════════════════════════
//  BOT
// ════════════════════════════════════════════════════════════════
const bot = new Telegraf(API_TOKEN);

// ── KLAVIATURALAR ──────────────────────────────────────────────
const mainMenu = () => Markup.keyboard([
  ['🎰 Kazino', '👥 Referal ulashish'],
  ['💰 Balans', '💸 Pul yechish'],
]).resize();

const adminMenu = () => Markup.keyboard([
  ['📊 Statistika', '📢 Xabar yuborish'],
  ['📋 Kanallar',   '⚙️ Sozlamalar'],
  ['👤 Foydalanuvchi', '💳 Balans berish'],
  ['🚪 Chiqish'],
]).resize();

// ── ADMIN TEKSHIRUV ────────────────────────────────────────────
const isAdmin = ctx => ctx.from?.id === ADMIN_ID;

// ── KANAL OBUNASI MIDDLEWARE ───────────────────────────────────
bot.use(async (ctx, next) => {
  if (!ctx.from) return next();
  if (isAdmin(ctx)) return next();

  const subRequired = await getSetting('sub_required');
  if (subRequired !== '1') return next();

  const channels = await getChannels();
  if (!channels.length) return next();

  const notSubscribed = [];
  for (const ch of channels) {
    try {
      const m = await ctx.telegram.getChatMember(ch.name, ctx.from.id);
      if (['left', 'kicked'].includes(m.status)) notSubscribed.push(ch.name);
    } catch {
      // kanal tekshirib bo'lmasa o'tkazib yuboramiz
    }
  }

  if (notSubscribed.length === 0) return next();

  const buttons = notSubscribed.map(ch => {
    const slug = ch.startsWith('@') ? ch.slice(1) : ch;
    return [Markup.button.url(`📢 ${ch}`, `https://t.me/${slug}`)];
  });
  buttons.push([Markup.button.callback('✅ Tekshirish', 'check_sub')]);

  return ctx.reply(
    '🔒 <b>Botdan foydalanish uchun quyidagi kanallarga a\'zo bo\'ling:</b>',
    {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
    }
  );
});

// Obunani tekshirish tugmasi
bot.action('check_sub', async ctx => {
  const channels = await getChannels();
  const notSub = [];
  for (const ch of channels) {
    try {
      const m = await ctx.telegram.getChatMember(ch.name, ctx.from.id);
      if (['left', 'kicked'].includes(m.status)) notSub.push(ch.name);
    } catch {}
  }
  if (notSub.length === 0) {
    await ctx.answerCbQuery('✅ Rahmat! Endi botdan foydalanishingiz mumkin.');
    await ctx.deleteMessage().catch(() => {});
    // /start ga yo'naltirish
    await ctx.reply(
      `👋 <b>Xush kelibsiz!</b>\nMenyudan kerakli bo'limni tanlang 👇`,
      { parse_mode: 'HTML', reply_markup: mainMenu().reply_markup }
    );
  } else {
    await ctx.answerCbQuery('❌ Hali ham a\'zo emassiz!', { show_alert: true });
  }
});

// ════════════════════════════════════════════════════════════════
//  /start
// ════════════════════════════════════════════════════════════════
bot.command('start', async ctx => {
  const userId = ctx.from.id;
  const arg    = ctx.message.text.split(' ')[1] || '';

  if (arg === 'admin' && isAdmin(ctx)) {
    return ctx.reply(
      '👑 <b>Admin panelga xush kelibsiz!</b>',
      { parse_mode: 'HTML', reply_markup: adminMenu().reply_markup }
    );
  }

  const isNew = await ensureUser(userId, arg);

  if (isNew && arg && !isNaN(Number(arg)) && Number(arg) !== userId) {
    const refSum = Number(await getSetting('referral_sum'));
    bot.telegram.sendMessage(
      Number(arg),
      `🎉 <b>Yangi referal!</b>\n👤 ${ctx.from.first_name} qo'shildi\n💰 +${refSum.toLocaleString()} so'm`,
      { parse_mode: 'HTML' }
    ).catch(() => {});
  }

  const refSum     = Number(await getSetting('referral_sum'));
  const minWithdraw = Number(await getSetting('min_withdraw'));

  await ctx.reply(
    `👋 <b>Assalomu alaykum, ${ctx.from.first_name}!</b>\n\n`
    + `🤑 Har bir referal uchun <b>${refSum.toLocaleString()} so'm</b>!\n`
    + `🎰 Kazinoda omadingizni sinab ko'ring!\n`
    + `💸 <b>${minWithdraw.toLocaleString()} so'm</b>dan boshlab pul yechish\n\n`
    + `Menyudan tanlang 👇`,
    { parse_mode: 'HTML', reply_markup: mainMenu().reply_markup }
  );
});

// ════════════════════════════════════════════════════════════════
//  💰 BALANS
// ════════════════════════════════════════════════════════════════
bot.hears('💰 Balans', async ctx => {
  const userId = ctx.from.id;
  await ensureUser(userId);
  const user = await getUser(userId);
  const refSum = Number(await getSetting('referral_sum'));
  const minW   = Number(await getSetting('min_withdraw'));

  await ctx.reply(
    `💰 <b>Hisobingiz</b>\n`
    + `━━━━━━━━━━━━━━━━━━━━\n`
    + `💵 Balans:        <b>${user.balance.toLocaleString()} so'm</b>\n`
    + `👥 Referallar:    <b>${user.ref_count} ta</b>\n`
    + `🎰 O'yinlar:      <b>${user.game_count} ta</b>\n`
    + `✅ Yutganlar:     <b>${user.wins} ta</b>\n`
    + `❌ Yutqazganlar:  <b>${user.losses} ta</b>\n`
    + `━━━━━━━━━━━━━━━━━━━━\n`
    + `📌 Minimal yechish: <b>${minW.toLocaleString()} so'm</b>\n`
    + `💎 Har referal: <b>${refSum.toLocaleString()} so'm</b>`,
    { parse_mode: 'HTML' }
  );
});

// ════════════════════════════════════════════════════════════════
//  👥 REFERAL ULASHISH
// ════════════════════════════════════════════════════════════════
bot.hears('👥 Referal ulashish', async ctx => {
  const userId = ctx.from.id;
  await ensureUser(userId);
  const user    = await getUser(userId);
  const botInfo = await ctx.telegram.getMe();
  const link    = `https://t.me/${botInfo.username}?start=${userId}`;
  const refSum  = Number(await getSetting('referral_sum'));

  await ctx.reply(
    `👥 <b>Referal tizimi</b>\n`
    + `━━━━━━━━━━━━━━━━━━━━\n`
    + `💰 Har bir do'st uchun: <b>${refSum.toLocaleString()} so'm</b>\n\n`
    + `🔗 <b>Sizning havola:</b>\n<code>${link}</code>\n\n`
    + `📊 Jalb qilganlar: <b>${user.ref_count} ta</b>\n`
    + `💵 Balans: <b>${user.balance.toLocaleString()} so'm</b>\n`
    + `━━━━━━━━━━━━━━━━━━━━\n`
    + `📤 Havolani ulashing va daromad qiling!`,
    {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.switchToChat('📤 Do\'stlarga ulashish', `Men seni bu botga taklif qilyapman! ${link}`)],
        [Markup.button.url('📢 Kanalga ulashish', `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('🎰 Bu bot orqali pul ishlashingiz mumkin!')}`)],
      ]).reply_markup,
    }
  );
});

// ════════════════════════════════════════════════════════════════
//  🎰 KAZINO
// ════════════════════════════════════════════════════════════════
const activePlayers = new Set();

// Kazino bosh menyu
bot.hears('🎰 Kazino', async ctx => {
  const userId = ctx.from.id;
  await ensureUser(userId);
  const user    = await getUser(userId);
  const bet     = Number(await getSetting('bet_amount'));

  await ctx.reply(
    `🎰 <b>Kazino</b>\n`
    + `━━━━━━━━━━━━━━━━━━━━\n`
    + `💵 Balansingiz: <b>${user.balance.toLocaleString()} so'm</b>\n`
    + `🎲 Stavka: <b>${bet.toLocaleString()} so'm</b>\n\n`
    + `O'yin turini tanlang:`,
    {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🎰 Slot mashina',    'game_slot')],
        [Markup.button.callback('🎲 Zar o\'yini',     'game_dice')],
        [Markup.button.callback('🏀 Basketbol',       'game_basket')],
        [Markup.button.callback('⚽ Futbol',          'game_football')],
        [Markup.button.callback('🎯 Nishon',          'game_darts')],
      ]).reply_markup,
    }
  );
});

// O'yin logikasi
async function playGame(ctx, emoji) {
  const userId = ctx.from.id;

  if (activePlayers.has(userId)) {
    return ctx.answerCbQuery("⏳ O'yin hali tugamadi!", { show_alert: true });
  }

  await ctx.answerCbQuery();
  await ensureUser(userId);
  const user = await getUser(userId);
  const bet  = Number(await getSetting('bet_amount'));
  const winChance = Number(await getSetting('win_chance'));

  if (user.balance < bet) {
    return ctx.reply(
      `❌ <b>Mablag' yetarli emas!</b>\n\n`
      + `🎲 Stavka: <b>${bet.toLocaleString()} so'm</b>\n`
      + `💵 Sizda: <b>${user.balance.toLocaleString()} so'm</b>\n\n`
      + `👥 Referal orqali balansni to'ldiring!`,
      { parse_mode: 'HTML' }
    );
  }

  activePlayers.add(userId);

  try {
    await ctx.reply(`🎮 <b>O'yin boshlandi!</b> Omad tilaymiz! 🍀`, { parse_mode: 'HTML' });
    const diceMsg = await ctx.replyWithDice(emoji);
    const diceVal = diceMsg.dice?.value ?? 0;

    // Kutish (animatsiya tugashini kutish)
    const waitMap = { '🎰': 3000, '🎲': 2000, '🏀': 3000, '⚽': 3000, '🎯': 3000 };
    await new Promise(r => setTimeout(r, waitMap[emoji] || 2500));

    // Slot uchun maxsus: 1=yo'q, 22=jackpot, boshqalar — random
    let won;
    if (emoji === '🎰') {
      won = diceVal === 64; // 64 = 777 jackpot Telegramda
      if (!won) won = Math.random() * 100 < winChance;
    } else {
      won = Math.random() * 100 < winChance;
    }

    await addBalance(userId, won ? bet : -bet);
    await incGame(userId, won);
    const updUser = await getUser(userId);

    activePlayers.delete(userId);

    if (won) {
      await ctx.reply(
        `🎉 <b>YUTDINGIZ!</b> 🎉\n`
        + `━━━━━━━━━━━━━━━━━━━━\n`
        + `💰 Yutuq: <b>+${bet.toLocaleString()} so'm</b>\n`
        + `💵 Yangi balans: <b>${updUser.balance.toLocaleString()} so'm</b>\n`
        + `━━━━━━━━━━━━━━━━━━━━`,
        {
          parse_mode: 'HTML',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Yana o\'ynash', `game_${emoji === '🎰' ? 'slot' : emoji === '🎲' ? 'dice' : emoji === '🏀' ? 'basket' : emoji === '⚽' ? 'football' : 'darts'}`)],
          ]).reply_markup,
        }
      );
    } else {
      await ctx.reply(
        `😔 <b>Yutqazdingiz...</b>\n`
        + `━━━━━━━━━━━━━━━━━━━━\n`
        + `💸 Yutqazildi: <b>-${bet.toLocaleString()} so'm</b>\n`
        + `💵 Yangi balans: <b>${updUser.balance.toLocaleString()} so'm</b>\n`
        + `━━━━━━━━━━━━━━━━━━━━\n`
        + `🍀 Yana urinib ko'ring!`,
        {
          parse_mode: 'HTML',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Yana o\'ynash', `game_${emoji === '🎰' ? 'slot' : emoji === '🎲' ? 'dice' : emoji === '🏀' ? 'basket' : emoji === '⚽' ? 'football' : 'darts'}`)],
          ]).reply_markup,
        }
      );
    }
  } catch (err) {
    activePlayers.delete(userId);
    console.error('O\'yin xatosi:', err);
    ctx.reply('❌ Xato yuz berdi.').catch(() => {});
  }
}

bot.action('game_slot',     ctx => playGame(ctx, '🎰'));
bot.action('game_dice',     ctx => playGame(ctx, '🎲'));
bot.action('game_basket',   ctx => playGame(ctx, '🏀'));
bot.action('game_football', ctx => playGame(ctx, '⚽'));
bot.action('game_darts',    ctx => playGame(ctx, '🎯'));

// ════════════════════════════════════════════════════════════════
//  💸 PUL YECHISH
// ════════════════════════════════════════════════════════════════
bot.hears('💸 Pul yechish', async ctx => {
  const userId = ctx.from.id;
  await ensureUser(userId);
  const user   = await getUser(userId);
  const minW   = Number(await getSetting('min_withdraw'));

  if (user.balance < minW) {
    return ctx.reply(
      `❌ <b>Yetarli mablag' yo'q!</b>\n\n`
      + `💵 Sizda: <b>${user.balance.toLocaleString()} so'm</b>\n`
      + `📌 Kerak: <b>${minW.toLocaleString()} so'm</b>\n`
      + `🔺 Yana: <b>${(minW - user.balance).toLocaleString()} so'm</b>`,
      { parse_mode: 'HTML' }
    );
  }

  const amount = user.balance;
  await dbRun('INSERT INTO withdrawals (user_id, amount) VALUES (?, ?)', [userId, amount]);
  await setBalance(userId, 0);

  await ctx.reply(
    `✅ <b>So'rovingiz qabul qilindi!</b>\n\n`
    + `💰 Summa: <b>${amount.toLocaleString()} so'm</b>\n`
    + `⏳ 24 soat ichida ko'rib chiqiladi.`,
    { parse_mode: 'HTML' }
  );

  await bot.telegram.sendMessage(
    ADMIN_ID,
    `💸 <b>Pul yechish so'rovi</b>\n`
    + `━━━━━━━━━━━━━━━━━━━━\n`
    + `👤 ${ctx.from.first_name} ${ctx.from.last_name || ''}\n`
    + `🆔 <code>${userId}</code>\n`
    + `📛 ${ctx.from.username ? '@' + ctx.from.username : 'username yo\'q'}\n`
    + `💰 <b>${amount.toLocaleString()} so'm</b>\n`
    + `━━━━━━━━━━━━━━━━━━━━`,
    {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Tasdiqlash', `aw_${userId}_${amount}`),
          Markup.button.callback('❌ Rad etish',  `rw_${userId}_${amount}`),
        ],
      ]).reply_markup,
    }
  ).catch(() => {});
});

bot.action(/^aw_(\d+)_(\d+)$/, async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('❌ Ruxsat yo\'q');
  const [, uid, amt] = ctx.match;
  await ctx.telegram.sendMessage(Number(uid),
    `✅ <b>${Number(amt).toLocaleString()} so'm tasdiqlandi!</b>\nTez orada o'tkaziladi.`,
    { parse_mode: 'HTML' }
  ).catch(() => {});
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  await ctx.answerCbQuery('✅ Tasdiqlandi');
  await ctx.reply(`✅ ${uid} ga ${Number(amt).toLocaleString()} so'm tasdiqlandi.`);
});

bot.action(/^rw_(\d+)_(\d+)$/, async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('❌ Ruxsat yo\'q');
  const [, uid, amt] = ctx.match;
  await addBalance(Number(uid), Number(amt));
  await ctx.telegram.sendMessage(Number(uid),
    `❌ <b>Pul yechish rad etildi.</b>\nMablag' hisobingizga qaytarildi.`,
    { parse_mode: 'HTML' }
  ).catch(() => {});
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  await ctx.answerCbQuery('❌ Rad etildi');
  await ctx.reply(`❌ ${uid} ga ${Number(amt).toLocaleString()} so'm qaytarildi.`);
});

// ════════════════════════════════════════════════════════════════
//  👑 ADMIN PANEL
// ════════════════════════════════════════════════════════════════

// Admin menyuga kirish
bot.hears(/^\/admin$/, async ctx => {
  if (!isAdmin(ctx)) return;
  await ctx.reply('👑 <b>Admin panel</b>', { parse_mode: 'HTML', reply_markup: adminMenu().reply_markup });
});

// ── 📊 Statistika ─────────────────────────────────────────────
bot.hears('📊 Statistika', async ctx => {
  if (!isAdmin(ctx)) return;
  const r  = await dbGet('SELECT COUNT(*) u, COALESCE(SUM(balance),0) b, COALESCE(SUM(ref_count),0) rf, COALESCE(SUM(game_count),0) g FROM users');
  const w  = await dbGet('SELECT COUNT(*) c, COALESCE(SUM(amount),0) s FROM withdrawals');
  const pw = await dbGet("SELECT COUNT(*) c FROM withdrawals WHERE status='pending'");
  const channels = await getChannels();

  await ctx.reply(
    `📊 <b>BOT STATISTIKASI</b>\n`
    + `━━━━━━━━━━━━━━━━━━━━\n`
    + `👥 Foydalanuvchilar: <b>${r.u}</b>\n`
    + `💰 Jami balans:      <b>${Number(r.b).toLocaleString()} so'm</b>\n`
    + `🔗 Jami referallar:  <b>${r.rf}</b>\n`
    + `🎰 Jami o'yinlar:    <b>${r.g}</b>\n`
    + `━━━━━━━━━━━━━━━━━━━━\n`
    + `💸 Jami so'rovlar:   <b>${w.c}</b>\n`
    + `⏳ Kutilayotgan:     <b>${pw.c}</b>\n`
    + `💵 Jami yechilgan:   <b>${Number(w.s).toLocaleString()} so'm</b>\n`
    + `━━━━━━━━━━━━━━━━━━━━\n`
    + `📢 Kanallar: <b>${channels.map(c => c.name).join(', ') || 'Yo\'q'}</b>`,
    { parse_mode: 'HTML' }
  );
});

// ── 📢 Xabar yuborish ─────────────────────────────────────────
const broadcastState = new Map(); // adminId => true

bot.hears('📢 Xabar yuborish', async ctx => {
  if (!isAdmin(ctx)) return;
  broadcastState.set(ADMIN_ID, true);
  await ctx.reply(
    '📢 <b>Barcha foydalanuvchilarga xabar yuborish</b>\n\nXabar matnini yuboring\n(HTML formatda yozishingiz mumkin)\n\n❌ Bekor qilish: /cancel',
    { parse_mode: 'HTML' }
  );
});

// ── 📋 Kanallar boshqaruvi ────────────────────────────────────
bot.hears('📋 Kanallar', async ctx => {
  if (!isAdmin(ctx)) return;
  const channels = await getChannels();

  const buttons = channels.map(ch => [
    Markup.button.callback(`🗑 ${ch.name}`, `delch_${ch.name}`),
  ]);
  buttons.push([Markup.button.callback('➕ Kanal qo\'shish', 'addch')]);
  buttons.push([Markup.button.callback(
    await getSetting('sub_required') === '1' ? '🔴 Obunani o\'chirish' : '🟢 Obunani yoqish',
    'toggle_sub'
  )]);

  await ctx.reply(
    `📋 <b>Majburiy obuna kanallari</b>\n\n`
    + (channels.length ? channels.map((c, i) => `${i + 1}. ${c.name}`).join('\n') : 'Kanallar yo\'q'),
    { parse_mode: 'HTML', reply_markup: Markup.inlineKeyboard(buttons).reply_markup }
  );
});

bot.action('addch', async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  addChState.set(ADMIN_ID, true);
  await ctx.reply(
    '➕ <b>Kanal qo\'shish</b>\n\nKanal username\'ini yuboring (masalan: <code>@kanal_nomi</code>)\n\n❌ Bekor qilish: /cancel',
    { parse_mode: 'HTML' }
  );
});

bot.action(/^delch_(.+)$/, async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('❌ Ruxsat yo\'q');
  const name = ctx.match[1];
  await delChannel(name);
  await ctx.answerCbQuery(`✅ ${name} o'chirildi`);
  await ctx.deleteMessage().catch(() => {});
  // Yangilangan ro'yxatni ko'rsatish
  const channels = await getChannels();
  await ctx.reply(
    `✅ <b>${name} o'chirildi!</b>\n\n`
    + `📋 Qolgan kanallar:\n`
    + (channels.length ? channels.map((c, i) => `${i + 1}. ${c.name}`).join('\n') : 'Yo\'q'),
    { parse_mode: 'HTML' }
  );
});

bot.action('toggle_sub', async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('❌ Ruxsat yo\'q');
  const cur = await getSetting('sub_required');
  const next = cur === '1' ? '0' : '1';
  await setSetting('sub_required', next);
  await ctx.answerCbQuery(next === '1' ? '🟢 Obuna yoqildi' : '🔴 Obuna o\'chirildi');
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  await ctx.reply(next === '1' ? '🟢 <b>Majburiy obuna yoqildi!</b>' : '🔴 <b>Majburiy obuna o\'chirildi!</b>', { parse_mode: 'HTML' });
});

// ── ⚙️ Sozlamalar ──────────────────────────────────────────────
bot.hears('⚙️ Sozlamalar', async ctx => {
  if (!isAdmin(ctx)) return;
  const refSum = await getSetting('referral_sum');
  const minW   = await getSetting('min_withdraw');
  const bet    = await getSetting('bet_amount');
  const win    = await getSetting('win_chance');

  await ctx.reply(
    `⚙️ <b>Joriy sozlamalar</b>\n`
    + `━━━━━━━━━━━━━━━━━━━━\n`
    + `💰 Referal summasi: <b>${Number(refSum).toLocaleString()} so'm</b>\n`
    + `📌 Minimal yechish: <b>${Number(minW).toLocaleString()} so'm</b>\n`
    + `🎲 Stavka:          <b>${Number(bet).toLocaleString()} so'm</b>\n`
    + `🍀 Yutuq ehtimoli:  <b>${win}%</b>\n`
    + `━━━━━━━━━━━━━━━━━━━━\n`
    + `O'zgartirish uchun tugmani bosing:`,
    {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('💰 Referal summasi', 'set_referral_sum')],
        [Markup.button.callback('📌 Minimal yechish', 'set_min_withdraw')],
        [Markup.button.callback('🎲 Stavka',          'set_bet_amount')],
        [Markup.button.callback('🍀 Yutuq ehtimoli',  'set_win_chance')],
      ]).reply_markup,
    }
  );
});

// Sozlama o'zgartirish holatlari
const settingState = new Map(); // adminId => key

bot.action('set_referral_sum', async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  settingState.set(ADMIN_ID, 'referral_sum');
  await ctx.reply('💰 Yangi referal summasini kiriting (so\'mda):\n❌ Bekor: /cancel', { parse_mode: 'HTML' });
});
bot.action('set_min_withdraw', async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  settingState.set(ADMIN_ID, 'min_withdraw');
  await ctx.reply('📌 Yangi minimal yechish summasini kiriting (so\'mda):\n❌ Bekor: /cancel', { parse_mode: 'HTML' });
});
bot.action('set_bet_amount', async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  settingState.set(ADMIN_ID, 'bet_amount');
  await ctx.reply('🎲 Yangi stavka summasini kiriting (so\'mda):\n❌ Bekor: /cancel', { parse_mode: 'HTML' });
});
bot.action('set_win_chance', async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  settingState.set(ADMIN_ID, 'win_chance');
  await ctx.reply('🍀 Yutuq ehtimolini kiriting (1-99, %):\n❌ Bekor: /cancel', { parse_mode: 'HTML' });
});

// ── 👤 Foydalanuvchi ma'lumotlari ────────────────────────────
const userSearchState = new Map();

bot.hears('👤 Foydalanuvchi', async ctx => {
  if (!isAdmin(ctx)) return;
  userSearchState.set(ADMIN_ID, true);
  await ctx.reply("👤 Foydalanuvchi ID'sini kiriting:\n❌ Bekor: /cancel");
});

// ── 💳 Balans berish ──────────────────────────────────────────
const balanceGiveState = new Map(); // adminId => {step, userId}

bot.hears('💳 Balans berish', async ctx => {
  if (!isAdmin(ctx)) return;
  balanceGiveState.set(ADMIN_ID, { step: 'id' });
  await ctx.reply("💳 Foydalanuvchi ID'sini kiriting:\n❌ Bekor: /cancel");
});

// ── 🚪 Chiqish ────────────────────────────────────────────────
bot.hears('🚪 Chiqish', async ctx => {
  if (!isAdmin(ctx)) return;
  await ctx.reply('👤 Asosiy menyuga qaytildi.', { reply_markup: mainMenu().reply_markup });
});

// ── /cancel ───────────────────────────────────────────────────
bot.command('cancel', async ctx => {
  if (!isAdmin(ctx)) return;
  broadcastState.delete(ADMIN_ID);
  addChState.delete(ADMIN_ID);
  settingState.delete(ADMIN_ID);
  userSearchState.delete(ADMIN_ID);
  balanceGiveState.delete(ADMIN_ID);
  await ctx.reply('❌ Bekor qilindi.', { reply_markup: adminMenu().reply_markup });
});

// ════════════════════════════════════════════════════════════════
//  XABARLAR — STATE MACHINE (Admin uchun)
// ════════════════════════════════════════════════════════════════
const addChState = new Map();

bot.on('message', async (ctx, next) => {
  const userId = ctx.from.id;
  const text   = ctx.message.text || '';

  // ── ADMIN STATE ──────────────────────────────────────────────
  if (isAdmin(ctx)) {

    // 📢 Broadcast
    if (broadcastState.get(ADMIN_ID)) {
      broadcastState.delete(ADMIN_ID);
      const rows = await dbAll('SELECT id FROM users');
      let sent = 0, fail = 0;
      await ctx.reply(`📢 Yuborilmoqda... (${rows.length} ta foydalanuvchi)`);
      for (const row of rows) {
        try {
          await bot.telegram.sendMessage(row.id, text, { parse_mode: 'HTML' });
          sent++;
        } catch { fail++; }
        await new Promise(r => setTimeout(r, 40)); // rate limit
      }
      return ctx.reply(`✅ Yuborildi: ${sent}\n❌ Xato: ${fail}`);
    }

    // ➕ Kanal qo'shish
    if (addChState.get(ADMIN_ID)) {
      addChState.delete(ADMIN_ID);
      const ch = text.startsWith('@') ? text.trim() : '@' + text.trim();
      await addChannel(ch);
      return ctx.reply(`✅ <b>${ch}</b> qo'shildi!`, { parse_mode: 'HTML' });
    }

    // ⚙️ Sozlama o'zgartirish
    if (settingState.has(ADMIN_ID)) {
      const key = settingState.get(ADMIN_ID);
      settingState.delete(ADMIN_ID);
      const val = parseInt(text, 10);
      if (isNaN(val) || val <= 0) return ctx.reply('❌ Noto\'g\'ri qiymat. Musbat son kiriting.');
      if (key === 'win_chance' && (val < 1 || val > 99)) return ctx.reply('❌ 1 dan 99 gacha bo\'lishi kerak.');
      await setSetting(key, val);
      const labels = { referral_sum: 'Referal summasi', min_withdraw: 'Minimal yechish', bet_amount: 'Stavka', win_chance: 'Yutuq ehtimoli' };
      return ctx.reply(`✅ <b>${labels[key]}</b> → <b>${val.toLocaleString()}</b>${key === 'win_chance' ? '%' : " so'm"}`, { parse_mode: 'HTML' });
    }

    // 👤 Foydalanuvchi qidirish
    if (userSearchState.get(ADMIN_ID)) {
      userSearchState.delete(ADMIN_ID);
      const uid = parseInt(text, 10);
      if (isNaN(uid)) return ctx.reply("❌ Noto'g'ri ID.");
      const u = await getUser(uid);
      if (!u) return ctx.reply('❌ Foydalanuvchi topilmadi.');
      return ctx.reply(
        `👤 <b>Foydalanuvchi</b>\n`
        + `━━━━━━━━━━━━━━━━━━━━\n`
        + `🆔 ID: <code>${u.id}</code>\n`
        + `💰 Balans: <b>${u.balance.toLocaleString()} so'm</b>\n`
        + `👥 Referallar: <b>${u.ref_count}</b>\n`
        + `🎰 O'yinlar: <b>${u.game_count}</b>\n`
        + `✅ Yutdi: <b>${u.wins}</b> | ❌ Yutqazdi: <b>${u.losses}</b>\n`
        + `📅 Ro'yxat: <b>${u.created_at}</b>`,
        { parse_mode: 'HTML' }
      );
    }

    // 💳 Balans berish
    if (balanceGiveState.has(ADMIN_ID)) {
      const state = balanceGiveState.get(ADMIN_ID);
      if (state.step === 'id') {
        const uid = parseInt(text, 10);
        if (isNaN(uid)) return ctx.reply("❌ Noto'g'ri ID.");
        const u = await getUser(uid);
        if (!u) return ctx.reply('❌ Foydalanuvchi topilmadi.');
        balanceGiveState.set(ADMIN_ID, { step: 'amount', userId: uid });
        return ctx.reply(`💳 ID: <code>${uid}</code>\nMiqdorni kiriting (so'm):\n❌ Bekor: /cancel`, { parse_mode: 'HTML' });
      }
      if (state.step === 'amount') {
        const amount = parseInt(text, 10);
        if (isNaN(amount)) return ctx.reply('❌ Noto\'g\'ri miqdor.');
        balanceGiveState.delete(ADMIN_ID);
        await addBalance(state.userId, amount);
        bot.telegram.sendMessage(
          state.userId,
          `💰 <b>Hisobingizga ${amount.toLocaleString()} so'm qo'shildi!</b>`,
          { parse_mode: 'HTML' }
        ).catch(() => {});
        return ctx.reply(`✅ <code>${state.userId}</code> ga <b>${amount.toLocaleString()} so'm</b> qo'shildi!`, { parse_mode: 'HTML' });
      }
    }
  }

  // ── ODDIY FOYDALANUVCHI ──────────────────────────────────────
  return next();
});

// ── Noma'lum xabar ────────────────────────────────────────────
bot.on('message', async ctx => {
  await ctx.reply(
    '❓ Noto\'g\'ri buyruq.\n\nMenyudan foydalaning 👇',
    { reply_markup: isAdmin(ctx) ? adminMenu().reply_markup : mainMenu().reply_markup }
  );
});

// ════════════════════════════════════════════════════════════════
//  SERVER + WEBHOOK
// ════════════════════════════════════════════════════════════════
const app = express();
app.use(express.json());
app.get('/', (_req, res) => res.send('OK'));
app.post('/telegram', (req, res) => bot.handleUpdate(req.body, res));

app.listen(PORT, async () => {
  console.log(`✅ Server port ${PORT} da ishlamoqda`);
  if (WEBHOOK_URL) {
    try {
      await bot.telegram.setWebhook(`${WEBHOOK_URL}/telegram`);
      console.log(`✅ Webhook: ${WEBHOOK_URL}/telegram`);
    } catch (e) {
      console.error('❌ Webhook xato:', e.message);
    }
  } else {
    bot.launch().then(() => console.log('✅ Polling rejimi'));
  }
});

process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

