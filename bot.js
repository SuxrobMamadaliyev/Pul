'use strict';
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const API_TOKEN   = process.env.API_TOKEN   || '8611357164:AAHkJ0YywP7zvKW4nGY84dRsMSMva_pTOfM';
const ADMIN_ID    = Number(process.env.ADMIN_ID) || 7250754904;
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';
const PORT        = Number(process.env.PORT) || 3000;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// ════════════════════════════════════════════════════════════════
//  SETTINGS
// ════════════════════════════════════════════════════════════════
const SC = {};
async function loadSettings() {
  const { data } = await supabase.from('settings').select('*');
  if (data) data.forEach(r => { SC[r.key] = r.value; });
}
async function getSetting(k) {
  if (SC[k] !== undefined) return SC[k];
  const { data } = await supabase.from('settings').select('value').eq('key', k).single();
  return data?.value ?? null;
}
async function setSetting(k, v) {
  SC[k] = String(v);
  await supabase.from('settings').upsert({ key: k, value: String(v) });
}

// ════════════════════════════════════════════════════════════════
//  CURRENCY
// ════════════════════════════════════════════════════════════════
async function fmtAmt(amount, lang) {
  if (lang === 'uz') return `${Math.round(amount).toLocaleString()} so'm`;
  const rate = Number(await getSetting('usd_rate') || 12800);
  return `$${(amount / rate).toFixed(2)}`;
}
async function parseAmt(text, lang) {
  const raw = parseFloat(text.replace(/[^0-9.]/g, ''));
  if (isNaN(raw) || raw <= 0) return null;
  if (lang === 'uz') return Math.round(raw);
  const rate = Number(await getSetting('usd_rate') || 12800);
  return Math.round(raw * rate);
}

// ════════════════════════════════════════════════════════════════
//  TRANSLATIONS
// ════════════════════════════════════════════════════════════════
const BTNS = {
  casino:   { uz: '🎰 Kazino',       ru: '🎰 Казино',        en: '🎰 Casino'       },
  earn:     { uz: '💰 Pul ishlash',  ru: '💰 Заработать',    en: '💰 Earn Money'   },
  balance:  { uz: '💰 Balans',       ru: '💰 Баланс',        en: '💰 Balance'      },
  withdraw: { uz: '💸 Pul yechish',  ru: '💸 Вывод',         en: '💸 Withdraw'     },
  tasks:    { uz: '📋 Vazifalar',    ru: '📋 Задания',       en: '📋 Tasks'        },
  rules:    { uz: '📜 Qoidalar',     ru: '📜 Правила',       en: '📜 Rules'        },
  support:  { uz: '📞 Support',      ru: '📞 Поддержка',     en: '📞 Support'      },
  admin:    { uz: '👑 Admin paneli', ru: '👑 Админ панель',   en: '👑 Admin Panel'  },
};
const allBtns = key => Object.values(BTNS[key]);

