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
//  I18N — 3 ta til: uz / ru / en
//  Valyuta: USD ($)
// ════════════════════════════════════════════════════════════════
const LANGS = ['uz', 'ru', 'en'];

const T = {
  // ── Til tanlash ──
  choose_lang: {
    uz: '🌐 Tilni tanlang:',
    ru: '🌐 Выберите язык:',
    en: '🌐 Choose language:',
  },
  lang_set: {
    uz: '✅ Til: O\'zbek',
    ru: '✅ Язык: Русский',
    en: '✅ Language: English',
  },
  // ── Umumiy ──
  currency: { uz: '$', ru: '$', en: '$' },
  // ── Welcome ──
  welcome: {
    uz: (name, rs, mw) =>
      `👋 <b>Assalomu alaykum, ${name}!</b>\n\n`
      + `🤑 Har referal uchun <b>$${rs}</b>!\n`
      + `🎰 Kazinoda omadingizni sinab ko'ring!\n`
      + `📋 Vazifalar bajaring va bonus oling!\n`
      + `💸 <b>$${mw}</b>dan boshlab yechish\n\nMenyudan tanlang 👇`,
    ru: (name, rs, mw) =>
      `👋 <b>Добро пожаловать, ${name}!</b>\n\n`
      + `🤑 За каждого реферала <b>$${rs}</b>!\n`
      + `🎰 Испытайте удачу в казино!\n`
      + `📋 Выполняйте задания и получайте бонусы!\n`
      + `💸 Вывод от <b>$${mw}</b>\n\nВыберите из меню 👇`,
    en: (name, rs, mw) =>
      `👋 <b>Welcome, ${name}!</b>\n\n`
      + `🤑 <b>$${rs}</b> for every referral!\n`
      + `🎰 Try your luck in the casino!\n`
      + `📋 Complete tasks and earn bonuses!\n`
      + `💸 Withdraw from <b>$${mw}</b>\n\nChoose from menu 👇`,
  },
  // ── Sub required ──
  sub_required_title: {
    uz: "🔒 <b>Botdan foydalanish uchun quyidagi kanallarga a'zo bo'ling:</b>\n\n",
    ru: '🔒 <b>Для использования бота подпишитесь на каналы:</b>\n\n',
    en: '🔒 <b>Subscribe to the following channels to use the bot:</b>\n\n',
  },
  sub_join_btn: {
    uz: ch => `📢 ${ch} ga a'zo bo'lish`,
    ru: ch => `📢 Подписаться на ${ch}`,
    en: ch => `📢 Join ${ch}`,
  },
  sub_check_btn: {
    uz: "✅ A'zo bo'ldim — Tekshirish",
    ru: '✅ Подписался — Проверить',
    en: '✅ Subscribed — Check',
  },
  sub_not_yet: {
    uz: "❌ Hali ham a'zo emassiz!",
    ru: '❌ Вы ещё не подписались!',
    en: '❌ You are still not subscribed!',
  },
  sub_ok: {
    uz: (name, rs, mw) =>
      `✅ <b>Obunadan o'tdingiz!</b>\n\n👋 Xush kelibsiz, <b>${name}</b>!\n\n`
      + `🤑 Har referal uchun <b>$${rs}</b>!\n`
      + `🎰 Kazinoda omadingizni sinab ko'ring!\n`
      + `💸 <b>$${mw}</b>dan boshlab yechish\n\nMenyudan tanlang 👇`,
    ru: (name, rs, mw) =>
      `✅ <b>Подписка подтверждена!</b>\n\n👋 Добро пожаловать, <b>${name}</b>!\n\n`
      + `🤑 За каждого реферала <b>$${rs}</b>!\n`
      + `💸 Вывод от <b>$${mw}</b>\n\nВыберите из меню 👇`,
    en: (name, rs, mw) =>
      `✅ <b>Subscription confirmed!</b>\n\n👋 Welcome, <b>${name}</b>!\n\n`
      + `🤑 <b>$${rs}</b> per referral!\n`
      + `💸 Withdraw from <b>$${mw}</b>\n\nChoose from menu 👇`,
  },
  // ── Menyu tugmalari ──
  menu: {
    casino:    { uz: '🎰 Kazino',         ru: '🎰 Казино',        en: '🎰 Casino' },
    referral:  { uz: '👥 Referal',         ru: '👥 Реферал',       en: '👥 Referral' },
    balance:   { uz: '💰 Balans',          ru: '💰 Баланс',        en: '💰 Balance' },
    withdraw:  { uz: '💸 Pul yechish',     ru: '💸 Вывод средств', en: '💸 Withdraw' },
    tasks:     { uz: '📋 Vazifalar',       ru: '📋 Задания',       en: '📋 Tasks' },
    rules:     { uz: '📜 Qoidalar',        ru: '📜 Правила',       en: '📜 Rules' },
    support:   { uz: '📞 Support',         ru: '📞 Поддержка',     en: '📞 Support' },
    admin:     { uz: '👑 Admin paneli',    ru: '👑 Панель админа', en: '👑 Admin Panel' },
    lang:      { uz: '🌐 Til',             ru: '🌐 Язык',          en: '🌐 Language' },
  },
  // ── Balans ──
  balance_title: {
    uz: '💰 <b>Hisobingiz</b>',
    ru: '💰 <b>Ваш баланс</b>',
    en: '💰 <b>Your Balance</b>',
  },
  bal_balance:   { uz: '💵 Balans:',     ru: '💵 Баланс:',    en: '💵 Balance:' },
  bal_refs:      { uz: '👥 Referallar:', ru: '👥 Рефералы:',  en: '👥 Referrals:' },
  bal_games:     { uz: "🎰 O'yinlar:",   ru: '🎰 Игры:',       en: '🎰 Games:' },
  bal_wins:      { uz: '✅ Yutgan:',     ru: '✅ Выигрыши:',  en: '✅ Wins:' },
  bal_losses:    { uz: '❌ Yutqazgan:',  ru: '❌ Проигрыши:', en: '❌ Losses:' },
  bal_minw:      { uz: '📌 Minimal yechish:', ru: '📌 Мин. вывод:', en: '📌 Min withdraw:' },
  bal_per_ref:   { uz: '💎 Har referal:', ru: '💎 За реферал:', en: '💎 Per referral:' },
  // ── Rules ──
  rules_empty: {
    uz: '📜 Qoidalar hali kiritilmagan.',
    ru: '📜 Правила ещё не заданы.',
    en: '📜 Rules have not been set yet.',
  },
  // ── Support ──
  support_title: {
    uz: '📞 <b>Yordam va qo\'llab-quvvatlash</b>',
    ru: '📞 <b>Помощь и поддержка</b>',
    en: '📞 <b>Help & Support</b>',
  },
  support_body: {
    uz: '❓ Savollaringiz yoki muammolaringiz bo\'lsa,\nadmin bilan bog\'laning.\n\n⏰ Ish vaqti: <b>09:00 — 23:00</b>',
    ru: '❓ Если у вас есть вопросы или проблемы,\nсвяжитесь с администратором.\n\n⏰ Режим работы: <b>09:00 — 23:00</b>',
    en: '❓ If you have any questions or issues,\nplease contact the admin.\n\n⏰ Working hours: <b>09:00 — 23:00</b>',
  },
  support_btn: {
    uz: "👑 Admin bilan bog'lanish",
    ru: '👑 Связаться с администратором',
    en: '👑 Contact Admin',
  },
  // ── Referral ──
  ref_title: {
    uz: '👥 <b>Referal tizimi</b>',
    ru: '👥 <b>Реферальная система</b>',
    en: '👥 <b>Referral System</b>',
  },
  ref_per_friend: { uz: 'Har do\'st uchun:', ru: 'За каждого друга:', en: 'Per friend:' },
  ref_link:       { uz: '🔗 <b>Sizning havolangiz:</b>', ru: '🔗 <b>Ваша ссылка:</b>', en: '🔗 <b>Your link:</b>' },
  ref_invited:    { uz: 'Jalb qilganlar:', ru: 'Приглашено:', en: 'Invited:' },
  ref_balance:    { uz: 'Balans:', ru: 'Баланс:', en: 'Balance:' },
  ref_share_hint: { uz: "📤 Havolani do'stlaringizga ulashing!", ru: '📤 Поделитесь ссылкой с друзьями!', en: '📤 Share your link with friends!' },
  ref_share_btn:  { uz: "📤 Do'stlarga ulashish", ru: '📤 Поделиться с друзьями', en: '📤 Share with friends' },
  ref_bonus_msg: {
    uz: (name, rs) => `🎉 <b>Yangi referal bonus!</b>\n👤 ${name} qo'shildi\n💰 +$${rs}`,
    ru: (name, rs) => `🎉 <b>Реферальный бонус!</b>\n👤 ${name} присоединился\n💰 +$${rs}`,
    en: (name, rs) => `🎉 <b>New referral bonus!</b>\n👤 ${name} joined\n💰 +$${rs}`,
  },
  ref_bonus_sub_msg: {
    uz: (uid, rs) => `🎉 <b>Yangi referal bonus!</b>\n👤 Yangi foydalanuvchi obunadan o'tdi\n💰 +$${rs}`,
    ru: (uid, rs) => `🎉 <b>Реферальный бонус!</b>\n👤 Новый пользователь подтвердил подписку\n💰 +$${rs}`,
    en: (uid, rs) => `🎉 <b>New referral bonus!</b>\n👤 New user completed subscription\n💰 +$${rs}`,
  },
  // ── Tasks ──
  tasks_title: {
    uz: '📋 <b>Vazifalar</b>',
    ru: '📋 <b>Задания</b>',
    en: '📋 <b>Tasks</b>',
  },
  tasks_body: {
    uz: '✅ Vazifalarni bajaring va bonus oling!\n\n🔗 Saytga o\'ting va vazifalarni bajaring:',
    ru: '✅ Выполняйте задания и получайте бонусы!\n\n🔗 Перейдите на сайт и выполните задания:',
    en: '✅ Complete tasks and earn bonuses!\n\n🔗 Go to the website and complete tasks:',
  },
  tasks_btn: {
    uz: '📋 Vazifalarni bajarish',
    ru: '📋 Выполнить задания',
    en: '📋 Complete Tasks',
  },
  // ── Casino ──
  casino_title: { uz: '🎰 <b>Kazino</b>', ru: '🎰 <b>Казино</b>', en: '🎰 <b>Casino</b>' },
  casino_balance: { uz: '💵 Balans:', ru: '💵 Баланс:', en: '💵 Balance:' },
  casino_bet:     { uz: '🎲 Stavka:', ru: '🎲 Ставка:', en: '🎲 Bet:' },
  casino_choose:  { uz: "O'yin turini tanlang:", ru: 'Выберите игру:', en: 'Choose game type:' },
  casino_started: g => ({
    uz: `🎮 <b>${g} boshlandi!</b> Omad! 🍀`,
    ru: `🎮 <b>${g} начата!</b> Удачи! 🍀`,
    en: `🎮 <b>${g} started!</b> Good luck! 🍀`,
  }),
  casino_busy: {
    uz: "⏳ O'yin hali tugamadi!",
    ru: '⏳ Игра ещё не завершена!',
    en: '⏳ Game not finished yet!',
  },
  casino_no_funds: (bet, bal) => ({
    uz: `❌ <b>Mablag' yetarli emas!</b>\n\n🎲 Stavka: <b>$${bet}</b>\n💵 Sizda: <b>$${bal}</b>\n\n👥 Referal orqali to'ldiring!`,
    ru: `❌ <b>Недостаточно средств!</b>\n\n🎲 Ставка: <b>$${bet}</b>\n💵 У вас: <b>$${bal}</b>\n\n👥 Пополните через реферальную систему!`,
    en: `❌ <b>Insufficient funds!</b>\n\n🎲 Bet: <b>$${bet}</b>\n💵 You have: <b>$${bal}</b>\n\n👥 Earn via referrals!`,
  }),
  casino_win: (bet, bal) => ({
    uz: `🎉 <b>YUTDINGIZ!</b> 🎉\n━━━━━━━━━━━━━━━━━━━━\n💰 Yutuq: <b>+$${bet}</b>\n💵 Balans: <b>$${bal}</b>`,
    ru: `🎉 <b>ВЫ ВЫИГРАЛИ!</b> 🎉\n━━━━━━━━━━━━━━━━━━━━\n💰 Выигрыш: <b>+$${bet}</b>\n💵 Баланс: <b>$${bal}</b>`,
    en: `🎉 <b>YOU WIN!</b> 🎉\n━━━━━━━━━━━━━━━━━━━━\n💰 Won: <b>+$${bet}</b>\n💵 Balance: <b>$${bal}</b>`,
  }),
  casino_lose: (bet, bal) => ({
    uz: `😔 <b>Yutqazdingiz...</b>\n━━━━━━━━━━━━━━━━━━━━\n💸 -<b>$${bet}</b>\n💵 Balans: <b>$${bal}</b>\n🍀 Yana urinib ko'ring!`,
    ru: `😔 <b>Вы проиграли...</b>\n━━━━━━━━━━━━━━━━━━━━\n💸 -<b>$${bet}</b>\n💵 Баланс: <b>$${bal}</b>\n🍀 Попробуйте ещё раз!`,
    en: `😔 <b>You lost...</b>\n━━━━━━━━━━━━━━━━━━━━\n💸 -<b>$${bet}</b>\n💵 Balance: <b>$${bal}</b>\n🍀 Try again!`,
  }),
  casino_retry: {
    uz: "🔄 Yana o'ynash",
    ru: '🔄 Играть снова',
    en: '🔄 Play again',
  },
  casino_games: {
    slot:     { uz: '🎰 Slot mashina',  ru: '🎰 Слот-машина',  en: '🎰 Slot Machine' },
    dice:     { uz: "🎲 Zar o'yini",    ru: "🎲 Игра в кости", en: '🎲 Dice Game' },
    basket:   { uz: '🏀 Basketbol',     ru: '🏀 Баскетбол',    en: '🏀 Basketball' },
    football: { uz: '⚽ Futbol',         ru: '⚽ Футбол',        en: '⚽ Football' },
    darts:    { uz: '🎯 Nishon',        ru: '🎯 Дартс',        en: '🎯 Darts' },
    bowling:  { uz: '🎳 Bouling',       ru: '🎳 Боулинг',      en: '🎳 Bowling' },
  },
  // ── Withdraw ──
  withdraw_no_funds: (bal, mw, need) => ({
    uz: `❌ <b>Yetarli mablag' yo'q!</b>\n\n💵 Sizda: <b>$${bal}</b>\n📌 Kerak: <b>$${mw}</b>\n🔺 Yana: <b>$${need}</b>`,
    ru: `❌ <b>Недостаточно средств!</b>\n\n💵 У вас: <b>$${bal}</b>\n📌 Нужно: <b>$${mw}</b>\n🔺 Ещё: <b>$${need}</b>`,
    en: `❌ <b>Insufficient funds!</b>\n\n💵 You have: <b>$${bal}</b>\n📌 Required: <b>$${mw}</b>\n🔺 Need more: <b>$${need}</b>`,
  }),
  withdraw_ok: (amt) => ({
    uz: `✅ <b>So'rovingiz qabul qilindi!</b>\n\n💰 Summa: <b>$${amt}</b>\n⏳ 24 soat ichida ko'rib chiqiladi.`,
    ru: `✅ <b>Запрос принят!</b>\n\n💰 Сумма: <b>$${amt}</b>\n⏳ Будет рассмотрен в течение 24 часов.`,
    en: `✅ <b>Request accepted!</b>\n\n💰 Amount: <b>$${amt}</b>\n⏳ Will be reviewed within 24 hours.`,
  }),
  withdraw_admin_msg: (u, amt) =>
    `💸 <b>Withdrawal Request</b>\n━━━━━━━━━━━━━━━━━━━━\n`
    + `👤 ${u.first_name} ${u.last_name || ''}\n🆔 <code>${u.id}</code>\n`
    + `📛 ${u.username ? '@' + u.username : '—'}\n💰 <b>$${amt}</b>`,
  withdraw_approved: (amt) => ({
    uz: `✅ <b>$${amt} tasdiqlandi!</b>\nTez orada o'tkaziladi.`,
    ru: `✅ <b>$${amt} подтверждено!</b>\nСредства будут переведены в ближайшее время.`,
    en: `✅ <b>$${amt} approved!</b>\nFunds will be transferred soon.`,
  }),
  withdraw_rejected: {
    uz: '❌ <b>Pul yechish rad etildi.</b>\nMablag\' qaytarildi.',
    ru: '❌ <b>Вывод отклонён.</b>\nСредства возвращены.',
    en: '❌ <b>Withdrawal rejected.</b>\nFunds have been returned.',
  },
  withdraw_approve_btn: { uz: '✅ Tasdiqlash', ru: '✅ Подтвердить', en: '✅ Approve' },
  withdraw_reject_btn:  { uz: '❌ Rad etish',  ru: '❌ Отклонить',   en: '❌ Reject' },
  // ── Admin balance given ──
  balance_given: (amt) => ({
    uz: `💰 <b>Hisobingizga $${amt} qo'shildi!</b>`,
    ru: `💰 <b>На ваш счёт зачислено $${amt}!</b>`,
    en: `💰 <b>$${amt} has been added to your balance!</b>`,
  }),
  // ── Tasks site ──
  task_done_msg: (title, reward, bal) => ({
    uz: `✅ <b>Vazifa bajarildi!</b>\n\n📋 ${title}\n💰 +$${reward} qo'shildi!\n💵 Balans: <b>$${bal}</b>`,
    ru: `✅ <b>Задание выполнено!</b>\n\n📋 ${title}\n💰 +$${reward} зачислено!\n💵 Баланс: <b>$${bal}</b>`,
    en: `✅ <b>Task completed!</b>\n\n📋 ${title}\n💰 +$${reward} added!\n💵 Balance: <b>$${bal}</b>`,
  }),
  // ── Unknown command ──
  unknown_cmd: {
    uz: "❓ Noto'g'ri buyruq.\n\nMenyudan foydalaning 👇",
    ru: '❓ Неизвестная команда.\n\nИспользуйте меню 👇',
    en: '❓ Unknown command.\n\nUse the menu 👇',
  },
};

