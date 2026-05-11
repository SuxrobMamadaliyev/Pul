'use strict';
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// ════════════════════════════════════════════════════════════════
//  BOSHLANG'ICH SOZLAMALAR
// ════════════════════════════════════════════════════════════════
const API_TOKEN   = process.env.API_TOKEN   || '8611357164:AAHkJ0YywP7zvKW4nGY84dRsMSMva_pTOfM';
const ADMIN_ID    = Number(process.env.ADMIN_ID) || 7250754904;
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';
const PORT        = Number(process.env.PORT) || 3000;

// ════════════════════════════════════════════════════════════════
//  SUPABASE
// ════════════════════════════════════════════════════════════════
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ════════════════════════════════════════════════════════════════
//  SETTINGS
// ════════════════════════════════════════════════════════════════
const settingsCache = {};

async function loadSettings() {
  const { data } = await supabase.from('settings').select('*');
  if (data) data.forEach(r => { settingsCache[r.key] = r.value; });
}

async function getSetting(k) {
  if (settingsCache[k] !== undefined) return settingsCache[k];
  const { data } = await supabase.from('settings').select('value').eq('key', k).single();
  return data?.value ?? null;
}

async function setSetting(k, v) {
  settingsCache[k] = String(v);
  await supabase.from('settings').upsert({ key: k, value: String(v) });
}

// ════════════════════════════════════════════════════════════════
//  TASKS
// ════════════════════════════════════════════════════════════════
async function loadTasks() {
  const { data } = await supabase.from('tasks').select('*').order('id');
  return data || [];
}

async function addTask(task) {
  const { data } = await supabase.from('tasks').insert(task).select().single();
  return data;
}

async function deleteTask(id) {
  await supabase.from('tasks').delete().eq('id', id);
}

async function isTaskDone(userId, taskId) {
  const { data } = await supabase.from('task_done')
    .select('task_id').eq('user_id', userId).eq('task_id', taskId).single();
  return !!data;
}

async function markTaskDone(userId, taskId) {
  await supabase.from('task_done').upsert({ user_id: Number(userId), task_id: Number(taskId) });
}

// ════════════════════════════════════════════════════════════════
//  CHANNELS
// ════════════════════════════════════════════════════════════════
async function getChannels() {
  const { data } = await supabase.from('channels').select('name');
  return (data || []).map(r => ({ name: r.name }));
}

async function addChannel(name) {
  await supabase.from('channels').upsert({ name });
}

async function delChannel(name) {
  await supabase.from('channels').delete().eq('name', name);
}

// ════════════════════════════════════════════════════════════════
//  USERS
// ════════════════════════════════════════════════════════════════
async function getUser(id) {
  const { data } = await supabase.from('users').select('*').eq('id', Number(id)).single();
  return data || null;
}

async function ensureUserRecord(id, from = null) {
  const existing = await getUser(id);
  const now = new Date().toISOString();
  if (!existing) {
    await supabase.from('users').insert({
      id: Number(id),
      username: from?.username || '',
      first_name: from?.first_name || '',
      last_name: from?.last_name || '',
      language_code: from?.language_code || '',
      is_bot: from?.is_bot || false,
      join_date: now,
      balance: 0,
      ref_count: 0,
      game_count: 0,
      wins: 0,
      losses: 0,
      last_updated: now,
      last_seen: now,
    });
    return true;
  }
  const updates = { last_seen: now };
  if (from) {
    ['username', 'first_name', 'last_name', 'language_code'].forEach(f => {
      if (from[f] !== undefined && existing[f] !== from[f]) updates[f] = from[f];
    });
  }
  await supabase.from('users').update(updates).eq('id', Number(id));
  return false;
}

async function updateUser(id, fields) {
  await supabase.from('users').update(fields).eq('id', Number(id));
}

async function addBalance(id, delta) {
  const user = await getUser(id);
  if (!user) return;
  await supabase.from('users').update({
    balance: (user.balance || 0) + delta,
    last_updated: new Date().toISOString()
  }).eq('id', Number(id));
}

async function setBalance(id, val) {
  await supabase.from('users').update({
    balance: val,
    last_updated: new Date().toISOString()
  }).eq('id', Number(id));
}

async function incGame(id, win) {
  const user = await getUser(id);
  if (!user) return;
  await supabase.from('users').update({
    game_count: (user.game_count || 0) + 1,
    wins:       win ? (user.wins || 0) + 1 : (user.wins || 0),
    losses:     win ? (user.losses || 0) : (user.losses || 0) + 1,
  }).eq('id', Number(id));
}

async function loadAllUsers() {
  const { data } = await supabase.from('users').select('*');
  return data || [];
}

// ════════════════════════════════════════════════════════════════
//  PENDING REFERRALS
// ════════════════════════════════════════════════════════════════
async function getPending(newUserId) {
  const { data } = await supabase.from('pending_referrals')
    .select('ref_id').eq('new_user_id', Number(newUserId)).single();
  return data?.ref_id || null;
}

async function setPending(newUserId, refId) {
  await supabase.from('pending_referrals').upsert({ new_user_id: Number(newUserId), ref_id: Number(refId) });
}

async function delPending(newUserId) {
  await supabase.from('pending_referrals').delete().eq('new_user_id', Number(newUserId));
}

// ════════════════════════════════════════════════════════════════
//  WITHDRAWALS
// ════════════════════════════════════════════════════════════════
async function addWithdrawal(userId, amount) {
  await supabase.from('withdrawals').insert({
    user_id: Number(userId), amount, status: 'pending',
    created_at: new Date().toISOString()
  });
}

async function updateWithdrawal(userId, amount, status) {
  const { data } = await supabase.from('withdrawals')
    .select('id').eq('user_id', Number(userId)).eq('amount', amount).eq('status', 'pending')
    .order('created_at', { ascending: false }).limit(1).single();
  if (data) await supabase.from('withdrawals').update({ status }).eq('id', data.id);
}

async function loadWithdrawals() {
  const { data } = await supabase.from('withdrawals').select('*').order('created_at', { ascending: false });
  return data || [];
}

// ════════════════════════════════════════════════════════════════
//  LOGS
// ════════════════════════════════════════════════════════════════
async function logUser(userId, action, detail = '', balBefore = 0, balAfter = 0) {
  await supabase.from('logs').insert({
    type: 'user', user_id: Number(userId), action, detail,
    balance_before: balBefore, balance_after: balAfter,
    created_at: new Date().toISOString()
  });
}

async function logAdmin(action, targetId = null, detail = '', oldVal = '', newVal = '') {
  await supabase.from('logs').insert({
    type: 'admin', action, target_id: targetId ? Number(targetId) : null,
    detail, old_value: String(oldVal), new_value: String(newVal),
    created_at: new Date().toISOString()
  });
}

async function logChannel(action, name) {
  await supabase.from('logs').insert({
    type: 'channel', action, channel_name: name,
    created_at: new Date().toISOString()
  });
}

// ════════════════════════════════════════════════════════════════
//  ENSURE USER
// ════════════════════════════════════════════════════════════════
async function ensureUser(id, refId = null, from = null) {
  const isNew = await ensureUserRecord(id, from);
  if (isNew) {
    await logUser(id, 'REGISTER', refId ? 'ref:' + refId : 'direct', 0, 0);
    if (refId) {
      const ref = parseInt(refId, 10);
      if (!isNaN(ref) && ref !== id) {
        const refUser = await getUser(ref);
        if (refUser) await setPending(id, ref);
      }
    }
  }
  return isNew;
}

