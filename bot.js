'use strict';
const { Telegraf, Markup } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();
const express = require('express');
const path    = require('path');
require('dotenv').config();

// ════════════════════════════════════════════════════════════════
//  BOSHLANG'ICH SOZLAMALAR
// ════════════════════════════════════════════════════════════════
const API_TOKEN   = process.env.API_TOKEN   || '';
const ADMIN_ID    = Number(process.env.ADMIN_ID) || 7250754904;
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';
const PORT        = Number(process.env.PORT) || 3000;

// ════════════════════════════════════════════════════════════════
//  MA'LUMOTLAR BAZASI
// ════════════════════════════════════════════════════════════════
const db = new sqlite3.Database(path.join(__dirname, 'bot.db'), err => {
  if (err) console.error('DB xato:', err.message);
  else     console.log('DB ulandi');
});

const dbGet = (sql, p=[]) => new Promise((ok,no) => db.get(sql,p,(e,r)=>e?no(e):ok(r)));
const dbAll = (sql, p=[]) => new Promise((ok,no) => db.all(sql,p,(e,r)=>e?no(e):ok(r)));
const dbRun = (sql, p=[]) => new Promise((ok,no) => db.run(sql,p,function(e){e?no(e):ok(this);}));

db.serialize(()=>{
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

// Yangi foydalanuvchi qo'shish — referal bonusi HALI berilmaydi
async function ensureUser(id, refId=null){
  if(await getUser(id)) return false;
  await dbRun('INSERT INTO users(id) VALUES(?)',[id]);
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
const mainMenu = () => Markup.keyboard([
  ['🎰 Kazino', '👥 Referal ulashish'],
  ['💰 Balans', '💸 Pul yechish'],
  ['📜 Qoidalar']
]).resize();

const adminMenu = () => Markup.keyboard([
  ['📊 Statistika', '📢 Xabar yuborish'],
  ['📋 Kanallar',   '⚙️ Sozlamalar'],
  ['👤 Foydalanuvchi', '💳 Balans berish'],
  ['📝 Qoidalarni tahrirlash'],
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
      await dbRun('UPDATE users SET balance=balance+?,ref_count=ref_count+1 WHERE id=?',[rs, pending.ref_id]);
      await dbRun('DELETE FROM pending_referrals WHERE new_user_id=?',[userId]);
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
      { parse_mode: 'HTML', reply_markup: mainMenu().reply_markup }
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
    { parse_mode:'HTML', reply_markup: mainMenu().reply_markup }
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

// ── 👥 REFERAL ────────────────────────────────────────────────
bot.hears('👥 Referal ulashish', async ctx => {
  await ensureUser(ctx.from.id);
  const u   = await getUser(ctx.from.id);
  const bi  = await ctx.telegram.getMe();
  const link= `https://t.me/${bi.username}?start=${ctx.from.id}`;
  const rs  = Number(await getSetting('referral_sum'));

  // Isbot kanal (birinchi kanal yoki sozlamadan olinadi)
  const chs = await getChannels();
  const isbotCh = chs.length ? chs[0].name : null;

  const shareText =
    `🎰 Bot orqali pul ishlang! Har referal uchun ${rs.toLocaleString()} so'm!\n${link}`;

  const btns = [];
  btns.push([Markup.button.switchToChat('📤 Do\'stlarga ulashish', shareText)]);
  if(isbotCh){
    const slug = isbotCh.startsWith('@') ? isbotCh.slice(1) : isbotCh;
    btns.push([Markup.button.url('📢 Kanal: ' + isbotCh, 'https://t.me/' + slug)]);
  }
  btns.push([Markup.button.url('ℹ️ Botdan foydalanish qoidalari', `https://t.me/${bi.username}?start=rules`)]);
  btns.push([Markup.button.url('👑 Admin bilan bog\'lanish', `https://t.me/${(await bot.telegram.getChat(ADMIN_ID)).username || ADMIN_ID}`)]);

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
      ]).reply_markup
    }
  );
});

async function playGame(ctx, emoji){
  const userId = ctx.from.id;
  if(activePlayers.has(userId))
    return ctx.answerCbQuery("⏳ O'yin hali tugamadi!", { show_alert:true });
  await ctx.answerCbQuery();
  await ensureUser(userId);
  const u   = await getUser(userId);
  const bet = Number(await getSetting('bet_amount'));
  const wc  = Number(await getSetting('win_chance'));

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
    await ctx.reply(`🎮 <b>O'yin boshlandi!</b> Omad! 🍀`, { parse_mode:'HTML' });
    await ctx.replyWithDice(emoji);
    const waits = { '🎰':3500,'🎲':2000,'🏀':3000,'⚽':3000,'🎯':3000 };
    await new Promise(r=>setTimeout(r, waits[emoji]||2500));
    const won = Math.random()*100 < wc;
    await addBalance(userId, won ? bet : -bet);
    await incGame(userId, won);
    const nu = await getUser(userId);
    activePlayers.delete(userId);

    const gameKey = emoji==='🎰'?'slot':emoji==='🎲'?'dice':emoji==='🏀'?'basket':emoji==='⚽'?'football':'darts';
    const retryBtn = Markup.inlineKeyboard([[Markup.button.callback("🔄 Yana o'ynash",'game_'+gameKey)]]);

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

bot.action('game_slot',     ctx=>playGame(ctx,'🎰'));
bot.action('game_dice',     ctx=>playGame(ctx,'🎲'));
bot.action('game_basket',   ctx=>playGame(ctx,'🏀'));
bot.action('game_football', ctx=>playGame(ctx,'⚽'));
bot.action('game_darts',    ctx=>playGame(ctx,'🎯'));

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
  await addBalance(Number(uid), Number(amt));
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
  await ctx.answerCbQuery(`✅ ${name} o'chirildi`);
  await ctx.deleteMessage().catch(()=>{});
  await showChannels(ctx);
});