// Helper
function t(key, lang, ...args) {
  const l = lang || 'uz';
  const entry = T[key];
  if (!entry) return key;
  const fn = entry[l] || entry['uz'];
  if (typeof fn === 'function') return fn(...args);
  return fn;
}

function fmt(num) {
  return Number(num).toFixed(2);
}

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
//  USER LANGUAGE
// ════════════════════════════════════════════════════════════════
const langCache = new Map();

async function getUserLang(userId) {
  if (langCache.has(userId)) return langCache.get(userId);
  const { data } = await supabase.from('users').select('lang').eq('id', Number(userId)).single();
  const lang = data?.lang || 'uz';
  langCache.set(userId, lang);
  return lang;
}

async function setUserLang(userId, lang) {
  langCache.set(userId, lang);
  await supabase.from('users').update({ lang }).eq('id', Number(userId));
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
async function addChannel(name) { await supabase.from('channels').upsert({ name }); }
async function delChannel(name) { await supabase.from('channels').delete().eq('name', name); }

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
    const detectedLang = LANGS.includes(from?.language_code) ? from.language_code : 'uz';
    await supabase.from('users').insert({
      id: Number(id),
      username: from?.username || '',
      first_name: from?.first_name || '',
      last_name: from?.last_name || '',
      language_code: from?.language_code || '',
      lang: detectedLang,
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
    langCache.set(Number(id), detectedLang);
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
    balance: Math.round(((user.balance || 0) + delta) * 100) / 100,
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

async function sendSubRequired(ctx, notSub, lang = 'uz') {
  const btns = notSub.map(ch => {
    const slug = ch.startsWith('@') ? ch.slice(1) : ch;
    return [Markup.button.url(t('sub_join_btn', lang, ch), 'https://t.me/' + slug)];
  });
  btns.push([Markup.button.callback(t('sub_check_btn', lang), 'check_sub')]);
  await ctx.reply(
    t('sub_required_title', lang) + notSub.map((c, i) => `${i + 1}. ${c}`).join('\n'),
    { parse_mode: 'HTML', reply_markup: Markup.inlineKeyboard(btns).reply_markup }
  );
}

// ════════════════════════════════════════════════════════════════
//  MENYULAR
// ════════════════════════════════════════════════════════════════
const mainMenu = (lang = 'uz', isAdm = false) => {
  const m = T.menu;
  const rows = [
    [m.casino[lang], m.referral[lang]],
    [m.balance[lang], m.withdraw[lang]],
    [m.tasks[lang], m.rules[lang]],
    [m.support[lang], m.lang[lang]],
  ];
  if (isAdm) rows.push([m.admin[lang]]);
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

// ── Til tanlash ──
bot.action(/^setlang_(uz|ru|en)$/, async ctx => {
  await ctx.answerCbQuery();
  const lang = ctx.match[1];
  const userId = ctx.from.id;
  await ensureUser(userId, null, ctx.from);
  await setUserLang(userId, lang);
  await ctx.deleteMessage().catch(() => {});
  const rs = fmt(Number(await getSetting('referral_sum')));
  const mw = fmt(Number(await getSetting('min_withdraw')));
  await ctx.reply(
    t('lang_set', lang) + '\n\n' + t('welcome', lang, ctx.from.first_name, rs, mw),
    { parse_mode: 'HTML', reply_markup: mainMenu(lang, isAdmin(ctx)).reply_markup }
  );
});

async function sendLangMenu(ctx) {
  await ctx.reply(t('choose_lang', 'uz'), {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback("🇺🇿 O'zbekcha", 'setlang_uz')],
      [Markup.button.callback('🇷🇺 Русский', 'setlang_ru')],
      [Markup.button.callback('🇬🇧 English', 'setlang_en')],
    ]).reply_markup
  });
}

async function checkSubMiddleware(ctx, next) {
  if (!ctx.from) return next();
  if (isAdmin(ctx)) return next();
  if (ctx.callbackQuery) return next();
  if (ctx.message?.text?.startsWith('/start')) return next();
  const { ok, notSub } = await checkUserSub(ctx.telegram, ctx.from.id);
  if (ok) return next();
  const lang = await getUserLang(ctx.from.id);
  await sendSubRequired(ctx, notSub, lang);
}
bot.use(checkSubMiddleware);

// ── check_sub ──
bot.action('check_sub', async ctx => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const lang = await getUserLang(userId);
  const { ok, notSub } = await checkUserSub(ctx.telegram, userId);
  if (ok) {
    await ensureUser(userId, null, ctx.from);
    const pending = await getPending(userId);
    if (pending) {
      const rs = Number(await getSetting('referral_sum'));
      const refUser = await getUser(pending);
      await addBalance(pending, rs);
      await supabase.from('users').update({ ref_count: (refUser?.ref_count || 0) + 1 }).eq('id', pending);
      await delPending(userId);
      await logUser(pending, 'REFERRAL_BONUS', 'new_user:' + userId, refUser?.balance || 0, (refUser?.balance || 0) + rs);
      const refLang = await getUserLang(pending);
      bot.telegram.sendMessage(pending,
        t('ref_bonus_sub_msg', refLang, userId, fmt(rs)),
        { parse_mode: 'HTML' }
      ).catch(() => {});
    }
    await ctx.deleteMessage().catch(() => {});
    const rs = fmt(Number(await getSetting('referral_sum')));
    const mw = fmt(Number(await getSetting('min_withdraw')));
    await ctx.reply(
      t('sub_ok', lang, ctx.from.first_name, rs, mw),
      { parse_mode: 'HTML', reply_markup: mainMenu(lang, isAdmin(ctx)).reply_markup }
    );
  } else {
    const btns = notSub.map(ch => {
      const slug = ch.startsWith('@') ? ch.slice(1) : ch;
      return [Markup.button.url(t('sub_join_btn', lang, ch), 'https://t.me/' + slug)];
    });
    btns.push([Markup.button.callback(t('sub_check_btn', lang), 'check_sub')]);
    await ctx.editMessageReplyMarkup(Markup.inlineKeyboard(btns).reply_markup).catch(async () => {
      await ctx.reply(t('sub_required_title', lang) + notSub.map((c, i) => `${i + 1}. ${c}`).join('\n'),
        { parse_mode: 'HTML', reply_markup: Markup.inlineKeyboard(btns).reply_markup });
    });
    try { await ctx.telegram.answerCbQuery(ctx.callbackQuery.id, t('sub_not_yet', lang), { show_alert: true }); } catch (e) {}
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
  const lang = await getUserLang(userId);

  // Yangi foydalanuvchiga til tanlash
  if (isNew) {
    return sendLangMenu(ctx);
  }

  const { ok, notSub } = await checkUserSub(ctx.telegram, userId);
  if (!ok && !isAdmin(ctx)) return sendSubRequired(ctx, notSub, lang);

  const pending = await getPending(userId);
  if (pending) {
    const rs = Number(await getSetting('referral_sum'));
    const refUser = await getUser(pending);
    await addBalance(pending, rs);
    await supabase.from('users').update({ ref_count: (refUser?.ref_count || 0) + 1 }).eq('id', pending);
    await delPending(userId);
    const refLang = await getUserLang(pending);
    bot.telegram.sendMessage(pending,
      t('ref_bonus_msg', refLang, ctx.from.first_name, fmt(rs)),
      { parse_mode: 'HTML' }
    ).catch(() => {});
  }

  const rs = fmt(Number(await getSetting('referral_sum')));
  const mw = fmt(Number(await getSetting('min_withdraw')));
  await ctx.reply(
    t('welcome', lang, ctx.from.first_name, rs, mw),
    { parse_mode: 'HTML', reply_markup: mainMenu(lang, isAdmin(ctx)).reply_markup }
  );
});

bot.command('admin', async ctx => {
  if (!isAdmin(ctx)) return;
  await ctx.reply('👑 <b>Admin panelga xush kelibsiz!</b>', { parse_mode: 'HTML', reply_markup: adminMenu().reply_markup });
});

// ── 🌐 TIL ──
// Tilni har qanday til menyusidan ushlaymiz
async function handleLangChange(ctx) {
  await ensureUser(ctx.from.id, null, ctx.from);
  await sendLangMenu(ctx);
}
bot.hears([T.menu.lang.uz, T.menu.lang.ru, T.menu.lang.en], handleLangChange);

// ── BALANCE ──
async function handleBalance(ctx) {
  await ensureUser(ctx.from.id, null, ctx.from);
  const lang = await getUserLang(ctx.from.id);
  const u = await getUser(ctx.from.id);
  const rs = fmt(Number(await getSetting('referral_sum')));
  const mw = fmt(Number(await getSetting('min_withdraw')));
  await ctx.reply(
    `${t('balance_title', lang)}\n━━━━━━━━━━━━━━━━━━━━\n`
    + `${t('bal_balance', lang)}        <b>$${fmt(u.balance)}</b>\n`
    + `${t('bal_refs', lang)}    <b>${u.ref_count}</b>\n`
    + `${t('bal_games', lang)}      <b>${u.game_count}</b>\n`
    + `${t('bal_wins', lang)}        <b>${u.wins}</b>\n`
    + `${t('bal_losses', lang)}     <b>${u.losses}</b>\n`
    + `━━━━━━━━━━━━━━━━━━━━\n`
    + `${t('bal_minw', lang)} <b>$${mw}</b>\n`
    + `${t('bal_per_ref', lang)} <b>$${rs}</b>`,
    { parse_mode: 'HTML' }
  );
}
bot.hears([T.menu.balance.uz, T.menu.balance.ru, T.menu.balance.en], handleBalance);

// ── RULES ──
async function handleRules(ctx) {
  const lang = await getUserLang(ctx.from.id);
  const rules = await getSetting('rules_text');
  await ctx.reply(rules || t('rules_empty', lang), { parse_mode: 'HTML' });
}
bot.hears([T.menu.rules.uz, T.menu.rules.ru, T.menu.rules.en], handleRules);

// ── SUPPORT ──
async function handleSupport(ctx) {
  const lang = await getUserLang(ctx.from.id);
  const adminUser = await bot.telegram.getChat(ADMIN_ID).catch(() => null);
  const adminLink = adminUser?.username ? `https://t.me/${adminUser.username}` : `tg://user?id=${ADMIN_ID}`;
  await ctx.reply(
    `${t('support_title', lang)}\n━━━━━━━━━━━━━━━━━━━━\n\n${t('support_body', lang)}`,
    { parse_mode: 'HTML', reply_markup: Markup.inlineKeyboard([[Markup.button.url(t('support_btn', lang), adminLink)]]).reply_markup }
  );
}
bot.hears([T.menu.support.uz, T.menu.support.ru, T.menu.support.en], handleSupport);

// ── REFERRAL ──
async function handleReferral(ctx) {
  await ensureUser(ctx.from.id, null, ctx.from);
  const lang = await getUserLang(ctx.from.id);
  const u = await getUser(ctx.from.id);
  const bi = await ctx.telegram.getMe();
  const link = `https://t.me/${bi.username}?start=${ctx.from.id}`;
  const rs = fmt(Number(await getSetting('referral_sum')));
  const chs = await getChannels();
  const isbotCh = chs.length ? chs[0].name : null;
  const shareTexts = {
    uz: `🎰 Bot orqali pul ishlang! Har referal uchun $${rs}!\n${link}`,
    ru: `🎰 Зарабатывайте через бота! $${rs} за каждого реферала!\n${link}`,
    en: `🎰 Earn money via bot! $${rs} per referral!\n${link}`,
  };
  const btns = [[Markup.button.switchToChat(t('ref_share_btn', lang), shareTexts[lang] || shareTexts.uz)]];
  if (isbotCh) {
    const slug = isbotCh.startsWith('@') ? isbotCh.slice(1) : isbotCh;
    btns.push([Markup.button.url('📢 ' + isbotCh, 'https://t.me/' + slug)]);
  }
  await ctx.reply(
    `${t('ref_title', lang)}\n━━━━━━━━━━━━━━━━━━━━\n`
    + `💰 ${t('ref_per_friend', lang)} <b>$${rs}</b>\n\n`
    + `${t('ref_link', lang)}\n<code>${link}</code>\n\n`
    + `📊 ${t('ref_invited', lang)} <b>${u.ref_count}</b>\n`
    + `💵 ${t('ref_balance', lang)} <b>$${fmt(u.balance)}</b>\n`
    + `━━━━━━━━━━━━━━━━━━━━\n${t('ref_share_hint', lang)}`,
    { parse_mode: 'HTML', reply_markup: Markup.inlineKeyboard(btns).reply_markup }
  );
}
bot.hears([T.menu.referral.uz, T.menu.referral.ru, T.menu.referral.en], handleReferral);

// ── TASKS ──
async function handleTasks(ctx) {
  await ensureUser(ctx.from.id, null, ctx.from);
  const lang = await getUserLang(ctx.from.id);
  const siteBase = WEBHOOK_URL || `http://localhost:${PORT}`;
  const tasksUrl = `${siteBase}/vazifalar?user_id=${ctx.from.id}&lang=${lang}`;
  await ctx.reply(
    `${t('tasks_title', lang)}\n━━━━━━━━━━━━━━━━━━━━\n${t('tasks_body', lang)}`,
    {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([[Markup.button.url(t('tasks_btn', lang), tasksUrl)]]).reply_markup
    }
  );
}
bot.hears([T.menu.tasks.uz, T.menu.tasks.ru, T.menu.tasks.en], handleTasks);

// ════════════════════════════════════════════════════════════════
//  🎰 KAZINO
// ════════════════════════════════════════════════════════════════
const activePlayers = new Set();
const GAME_CONFIG = {
  slot:     { emoji: '🎰', wait: 3500 },
  dice:     { emoji: '🎲', wait: 2000 },
  basket:   { emoji: '🏀', wait: 3000 },
  football: { emoji: '⚽', wait: 3500 },
  darts:    { emoji: '🎯', wait: 3000 },
  bowling:  { emoji: '🎳', wait: 2500 },
};

async function handleCasino(ctx) {
  await ensureUser(ctx.from.id, null, ctx.from);
  const lang = await getUserLang(ctx.from.id);
  const u = await getUser(ctx.from.id);
  const bet = fmt(Number(await getSetting('bet_amount')));
  const games = T.casino_games;
  await ctx.reply(
    `${t('casino_title', lang)}\n━━━━━━━━━━━━━━━━━━━━\n`
    + `${t('casino_balance', lang)} <b>$${fmt(u.balance)}</b>\n`
    + `${t('casino_bet', lang)} <b>$${bet}</b>\n\n${t('casino_choose', lang)}`,
    {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback(games.slot[lang],     'game_slot')],
        [Markup.button.callback(games.dice[lang],     'game_dice')],
        [Markup.button.callback(games.basket[lang],   'game_basket')],
        [Markup.button.callback(games.football[lang], 'game_football')],
        [Markup.button.callback(games.darts[lang],    'game_darts')],
        [Markup.button.callback(games.bowling[lang],  'game_bowling')],
      ]).reply_markup
    }
  );
}
bot.hears([T.menu.casino.uz, T.menu.casino.ru, T.menu.casino.en], handleCasino);