// ════════════════════════════════════════════════════════════════
//  OBUNA TEKSHIRUV
// ════════════════════════════════════════════════════════════════
async function checkUserSub(telegram, userId) {
  const subRequired = await getSetting('sub_required');
  if (subRequired !== '1') return { ok: true, notSub: [] };
  const chs = await getChannels();
  if (!chs.length) return { ok: true, notSub: [] };
  const notSub = [];
  for (const ch of chs) {
    try {
      const m = await telegram.getChatMember(ch.name, userId);
      if (['left', 'kicked'].includes(m.status)) notSub.push(ch.name);
    } catch (e) { console.warn('Kanal tekshiruv xatosi:', ch.name, e.message); }
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
    "🔒 <b>Botdan foydalanish uchun quyidagi kanallarga a'zo bo'ling:</b>\n\n"
    + notSub.map((c, i) => `${i + 1}. ${c}`).join('\n'),
    { parse_mode: 'HTML', reply_markup: Markup.inlineKeyboard(btns).reply_markup }
  );
}

// ════════════════════════════════════════════════════════════════
//  MENYULAR
// ════════════════════════════════════════════════════════════════
const mainMenu = (isAdm = false) => {
  const rows = [
    ['🎰 Kazino', '👥 Referal ulashish'],
    ['💰 Balans', '💸 Pul yechish'],
    ['📋 Vazifalar', '📜 Qoidalar'],
    ['📞 Support'],
  ];
  if (isAdm) rows.push(['👑 Admin paneli']);
  return Markup.keyboard(rows).resize();
};

const adminMenu = () => Markup.keyboard([
  ['📊 Statistika', '📢 Xabar yuborish'],
  ['📋 Kanallar', '⚙️ Sozlamalar'],
  ['👤 Foydalanuvchi', '💳 Balans berish'],
  ['📜 Loglar', '📝 Qoidalarni tahrirlash'],
  ['🗂 Vazifalar boshqaruv', '🚪 Chiqish']
]).resize();

// ════════════════════════════════════════════════════════════════
//  BOT
// ════════════════════════════════════════════════════════════════
const bot = new Telegraf(API_TOKEN);
const isAdmin = ctx => ctx.from?.id === ADMIN_ID;

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
    await ensureUser(userId, null, ctx.from);
    const pending = await getPending(userId);
    if (pending) {
      const rs = Number(await getSetting('referral_sum'));
      const refUser = await getUser(pending);
      await addBalance(pending, rs);
      await supabase.from('users').update({
        ref_count: (refUser?.ref_count || 0) + 1
      }).eq('id', pending);
      await delPending(userId);
      await logUser(pending, 'REFERRAL_BONUS', 'new_user:' + userId, refUser?.balance || 0, (refUser?.balance || 0) + rs);
      bot.telegram.sendMessage(pending, `🎉 <b>Yangi referal bonus!</b>\n👤 Yangi foydalanuvchi obunadan o'tdi\n💰 +${rs.toLocaleString()} so'm`, { parse_mode: 'HTML' }).catch(() => {});
    }
    await ctx.deleteMessage().catch(() => {});
    const rs = Number(await getSetting('referral_sum'));
    const mw = Number(await getSetting('min_withdraw'));
    await ctx.reply(
      `✅ <b>Obunadan o'tdingiz!</b>\n\n👋 Xush kelibsiz, <b>${ctx.from.first_name}</b>!\n\n`
      + `🤑 Har referal uchun <b>${rs.toLocaleString()} so'm</b>!\n`
      + `🎰 Kazinoda omadingizni sinab ko'ring!\n`
      + `💸 <b>${mw.toLocaleString()} so'm</b>dan boshlab yechish\n\nMenyudan tanlang 👇`,
      { parse_mode: 'HTML', reply_markup: mainMenu(isAdmin(ctx)).reply_markup }
    );
  } else {
    const btns = notSub.map(ch => {
      const slug = ch.startsWith('@') ? ch.slice(1) : ch;
      return [Markup.button.url('📢 ' + ch, 'https://t.me/' + slug)];
    });
    btns.push([Markup.button.callback("✅ A'zo bo'ldim — Tekshirish", 'check_sub')]);
    await ctx.editMessageReplyMarkup(Markup.inlineKeyboard(btns).reply_markup).catch(async () => {
      await ctx.reply("🔒 Hali ham a'zo emassiz:\n\n" + notSub.map((c, i) => `${i + 1}. ${c}`).join('\n'),
        { parse_mode: 'HTML', reply_markup: Markup.inlineKeyboard(btns).reply_markup });
    });
    try { await ctx.telegram.answerCbQuery(ctx.callbackQuery.id, "❌ Hali ham a'zo emassiz!", { show_alert: true }); } catch (e) {}
  }
});

// ── /start ──
bot.command('start', async ctx => {
  const userId = ctx.from.id;
  const arg = ctx.message.text.split(' ')[1] || '';
  if (arg === 'admin' && isAdmin(ctx)) {
    return ctx.reply('👑 <b>Admin panelga xush kelibsiz!</b>', { parse_mode: 'HTML', reply_markup: adminMenu().reply_markup });
  }
  const isNew = await ensureUser(userId, arg, ctx.from);
  const { ok, notSub } = await checkUserSub(ctx.telegram, userId);
  if (!ok && !isAdmin(ctx)) return sendSubRequired(ctx, notSub);
  if (isNew) {
    const pending = await getPending(userId);
    if (pending) {
      const rs = Number(await getSetting('referral_sum'));
      const refUser = await getUser(pending);
      await addBalance(pending, rs);
      await supabase.from('users').update({
        ref_count: (refUser?.ref_count || 0) + 1
      }).eq('id', pending);
      await delPending(userId);
      bot.telegram.sendMessage(pending, `🎉 <b>Yangi referal bonus!</b>\n👤 ${ctx.from.first_name} qo'shildi\n💰 +${rs.toLocaleString()} so'm`, { parse_mode: 'HTML' }).catch(() => {});
    }
  }
  const rs = Number(await getSetting('referral_sum'));
  const mw = Number(await getSetting('min_withdraw'));
  await ctx.reply(
    `👋 <b>Assalomu alaykum, ${ctx.from.first_name}!</b>\n\n`
    + `🤑 Har referal uchun <b>${rs.toLocaleString()} so'm</b>!\n`
    + `🎰 Kazinoda omadingizni sinab ko'ring!\n`
    + `📋 Vazifalar bajaring va bonus oling!\n`
    + `💸 <b>${mw.toLocaleString()} so'm</b>dan boshlab yechish\n\nMenyudan tanlang 👇`,
    { parse_mode: 'HTML', reply_markup: mainMenu(isAdmin(ctx)).reply_markup }
  );
});

bot.command('admin', async ctx => {
  if (!isAdmin(ctx)) return;
  await ctx.reply('👑 <b>Admin panelga xush kelibsiz!</b>', { parse_mode: 'HTML', reply_markup: adminMenu().reply_markup });
});

// ── 💰 BALANS ──
bot.hears('💰 Balans', async ctx => {
  await ensureUser(ctx.from.id, null, ctx.from);
  const u = await getUser(ctx.from.id);
  const rs = Number(await getSetting('referral_sum'));
  const mw = Number(await getSetting('min_withdraw'));
  await ctx.reply(
    `💰 <b>Hisobingiz</b>\n━━━━━━━━━━━━━━━━━━━━\n`
    + `💵 Balans:        <b>${u.balance.toLocaleString()} so'm</b>\n`
    + `👥 Referallar:    <b>${u.ref_count} ta</b>\n`
    + `🎰 O'yinlar:      <b>${u.game_count} ta</b>\n`
    + `✅ Yutgan:        <b>${u.wins} ta</b>\n`
    + `❌ Yutqazgan:     <b>${u.losses} ta</b>\n`
    + `━━━━━━━━━━━━━━━━━━━━\n`
    + `📌 Minimal yechish: <b>${mw.toLocaleString()} so'm</b>\n`
    + `💎 Har referal: <b>${rs.toLocaleString()} so'm</b>`,
    { parse_mode: 'HTML' }
  );
});

