'use strict';
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const path    = require('path');
const fs      = require('fs');
require('dotenv').config();

// ════════════════════════════════════════════════════════════════
//  BOSHLANG'ICH SOZLAMALAR
// ════════════════════════════════════════════════════════════════
const API_TOKEN   = process.env.API_TOKEN   || '8611357164:AAHkJ0YywP7zvKW4nGY84dRsMSMva_pTOfM';
const ADMIN_ID    = Number(process.env.ADMIN_ID) || 7250754904;
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';
const PORT        = Number(process.env.PORT) || 3000;
const DATA_DIR    = process.env.DATA_DIR || __dirname;

if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ════════════════════════════════════════════════════════════════
//  JSON FAYL YO'LLARI
// ════════════════════════════════════════════════════════════════
const USERS_FILE      = path.join(DATA_DIR, 'users.json');
const SETTINGS_FILE   = path.join(DATA_DIR, 'settings.json');
const CHANNELS_FILE   = path.join(DATA_DIR, 'channels.json');
const WITHDRAWALS_FILE= path.join(DATA_DIR, 'withdrawals.json');
const LOGS_FILE       = path.join(DATA_DIR, 'logs.json');

// ════════════════════════════════════════════════════════════════
//  JSON HELPERS
// ════════════════════════════════════════════════════════════════
function readJSON(filePath, defaultVal) {
  try {
    if (!fs.existsSync(filePath)) return defaultVal;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch { return defaultVal; }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ════════════════════════════════════════════════════════════════
//  SETTINGS
// ════════════════════════════════════════════════════════════════
function loadSettings() {
  const def = {
    referral_sum: '3000',
    min_withdraw: '50000',
    bet_amount:   '5000',
    win_chance:   '45',
    sub_required: '1',
    rules_text:   '📜 Bot qoidalari hali kiritilmagan. Admin tomonidan sozlanadi.'
  };
  const saved = readJSON(SETTINGS_FILE, {});
  const merged = { ...def, ...saved };
  writeJSON(SETTINGS_FILE, merged);
  return merged;
}

let SETTINGS = loadSettings();
const getSetting = k => SETTINGS[k] ?? null;
const setSetting = (k, v) => {
  SETTINGS[k] = String(v);
  writeJSON(SETTINGS_FILE, SETTINGS);
};

// ════════════════════════════════════════════════════════════════
//  CHANNELS
// ════════════════════════════════════════════════════════════════
function loadChannels() {
  return readJSON(CHANNELS_FILE, ['@pulishla_z_community']);
}
function saveChannels(chs) {
  writeJSON(CHANNELS_FILE, chs);
}
const getChannels  = () => loadChannels().map(name => ({ name }));
const addChannel   = name => {
  const chs = loadChannels();
  if (!chs.includes(name)) { chs.push(name); saveChannels(chs); }
};
const delChannel   = name => {
  saveChannels(loadChannels().filter(c => c !== name));
};

// ════════════════════════════════════════════════════════════════
//  USERS
// ════════════════════════════════════════════════════════════════
function loadUsers() {
  return readJSON(USERS_FILE, {});
}
function saveUsers(users) {
  writeJSON(USERS_FILE, users);
}

const getUser = id => {
  const users = loadUsers();
  return users[String(id)] || null;
};

const ensureUserRecord = (id) => {
  const users = loadUsers();
  const key = String(id);
  if (!users[key]) {
    users[key] = {
      id: Number(id),
      balance: 0,
      ref_count: 0,
      game_count: 0,
      wins: 0,
      losses: 0,
      created_at: new Date().toISOString()
    };
    saveUsers(users);
    return true;
  }
  return false;
};

const updateUser = (id, fields) => {
  const users = loadUsers();
  const key = String(id);
  if (!users[key]) return;
  users[key] = { ...users[key], ...fields };
  saveUsers(users);
};

const addBalance = (id, delta) => {
  const users = loadUsers();
  const key = String(id);
  if (!users[key]) return;
  users[key].balance = (users[key].balance || 0) + delta;
  saveUsers(users);
};

const setBalance = (id, val) => {
  updateUser(id, { balance: val });
};

const incGame = (id, win) => {
  const users = loadUsers();
  const key = String(id);
  if (!users[key]) return;
  users[key].game_count = (users[key].game_count || 0) + 1;
  if (win) users[key].wins = (users[key].wins || 0) + 1;
  else     users[key].losses = (users[key].losses || 0) + 1;
  saveUsers(users);
};

// ════════════════════════════════════════════════════════════════
//  PENDING REFERRALS (users.json ichida)
// ════════════════════════════════════════════════════════════════
const PENDING_FILE = path.join(DATA_DIR, 'pending_referrals.json');
const loadPending  = () => readJSON(PENDING_FILE, {});
const savePending  = d  => writeJSON(PENDING_FILE, d);

const getPending = (newUserId) => {
  const p = loadPending();
  return p[String(newUserId)] || null;
};
const setPending = (newUserId, refId) => {
  const p = loadPending();
  p[String(newUserId)] = refId;
  savePending(p);
};
const delPending = (newUserId) => {
  const p = loadPending();
  delete p[String(newUserId)];
  savePending(p);
};

// ════════════════════════════════════════════════════════════════
//  WITHDRAWALS
// ════════════════════════════════════════════════════════════════
function loadWithdrawals() {
  return readJSON(WITHDRAWALS_FILE, []);
}
function saveWithdrawals(arr) {
  writeJSON(WITHDRAWALS_FILE, arr);
}
const addWithdrawal = (userId, amount) => {
  const arr = loadWithdrawals();
  arr.push({ id: Date.now(), user_id: userId, amount, status: 'pending', created_at: new Date().toISOString() });
  saveWithdrawals(arr);
};
const updateWithdrawal = (userId, amount, status) => {
  const arr = loadWithdrawals();
  const w = arr.find(x => x.user_id === userId && x.amount === amount && x.status === 'pending');
  if (w) w.status = status;
  saveWithdrawals(arr);
};

// ════════════════════════════════════════════════════════════════
//  LOGS
// ════════════════════════════════════════════════════════════════
function loadLogs() {
  return readJSON(LOGS_FILE, { user: [], admin: [], channel: [] });
}
function saveLogs(logs) {
  writeJSON(LOGS_FILE, logs);
}

const logUser = (userId, action, detail='', balBefore=0, balAfter=0) => {
  const logs = loadLogs();
  logs.user.push({ user_id: userId, action, detail, balance_before: balBefore, balance_after: balAfter, created_at: new Date().toLocaleString() });
  if (logs.user.length > 200) logs.user = logs.user.slice(-200);
  saveLogs(logs);
};

const logAdmin = (action, targetId=null, detail='', oldVal='', newVal='') => {
  const logs = loadLogs();
  logs.admin.push({ action, target_id: targetId, detail, old_value: String(oldVal), new_value: String(newVal), created_at: new Date().toLocaleString() });
  if (logs.admin.length > 100) logs.admin = logs.admin.slice(-100);
  saveLogs(logs);
};

const logChannel = (action, name) => {
  const logs = loadLogs();
  logs.channel.push({ action, channel_name: name, created_at: new Date().toLocaleString() });
  if (logs.channel.length > 100) logs.channel = logs.channel.slice(-100);
  saveLogs(logs);
};

// ════════════════════════════════════════════════════════════════
//  ENSURE USER
// ════════════════════════════════════════════════════════════════
async function ensureUser(id, refId=null) {
  const isNew = ensureUserRecord(id);
  if (isNew) {
    logUser(id, 'REGISTER', refId ? 'ref:'+refId : 'direct', 0, 0);
    if (refId) {
      const ref = parseInt(refId, 10);
      if (!isNaN(ref) && ref !== id && getUser(ref)) {
        setPending(id, ref);
      }
    }
  }
  return isNew;
}

// ════════════════════════════════════════════════════════════════
//  OBUNA TEKSHIRUV
// ════════════════════════════════════════════════════════════════
async function checkUserSub(telegram, userId) {
  if (getSetting('sub_required') !== '1') return { ok: true, notSub: [] };
  const chs = await getChannels();
  if (!chs.length) return { ok: true, notSub: [] };
  const notSub = [];
  for (const ch of chs) {
    try {
      const m = await telegram.getChatMember(ch.name, userId);
      if (['left', 'kicked'].includes(m.status)) notSub.push(ch.name);
    } catch(e) {
      console.warn('Kanal tekshiruv xatosi:', ch.name, e.message);
    }
  }
  return { ok: notSub.length === 0, notSub };
}

async function sendSubRequired(ctx, notSub) {
  const btns = notSub.map(ch => {
    const slug = ch.startsWith('@') ? ch.slice(1) : ch;
    return [Markup.button.url('📢 ' + ch + " ga a'zo bo'lish", 'https://t.me/' + slug)];
  });
  btns.push([Markup.button.callback("✅ A'zo bo'ldim — Tekshirish", 'check_sub')]);
  await ctx.reply(
    '🔒 <b>Botdan foydalanish uchun quyidagi kanallarga a\'zo bo\'ling:</b>\n\n'
    + notSub.map((c,i) => `${i+1}. ${c}`).join('\n'),
    { parse_mode: 'HTML', reply_markup: Markup.inlineKeyboard(btns).reply_markup }
  );
}

// ════════════════════════════════════════════════════════════════
//  MENYULAR
// ════════════════════════════════════════════════════════════════
const mainMenu = (isAdm=false) => {
  const rows = [
    ['🎰 Kazino', '👥 Referal ulashish'],
    ['💰 Balans', '💸 Pul yechish'],
    ['📜 Qoidalar', '📞 Support'],
  ];
  if (isAdm) rows.push(['👑 Admin paneli']);
  return Markup.keyboard(rows).resize();
};

const adminMenu = () => Markup.keyboard([
  ['📊 Statistika', '📢 Xabar yuborish'],
  ['📋 Kanallar',   '⚙️ Sozlamalar'],
  ['👤 Foydalanuvchi', '💳 Balans berish'],
  ['📜 Loglar',     '📝 Qoidalarni tahrirlash'],
  ['🚪 Chiqish']
]).resize();

// ════════════════════════════════════════════════════════════════
//  BOT
// ════════════════════════════════════════════════════════════════
const bot = new Telegraf(API_TOKEN);
const isAdmin = ctx => ctx.from?.id === ADMIN_ID;

// ── MAJBURIY OBUNA MIDDLEWARE ──
async function checkSubMiddleware(ctx, next) {
  if (!ctx.from) return next();
  if (isAdmin(ctx)) return next();
  if (ctx.callbackQuery) return next();
  if (ctx.message?.text?.startsWith('/start')) return next();
  const { ok, notSub } = await checkUserSub(ctx.telegram, ctx.from.id);
  if (ok) return next();
  await sendSubRequired(ctx, notSub);
}
bot.use(checkSubMiddleware);

// ── check_sub ──
bot.action('check_sub', async ctx => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const { ok, notSub } = await checkUserSub(ctx.telegram, userId);

  if (ok) {
    const pending = getPending(userId);
    if (pending) {
      const rs = Number(getSetting('referral_sum'));
      const refUser = getUser(pending);
      addBalance(pending, rs);
      updateUser(pending, { ref_count: (getUser(pending)?.ref_count || 0) });
      const users = loadUsers();
      users[String(pending)].ref_count = (users[String(pending)].ref_count || 0) + 1;
      saveUsers(users);
      delPending(userId);
      logUser(pending, 'REFERRAL_BONUS', 'new_user:'+userId,
        refUser ? refUser.balance : 0,
        refUser ? refUser.balance + rs : rs);
      bot.telegram.sendMessage(
        pending,
        `🎉 <b>Yangi referal bonus!</b>\n👤 Yangi foydalanuvchi obunadan o'tdi\n💰 +${rs.toLocaleString()} so'm`,
        { parse_mode: 'HTML' }
      ).catch(()=>{});
    }

    await ctx.deleteMessage().catch(()=>{});
    const rs = Number(getSetting('referral_sum'));
    const mw = Number(getSetting('min_withdraw'));
    await ctx.reply(
      `✅ <b>Obunadan o'tdingiz!</b>\n\n`
      +`👋 Xush kelibsiz, <b>${ctx.from.first_name}</b>!\n\n`
      +`🤑 Har referal uchun <b>${rs.toLocaleString()} so'm</b>!\n`
      +`🎰 Kazinoda omadingizni sinab ko'ring!\n`
      +`💸 <b>${mw.toLocaleString()} so'm</b>dan boshlab yechish\n\nMenyudan tanlang 👇`,
      { parse_mode: 'HTML', reply_markup: mainMenu(isAdmin(ctx)).reply_markup }
    );
  } else {
    const btns = notSub.map(ch => {
      const slug = ch.startsWith('@') ? ch.slice(1) : ch;
      return [Markup.button.url('📢 ' + ch, 'https://t.me/' + slug)];
    });
    btns.push([Markup.button.callback("✅ A'zo bo'ldim — Tekshirish", 'check_sub')]);
    await ctx.editMessageReplyMarkup(Markup.inlineKeyboard(btns).reply_markup).catch(async()=>{
      await ctx.reply(
        '🔒 Hali ham a\'zo emassiz:\n\n' + notSub.map((c,i)=>`${i+1}. ${c}`).join('\n'),
        { parse_mode: 'HTML', reply_markup: Markup.inlineKeyboard(btns).reply_markup }
      );
    });
    try {
      await ctx.telegram.answerCbQuery(ctx.callbackQuery.id, "❌ Hali ham a'zo emassiz!", { show_alert: true });
    } catch(e) {}
  }
});

// ── /start ──
bot.command('start', async ctx => {
  const userId = ctx.from.id;
  const arg    = ctx.message.text.split(' ')[1] || '';

  if (arg === 'admin' && isAdmin(ctx)) {
    return ctx.reply('👑 <b>Admin panelga xush kelibsiz!</b>',
      { parse_mode:'HTML', reply_markup: adminMenu().reply_markup });
  }

  const isNew = await ensureUser(userId, arg);
  const { ok, notSub } = await checkUserSub(ctx.telegram, userId);
  if (!ok && !isAdmin(ctx)) return sendSubRequired(ctx, notSub);

  if (isNew) {
    const pending = getPending(userId);
    if (pending) {
      const rs = Number(getSetting('referral_sum'));
      addBalance(pending, rs);
      const users = loadUsers();
      users[String(pending)].ref_count = (users[String(pending)].ref_count || 0) + 1;
      saveUsers(users);
      delPending(userId);
      bot.telegram.sendMessage(
        pending,
        `🎉 <b>Yangi referal bonus!</b>\n👤 ${ctx.from.first_name} qo'shildi\n💰 +${rs.toLocaleString()} so'm`,
        { parse_mode: 'HTML' }
      ).catch(()=>{});
    }
  }

  const rs = Number(getSetting('referral_sum'));
  const mw = Number(getSetting('min_withdraw'));
  await ctx.reply(
    `👋 <b>Assalomu alaykum, ${ctx.from.first_name}!</b>\n\n`
    +`🤑 Har referal uchun <b>${rs.toLocaleString()} so'm</b>!\n`
    +`🎰 Kazinoda omadingizni sinab ko'ring!\n`
    +`💸 <b>${mw.toLocaleString()} so'm</b>dan boshlab yechish\n\nMenyudan tanlang 👇`,
    { parse_mode:'HTML', reply_markup: mainMenu(isAdmin(ctx)).reply_markup }
  );
});

// ── /admin ──
bot.command('admin', async ctx => {
  if (!isAdmin(ctx)) return;
  await ctx.reply('👑 <b>Admin panelga xush kelibsiz!</b>',
    { parse_mode:'HTML', reply_markup: adminMenu().reply_markup });
});

// ── 💰 BALANS ──
bot.hears('💰 Balans', async ctx => {
  await ensureUser(ctx.from.id);
  const u  = getUser(ctx.from.id);
  const rs = Number(getSetting('referral_sum'));
  const mw = Number(getSetting('min_withdraw'));
  await ctx.reply(
    `💰 <b>Hisobingiz</b>\n━━━━━━━━━━━━━━━━━━━━\n`
    +`💵 Balans:        <b>${u.balance.toLocaleString()} so'm</b>\n`
    +`👥 Referallar:    <b>${u.ref_count} ta</b>\n`
    +`🎰 O'yinlar:      <b>${u.game_count} ta</b>\n`
    +`✅ Yutgan:        <b>${u.wins} ta</b>\n`
    +`❌ Yutqazgan:     <b>${u.losses} ta</b>\n`
    +`━━━━━━━━━━━━━━━━━━━━\n`
    +`📌 Minimal yechish: <b>${mw.toLocaleString()} so'm</b>\n`
    +`💎 Har referal: <b>${rs.toLocaleString()} so'm</b>`,
    { parse_mode:'HTML' }
  );
});

// ── 📜 QOIDALAR ──
bot.hears('📜 Qoidalar', async ctx => {
  const rules = getSetting('rules_text');
  await ctx.reply(rules || '📜 Qoidalar hali kiritilmagan.', { parse_mode:'HTML' });
});

// ── 📞 SUPPORT ──
bot.hears('📞 Support', async ctx => {
  const adminUser = await bot.telegram.getChat(ADMIN_ID).catch(()=>null);
  const adminLink = adminUser?.username
    ? `https://t.me/${adminUser.username}`
    : `tg://user?id=${ADMIN_ID}`;
  await ctx.reply(
    `📞 <b>Yordam va qo'llab-quvvatlash</b>\n━━━━━━━━━━━━━━━━━━━━\n\n`
    +`❓ Savollaringiz yoki muammolaringiz bo'lsa,\nadmin bilan bog'laning.\n\n`
    +`⏰ Ish vaqti: <b>09:00 — 23:00</b>`,
    {
      parse_mode:'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.url('👑 Admin bilan bog\'lanish', adminLink)]
      ]).reply_markup
    }
  );
});

