-- Kunlik obunachilar
CREATE TABLE IF NOT EXISTS subscribers (
  chat_id    INTEGER PRIMARY KEY,         -- Telegram chat ID
  first_name TEXT,
  last_sent  TEXT,                        -- oxirgi yuborilgan sana (YYYY-MM-DD, Toshkent)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Konvertatsiyada foydalanuvchi tanlagan valyuta (kod o'zi ham avtomatik yaratadi)
CREATE TABLE IF NOT EXISTS convert_state (
  chat_id    INTEGER PRIMARY KEY,
  currency   TEXT NOT NULL,                -- USD | EUR | RUB | UZS
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Statistika uchun foydalanuvchilar va guruhlar (kod o'zi ham avtomatik yaratadi)
CREATE TABLE IF NOT EXISTS users (
  chat_id    INTEGER PRIMARY KEY,           -- foydalanuvchi yoki guruh ID
  type       TEXT NOT NULL,                 -- private | group
  name       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Premium obunalar (Telegram Stars) va to'lovlar tarixi (kod o'zi ham avtomatik yaratadi)
CREATE TABLE IF NOT EXISTS premium (
  chat_id    INTEGER PRIMARY KEY,           -- foydalanuvchi ID
  until      TEXT NOT NULL,                 -- premium tugash vaqti (UTC)
  charge_id  TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS payments (
  charge_id  TEXT PRIMARY KEY,              -- telegram_payment_charge_id (qaytarish uchun kerak)
  chat_id    INTEGER NOT NULL,
  amount     INTEGER NOT NULL,              -- Stars
  recurring  INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