async function playGame(ctx, gameKey) {
  const userId = ctx.from.id;
  const cfg = GAME_CONFIG[gameKey];
  if (!cfg) return;
  const lang = await getUserLang(userId);
  if (activePlayers.has(userId)) return ctx.answerCbQuery(t('casino_busy', lang), { show_alert: true });
  await ctx.answerCbQuery();
  await ensureUser(userId, null, ctx.from);
  const u = await getUser(userId);
  const betRaw = Number(await getSetting('bet_amount'));
  const bet = fmt(betRaw);
  if (u.balance < betRaw) {
    return ctx.reply(
      t('casino_no_funds', lang, bet, fmt(u.balance))[lang] || t('casino_no_funds', lang, bet, fmt(u.balance)).uz,
      { parse_mode: 'HTML' }
    );
  }
  activePlayers.add(userId);
  try {
    const gameLabel = T.casino_games[gameKey][lang];
    await ctx.reply(t('casino_started', lang)(gameLabel)[lang] || t('casino_started', lang)(gameLabel).uz, { parse_mode: 'HTML' });
    await ctx.telegram.sendDice(ctx.chat.id, { emoji: cfg.emoji });
    await new Promise(r => setTimeout(r, cfg.wait));
    const wc = Number(await getSetting('win_chance'));
    const won = Math.random() * 100 < wc;
    await addBalance(userId, won ? betRaw : -betRaw);
    await incGame(userId, won);
    const nu = await getUser(userId);
    activePlayers.delete(userId);
    await logUser(userId, won ? 'GAME_WIN' : 'GAME_LOSE', `game:${gameKey} bet:${betRaw}`, u.balance, nu.balance);
    const retryLabel = t('casino_retry', lang);
    const retryBtn = Markup.inlineKeyboard([[Markup.button.callback(retryLabel, 'game_' + gameKey)]]);
    const msgObj = won
      ? t('casino_win', lang, bet, fmt(nu.balance))
      : t('casino_lose', lang, bet, fmt(nu.balance));
    const msg = typeof msgObj === 'object' ? (msgObj[lang] || msgObj.uz) : msgObj;
    await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: retryBtn.reply_markup });
  } catch (err) {
    activePlayers.delete(userId);
    console.error('Kazino xato:', err);
    ctx.reply('❌ Error.').catch(() => {});
  }
}