// ── 👥 REFERAL ──
bot.hears('👥 Referal ulashish', async ctx => {
  await ensureUser(ctx.from.id);
  const u   = getUser(ctx.from.id);
  const bi  = await ctx.telegram.getMe();
  const link= `https://t.me/${bi.username}?start=${ctx.from.id}`;
  const rs  = Number(getSetting('referral_sum'));
  const chs = await getChannels();
  const isbotCh = chs.length ? chs[0].name : null;
  const shareText = `🎰 Bot orqali pul ishlang! Har referal uchun ${rs.toLocaleString()} so'm!\n${link}`;
  const btns = [];
  btns.push([Markup.button.switchToChat('📤 Do\'stlarga ulashish', shareText)]);
  if (isbotCh) {
    const slug = isbotCh.startsWith('@') ? isbotCh.slice(1) : isbotCh;
    btns.push([Markup.button.url('📢 ' + isbotCh, 'https://t.me/' + slug)]);
  }
  await ctx.reply(
    `👥 <b>Referal tizimi</b>\n━━━━━━━━━━━━━━━━━━━━\n`
    +`💰 Har do'st uchun: <b>${rs.toLocaleString()} so'm</b>\n\n`
    +`🔗 <b>Sizning havolangiz:</b>\n<code>${link}</code>\n\n`
    +`📊 Jalb qilganlar: <b>${u.ref_count} ta</b>\n`
    +`💵 Balans: <b>${u.balance.toLocaleString()} so'm</b>\n`
    +`━━━━━━━━━━━━━━━━━━━━\n`
    +`📤 Havolani do'stlaringizga ulashing!`,
    { parse_mode:'HTML', reply_markup: Markup.inlineKeyboard(btns).reply_markup }
  );
});