const T = {
  uz: {
    choose_lang:       '🌐 Tilni tanlang:',
    welcome:           (n, rs, mw)    => `👋 <b>Assalomu alaykum, ${n}!</b>\n\n🤑 Har referal uchun <b>${rs}</b>!\n🎰 Kazinoda omadingizni sinab ko'ring!\n📋 Vazifalar bajaring va bonus oling!\n💸 <b>${mw}</b>dan boshlab yechish\n\nMenyudan tanlang 👇`,
    sub_required:      (chs)          => `🔒 <b>Botdan foydalanish uchun quyidagi kanallarga a'zo bo'ling:</b>\n\n${chs.map((c,i)=>`${i+1}. ${c}`).join('\n')}`,
    check_sub_btn:     "✅ A'zo bo'ldim — Tekshirish",
    not_subscribed:    "❌ Hali ham a'zo emassiz!",
    sub_ok:            (n, rs, mw)    => `✅ <b>Obunadan o'tdingiz!</b>\n\n👋 Xush kelibsiz, <b>${n}</b>!\n🤑 Har referal uchun <b>${rs}</b>!\n💸 <b>${mw}</b>dan boshlab yechish\n\nMenyudan tanlang 👇`,
    balance_msg:       (u, rs, mw)    => `💰 <b>Hisobingiz</b>\n━━━━━━━━━━━━━━━━━━━━\n💵 Balans: <b>${u.bal}</b>\n👥 Referallar: <b>${u.ref_count} ta</b>\n🎰 O'yinlar: <b>${u.game_count} ta</b>\n✅ Yutgan: <b>${u.wins} ta</b>\n❌ Yutqazgan: <b>${u.losses} ta</b>\n━━━━━━━━━━━━━━━━━━━━\n📌 Minimal yechish: <b>${mw}</b>\n💎 Har referal: <b>${rs}</b>`,
    rules_none:        '📜 Qoidalar hali kiritilmagan.',
    support_title:     "📞 <b>Yordam</b>\n━━━━━━━━━━━━━━━━━━━━\n\n❓ Savol yoki muammo bo'lsa admin bilan bog'laning.\n\n⏰ Ish vaqti: <b>09:00 — 23:00</b>",
    support_btn:       "👑 Admin bilan bog'lanish",
    earn_title:        (u, rs, link)  => `👥 <b>Referal tizimi</b>\n━━━━━━━━━━━━━━━━━━━━\n💰 Har do'st uchun: <b>${rs}</b>\n\n🔗 <b>Sizning havolangiz:</b>\n<code>${link}</code>\n\n📊 Jalb qilganlar: <b>${u.ref_count} ta</b>\n💵 Balans: <b>${u.bal}</b>\n━━━━━━━━━━━━━━━━━━━━\n📤 Havolani do'stlaringizga ulashing!`,
    share_text:        (rs, link)     => `🎰 Bot orqali pul ishlang! Har referal uchun ${rs}!\n${link}`,
    share_btn:         "📤 Do'stlarga ulashish",
    withdraw_ask:      (bal, min)     => `💸 <b>Pul yechish</b>\n\n💵 Balansingiz: <b>${bal}</b>\n📌 Minimal: <b>${min}</b>\n\n✏️ Qancha yechmoqchisiz? (so'mda kiriting)`,
    withdraw_low:      (min)          => `❌ Minimal yechish summasi: <b>${min}</b>`,
    withdraw_no_bal:   (bal)          => `❌ <b>Yetarli balans yo'q!</b>\nSizda: <b>${bal}</b>`,
    withdraw_ask_card: '💳 Karta raqamingizni kiriting:',
    withdraw_done:     (amt, card)    => `✅ <b>So'rovingiz qabul qilindi!</b>\n\n💰 Summa: <b>${amt}</b>\n💳 Karta: <code>${card}</code>\n⏳ 24 soat ichida ko'rib chiqiladi.`,
    withdraw_approved: (amt)          => `✅ <b>${amt} tasdiqlandi!</b>\nTez orada o'tkaziladi.`,
    withdraw_rejected: "❌ <b>Pul yechish rad etildi.</b>\nMablag' qaytarildi.",
    invalid_amt:       "❌ Noto'g'ri summa. Raqam kiriting.",
    casino_title:      (bal, bet)     => `🎰 <b>Kazino</b>\n━━━━━━━━━━━━━━━━━━━━\n💵 Balans: <b>${bal}</b>\n🎲 Stavka: <b>${bet}</b>\n\nO'yin turini tanlang:`,
    casino_start:      (lbl)          => `🎮 <b>${lbl} boshlandi!</b> Omad! 🍀`,
    casino_win:        (bet, bal)     => `🎉 <b>YUTDINGIZ!</b> 🎉\n━━━━━━━━━━━━━━━━━━━━\n💰 Yutuq: <b>+${bet}</b>\n💵 Balans: <b>${bal}</b>`,
    casino_lose:       (bet, bal)     => `😔 <b>Yutqazdingiz...</b>\n━━━━━━━━━━━━━━━━━━━━\n💸 -<b>${bet}</b>\n💵 Balans: <b>${bal}</b>\n🍀 Yana urinib ko'ring!`,
    casino_no_bal:     (bet, bal)     => `❌ <b>Mablag' yetarli emas!</b>\n\n🎲 Stavka: <b>${bet}</b>\n💵 Sizda: <b>${bal}</b>\n\n👥 Referal orqali to'ldiring!`,
    casino_busy:       "⏳ O'yin hali tugamadi!",
    play_again:        "🔄 Yana o'ynash",
    tasks_btn:         '📋 Vazifalarni bajarish',
    ref_bonus:         (n, rs)        => `🎉 <b>Yangi referal bonus!</b>\n👤 ${n} qo'shildi\n💰 +${rs}`,
    ref_bonus_sub:     (rs)           => `🎉 <b>Yangi referal bonus!</b>\n👤 Yangi foydalanuvchi obunadan o'tdi\n💰 +${rs}`,
    unknown_cmd:       "❓ Noto'g'ri buyruq.\n\nMenyudan foydalaning 👇",
    cancel_ok:         '❌ Bekor qilindi.',
    admin_title:       '👑 <b>Admin panel</b>',
    admin_welcome:     '👑 <b>Admin panelga xush kelibsiz!</b>',
  },
  ru: {
    choose_lang:       '🌐 Выберите язык:',
    welcome:           (n, rs, mw)    => `👋 <b>Привет, ${n}!</b>\n\n🤑 За каждого реферала <b>${rs}</b>!\n🎰 Испытайте удачу в казино!\n📋 Выполняйте задания и получайте бонусы!\n💸 Вывод от <b>${mw}</b>\n\nВыберите из меню 👇`,
    sub_required:      (chs)          => `🔒 <b>Для использования бота подпишитесь на каналы:</b>\n\n${chs.map((c,i)=>`${i+1}. ${c}`).join('\n')}`,
    check_sub_btn:     '✅ Подписался — Проверить',
    not_subscribed:    '❌ Вы ещё не подписались!',
    sub_ok:            (n, rs, mw)    => `✅ <b>Подписка подтверждена!</b>\n\n👋 Добро пожаловать, <b>${n}</b>!\n🤑 За каждого реферала <b>${rs}</b>!\n💸 Вывод от <b>${mw}</b>\n\nВыберите из меню 👇`,
    balance_msg:       (u, rs, mw)    => `💰 <b>Ваш баланс</b>\n━━━━━━━━━━━━━━━━━━━━\n💵 Баланс: <b>${u.bal}</b>\n👥 Рефералы: <b>${u.ref_count}</b>\n🎰 Игры: <b>${u.game_count}</b>\n✅ Выиграл: <b>${u.wins}</b>\n❌ Проиграл: <b>${u.losses}</b>\n━━━━━━━━━━━━━━━━━━━━\n📌 Мин. вывод: <b>${mw}</b>\n💎 За реферала: <b>${rs}</b>`,
    rules_none:        '📜 Правила ещё не добавлены.',
    support_title:     '📞 <b>Поддержка</b>\n━━━━━━━━━━━━━━━━━━━━\n\n❓ Если есть вопросы, свяжитесь с администратором.\n\n⏰ Время работы: <b>09:00 — 23:00</b>',
    support_btn:       '👑 Написать администратору',
    earn_title:        (u, rs, link)  => `👥 <b>Реферальная система</b>\n━━━━━━━━━━━━━━━━━━━━\n💰 За каждого друга: <b>${rs}</b>\n\n🔗 <b>Ваша ссылка:</b>\n<code>${link}</code>\n\n📊 Приглашено: <b>${u.ref_count}</b>\n💵 Баланс: <b>${u.bal}</b>\n━━━━━━━━━━━━━━━━━━━━\n📤 Поделитесь ссылкой с друзьями!`,
    share_text:        (rs, link)     => `🎰 Зарабатывай в боте! За реферала ${rs}!\n${link}`,
    share_btn:         '📤 Поделиться с друзьями',
    withdraw_ask:      (bal, min)     => `💸 <b>Вывод средств</b>\n\n💵 Ваш баланс: <b>${bal}</b>\n📌 Минимум: <b>${min}</b>\n\n✏️ Сколько вывести? (введите сумму в $)`,
    withdraw_low:      (min)          => `❌ Минимальная сумма вывода: <b>${min}</b>`,
    withdraw_no_bal:   (bal)          => `❌ <b>Недостаточно средств!</b>\nУ вас: <b>${bal}</b>`,
    withdraw_ask_card: '💳 Введите номер карты:',
    withdraw_done:     (amt, card)    => `✅ <b>Запрос принят!</b>\n\n💰 Сумма: <b>${amt}</b>\n💳 Карта: <code>${card}</code>\n⏳ Рассмотрим в течение 24 часов.`,
    withdraw_approved: (amt)          => `✅ <b>${amt} подтверждено!</b>\nСкоро переведём.`,
    withdraw_rejected: '❌ <b>Вывод отклонён.</b>\nСредства возвращены.',
    invalid_amt:       '❌ Неверная сумма. Введите число.',
    casino_title:      (bal, bet)     => `🎰 <b>Казино</b>\n━━━━━━━━━━━━━━━━━━━━\n💵 Баланс: <b>${bal}</b>\n🎲 Ставка: <b>${bet}</b>\n\nВыберите игру:`,
    casino_start:      (lbl)          => `🎮 <b>${lbl} начался!</b> Удачи! 🍀`,
    casino_win:        (bet, bal)     => `🎉 <b>ВЫИГРАЛИ!</b> 🎉\n━━━━━━━━━━━━━━━━━━━━\n💰 Выигрыш: <b>+${bet}</b>\n💵 Баланс: <b>${bal}</b>`,
    casino_lose:       (bet, bal)     => `😔 <b>Проиграли...</b>\n━━━━━━━━━━━━━━━━━━━━\n💸 -<b>${bet}</b>\n💵 Баланс: <b>${bal}</b>\n🍀 Попробуйте ещё раз!`,
    casino_no_bal:     (bet, bal)     => `❌ <b>Недостаточно средств!</b>\n\n🎲 Ставка: <b>${bet}</b>\n💵 У вас: <b>${bal}</b>\n\n👥 Пополните через рефералов!`,
    casino_busy:       '⏳ Игра ещё не закончилась!',
    play_again:        '🔄 Играть снова',
    tasks_btn:         '📋 Выполнить задания',
    ref_bonus:         (n, rs)        => `🎉 <b>Новый реферальный бонус!</b>\n👤 ${n} присоединился\n💰 +${rs}`,
    ref_bonus_sub:     (rs)           => `🎉 <b>Новый реферальный бонус!</b>\n👤 Новый пользователь подписался\n💰 +${rs}`,
    unknown_cmd:       '❓ Неверная команда.\n\nИспользуйте меню 👇',
    cancel_ok:         '❌ Отменено.',
    admin_title:       '👑 <b>Панель администратора</b>',
    admin_welcome:     '👑 <b>Добро пожаловать в панель администратора!</b>',
  },
  en: {
    choose_lang:       '🌐 Choose your language:',
    welcome:           (n, rs, mw)    => `👋 <b>Hello, ${n}!</b>\n\n🤑 Earn <b>${rs}</b> for every referral!\n🎰 Try your luck in the casino!\n📋 Complete tasks and earn bonuses!\n💸 Withdraw from <b>${mw}</b>\n\nChoose from the menu 👇`,
    sub_required:      (chs)          => `🔒 <b>To use the bot, please subscribe to the channels:</b>\n\n${chs.map((c,i)=>`${i+1}. ${c}`).join('\n')}`,
    check_sub_btn:     '✅ Subscribed — Check',
    not_subscribed:    '❌ You are still not subscribed!',
    sub_ok:            (n, rs, mw)    => `✅ <b>Subscription confirmed!</b>\n\n👋 Welcome, <b>${n}</b>!\n🤑 Earn <b>${rs}</b> per referral!\n💸 Withdraw from <b>${mw}</b>\n\nChoose from the menu 👇`,
    balance_msg:       (u, rs, mw)    => `💰 <b>Your Balance</b>\n━━━━━━━━━━━━━━━━━━━━\n💵 Balance: <b>${u.bal}</b>\n👥 Referrals: <b>${u.ref_count}</b>\n🎰 Games: <b>${u.game_count}</b>\n✅ Won: <b>${u.wins}</b>\n❌ Lost: <b>${u.losses}</b>\n━━━━━━━━━━━━━━━━━━━━\n📌 Min. withdrawal: <b>${mw}</b>\n💎 Per referral: <b>${rs}</b>`,
    rules_none:        '📜 Rules have not been added yet.',
    support_title:     '📞 <b>Support</b>\n━━━━━━━━━━━━━━━━━━━━\n\n❓ If you have questions, contact the administrator.\n\n⏰ Working hours: <b>09:00 — 23:00</b>',
    support_btn:       '👑 Contact Administrator',
    earn_title:        (u, rs, link)  => `👥 <b>Referral System</b>\n━━━━━━━━━━━━━━━━━━━━\n💰 Per friend: <b>${rs}</b>\n\n🔗 <b>Your link:</b>\n<code>${link}</code>\n\n📊 Invited: <b>${u.ref_count}</b>\n💵 Balance: <b>${u.bal}</b>\n━━━━━━━━━━━━━━━━━━━━\n📤 Share your link with friends!`,
    share_text:        (rs, link)     => `🎰 Earn in the bot! ${rs} per referral!\n${link}`,
    share_btn:         '📤 Share with friends',
    withdraw_ask:      (bal, min)     => `💸 <b>Withdraw</b>\n\n💵 Your balance: <b>${bal}</b>\n📌 Minimum: <b>${min}</b>\n\n✏️ How much to withdraw? (enter amount in $)`,
    withdraw_low:      (min)          => `❌ Minimum withdrawal amount: <b>${min}</b>`,
    withdraw_no_bal:   (bal)          => `❌ <b>Insufficient balance!</b>\nYou have: <b>${bal}</b>`,
    withdraw_ask_card: '💳 Enter your card number:',
    withdraw_done:     (amt, card)    => `✅ <b>Request accepted!</b>\n\n💰 Amount: <b>${amt}</b>\n💳 Card: <code>${card}</code>\n⏳ Will be processed within 24 hours.`,
    withdraw_approved: (amt)          => `✅ <b>${amt} approved!</b>\nWill be transferred soon.`,
    withdraw_rejected: '❌ <b>Withdrawal rejected.</b>\nFunds have been returned.',
    invalid_amt:       '❌ Invalid amount. Enter a number.',
    casino_title:      (bal, bet)     => `🎰 <b>Casino</b>\n━━━━━━━━━━━━━━━━━━━━\n💵 Balance: <b>${bal}</b>\n🎲 Bet: <b>${bet}</b>\n\nChoose a game:`,
    casino_start:      (lbl)          => `🎮 <b>${lbl} started!</b> Good luck! 🍀`,
    casino_win:        (bet, bal)     => `🎉 <b>YOU WON!</b> 🎉\n━━━━━━━━━━━━━━━━━━━━\n💰 Winnings: <b>+${bet}</b>\n💵 Balance: <b>${bal}</b>`,
    casino_lose:       (bet, bal)     => `😔 <b>You lost...</b>\n━━━━━━━━━━━━━━━━━━━━\n💸 -<b>${bet}</b>\n💵 Balance: <b>${bal}</b>\n🍀 Try again!`,
    casino_no_bal:     (bet, bal)     => `❌ <b>Insufficient funds!</b>\n\n🎲 Bet: <b>${bet}</b>\n💵 You have: <b>${bal}</b>\n\n👥 Top up via referrals!`,
    casino_busy:       '⏳ Game has not finished yet!',
    play_again:        '🔄 Play again',
    tasks_btn:         '📋 Complete tasks',
    ref_bonus:         (n, rs)        => `🎉 <b>New referral bonus!</b>\n👤 ${n} joined\n💰 +${rs}`,
    ref_bonus_sub:     (rs)           => `🎉 <b>New referral bonus!</b>\n👤 New user subscribed\n💰 +${rs}`,
    unknown_cmd:       '❓ Unknown command.\n\nUse the menu 👇',
    cancel_ok:         '❌ Cancelled.',
    admin_title:       '👑 <b>Admin Panel</b>',
    admin_welcome:     '👑 <b>Welcome to the Admin Panel!</b>',
  }
};