bot.action('toggle_sub', async ctx => {
  if(!isAdmin(ctx)) return ctx.answerCbQuery('❌ Ruxsat yo\'q');
  const cur  = await getSetting('sub_required');
  const next = cur==='1' ? '0' : '1';
  await setSetting('sub_required', next);
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
  await ctx.reply('👤 Asosiy menyu.', { reply_markup: mainMenu().reply_markup });
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
      return ctx.reply(`✅ Yuborildi: ${sent}\n❌ Xato: ${fail}`, { reply_markup: adminMenu().reply_markup });
    }

    if(st.action === 'set_rules'){
      clearState(ADMIN_ID);
      await setSetting('rules_text', text);
      return ctx.reply('✅ <b>Qoidalar yangilandi!</b>', { parse_mode:'HTML', reply_markup: adminMenu().reply_markup });
    }

    if(st.action === 'addch'){
      clearState(ADMIN_ID);
      const ch = text.trim().startsWith('@') ? text.trim() : '@'+text.trim();
      await addChannel(ch);
      return ctx.reply(`✅ <b>${ch}</b> qo'shildi!`, { parse_mode:'HTML', reply_markup: adminMenu().reply_markup });
    }

    if(st.action === 'setsetting'){
      const key = st.key; clearState(ADMIN_ID);
      const val = parseInt(text, 10);
      if(isNaN(val)||val<=0) return ctx.reply('❌ Musbat son kiriting.');
      if(key==='win_chance'&&(val<1||val>99)) return ctx.reply('❌ 1 dan 99 gacha bo\'lishi kerak.');
      await setSetting(key, val);
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
      await addBalance(uid, amount);
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
    { reply_markup: isAdmin(ctx) ? adminMenu().reply_markup : mainMenu().reply_markup }
  );
});

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

process.once('SIGINT',  ()=>bot.stop('SIGINT'));
process.once('SIGTERM', ()=>bot.stop('SIGTERM'));