// ── 🎰 KAZINO ──
const activePlayers = new Set();
const GAME_CONFIG = {
  slot:     { emoji:'🎰', wait:3500, label:'Slot mashina'  },
  dice:     { emoji:'🎲', wait:2000, label:'Zar o\'yini'   },
  basket:   { emoji:'🏀', wait:3000, label:'Basketbol'     },
  football: { emoji:'⚽', wait:3500, label:'Futbol'         },
  darts:    { emoji:'🎯', wait:3000, label:'Nishon'         },
  bowling:  { emoji:'🎳', wait:2500, label:'Bouling'        },
};

bot.hears('🎰 Kazino', async ctx => {
  await ensureUser(ctx.from.id);
  const u   = getUser(ctx.from.id);
  const bet = Number(getSetting('bet_amount'));
  await ctx.reply(
    `🎰 <b>Kazino</b>\n━━━━━━━━━━━━━━━━━━━━\n`
    +`💵 Balans: <b>${u.balance.toLocaleString()} so'm</b>\n`
    +`🎲 Stavka: <b>${bet.toLocaleString()} so'm</b>\n\n`
    +`O'yin turini tanlang:`,
    {
      parse_mode:'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🎰 Slot mashina', 'game_slot')],
        [Markup.button.callback('🎲 Zar o\'yini',  'game_dice')],
        [Markup.button.callback('🏀 Basketbol',    'game_basket')],
        [Markup.button.callback('⚽ Futbol',        'game_football')],
        [Markup.button.callback('🎯 Nishon',        'game_darts')],
        [Markup.button.callback('🎳 Bouling',       'game_bowling')],
      ]).reply_markup
    }
  );
});