bot.action('game_slot',     ctx => playGame(ctx, 'slot'));
bot.action('game_dice',     ctx => playGame(ctx, 'dice'));
bot.action('game_basket',   ctx => playGame(ctx, 'basket'));
bot.action('game_football', ctx => playGame(ctx, 'football'));
bot.action('game_darts',    ctx => playGame(ctx, 'darts'));
bot.action('game_bowling',  ctx => playGame(ctx, 'bowling'));

// ── WITHDRAW ──
async function handleWithdraw(ctx) {
  await ensureUser(ctx.from.id, null, ctx.from);
  const lang = await getUserLang(ctx.from.id);
  const u = await getUser(ctx.from.id);
  const mwRaw = Number(await getSetting('min_withdraw'));
  const mw = fmt(mwRaw);
  if (u.balance < mwRaw) {
    const need = fmt(mwRaw - u.balance);
    const msgObj = t('withdraw_no_funds', lang, fmt(u.balance), mw, need);
    return ctx.reply(
      typeof msgObj === 'object' ? (msgObj[lang] || msgObj.uz) : msgObj,
      { parse_mode: 'HTML' }
    );
  }
  const amount = u.balance;
  await addWithdrawal(ctx.from.id, amount);
  await setBalance(ctx.from.id, 0);
  await logUser(ctx.from.id, 'WITHDRAW_REQUEST', `amount:${amount}`, amount, 0);
  const okObj = t('withdraw_ok', lang, fmt(amount));
  await ctx.reply(
    typeof okObj === 'object' ? (okObj[lang] || okObj.uz) : okObj,
    { parse_mode: 'HTML' }
  );
  await bot.telegram.sendMessage(
    ADMIN_ID,
    t('withdraw_admin_msg', 'uz', ctx.from, fmt(amount)),
    {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([[
        Markup.button.callback('✅ Approve', `aw_${ctx.from.id}_${amount}`),
        Markup.button.callback('❌ Reject',  `rw_${ctx.from.id}_${amount}`)
      ]]).reply_markup
    }
  ).catch(() => {});
}
bot.hears([T.menu.withdraw.uz, T.menu.withdraw.ru, T.menu.withdraw.en], handleWithdraw);