function tr(lang, key, ...args) {
  const l = T[lang] || T.uz;
  const val = l[key] !== undefined ? l[key] : (T.uz[key] || key);
  return typeof val === 'function' ? val(...args) : val;
}

// ════════════════════════════════════════════════════════════════
//  MENUS
// ════════════════════════════════════════════════════════════════
function mainMenu(lang, isAdm = false) {
  const b = k => BTNS[k][lang] || BTNS[k].uz;
  const rows = [
    [b('casino'),   b('earn')],
    [b('balance'),  b('withdraw')],
    [b('tasks'),    b('rules')],
    [b('support')],
  ];
  if (isAdm) rows.push([b('admin')]);
  return Markup.keyboard(rows).resize();
}

const adminMenu = () => Markup.keyboard([
  ['📊 Statistika',        '📢 Xabar yuborish'],
  ['📋 Kanallar',          '⚙️ Sozlamalar'],
  ['👤 Foydalanuvchi',    '💳 Balans berish'],
  ['📜 Loglar',            '📝 Qoidalarni tahrirlash'],
  ['🗂 Vazifalar boshqaruv', '🚪 Chiqish']
]).resize();

function langSelectKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🇺🇿 O'zbekcha", 'lang_uz')],
    [Markup.button.callback('🇷🇺 Русский',    'lang_ru')],
    [Markup.button.callback('🇬🇧 English',    'lang_en')],
  ]);
}

// ════════════════════════════════════════════════════════════════
//  DB HELPERS
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
      id: Number(id), username: from?.username||'', first_name: from?.first_name||'',
      last_name: from?.last_name||'', language_code: from?.language_code||'',
      is_bot: from?.is_bot||false, join_date: now, balance: 0,
      ref_count: 0, game_count: 0, wins: 0, losses: 0,
      last_updated: now, last_seen: now, language: 'uz',
    });
    return true;
  }
  const upd = { last_seen: now };
  if (from) ['username','first_name','last_name','language_code'].forEach(f => {
    if (from[f] !== undefined && existing[f] !== from[f]) upd[f] = from[f];
  });
  await supabase.from('users').update(upd).eq('id', Number(id));
  return false;
}
async function addBalance(id, delta) {
  const u = await getUser(id); if (!u) return;
  await supabase.from('users').update({ balance: (u.balance||0)+delta, last_updated: new Date().toISOString() }).eq('id', Number(id));
}
async function setBalance(id, val) {
  await supabase.from('users').update({ balance: val, last_updated: new Date().toISOString() }).eq('id', Number(id));
}
async function incGame(id, win) {
  const u = await getUser(id); if (!u) return;
  await supabase.from('users').update({
    game_count: (u.game_count||0)+1,
    wins:   win ? (u.wins||0)+1   : (u.wins||0),
    losses: win ? (u.losses||0)   : (u.losses||0)+1,
  }).eq('id', Number(id));
}
async function loadAllUsers() {
  const { data } = await supabase.from('users').select('*'); return data||[];
}

// Channels
async function getChannels() {
  const { data } = await supabase.from('channels').select('name'); return (data||[]).map(r=>({name:r.name}));
}
async function addChannel(name) { await supabase.from('channels').upsert({ name }); }
async function delChannel(name) { await supabase.from('channels').delete().eq('name',name); }

// Tasks
async function loadTasks() {
  const { data } = await supabase.from('tasks').select('*').order('id'); return data||[];
}
async function isTaskDone(userId, taskId) {
  const { data } = await supabase.from('task_done').select('task_id').eq('user_id',userId).eq('task_id',taskId).single();
  return !!data;
}
async function markTaskDone(userId, taskId) {
  await supabase.from('task_done').upsert({ user_id: Number(userId), task_id: Number(taskId) });
}

// Pending referrals
async function getPending(newUserId) {
  const { data } = await supabase.from('pending_referrals').select('ref_id').eq('new_user_id',Number(newUserId)).single();
  return data?.ref_id||null;
}
async function setPending(newUserId, refId) {
  await supabase.from('pending_referrals').upsert({ new_user_id: Number(newUserId), ref_id: Number(refId) });
}
async function delPending(newUserId) {
  await supabase.from('pending_referrals').delete().eq('new_user_id',Number(newUserId));
}

// Withdrawals
async function addWithdrawal(userId, amount, cardNumber='') {
  await supabase.from('withdrawals').insert({ user_id: Number(userId), amount, status:'pending', card_number: cardNumber, created_at: new Date().toISOString() });
}
async function updateWithdrawal(userId, amount, status) {
  const { data } = await supabase.from('withdrawals').select('id').eq('user_id',Number(userId)).eq('amount',amount).eq('status','pending').order('created_at',{ascending:false}).limit(1).single();
  if (data) await supabase.from('withdrawals').update({ status }).eq('id',data.id);
}
async function loadWithdrawals() {
  const { data } = await supabase.from('withdrawals').select('*').order('created_at',{ascending:false}); return data||[];
}

// Logs
async function logUser(userId, action, detail='', balBefore=0, balAfter=0) {
  await supabase.from('logs').insert({ type:'user', user_id: Number(userId), action, detail, balance_before: balBefore, balance_after: balAfter, created_at: new Date().toISOString() });
}
async function logAdmin(action, targetId=null, detail='', oldVal='', newVal='') {
  await supabase.from('logs').insert({ type:'admin', action, target_id: targetId?Number(targetId):null, detail, old_value: String(oldVal), new_value: String(newVal), created_at: new Date().toISOString() });
}
async function logChannel(action, name) {
  await supabase.from('logs').insert({ type:'channel', action, channel_name: name, created_at: new Date().toISOString() });
}

async function ensureUser(id, refId=null, from=null) {
  const isNew = await ensureUserRecord(id, from);
  if (isNew) {
    await logUser(id, 'REGISTER', refId?'ref:'+refId:'direct', 0, 0);
    if (refId) {
      const ref = parseInt(refId,10);
      if (!isNaN(ref) && ref !== id) { const ru = await getUser(ref); if (ru) await setPending(id,ref); }
    }
  }
  return isNew;
}