async function playGame(ctx, gameKey) {
  const userId = ctx.from.id;
  const cfg    = GAME_CONFIG[gameKey];
  if (!cfg) return;
  if (activePlayers.has(userId))
    return ctx.answerCbQuery("⏳ O'yin hali tugamadi!", { show_alert:true });
  await ctx.answerCbQuery();
  await ensureUser(userId);

  const u   = getUser(userId);
  const bet = Number(getSetting('bet_amount'));
  if (u.balance < bet) {
    return ctx.reply(
      `❌ <b>Mablag' yetarli emas!</b>\n\n`
      +`🎲 Stavka: <b>${bet.toLocaleString()} so'm</b>\n`
      +`💵 Sizda: <b>${u.balance.toLocaleString()} so'm</b>\n\n`
      +`👥 Referal orqali to'ldiring!`,
      { parse_mode:'HTML' }
    );
  }

  activePlayers.add(userId);
  try {
    await ctx.reply(`🎮 <b>${cfg.label} boshlandi!</b> Omad! 🍀`, { parse_mode:'HTML' });
    await ctx.telegram.sendDice(ctx.chat.id, { emoji: cfg.emoji });
    await new Promise(r => setTimeout(r, cfg.wait));

    const wc  = Number(getSetting('win_chance'));
    const won = Math.random() * 100 < wc;
    addBalance(userId, won ? bet : -bet);
    incGame(userId, won);
    const nu = getUser(userId);
    activePlayers.delete(userId);

    logUser(userId, won ? 'GAME_WIN' : 'GAME_LOSE',
      `game:${gameKey} bet:${bet}`, u.balance, nu.balance);

    const retryBtn = Markup.inlineKeyboard([
      [Markup.button.callback("🔄 Yana o'ynash", 'game_' + gameKey)]
    ]);

    if (won) {
      await ctx.reply(
        `🎉 <b>YUTDINGIZ!</b> 🎉\n━━━━━━━━━━━━━━━━━━━━\n`
        +`💰 Yutuq: <b>+${bet.toLocaleString()} so'm</b>\n`
        +`💵 Balans: <b>${nu.balance.toLocaleString()} so'm</b>`,
        { parse_mode:'HTML', reply_markup: retryBtn.reply_markup }
      );
    } else {
      await ctx.reply(
        `😔 <b>Yutqazdingiz...</b>\n━━━━━━━━━━━━━━━━━━━━\n`
        +`💸 -<b>${bet.toLocaleString()} so'm</b>\n`
        +`💵 Balans: <b>${nu.balance.toLocaleString()} so'm</b>\n`
        +`🍀 Yana urinib ko'ring!`,
        { parse_mode:'HTML', reply_markup: retryBtn.reply_markup }
      );
    }
  } catch(err) {
    activePlayers.delete(userId);
    console.error('Kazino xato:', err);
    ctx.reply('❌ Xato yuz berdi.').catch(()=>{});
  }
}

bot.action('game_slot',     ctx=>playGame(ctx,'slot'));
bot.action('game_dice',     ctx=>playGame(ctx,'dice'));
bot.action('game_basket',   ctx=>playGame(ctx,'basket'));
bot.action('game_football', ctx=>playGame(ctx,'football'));
bot.action('game_darts',    ctx=>playGame(ctx,'darts'));
bot.action('game_bowling',  ctx=>playGame(ctx,'bowling'));