// ── 📜 QOIDALAR ──
bot.hears('📜 Qoidalar', async ctx => {
  const rules = await getSetting('rules_text');
  await ctx.reply(rules || '📜 Qoidalar hali kiritilmagan.', { parse_mode: 'HTML' });
});

// ── 📞 SUPPORT ──
bot.hears('📞 Support', async ctx => {
  const adminUser = await bot.telegram.getChat(ADMIN_ID).catch(() => null);
  const adminLink = adminUser?.username ? `https://t.me/${adminUser.username}` : `tg://user?id=${ADMIN_ID}`;
  await ctx.reply(
    `📞 <b>Yordam va qo'llab-quvvatlash</b>\n━━━━━━━━━━━━━━━━━━━━\n\n`
    + `❓ Savollaringiz yoki muammolaringiz bo'lsa,\nadmin bilan bog'laning.\n\n`
    + `⏰ Ish vaqti: <b>09:00 — 23:00</b>`,
    { parse_mode: 'HTML', reply_markup: Markup.inlineKeyboard([[Markup.button.url("👑 Admin bilan bog'lanish", adminLink)]]).reply_markup }
  );
});

// ── 👥 REFERAL ──
bot.hears('👥 Referal ulashish', async ctx => {
  await ensureUser(ctx.from.id, null, ctx.from);
  const u = await getUser(ctx.from.id);
  const bi = await ctx.telegram.getMe();
  const link = `https://t.me/${bi.username}?start=${ctx.from.id}`;
  const rs = Number(await getSetting('referral_sum'));
  const chs = await getChannels();
  const isbotCh = chs.length ? chs[0].name : null;
  const shareText = `🎰 Bot orqali pul ishlang! Har referal uchun ${rs.toLocaleString()} so'm!\n${link}`;
  const btns = [[Markup.button.switchToChat("📤 Do'stlarga ulashish", shareText)]];
  if (isbotCh) {
    const slug = isbotCh.startsWith('@') ? isbotCh.slice(1) : isbotCh;
    btns.push([Markup.button.url('📢 ' + isbotCh, 'https://t.me/' + slug)]);
  }
  await ctx.reply(
    `👥 <b>Referal tizimi</b>\n━━━━━━━━━━━━━━━━━━━━\n`
    + `💰 Har do'st uchun: <b>${rs.toLocaleString()} so'm</b>\n\n`
    + `🔗 <b>Sizning havolangiz:</b>\n<code>${link}</code>\n\n`
    + `📊 Jalb qilganlar: <b>${u.ref_count} ta</b>\n`
    + `💵 Balans: <b>${u.balance.toLocaleString()} so'm</b>\n`
    + `━━━━━━━━━━━━━━━━━━━━\n📤 Havolani do'stlaringizga ulashing!`,
    { parse_mode: 'HTML', reply_markup: Markup.inlineKeyboard(btns).reply_markup }
  );
});

// ── 📋 VAZIFALAR ──
bot.hears('📋 Vazifalar', async ctx => {
  await ensureUser(ctx.from.id, null, ctx.from);
  const siteBase = WEBHOOK_URL || `http://localhost:${PORT}`;
  const tasksUrl = `${siteBase}/vazifalar?user_id=${ctx.from.id}`;
  await ctx.reply(
    `📋 <b>Vazifalar</b>\n━━━━━━━━━━━━━━━━━━━━\n`
    + `✅ Vazifalarni bajaring va bonus oling!\n\n`
    + `🔗 Saytga o'ting va vazifalarni bajaring:`,
    {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.url('📋 Vazifalarni bajarish', tasksUrl)]
      ]).reply_markup
    }
  );
});

// ════════════════════════════════════════════════════════════════
//  🎰 KAZINO
// ════════════════════════════════════════════════════════════════
const activePlayers = new Set();
const GAME_CONFIG = {
  slot:     { emoji: '🎰', wait: 3500, label: 'Slot mashina' },
  dice:     { emoji: '🎲', wait: 2000, label: "Zar o'yini" },
  basket:   { emoji: '🏀', wait: 3000, label: 'Basketbol' },
  football: { emoji: '⚽', wait: 3500, label: 'Futbol' },
  darts:    { emoji: '🎯', wait: 3000, label: 'Nishon' },
  bowling:  { emoji: '🎳', wait: 2500, label: 'Bouling' },
};

bot.hears('🎰 Kazino', async ctx => {
  await ensureUser(ctx.from.id, null, ctx.from);
  const u = await getUser(ctx.from.id);
  const bet = Number(await getSetting('bet_amount'));
  await ctx.reply(
    `🎰 <b>Kazino</b>\n━━━━━━━━━━━━━━━━━━━━\n`
    + `💵 Balans: <b>${u.balance.toLocaleString()} so'm</b>\n`
    + `🎲 Stavka: <b>${bet.toLocaleString()} so'm</b>\n\nO'yin turini tanlang:`,
    {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🎰 Slot mashina', 'game_slot')],
        [Markup.button.callback("🎲 Zar o'yini", 'game_dice')],
        [Markup.button.callback('🏀 Basketbol', 'game_basket')],
        [Markup.button.callback('⚽ Futbol', 'game_football')],
        [Markup.button.callback('🎯 Nishon', 'game_darts')],
        [Markup.button.callback('🎳 Bouling', 'game_bowling')],
      ]).reply_markup
    }
  );
});

async function playGame(ctx, gameKey) {
  const userId = ctx.from.id;
  const cfg = GAME_CONFIG[gameKey];
  if (!cfg) return;
  if (activePlayers.has(userId)) return ctx.answerCbQuery("⏳ O'yin hali tugamadi!", { show_alert: true });
  await ctx.answerCbQuery();
  await ensureUser(userId, null, ctx.from);
  const u = await getUser(userId);
  const bet = Number(await getSetting('bet_amount'));
  if (u.balance < bet) {
    return ctx.reply(
      `❌ <b>Mablag' yetarli emas!</b>\n\n🎲 Stavka: <b>${bet.toLocaleString()} so'm</b>\n`
      + `💵 Sizda: <b>${u.balance.toLocaleString()} so'm</b>\n\n👥 Referal orqali to'ldiring!`,
      { parse_mode: 'HTML' }
    );
  }
  activePlayers.add(userId);
  try {
    await ctx.reply(`🎮 <b>${cfg.label} boshlandi!</b> Omad! 🍀`, { parse_mode: 'HTML' });
    await ctx.telegram.sendDice(ctx.chat.id, { emoji: cfg.emoji });
    await new Promise(r => setTimeout(r, cfg.wait));
    const wc = Number(await getSetting('win_chance'));
    const won = Math.random() * 100 < wc;
    await addBalance(userId, won ? bet : -bet);
    await incGame(userId, won);
    const nu = await getUser(userId);
    activePlayers.delete(userId);
    await logUser(userId, won ? 'GAME_WIN' : 'GAME_LOSE', `game:${gameKey} bet:${bet}`, u.balance, nu.balance);
    const retryBtn = Markup.inlineKeyboard([[Markup.button.callback("🔄 Yana o'ynash", 'game_' + gameKey)]]);
    if (won) {
      await ctx.reply(
        `🎉 <b>YUTDINGIZ!</b> 🎉\n━━━━━━━━━━━━━━━━━━━━\n💰 Yutuq: <b>+${bet.toLocaleString()} so'm</b>\n💵 Balans: <b>${nu.balance.toLocaleString()} so'm</b>`,
        { parse_mode: 'HTML', reply_markup: retryBtn.reply_markup }
      );
    } else {
      await ctx.reply(
        `😔 <b>Yutqazdingiz...</b>\n━━━━━━━━━━━━━━━━━━━━\n💸 -<b>${bet.toLocaleString()} so'm</b>\n💵 Balans: <b>${nu.balance.toLocaleString()} so'm</b>\n🍀 Yana urinib ko'ring!`,
        { parse_mode: 'HTML', reply_markup: retryBtn.reply_markup }
      );
    }
  } catch (err) {
    activePlayers.delete(userId);
    console.error('Kazino xato:', err);
    ctx.reply('❌ Xato yuz berdi.').catch(() => {});
  }
}