// ════════════════════════════════════════════════════════════════
//  SUBSCRIPTION CHECK
// ════════════════════════════════════════════════════════════════
async function checkUserSub(telegram, userId) {
  if ((await getSetting('sub_required')) !== '1') return { ok:true, notSub:[] };
  const chs = await getChannels();
  if (!chs.length) return { ok:true, notSub:[] };
  const notSub = [];
  for (const ch of chs) {
    try { const m = await telegram.getChatMember(ch.name,userId); if (['left','kicked'].includes(m.status)) notSub.push(ch.name); }
    catch(e) { console.warn('Kanal xato:',ch.name,e.message); }
  }
  return { ok: notSub.length===0, notSub };
}

async function sendSubRequired(ctx, notSub, lang='uz') {
  const btns = notSub.map(ch => {
    const slug = ch.startsWith('@') ? ch.slice(1) : ch;
    return [Markup.button.url('📢 '+ch, 'https://t.me/'+slug)];
  });
  btns.push([Markup.button.callback(tr(lang,'check_sub_btn'), 'check_sub')]);
  await ctx.reply(tr(lang,'sub_required',notSub), { parse_mode:'HTML', reply_markup: Markup.inlineKeyboard(btns).reply_markup });
}

// ════════════════════════════════════════════════════════════════
//  REFERRAL BONUS HELPER
// ════════════════════════════════════════════════════════════════
async function processReferral(newUserId, firstName, isSubEvent=false) {
  const pending = await getPending(newUserId);
  if (!pending) return;
  const rs = Number(await getSetting('referral_sum'));
  const refUser = await getUser(pending);
  if (!refUser) return;
  await addBalance(pending, rs);
  await supabase.from('users').update({ ref_count: (refUser.ref_count||0)+1 }).eq('id',pending);
  await delPending(newUserId);
  await logUser(pending, 'REFERRAL_BONUS', 'new_user:'+newUserId, refUser.balance, refUser.balance+rs);
  const lang = refUser.language || 'uz';
  const rsStr = await fmtAmt(rs, lang);
  const msg = isSubEvent ? tr(lang,'ref_bonus_sub',rsStr) : tr(lang,'ref_bonus',firstName,rsStr);
  bot.telegram.sendMessage(pending, msg, { parse_mode:'HTML' }).catch(()=>{});
}

// ════════════════════════════════════════════════════════════════
//  BOT
// ════════════════════════════════════════════════════════════════
const bot = new Telegraf(API_TOKEN);
const isAdmin = ctx => ctx.from?.id === ADMIN_ID;
const states  = new Map();
const getState   = id => states.get(String(id)) || {};
const setState   = (id, s) => states.set(String(id), s);
const clearState = id => states.delete(String(id));

// ── MIDDLEWARE ──
async function checkSubMiddleware(ctx, next) {
  if (!ctx.from) return next();
  if (isAdmin(ctx)) return next();
  if (ctx.callbackQuery) return next();
  if (ctx.message?.text?.startsWith('/start')) return next();
  const { ok, notSub } = await checkUserSub(ctx.telegram, ctx.from.id);
  if (ok) return next();
  const u = await getUser(ctx.from.id);
  await sendSubRequired(ctx, notSub, u?.language||'uz');
}
bot.use(checkSubMiddleware);

// ── LANGUAGE SELECTION ──
bot.action(/^lang_(uz|ru|en)$/, async ctx => {
  await ctx.answerCbQuery();
  const lang = ctx.match[1];
  const userId = ctx.from.id;
  await supabase.from('users').update({ language: lang }).eq('id', userId);
  await ctx.deleteMessage().catch(()=>{});

  const { ok, notSub } = await checkUserSub(ctx.telegram, userId);
  if (!ok) return sendSubRequired(ctx, notSub, lang);

  await processReferral(userId, ctx.from.first_name, false);
  const u = await getUser(userId);
  const rs = await fmtAmt(Number(await getSetting('referral_sum')), lang);
  const mw = await fmtAmt(Number(await getSetting('min_withdraw')), lang);
  await ctx.reply(tr(lang,'welcome',ctx.from.first_name,rs,mw), { parse_mode:'HTML', reply_markup: mainMenu(lang, isAdmin(ctx)).reply_markup });
});

// ── check_sub ──
bot.action('check_sub', async ctx => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const u = await getUser(userId);
  const lang = u?.language || 'uz';
  const { ok, notSub } = await checkUserSub(ctx.telegram, userId);
  if (ok) {
    await processReferral(userId, ctx.from.first_name, true);
    await ctx.deleteMessage().catch(()=>{});
    const rs = await fmtAmt(Number(await getSetting('referral_sum')), lang);
    const mw = await fmtAmt(Number(await getSetting('min_withdraw')), lang);
    await ctx.reply(tr(lang,'sub_ok',ctx.from.first_name,rs,mw), { parse_mode:'HTML', reply_markup: mainMenu(lang, isAdmin(ctx)).reply_markup });
  } else {
    const btns = notSub.map(ch => { const slug=ch.startsWith('@')?ch.slice(1):ch; return [Markup.button.url('📢 '+ch,'https://t.me/'+slug)]; });
    btns.push([Markup.button.callback(tr(lang,'check_sub_btn'), 'check_sub')]);
    await ctx.editMessageReplyMarkup(Markup.inlineKeyboard(btns).reply_markup).catch(async()=>{
      await ctx.reply(tr(lang,'sub_required',notSub), { parse_mode:'HTML', reply_markup: Markup.inlineKeyboard(btns).reply_markup });
    });
    try { await ctx.telegram.answerCbQuery(ctx.callbackQuery.id, tr(lang,'not_subscribed'), { show_alert:true }); } catch(e){}
  }
});

// ── /start ──
bot.command('start', async ctx => {
  const userId = ctx.from.id;
  const arg = ctx.message.text.split(' ')[1]||'';
  if (arg==='admin' && isAdmin(ctx)) return ctx.reply(tr('uz','admin_welcome'), { parse_mode:'HTML', reply_markup: adminMenu().reply_markup });

  const isNew = await ensureUser(userId, arg, ctx.from);
  const u = await getUser(userId);

  // New user or no language set → show language picker
  if (isNew || !u?.language) {
    await ctx.reply('🌐 Tilni tanlang / Выберите язык / Choose language:', { reply_markup: langSelectKeyboard().reply_markup });
    return;
  }

  const lang = u.language;
  const { ok, notSub } = await checkUserSub(ctx.telegram, userId);
  if (!ok && !isAdmin(ctx)) return sendSubRequired(ctx, notSub, lang);

  if (isNew) await processReferral(userId, ctx.from.first_name, false);
  const rs = await fmtAmt(Number(await getSetting('referral_sum')), lang);
  const mw = await fmtAmt(Number(await getSetting('min_withdraw')), lang);
  await ctx.reply(tr(lang,'welcome',ctx.from.first_name,rs,mw), { parse_mode:'HTML', reply_markup: mainMenu(lang, isAdmin(ctx)).reply_markup });
});

bot.command('admin', async ctx => {
  if (!isAdmin(ctx)) return;
  await ctx.reply(tr('uz','admin_welcome'), { parse_mode:'HTML', reply_markup: adminMenu().reply_markup });
});

// ── Helper to get user lang ──
async function getLang(ctx) {
  const u = await getUser(ctx.from.id);
  return u?.language || 'uz';
}

// ════════════════════════════════════════════════════════════════
//  MAIN MENU HANDLERS
// ════════════════════════════════════════════════════════════════

// 💰 BALANS
bot.hears(allBtns('balance'), async ctx => {
  await ensureUser(ctx.from.id, null, ctx.from);
  const lang = await getLang(ctx);
  const u = await getUser(ctx.from.id);
  const bal = await fmtAmt(u.balance, lang);
  const rs  = await fmtAmt(Number(await getSetting('referral_sum')), lang);
  const mw  = await fmtAmt(Number(await getSetting('min_withdraw')), lang);
  await ctx.reply(tr(lang,'balance_msg',{...u, bal}, rs, mw), { parse_mode:'HTML' });
});

// 📜 QOIDALAR
bot.hears(allBtns('rules'), async ctx => {
  const lang = await getLang(ctx);
  const rules = await getSetting('rules_text');
  await ctx.reply(rules || tr(lang,'rules_none'), { parse_mode:'HTML' });
});

// 📞 SUPPORT
bot.hears(allBtns('support'), async ctx => {
  const lang = await getLang(ctx);
  const adminUser = await bot.telegram.getChat(ADMIN_ID).catch(()=>null);
  const adminLink = adminUser?.username ? `https://t.me/${adminUser.username}` : `tg://user?id=${ADMIN_ID}`;
  await ctx.reply(tr(lang,'support_title'), { parse_mode:'HTML', reply_markup: Markup.inlineKeyboard([[Markup.button.url(tr(lang,'support_btn'), adminLink)]]).reply_markup });
});