// ── 💸 PUL YECHISH ──
bot.hears('💸 Pul yechish', async ctx => {
  await ensureUser(ctx.from.id);
  const u  = getUser(ctx.from.id);
  const mw = Number(getSetting('min_withdraw'));
  if (u.balance < mw) {
    return ctx.reply(
      `❌ <b>Yetarli mablag' yo'q!</b>\n\n`
      +`💵 Sizda: <b>${u.balance.toLocaleString()} so'm</b>\n`
      +`📌 Kerak: <b>${mw.toLocaleString()} so'm</b>\n`
      +`🔺 Yana: <b>${(mw-u.balance).toLocaleString()} so'm</b>`,
      { parse_mode:'HTML' }
    );
  }
  const amount = u.balance;
  addWithdrawal(ctx.from.id, amount);
  setBalance(ctx.from.id, 0);
  logUser(ctx.from.id, 'WITHDRAW_REQUEST', `amount:${amount}`, amount, 0);
  await ctx.reply(
    `✅ <b>So'rovingiz qabul qilindi!</b>\n\n💰 Summa: <b>${amount.toLocaleString()} so'm</b>\n⏳ 24 soat ichida ko'rib chiqiladi.`,
    { parse_mode:'HTML' }
  );
  await bot.telegram.sendMessage(
    ADMIN_ID,
    `💸 <b>Pul yechish so'rovi</b>\n━━━━━━━━━━━━━━━━━━━━\n`
    +`👤 ${ctx.from.first_name} ${ctx.from.last_name||''}\n`
    +`🆔 <code>${ctx.from.id}</code>\n`
    +`📛 ${ctx.from.username?'@'+ctx.from.username:"yo'q"}\n`
    +`💰 <b>${amount.toLocaleString()} so'm</b>`,
    {
      parse_mode:'HTML',
      reply_markup: Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Tasdiqlash', `aw_${ctx.from.id}_${amount}`),
          Markup.button.callback('❌ Rad etish',  `rw_${ctx.from.id}_${amount}`)
        ]
      ]).reply_markup
    }
  ).catch(()=>{});
});

bot.action(/^aw_(\d+)_(\d+)$/, async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('❌ Ruxsat yo\'q');
  const [,uid,amt] = ctx.match;
  updateWithdrawal(Number(uid), Number(amt), 'approved');
  logAdmin('WITHDRAW_APPROVE', Number(uid), `amount:${amt}`, 'pending', 'approved');
  logUser(Number(uid), 'WITHDRAW_APPROVED', `amount:${amt}`, 0, 0);
  bot.telegram.sendMessage(Number(uid),
    `✅ <b>${Number(amt).toLocaleString()} so'm tasdiqlandi!</b>\nTez orada o'tkaziladi.`,
    { parse_mode:'HTML' }).catch(()=>{});
  await ctx.editMessageReplyMarkup({ inline_keyboard:[] });
  await ctx.answerCbQuery('✅ Tasdiqlandi');
  await ctx.reply(`✅ ${uid} → ${Number(amt).toLocaleString()} so'm tasdiqlandi.`);
});

bot.action(/^rw_(\d+)_(\d+)$/, async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('❌ Ruxsat yo\'q');
  const [,uid,amt] = ctx.match;
  addBalance(Number(uid), Number(amt));
  updateWithdrawal(Number(uid), Number(amt), 'rejected');
  logAdmin('WITHDRAW_REJECT', Number(uid), `amount:${amt} returned`, 'pending', 'rejected');
  logUser(Number(uid), 'WITHDRAW_REJECTED', `amount:${amt} returned`, 0, Number(amt));
  bot.telegram.sendMessage(Number(uid),
    `❌ <b>Pul yechish rad etildi.</b>\nMablag' qaytarildi.`,
    { parse_mode:'HTML' }).catch(()=>{});
  await ctx.editMessageReplyMarkup({ inline_keyboard:[] });
  await ctx.answerCbQuery('❌ Rad etildi');
  await ctx.reply(`❌ ${uid} ga ${Number(amt).toLocaleString()} so'm qaytarildi.`);
});

// ════════════════════════════════════════════════════════════════
//  👑 ADMIN PANEL
// ════════════════════════════════════════════════════════════════
bot.hears('👑 Admin paneli', async ctx => {
  if (!isAdmin(ctx)) return;
  await ctx.reply('👑 <b>Admin panel</b>', { parse_mode:'HTML', reply_markup: adminMenu().reply_markup });
});

// 📊 Statistika
bot.hears('📊 Statistika', async ctx => {
  if (!isAdmin(ctx)) return;
  const users = loadUsers();
  const userList = Object.values(users);
  const totalBal = userList.reduce((s,u) => s + (u.balance||0), 0);
  const totalRef = userList.reduce((s,u) => s + (u.ref_count||0), 0);
  const totalGame= userList.reduce((s,u) => s + (u.game_count||0), 0);
  const ws = loadWithdrawals();
  const totalW = ws.reduce((s,w) => s + w.amount, 0);
  const pendW  = ws.filter(w => w.status==='pending').length;
  const chs    = await getChannels();
  await ctx.reply(
    `📊 <b>BOT STATISTIKASI</b>\n━━━━━━━━━━━━━━━━━━━━\n`
    +`👥 Foydalanuvchilar: <b>${userList.length}</b>\n`
    +`💰 Jami balans:      <b>${totalBal.toLocaleString()} so'm</b>\n`
    +`🔗 Jami referallar:  <b>${totalRef}</b>\n`
    +`🎰 Jami o'yinlar:    <b>${totalGame}</b>\n`
    +`━━━━━━━━━━━━━━━━━━━━\n`
    +`💸 Yechish so'rovlari: <b>${ws.length}</b>\n`
    +`⏳ Kutilayotgan:      <b>${pendW}</b>\n`
    +`💵 Jami yechilgan:   <b>${totalW.toLocaleString()} so'm</b>\n`
    +`━━━━━━━━━━━━━━━━━━━━\n`
    +`📢 Kanallar: <b>${chs.map(c=>c.name).join(', ')||"Yo'q"}</b>`,
    { parse_mode:'HTML' }
  );
});