bot.action('game_slot',     ctx => playGame(ctx, 'slot'));
bot.action('game_dice',     ctx => playGame(ctx, 'dice'));
bot.action('game_basket',   ctx => playGame(ctx, 'basket'));
bot.action('game_football', ctx => playGame(ctx, 'football'));
bot.action('game_darts',    ctx => playGame(ctx, 'darts'));
bot.action('game_bowling',  ctx => playGame(ctx, 'bowling'));

// ── 💸 PUL YECHISH ──
bot.hears('💸 Pul yechish', async ctx => {
  await ensureUser(ctx.from.id, null, ctx.from);
  const u = await getUser(ctx.from.id);
  const mw = Number(await getSetting('min_withdraw'));
  if (u.balance < mw) {
    return ctx.reply(
      `❌ <b>Yetarli mablag' yo'q!</b>\n\n💵 Sizda: <b>${u.balance.toLocaleString()} so'm</b>\n`
      + `📌 Kerak: <b>${mw.toLocaleString()} so'm</b>\n🔺 Yana: <b>${(mw - u.balance).toLocaleString()} so'm</b>`,
      { parse_mode: 'HTML' }
    );
  }
  const amount = u.balance;
  await addWithdrawal(ctx.from.id, amount);
  await setBalance(ctx.from.id, 0);
  await logUser(ctx.from.id, 'WITHDRAW_REQUEST', `amount:${amount}`, amount, 0);
  await ctx.reply(
    `✅ <b>So'rovingiz qabul qilindi!</b>\n\n💰 Summa: <b>${amount.toLocaleString()} so'm</b>\n⏳ 24 soat ichida ko'rib chiqiladi.`,
    { parse_mode: 'HTML' }
  );
  await bot.telegram.sendMessage(
    ADMIN_ID,
    `💸 <b>Pul yechish so'rovi</b>\n━━━━━━━━━━━━━━━━━━━━\n`
    + `👤 ${ctx.from.first_name} ${ctx.from.last_name || ''}\n🆔 <code>${ctx.from.id}</code>\n`
    + `📛 ${ctx.from.username ? '@' + ctx.from.username : "yo'q"}\n💰 <b>${amount.toLocaleString()} so'm</b>`,
    {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([[
        Markup.button.callback('✅ Tasdiqlash', `aw_${ctx.from.id}_${amount}`),
        Markup.button.callback('❌ Rad etish', `rw_${ctx.from.id}_${amount}`)
      ]]).reply_markup
    }
  ).catch(() => {});
});

bot.action(/^aw_(\d+)_(\d+)$/, async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("❌ Ruxsat yo'q");
  const [, uid, amt] = ctx.match;
  await updateWithdrawal(Number(uid), Number(amt), 'approved');
  await logAdmin('WITHDRAW_APPROVE', Number(uid), `amount:${amt}`, 'pending', 'approved');
  await logUser(Number(uid), 'WITHDRAW_APPROVED', `amount:${amt}`, 0, 0);
  bot.telegram.sendMessage(Number(uid), `✅ <b>${Number(amt).toLocaleString()} so'm tasdiqlandi!</b>\nTez orada o'tkaziladi.`, { parse_mode: 'HTML' }).catch(() => {});
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  await ctx.answerCbQuery('✅ Tasdiqlandi');
  await ctx.reply(`✅ ${uid} → ${Number(amt).toLocaleString()} so'm tasdiqlandi.`);
});

bot.action(/^rw_(\d+)_(\d+)$/, async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("❌ Ruxsat yo'q");
  const [, uid, amt] = ctx.match;
  await addBalance(Number(uid), Number(amt));
  await updateWithdrawal(Number(uid), Number(amt), 'rejected');
  await logAdmin('WITHDRAW_REJECT', Number(uid), `amount:${amt} returned`, 'pending', 'rejected');
  await logUser(Number(uid), 'WITHDRAW_REJECTED', `amount:${amt} returned`, 0, Number(amt));
  bot.telegram.sendMessage(Number(uid), `❌ <b>Pul yechish rad etildi.</b>\nMablag' qaytarildi.`, { parse_mode: 'HTML' }).catch(() => {});
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  await ctx.answerCbQuery('❌ Rad etildi');
  await ctx.reply(`❌ ${uid} ga ${Number(amt).toLocaleString()} so'm qaytarildi.`);
});

// ════════════════════════════════════════════════════════════════
//  👑 ADMIN PANEL
// ════════════════════════════════════════════════════════════════
bot.hears('👑 Admin paneli', async ctx => {
  if (!isAdmin(ctx)) return;
  await ctx.reply('👑 <b>Admin panel</b>', { parse_mode: 'HTML', reply_markup: adminMenu().reply_markup });
});

bot.hears('📊 Statistika', async ctx => {
  if (!isAdmin(ctx)) return;
  const userList = await loadAllUsers();
  const totalBal  = userList.reduce((s, u) => s + (u.balance || 0), 0);
  const totalRef  = userList.reduce((s, u) => s + (u.ref_count || 0), 0);
  const totalGame = userList.reduce((s, u) => s + (u.game_count || 0), 0);
  const ws = await loadWithdrawals();
  const totalW = ws.reduce((s, w) => s + w.amount, 0);
  const pendW  = ws.filter(w => w.status === 'pending').length;
  const chs    = await getChannels();
  const tasks  = await loadTasks();
  await ctx.reply(
    `📊 <b>BOT STATISTIKASI</b>\n━━━━━━━━━━━━━━━━━━━━\n`
    + `👥 Foydalanuvchilar: <b>${userList.length}</b>\n`
    + `💰 Jami balans:      <b>${totalBal.toLocaleString()} so'm</b>\n`
    + `🔗 Jami referallar:  <b>${totalRef}</b>\n`
    + `🎰 Jami o'yinlar:    <b>${totalGame}</b>\n`
    + `📋 Vazifalar:        <b>${tasks.length} ta</b>\n`
    + `━━━━━━━━━━━━━━━━━━━━\n`
    + `💸 Yechish so'rovlari: <b>${ws.length}</b>\n`
    + `⏳ Kutilayotgan:      <b>${pendW}</b>\n`
    + `💵 Jami yechilgan:   <b>${totalW.toLocaleString()} so'm</b>\n`
    + `━━━━━━━━━━━━━━━━━━━━\n`
    + `📢 Kanallar: <b>${chs.map(c => c.name).join(', ') || "Yo'q"}</b>`,
    { parse_mode: 'HTML' }
  );
});

bot.hears('📜 Loglar', async ctx => {
  if (!isAdmin(ctx)) return;
  await ctx.reply('📜 <b>Log turlari</b>', {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('👥 Foydalanuvchi loglari', 'log_user')],
      [Markup.button.callback('👑 Admin loglari', 'log_admin')],
      [Markup.button.callback('📢 Kanal loglari', 'log_channel')],
      [Markup.button.callback("🎰 O'yin statistikasi", 'log_games')],
      [Markup.button.callback('💸 Yechish tarixi', 'log_withdraw')],
    ]).reply_markup
  });
});

bot.action('log_user', async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  const { data: rows } = await supabase.from('logs').select('*')
    .eq('type', 'user').order('created_at', { ascending: false }).limit(15);
  if (!rows?.length) return ctx.reply('📭 Loglar yo\'q');
  const text = rows.map(r =>
    `[${new Date(r.created_at).toLocaleString()}]\n👤 <code>${r.user_id}</code> | <b>${r.action}</b>\n`
    + (r.detail ? `📝 ${r.detail}\n` : '')
    + (r.balance_before !== r.balance_after ? `💰 ${Number(r.balance_before).toLocaleString()} → ${Number(r.balance_after).toLocaleString()} so'm\n` : '')
  ).join('──────────────\n');
  await ctx.reply("👥 <b>So'nggi foydalanuvchi harakatlari</b>\n━━━━━━━━━━━━━━━━━━━━\n" + text, { parse_mode: 'HTML' });
});

