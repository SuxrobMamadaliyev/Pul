import logging
import random
import asyncio
import sqlite3
import os
from dotenv import load_dotenv

from aiogram import Bot, Dispatcher, types, executor
from aiogram.contrib.fsm_storage.memory import MemoryStorage
from aiogram.dispatcher.handler import CancelHandler
from aiogram.dispatcher.middlewares import BaseMiddleware

# --- SOZLAMALAR ---
load_dotenv()
API_TOKEN = os.getenv('API_TOKEN', '8611357164:AAHkJ0YywP7zvKW4nGY84dRsMSMva_pTOfM')
ADMIN_ID = 7250754904
CHANNELS = ["@pulishla_z_community"]
REFERRAL_SUM = 3000
MIN_WITHDRAW = 50000

logging.basicConfig(level=logging.INFO)

bot = Bot(token=API_TOKEN, parse_mode="HTML")
dp = Dispatcher(bot, storage=MemoryStorage())

# --- MA'LUMOTLAR BAZASI ---
def init_db():
    """Initialize database in async-safe manner"""
    db = sqlite3.connect("bot_bazasi.db", check_same_thread=False)
    db.row_factory = sqlite3.Row
    sql = db.cursor()
    sql.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            balance INTEGER DEFAULT 0,
            ref_count INTEGER DEFAULT 0,
            game_count INTEGER DEFAULT 0
        )
    """)
    db.commit()
    return db

db = init_db()
sql = db.cursor()


# --- MAJBURIY OBUNA MIDDLEWARE ---
class CheckSubMiddleware(BaseMiddleware):
    async def on_pre_process_update(self, update: types.Update, data: dict):
        user_id = None
        if update.message:
            user_id = update.message.from_user.id
        elif update.callback_query:
            user_id = update.callback_query.from_user.id

        if user_id and user_id != ADMIN_ID:
            for channel in CHANNELS:
                try:
                    member = await bot.get_chat_member(chat_id=channel, user_id=user_id)
                    if member.status == 'left':
                        markup = types.InlineKeyboardMarkup()
                        markup.add(
                            types.InlineKeyboardButton(
                                "✅ A'zo bo'lish",
                                url=f"https://t.me/{channel.lstrip('@')}"
                            )
                        )
                        text = (
                            "<b>❌ Botdan foydalanish uchun kanalga a'zo bo'ling!</b>\n\n"
                            "A'zo bo'lgach, /start buyrug'ini yuboring."
                        )
                        if update.message:
                            await update.message.answer(text, reply_markup=markup)
                        elif update.callback_query:
                            await update.callback_query.message.answer(text, reply_markup=markup)
                        raise CancelHandler()
                except CancelHandler:
                    raise
                except Exception as e:
                    logging.warning(f"Kanal tekshirishda xato: {e}")


dp.middleware.setup(CheckSubMiddleware())


# --- ASOSIY MENYU ---
def main_menu():
    keyboard = types.ReplyKeyboardMarkup(resize_keyboard=True, row_width=2)
    keyboard.add(
        types.KeyboardButton("🎰 Kazino"),
        types.KeyboardButton("👥 Referal"),
        types.KeyboardButton("💰 Balans"),
        types.KeyboardButton("💸 Pul yechish"),
    )
    return keyboard


# --- FOYDALANUVCHINI BAZAGA QO'SHISH ---
def add_user(user_id: int, ref_id: str = None):
    try:
        sql.execute("SELECT id FROM users WHERE id=?", (user_id,))
        if sql.fetchone():
            return False

        sql.execute("INSERT INTO users (id, balance) VALUES (?, 0)", (user_id,))

        if ref_id and ref_id.isdigit():
            ref_int = int(ref_id)
            if ref_int != user_id:
                sql.execute("SELECT id FROM users WHERE id=?", (ref_int,))
                if sql.fetchone():
                    sql.execute(
                        "UPDATE users SET balance = balance + ?, ref_count = ref_count + 1 WHERE id = ?",
                        (REFERRAL_SUM, ref_int)
                    )
        db.commit()
        return True
    except Exception as e:
        logging.error(f"add_user xatosi: {e}")
        db.rollback()
        return False


# --- /start ---
@dp.message_handler(commands=['start'])
async def start(message: types.Message):
    try:
        user_id = message.from_user.id
        args = message.get_args()

        is_new = add_user(user_id, args)

        if is_new and args and args.isdigit() and int(args) != user_id:
            try:
                await bot.send_message(int(args), "🎉 <b>Yangi referal!</b> +3 000 so'm hisobingizga qo'shildi!")
            except Exception:
                pass

        await message.answer(
            f"👋 <b>Xush kelibsiz, {message.from_user.first_name}!</b>\n\n"
            "💸 Referal ulashing va pul ishlang!\n"
            "🎰 Kazinoda omadingizni sinab ko'ring!\n\n"
            "Quyidagi menyudan tanlang:",
            reply_markup=main_menu()
        )
    except Exception as e:
        logging.error(f"start xatosi: {e}")
        await message.answer("❌ Xato yuz berdi. Keyinroq urinib ko'ring.")


# --- BALANS ---
@dp.message_handler(text="💰 Balans")
async def balance(message: types.Message):
    try:
        sql.execute("SELECT balance, ref_count FROM users WHERE id=?", (message.from_user.id,))
        row = sql.fetchone()
        if not row:
            await message.answer("Avval /start bosing.")
            return
        bal, refs = row[0], row[1]
        await message.answer(
            f"💰 <b>Hisobingiz:</b> {bal:,} so'm\n"
            f"👥 <b>Referallar:</b> {refs} ta\n\n"
            f"Har bir referal uchun: <b>{REFERRAL_SUM:,} so'm</b>"
        )
    except Exception as e:
        logging.error(f"balance xatosi: {e}")
        await message.answer("❌ Xato yuz berdi.")


# --- REFERAL ---
@dp.message_handler(text="👥 Referal")
async def referral(message: types.Message):
    try:
        user_id = message.from_user.id
        bot_info = await bot.get_me()
        link = f"https://t.me/{bot_info.username}?start={user_id}"

        sql.execute("SELECT ref_count, balance FROM users WHERE id=?", (user_id,))
        row = sql.fetchone()
        refs = row[0] if row else 0
        bal = row[1] if row else 0

        await message.answer(
            f"👥 <b>Referal tizimi</b>\n\n"
            f"Do'stlaringizni taklif qiling va har biri uchun <b>{REFERRAL_SUM:,} so'm</b> oling!\n\n"
            f"🔗 Sizning havolangiz:\n<code>{link}</code>\n\n"
            f"📊 Jami referallar: <b>{refs} ta</b>\n"
            f"💰 Balans: <b>{bal:,} so'm</b>"
        )
    except Exception as e:
        logging.error(f"referral xatosi: {e}")
        await message.answer("❌ Xato yuz berdi.")


# --- KAZINO ---
@dp.message_handler(text="🎰 Kazino")
async def casino(message: types.Message):
    try:
        user_id = message.from_user.id
        sql.execute("SELECT balance FROM users WHERE id=?", (user_id,))
        row = sql.fetchone()
        if not row:
            await message.answer("Avval /start bosing.")
            return

        bal = row[0]
        bet = 5000

        if bal < bet:
            await message.answer(
                f"❌ O'yin uchun kamida <b>{bet:,} so'm</b> kerak!\n"
                f"Sizda: <b>{bal:,} so'm</b>\n\n"
                f"Referal ulashing va balans to'ldiring 👥"
            )
            return

        await message.answer("🎰 G'ildirak aylanmoqda...")
        await message.answer_dice("🎰")
        await asyncio.sleep(3)

        chance = 45
        won = random.randint(1, 100) <= chance

        if won:
            sql.execute("UPDATE users SET balance = balance + ?, game_count = game_count + 1 WHERE id=?", (bet, user_id))
            db.commit()
            await message.answer(
                f"🎉 <b>Tabriklaymiz! Yutdingiz!</b>\n"
                f"💰 +{bet:,} so'm\n"
                f"💼 Yangi balans: <b>{bal + bet:,} so'm</b>"
            )
        else:
            sql.execute("UPDATE users SET balance = balance - ?, game_count = game_count + 1 WHERE id=?", (bet, user_id))
            db.commit()
            new_bal = bal - bet
            await message.answer(
                f"😔 <b>Yutqazdingiz.</b>\n"
                f"💸 -{bet:,} so'm\n"
                f"💼 Yangi balans: <b>{new_bal:,} so'm</b>\n\n"
                f"Yana bir bor urinib ko'ring! 🍀"
            )
    except Exception as e:
        logging.error(f"casino xatosi: {e}")
        await message.answer("❌ O'yinni boshlashda xato. Keyinroq urinib ko'ring.")


# --- PUL YECHISH ---
@dp.message_handler(text="💸 Pul yechish")
async def withdraw(message: types.Message):
    try:
        user_id = message.from_user.id
        sql.execute("SELECT balance FROM users WHERE id=?", (user_id,))
        row = sql.fetchone()
        if not row:
            await message.answer("Avval /start bosing.")
            return

        bal = row[0]
        if bal < MIN_WITHDRAW:
            needed = MIN_WITHDRAW - bal
            await message.answer(
                f"❌ <b>Yechish uchun yetarli mablag' yo'q.</b>\n\n"
                f"💰 Sizda: <b>{bal:,} so'm</b>\n"
                f"📌 Minimal summa: <b>{MIN_WITHDRAW:,} so'm</b>\n"
                f"🔺 Yana kerak: <b>{needed:,} so'm</b>\n\n"
                f"Referallar orqali balans to'ldiring 👥"
            )
        else:
            sql.execute("UPDATE users SET balance = 0 WHERE id=?", (user_id,))
            db.commit()
            
            await message.answer(
                f"✅ <b>Pul yechish so'rovi qabul qilindi!</b>\n\n"
                f"💰 Yechilayotgan summa: <b>{bal:,} so'm</b>\n\n"
                f"So'rovingiz adminга yuborildi. 24 soat ichida ko'rib chiqiladi."
            )
            await bot.send_message(
                ADMIN_ID,
                f"💸 <b>Pul yechish so'rovi</b>\n\n"
                f"👤 Foydalanuvchi: {message.from_user.full_name}\n"
                f"🆔 ID: <code>{user_id}</code>\n"
                f"💰 Summa: <b>{bal:,} so'm</b>"
            )
    except Exception as e:
        logging.error(f"withdraw xatosi: {e}")
        await message.answer("❌ Xato yuz berdi. Keyinroq urinib ko'ring.")


# --- ADMIN: Statistika ---
@dp.message_handler(commands=['stats'], user_id=ADMIN_ID)
async def admin_stats(message: types.Message):
    try:
        sql.execute("SELECT COUNT(*), SUM(balance), SUM(ref_count) FROM users")
        row = sql.fetchone()
        count, total_bal, total_refs = row[0], row[1] or 0, row[2] or 0
        await message.answer(
            f"📊 <b>Bot statistikasi</b>\n\n"
            f"👥 Foydalanuvchilar: <b>{count}</b>\n"
            f"💰 Jami balans: <b>{total_bal:,} so'm</b>\n"
            f"🔗 Jami referallar: <b>{total_refs}</b>"
        )
    except Exception as e:
        logging.error(f"admin_stats xatosi: {e}")


# --- NOMA'LUM XABAR ---
@dp.message_handler()
async def unknown(message: types.Message):
    try:
        await message.answer("❓ Noto'g'ri buyruq. Menyudan foydalaning:", reply_markup=main_menu())
    except Exception as e:
        logging.error(f"unknown xatosi: {e}")


# --- ISHGA TUSHURISH ---
if __name__ == '__main__':
    executor.start_polling(dp, skip_updates=True)