// 📜 Loglar
bot.hears('📜 Loglar', async ctx => {
  if (!isAdmin(ctx)) return;
  await ctx.reply('📜 <b>Log turlari</b>', {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('👥 Foydalanuvchi loglari', 'log_user')],
      [Markup.button.callback('👑 Admin loglari',         'log_admin')],
      [Markup.button.callback('📢 Kanal loglari',         'log_channel')],
      [Markup.button.callback('🎰 O\'yin statistikasi',   'log_games')],
      [Markup.button.callback('💸 Yechish tarixi',        'log_withdraw')],
    ]).reply_markup
  });
});

bot.action('log_user', async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  const logs = loadLogs();
  const rows = logs.user.slice(-15).reverse();
  if (!rows.length) return ctx.reply('📭 Loglar yo\'q');
  const text = rows.map(r =>
    `[${r.created_at}]\n👤 <code>${r.user_id}</code> | <b>${r.action}</b>\n`
    +(r.detail ? `📝 ${r.detail}\n` : '')
    +(r.balance_before !== r.balance_after
      ? `💰 ${Number(r.balance_before).toLocaleString()} → ${Number(r.balance_after).toLocaleString()} so'm\n`
      : '')
  ).join('──────────────\n');
  await ctx.reply('👥 <b>So\'nggi foydalanuvchi harakatlari</b>\n━━━━━━━━━━━━━━━━━━━━\n' + text,
    { parse_mode:'HTML' });
});

bot.action('log_admin', async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  const logs = loadLogs();
  const rows = logs.admin.slice(-15).reverse();
  if (!rows.length) return ctx.reply('📭 Loglar yo\'q');
  const text = rows.map(r =>
    `[${r.created_at}]\n⚙️ <b>${r.action}</b>`
    +(r.target_id ? ` → <code>${r.target_id}</code>` : '') + '\n'
    +(r.detail ? `📝 ${r.detail}\n` : '')
    +(r.old_value||r.new_value ? `🔄 <i>${r.old_value}</i> → <b>${r.new_value}</b>\n` : '')
  ).join('──────────────\n');
  await ctx.reply('👑 <b>So\'nggi admin harakatlari</b>\n━━━━━━━━━━━━━━━━━━━━\n' + text,
    { parse_mode:'HTML' });
});

bot.action('log_channel', async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  const logs = loadLogs();
  const rows = logs.channel.slice(-20).reverse();
  if (!rows.length) return ctx.reply('📭 Kanal loglari yo\'q');
  const text = rows.map(r =>
    `[${r.created_at}] ${r.action==='ADD'?'➕':'🗑'} <b>${r.channel_name}</b>`
  ).join('\n');
  await ctx.reply('📢 <b>Kanal tarixi</b>\n━━━━━━━━━━━━━━━━━━━━\n' + text,
    { parse_mode:'HTML' });
});

bot.action('log_games', async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  const logs = loadLogs();
  const gameLogs = logs.user.filter(r => r.action==='GAME_WIN'||r.action==='GAME_LOSE');
  const total = gameLogs.length;
  const wins  = gameLogs.filter(r => r.action==='GAME_WIN').length;
  const losses= total - wins;
  const pct   = total ? ((wins/total)*100).toFixed(1) : 0;
  const byGame = {};
  gameLogs.forEach(r => {
    const g = (r.detail||'').split(' ')[0].replace('game:','');
    if (!byGame[g]) byGame[g] = { total:0, wins:0 };
    byGame[g].total++;
    if (r.action==='GAME_WIN') byGame[g].wins++;
  });
  let text = `🎰 <b>O'yin statistikasi</b>\n━━━━━━━━━━━━━━━━━━━━\n`
    +`Jami: <b>${total}</b> | Yutdi: <b>${wins}</b> | Yutqazdi: <b>${losses}</b>\n`
    +`Yutish %: <b>${pct}%</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
  Object.entries(byGame).forEach(([g, s]) => {
    const wp = s.total ? ((s.wins/s.total)*100).toFixed(0) : 0;
    text += `${g}: <b>${s.total}</b> o'yin | yutish <b>${wp}%</b>\n`;
  });
  await ctx.reply(text, { parse_mode:'HTML' });
});

bot.action('log_withdraw', async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  const rows = loadWithdrawals().slice(-15).reverse();
  if (!rows.length) return ctx.reply('📭 Yechish tarixi yo\'q');
  const statusIcon = { pending:'⏳', approved:'✅', rejected:'❌' };
  const text = rows.map(r =>
    `[${r.created_at}]\n`
    +`${statusIcon[r.status]||'❓'} <code>${r.user_id}</code> | <b>${Number(r.amount).toLocaleString()} so'm</b>\n`
    +`Holat: <b>${r.status}</b>`
  ).join('\n──────────────\n');
  await ctx.reply('💸 <b>Yechish tarixi</b>\n━━━━━━━━━━━━━━━━━━━━\n' + text,
    { parse_mode:'HTML' });
});

// State map
const states = new Map();
const getState   = id => states.get(id) || {};
const setState   = (id, s) => states.set(id, s);
const clearState = id => states.delete(id);

// 📢 Xabar yuborish
bot.hears('📢 Xabar yuborish', async ctx => {
  if (!isAdmin(ctx)) return;
  setState(ADMIN_ID, { action:'broadcast' });
  await ctx.reply('📢 <b>Barcha foydalanuvchilarga yuborish</b>\n\nXabar matnini yuboring:\n❌ Bekor: /cancel',
    { parse_mode:'HTML' });
});

// 📝 Qoidalarni tahrirlash
bot.hears('📝 Qoidalarni tahrirlash', async ctx => {
  if (!isAdmin(ctx)) return;
  setState(ADMIN_ID, { action:'set_rules' });
  const cur = getSetting('rules_text');
  await ctx.reply(`📝 <b>Qoidalarni tahrirlash</b>\n\nHozirgi:\n${cur}\n\n✏️ Yangi matnni yuboring:\n❌ Bekor: /cancel`,
    { parse_mode:'HTML' });
});

