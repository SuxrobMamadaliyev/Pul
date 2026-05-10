'use strict';
const { Telegraf, Markup } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();
const express = require('express');
const path    = require('path');
require('dotenv').config();

// ════════════════════════════════════════════════════════════════
//  BOSHLANG'ICH SOZLAMALAR
// ════════════════════════════════════════════════════════════════
const API_TOKEN   = process.env.API_TOKEN   || '8611357164:AAHkJ0YywP7zvKW4nGY84dRsMSMva_pTOfM';
const ADMIN_ID    = Number(process.env.ADMIN_ID) || 7250754904;
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';
const PORT        = Number(process.env.PORT) || 3000;

// ════════════════════════════════════════════════════════════════
//  MA'LUMOTLAR BAZASI
// ════════════════════════════════════════════════════════════════
// DB fayl — DATA_DIR env o'rnatilgan bo'lsa u papkada,
// aks holda __dirname da saqlanadi (VPS uchun yetarli)
const fs = require('fs');
const DATA_DIR = process.env.DATA_DIR || __dirname;
if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'bot.db');
const db = new sqlite3.Database(DB_PATH, err => {
  if (err) console.error('DB xato:', err.message);
  else     console.log('DB ulandi:', DB_PATH);
});

const dbGet = (sql, p=[]) => new Promise((ok,no) => db.get(sql,p,(e,r)=>e?no(e):ok(r)));
const dbAll = (sql, p=[]) => new Promise((ok,no) => db.all(sql,p,(e,r)=>e?no(e):ok(r)));
const dbRun = (sql, p=[]) => new Promise((ok,no) => db.run(sql,p,function(e){e?no(e):ok(this);}));