// 💰 PUL ISHLASH (EARN / REFERRAL)
bot.hears(allBtns('earn'), async ctx => {
  await ensureUser(ctx.from.id, null, ctx.from);
  const lang = await getLang(ctx);
  const u = await getUser(ctx.from.id);
  const bi = await ctx.telegram.getMe();
  const link = `https://t.me/${bi.username}?start=${ctx.from.id}`;
  const rs  = await fmtAmt(Number(await getSetting('referral_sum')), lang);
  const bal = await fmtAmt(u.balance, lang);
  const chs = await getChannels();
  const shareText = tr(lang,'share_text',rs,link);
  const btns = [[Markup.button.switchToChat(tr(lang,'share_btn'), shareText)]];
  if (chs.length) {
    const slug = chs[0].name.startsWith('@') ? chs[0].name.slice(1) : chs[0].name;
    btns.push([Markup.button.url('📢 '+chs[0].name, 'https://t.me/'+slug)]);
  }
  await ctx.reply(tr(lang,'earn_title',{...u, bal}, rs, link), { parse_mode:'HTML', reply_markup: Markup.inlineKeyboard(btns).reply_markup });
});

// 📋 VAZIFALAR
bot.hears(allBtns('tasks'), async ctx => {
  await ensureUser(ctx.from.id, null, ctx.from);
  const lang = await getLang(ctx);
  const siteBase = WEBHOOK_URL || `http://localhost:${PORT}`;
  const tasksUrl = `${siteBase}/vazifalar?user_id=${ctx.from.id}`;
  await ctx.reply('📋', { reply_markup: Markup.inlineKeyboard([[Markup.button.url(tr(lang,'tasks_btn'), tasksUrl)]]).reply_markup });
});

// ════════════════════════════════════════════════════════════════
//  💸 PUL YECHISH — NEW FLOW
// ════════════════════════════════════════════════════════════════
bot.hears(allBtns('withdraw'), async ctx => {
  await ensureUser(ctx.from.id, null, ctx.from);
  const lang = await getLang(ctx);
  const u    = await getUser(ctx.from.id);
  const bal  = await fmtAmt(u.balance, lang);
  const mw   = await fmtAmt(Number(await getSetting('min_withdraw')), lang);
  setState(ctx.from.id, { action: 'withdraw_amount' });
  await ctx.reply(tr(lang,'withdraw_ask',bal,mw), { parse_mode:'HTML' });
});

// ════════════════════════════════════════════════════════════════
//  🎰 KAZINO
// ════════════════════════════════════════════════════════════════
const activePlayers = new Set();
const GAME_CONFIG = {
  slot:     { emoji:'🎰', wait:3500, label:{uz:'Slot mashina', ru:'Слот машина',  en:'Slot Machine'} },
  dice:     { emoji:'🎲', wait:2000, label:{uz:"Zar o'yini",   ru:'Игра в кости', en:'Dice Game'}    },
  basket:   { emoji:'🏀', wait:3000, label:{uz:'Basketbol',    ru:'Баскетбол',    en:'Basketball'}   },
  football: { emoji:'⚽', wait:3500, label:{uz:'Futbol',       ru:'Футбол',       en:'Football'}     },
  darts:    { emoji:'🎯', wait:3000, label:{uz:'Nishon',       ru:'Дартс',        en:'Darts'}        },
  bowling:  { emoji:'🎳', wait:2500, label:{uz:'Bouling',      ru:'Боулинг',      en:'Bowling'}      },
};

bot.hears(allBtns('casino'), async ctx => {
  await ensureUser(ctx.from.id, null, ctx.from);
  const lang = await getLang(ctx);
  const u    = await getUser(ctx.from.id);
  const bal  = await fmtAmt(u.balance, lang);
  const bet  = await fmtAmt(Number(await getSetting('bet_amount')), lang);
  const gameLabel = k => GAME_CONFIG[k].label[lang]||GAME_CONFIG[k].label.uz;
  await ctx.reply(tr(lang,'casino_title',bal,bet), {
    parse_mode:'HTML',
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback(`🎰 ${gameLabel('slot')}`,     'game_slot')],
      [Markup.button.callback(`🎲 ${gameLabel('dice')}`,     'game_dice')],
      [Markup.button.callback(`🏀 ${gameLabel('basket')}`,   'game_basket')],
      [Markup.button.callback(`⚽ ${gameLabel('football')}`, 'game_football')],
      [Markup.button.callback(`🎯 ${gameLabel('darts')}`,    'game_darts')],
      [Markup.button.callback(`🎳 ${gameLabel('bowling')}`,  'game_bowling')],
    ]).reply_markup
  });
});

async function playGame(ctx, gameKey) {
  const userId = ctx.from.id;
  const cfg    = GAME_CONFIG[gameKey];
  if (!cfg) return;
  const lang = await getLang(ctx);
  if (activePlayers.has(userId)) return ctx.answerCbQuery(tr(lang,'casino_busy'), { show_alert:true });
  await ctx.answerCbQuery();
  await ensureUser(userId, null, ctx.from);
  const u   = await getUser(userId);
  const bet = Number(await getSetting('bet_amount'));
  if (u.balance < bet) {
    return ctx.reply(tr(lang,'casino_no_bal', await fmtAmt(bet,lang), await fmtAmt(u.balance,lang)), { parse_mode:'HTML' });
  }
  activePlayers.add(userId);
  try {
    const lbl = cfg.label[lang]||cfg.label.uz;
    await ctx.reply(tr(lang,'casino_start',lbl), { parse_mode:'HTML' });
    await ctx.telegram.sendDice(ctx.chat.id, { emoji: cfg.emoji });
    await new Promise(r => setTimeout(r, cfg.wait));
    const won = Math.random()*100 < Number(await getSetting('win_chance'));
    await addBalance(userId, won ? bet : -bet);
    await incGame(userId, won);
    const nu = await getUser(userId);
    activePlayers.delete(userId);
    await logUser(userId, won?'GAME_WIN':'GAME_LOSE', `game:${gameKey} bet:${bet}`, u.balance, nu.balance);
    const retryBtn = Markup.inlineKeyboard([[Markup.button.callback(tr(lang,'play_again'), 'game_'+gameKey)]]);
    const betFmt = await fmtAmt(bet, lang);
    const balFmt = await fmtAmt(nu.balance, lang);
    await ctx.reply(won ? tr(lang,'casino_win',betFmt,balFmt) : tr(lang,'casino_lose',betFmt,balFmt), { parse_mode:'HTML', reply_markup: retryBtn.reply_markup });
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

// ── Withdrawal approve/reject ──
bot.action(/^aw_(\d+)_(\d+)$/, async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("❌ Ruxsat yo'q");
  const [,uid,amt] = ctx.match;
  await updateWithdrawal(Number(uid), Number(amt), 'approved');
  await logAdmin('WITHDRAW_APPROVE', Number(uid), `amount:${amt}`, 'pending', 'approved');
  const u = await getUser(uid);
  const lang = u?.language||'uz';
  const amtFmt = await fmtAmt(Number(amt), lang);
  bot.telegram.sendMessage(Number(uid), tr(lang,'withdraw_approved',amtFmt), { parse_mode:'HTML' }).catch(()=>{});
  await ctx.editMessageReplyMarkup({ inline_keyboard:[] });
  await ctx.answerCbQuery('✅ Tasdiqlandi');
  await ctx.reply(`✅ ${uid} → ${Number(amt).toLocaleString()} so'm tasdiqlandi.`);
});

bot.action(/^rw_(\d+)_(\d+)$/, async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("❌ Ruxsat yo'q");
  const [,uid,amt] = ctx.match;
  await addBalance(Number(uid), Number(amt));
  await updateWithdrawal(Number(uid), Number(amt), 'rejected');
  await logAdmin('WITHDRAW_REJECT', Number(uid), `amount:${amt} returned`, 'pending', 'rejected');
  const u = await getUser(uid);
  const lang = u?.language||'uz';
  bot.telegram.sendMessage(Number(uid), tr(lang,'withdraw_rejected'), { parse_mode:'HTML' }).catch(()=>{});
  await ctx.editMessageReplyMarkup({ inline_keyboard:[] });
  await ctx.answerCbQuery('❌ Rad etildi');
  await ctx.reply(`❌ ${uid} ga ${Number(amt).toLocaleString()} so'm qaytarildi.`);
});

// ════════════════════════════════════════════════════════════════
//  👑 ADMIN PANEL
// ════════════════════════════════════════════════════════════════
bot.hears('👑 Admin paneli', async ctx => { if (!isAdmin(ctx)) return; await ctx.reply(tr('uz','admin_title'), { parse_mode:'HTML', reply_markup: adminMenu().reply_markup }); });
bot.hears('👑 Админ панель', async ctx => { if (!isAdmin(ctx)) return; await ctx.reply(tr('uz','admin_title'), { parse_mode:'HTML', reply_markup: adminMenu().reply_markup }); });
bot.hears('👑 Admin Panel',  async ctx => { if (!isAdmin(ctx)) return; await ctx.reply(tr('uz','admin_title'), { parse_mode:'HTML', reply_markup: adminMenu().reply_markup }); });