bot.action(/^aw_(\d+)_([0-9.]+)$/, async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('❌ No permission');
  const [, uid, amt] = ctx.match;
  await updateWithdrawal(Number(uid), Number(amt), 'approved');
  await logAdmin('WITHDRAW_APPROVE', Number(uid), `amount:${amt}`, 'pending', 'approved');
  await logUser(Number(uid), 'WITHDRAW_APPROVED', `amount:${amt}`, 0, 0);
  const userLang = await getUserLang(Number(uid));
  const msgObj = t('withdraw_approved', userLang, fmt(Number(amt)));
  bot.telegram.sendMessage(Number(uid),
    typeof msgObj === 'object' ? (msgObj[userLang] || msgObj.uz) : msgObj,
    { parse_mode: 'HTML' }
  ).catch(() => {});
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  await ctx.answerCbQuery('✅ Approved');
  await ctx.reply(`✅ ${uid} → $${fmt(Number(amt))} approved.`);
});

bot.action(/^rw_(\d+)_([0-9.]+)$/, async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('❌ No permission');
  const [, uid, amt] = ctx.match;
  await addBalance(Number(uid), Number(amt));
  await updateWithdrawal(Number(uid), Number(amt), 'rejected');
  await logAdmin('WITHDRAW_REJECT', Number(uid), `amount:${amt} returned`, 'pending', 'rejected');
  await logUser(Number(uid), 'WITHDRAW_REJECTED', `amount:${amt} returned`, 0, Number(amt));
  const userLang = await getUserLang(Number(uid));
  bot.telegram.sendMessage(Number(uid), t('withdraw_rejected', userLang), { parse_mode: 'HTML' }).catch(() => {});
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  await ctx.answerCbQuery('❌ Rejected');
  await ctx.reply(`❌ $${fmt(Number(amt))} returned to ${uid}.`);
});

