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