bot.hears('📊 Statistika', async ctx => {
  if (!isAdmin(ctx)) return;
  const userList = await loadAllUsers();
  const totalBal  = userList.reduce((s,u)=>s+(u.balance||0),0);
  const totalRef  = userList.reduce((s,u)=>s+(u.ref_count||0),0);
  const totalGame = userList.reduce((s,u)=>s+(u.game_count||0),0);
  const ws   = await loadWithdrawals();
  const totalW = ws.reduce((s,w)=>s+w.amount,0);
  const pendW  = ws.filter(w=>w.status==='pending').length;
  const chs    = await getChannels();
  const tasks  = await loadTasks();
  await ctx.reply(
    `📊 <b>BOT STATISTIKASI</b>\n━━━━━━━━━━━━━━━━━━━━\n`
    +`👥 Foydalanuvchilar: <b>${userList.length}</b>\n`
    +`💰 Jami balans: <b>${totalBal.toLocaleString()} so'm</b>\n`
    +`🔗 Jami referallar: <b>${totalRef}</b>\n`
    +`🎰 Jami o'yinlar: <b>${totalGame}</b>\n`
    +`📋 Vazifalar: <b>${tasks.length} ta</b>\n`
    +`━━━━━━━━━━━━━━━━━━━━\n`
    +`💸 Yechish so'rovlari: <b>${ws.length}</b>\n`
    +`⏳ Kutilayotgan: <b>${pendW}</b>\n`
    +`💵 Jami yechilgan: <b>${totalW.toLocaleString()} so'm</b>\n`
    +`━━━━━━━━━━━━━━━━━━━━\n`
    +`📢 Kanallar: <b>${chs.map(c=>c.name).join(', ')||"Yo'q"}</b>`,
    { parse_mode:'HTML' }
  );
});

bot.hears('📜 Loglar', async ctx => {
  if (!isAdmin(ctx)) return;
  await ctx.reply('📜 <b>Log turlari</b>', { parse_mode:'HTML', reply_markup: Markup.inlineKeyboard([
    [Markup.button.callback('👥 Foydalanuvchi loglari','log_user')],
    [Markup.button.callback('👑 Admin loglari','log_admin')],
    [Markup.button.callback('📢 Kanal loglari','log_channel')],
    [Markup.button.callback("🎰 O'yin statistikasi",'log_games')],
    [Markup.button.callback('💸 Yechish tarixi','log_withdraw')],
  ]).reply_markup });
});

bot.action('log_user', async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  const { data:rows } = await supabase.from('logs').select('*').eq('type','user').order('created_at',{ascending:false}).limit(15);
  if (!rows?.length) return ctx.reply('📭 Loglar yo\'q');
  const text = rows.map(r=>`[${new Date(r.created_at).toLocaleString()}]\n👤 <code>${r.user_id}</code> | <b>${r.action}</b>\n${r.detail?`📝 ${r.detail}\n`:''}`).join('──────────────\n');
  await ctx.reply('👥 <b>Harakatlar</b>\n━━━━━━━━━━━━━━━━━━━━\n'+text, { parse_mode:'HTML' });
});
bot.action('log_admin', async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  const { data:rows } = await supabase.from('logs').select('*').eq('type','admin').order('created_at',{ascending:false}).limit(15);
  if (!rows?.length) return ctx.reply('📭 Loglar yo\'q');
  const text = rows.map(r=>`[${new Date(r.created_at).toLocaleString()}]\n⚙️ <b>${r.action}</b>${r.target_id?` → <code>${r.target_id}</code>`:''}\n${r.detail?`📝 ${r.detail}\n`:''}`).join('──────────────\n');
  await ctx.reply('👑 <b>Admin harakatlari</b>\n━━━━━━━━━━━━━━━━━━━━\n'+text, { parse_mode:'HTML' });
});
bot.action('log_channel', async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  const { data:rows } = await supabase.from('logs').select('*').eq('type','channel').order('created_at',{ascending:false}).limit(20);
  if (!rows?.length) return ctx.reply('📭 Kanal loglari yo\'q');
  await ctx.reply('📢 <b>Kanal tarixi</b>\n━━━━━━━━━━━━━━━━━━━━\n'+rows.map(r=>`[${new Date(r.created_at).toLocaleString()}] ${r.action==='ADD'?'➕':'🗑'} <b>${r.channel_name}</b>`).join('\n'), { parse_mode:'HTML' });
});
bot.action('log_games', async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  const { data:gl } = await supabase.from('logs').select('*').in('action',['GAME_WIN','GAME_LOSE']).eq('type','user');
  const total=gl?.length||0, wins=gl?.filter(r=>r.action==='GAME_WIN').length||0;
  const byGame={};
  (gl||[]).forEach(r=>{ const g=(r.detail||'').split(' ')[0].replace('game:',''); if(!byGame[g]) byGame[g]={total:0,wins:0}; byGame[g].total++; if(r.action==='GAME_WIN') byGame[g].wins++; });
  let text=`🎰 <b>O'yin statistikasi</b>\n━━━━━━━━━━━━━━━━━━━━\nJami: <b>${total}</b> | Yutdi: <b>${wins}</b>\n━━━━━━━━━━━━━━━━━━━━\n`;
  Object.entries(byGame).forEach(([g,s])=>{ text+=`${g}: <b>${s.total}</b> | ${s.total?Math.round(s.wins/s.total*100):0}% yutdi\n`; });
  await ctx.reply(text, { parse_mode:'HTML' });
});
bot.action('log_withdraw', async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  const rows = (await loadWithdrawals()).slice(0,15);
  if (!rows.length) return ctx.reply("📭 Yechish tarixi yo'q");
  const si={ pending:'⏳', approved:'✅', rejected:'❌' };
  const text=rows.map(r=>`[${new Date(r.created_at).toLocaleString()}]\n${si[r.status]||'❓'} <code>${r.user_id}</code> | <b>${Number(r.amount).toLocaleString()} so'm</b>${r.card_number?`\n💳 ${r.card_number}`:''}`).join('\n──────────────\n');
  await ctx.reply('💸 <b>Yechish tarixi</b>\n━━━━━━━━━━━━━━━━━━━━\n'+text, { parse_mode:'HTML' });
});

bot.hears('📢 Xabar yuborish', async ctx => {
  if (!isAdmin(ctx)) return;
  setState(ADMIN_ID, { action:'broadcast' });
  await ctx.reply('📢 Xabar matnini yuboring:\n❌ Bekor: /cancel', { parse_mode:'HTML' });
});
bot.hears('📝 Qoidalarni tahrirlash', async ctx => {
  if (!isAdmin(ctx)) return;
  setState(ADMIN_ID, { action:'set_rules' });
  const cur = await getSetting('rules_text');
  await ctx.reply(`📝 Hozirgi:\n${cur}\n\n✏️ Yangi matnni yuboring:\n❌ Bekor: /cancel`, { parse_mode:'HTML' });
});
bot.hears('📋 Kanallar', async ctx => { if (!isAdmin(ctx)) return; await showChannels(ctx); });

async function showChannels(ctx) {
  const chs = await getChannels();
  const subOn = (await getSetting('sub_required'))==='1';
  const btns = chs.map(ch=>[Markup.button.callback('🗑 '+ch.name,'delch_'+encodeURIComponent(ch.name))]);
  btns.push([Markup.button.callback("➕ Kanal qo'shish",'addch')]);
  btns.push([Markup.button.callback(subOn?"🔴 Obunani o'chirish":'🟢 Obunani yoqish','toggle_sub')]);
  await ctx.reply(`📋 <b>Kanallar</b>\n\n`+(chs.length?chs.map((c,i)=>`${i+1}. ${c.name}`).join('\n'):"Kanallar yo'q"), { parse_mode:'HTML', reply_markup: Markup.inlineKeyboard(btns).reply_markup });
}

bot.action('addch', async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  setState(ADMIN_ID, { action:'addch' });
  await ctx.reply("➕ Kanal username'ini yuboring (masalan: @kanal_nomi)\n❌ Bekor: /cancel");
});
bot.action(/^delch_(.+)$/, async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("❌ Ruxsat yo'q");
  const name = decodeURIComponent(ctx.match[1]);
  await delChannel(name); await logChannel('DELETE',name); await logAdmin('CHANNEL_DELETE',null,name,name,'');
  await ctx.answerCbQuery(`✅ ${name} o'chirildi`); await ctx.deleteMessage().catch(()=>{}); await showChannels(ctx);
});
bot.action('toggle_sub', async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("❌ Ruxsat yo'q");
  const cur=(await getSetting('sub_required')), next=cur==='1'?'0':'1';
  await setSetting('sub_required',next); await logAdmin('SUB_TOGGLE',null,next==='1'?'yoqildi':'ochirildi',cur,next);
  await ctx.answerCbQuery(next==='1'?'🟢 Yoqildi':"🔴 O'chirildi"); await ctx.deleteMessage().catch(()=>{});
  await ctx.reply(next==='1'?'🟢 <b>Majburiy obuna YOQILDI!</b>':"🔴 <b>Majburiy obuna O'CHIRILDI!</b>", { parse_mode:'HTML' }); await showChannels(ctx);
});

