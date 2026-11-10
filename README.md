# 💵 Valyuta Kursi Boti

O'zbekiston Markaziy banki (CBU) rasmiy kurslarini ko'rsatadigan Telegram bot.
**Cloudflare Workers**da ishlaydi: kompyuter o'chiq bo'lsa ham 24/7 javob beradi, bepul tarifda.

## ✨ Imkoniyatlar
| Tugma / buyruq | Nima qiladi |
|---|---|
| `/start` | Salomlashish va bot haqida ma'lumot |
| 💵 Bugungi kurs · `/kurs` | USD, EUR, RUB kursi va kunlik o'zgarish |
| 🔄 Konvertatsiya | `100 usd`, `50 eur`, `1 000 000 so'm` deb yozish kifoya |
| 🔔 Kunlik obuna · `/obuna` | Har kuni 9:00 da (Toshkent) kurs, haftalik o'zgarish bilan |
| ℹ️ Yordam · `/yordam` | Barcha buyruqlar |

## 🧱 Tuzilishi
```
src/
  index.js     — Worker: webhook, /setup, cron
  cbu.js       — CBU API'dan kurslarni olish
  convert.js   — "100 usd" kabi matnni tushunish
  format.js    — xabarlarni bezash (sana, raqam, jadval)
  telegram.js  — Telegram Bot API
schema.sql     — D1 bazasi (obunachilar)
wrangler.toml  — Cloudflare sozlamalari
```

## 🚀 Cloudflare'ga joylash (bir martalik)

### 1. Bot tokenini olish
Telegram'da **@BotFather** → `/newbot` → nom bering → **token**ni nusxalang.
⚠️ Tokenni hech kimga bermang va kodga yozmang.

### 2. D1 bazasini yaratish
1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Storage & Databases → D1** → **Create**.
2. Nomi: `dollar-course-db` → **Create**.
3. Bazaning **Database ID** sini nusxalang.
4. GitHub'da `wrangler.toml` faylini oching va `BU_YERGA_D1_ID_NI_QOYING` o'rniga shu ID ni yozing → **Commit**.
5. D1 sahifasida **Console** bo'limiga `schema.sql` ichidagi matnni joylab **Execute** bosing.

### 3. Worker'ni GitHub'dan joylash
1. **Workers & Pages → Create → Import a repository** → `dollar-course` ni tanlang.
2. Sozlamalarni o'zgartirmasdan **Deploy** bosing.

### 4. Maxfiy kalitlarni qo'shish
Worker → **Settings → Variables and Secrets** → **Add** (turi: **Secret**):

| Nomi | Qiymati |
|---|---|
| `BOT_TOKEN` | BotFather bergan token |
| `WEBHOOK_SECRET` | o'zingiz o'ylab topgan uzun tasodifiy satr (faqat harf, raqam, `-`, `_`) |

### 5. Botni ulash
Brauzerda oching (o'z manzilingiz va kalitingiz bilan):
```
https://dollar-course.<sizning-subdomen>.workers.dev/setup?key=<WEBHOOK_SECRET>
```
`✅ Tayyor!` chiqsa, Telegram'da botga `/start` yozing. 🎉

Shundan keyin GitHub'ga har bir push'da Cloudflare yangi versiyani o'zi joylaydi.

## ⏰ Kunlik yuborish qanday ishlaydi
Cron Toshkent vaqti bilan **9:00–9:59** oralig'ida har daqiqada ishlaydi (`* 4 * * *`, UTC).
Har safar bugun hali xabar olmagan **40 ta** obunachiga yuboradi (bepul tarifda bitta
ishga tushishda 50 ta tashqi so'rov limiti bor). Bu soatiga ~2 400 obunachiga yetadi.
Pullik tarifda `DAILY_BATCH` o'zgaruvchisi bilan ko'paytirish mumkin.
Botni bloklagan foydalanuvchilar ro'yxatdan avtomatik o'chiriladi.

## 🧪 Lokal sinov
```bash
npm install
npm test                       # unit testlar
cp .dev.vars.example .dev.vars # tokenni yozing
npm run db:init:local
npm run dev
```

## 📌 Keyingi g'oyalar
- ⚠️ Kurs ogohlantirishlari
- 🏦 Banklarning sotib olish/sotish kurslari
- 📈 Kurs grafigi