db.serialize(()=>{
  // WAL mode — server to'xtaganda ma'lumot yo'qolmasligi uchun
  db.run(`PRAGMA journal_mode=WAL`);
  db.run(`PRAGMA synchronous=FULL`);  // FULL — eng ishonchli
  db.run(`PRAGMA cache_size=10000`);
  db.run(`PRAGMA temp_store=MEMORY`);
  db.run(`PRAGMA wal_autocheckpoint=100`);
  db.run(`CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS channels(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE)`);
  db.run(`CREATE TABLE IF NOT EXISTS users(
    id INTEGER PRIMARY KEY, balance INTEGER DEFAULT 0,
    ref_count INTEGER DEFAULT 0, game_count INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0, losses INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  // pending_referrals — referal bonusi obunagacha kutiladi
  db.run(`CREATE TABLE IF NOT EXISTS pending_referrals(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    new_user_id INTEGER, ref_id INTEGER
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS withdrawals(
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER,
    amount INTEGER, status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  db.run(`INSERT OR IGNORE INTO settings VALUES('referral_sum','3000')`);
  db.run(`INSERT OR IGNORE INTO settings VALUES('min_withdraw','50000')`);
  db.run(`INSERT OR IGNORE INTO settings VALUES('bet_amount','5000')`);
  db.run(`INSERT OR IGNORE INTO settings VALUES('win_chance','45')`);
  db.run(`INSERT OR IGNORE INTO settings VALUES('sub_required','1')`);
  db.run(`INSERT OR IGNORE INTO settings VALUES('rules_text','📜 Bot qoidalari hali kiritilmagan. Admin tomonidan sozlanadi.')`);
  db.run(`INSERT OR IGNORE INTO channels(name) VALUES('@pulishla_z_community')`);

  // ── LOG JADVALLARI ──
  // Foydalanuvchilar harakatlari (kirish, o'yin, yechish, referal)
  db.run(`CREATE TABLE IF NOT EXISTS user_logs(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    detail TEXT,
    balance_before INTEGER DEFAULT 0,
    balance_after  INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`);

  // Admin harakatlari (sozlama o'zgartirish, balans berish, kanal qo'shish va boshqalar)
  db.run(`CREATE TABLE IF NOT EXISTS admin_logs(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    target_id INTEGER,
    detail TEXT,
    old_value TEXT,
    new_value TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`);

  // Kanallar tarixi (qo'shilgan/o'chirilgan)
  db.run(`CREATE TABLE IF NOT EXISTS channel_logs(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    channel_name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`);

  // Foydalanuvchi profil o'zgarishlari (ismi, usernamei o'zgarsa)
  db.run(`CREATE TABLE IF NOT EXISTS user_profile_logs(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    first_name TEXT,
    last_name TEXT,
    username TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
});

const getSetting  = async k => { const r=await dbGet('SELECT value FROM settings WHERE key=?',[k]); return r?r.value:null; };
const setSetting  = (k,v)   => dbRun('INSERT OR REPLACE INTO settings VALUES(?,?)',[k,String(v)]);
const getChannels = ()      => dbAll('SELECT name FROM channels ORDER BY id');
const addChannel  = n       => dbRun('INSERT OR IGNORE INTO channels(name) VALUES(?)',[n]);
const delChannel  = n       => dbRun('DELETE FROM channels WHERE name=?',[n]);
const getUser     = id      => dbGet('SELECT * FROM users WHERE id=?',[id]);
const addBalance  = (id,d)  => dbRun('UPDATE users SET balance=balance+? WHERE id=?',[d,id]);
const setBalance  = (id,v)  => dbRun('UPDATE users SET balance=? WHERE id=?',[v,id]);
const incGame     = (id,win)=> dbRun('UPDATE users SET game_count=game_count+1,wins=wins+?,losses=losses+? WHERE id=?',[win?1:0,win?0:1,id]);

// ── LOG YOZISH FUNKSIYALARI ──────────────────────────────────
const logUser = (userId, action, detail='', balBefore=0, balAfter=0) =>
  dbRun(
    'INSERT INTO user_logs(user_id,action,detail,balance_before,balance_after) VALUES(?,?,?,?,?)',
    [userId, action, detail, balBefore, balAfter]
  ).catch(e => console.error('logUser xato:', e.message));

const logAdmin = (action, targetId=null, detail='', oldVal='', newVal='') =>
  dbRun(
    'INSERT INTO admin_logs(action,target_id,detail,old_value,new_value) VALUES(?,?,?,?,?)',
    [action, targetId, detail, String(oldVal), String(newVal)]
  ).catch(e => console.error('logAdmin xato:', e.message));

const logChannel = (action, name) =>
  dbRun(
    'INSERT INTO channel_logs(action,channel_name) VALUES(?,?)',
    [action, name]
  ).catch(e => console.error('logChannel xato:', e.message));

const logProfile = (userId, firstName, lastName, username) =>
  dbRun(
    'INSERT INTO user_profile_logs(user_id,first_name,last_name,username) VALUES(?,?,?,?)',
    [userId, firstName||'', lastName||'', username||'']
  ).catch(e => console.error('logProfile xato:', e.message));

// Yangi foydalanuvchi qo'shish — referal bonusi HALI berilmaydi
async function ensureUser(id, refId=null, ctx=null){
  if(await getUser(id)){
    // Profil o'zgarishini tekshirish
    if(ctx?.from){
      const f = ctx.from;
      await logProfile(id, f.first_name, f.last_name||'', f.username||'');
    }
    return false;
  }
  await dbRun('INSERT INTO users(id) VALUES(?)',[id]);
  await logUser(id, 'REGISTER', refId ? 'ref:'+refId : 'direct', 0, 0);
  if(ctx?.from){
    const f = ctx.from;
    await logProfile(id, f.first_name, f.last_name||'', f.username||'');
  }
  // Agar referal bo'lsa — pending_referrals ga yoz
  if(refId){
    const ref=parseInt(refId,10);
    if(!isNaN(ref) && ref!==id){
      const ru=await getUser(ref);
      if(ru){
        await dbRun('INSERT OR IGNORE INTO pending_referrals(new_user_id,ref_id) VALUES(?,?)',[id,ref]);
      }
    }
  }
  return true;
}

// Obunani tekshirish — barcha kanallarga a'zo ekanini qaytaradi
async function checkUserSub(telegram, userId){
  if(await getSetting('sub_required') !== '1') return { ok: true, notSub: [] };
  const chs = await getChannels();
  if(!chs.length) return { ok: true, notSub: [] };
  const notSub = [];
  for(const ch of chs){
    try{
      const m = await telegram.getChatMember(ch.name, userId);
      if(['left','kicked'].includes(m.status)) notSub.push(ch.name);
    }catch(e){
      console.warn('Kanal tekshiruv xatosi:', ch.name, e.message);
    }
  }
  return { ok: notSub.length===0, notSub };
}

// Obuna kerak xabarini yuborish (inline)
async function sendSubRequired(ctx, notSub){
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
  if(isAdm) rows.push(['👑 Admin paneli']);
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

// ── MAJBURIY OBUNA MIDDLEWARE ──────────────────────────────────
// Faqat oddiy xabarlar uchun — callback query va /start alohida boshqariladi
async function checkSubMiddleware(ctx, next){
  if(!ctx.from) return next();
  if(isAdmin(ctx)) return next();
  if(ctx.callbackQuery) return next();          // callback alohida
  if(ctx.message?.text?.startsWith('/start')) return next(); // /start alohida

  const { ok, notSub } = await checkUserSub(ctx.telegram, ctx.from.id);
  if(ok) return next();
  await sendSubRequired(ctx, notSub);
}

bot.use(checkSubMiddleware);

// ── check_sub tugmasi — HARD tekshiruv ────────────────────────
bot.action('check_sub', async ctx => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const { ok, notSub } = await checkUserSub(ctx.telegram, userId);

  if(ok){
    // Obunadan o'tdi — pending referal bonusini ber
    const pending = await dbGet(
      'SELECT * FROM pending_referrals WHERE new_user_id=?', [userId]
    );
    if(pending){
      const rs = Number(await getSetting('referral_sum'));
      const refUser = await getUser(pending.ref_id);
      await dbRun('UPDATE users SET balance=balance+?,ref_count=ref_count+1 WHERE id=?',[rs, pending.ref_id]);
      await dbRun('DELETE FROM pending_referrals WHERE new_user_id=?',[userId]);
      await logUser(pending.ref_id, 'REFERRAL_BONUS', 'new_user:'+userId,
        refUser ? refUser.balance : 0,
        refUser ? refUser.balance + rs : rs);
      await logUser(userId, 'SUB_CONFIRMED', 'ref_bonus_given_to:'+pending.ref_id, 0, 0);
      bot.telegram.sendMessage(
        pending.ref_id,
        `🎉 <b>Yangi referal bonus!</b>\n👤 Yangi foydalanuvchi obunadan o'tdi\n💰 +${rs.toLocaleString()} so'm`,
        { parse_mode: 'HTML' }
      ).catch(()=>{});
    }

    await ctx.deleteMessage().catch(()=>{});
    const rs  = Number(await getSetting('referral_sum'));
    const mw  = Number(await getSetting('min_withdraw'));
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
    // show_alert bilan alohida bildirish
    try{
      await ctx.telegram.answerCbQuery(ctx.callbackQuery.id, "❌ Hali ham a'zo emassiz!", { show_alert: true });
    }catch(e){}
  }
});

// ── /start ────────────────────────────────────────────────────
bot.command('start', async ctx => {
  const userId = ctx.from.id;
  const arg    = ctx.message.text.split(' ')[1] || '';

  // Admin kirishi
  if(arg === 'admin' && isAdmin(ctx)){
    return ctx.reply(
      '👑 <b>Admin panelga xush kelibsiz!</b>',
      { parse_mode:'HTML', reply_markup: adminMenu().reply_markup }
    );
  }

  // Foydalanuvchini qo'sh (refId saqlash — bonus hali berilmaydi)
  const isNew = await ensureUser(userId, arg);

  // Majburiy obuna tekshiruvi
  const { ok, notSub } = await checkUserSub(ctx.telegram, userId);
  if(!ok && !isAdmin(ctx)){
    return sendSubRequired(ctx, notSub);
  }

  // Agar yangi foydalanuvchi va obunadan o'tgan bo'lsa — pending referal bonusini ber
  if(isNew){
    const pending = await dbGet('SELECT * FROM pending_referrals WHERE new_user_id=?',[userId]);
    if(pending){
      const rs = Number(await getSetting('referral_sum'));
      await dbRun('UPDATE users SET balance=balance+?,ref_count=ref_count+1 WHERE id=?',[rs, pending.ref_id]);
      await dbRun('DELETE FROM pending_referrals WHERE new_user_id=?',[userId]);
      bot.telegram.sendMessage(
        pending.ref_id,
        `🎉 <b>Yangi referal bonus!</b>\n👤 ${ctx.from.first_name} qo'shildi va obunadan o'tdi\n💰 +${rs.toLocaleString()} so'm`,
        { parse_mode: 'HTML' }
      ).catch(()=>{});
    }
  }

  const rs = Number(await getSetting('referral_sum'));
  const mw = Number(await getSetting('min_withdraw'));
  await ctx.reply(
    `👋 <b>Assalomu alaykum, ${ctx.from.first_name}!</b>\n\n`
    +`🤑 Har referal uchun <b>${rs.toLocaleString()} so'm</b>!\n`
    +`🎰 Kazinoda omadingizni sinab ko'ring!\n`
    +`💸 <b>${mw.toLocaleString()} so'm</b>dan boshlab yechish\n\nMenyudan tanlang 👇`,
    { parse_mode:'HTML', reply_markup: mainMenu(isAdmin(ctx)).reply_markup }
  );
});

// ── /admin buyrug'i (admin uchun) ─────────────────────────────
bot.command('admin', async ctx => {
  if(!isAdmin(ctx)) return;
  await ctx.reply(
    '👑 <b>Admin panelga xush kelibsiz!</b>',
    { parse_mode:'HTML', reply_markup: adminMenu().reply_markup }
  );
});

// ── 💰 BALANS ─────────────────────────────────────────────────
bot.hears('💰 Balans', async ctx => {
  await ensureUser(ctx.from.id);
  const u  = await getUser(ctx.from.id);
  const rs = Number(await getSetting('referral_sum'));
  const mw = Number(await getSetting('min_withdraw'));
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

// ── 📜 QOIDALAR ───────────────────────────────────────────────
bot.hears('📜 Qoidalar', async ctx => {
  const rules = await getSetting('rules_text');
  await ctx.reply(rules || '📜 Qoidalar hali kiritilmagan.', { parse_mode:'HTML' });
});

// ── 📞 SUPPORT ────────────────────────────────────────────────
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

// ── 👥 REFERAL ────────────────────────────────────────────────
bot.hears('👥 Referal ulashish', async ctx => {
  await ensureUser(ctx.from.id);
  const u   = await getUser(ctx.from.id);
  const bi  = await ctx.telegram.getMe();
  const link= `https://t.me/${bi.username}?start=${ctx.from.id}`;
  const rs  = Number(await getSetting('referral_sum'));

  // Isbot kanal (birinchi kanal)
  const chs = await getChannels();
  const isbotCh = chs.length ? chs[0].name : null;

  const shareText =
    `🎰 Bot orqali pul ishlang! Har referal uchun ${rs.toLocaleString()} so'm!\n${link}`;

  const btns = [];
  btns.push([Markup.button.switchToChat('📤 Do\'stlarga ulashish', shareText)]);
  if(isbotCh){
    const slug = isbotCh.startsWith('@') ? isbotCh.slice(1) : isbotCh;
    btns.push([Markup.button.url('📢 ' + isbotCh, 'https://t.me/' + slug)]);
  }
  // Admin va qoidalar tugmasi olib tashlandi — asosiy menyuda bor

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

// ── 🎰 KAZINO ─────────────────────────────────────────────────
const activePlayers = new Set();

// Har bir o'yin turi — faqat emoji va animatsiya vaqti
// Yutish/yutqazish admin sozlamasidagi win_chance (%) ga qarab aniqlanadi
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
  const u   = await getUser(ctx.from.id);
  const bet = Number(await getSetting('bet_amount'));
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

async function playGame(ctx, gameKey){
  const userId = ctx.from.id;
  const cfg    = GAME_CONFIG[gameKey];
  if(!cfg) return;

  if(activePlayers.has(userId))
    return ctx.answerCbQuery("⏳ O'yin hali tugamadi!", { show_alert:true });
  await ctx.answerCbQuery();
  await ensureUser(userId);

  const u   = await getUser(userId);
  const bet = Number(await getSetting('bet_amount'));

  if(u.balance < bet){
    return ctx.reply(
      `❌ <b>Mablag' yetarli emas!</b>\n\n`
      +`🎲 Stavka: <b>${bet.toLocaleString()} so'm</b>\n`
      +`💵 Sizda: <b>${u.balance.toLocaleString()} so'm</b>\n\n`
      +`👥 Referal orqali to'ldiring!`,
      { parse_mode:'HTML' }
    );
  }

  activePlayers.add(userId);
  try{
    await ctx.reply(
      `🎮 <b>${cfg.label} boshlandi!</b> Omad! 🍀`,
      { parse_mode:'HTML' }
    );

    // Har bir o'yin o'z emoji dice animatsiyasini ko'rsatadi
    await ctx.telegram.sendDice(ctx.chat.id, { emoji: cfg.emoji });

    // Animatsiya tugashini kutish
    await new Promise(r => setTimeout(r, cfg.wait));

    // Yutish/yutqazish — admin sozlamasidagi win_chance (%) ga qarab
    const wc  = Number(await getSetting('win_chance'));
    const won = Math.random() * 100 < wc;

    await addBalance(userId, won ? bet : -bet);
    await incGame(userId, won);
    const nu = await getUser(userId);
    activePlayers.delete(userId);

    const retryBtn = Markup.inlineKeyboard([
      [Markup.button.callback("🔄 Yana o'ynash", 'game_' + gameKey)]
    ]);

    // O'yin natijasini loglash
    await logUser(userId,
      won ? 'GAME_WIN' : 'GAME_LOSE',
      `game:${gameKey} bet:${bet}`,
      u.balance,
      nu.balance
    );

    if(won){
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
  } catch(err){
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

// ── 💸 PUL YECHISH ────────────────────────────────────────────
bot.hears('💸 Pul yechish', async ctx => {
  await ensureUser(ctx.from.id);
  const u  = await getUser(ctx.from.id);
  const mw = Number(await getSetting('min_withdraw'));
  if(u.balance < mw){
    return ctx.reply(
      `❌ <b>Yetarli mablag' yo'q!</b>\n\n`
      +`💵 Sizda: <b>${u.balance.toLocaleString()} so'm</b>\n`
      +`📌 Kerak: <b>${mw.toLocaleString()} so'm</b>\n`
      +`🔺 Yana: <b>${(mw-u.balance).toLocaleString()} so'm</b>`,
      { parse_mode:'HTML' }
    );
  }
  const amount = u.balance;
  await dbRun('INSERT INTO withdrawals(user_id,amount) VALUES(?,?)',[ctx.from.id, amount]);
  await setBalance(ctx.from.id, 0);
  await logUser(ctx.from.id, 'WITHDRAW_REQUEST', `amount:${amount}`, amount, 0);
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
  if(!isAdmin(ctx)) return ctx.answerCbQuery('❌ Ruxsat yo\'q');
  const [,uid,amt] = ctx.match;
  await dbRun("UPDATE withdrawals SET status='approved' WHERE user_id=? AND amount=? AND status='pending'",[Number(uid),Number(amt)]);
  await logAdmin('WITHDRAW_APPROVE', Number(uid), `amount:${amt}`, 'pending', 'approved');
  await logUser(Number(uid), 'WITHDRAW_APPROVED', `amount:${amt}`, 0, 0);
  bot.telegram.sendMessage(
    Number(uid),
    `✅ <b>${Number(amt).toLocaleString()} so'm tasdiqlandi!</b>\nTez orada o'tkaziladi.`,
    { parse_mode:'HTML' }
  ).catch(()=>{});
  await ctx.editMessageReplyMarkup({ inline_keyboard:[] });
  await ctx.answerCbQuery('✅ Tasdiqlandi');
  await ctx.reply(`✅ ${uid} → ${Number(amt).toLocaleString()} so'm tasdiqlandi.`);
});

bot.action(/^rw_(\d+)_(\d+)$/, async ctx => {
  if(!isAdmin(ctx)) return ctx.answerCbQuery('❌ Ruxsat yo\'q');
  const [,uid,amt] = ctx.match;
  const refUser = await getUser(Number(uid));
  await addBalance(Number(uid), Number(amt));
  await dbRun("UPDATE withdrawals SET status='rejected' WHERE user_id=? AND amount=? AND status='pending'",[Number(uid),Number(amt)]);
  await logAdmin('WITHDRAW_REJECT', Number(uid), `amount:${amt} returned`, 'pending', 'rejected');
  await logUser(Number(uid), 'WITHDRAW_REJECTED', `amount:${amt} returned`,
    refUser ? refUser.balance : 0,
    refUser ? refUser.balance + Number(amt) : Number(amt));
  bot.telegram.sendMessage(
    Number(uid),
    `❌ <b>Pul yechish rad etildi.</b>\nMablag' qaytarildi.`,
    { parse_mode:'HTML' }
  ).catch(()=>{});
  await ctx.editMessageReplyMarkup({ inline_keyboard:[] });
  await ctx.answerCbQuery('❌ Rad etildi');
  await ctx.reply(`❌ ${uid} ga ${Number(amt).toLocaleString()} so'm qaytarildi.`);
});

// ════════════════════════════════════════════════════════════════
//  👑 ADMIN PANEL
// ════════════════════════════════════════════════════════════════

// Admin menyusini ko'rsatish tugmasi (keyboard)
bot.hears('👑 Admin paneli', async ctx => {
  if(!isAdmin(ctx)) return;
  await ctx.reply('👑 <b>Admin panel</b>', { parse_mode:'HTML', reply_markup: adminMenu().reply_markup });
});

// 📊 Statistika
bot.hears('📊 Statistika', async ctx => {
  if(!isAdmin(ctx)) return;
  const r  = await dbGet('SELECT COUNT(*) u,COALESCE(SUM(balance),0) b,COALESCE(SUM(ref_count),0) rf,COALESCE(SUM(game_count),0) g FROM users');
  const w  = await dbGet("SELECT COUNT(*) c,COALESCE(SUM(amount),0) s FROM withdrawals");
  const pw = await dbGet("SELECT COUNT(*) c FROM withdrawals WHERE status='pending'");
  const chs= await getChannels();
  await ctx.reply(
    `📊 <b>BOT STATISTIKASI</b>\n━━━━━━━━━━━━━━━━━━━━\n`
    +`👥 Foydalanuvchilar: <b>${r.u}</b>\n`
    +`💰 Jami balans:      <b>${Number(r.b).toLocaleString()} so'm</b>\n`
    +`🔗 Jami referallar:  <b>${r.rf}</b>\n`
    +`🎰 Jami o'yinlar:    <b>${r.g}</b>\n`
    +`━━━━━━━━━━━━━━━━━━━━\n`
    +`💸 Yechish so'rovlari: <b>${w.c}</b>\n`
    +`⏳ Kutilayotgan:      <b>${pw.c}</b>\n`
    +`💵 Jami yechilgan:   <b>${Number(w.s).toLocaleString()} so'm</b>\n`
    +`━━━━━━━━━━━━━━━━━━━━\n`
    +`📢 Kanallar: <b>${chs.map(c=>c.name).join(', ')||"Yo'q"}</b>`,
    { parse_mode:'HTML' }
  );
});

// ── 📜 LOGLAR ─────────────────────────────────────────────────
bot.hears('📜 Loglar', async ctx => {
  if(!isAdmin(ctx)) return;
  await ctx.reply(
    '📜 <b>Log turlari</b>',
    {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('👥 Foydalanuvchi loglari', 'log_user')],
        [Markup.button.callback('👑 Admin loglari',         'log_admin')],
        [Markup.button.callback('📢 Kanal loglari',         'log_channel')],
        [Markup.button.callback('🎰 O\'yin statistikasi',   'log_games')],
        [Markup.button.callback('💸 Yechish tarixi',        'log_withdraw')],
      ]).reply_markup
    }
  );
});

bot.action('log_user', async ctx => {
  if(!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  const rows = await dbAll(
    `SELECT ul.*, u.balance as cur_bal
     FROM user_logs ul LEFT JOIN users u ON ul.user_id=u.id
     ORDER BY ul.id DESC LIMIT 15`
  );
  if(!rows.length) return ctx.reply('📭 Loglar yo\'q');
  const text = rows.map(r =>
    `[${r.created_at}]\n👤 <code>${r.user_id}</code> | <b>${r.action}</b>\n` +
    (r.detail ? `📝 ${r.detail}\n` : '') +
    (r.balance_before !== r.balance_after
      ? `💰 ${r.balance_before.toLocaleString()} → ${r.balance_after.toLocaleString()} so'm\n`
      : '')
  ).join('──────────────\n');
  await ctx.reply('👥 <b>So\'nggi foydalanuvchi harakatlari</b>\n━━━━━━━━━━━━━━━━━━━━\n' + text,
    { parse_mode:'HTML' });
});

bot.action('log_admin', async ctx => {
  if(!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  const rows = await dbAll(
    `SELECT * FROM admin_logs ORDER BY id DESC LIMIT 15`
  );
  if(!rows.length) return ctx.reply('📭 Loglar yo\'q');
  const text = rows.map(r =>
    `[${r.created_at}]\n⚙️ <b>${r.action}</b>` +
    (r.target_id ? ` → <code>${r.target_id}</code>` : '') + '\n' +
    (r.detail ? `📝 ${r.detail}\n` : '') +
    (r.old_value||r.new_value
      ? `🔄 <i>${r.old_value}</i> → <b>${r.new_value}</b>\n`
      : '')
  ).join('──────────────\n');
  await ctx.reply('👑 <b>So\'nggi admin harakatlari</b>\n━━━━━━━━━━━━━━━━━━━━\n' + text,
    { parse_mode:'HTML' });
});

bot.action('log_channel', async ctx => {
  if(!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  const rows = await dbAll(`SELECT * FROM channel_logs ORDER BY id DESC LIMIT 20`);
  if(!rows.length) return ctx.reply('📭 Kanal loglari yo\'q');
  const text = rows.map(r =>
    `[${r.created_at}] ${r.action==='ADD'?'➕':'🗑'} <b>${r.channel_name}</b>`
  ).join('\n');
  await ctx.reply('📢 <b>Kanal tarixi</b>\n━━━━━━━━━━━━━━━━━━━━\n' + text,
    { parse_mode:'HTML' });
});

bot.action('log_games', async ctx => {
  if(!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  const total  = await dbGet(`SELECT COUNT(*) c, COALESCE(SUM(CASE WHEN action='GAME_WIN' THEN 1 ELSE 0 END),0) w, COALESCE(SUM(CASE WHEN action='GAME_LOSE' THEN 1 ELSE 0 END),0) l FROM user_logs WHERE action IN ('GAME_WIN','GAME_LOSE')`);
  const byGame = await dbAll(`SELECT detail, COUNT(*) c, SUM(CASE WHEN action='GAME_WIN' THEN 1 ELSE 0 END) w FROM user_logs WHERE action IN ('GAME_WIN','GAME_LOSE') GROUP BY detail ORDER BY c DESC`);
  const pct = total.c ? ((total.w/total.c)*100).toFixed(1) : 0;
  let text = `🎰 <b>O\'yin statistikasi</b>\n━━━━━━━━━━━━━━━━━━━━\n`
    + `Jami: <b>${total.c}</b> | Yutdi: <b>${total.w}</b> | Yutqazdi: <b>${total.l}</b>\n`
    + `Yutish %: <b>${pct}%</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
  byGame.forEach(r => {
    const g = (r.detail||'').split(' ')[0].replace('game:','');
    const wp = r.c ? ((r.w/r.c)*100).toFixed(0) : 0;
    text += `${g}: <b>${r.c}</b> o\'yin | yutish <b>${wp}%</b>\n`;
  });
  await ctx.reply(text, { parse_mode:'HTML' });
});

bot.action('log_withdraw', async ctx => {
  if(!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  const rows = await dbAll(
    `SELECT w.*, ul.first_name FROM withdrawals w
     LEFT JOIN user_profile_logs ul ON w.user_id=ul.user_id
     GROUP BY w.id ORDER BY w.id DESC LIMIT 15`
  );
  if(!rows.length) return ctx.reply('📭 Yechish tarixi yo\'q');
  const statusIcon = { pending:'⏳', approved:'✅', rejected:'❌' };
  const text = rows.map(r =>
    `[${r.created_at}]\n` +
    `${statusIcon[r.status]||'❓'} <code>${r.user_id}</code> | <b>${Number(r.amount).toLocaleString()} so'm</b>\n` +
    `Holat: <b>${r.status}</b>`
  ).join('\n──────────────\n');
  await ctx.reply('💸 <b>Yechish tarixi</b>\n━━━━━━━━━━━━━━━━━━━━\n' + text,
    { parse_mode:'HTML' });
});

// State map
const states = new Map();
const getState   = id  => states.get(id) || {};
const setState   = (id,s) => states.set(id,s);
const clearState = id  => states.delete(id);

// 📢 Xabar yuborish
bot.hears('📢 Xabar yuborish', async ctx => {
  if(!isAdmin(ctx)) return;
  setState(ADMIN_ID, { action:'broadcast' });
  await ctx.reply(
    '📢 <b>Barcha foydalanuvchilarga yuborish</b>\n\nXabar matnini yuboring (HTML qo\'llab-quvvatlanadi):\n❌ Bekor: /cancel',
    { parse_mode:'HTML' }
  );
});

// 📝 Qoidalarni tahrirlash
bot.hears('📝 Qoidalarni tahrirlash', async ctx => {
  if(!isAdmin(ctx)) return;
  setState(ADMIN_ID, { action:'set_rules' });
  const cur = await getSetting('rules_text');
  await ctx.reply(
    `📝 <b>Qoidalarni tahrirlash</b>\n\nHozirgi qoidalar:\n${cur}\n\n✏️ Yangi qoidalar matnini yuboring:\n❌ Bekor: /cancel`,
    { parse_mode:'HTML' }
  );
});

// 📋 Kanallar
bot.hears('📋 Kanallar', async ctx => {
  if(!isAdmin(ctx)) return;
  await showChannels(ctx);
});

async function showChannels(ctx){
  const chs   = await getChannels();
  const subOn = await getSetting('sub_required') === '1';
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
  if(!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  setState(ADMIN_ID, { action:'addch' });
  await ctx.reply("➕ Kanal username'ini yuboring (masalan: @kanal_nomi)\n❌ Bekor: /cancel");
});

bot.action(/^delch_(.+)$/, async ctx => {
  if(!isAdmin(ctx)) return ctx.answerCbQuery('❌ Ruxsat yo\'q');
  const name = decodeURIComponent(ctx.match[1]);
  await delChannel(name);
  await logChannel('DELETE', name);
  await logAdmin('CHANNEL_DELETE', null, name, name, '');
  await ctx.answerCbQuery(`✅ ${name} o'chirildi`);
  await ctx.deleteMessage().catch(()=>{});
  await showChannels(ctx);
});

bot.action('toggle_sub', async ctx => {
  if(!isAdmin(ctx)) return ctx.answerCbQuery('❌ Ruxsat yo\'q');
  const cur  = await getSetting('sub_required');
  const next = cur==='1' ? '0' : '1';
  await setSetting('sub_required', next);
  await logAdmin('SUB_TOGGLE', null, next==='1'?'yoqildi':'ochirildi', cur, next);
  await ctx.answerCbQuery(next==='1'?'🟢 Yoqildi':'🔴 O\'chirildi');
  await ctx.deleteMessage().catch(()=>{});
  await ctx.reply(
    next==='1'
      ? '🟢 <b>Majburiy obuna YOQILDI!</b>'
      : '🔴 <b>Majburiy obuna O\'CHIRILDI!</b>',
    { parse_mode:'HTML' }
  );
  await showChannels(ctx);
});

// ⚙️ Sozlamalar
bot.hears('⚙️ Sozlamalar', async ctx => {
  if(!isAdmin(ctx)) return;
  await showSettings(ctx);
});

async function showSettings(ctx){
  const rs = await getSetting('referral_sum');
  const mw = await getSetting('min_withdraw');
  const bt = await getSetting('bet_amount');
  const wc = await getSetting('win_chance');
  await ctx.reply(
    `⚙️ <b>Sozlamalar</b>\n━━━━━━━━━━━━━━━━━━━━\n`
    +`💰 Referal summasi: <b>${Number(rs).toLocaleString()} so'm</b>\n`
    +`📌 Minimal yechish: <b>${Number(mw).toLocaleString()} so'm</b>\n`
    +`🎲 Stavka:          <b>${Number(bt).toLocaleString()} so'm</b>\n`
    +`🍀 Yutuq ehtimoli:  <b>${wc}%</b>\n`
    +`━━━━━━━━━━━━━━━━━━━━`,
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
  if(!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  const key = ctx.match[1];
  const labels = {
    referral_sum:'referal summa (so\'m)',
    min_withdraw:'minimal yechish (so\'m)',
    bet_amount:'stavka (so\'m)',
    win_chance:'yutuq ehtimoli (1-99%)'
  };
  setState(ADMIN_ID, { action:'setsetting', key });
  await ctx.reply(`✏️ Yangi ${labels[key]||key} ni kiriting:\n❌ Bekor: /cancel`);
});

// 👤 Foydalanuvchi
bot.hears('👤 Foydalanuvchi', async ctx => {
  if(!isAdmin(ctx)) return;
  setState(ADMIN_ID, { action:'userinfo' });
  await ctx.reply("👤 Foydalanuvchi ID'sini kiriting:\n❌ Bekor: /cancel");
});

// 💳 Balans berish
bot.hears('💳 Balans berish', async ctx => {
  if(!isAdmin(ctx)) return;
  setState(ADMIN_ID, { action:'givebal_id' });
  await ctx.reply("💳 Foydalanuvchi ID'sini kiriting:\n❌ Bekor: /cancel");
});

// 🚪 Chiqish
bot.hears('🚪 Chiqish', async ctx => {
  if(!isAdmin(ctx)) return;
  clearState(ADMIN_ID);
  await ctx.reply('👤 Asosiy menyu.', { reply_markup: mainMenu(isAdmin(ctx)).reply_markup });
});

// /cancel
bot.command('cancel', async ctx => {
  if(!isAdmin(ctx)) return;
  clearState(ADMIN_ID);
  await ctx.reply('❌ Bekor qilindi.', { reply_markup: adminMenu().reply_markup });
});

// ════════════════════════════════════════════════════════════════
//  XABAR HANDLER — STATE MACHINE
// ════════════════════════════════════════════════════════════════
bot.on('message', async(ctx, next) => {
  const text = ctx.message?.text || '';
  if(isAdmin(ctx)){
    const st = getState(ADMIN_ID);

    if(st.action === 'broadcast'){
      clearState(ADMIN_ID);
      const rows = await dbAll('SELECT id FROM users');
      let sent=0, fail=0;
      await ctx.reply(`📢 Yuborilmoqda... (${rows.length} ta)`);
      for(const row of rows){
        try{ await bot.telegram.sendMessage(row.id, text, { parse_mode:'HTML' }); sent++; }
        catch{ fail++; }
        await new Promise(r=>setTimeout(r,40));
      }
      await logAdmin('BROADCAST', null, `sent:${sent} fail:${fail}`, '', text.substring(0,100));
      return ctx.reply(`✅ Yuborildi: ${sent}\n❌ Xato: ${fail}`, { reply_markup: adminMenu().reply_markup });
    }

    if(st.action === 'set_rules'){
      clearState(ADMIN_ID);
      const oldRules = await getSetting('rules_text');
      await setSetting('rules_text', text);
      await logAdmin('RULES_UPDATE', null, 'qoidalar yangilandi',
        (oldRules||'').substring(0,50), text.substring(0,50));
      return ctx.reply('✅ <b>Qoidalar yangilandi!</b>', { parse_mode:'HTML', reply_markup: adminMenu().reply_markup });
    }

    if(st.action === 'addch'){
      clearState(ADMIN_ID);
      const ch = text.trim().startsWith('@') ? text.trim() : '@'+text.trim();
      await addChannel(ch);
      await logChannel('ADD', ch);
      await logAdmin('CHANNEL_ADD', null, ch, '', ch);
      return ctx.reply(`✅ <b>${ch}</b> qo'shildi!`, { parse_mode:'HTML', reply_markup: adminMenu().reply_markup });
    }

    if(st.action === 'setsetting'){
      const key = st.key; clearState(ADMIN_ID);
      const val = parseInt(text, 10);
      if(isNaN(val)||val<=0) return ctx.reply('❌ Musbat son kiriting.');
      if(key==='win_chance'&&(val<1||val>99)) return ctx.reply('❌ 1 dan 99 gacha bo\'lishi kerak.');
      const oldVal = await getSetting(key);
      await setSetting(key, val);
      await logAdmin('SETTING_CHANGE', null, key, oldVal||'', String(val));
      const labels = { referral_sum:'Referal summasi', min_withdraw:'Minimal yechish', bet_amount:'Stavka', win_chance:'Yutuq ehtimoli' };
      return ctx.reply(
        `✅ <b>${labels[key]}</b>: <b>${val.toLocaleString()}${key==='win_chance'?'%':' so\'m'}</b>`,
        { parse_mode:'HTML', reply_markup: adminMenu().reply_markup }
      );
    }

    if(st.action === 'userinfo'){
      clearState(ADMIN_ID);
      const uid = parseInt(text, 10);
      if(isNaN(uid)) return ctx.reply("❌ Noto'g'ri ID.");
      const u = await getUser(uid);
      if(!u) return ctx.reply('❌ Foydalanuvchi topilmadi.');
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

    if(st.action === 'givebal_id'){
      const uid = parseInt(text, 10);
      if(isNaN(uid)) return ctx.reply("❌ Noto'g'ri ID.");
      const u = await getUser(uid);
      if(!u) return ctx.reply('❌ Foydalanuvchi topilmadi.');
      setState(ADMIN_ID, { action:'givebal_amount', userId:uid });
      return ctx.reply(`💳 ID: <code>${uid}</code>\nMiqdorni kiriting (so'm):\n❌ Bekor: /cancel`, { parse_mode:'HTML' });
    }

    if(st.action === 'givebal_amount'){
      const uid = st.userId; clearState(ADMIN_ID);
      const amount = parseInt(text, 10);
      if(isNaN(amount)) return ctx.reply("❌ Noto'g'ri miqdor.");
      const targetUser = await getUser(uid);
      await addBalance(uid, amount);
      await logAdmin('BALANCE_GIVE', uid, `amount:${amount}`,
        targetUser ? String(targetUser.balance) : '0',
        targetUser ? String(targetUser.balance + amount) : String(amount));
      await logUser(uid, 'BALANCE_GIVEN', `by_admin amount:${amount}`,
        targetUser ? targetUser.balance : 0,
        targetUser ? targetUser.balance + amount : amount);
      bot.telegram.sendMessage(
        uid,
        `💰 <b>Hisobingizga ${amount.toLocaleString()} so'm qo'shildi!</b>`,
        { parse_mode:'HTML' }
      ).catch(()=>{});
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
  await ctx.reply(
    "❓ Noto'g'ri buyruq.\n\nMenyudan foydalaning 👇",
    { reply_markup: isAdmin(ctx) ? adminMenu().reply_markup : mainMenu(isAdmin(ctx)).reply_markup }
  );
});

// ════════════════════════════════════════════════════════════════
//  AVTOMATIK BACKUP (har 6 soatda)
// ════════════════════════════════════════════════════════════════
function backupDB() {
  const backupPath = path.join(DATA_DIR, 'bot_backup.db');
  const backup = new (require('sqlite3').verbose().Database)(backupPath);
  db.backup(backup, err => {
    if(err) console.error('Backup xato:', err.message);
    else    console.log('Backup saqlandi:', backupPath);
    backup.close();
  });
}
setInterval(backupDB, 6 * 60 * 60 * 1000); // har 6 soatda

// ════════════════════════════════════════════════════════════════
//  SERVER
// ════════════════════════════════════════════════════════════════
const app = express();
app.use(express.json());
app.get('/', (_,res)=>res.send('OK'));
app.post('/telegram', (req,res)=>bot.handleUpdate(req.body,res));

app.listen(PORT, async () => {
  console.log(`Server port ${PORT}`);
  if(WEBHOOK_URL){
    try{
      await bot.telegram.setWebhook(`${WEBHOOK_URL}/telegram`);
      console.log('Webhook o\'rnatildi: '+WEBHOOK_URL+'/telegram');
    }catch(e){
      console.error('Webhook xato:', e.message);
    }
  } else {
    bot.launch()
      .then(()=>console.log('Polling rejimi'))
      .catch(e=>{ console.error(e); process.exit(1); });
  }
});

function gracefulShutdown(signal) {
  console.log('Shutdown:', signal);
  bot.stop(signal);
  // WAL ni asosiy faylga yozish va DB ni yopish
  db.run('PRAGMA wal_checkpoint(TRUNCATE)', () => {
    db.close(err => {
      if(err) console.error('DB yopish xato:', err.message);
      else    console.log('DB xavfsiz yopildi');
      process.exit(0);
    });
  });
}
process.once('SIGINT',  () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.once('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // nodemon uchun