bot.action('log_admin', async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  const { data: rows } = await supabase.from('logs').select('*')
    .eq('type', 'admin').order('created_at', { ascending: false }).limit(15);
  if (!rows?.length) return ctx.reply('📭 Loglar yo\'q');
  const text = rows.map(r =>
    `[${new Date(r.created_at).toLocaleString()}]\n⚙️ <b>${r.action}</b>${r.target_id ? ` → <code>${r.target_id}</code>` : ''}\n`
    + (r.detail ? `📝 ${r.detail}\n` : '')
    + (r.old_value || r.new_value ? `🔄 <i>${r.old_value}</i> → <b>${r.new_value}</b>\n` : '')
  ).join('──────────────\n');
  await ctx.reply("👑 <b>So'nggi admin harakatlari</b>\n━━━━━━━━━━━━━━━━━━━━\n" + text, { parse_mode: 'HTML' });
});

bot.action('log_channel', async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  const { data: rows } = await supabase.from('logs').select('*')
    .eq('type', 'channel').order('created_at', { ascending: false }).limit(20);
  if (!rows?.length) return ctx.reply('📭 Kanal loglari yo\'q');
  const text = rows.map(r => `[${new Date(r.created_at).toLocaleString()}] ${r.action === 'ADD' ? '➕' : '🗑'} <b>${r.channel_name}</b>`).join('\n');
  await ctx.reply('📢 <b>Kanal tarixi</b>\n━━━━━━━━━━━━━━━━━━━━\n' + text, { parse_mode: 'HTML' });
});

bot.action('log_games', async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  const { data: gameLogs } = await supabase.from('logs').select('*')
    .in('action', ['GAME_WIN', 'GAME_LOSE']).eq('type', 'user');
  const total = gameLogs?.length || 0;
  const wins  = gameLogs?.filter(r => r.action === 'GAME_WIN').length || 0;
  const losses = total - wins;
  const pct = total ? ((wins / total) * 100).toFixed(1) : 0;
  const byGame = {};
  (gameLogs || []).forEach(r => {
    const g = (r.detail || '').split(' ')[0].replace('game:', '');
    if (!byGame[g]) byGame[g] = { total: 0, wins: 0 };
    byGame[g].total++;
    if (r.action === 'GAME_WIN') byGame[g].wins++;
  });
  let text = `🎰 <b>O'yin statistikasi</b>\n━━━━━━━━━━━━━━━━━━━━\nJami: <b>${total}</b> | Yutdi: <b>${wins}</b> | Yutqazdi: <b>${losses}</b>\nYutish %: <b>${pct}%</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
  Object.entries(byGame).forEach(([g, s]) => {
    const wp = s.total ? ((s.wins / s.total) * 100).toFixed(0) : 0;
    text += `${g}: <b>${s.total}</b> o'yin | yutish <b>${wp}%</b>\n`;
  });
  await ctx.reply(text, { parse_mode: 'HTML' });
});

bot.action('log_withdraw', async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  const rows = (await loadWithdrawals()).slice(0, 15);
  if (!rows.length) return ctx.reply("📭 Yechish tarixi yo'q");
  const statusIcon = { pending: '⏳', approved: '✅', rejected: '❌' };
  const text = rows.map(r =>
    `[${new Date(r.created_at).toLocaleString()}]\n${statusIcon[r.status] || '❓'} <code>${r.user_id}</code> | <b>${Number(r.amount).toLocaleString()} so'm</b>\nHolat: <b>${r.status}</b>`
  ).join('\n──────────────\n');
  await ctx.reply('💸 <b>Yechish tarixi</b>\n━━━━━━━━━━━━━━━━━━━━\n' + text, { parse_mode: 'HTML' });
});

// State map
const states = new Map();
const getState   = id => states.get(id) || {};
const setState   = (id, s) => states.set(id, s);
const clearState = id => states.delete(id);

bot.hears('📢 Xabar yuborish', async ctx => {
  if (!isAdmin(ctx)) return;
  setState(ADMIN_ID, { action: 'broadcast' });
  await ctx.reply('📢 <b>Barcha foydalanuvchilarga yuborish</b>\n\nXabar matnini yuboring:\n❌ Bekor: /cancel', { parse_mode: 'HTML' });
});

bot.hears('📝 Qoidalarni tahrirlash', async ctx => {
  if (!isAdmin(ctx)) return;
  setState(ADMIN_ID, { action: 'set_rules' });
  const cur = await getSetting('rules_text');
  await ctx.reply(`📝 <b>Qoidalarni tahrirlash</b>\n\nHozirgi:\n${cur}\n\n✏️ Yangi matnni yuboring:\n❌ Bekor: /cancel`, { parse_mode: 'HTML' });
});

bot.hears('📋 Kanallar', async ctx => {
  if (!isAdmin(ctx)) return;
  await showChannels(ctx);
});

async function showChannels(ctx) {
  const chs = await getChannels();
  const subOn = (await getSetting('sub_required')) === '1';
  const btns = chs.map(ch => [Markup.button.callback('🗑 ' + ch.name, 'delch_' + encodeURIComponent(ch.name))]);
  btns.push([Markup.button.callback("➕ Kanal qo'shish", 'addch')]);
  btns.push([Markup.button.callback(subOn ? "🔴 Obunani o'chirish" : '🟢 Obunani yoqish', 'toggle_sub')]);
  await ctx.reply(
    `📋 <b>Majburiy obuna kanallari</b>\n\n` + (chs.length ? chs.map((c, i) => `${i + 1}. ${c.name}`).join('\n') : "Kanallar yo'q"),
    { parse_mode: 'HTML', reply_markup: Markup.inlineKeyboard(btns).reply_markup }
  );
}

bot.action('addch', async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  setState(ADMIN_ID, { action: 'addch' });
  await ctx.reply("➕ Kanal username'ini yuboring (masalan: @kanal_nomi)\n❌ Bekor: /cancel");
});

bot.action(/^delch_(.+)$/, async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("❌ Ruxsat yo'q");
  const name = decodeURIComponent(ctx.match[1]);
  await delChannel(name);
  await logChannel('DELETE', name);
  await logAdmin('CHANNEL_DELETE', null, name, name, '');
  await ctx.answerCbQuery(`✅ ${name} o'chirildi`);
  await ctx.deleteMessage().catch(() => {});
  await showChannels(ctx);
});

bot.action('toggle_sub', async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("❌ Ruxsat yo'q");
  const cur  = await getSetting('sub_required');
  const next = cur === '1' ? '0' : '1';
  await setSetting('sub_required', next);
  await logAdmin('SUB_TOGGLE', null, next === '1' ? 'yoqildi' : 'ochirildi', cur, next);
  await ctx.answerCbQuery(next === '1' ? '🟢 Yoqildi' : "🔴 O'chirildi");
  await ctx.deleteMessage().catch(() => {});
  await ctx.reply(next === '1' ? '🟢 <b>Majburiy obuna YOQILDI!</b>' : "🔴 <b>Majburiy obuna O'CHIRILDI!</b>", { parse_mode: 'HTML' });
  await showChannels(ctx);
});

bot.hears('⚙️ Sozlamalar', async ctx => {
  if (!isAdmin(ctx)) return;
  await showSettings(ctx);
});