bot.hears('⚙️ Sozlamalar', async ctx => { if (!isAdmin(ctx)) return; await showSettings(ctx); });
async function showSettings(ctx) {
  const rs=await getSetting('referral_sum'), mw=await getSetting('min_withdraw'), bt=await getSetting('bet_amount'), wc=await getSetting('win_chance'), ur=await getSetting('usd_rate');
  await ctx.reply(
    `⚙️ <b>Sozlamalar</b>\n━━━━━━━━━━━━━━━━━━━━\n💰 Referal: <b>${Number(rs).toLocaleString()} so'm</b>\n📌 Min yechish: <b>${Number(mw).toLocaleString()} so'm</b>\n🎲 Stavka: <b>${Number(bt).toLocaleString()} so'm</b>\n🍀 Yutuq %: <b>${wc}%</b>\n💱 USD kurs: <b>${Number(ur).toLocaleString()} so'm</b>`,
    { parse_mode:'HTML', reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('💰 Referal summasi','sset_referral_sum')],
      [Markup.button.callback('📌 Minimal yechish','sset_min_withdraw')],
      [Markup.button.callback('🎲 Stavka','sset_bet_amount')],
      [Markup.button.callback('🍀 Yutuq ehtimoli','sset_win_chance')],
      [Markup.button.callback('💱 USD kursi','sset_usd_rate')],
    ]).reply_markup }
  );
}
bot.action(/^sset_(.+)$/, async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  const key=ctx.match[1];
  const labels={ referral_sum:"referal summa (so'm)", min_withdraw:"minimal yechish (so'm)", bet_amount:"stavka (so'm)", win_chance:'yutuq ehtimoli (1-99%)', usd_rate:"USD kursi (1$ = ? so'm)" };
  setState(ADMIN_ID, { action:'setsetting', key });
  await ctx.reply(`✏️ Yangi ${labels[key]||key} ni kiriting:\n❌ Bekor: /cancel`);
});

bot.hears('👤 Foydalanuvchi', async ctx => { if (!isAdmin(ctx)) return; setState(ADMIN_ID,{action:'userinfo'}); await ctx.reply("👤 Foydalanuvchi ID'sini kiriting:\n❌ Bekor: /cancel"); });
bot.hears('💳 Balans berish', async ctx => { if (!isAdmin(ctx)) return; setState(ADMIN_ID,{action:'givebal_id'}); await ctx.reply("💳 Foydalanuvchi ID'sini kiriting:\n❌ Bekor: /cancel"); });

bot.hears('🗂 Vazifalar boshqaruv', async ctx => {
  if (!isAdmin(ctx)) return;
  const tasks = await loadTasks();
  const list = tasks.map((t,i)=>`${i+1}. ${t.icon} ${t.title} — ${t.reward.toLocaleString()} so'm`).join('\n');
  await ctx.reply(`🗂 <b>Vazifalar</b>\n━━━━━━━━━━━━━━━━━━━━\n${list||"Vazifalar yo'q"}`, { parse_mode:'HTML', reply_markup: Markup.inlineKeyboard([
    [Markup.button.callback("➕ Vazifa qo'shish",'task_add')],
    [Markup.button.callback("🗑 Vazifa o'chirish",'task_del')],
  ]).reply_markup });
});
bot.action('task_add', async ctx => { if (!isAdmin(ctx)) return ctx.answerCbQuery(); await ctx.answerCbQuery(); setState(ADMIN_ID,{action:'task_add_title'}); await ctx.reply("➕ Yangi vazifa nomi:\n❌ Bekor: /cancel"); });
bot.action('task_del', async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  const tasks = await loadTasks();
  if (!tasks.length) return ctx.reply("Vazifalar yo'q.");
  await ctx.reply("O'chirish uchun:", { reply_markup: Markup.inlineKeyboard(tasks.map(t=>[Markup.button.callback(`🗑 ${t.title}`,`taskdel_${t.id}`)])).reply_markup });
});
bot.action(/^taskdel_(\d+)$/, async ctx => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await supabase.from('tasks').delete().eq('id',Number(ctx.match[1]));
  await ctx.answerCbQuery("✅ O'chirildi"); await ctx.reply(`✅ Vazifa o'chirildi.`, { reply_markup: adminMenu().reply_markup });
});

bot.hears('🚪 Chiqish', async ctx => {
  if (!isAdmin(ctx)) return;
  clearState(ADMIN_ID);
  const u = await getUser(ctx.from.id);
  await ctx.reply('👤 Asosiy menyu.', { reply_markup: mainMenu(u?.language||'uz', true).reply_markup });
});
bot.command('cancel', async ctx => {
  clearState(ctx.from.id);
  const lang = await getLang(ctx);
  await ctx.reply(tr(lang,'cancel_ok'), { reply_markup: isAdmin(ctx) ? adminMenu().reply_markup : mainMenu(lang, isAdmin(ctx)).reply_markup });
});