// ════════════════════════════════════════════════════════════════
//  👑 ADMIN PANEL (O'zbek tili saqlanadi)
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
  const byLang = {};
  userList.forEach(u => { const l = u.lang || 'uz'; byLang[l] = (byLang[l] || 0) + 1; });
  await ctx.reply(
    `📊 <b>BOT STATISTIKASI</b>\n━━━━━━━━━━━━━━━━━━━━\n`
    + `👥 Foydalanuvchilar: <b>${userList.length}</b>\n`
    + `   🇺🇿 UZ: ${byLang.uz||0} | 🇷🇺 RU: ${byLang.ru||0} | 🇬🇧 EN: ${byLang.en||0}\n`
    + `💰 Jami balans:      <b>$${fmt(totalBal)}</b>\n`
    + `🔗 Jami referallar:  <b>${totalRef}</b>\n`
    + `🎰 Jami o'yinlar:    <b>${totalGame}</b>\n`
    + `📋 Vazifalar:        <b>${tasks.length} ta</b>\n`
    + `━━━━━━━━━━━━━━━━━━━━\n`
    + `💸 Yechish so'rovlari: <b>${ws.length}</b>\n`
    + `⏳ Kutilayotgan:      <b>${pendW}</b>\n`
    + `💵 Jami yechilgan:   <b>$${fmt(totalW)}</b>\n`
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
    + (r.balance_before !== r.balance_after ? `💰 $${fmt(r.balance_before)} → $${fmt(r.balance_after)}\n` : '')
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
    text += `${g}: <b>${s.total}</b> | win <b>${wp}%</b>\n`;
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
    `[${new Date(r.created_at).toLocaleString()}]\n${statusIcon[r.status] || '❓'} <code>${r.user_id}</code> | <b>$${fmt(r.amount)}</b>\nStatus: <b>${r.status}</b>`
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
    + `💰 Referal: <b>$${fmt(Number(rs))}</b>\n`
    + `📌 Min yechish: <b>$${fmt(Number(mw))}</b>\n`
    + `🎲 Stavka: <b>$${fmt(Number(bt))}</b>\n`
    + `🍀 Yutuq ehtimoli: <b>${wc}%</b>`,
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
  const labels = { referral_sum: 'referal summa ($)', min_withdraw: 'minimal yechish ($)', bet_amount: 'stavka ($)', win_chance: 'yutuq ehtimoli (1-99%)' };
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
  const list = tasks.map((t2, i) => `${i + 1}. ${t2.icon} ${t2.title} — $${fmt(t2.reward)}`).join('\n');
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
  const btns = tasks.map(t2 => [Markup.button.callback(`🗑 ${t2.title}`, `taskdel_${t2.id}`)]);
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
  await ctx.reply('👤 Asosiy menyu.', { reply_markup: mainMenu('uz', isAdmin(ctx)).reply_markup });
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
      const val = parseFloat(text);
      if (isNaN(val) || val <= 0) return ctx.reply('❌ Musbat son kiriting.');
      if (key === 'win_chance' && (val < 1 || val > 99)) return ctx.reply('❌ 1 dan 99 gacha bo\'lishi kerak.');
      const oldVal = await getSetting(key);
      await setSetting(key, val);
      await logAdmin('SETTING_CHANGE', null, key, oldVal || '', String(val));
      const labels = { referral_sum: 'Referal summasi', min_withdraw: 'Minimal yechish', bet_amount: 'Stavka', win_chance: 'Yutuq ehtimoli' };
      return ctx.reply(
        `✅ <b>${labels[key]}</b>: <b>${key === 'win_chance' ? val + '%' : '$' + fmt(val)}</b>`,
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
        + `🌐 Til: <b>${u.lang || 'uz'}</b>\n`
        + `💰 Balans: <b>$${fmt(u.balance)}</b>\n👥 Referallar: <b>${u.ref_count}</b>\n`
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
      return ctx.reply(`💳 ID: <code>${uid}</code>\nMiqdorni kiriting ($):\n❌ Bekor: /cancel`, { parse_mode: 'HTML' });
    }

    if (st.action === 'givebal_amount') {
      const uid = st.userId; clearState(ADMIN_ID);
      const amount = parseFloat(text);
      if (isNaN(amount)) return ctx.reply("❌ Noto'g'ri miqdor.");
      const targetUser = await getUser(uid);
      await addBalance(uid, amount);
      await logAdmin('BALANCE_GIVE', uid, `amount:${amount}`, String(targetUser?.balance || 0), String((targetUser?.balance || 0) + amount));
      await logUser(uid, 'BALANCE_GIVEN', `by_admin amount:${amount}`, targetUser?.balance || 0, (targetUser?.balance || 0) + amount);
      const userLang = await getUserLang(uid);
      const msgObj = t('balance_given', userLang, fmt(amount));
      bot.telegram.sendMessage(uid,
        typeof msgObj === 'object' ? (msgObj[userLang] || msgObj.uz) : msgObj,
        { parse_mode: 'HTML' }
      ).catch(() => {});
      return ctx.reply(`✅ <code>${uid}</code> ga <b>$${fmt(amount)}</b> berildi!`, { parse_mode: 'HTML', reply_markup: adminMenu().reply_markup });
    }

    if (st.action === 'task_add_title') {
      setState(ADMIN_ID, { action: 'task_add_reward', title: text });
      return ctx.reply("💰 Vazifa mukofoti ($):\n❌ Bekor: /cancel");
    }
    if (st.action === 'task_add_reward') {
      const reward = parseFloat(text);
      if (isNaN(reward) || reward <= 0) return ctx.reply('❌ Musbat son kiriting.');
      setState(ADMIN_ID, { action: 'task_add_link', title: st.title, reward });
      return ctx.reply("🔗 Vazifa linki (yo'q bo'lsa '-' yozing):\n❌ Bekor: /cancel");
    }
    if (st.action === 'task_add_link') {
      clearState(ADMIN_ID);
      const link = text.trim() === '-' ? '' : text.trim();
      await addTask({ title: st.title, description: st.title, reward: st.reward, type: 'custom', link, icon: '✅' });
      await logAdmin('TASK_ADD', null, st.title, '', String(st.reward));
      return ctx.reply(`✅ <b>Vazifa qo'shildi!</b>\n📋 ${st.title}\n💰 $${fmt(st.reward)}`, { parse_mode: 'HTML', reply_markup: adminMenu().reply_markup });
    }
  }
  return next();
});