async function showSettings(ctx) {
  const rs = await getSetting('referral_sum');
  const mw = await getSetting('min_withdraw');
  const bt = await getSetting('bet_amount');
  const wc = await getSetting('win_chance');
  await ctx.reply(
    `⚙️ <b>Sozlamalar</b>\n━━━━━━━━━━━━━━━━━━━━\n`
    + `💰 Referal summasi: <b>${Number(rs).toLocaleString()} so'm</b>\n`
    + `📌 Minimal yechish: <b>${Number(mw).toLocaleString()} so'm</b>\n`
    + `🎲 Stavka:          <b>${Number(bt).toLocaleString()} so'm</b>\n`
    + `🍀 Yutuq ehtimoli:  <b>${wc}%</b>`,
    {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('💰 Referal summasi', 'sset_referral_sum')],
        [Markup.button.callback('📌 Minimal yechish', 'sset_min_withdraw')],
        [Markup.button.callback('🎲 Stavka', 'sset_bet_amount')],
        [Markup.button.callback('🍀 Yutuq ehtimoli', 'sset_win_chance')],
      ]).reply_markup
    }
  );
}

bot.action(/^sset_(.+)$/, async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  const key = ctx.match[1];
  const labels = { referral_sum: "referal summa (so'm)", min_withdraw: "minimal yechish (so'm)", bet_amount: "stavka (so'm)", win_chance: 'yutuq ehtimoli (1-99%)' };
  setState(ADMIN_ID, { action: 'setsetting', key });
  await ctx.reply(`✏️ Yangi ${labels[key] || key} ni kiriting:\n❌ Bekor: /cancel`);
});

bot.hears('👤 Foydalanuvchi', async ctx => {
  if (!isAdmin(ctx)) return;
  setState(ADMIN_ID, { action: 'userinfo' });
  await ctx.reply("👤 Foydalanuvchi ID'sini kiriting:\n❌ Bekor: /cancel");
});

bot.hears('💳 Balans berish', async ctx => {
  if (!isAdmin(ctx)) return;
  setState(ADMIN_ID, { action: 'givebal_id' });
  await ctx.reply("💳 Foydalanuvchi ID'sini kiriting:\n❌ Bekor: /cancel");
});

bot.hears('🗂 Vazifalar boshqaruv', async ctx => {
  if (!isAdmin(ctx)) return;
  const tasks = await loadTasks();
  const list = tasks.map((t, i) => `${i + 1}. ${t.icon} ${t.title} — ${t.reward.toLocaleString()} so'm`).join('\n');
  await ctx.reply(
    `🗂 <b>Vazifalar boshqaruvi</b>\n━━━━━━━━━━━━━━━━━━━━\n${list || "Vazifalar yo'q"}\n`,
    {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback("➕ Vazifa qo'shish", 'task_add')],
        [Markup.button.callback("🗑 Vazifa o'chirish", 'task_del')],
      ]).reply_markup
    }
  );
});

bot.action('task_add', async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  setState(ADMIN_ID, { action: 'task_add_title' });
  await ctx.reply("➕ Yangi vazifa nomi:\n❌ Bekor: /cancel");
});

bot.action('task_del', async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  const tasks = await loadTasks();
  if (!tasks.length) return ctx.reply("Vazifalar yo'q.");
  const btns = tasks.map(t => [Markup.button.callback(`🗑 ${t.title}`, `taskdel_${t.id}`)]);
  await ctx.reply("O'chirish uchun vazifani tanlang:", { reply_markup: Markup.inlineKeyboard(btns).reply_markup });
});

bot.action(/^taskdel_(\d+)$/, async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await deleteTask(Number(ctx.match[1]));
  await ctx.answerCbQuery("✅ O'chirildi");
  await ctx.reply(`✅ Vazifa o'chirildi.`, { reply_markup: adminMenu().reply_markup });
});

bot.hears('🚪 Chiqish', async ctx => {
  if (!isAdmin(ctx)) return;
  clearState(ADMIN_ID);
  await ctx.reply('👤 Asosiy menyu.', { reply_markup: mainMenu(isAdmin(ctx)).reply_markup });
});

bot.command('cancel', async ctx => {
  if (!isAdmin(ctx)) return;
  clearState(ADMIN_ID);
  await ctx.reply('❌ Bekor qilindi.', { reply_markup: adminMenu().reply_markup });
});

// ════════════════════════════════════════════════════════════════
//  STATE MACHINE
// ════════════════════════════════════════════════════════════════
bot.on('message', async (ctx, next) => {
  const text = ctx.message?.text || '';
  if (isAdmin(ctx)) {
    const st = getState(ADMIN_ID);

    if (st.action === 'broadcast') {
      clearState(ADMIN_ID);
      const rows = await loadAllUsers();
      let sent = 0, fail = 0;
      await ctx.reply(`📢 Yuborilmoqda... (${rows.length} ta)`);
      for (const row of rows) {
        try { await bot.telegram.sendMessage(row.id, text, { parse_mode: 'HTML' }); sent++; }
        catch { fail++; }
        await new Promise(r => setTimeout(r, 40));
      }
      await logAdmin('BROADCAST', null, `sent:${sent} fail:${fail}`, '', text.substring(0, 100));
      return ctx.reply(`✅ Yuborildi: ${sent}\n❌ Xato: ${fail}`, { reply_markup: adminMenu().reply_markup });
    }

    if (st.action === 'set_rules') {
      clearState(ADMIN_ID);
      const oldRules = await getSetting('rules_text');
      await setSetting('rules_text', text);
      await logAdmin('RULES_UPDATE', null, 'yangilandi', (oldRules || '').substring(0, 50), text.substring(0, 50));
      return ctx.reply('✅ <b>Qoidalar yangilandi!</b>', { parse_mode: 'HTML', reply_markup: adminMenu().reply_markup });
    }

    if (st.action === 'addch') {
      clearState(ADMIN_ID);
      const ch = text.trim().startsWith('@') ? text.trim() : '@' + text.trim();
      await addChannel(ch);
      await logChannel('ADD', ch);
      await logAdmin('CHANNEL_ADD', null, ch, '', ch);
      return ctx.reply(`✅ <b>${ch}</b> qo'shildi!`, { parse_mode: 'HTML', reply_markup: adminMenu().reply_markup });
    }

    if (st.action === 'setsetting') {
      const key = st.key; clearState(ADMIN_ID);
      const val = parseInt(text, 10);
      if (isNaN(val) || val <= 0) return ctx.reply('❌ Musbat son kiriting.');
      if (key === 'win_chance' && (val < 1 || val > 99)) return ctx.reply('❌ 1 dan 99 gacha bo\'lishi kerak.');
      const oldVal = await getSetting(key);
      await setSetting(key, val);
      await logAdmin('SETTING_CHANGE', null, key, oldVal || '', String(val));
      const labels = { referral_sum: 'Referal summasi', min_withdraw: 'Minimal yechish', bet_amount: 'Stavka', win_chance: 'Yutuq ehtimoli' };
      return ctx.reply(
        `✅ <b>${labels[key]}</b>: <b>${val.toLocaleString()}${key === 'win_chance' ? '%' : " so'm"}</b>`,
        { parse_mode: 'HTML', reply_markup: adminMenu().reply_markup }
      );
    }

    if (st.action === 'userinfo') {
      clearState(ADMIN_ID);
      const uid = parseInt(text, 10);
      if (isNaN(uid)) return ctx.reply("❌ Noto'g'ri ID.");
      const u = await getUser(uid);
      if (!u) return ctx.reply('❌ Foydalanuvchi topilmadi.');
      return ctx.reply(
        `👤 <b>Foydalanuvchi</b>\n━━━━━━━━━━━━━━━━━━━━\n🆔 ID: <code>${u.id}</code>\n`
        + `💰 Balans: <b>${u.balance.toLocaleString()} so'm</b>\n👥 Referallar: <b>${u.ref_count}</b>\n`
        + `🎰 O'yinlar: <b>${u.game_count}</b>\n✅ Yutdi: <b>${u.wins}</b> | ❌ Yutqazdi: <b>${u.losses}</b>`,
        { parse_mode: 'HTML' }
      );
    }

    if (st.action === 'givebal_id') {
      const uid = parseInt(text, 10);
      if (isNaN(uid)) return ctx.reply("❌ Noto'g'ri ID.");
      const u = await getUser(uid);
      if (!u) return ctx.reply('❌ Foydalanuvchi topilmadi.');
      setState(ADMIN_ID, { action: 'givebal_amount', userId: uid });
      return ctx.reply(`💳 ID: <code>${uid}</code>\nMiqdorni kiriting (so'm):\n❌ Bekor: /cancel`, { parse_mode: 'HTML' });
    }

    if (st.action === 'givebal_amount') {
      const uid = st.userId; clearState(ADMIN_ID);
      const amount = parseInt(text, 10);
      if (isNaN(amount)) return ctx.reply("❌ Noto'g'ri miqdor.");
      const targetUser = await getUser(uid);
      await addBalance(uid, amount);
      await logAdmin('BALANCE_GIVE', uid, `amount:${amount}`, String(targetUser?.balance || 0), String((targetUser?.balance || 0) + amount));
      await logUser(uid, 'BALANCE_GIVEN', `by_admin amount:${amount}`, targetUser?.balance || 0, (targetUser?.balance || 0) + amount);
      bot.telegram.sendMessage(uid, `💰 <b>Hisobingizga ${amount.toLocaleString()} so'm qo'shildi!</b>`, { parse_mode: 'HTML' }).catch(() => {});
      return ctx.reply(`✅ <code>${uid}</code> ga <b>${amount.toLocaleString()} so'm</b> berildi!`, { parse_mode: 'HTML', reply_markup: adminMenu().reply_markup });
    }

    if (st.action === 'task_add_title') {
      setState(ADMIN_ID, { action: 'task_add_reward', title: text });
      return ctx.reply("💰 Vazifa mukofoti (so'm):\n❌ Bekor: /cancel");
    }
    if (st.action === 'task_add_reward') {
      const reward = parseInt(text, 10);
      if (isNaN(reward) || reward <= 0) return ctx.reply('❌ Musbat son kiriting.');
      setState(ADMIN_ID, { action: 'task_add_link', title: st.title, reward });
      return ctx.reply("🔗 Vazifa linki (yo'q bo'lsa '-' yozing):\n❌ Bekor: /cancel");
    }
    if (st.action === 'task_add_link') {
      clearState(ADMIN_ID);
      const link = text.trim() === '-' ? '' : text.trim();
      await addTask({ title: st.title, description: st.title, reward: st.reward, type: 'custom', link, icon: '✅' });
      await logAdmin('TASK_ADD', null, st.title, '', String(st.reward));
      return ctx.reply(`✅ <b>Vazifa qo'shildi!</b>\n📋 ${st.title}\n💰 ${st.reward.toLocaleString()} so'm`, { parse_mode: 'HTML', reply_markup: adminMenu().reply_markup });
    }
  }
  return next();
});