// ════════════════════════════════════════════════════════════════
//  STATE MACHINE (ALL USERS)
// ════════════════════════════════════════════════════════════════
bot.on('message', async (ctx, next) => {
  const text = ctx.message?.text || '';
  const userId = ctx.from.id;
  const lang = await getLang(ctx);

  // ── USER STATES (withdrawal flow) ──
  const ust = getState(userId);

  if (ust.action === 'withdraw_amount') {
    clearState(userId);
    const amount = await parseAmt(text, lang);
    if (!amount) return ctx.reply(tr(lang,'invalid_amt'), { parse_mode:'HTML' });
    const minWithdraw = Number(await getSetting('min_withdraw'));
    const u = await getUser(userId);
    const mwFmt = await fmtAmt(minWithdraw, lang);
    const balFmt = await fmtAmt(u.balance, lang);
    if (amount < minWithdraw) return ctx.reply(tr(lang,'withdraw_low',mwFmt), { parse_mode:'HTML' });
    if (amount > u.balance)   return ctx.reply(tr(lang,'withdraw_no_bal',balFmt), { parse_mode:'HTML' });
    setState(userId, { action:'withdraw_card', amount });
    return ctx.reply(tr(lang,'withdraw_ask_card'), { parse_mode:'HTML' });
  }

  if (ust.action === 'withdraw_card') {
    const amount = ust.amount;
    clearState(userId);
    const card = text.trim();
    const u = await getUser(userId);
    await addWithdrawal(userId, amount, card);
    await setBalance(userId, u.balance - amount);
    await logUser(userId, 'WITHDRAW_REQUEST', `amount:${amount} card:${card}`, u.balance, u.balance-amount);
    const amtFmt = await fmtAmt(amount, lang);
    await ctx.reply(tr(lang,'withdraw_done',amtFmt,card), { parse_mode:'HTML' });
    await bot.telegram.sendMessage(ADMIN_ID,
      `💸 <b>Pul yechish so'rovi</b>\n━━━━━━━━━━━━━━━━━━━━\n`
      +`👤 ${ctx.from.first_name} ${ctx.from.last_name||''}\n🆔 <code>${userId}</code>\n`
      +`📛 ${ctx.from.username?'@'+ctx.from.username:"yo'q"}\n`
      +`💰 <b>${amount.toLocaleString()} so'm</b>\n💳 <code>${card}</code>`,
      { parse_mode:'HTML', reply_markup: Markup.inlineKeyboard([[
        Markup.button.callback('✅ Tasdiqlash',`aw_${userId}_${amount}`),
        Markup.button.callback('❌ Rad etish', `rw_${userId}_${amount}`)
      ]]).reply_markup }
    ).catch(()=>{});
    return;
  }

  // ── ADMIN STATES ──
  if (isAdmin(ctx)) {
    const st = getState(ADMIN_ID);

    if (st.action==='broadcast') {
      clearState(ADMIN_ID);
      const rows = await loadAllUsers();
      let sent=0, fail=0;
      await ctx.reply(`📢 Yuborilmoqda... (${rows.length} ta)`);
      for (const row of rows) {
        try { await bot.telegram.sendMessage(row.id, text, { parse_mode:'HTML' }); sent++; } catch { fail++; }
        await new Promise(r=>setTimeout(r,40));
      }
      await logAdmin('BROADCAST',null,`sent:${sent} fail:${fail}`,'',text.substring(0,100));
      return ctx.reply(`✅ Yuborildi: ${sent}\n❌ Xato: ${fail}`, { reply_markup: adminMenu().reply_markup });
    }
    if (st.action==='set_rules') {
      clearState(ADMIN_ID);
      const old = await getSetting('rules_text');
      await setSetting('rules_text', text);
      await logAdmin('RULES_UPDATE',null,'yangilandi',(old||'').substring(0,50),text.substring(0,50));
      return ctx.reply('✅ <b>Qoidalar yangilandi!</b>', { parse_mode:'HTML', reply_markup: adminMenu().reply_markup });
    }
    if (st.action==='addch') {
      clearState(ADMIN_ID);
      const ch = text.trim().startsWith('@') ? text.trim() : '@'+text.trim();
      await addChannel(ch); await logChannel('ADD',ch); await logAdmin('CHANNEL_ADD',null,ch,'',ch);
      return ctx.reply(`✅ <b>${ch}</b> qo'shildi!`, { parse_mode:'HTML', reply_markup: adminMenu().reply_markup });
    }
    if (st.action==='setsetting') {
      const key=st.key; clearState(ADMIN_ID);
      const val=parseInt(text,10);
      if (isNaN(val)||val<=0) return ctx.reply('❌ Musbat son kiriting.');
      if (key==='win_chance'&&(val<1||val>99)) return ctx.reply('❌ 1 dan 99 gacha bo\'lishi kerak.');
      const oldVal = await getSetting(key);
      await setSetting(key,val); await logAdmin('SETTING_CHANGE',null,key,oldVal||'',String(val));
      const labels={ referral_sum:'Referal summasi', min_withdraw:'Minimal yechish', bet_amount:'Stavka', win_chance:'Yutuq ehtimoli', usd_rate:'USD kursi' };
      return ctx.reply(`✅ <b>${labels[key]||key}</b>: <b>${val.toLocaleString()}${key==='win_chance'?'%':' so\'m'}</b>`, { parse_mode:'HTML', reply_markup: adminMenu().reply_markup });
    }
    if (st.action==='userinfo') {
      clearState(ADMIN_ID);
      const uid=parseInt(text,10); if (isNaN(uid)) return ctx.reply("❌ Noto'g'ri ID.");
      const u=await getUser(uid); if (!u) return ctx.reply('❌ Foydalanuvchi topilmadi.');
      return ctx.reply(`👤 <b>Foydalanuvchi</b>\n━━━━━━━━━━━━━━━━━━━━\n🆔 <code>${u.id}</code>\n🌐 Til: <b>${u.language||'uz'}</b>\n💰 Balans: <b>${u.balance.toLocaleString()} so'm</b>\n👥 Referallar: <b>${u.ref_count}</b>\n🎰 O'yinlar: <b>${u.game_count}</b>`, { parse_mode:'HTML' });
    }
    if (st.action==='givebal_id') {
      const uid=parseInt(text,10); if (isNaN(uid)) return ctx.reply("❌ Noto'g'ri ID.");
      const u=await getUser(uid); if (!u) return ctx.reply('❌ Foydalanuvchi topilmadi.');
      setState(ADMIN_ID,{action:'givebal_amount', userId:uid});
      return ctx.reply(`💳 ID: <code>${uid}</code>\nMiqdorni kiriting (so'm):\n❌ Bekor: /cancel`, { parse_mode:'HTML' });
    }
    if (st.action==='givebal_amount') {
      const uid=st.userId; clearState(ADMIN_ID);
      const amount=parseInt(text,10); if (isNaN(amount)) return ctx.reply("❌ Noto'g'ri miqdor.");
      const tu=await getUser(uid);
      await addBalance(uid,amount);
      await logAdmin('BALANCE_GIVE',uid,`amount:${amount}`,String(tu?.balance||0),String((tu?.balance||0)+amount));
      await logUser(uid,'BALANCE_GIVEN',`by_admin amount:${amount}`,tu?.balance||0,(tu?.balance||0)+amount);
      bot.telegram.sendMessage(uid,`💰 <b>Hisobingizga ${amount.toLocaleString()} so'm qo'shildi!</b>`,{parse_mode:'HTML'}).catch(()=>{});
      return ctx.reply(`✅ <code>${uid}</code> ga <b>${amount.toLocaleString()} so'm</b> berildi!`, { parse_mode:'HTML', reply_markup: adminMenu().reply_markup });
    }
    if (st.action==='task_add_title') { setState(ADMIN_ID,{action:'task_add_reward',title:text}); return ctx.reply("💰 Mukofot (so'm):\n❌ Bekor: /cancel"); }
    if (st.action==='task_add_reward') {
      const reward=parseInt(text,10); if (isNaN(reward)||reward<=0) return ctx.reply('❌ Musbat son kiriting.');
      setState(ADMIN_ID,{action:'task_add_link',title:st.title,reward});
      return ctx.reply("🔗 Link (yo'q bo'lsa '-' yozing):\n❌ Bekor: /cancel");
    }
    if (st.action==='task_add_link') {
      clearState(ADMIN_ID);
      const link=text.trim()==='-'?'':text.trim();
      await supabase.from('tasks').insert({ title:st.title, description:st.title, reward:st.reward, type:'custom', link, icon:'✅' });
      await logAdmin('TASK_ADD',null,st.title,'',String(st.reward));
      return ctx.reply(`✅ <b>Vazifa qo'shildi!</b>\n📋 ${st.title}\n💰 ${st.reward.toLocaleString()} so'm`, { parse_mode:'HTML', reply_markup: adminMenu().reply_markup });
    }
  }

  return next();
});

bot.on('message', async ctx => {
  const lang = await getLang(ctx);
  await ctx.reply(tr(lang,'unknown_cmd'), { reply_markup: isAdmin(ctx) ? adminMenu().reply_markup : mainMenu(lang, isAdmin(ctx)).reply_markup });
});

// ════════════════════════════════════════════════════════════════
//  EXPRESS SERVER
// ════════════════════════════════════════════════════════════════
const app = express();
app.use(express.json());
app.get('/', (_,res) => res.send('OK'));
app.post('/telegram', (req,res) => bot.handleUpdate(req.body,res));

app.get('/api/tasks', async (req,res) => {
  const userId=req.query.user_id;
  const tasks=await loadTasks();
  const result=await Promise.all(tasks.map(async t=>({...t, done: userId?await isTaskDone(userId,t.id):false})));
  res.json({ tasks:result });
});
app.post('/api/task/complete', async (req,res) => {
  const { user_id, task_id }=req.body;
  if (!user_id||!task_id) return res.json({ ok:false, error:'user_id va task_id kerak' });
  const user=await getUser(user_id); if (!user) return res.json({ ok:false, error:'Foydalanuvchi topilmadi. Avval botni ishga tushiring.' });
  const tasks=await loadTasks(); const task=tasks.find(t=>t.id===Number(task_id));
  if (!task) return res.json({ ok:false, error:'Vazifa topilmadi' });
  if (await isTaskDone(user_id,task_id)) return res.json({ ok:false, error:'Vazifa allaqachon bajarilgan' });
  await markTaskDone(user_id,task_id); await addBalance(user_id,task.reward);
  const nu=await getUser(user_id);
  await logUser(Number(user_id),'TASK_DONE',`task:${task_id} ${task.title}`,user.balance,nu.balance);
  bot.telegram.sendMessage(user_id,`✅ <b>Vazifa bajarildi!</b>\n\n📋 ${task.title}\n💰 +${task.reward.toLocaleString()} so'm qo'shildi!\n💵 Balans: <b>${nu.balance.toLocaleString()} so'm</b>`,{parse_mode:'HTML'}).catch(()=>{});
  res.json({ ok:true, reward:task.reward, balance:nu.balance });
});
app.get('/api/user', async (req,res) => {
  const userId=req.query.user_id; if (!userId) return res.json({ ok:false });
  const user=await getUser(userId); if (!user) return res.json({ ok:false, error:'Foydalanuvchi topilmadi' });
  res.json({ ok:true, user:{ id:user.id, first_name:user.first_name, balance:user.balance } });
});

app.listen(PORT, async () => {
  console.log(`✅ Server port ${PORT} da ishlamoqda`);
  await loadSettings();
  console.log('✅ Supabase settings yuklandi');
  if (WEBHOOK_URL) {
    try { await bot.telegram.setWebhook(`${WEBHOOK_URL}/telegram`); console.log('✅ Webhook: '+WEBHOOK_URL+'/telegram'); }
    catch(e) { console.error('❌ Webhook xato:', e.message); }
  } else {
    bot.launch().then(()=>console.log('✅ Bot polling rejimida')).catch(e=>{ console.error(e); process.exit(1); });
  }
});
process.once('SIGINT',  ()=>bot.stop('SIGINT'));
process.once('SIGTERM', ()=>bot.stop('SIGTERM'));
process.once('SIGUSR2', ()=>bot.stop('SIGUSR2'));