// 📋 Kanallar
bot.hears('📋 Kanallar', async ctx => {
  if (!isAdmin(ctx)) return;
  await showChannels(ctx);
});

async function showChannels(ctx) {
  const chs   = await getChannels();
  const subOn = getSetting('sub_required') === '1';
  const btns  = chs.map(ch=>[Markup.button.callback('🗑 '+ch.name,'delch_'+encodeURIComponent(ch.name))]);
  btns.push([Markup.button.callback('➕ Kanal qo\'shish','addch')]);
  btns.push([Markup.button.callback(subOn?'🔴 Obunani o\'chirish':'🟢 Obunani yoqish','toggle_sub')]);
  await ctx.reply(
    `📋 <b>Majburiy obuna kanallari</b>\n\n`
    +(chs.length ? chs.map((c,i)=>`${i+1}. ${c.name}`).join('\n') : "Kanallar yo'q"),
    { parse_mode:'HTML', reply_markup: Markup.inlineKeyboard(btns).reply_markup }
  );
}

bot.action('addch', async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  setState(ADMIN_ID, { action:'addch' });
  await ctx.reply("➕ Kanal username'ini yuboring (masalan: @kanal_nomi)\n❌ Bekor: /cancel");
});

bot.action(/^delch_(.+)$/, async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('❌ Ruxsat yo\'q');
  const name = decodeURIComponent(ctx.match[1]);
  delChannel(name);
  logChannel('DELETE', name);
  logAdmin('CHANNEL_DELETE', null, name, name, '');
  await ctx.answerCbQuery(`✅ ${name} o'chirildi`);
  await ctx.deleteMessage().catch(()=>{});
  await showChannels(ctx);
});

bot.action('toggle_sub', async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('❌ Ruxsat yo\'q');
  const cur  = getSetting('sub_required');
  const next = cur==='1' ? '0' : '1';
  setSetting('sub_required', next);
  logAdmin('SUB_TOGGLE', null, next==='1'?'yoqildi':'ochirildi', cur, next);
  await ctx.answerCbQuery(next==='1'?'🟢 Yoqildi':'🔴 O\'chirildi');
  await ctx.deleteMessage().catch(()=>{});
  await ctx.reply(
    next==='1' ? '🟢 <b>Majburiy obuna YOQILDI!</b>' : '🔴 <b>Majburiy obuna O\'CHIRILDI!</b>',
    { parse_mode:'HTML' }
  );
  await showChannels(ctx);
});

// ⚙️ Sozlamalar
bot.hears('⚙️ Sozlamalar', async ctx => {
  if (!isAdmin(ctx)) return;
  await showSettings(ctx);
});

async function showSettings(ctx) {
  const rs = getSetting('referral_sum');
  const mw = getSetting('min_withdraw');
  const bt = getSetting('bet_amount');
  const wc = getSetting('win_chance');
  await ctx.reply(
    `⚙️ <b>Sozlamalar</b>\n━━━━━━━━━━━━━━━━━━━━\n`
    +`💰 Referal summasi: <b>${Number(rs).toLocaleString()} so'm</b>\n`
    +`📌 Minimal yechish: <b>${Number(mw).toLocaleString()} so'm</b>\n`
    +`🎲 Stavka:          <b>${Number(bt).toLocaleString()} so'm</b>\n`
    +`🍀 Yutuq ehtimoli:  <b>${wc}%</b>`,
    {
      parse_mode:'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('💰 Referal summasi', 'sset_referral_sum')],
        [Markup.button.callback('📌 Minimal yechish', 'sset_min_withdraw')],
        [Markup.button.callback('🎲 Stavka',          'sset_bet_amount')],
        [Markup.button.callback('🍀 Yutuq ehtimoli',  'sset_win_chance')],
      ]).reply_markup
    }
  );
}

bot.action(/^sset_(.+)$/, async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  const key = ctx.match[1];
  const labels = {
    referral_sum:"referal summa (so'm)",
    min_withdraw:"minimal yechish (so'm)",
    bet_amount:"stavka (so'm)",
    win_chance:'yutuq ehtimoli (1-99%)'
  };
  setState(ADMIN_ID, { action:'setsetting', key });
  await ctx.reply(`✏️ Yangi ${labels[key]||key} ni kiriting:\n❌ Bekor: /cancel`);
});

// 👤 Foydalanuvchi
bot.hears('👤 Foydalanuvchi', async ctx => {
  if (!isAdmin(ctx)) return;
  setState(ADMIN_ID, { action:'userinfo' });
  await ctx.reply("👤 Foydalanuvchi ID'sini kiriting:\n❌ Bekor: /cancel");
});

// 💳 Balans berish
bot.hears('💳 Balans berish', async ctx => {
  if (!isAdmin(ctx)) return;
  setState(ADMIN_ID, { action:'givebal_id' });
  await ctx.reply("💳 Foydalanuvchi ID'sini kiriting:\n❌ Bekor: /cancel");
});

// 🚪 Chiqish
bot.hears('🚪 Chiqish', async ctx => {
  if (!isAdmin(ctx)) return;
  clearState(ADMIN_ID);
  await ctx.reply('👤 Asosiy menyu.', { reply_markup: mainMenu(isAdmin(ctx)).reply_markup });
});

// /cancel
bot.command('cancel', async ctx => {
  if (!isAdmin(ctx)) return;
  clearState(ADMIN_ID);
  await ctx.reply('❌ Bekor qilindi.', { reply_markup: adminMenu().reply_markup });
});