bot.on('message', async ctx => {
  await ctx.reply("❓ Noto'g'ri buyruq.\n\nMenyudan foydalaning 👇",
    { reply_markup: isAdmin(ctx) ? adminMenu().reply_markup : mainMenu(isAdmin(ctx)).reply_markup });
});

// ════════════════════════════════════════════════════════════════
//  EXPRESS SERVER
// ════════════════════════════════════════════════════════════════
const app = express();
app.use(express.json());

app.get('/', (_, res) => res.send('OK'));
app.post('/telegram', (req, res) => bot.handleUpdate(req.body, res));

// ── API: vazifalarni olish ──
app.get('/api/tasks', async (req, res) => {
  const userId = req.query.user_id;
  const tasks = await loadTasks();
  const result = await Promise.all(tasks.map(async t => ({
    ...t,
    done: userId ? await isTaskDone(userId, t.id) : false
  })));
  res.json({ tasks: result });
});

// ── API: vazifani bajarish ──
app.post('/api/task/complete', async (req, res) => {
  const { user_id, task_id } = req.body;
  if (!user_id || !task_id) return res.json({ ok: false, error: 'user_id va task_id kerak' });

  const user = await getUser(user_id);
  if (!user) return res.json({ ok: false, error: "Foydalanuvchi topilmadi. Avval botni ishga tushiring." });

  const tasks = await loadTasks();
  const task = tasks.find(t => t.id === Number(task_id));
  if (!task) return res.json({ ok: false, error: "Vazifa topilmadi" });

  if (await isTaskDone(user_id, task_id)) return res.json({ ok: false, error: "Vazifa allaqachon bajarilgan" });

  await markTaskDone(user_id, task_id);
  await addBalance(user_id, task.reward);
  const newUser = await getUser(user_id);
  await logUser(Number(user_id), 'TASK_DONE', `task:${task_id} ${task.title}`, user.balance, newUser.balance);

  bot.telegram.sendMessage(
    user_id,
    `✅ <b>Vazifa bajarildi!</b>\n\n📋 ${task.title}\n💰 +${task.reward.toLocaleString()} so'm qo'shildi!\n💵 Balans: <b>${newUser.balance.toLocaleString()} so'm</b>`,
    { parse_mode: 'HTML' }
  ).catch(() => {});

  res.json({ ok: true, reward: task.reward, balance: newUser.balance });
});

// ── API: foydalanuvchi ma'lumoti ──
app.get('/api/user', async (req, res) => {
  const userId = req.query.user_id;
  if (!userId) return res.json({ ok: false });
  const user = await getUser(userId);
  if (!user) return res.json({ ok: false, error: "Foydalanuvchi topilmadi" });
  res.json({ ok: true, user: { id: user.id, first_name: user.first_name, balance: user.balance } });
});