bot.on('message', async ctx => {
  const lang = await getUserLang(ctx.from.id);
  await ctx.reply(
    t('unknown_cmd', lang),
    { reply_markup: isAdmin(ctx) ? adminMenu().reply_markup : mainMenu(lang, isAdmin(ctx)).reply_markup }
  );
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
  const result = await Promise.all(tasks.map(async t2 => ({
    ...t2,
    done: userId ? await isTaskDone(userId, t2.id) : false
  })));
  res.json({ tasks: result });
});

// ── API: vazifani bajarish ──
app.post('/api/task/complete', async (req, res) => {
  const { user_id, task_id } = req.body;
  if (!user_id || !task_id) return res.json({ ok: false, error: 'user_id and task_id required' });
  const user = await getUser(user_id);
  if (!user) return res.json({ ok: false, error: 'User not found. Start the bot first.' });
  const tasks = await loadTasks();
  const task = tasks.find(t2 => t2.id === Number(task_id));
  if (!task) return res.json({ ok: false, error: 'Task not found' });
  if (await isTaskDone(user_id, task_id)) return res.json({ ok: false, error: 'Task already completed' });
  await markTaskDone(user_id, task_id);
  await addBalance(user_id, task.reward);
  const newUser = await getUser(user_id);
  await logUser(Number(user_id), 'TASK_DONE', `task:${task_id} ${task.title}`, user.balance, newUser.balance);
  const lang = await getUserLang(user_id);
  const msgObj = t('task_done_msg', lang, task.title, fmt(task.reward), fmt(newUser.balance));
  bot.telegram.sendMessage(user_id,
    typeof msgObj === 'object' ? (msgObj[lang] || msgObj.uz) : msgObj,
    { parse_mode: 'HTML' }
  ).catch(() => {});
  res.json({ ok: true, reward: task.reward, balance: newUser.balance });
});

// ── API: foydalanuvchi ──
app.get('/api/user', async (req, res) => {
  const userId = req.query.user_id;
  if (!userId) return res.json({ ok: false });
  const user = await getUser(userId);
  if (!user) return res.json({ ok: false, error: 'User not found' });
  res.json({ ok: true, user: { id: user.id, first_name: user.first_name, balance: user.balance, lang: user.lang || 'uz' } });
});