// ════════════════════════════════════════════════════════════════
//  XABAR HANDLER — STATE MACHINE
// ════════════════════════════════════════════════════════════════
bot.on('message', async(ctx, next) => {
  const text = ctx.message?.text || '';
  if (isAdmin(ctx)) {
    const st = getState(ADMIN_ID);

    if (st.action === 'broadcast') {
      clearState(ADMIN_ID);
      const users = loadUsers();
      const rows  = Object.values(users);
      let sent=0, fail=0;
      await ctx.reply(`📢 Yuborilmoqda... (${rows.length} ta)`);
      for (const row of rows) {
        try { await bot.telegram.sendMessage(row.id, text, { parse_mode:'HTML' }); sent++; }
        catch { fail++; }
        await new Promise(r=>setTimeout(r,40));
      }
      logAdmin('BROADCAST', null, `sent:${sent} fail:${fail}`, '', text.substring(0,100));
      return ctx.reply(`✅ Yuborildi: ${sent}\n❌ Xato: ${fail}`, { reply_markup: adminMenu().reply_markup });
    }

    if (st.action === 'set_rules') {
      clearState(ADMIN_ID);
      const oldRules = getSetting('rules_text');
      setSetting('rules_text', text);
      logAdmin('RULES_UPDATE', null, 'yangilandi', (oldRules||'').substring(0,50), text.substring(0,50));
      return ctx.reply('✅ <b>Qoidalar yangilandi!</b>', { parse_mode:'HTML', reply_markup: adminMenu().reply_markup });
    }

    if (st.action === 'addch') {
      clearState(ADMIN_ID);
      const ch = text.trim().startsWith('@') ? text.trim() : '@'+text.trim();
      addChannel(ch);
      logChannel('ADD', ch);
      logAdmin('CHANNEL_ADD', null, ch, '', ch);
      return ctx.reply(`✅ <b>${ch}</b> qo'shildi!`, { parse_mode:'HTML', reply_markup: adminMenu().reply_markup });
    }

    if (st.action === 'setsetting') {
      const key = st.key; clearState(ADMIN_ID);
      const val = parseInt(text, 10);
      if (isNaN(val)||val<=0) return ctx.reply('❌ Musbat son kiriting.');
      if (key==='win_chance'&&(val<1||val>99)) return ctx.reply('❌ 1 dan 99 gacha bo\'lishi kerak.');
      const oldVal = getSetting(key);
      setSetting(key, val);
      logAdmin('SETTING_CHANGE', null, key, oldVal||'', String(val));
      const labels = { referral_sum:'Referal summasi', min_withdraw:'Minimal yechish', bet_amount:'Stavka', win_chance:'Yutuq ehtimoli' };
      return ctx.reply(
        `✅ <b>${labels[key]}</b>: <b>${val.toLocaleString()}${key==='win_chance'?'%':' so\'m'}</b>`,
        { parse_mode:'HTML', reply_markup: adminMenu().reply_markup }
      );
    }

    if (st.action === 'userinfo') {
      clearState(ADMIN_ID);
      const uid = parseInt(text, 10);
      if (isNaN(uid)) return ctx.reply("❌ Noto'g'ri ID.");
      const u = getUser(uid);
      if (!u) return ctx.reply('❌ Foydalanuvchi topilmadi.');
      return ctx.reply(
        `👤 <b>Foydalanuvchi</b>\n━━━━━━━━━━━━━━━━━━━━\n`
        +`🆔 ID: <code>${u.id}</code>\n`
        +`💰 Balans: <b>${u.balance.toLocaleString()} so'm</b>\n`
        +`👥 Referallar: <b>${u.ref_count}</b>\n`
        +`🎰 O'yinlar: <b>${u.game_count}</b>\n`
        +`✅ Yutdi: <b>${u.wins}</b> | ❌ Yutqazdi: <b>${u.losses}</b>\n`
        +`📅 Sana: <b>${u.created_at}</b>`,
        { parse_mode:'HTML' }
      );
    }

    if (st.action === 'givebal_id') {
      const uid = parseInt(text, 10);
      if (isNaN(uid)) return ctx.reply("❌ Noto'g'ri ID.");
      const u = getUser(uid);
      if (!u) return ctx.reply('❌ Foydalanuvchi topilmadi.');
      setState(ADMIN_ID, { action:'givebal_amount', userId:uid });
      return ctx.reply(`💳 ID: <code>${uid}</code>\nMiqdorni kiriting (so'm):\n❌ Bekor: /cancel`, { parse_mode:'HTML' });
    }

    if (st.action === 'givebal_amount') {
      const uid = st.userId; clearState(ADMIN_ID);
      const amount = parseInt(text, 10);
      if (isNaN(amount)) return ctx.reply("❌ Noto'g'ri miqdor.");
      const targetUser = getUser(uid);
      addBalance(uid, amount);
      logAdmin('BALANCE_GIVE', uid, `amount:${amount}`,
        targetUser ? String(targetUser.balance) : '0',
        targetUser ? String(targetUser.balance + amount) : String(amount));
      logUser(uid, 'BALANCE_GIVEN', `by_admin amount:${amount}`,
        targetUser ? targetUser.balance : 0,
        targetUser ? targetUser.balance + amount : amount);
      bot.telegram.sendMessage(uid,
        `💰 <b>Hisobingizga ${amount.toLocaleString()} so'm qo'shildi!</b>`,
        { parse_mode:'HTML' }).catch(()=>{});
      return ctx.reply(
        `✅ <code>${uid}</code> ga <b>${amount.toLocaleString()} so'm</b> berildi!`,
        { parse_mode:'HTML', reply_markup: adminMenu().reply_markup }
      );
    }
  }
  return next();
});

// Noma'lum xabar
bot.on('message', async ctx => {
  await ctx.reply("❓ Noto'g'ri buyruq.\n\nMenyudan foydalaning 👇",
    { reply_markup: isAdmin(ctx) ? adminMenu().reply_markup : mainMenu(isAdmin(ctx)).reply_markup });
});

// ════════════════════════════════════════════════════════════════
//  SERVER
// ════════════════════════════════════════════════════════════════
const app = express();
app.use(express.json());
app.get('/', (_,res) => res.send('OK'));
app.post('/telegram', (req,res) => bot.handleUpdate(req.body, res));

app.listen(PORT, async () => {
  console.log(`Server port ${PORT}`);
  if (WEBHOOK_URL) {
    try {
      await bot.telegram.setWebhook(`${WEBHOOK_URL}/telegram`);
      console.log('Webhook o\'rnatildi: '+WEBHOOK_URL+'/telegram');
    } catch(e) {
      console.error('Webhook xato:', e.message);
    }
  } else {
    bot.launch()
      .then(() => console.log('Polling rejimi'))
      .catch(e => { console.error(e); process.exit(1); });
  }
});

process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
process.once('SIGUSR2', () => bot.stop('SIGUSR2'));