// ── VAZIFALAR SAYTI ──
app.get('/vazifalar', (req, res) => {
  const userId = req.query.user_id || '';
  res.send(`<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>📋 Vazifalar</title>
<link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@400;700;900&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#080c14;--surface:#0f1620;--card:#141e2e;--gold:#f0b429;--gold2:#fcd34d;--green:#10b981;--red:#ef4444;--blue:#3b82f6;--text:#e2e8f0;--muted:#64748b;--border:#1e293b}
body{background:var(--bg);color:var(--text);font-family:'Inter',sans-serif;min-height:100vh;padding-bottom:40px}
.header{background:linear-gradient(135deg,#0f1620 0%,#1a2540 100%);border-bottom:1px solid var(--border);padding:20px 16px;position:sticky;top:0;z-index:100;backdrop-filter:blur(12px)}
.header-top{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.logo{font-family:'Unbounded',cursive;font-size:20px;font-weight:900;background:linear-gradient(90deg,var(--gold),var(--gold2));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.user-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between}
.user-name{font-size:14px;color:var(--muted)}
.user-bal{font-size:18px;font-weight:700;color:var(--gold)}
.user-bal span{font-size:12px;color:var(--muted);font-weight:400}
.progress-wrap{padding:0 16px;margin-top:16px}
.progress-info{display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-bottom:6px}
.progress-bar{height:6px;background:var(--border);border-radius:99px;overflow:hidden}
.progress-fill{height:100%;background:linear-gradient(90deg,var(--gold),var(--gold2));border-radius:99px;transition:width .6s ease}
.section-title{padding:20px 16px 8px;font-family:'Unbounded',cursive;font-size:13px;font-weight:700;letter-spacing:.05em;color:var(--muted);text-transform:uppercase}
.task-list{padding:0 16px;display:flex;flex-direction:column;gap:10px}
.task-card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:16px;display:flex;align-items:center;gap:14px;transition:all .2s;position:relative;overflow:hidden}
.task-card:not(.done):hover{border-color:var(--gold);transform:translateY(-1px);box-shadow:0 4px 20px rgba(240,180,41,.1)}
.task-card.done{opacity:.65}
.task-icon{width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#1e293b,#0f172a);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}
.task-card.done .task-icon{background:linear-gradient(135deg,#052e16,#064e3b);border-color:#10b98133}
.task-body{flex:1;min-width:0}
.task-title{font-size:15px;font-weight:600;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.task-desc{font-size:12px;color:var(--muted);margin-bottom:8px}
.task-reward{display:inline-flex;align-items:center;gap:4px;background:#1a1200;border:1px solid #f0b42933;color:var(--gold);font-size:12px;font-weight:600;padding:3px 10px;border-radius:99px}
.task-btn{padding:9px 16px;border-radius:10px;border:none;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;white-space:nowrap;flex-shrink:0;transition:all .2s}
.task-btn.go{background:linear-gradient(135deg,var(--gold),#e6a000);color:#000}
.task-btn.go:hover{transform:scale(1.05);box-shadow:0 4px 12px rgba(240,180,41,.4)}
.task-btn.claim{background:linear-gradient(135deg,var(--green),#059669);color:#fff}
.task-btn.claim:hover{transform:scale(1.05)}
.task-btn.done-btn{background:var(--border);color:var(--muted);cursor:default}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(80px);background:#1e293b;border:1px solid var(--border);color:var(--text);padding:12px 20px;border-radius:12px;font-size:14px;font-weight:500;z-index:999;transition:transform .3s ease;white-space:nowrap;box-shadow:0 8px 32px rgba(0,0,0,.4)}
.toast.show{transform:translateX(-50%) translateY(0)}
.toast.success{border-color:var(--green);background:#052e16}
.toast.error{border-color:var(--red);background:#1f0a0a}
.loading{text-align:center;padding:60px 20px;color:var(--muted)}
.spin{display:inline-block;width:32px;height:32px;border:3px solid var(--border);border-top-color:var(--gold);border-radius:50%;animation:spin .8s linear infinite;margin-bottom:12px}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="header">
  <div class="header-top"><div class="logo">📋 VAZIFALAR</div></div>
  <div class="user-card" id="userCard">
    <div><div class="user-name" id="userName">Yuklanmoqda...</div></div>
    <div class="user-bal" id="userBal">— <span>so'm</span></div>
  </div>
  <div class="progress-wrap">
    <div class="progress-info"><span id="progressText">0 / 0 bajarildi</span><span id="progressPct">0%</span></div>
    <div class="progress-bar"><div class="progress-fill" id="progressFill" style="width:0%"></div></div>
  </div>
</div>
<div class="section-title">Faol vazifalar</div>
<div class="task-list" id="taskList"><div class="loading"><div class="spin"></div><br>Yuklanmoqda...</div></div>
<div class="toast" id="toast"></div>
<script>
const USER_ID='${userId}';
let tasks=[],userBalance=0;
function showToast(msg,type='success'){const t=document.getElementById('toast');t.textContent=msg;t.className='toast '+type+' show';setTimeout(()=>{t.className='toast'},3000)}
async function loadUser(){if(!USER_ID)return null;try{const r=await fetch('/api/user?user_id='+USER_ID);const d=await r.json();if(d.ok){document.getElementById('userName').textContent=d.user.first_name||'Foydalanuvchi';userBalance=d.user.balance;document.getElementById('userBal').innerHTML=userBalance.toLocaleString()+' <span>so\\'m</span>';return d.user;}}catch(e){}return null;}
async function loadTasks(){try{const r=await fetch('/api/tasks?user_id='+USER_ID);const d=await r.json();return d.tasks||[];}catch(e){return[];}}
function updateProgress(tasks){const done=tasks.filter(t=>t.done).length;const total=tasks.length;const pct=total?Math.round(done/total*100):0;document.getElementById('progressText').textContent=done+' / '+total+' bajarildi';document.getElementById('progressPct').textContent=pct+'%';document.getElementById('progressFill').style.width=pct+'%';}
function renderTasks(tasks){const list=document.getElementById('taskList');if(!tasks.length){list.innerHTML='<div class="loading">📭 Hozircha vazifalar yo\\'q</div>';return;}list.innerHTML=tasks.map(t=>\`<div class="task-card \${t.done?'done':''}" id="task-\${t.id}"><div class="task-icon">\${t.icon||'✅'}</div><div class="task-body"><div class="task-title">\${t.title}</div><div class="task-desc">\${t.description||''}</div><div class="task-reward">+\${t.reward.toLocaleString()} so'm</div></div>\${t.done?'<button class="task-btn done-btn">✅ Bajarildi</button>':!USER_ID?'<button class="task-btn done-btn" onclick="noUserAlert()">🔒 Login</button>':t.link?\`<button class="task-btn go" onclick="goTask(\${t.id},'\${t.link}')">O\\'tish</button>\`:\`<button class="task-btn claim" onclick="claimTask(\${t.id})">Olish</button>\`}</div>\`).join('');}
function goTask(taskId,link){window.open(link,'_blank');const card=document.getElementById('task-'+taskId);const btn=card?card.querySelector('button'):null;if(btn){btn.disabled=true;btn.textContent='⏳ 3...';let sec=3;const iv=setInterval(()=>{sec--;if(sec<=0){clearInterval(iv);btn.disabled=false;btn.className='task-btn claim';btn.textContent='✅ Tasdiqlash';btn.onclick=()=>claimTask(taskId);}else{btn.textContent='⏳ '+sec+'...';}},1000);}}
async function claimTask(taskId){const card=document.getElementById('task-'+taskId);const btn=card?card.querySelector('button'):null;if(btn){btn.disabled=true;btn.textContent='⏳...';}try{const r=await fetch('/api/task/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:USER_ID,task_id:taskId})});const d=await r.json();if(d.ok){showToast('✅ +'+d.reward.toLocaleString()+' so\\'m qo\\'shildi!','success');userBalance=d.balance;document.getElementById('userBal').innerHTML=userBalance.toLocaleString()+' <span>so\\'m</span>';if(card){card.classList.add('done');if(btn){btn.className='task-btn done-btn';btn.textContent='✅ Bajarildi';btn.onclick=null;btn.disabled=false;}}tasks=tasks.map(t=>t.id===taskId?{...t,done:true}:t);updateProgress(tasks);}else{showToast('❌ '+(d.error||'Xato'),'error');if(btn){btn.disabled=false;btn.textContent='✅ Tasdiqlash';}}}catch(e){showToast('❌ Tarmoq xatosi','error');if(btn){btn.disabled=false;btn.textContent='Olish';}}}
function noUserAlert(){showToast('❌ Botdan kirish kerak!','error');}
async function init(){tasks=await loadTasks();updateProgress(tasks);renderTasks(tasks);if(USER_ID){const user=await loadUser();if(!user){document.getElementById('userName').textContent='⚠️ Botni ishga tushiring';}}else{document.getElementById('userName').textContent='👤 Mehmon';document.getElementById('userBal').innerHTML='— <span>so\\'m</span>';}}
init();
</script>
</body>
</html>`);
});

app.listen(PORT, async () => {
  console.log(`✅ Server port ${PORT} da ishlamoqda`);
  await loadSettings();
  console.log('✅ Supabase settings yuklandi');
  if (WEBHOOK_URL) {
    try {
      await bot.telegram.setWebhook(`${WEBHOOK_URL}/telegram`);
      console.log('✅ Webhook o\'rnatildi: ' + WEBHOOK_URL + '/telegram');
    } catch (e) {
      console.error('❌ Webhook xato:', e.message);
    }
  } else {
    bot.launch()
      .then(() => console.log('✅ Bot polling rejimida ishlamoqda'))
      .catch(e => { console.error(e); process.exit(1); });
  }
});

process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
process.once('SIGUSR2', () => bot.stop('SIGUSR2'));