// ── VAZIFALAR SAYTI (3 tilli) ──
app.get('/vazifalar', (req, res) => {
  const userId = req.query.user_id || '';
  const pageLang = ['uz', 'ru', 'en'].includes(req.query.lang) ? req.query.lang : 'uz';

  const uiText = {
    uz: {
      title: '📋 Vazifalar',
      loading: 'Yuklanmoqda...',
      noTasks: "Hozircha vazifalar yo'q",
      completed: 'Bajarildi',
      totalTasks: (d, t) => `${d} / ${t} bajarildi`,
      goBtnLabel: "O'tish",
      claimBtn: 'Olish',
      confirmBtn: '✅ Tasdiqlash',
      doneBtn: '✅ Bajarildi',
      loginBtn: '🔒 Login',
      loginAlert: '❌ Botdan kirish kerak!',
      currency: '$',
      networkErr: '❌ Tarmoq xatosi',
      activeSection: 'Faol vazifalar',
      wait: sec => `⏳ ${sec}...`,
      added: r => `✅ +$${r} qo'shildi!`,
      errPrefix: '❌ ',
    },
    ru: {
      title: '📋 Задания',
      loading: 'Загрузка...',
      noTasks: 'Заданий пока нет',
      completed: 'Выполнено',
      totalTasks: (d, t) => `${d} / ${t} выполнено`,
      goBtnLabel: 'Перейти',
      claimBtn: 'Получить',
      confirmBtn: '✅ Подтвердить',
      doneBtn: '✅ Выполнено',
      loginBtn: '🔒 Войти',
      loginAlert: '❌ Войдите через бота!',
      currency: '$',
      networkErr: '❌ Ошибка сети',
      activeSection: 'Активные задания',
      wait: sec => `⏳ ${sec}...`,
      added: r => `✅ +$${r} зачислено!`,
      errPrefix: '❌ ',
    },
    en: {
      title: '📋 Tasks',
      loading: 'Loading...',
      noTasks: 'No tasks yet',
      completed: 'Completed',
      totalTasks: (d, t) => `${d} / ${t} completed`,
      goBtnLabel: 'Go',
      claimBtn: 'Claim',
      confirmBtn: '✅ Confirm',
      doneBtn: '✅ Done',
      loginBtn: '🔒 Login',
      loginAlert: '❌ Please start the bot first!',
      currency: '$',
      networkErr: '❌ Network error',
      activeSection: 'Active Tasks',
      wait: sec => `⏳ ${sec}...`,
      added: r => `✅ +$${r} added!`,
      errPrefix: '❌ ',
    },
  };

  const ui = uiText[pageLang];

  res.send(`<!DOCTYPE html>
<html lang="${pageLang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${ui.title}</title>
<link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@400;700;900&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#080c14;--surface:#0f1620;--card:#141e2e;--gold:#f0b429;--gold2:#fcd34d;--green:#10b981;--red:#ef4444;--text:#e2e8f0;--muted:#64748b;--border:#1e293b}
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
  <div class="header-top"><div class="logo">${ui.title}</div></div>
  <div class="user-card" id="userCard">
    <div><div class="user-name" id="userName">${ui.loading}</div></div>
    <div class="user-bal" id="userBal">— <span>USD</span></div>
  </div>
  <div class="progress-wrap">
    <div class="progress-info"><span id="progressText">${ui.totalTasks(0, 0)}</span><span id="progressPct">0%</span></div>
    <div class="progress-bar"><div class="progress-fill" id="progressFill" style="width:0%"></div></div>
  </div>
</div>
<div class="section-title">${ui.activeSection}</div>
<div class="task-list" id="taskList"><div class="loading"><div class="spin"></div><br>${ui.loading}</div></div>
<div class="toast" id="toast"></div>
<script>
const USER_ID='${userId}';
const UI=${JSON.stringify({
  noTasks: ui.noTasks,
  totalTasks: ui.totalTasks.toString(),
  goBtnLabel: ui.goBtnLabel,
  claimBtn: ui.claimBtn,
  confirmBtn: ui.confirmBtn,
  doneBtn: ui.doneBtn,
  loginBtn: ui.loginBtn,
  loginAlert: ui.loginAlert,
  networkErr: ui.networkErr,
  wait: ui.wait.toString(),
  added: ui.added.toString(),
  errPrefix: ui.errPrefix,
})};
function totalTasksStr(d,tot){return (new Function('d','t','return '+UI.totalTasks.replace(/=>\\s*/,'return ').replace(/\\(d, t\\)\\s*/,'')))(d,tot)||d+'/'+tot;}
function waitStr(sec){return (new Function('sec','return '+UI.wait.replace(/=>\\s*/,'return ').replace(/\\(sec\\)\\s*/,'')))(sec)||'⏳';}
function addedStr(r){return (new Function('r','return '+UI.added.replace(/=>\\s*/,'return ').replace(/\\(r\\)\\s*/,'')))(r)||'✅';}
let tasks=[],userBalance=0;
function fmt(n){return Number(n).toFixed(2);}
function showToast(msg,type='success'){const t=document.getElementById('toast');t.textContent=msg;t.className='toast '+type+' show';setTimeout(()=>{t.className='toast'},3000);}
async function loadUser(){if(!USER_ID)return null;try{const r=await fetch('/api/user?user_id='+USER_ID);const d=await r.json();if(d.ok){document.getElementById('userName').textContent=d.user.first_name||'User';userBalance=d.user.balance;document.getElementById('userBal').innerHTML='$'+fmt(userBalance)+' <span>USD</span>';return d.user;}}catch(e){}return null;}
async function loadTasks(){try{const r=await fetch('/api/tasks?user_id='+USER_ID);const d=await r.json();return d.tasks||[];}catch(e){return[];}}
function updateProgress(tasks){const done=tasks.filter(t=>t.done).length;const total=tasks.length;const pct=total?Math.round(done/total*100):0;try{document.getElementById('progressText').textContent=totalTasksStr(done,total);}catch(e){document.getElementById('progressText').textContent=done+'/'+total;}document.getElementById('progressPct').textContent=pct+'%';document.getElementById('progressFill').style.width=pct+'%';}
function renderTasks(tasks){const list=document.getElementById('taskList');if(!tasks.length){list.innerHTML='<div class="loading">📭 '+UI.noTasks+'</div>';return;}list.innerHTML=tasks.map(t=>\`<div class="task-card \${t.done?'done':''}" id="task-\${t.id}"><div class="task-icon">\${t.icon||'✅'}</div><div class="task-body"><div class="task-title">\${t.title}</div><div class="task-desc">\${t.description||''}</div><div class="task-reward">+$\${fmt(t.reward)}</div></div>\${t.done?'<button class="task-btn done-btn">'+UI.doneBtn+'</button>':!USER_ID?'<button class="task-btn done-btn" onclick="noUserAlert()">'+UI.loginBtn+'</button>':t.link?\`<button class="task-btn go" onclick="goTask(\${t.id},'\${t.link}')">'+UI.goBtnLabel+'</button>\`:\`<button class="task-btn claim" onclick="claimTask(\${t.id})">'+UI.claimBtn+'</button>\`}</div>\`).join('');}
function goTask(taskId,link){window.open(link,'_blank');const card=document.getElementById('task-'+taskId);const btn=card?card.querySelector('button'):null;if(btn){btn.disabled=true;btn.textContent=waitStr(3);let sec=3;const iv=setInterval(()=>{sec--;if(sec<=0){clearInterval(iv);btn.disabled=false;btn.className='task-btn claim';btn.textContent=UI.confirmBtn;btn.onclick=()=>claimTask(taskId);}else{btn.textContent=waitStr(sec);}},1000);}}
async function claimTask(taskId){const card=document.getElementById('task-'+taskId);const btn=card?card.querySelector('button'):null;if(btn){btn.disabled=true;btn.textContent='⏳...';}try{const r=await fetch('/api/task/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:USER_ID,task_id:taskId})});const d=await r.json();if(d.ok){try{showToast(addedStr(fmt(d.reward)),'success');}catch(e){showToast('✅ +$'+fmt(d.reward),'success');}userBalance=d.balance;document.getElementById('userBal').innerHTML='$'+fmt(userBalance)+' <span>USD</span>';if(card){card.classList.add('done');if(btn){btn.className='task-btn done-btn';btn.textContent=UI.doneBtn;btn.onclick=null;btn.disabled=false;}}tasks=tasks.map(t=>t.id===taskId?{...t,done:true}:t);updateProgress(tasks);}else{showToast(UI.errPrefix+(d.error||'Error'),'error');if(btn){btn.disabled=false;btn.textContent=UI.confirmBtn;}}}catch(e){showToast(UI.networkErr,'error');if(btn){btn.disabled=false;btn.textContent=UI.claimBtn;}}}
function noUserAlert(){showToast(UI.loginAlert,'error');}
async function init(){tasks=await loadTasks();updateProgress(tasks);renderTasks(tasks);if(USER_ID){const user=await loadUser();if(!user){document.getElementById('userName').textContent='⚠️ Start bot first';}}else{document.getElementById('userName').textContent='👤 Guest';document.getElementById('userBal').innerHTML='— <span>USD</span>';}}
init();
</script>
</body>
</html>`);
});

// ════════════════════════════════════════════════════════════════
//  START
// ════════════════════════════════════════════════════════════════
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





















