// 💵 Valyuta Kursi Boti — Cloudflare Worker
//
//  /webhook  — Telegram xabarlarni shu manzilga yuboradi
//  /setup    — webhook, buyruqlar va bot tavsifini bir marta o'rnatish
//  cron      — har kuni ertalab obunachilarga kursni yuborish
import { Telegram } from './telegram.js';
import { getRates, getRatesOn, parseCbuDate, CURRENCIES, PREMIUM_CURRENCIES, ALL_CURRENCIES, isPremiumCurrency, TOP_PREMIUM } from './cbu.js';

const PREMIUM_COUNT = Object.keys(PREMIUM_CURRENCIES).length; // 28
import { parseConvert } from './convert.js';
import {
  esc, boldSans, money, smartMoney, uzDate, tashkentTime,
  ratesTable, usdComment, weeklyComment,
} from './format.js';

// ---------- Tugmalar ----------
const BTN = {
  RATES: '💵 Bugungi kurs',
  CONVERT: '🔄 Konvertatsiya',
  SUBSCRIBE: '🔔 Kunlik obuna',
  HELP: 'ℹ️ Yordam',
  PREMIUM: '⭐ Premium tarif',
  ADD_GROUP: '👥 Guruhga qo\'shish',
};
// Eski menyuda qolgan tugma ham ishlashi uchun
const OLD_ADD_GROUP = '➕ Guruhga qo\'shish';

const MAIN_MENU = {
  keyboard: [
    [{ text: BTN.RATES }, { text: BTN.CONVERT }],
    [{ text: BTN.SUBSCRIBE }, { text: BTN.HELP }],
    [{ text: BTN.PREMIUM }, { text: BTN.ADD_GROUP }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

// Konvertatsiya: valyuta tanlash tugmalari (tanlangani ✅ bilan belgilanadi)
const CONVERT_OPTIONS = [
  ['USD', '🇺🇸 Dollar → so\'m'],
  ['EUR', '🇪🇺 Yevro → so\'m'],
  ['RUB', '🇷🇺 Rubl → so\'m'],
  ['UZS', '🇺🇿 So\'m → valyuta'],
];

function convLabel(code) {
  const opt = CONVERT_OPTIONS.find(([c]) => c === code);
  return opt ? opt[1] : `${ALL_CURRENCIES[code].flag} ${code} → so'm`;
}

function convertKeyboard(selected) {
  const btn = ([code, label]) => ({ text: (code === selected ? '✅ ' : '') + label, callback_data: `conv_${code}` });
  const more = isPremiumCurrency(selected) ? `✅ ⭐ ${selected}` : '⭐ Boshqa valyutalar';
  return {
    inline_keyboard: [
      CONVERT_OPTIONS.slice(0, 2).map(btn),
      CONVERT_OPTIONS.slice(2).map(btn),
      [{ text: more, callback_data: 'conv_more' }],
    ],
  };
}

// Premium valyutalar tugmalari (3 tadan qatorda)
function premiumConvertKeyboard(selected) {
  const codes = Object.keys(PREMIUM_CURRENCIES);
  const rows = [];
  for (let i = 0; i < codes.length; i += 3) {
    rows.push(codes.slice(i, i + 3).map((c) => ({
      text: `${c === selected ? '✅ ' : ''}${PREMIUM_CURRENCIES[c].flag} ${c}`,
      callback_data: `conv_${c}`,
    })));
  }
  rows.push([{ text: '⬅️ Asosiy valyutalar', callback_data: 'convert_help' }]);
  return { inline_keyboard: rows };
}

// Xabarning o'zi ostida chiqadigan tugmalar
const MENU_INLINE = {
  inline_keyboard: [
    [{ text: BTN.RATES, callback_data: 'menu_rates' }, { text: BTN.CONVERT, callback_data: 'convert_help' }],
    [{ text: BTN.SUBSCRIBE, callback_data: 'menu_sub' }, { text: BTN.HELP, callback_data: 'menu_help' }],
  ],
};

// Guruhda kurs xabari ostida faqat "Yangilash" (guruhda bot oddiy matnni o'qimaydi)
const RATES_INLINE_GROUP = {
  inline_keyboard: [[{ text: '🔄 Yangilash', callback_data: 'refresh' }]],
};

const RATES_INLINE = {
  inline_keyboard: [[
    { text: '🔄 Yangilash', callback_data: 'refresh' },
    { text: '🔄 Konvertatsiya', callback_data: 'convert_help' },
  ]],
};

// Premium bo'lmaganlarga kurs ostida "⭐ Boshqa valyutalar" ham chiqadi
function ratesInline(premium) {
  if (premium) return RATES_INLINE; // premium kurslar "⭐ Premium tarif" bo'limida
  return { inline_keyboard: [...RATES_INLINE.inline_keyboard, [{ text: '⭐ Boshqa valyutalar', callback_data: 'premium_info' }]] };
}

// Bugungi kurs va ertalabki xabarda hamma uchun faqat USD, EUR, RUB.
// Premium valyutalar kurslari "⭐ Premium tarif" bo'limida.
const ratesCodes = () => Object.keys(CURRENCIES);

// Bir cron ishga tushishida nechta obunachiga yuboriladi.
// Bepul tarifda bitta ishga tushishda 50 ta tashqi so'rov limiti bor, shuning uchun 40.
const DEFAULT_BATCH = 40;

// ---------- Xabar matnlari ----------
function welcomeText(firstName) {
  return [
    `💵 <b>${boldSans('Dollar Kursi')}</b>`,
    '',
    `Assalomu Alaykum, <b>hurmatli ${esc(firstName || 'foydalanuvchi')}</b>! 👋`,
    '',
    'Men sizga <b>O\'zbekiston Markaziy banki</b>ning rasmiy kurslarini tez va qulay yetkazaman.',
    '',
    `<b>✨ ${boldSans('Nima qila olaman')}:</b>`,
    '💵 <b>Bugungi kurs</b>: USD, EUR, RUB',
    '🔄 <b>Konvertatsiya</b>: <code>100 usd</code> deb yozing, hisoblab beraman',
    '🔔 <b>Kunlik obuna</b>: har kuni ertalab 8:00 da kurs',
    'ℹ️ <b>Yordam</b>: barcha buyruqlar',
    '',
    '<blockquote>📅 Kurslar har kuni avtomatik yangilanadi</blockquote>',
    '',
    '👇 <i>Pastdagi tugmalardan birini tanlang:</i>',
  ].join('\n');
}

function helpText() {
  return [
    `ℹ️ <b>${boldSans('Yordam')}</b>`,
    '',
    '<b>Tugmalar:</b>',
    '💵 <b>Bugungi kurs</b>: CBU rasmiy kurslari',
    '🔄 <b>Konvertatsiya</b>: summani hisoblash',
    '🔔 <b>Kunlik obuna</b>: yoqish yoki o\'chirish',
    '',
    '<b>Buyruqlar:</b>',
    '/kurs: bugungi kurs',
    '/konvert: konvertatsiya',
    '/obuna: kunlik obunani yoqish yoki o\'chirish',
    `/premium: ⭐ ${PREMIUM_COUNT} ta qo'shimcha valyuta`,
    '/yordam: shu xabar',
    '',
    '<b>Konvertatsiya:</b> summa va valyutani yozing',
    '<code>100 dollar</code> · <code>100 yevro</code> · <code>100 rubl</code> · <code>100 000 so\'m</code>',
    '',
    '👥 <b>Guruhda ham ishlayman:</b> meni guruhga qo\'shing va <code>/kurs</code> yozing.',
    '',
    '<blockquote>🏦 Manba: O\'zbekiston Markaziy banki (cbu.uz)</blockquote>',
  ].join('\n');
}

// Guruhga qo'shilganda va guruhda /start yoki /yordam yozilganda
function groupHelpText() {
  return [
    `👋 <b>Salom! Men ${boldSans('Dollar Kursi')} botiman.</b>`,
    '',
    'Guruhda quyidagi buyruqlar ishlaydi:',
    '',
    '💵 /kurs: bugungi kurs',
    '🔄 <code>/k 100 dollar</code>: konvertatsiya',
    '🔔 /obuna: har kuni 8:00 da kurs guruhga (faqat adminlar)',
    'ℹ️ /yordam: shu xabar',
    '',
    '<blockquote>🏦 Manba: O\'zbekiston Markaziy banki</blockquote>',
  ].join('\n');
}

function convertHelpText() {
  return [
    `🔄 <b>${boldSans('Konvertatsiya')}</b>`,
    '',
    'Qaysi valyutani hisoblaymiz? 👇',
    '',
    '<i>Tanlaganingizdan keyin faqat summani yozasiz, masalan:</i> <code>100</code>',
  ].join('\n');
}

function convertChosenText(rates, code) {
  const label = convLabel(code);
  const lines = [
    `🔄 <b>${boldSans('Konvertatsiya')}</b>`,
    '',
    `Tanlandi: <b>${label}</b>`,
    '',
    code === 'UZS'
      ? '✏️ Endi so\'mdagi summani yozing, masalan: <code>1000000</code>'
      : '✏️ Endi summani yozing, masalan: <code>100</code>',
  ];
  if (code !== 'UZS' && rates[code]) lines.push('', `<i>Kurs: 1 ${code} = ${money(rates[code].rate)} so'm</i>`);
  return lines.join('\n');
}

async function ratesText(rates, premium = false, all = false) {
  const date = rates.USD?.date;
  return [
    `📊 <b>${boldSans(all ? 'Barcha kurslar' : 'Bugungi kurslar')}</b>`,
    date ? `📅 <i>${uzDate(date)}</i>` : '',
    '',
    ratesTable(rates, ratesCodes(premium, all)),
    usdComment(rates),
    '',
    `<blockquote>🏦 Manba: O'zbekiston Markaziy banki\n🕐 Yangilandi: ${tashkentTime()}</blockquote>`,
  ].join('\n');
}

async function weeklyUsdDiff(rates) {
  if (!rates.USD) return null;
  try {
    const weekAgo = new Date(parseCbuDate(rates.USD.date).getTime() - 7 * 86400 * 1000);
    const old = await getRatesOn(weekAgo);
    return old.USD ? rates.USD.rate - old.USD.rate : null;
  } catch {
    return null; // haftalik ma'lumot bo'lmasa, shunchaki ko'rsatmaymiz
  }
}

function morningText(rates, weekDiff, premium = false) {
  return [
    `☀️ <b>${boldSans('Xayrli tong!')}</b>`,
    `📅 <i>${uzDate(rates.USD.date, true)}</i>`,
    '',
    ratesTable(rates, ratesCodes(premium)),
    weeklyComment(weekDiff),
    '',
    '<i>Kuningiz xayrli o\'tsin!</i> 🌿',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

function convertText(rates, { amount, from }, inGroup = false, premium = false) {
  const lines = [`🔄 <b>${boldSans('Konvertatsiya')}</b>`, ''];
  if (from === 'UZS') {
    lines.push(`🇺🇿 <b>${smartMoney(amount)} so'm</b> =`, '');
    for (const [code, info] of Object.entries(premium ? ALL_CURRENCIES : CURRENCIES)) {
      if (!rates[code]) continue;
      lines.push(`${info.flag} <b>${money(amount / rates[code].rate)} ${code}</b>`);
    }
  } else {
    const r = rates[from];
    lines.push(`${ALL_CURRENCIES[from].flag} <b>${smartMoney(amount)} ${from}</b> = 🇺🇿 <b>${smartMoney(amount * r.rate)} so'm</b>`);
    lines.push('', `<i>Kurs: 1 ${from} = ${money(r.rate)} so'm</i>`);
  }
  if (!inGroup) lines.push('', '✏️ <i>Yana summa yozing yoki valyutani almashtiring</i> 👇');
  return lines.join('\n');
}

// ---------- Konvertatsiya uchun tanlangan valyuta (D1) ----------
// Kerakli jadvallar kod tomonidan avtomatik yaratiladi (D1 Console'da hech narsa qilish shart emas)
let tablesReady = false;
async function ensureStateTable(env) {
  if (tablesReady) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS subscribers (chat_id INTEGER PRIMARY KEY, first_name TEXT, last_sent TEXT, created_at TEXT NOT NULL DEFAULT (datetime(\'now\')))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS convert_state (chat_id INTEGER PRIMARY KEY, currency TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime(\'now\')))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS premium (chat_id INTEGER PRIMARY KEY, until TEXT NOT NULL, charge_id TEXT, plan TEXT NOT NULL DEFAULT \'month\', reminded INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime(\'now\')))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS payments (charge_id TEXT PRIMARY KEY, chat_id INTEGER NOT NULL, amount INTEGER NOT NULL, recurring INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime(\'now\')))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS card_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id INTEGER NOT NULL, name TEXT, plan TEXT NOT NULL, amount INTEGER NOT NULL, status TEXT NOT NULL, file_id TEXT, file_kind TEXT, admin_msg INTEGER, created_at TEXT NOT NULL DEFAULT (datetime(\'now\')), decided_at TEXT)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS users (chat_id INTEGER PRIMARY KEY, type TEXT NOT NULL, name TEXT, created_at TEXT NOT NULL DEFAULT (datetime(\'now\')), last_seen TEXT NOT NULL DEFAULT (datetime(\'now\')))'),
    // Statistika qo'shilishidan oldingi obunachilarni ham hisobga olamiz
    env.DB.prepare('INSERT OR IGNORE INTO users (chat_id, type, name, created_at, last_seen) SELECT chat_id, CASE WHEN chat_id < 0 THEN \'group\' ELSE \'private\' END, first_name, created_at, created_at FROM subscribers'),
  ]);
  // Avvalroq yaratilgan premium jadvaliga yangi ustunlar (bor bo'lsa, xato e'tiborsiz qoldiriladi)
  const newColumns = [
    ['premium', 'plan TEXT NOT NULL DEFAULT \'month\''],
    ['premium', 'reminded INTEGER NOT NULL DEFAULT 0'],
    ['payments', 'plan TEXT'],
    ['payments', 'refunded INTEGER NOT NULL DEFAULT 0'],
  ];
  for (const [table, col] of newColumns) {
    try { await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${col}`).run(); } catch { /* ustun allaqachon bor */ }
  }
  tablesReady = true;
}

// ---------- Premium (Telegram Stars) ----------
const monthPrice = (env) => Number(env.PREMIUM_PRICE) || 49;
const yearPrice = (env) => Number(env.PREMIUM_YEAR_PRICE) || 489;
const DAY = 24 * 3600 * 1000;
const toSql = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
const fromSql = (s) => new Date(s.replace(' ', 'T') + 'Z');

// Premium tugash sanasi (Date) yoki null. Admin uchun har doim cheksiz.
async function premiumUntil(env, userId) {
  if (!userId) return null;
  if (isAdmin(env, userId)) return new Date('2099-12-31T00:00:00Z');
  await ensureStateTable(env);
  const row = await env.DB.prepare('SELECT until FROM premium WHERE chat_id = ? AND until > datetime(\'now\')').bind(userId).first();
  return row ? fromSql(row.until) : null;
}
const isPremium = async (env, userId) => !!(await premiumUntil(env, userId));

function dateUz(d) {
  const p = (n) => String(n).padStart(2, '0');
  return uzDate(`${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`);
}

const currencyLine = (c) => `${ALL_CURRENCIES[c].flag} ${c}: ${ALL_CURRENCIES[c].name}`;

function premiumText(env, until) {
  const isAdminUntil = until && until.getUTCFullYear() >= 2099;
  const lines = [`⭐ <b>${boldSans('Premium')}</b>`, ''];
  if (until) {
    lines.push(isAdminUntil ? '✅ <b>Premium faol</b> (admin, cheksiz)' : `✅ <b>Premium faol:</b> ${dateUz(until)} gacha`, '');
  }
  lines.push(
    '🆓 <b>Bepul valyutalar:</b>', ...Object.keys(CURRENCIES).map(currencyLine), '',
    `⭐ <b>Premium'da qo'shiladi: ${PREMIUM_COUNT} ta valyuta</b>`, ...TOP_PREMIUM.map(currencyLine),
    `<i>...va yana ${PREMIUM_COUNT - TOP_PREMIUM.length} ta valyuta</i>`, '',
  );
  if (!until) {
    lines.push(
      '💰 <b>Tariflar:</b>',
      `📅 Oylik: <b>${monthPrice(env)} ⭐</b>${cardEnabled(env) ? ` yoki <b>${som(cardPrice(env, 'month'))}</b>` : ''} / oy`,
      `🗓 Yillik: <b>${yearPrice(env)} ⭐</b>${cardEnabled(env) ? ` yoki <b>${som(cardPrice(env, 'year'))}</b>` : ''} / yil  <i>(tejamkor 🎁)</i>`,
    );
  } else if (!isAdminUntil) {
    lines.push(`🗓 <i>Yillik tarif bilan uzaytirish mumkin: ${yearPrice(env)} ⭐ (365 kun qo'shiladi)</i>`);
  }
  return lines.join('\n');
}

function fullListText() {
  return [
    `📋 <b>${boldSans('Premium valyutalar')}</b> (${PREMIUM_COUNT} ta)`,
    '',
    ...Object.keys(PREMIUM_CURRENCIES).map(currencyLine),
  ].join('\n');
}

function invoiceLink(tg, env, plan) {
  const year = plan === 'year';
  return tg.call('createInvoiceLink', {
    title: year ? 'Premium: 1 yil' : 'Premium: 1 oy',
    description: year
      ? `${PREMIUM_COUNT} ta qo'shimcha valyuta kursi va konvertatsiyasi, 365 kun. Bir martalik to'lov.`
      : `${PREMIUM_COUNT} ta qo'shimcha valyuta kursi va konvertatsiyasi. Har 30 kunda avtomatik yangilanadi, istalgan vaqtda bekor qilish mumkin.`,
    payload: year ? 'premium_year' : 'premium',
    currency: 'XTR', // Telegram Stars
    prices: [{ label: year ? 'Premium (365 kun)' : 'Premium (30 kun)', amount: year ? yearPrice(env) : monthPrice(env) }],
    ...(year ? {} : { subscription_period: 30 * 24 * 3600 }),
  });
}

function premiumRatesText(rates, until) {
  return [
    `⭐ <b>${boldSans('Premium kurslar')}</b>`,
    until.getUTCFullYear() >= 2099 ? '✅ Premium faol (admin, cheksiz)' : `✅ Premium faol: <b>${dateUz(until)}</b> gacha`,
    '',
    ratesTable(rates, Object.keys(PREMIUM_CURRENCIES)),
    '',
    `<blockquote>🏦 Manba: O'zbekiston Markaziy banki\n🕐 Yangilandi: ${tashkentTime()}</blockquote>`,
  ].join('\n');
}

async function sendPremiumInfo(tg, env, chatId, userId) {
  const until = await premiumUntil(env, userId);
  const listBtn = [{ text: '📋 To\'liq ro\'yxat', callback_data: 'premium_list' }];
  if (until) {
    const rows = [[
      { text: '🔄 Yangilash', callback_data: 'refresh_premium' },
      { text: '🔄 Konvertatsiya', callback_data: 'conv_more' },
    ]];
    if (until.getUTCFullYear() < 2099) {
      rows.push([{ text: `🗓 Yillikka uzaytirish: ${yearPrice(env)} ⭐`, url: await invoiceLink(tg, env, 'year') }]);
      if (cardEnabled(env)) rows.push([{ text: '💳 Payme / karta orqali uzaytirish', callback_data: 'card_pay' }]);
    }
    return tg.send(chatId, premiumRatesText(await getRates(), until), { reply_markup: { inline_keyboard: rows } });
  }
  const [mLink, yLink] = await Promise.all([invoiceLink(tg, env, 'month'), invoiceLink(tg, env, 'year')]);
  return tg.send(chatId, premiumText(env, null), {
    reply_markup: {
      inline_keyboard: [
        listBtn,
        [{ text: `⭐ Oylik: ${monthPrice(env)} ⭐`, url: mLink }, { text: `🗓 Yillik: ${yearPrice(env)} ⭐`, url: yLink }],
        ...(cardEnabled(env) ? [[{ text: '💳 Payme / karta orqali to\'lash', callback_data: 'card_pay' }]] : []),
      ],
    },
  });
}

// To'lov muvaffaqiyatli bo'lganda (oylik: birinchi to'lov va har oylik yangilanish; yillik: bir martalik)
async function handlePayment(tg, env, msg) {
  const pay = msg.successful_payment;
  const userId = msg.from.id;
  const year = pay.invoice_payload === 'premium_year';
  await ensureStateTable(env);
  const row = await env.DB.prepare('SELECT until FROM premium WHERE chat_id = ?').bind(userId).first();
  const current = row ? fromSql(row.until) : null;
  const now = new Date();
  let until;
  if (year) {
    // Yil qolgan muddatga qo'shiladi, hech narsa kuyib ketmaydi
    const base = current && current > now ? current : now;
    until = new Date(base.getTime() + 365 * DAY);
  } else {
    const subEnd = pay.subscription_expiration_date ? new Date(pay.subscription_expiration_date * 1000) : new Date(now.getTime() + 30 * DAY);
    until = current && current > subEnd ? current : subEnd; // yillik muddat qisqarib qolmasin
  }
  await env.DB.batch([
    env.DB.prepare('INSERT INTO premium (chat_id, until, charge_id, plan, reminded) VALUES (?, ?, ?, ?, 0) ON CONFLICT(chat_id) DO UPDATE SET until = excluded.until, charge_id = excluded.charge_id, plan = excluded.plan, reminded = 0, updated_at = datetime(\'now\')')
      .bind(userId, toSql(until), pay.telegram_payment_charge_id, year ? 'year' : 'month'),
    env.DB.prepare('INSERT OR IGNORE INTO payments (charge_id, chat_id, amount, recurring, plan) VALUES (?, ?, ?, ?, ?)')
      .bind(pay.telegram_payment_charge_id, userId, pay.total_amount, pay.is_recurring ? 1 : 0, year ? 'year' : 'month'),
  ]);
  if (!year && pay.is_recurring && !pay.is_first_recurring) {
    return tg.send(msg.chat.id, `⭐ Premium yangilandi: <b>${dateUz(until)}</b> gacha. Rahmat! 🙏`);
  }
  return tg.send(msg.chat.id, [
    '🎉 <b>Premium yoqildi!</b>',
    '',
    `✅ ${PREMIUM_COUNT} ta qo'shimcha valyuta ochildi: <b>${dateUz(until)}</b> gacha.`,
    '💵 <b>Bugungi kurs</b> va <b>Konvertatsiya</b> bo\'limlarini ochib ko\'ring.',
    '',
    year
      ? '<i>Yillik tarif avtomatik yangilanmaydi. Tugashidan 3 kun oldin eslatib qo\'yaman.</i>'
      : '<i>Obuna har 30 kunda avtomatik yangilanadi. Bekor qilish: Telegram → Sozlamalar → Telegram Stars.</i>',
  ].join('\n'), { reply_markup: MAIN_MENU });
}

// Yillik premium tugashiga 3 kun qolganda eslatma (cron ichida)
async function sendYearReminders(tg, env, limit) {
  const { results } = await env.DB.prepare(
    `SELECT chat_id, until, plan FROM premium WHERE plan IN ('year', 'card_month', 'card_year') AND reminded = 0
     AND until > datetime('now') AND until <= datetime('now', '+3 days') LIMIT ?`
  ).bind(limit).all();
  let sent = 0;
  for (const { chat_id, until, plan } of results) {
    try {
      const link = await invoiceLink(tg, env, 'year');
      const rows = [[{ text: `🗓 Uzaytirish: ${yearPrice(env)} ⭐`, url: link }]];
      if (cardEnabled(env)) rows.push([{ text: '💳 Payme / karta orqali uzaytirish', callback_data: 'card_pay' }]);
      await tg.send(chat_id, [
        '⏰ <b>Premium tugashiga oz qoldi</b>',
        '',
        `${plan === 'card_month' ? 'Oylik' : 'Yillik'} Premium <b>${dateUz(fromSql(until))}</b> da tugaydi.`,
        'Uzaytirsangiz, muddat qolgan kunlaringizga qo\'shiladi.',
      ].join('\n'), { reply_markup: { inline_keyboard: rows } });
      sent++;
    } catch (e) {
      console.error('Eslatma yuborilmadi', chat_id, e.message);
    }
    await env.DB.prepare('UPDATE premium SET reminded = 1 WHERE chat_id = ?').bind(chat_id).run();
  }
  return sent;
}

// ---------- Karta (Payme/Click) orqali to'lov: chek va admin tasdig'i ----------
const cardEnabled = (env) => !!(env.CARD_NUMBER && String(env.CARD_NUMBER).trim());
const cardPrice = (env, plan) => Number(plan === 'year' ? env.CARD_PRICE_YEAR : env.CARD_PRICE_MONTH) || (plan === 'year' ? 109000 : 9900);
const som = (n) => `${money(n, 0)} so'm`;
const cardPlanName = (plan) => (plan === 'year' ? 'Yillik (365 kun)' : 'Oylik (30 kun)');
const CARD_REJECT_REASONS = {
  1: 'Pul kartaga tushmagan',
  2: 'Summa noto\'g\'ri',
  3: 'Chek noaniq yoki o\'qib bo\'lmaydi',
};

function cardChooseText(env) {
  return [
    '💳 <b>Payme / karta orqali to\'lash</b>',
    '',
    'Tarifni tanlang 👇',
    '',
    `📅 Oylik: <b>${som(cardPrice(env, 'month'))}</b> (30 kun)`,
    `🗓 Yillik: <b>${som(cardPrice(env, 'year'))}</b> (365 kun)`,
  ].join('\n');
}

const cardDigits = (env) => String(env.CARD_NUMBER).replace(/\D/g, '');
// Karta raqamini 4 tadan guruhlab ko'rsatish: 8600 1111 2222 3333
const cardPretty = (env) => cardDigits(env).replace(/(\d{4})(?=\d)/g, '$1 ');

function cardInstructionText(env, plan) {
  return [
    '💳 <b>Karta orqali to\'lov</b>',
    '',
    `📅 Tarif: <b>${cardPlanName(plan)}</b>`,
    `💰 Summa: <b>${som(cardPrice(env, plan))}</b>`,
    '',
    '━━━━━━━━━━━━━━━',
    `💳  <b><code>${cardPretty(env)}</code></b>`,
    env.CARD_OWNER ? `👤  <b>${esc(String(env.CARD_OWNER).trim())}</b>` : '',
    '━━━━━━━━━━━━━━━',
    '',
    '1️⃣ <b>📋 Karta raqamini nusxalash</b> tugmasini bosing',
    `2️⃣ Payme, Click yoki bank ilovasida kartaga <b>${som(cardPrice(env, plan))}</b> o'tkazing`,
    '3️⃣ To\'lov <b>chekini (skrinshot)</b> shu yerga yuboring 📸',
    '',
    '<i>Chek tekshirilgach, premium yoqiladi va sizga xabar beraman.</i>',
  ].filter((l) => l !== null).filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

// Bir bosishda nusxalanadigan tugmalar (karta raqami va summa)
function cardKeyboard(env, amount) {
  return {
    inline_keyboard: [
      [{ text: '📋 Karta raqamini nusxalash', copy_text: { text: cardDigits(env) } }],
      [{ text: `📋 Summani nusxalash: ${amount}`, copy_text: { text: String(amount) } }],
      [{ text: '❌ Bekor qilish', callback_data: 'card_cancel' }],
    ],
  };
}

// Foydalanuvchi tarifni tanladi: chek kutilayotgan so'rov yaratiladi
async function startCardRequest(tg, env, chatId, from, plan) {
  await ensureStateTable(env);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM card_requests WHERE chat_id = ? AND status = \'waiting\'').bind(chatId),
    env.DB.prepare('INSERT INTO card_requests (chat_id, name, plan, amount, status) VALUES (?, ?, ?, ?, \'waiting\')')
      .bind(chatId, [from?.first_name, from?.last_name].filter(Boolean).join(' ') + (from?.username ? ` (@${from.username})` : ''), plan, cardPrice(env, plan)),
  ]);
  return tg.send(chatId, cardInstructionText(env, plan), { reply_markup: cardKeyboard(env, cardPrice(env, plan)) });
}

// Chek rasmi keldi. Kutilayotgan so'rov bo'lmasa false qaytaradi (oddiy rasm sifatida ishlanadi)
async function handleReceipt(tg, env, msg) {
  await ensureStateTable(env);
  const req = await env.DB.prepare('SELECT * FROM card_requests WHERE chat_id = ? AND status = \'waiting\' ORDER BY id DESC LIMIT 1').bind(msg.chat.id).first();
  if (!req) return false;
  const kind = msg.photo ? 'photo' : 'document';
  const fileId = msg.photo ? msg.photo[msg.photo.length - 1].file_id : msg.document.file_id;
  const caption = [
    '💳 <b>Yangi to\'lov cheki</b>',
    '',
    `👤 ${esc(req.name || '')} · ID: <code>${req.chat_id}</code>`,
    `📅 ${cardPlanName(req.plan)}`,
    `💰 <b>${som(req.amount)}</b>`,
    `🕐 ${tashkentTime()}`,
    '',
    '⚠️ <i>Avval kartangizga pul tushganini tekshiring!</i>',
  ].join('\n');
  const sent = await tg.sendFile(env.ADMIN_ID, kind, fileId, caption, {
    reply_markup: { inline_keyboard: [[
      { text: '✅ Tasdiqlash', callback_data: `cr_ok:${req.id}` },
      { text: '❌ Rad etish', callback_data: `cr_no:${req.id}` },
    ]] },
  });
  await env.DB.prepare('UPDATE card_requests SET status = \'pending\', file_id = ?, file_kind = ?, admin_msg = ? WHERE id = ?')
    .bind(fileId, kind, sent.message_id, req.id).run();
  await tg.send(msg.chat.id, [
    '✅ <b>Chek qabul qilindi!</b>',
    '',
    'To\'lov tekshirilgach, premium yoqiladi va sizga xabar beraman. ⏳',
  ].join('\n'));
  return true;
}

// Admin "✅ Tasdiqlash" / "❌ Rad etish" / sabab tugmalari
async function cardDecision(tg, env, cq) {
  const [action, idStr, reasonId] = cq.data.split(':');
  const id = Number(idStr);
  const chatId = cq.message.chat.id;
  const messageId = cq.message.message_id;
  await ensureStateTable(env);
  const req = await env.DB.prepare('SELECT * FROM card_requests WHERE id = ?').bind(id).first();
  if (!req || req.status !== 'pending') return tg.answerCallback(cq.id, 'Bu chek allaqachon ko\'rib chiqilgan');
  const baseCaption = cq.message.caption ? esc(cq.message.caption) : '💳 Chek';

  if (action === 'cr_no') {
    // Sababni tanlash tugmalari
    await tg.answerCallback(cq.id);
    return tg.call('editMessageReplyMarkup', {
      chat_id: chatId, message_id: messageId,
      reply_markup: { inline_keyboard: [
        ...Object.entries(CARD_REJECT_REASONS).map(([k, v]) => [{ text: `❌ ${v}`, callback_data: `cr_r:${id}:${k}` }]),
        [{ text: '⬅️ Orqaga', callback_data: `cr_back:${id}` }],
      ] },
    });
  }
  if (action === 'cr_back') {
    await tg.answerCallback(cq.id);
    return tg.call('editMessageReplyMarkup', {
      chat_id: chatId, message_id: messageId,
      reply_markup: { inline_keyboard: [[
        { text: '✅ Tasdiqlash', callback_data: `cr_ok:${id}` },
        { text: '❌ Rad etish', callback_data: `cr_no:${id}` },
      ]] },
    });
  }
  if (action === 'cr_r') {
    const reason = CARD_REJECT_REASONS[reasonId] || 'To\'lov tasdiqlanmadi';
    // Foydalanuvchi qayta chek yuborishi mumkin bo'lsin
    await env.DB.prepare('UPDATE card_requests SET status = \'waiting\', decided_at = datetime(\'now\') WHERE id = ?').bind(id).run();
    await tg.send(req.chat_id, [
      '❌ <b>To\'lov tasdiqlanmadi</b>',
      '',
      `Sabab: <b>${reason}</b>`,
      '',
      `Iltimos, tekshirib, to'g'ri chekni qayta yuboring. Summa: <b>${som(req.amount)}</b>`,
      `💳 Karta: <b><code>${cardPretty(env)}</code></b>`,
    ].join('\n'), { reply_markup: cardKeyboard(env, req.amount) }).catch(() => {});
    await tg.answerCallback(cq.id, 'Rad etildi');
    return tg.editCaption(chatId, messageId, `${baseCaption}\n\n❌ <b>Rad etildi:</b> ${reason}`);
  }
  if (action === 'cr_ok') {
    const row = await env.DB.prepare('SELECT until FROM premium WHERE chat_id = ?').bind(req.chat_id).first();
    const current = row ? fromSql(row.until) : null;
    const now = new Date();
    const base = current && current > now ? current : now; // qolgan kunlarga qo'shiladi
    const until = new Date(base.getTime() + (req.plan === 'year' ? 365 : 30) * DAY);
    const plan = req.plan === 'year' ? 'card_year' : 'card_month';
    await env.DB.batch([
      env.DB.prepare('INSERT INTO premium (chat_id, until, charge_id, plan, reminded) VALUES (?, ?, ?, ?, 0) ON CONFLICT(chat_id) DO UPDATE SET until = excluded.until, charge_id = excluded.charge_id, plan = excluded.plan, reminded = 0, updated_at = datetime(\'now\')')
        .bind(req.chat_id, toSql(until), `card:${id}`, plan),
      env.DB.prepare('UPDATE card_requests SET status = \'approved\', decided_at = datetime(\'now\') WHERE id = ?').bind(id),
    ]);
    await tg.send(req.chat_id, [
      '🎉 <b>To\'lovingiz tasdiqlandi!</b>',
      '',
      `✅ Premium yoqildi: <b>${dateUz(until)}</b> gacha.`,
      `💱 ${PREMIUM_COUNT} ta qo'shimcha valyuta ochildi. <b>⭐ Premium tarif</b> bo'limini ochib ko'ring.`,
      '',
      '<i>Muddat tugashidan 3 kun oldin eslatib qo\'yaman.</i>',
    ].join('\n'), { reply_markup: MAIN_MENU }).catch(() => {});
    await tg.answerCallback(cq.id, '✅ Tasdiqlandi');
    return tg.editCaption(chatId, messageId, `${baseCaption}\n\n✅ <b>Tasdiqlandi:</b> premium ${dateUz(until)} gacha`);
  }
  return tg.answerCallback(cq.id);
}

// ---------- To'lovni qaytarish (faqat admin) ----------
const planName = (row, env) => (row.plan || (row.amount >= yearPrice(env) ? 'year' : 'month')) === 'year' ? 'yillik' : 'oylik';

async function lastPayment(env, userId) {
  await ensureStateTable(env);
  return env.DB.prepare(
    'SELECT charge_id, chat_id, amount, recurring, plan, created_at FROM payments WHERE chat_id = ? AND refunded = 0 ORDER BY created_at DESC LIMIT 1'
  ).bind(userId).first();
}

// /refund — oxirgi to'lovlar ro'yxati; /refund <ID> — tasdiqlash so'rovi
async function refundCommand(tg, env, chatId, args) {
  const userId = Number(args.trim());
  if (!args.trim()) {
    await ensureStateTable(env);
    const { results } = await env.DB.prepare(
      'SELECT chat_id, amount, plan, created_at FROM payments WHERE refunded = 0 ORDER BY created_at DESC LIMIT 10'
    ).all();
    const lines = results.map((r) => `• <code>${r.chat_id}</code>: ${r.amount} ⭐ (${planName(r, env)}), ${dateUz(fromSql(r.created_at))}`);
    return tg.send(chatId, [
      '💳 <b>To\'lovni qaytarish</b>',
      '',
      'Foydalanish: <code>/refund ID</code>',
      '',
      results.length ? '<b>Oxirgi to\'lovlar:</b>' : '<i>Hali to\'lovlar yo\'q.</i>',
      ...lines,
    ].join('\n'));
  }
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return tg.send(chatId, '⚠️ ID noto\'g\'ri. Masalan: <code>/refund 123456789</code>');
  }
  const pay = await lastPayment(env, userId);
  if (!pay) return tg.send(chatId, `⚠️ <code>${userId}</code> uchun qaytariladigan to'lov topilmadi.`);
  const days = Math.floor((Date.now() - fromSql(pay.created_at).getTime()) / DAY);
  return tg.send(chatId, [
    '💳 <b>To\'lovni qaytarish</b>',
    '',
    `👤 Foydalanuvchi: <code>${userId}</code>`,
    `⭐ To'lov: <b>${pay.amount} ⭐</b> (${planName(pay, env)}), ${dateUz(fromSql(pay.created_at))}`,
    `⏱ To'lovga <b>${days} kun</b> bo'lgan`,
    '',
    'Qaytarilsa: yulduzlar qaytadi, obuna to\'xtaydi, premium o\'chadi.',
  ].join('\n'), {
    reply_markup: { inline_keyboard: [[
      { text: '✅ Qaytarish', callback_data: `rf_ok:${userId}` },
      { text: '❌ Bekor qilish', callback_data: 'rf_no' },
    ]] },
  });
}

async function refundConfirm(tg, env, cq) {
  const userId = Number(cq.data.split(':')[1]);
  const chatId = cq.message.chat.id;
  const messageId = cq.message.message_id;
  const pay = await lastPayment(env, userId);
  if (!pay) {
    await tg.answerCallback(cq.id);
    return tg.edit(chatId, messageId, `⚠️ <code>${userId}</code> uchun qaytariladigan to'lov topilmadi (balki allaqachon qaytarilgan).`);
  }
  // Oylik obuna bo'lsa, keyingi oylarda avtomatik yechilishini to'xtatamiz
  if (planName(pay, env) === 'oylik') {
    try {
      await tg.call('editUserStarSubscription', { user_id: userId, telegram_payment_charge_id: pay.charge_id, is_canceled: true });
    } catch (e) { console.error('Obunani to\'xtatib bo\'lmadi', e.message); }
  }
  try {
    await tg.call('refundStarPayment', { user_id: userId, telegram_payment_charge_id: pay.charge_id });
  } catch (e) {
    await tg.answerCallback(cq.id, '❌ Xato');
    return tg.edit(chatId, messageId, `❌ <b>Qaytarib bo'lmadi:</b> ${esc(e.description || e.message)}`);
  }
  await env.DB.batch([
    env.DB.prepare('UPDATE payments SET refunded = 1 WHERE charge_id = ?').bind(pay.charge_id),
    env.DB.prepare('DELETE FROM premium WHERE chat_id = ?').bind(userId),
  ]);
  await tg.send(userId, [
    '💳 <b>To\'lovingiz qaytarildi</b>',
    '',
    `⭐ ${pay.amount} ⭐ hisobingizga qaytdi.`,
    'Premium o\'chirildi.',
  ].join('\n')).catch(() => {});
  await tg.answerCallback(cq.id, '✅ Qaytarildi');
  return tg.edit(chatId, messageId, `✅ <b>${pay.amount} ⭐ qaytarildi</b> (<code>${userId}</code>). Obuna to'xtatildi, premium o'chirildi.`);
}

// ---------- Statistika ----------
async function trackChat(env, chat) {
  if (!chat) return;
  await ensureStateTable(env);
  const name = chat.title || chat.first_name || null;
  await env.DB.prepare(
    'INSERT INTO users (chat_id, type, name) VALUES (?, ?, ?) ON CONFLICT(chat_id) DO UPDATE SET last_seen = datetime(\'now\'), name = excluded.name'
  ).bind(chat.id, chat.type === 'private' ? 'private' : 'group', name).run();
}

function isAdmin(env, userId) {
  return !!env.ADMIN_ID && String(userId) === String(env.ADMIN_ID).trim();
}

async function statsText(env) {
  await ensureStateTable(env);
  const r = await env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM users WHERE type = 'private') AS total,
    (SELECT COUNT(*) FROM users WHERE type = 'private' AND date(created_at, '+5 hours') = date('now', '+5 hours')) AS today,
    (SELECT COUNT(*) FROM users WHERE type = 'private' AND last_seen >= datetime('now', '-7 days')) AS active7,
    (SELECT COUNT(*) FROM users WHERE type = 'group') AS groups,
    (SELECT COUNT(*) FROM subscribers WHERE chat_id > 0) AS subs,
    (SELECT COUNT(*) FROM subscribers WHERE chat_id < 0) AS group_subs,
    (SELECT COUNT(*) FROM premium WHERE until > datetime('now')) AS premium,
    (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE refunded = 0) AS stars,
    (SELECT COUNT(*) FROM card_requests WHERE status = 'approved') AS card_count,
    (SELECT COALESCE(SUM(amount), 0) FROM card_requests WHERE status = 'approved') AS card_sum,
    (SELECT COUNT(*) FROM card_requests WHERE status = 'pending') AS card_pending`).first();
  const n = (x) => money(Number(x) || 0, 0);
  return [
    `📊 <b>${boldSans('Bot statistikasi')}</b>`,
    '',
    `👥 Jami foydalanuvchilar: <b>${n(r.total)}</b>`,
    `🆕 Bugun qo'shilganlar: <b>${n(r.today)}</b>`,
    `🔥 Oxirgi 7 kunda faol: <b>${n(r.active7)}</b>`,
    `🔔 Kunlik obunachilar: <b>${n(r.subs)}</b>`,
    `👨‍👩‍👧 Guruhlar: <b>${n(r.groups)}</b> (obuna bo'lgan: ${n(r.group_subs)})`,
    `⭐ Premium: <b>${n(r.premium)}</b> (Stars: ${n(r.stars)} ⭐)`,
    `💳 Karta: <b>${n(r.card_count)} ta</b>, ${n(r.card_sum)} so'm${Number(r.card_pending) ? ` (⏳ ${n(r.card_pending)} ta chek kutmoqda)` : ''}`,
    '',
    `<i>🕐 ${tashkentTime()} holatiga</i>`,
  ].join('\n');
}

// Botning username'i (guruhga qo'shish havolasi va guruh buyruqlari uchun)
let botUsernameCache = null;
async function botUsername(tg) {
  if (!botUsernameCache) botUsernameCache = (await tg.call('getMe')).username;
  return botUsernameCache;
}

async function getConvertCurrency(env, chatId) {
  await ensureStateTable(env);
  const row = await env.DB.prepare('SELECT currency FROM convert_state WHERE chat_id = ?').bind(chatId).first();
  return row?.currency || null;
}

async function setConvertCurrency(env, chatId, code) {
  await ensureStateTable(env);
  await env.DB.prepare(
    'INSERT INTO convert_state (chat_id, currency) VALUES (?, ?) ON CONFLICT(chat_id) DO UPDATE SET currency = excluded.currency, updated_at = datetime(\'now\')'
  ).bind(chatId, code).run();
}

// ---------- Obuna (D1 bazasi) ----------
function todayTashkent() {
  return new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}

async function toggleSubscription(env, chatId, firstName, inGroup = false) {
  const existing = await env.DB.prepare('SELECT chat_id FROM subscribers WHERE chat_id = ?').bind(chatId).first();
  if (existing) {
    await env.DB.prepare('DELETE FROM subscribers WHERE chat_id = ?').bind(chatId).run();
    return [
      '🔕 <b>Kunlik obuna bekor qilindi.</b>',
      '',
      inGroup ? 'Qayta yoqish uchun /obuna yozing.' : 'Qayta yoqish uchun <b>🔔 Kunlik obuna</b> tugmasini bosing.',
    ].join('\n');
  }
  await env.DB.prepare('INSERT INTO subscribers (chat_id, first_name, last_sent) VALUES (?, ?, ?)')
    .bind(chatId, firstName || null, todayTashkent()).run();
  return [
    inGroup ? '✅ <b>Ajoyib!</b> Guruh kunlik obunaga yozildi.' : '✅ <b>Ajoyib!</b> Siz kunlik obunaga yozildingiz.',
    '',
    `⏰ Har kuni soat <b>8:00</b> da kursni ${inGroup ? 'guruhga' : 'o\'zim'} yuboraman.`,
    inGroup ? '🔕 Bekor qilish uchun /obuna ni yana yozing.' : '🔕 Bekor qilish uchun tugmani yana bosing.',
  ].join('\n');
}

// ---------- Kiruvchi xabarlarni qayta ishlash ----------
async function handleMessage(tg, env, msg) {
  const chatId = msg.chat.id;
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
  const text = (msg.text || '').trim();
  const firstName = msg.from?.first_name;
  // "/k@bot_nomi 100 dollar" -> cmd = "/k", args = "100 dollar"
  const m = text.match(/^\/([a-zA-Z0-9_]+)(?:@([a-zA-Z0-9_]+))?(?:\s+([\s\S]*))?$/);
  const cmd = m ? '/' + m[1].toLowerCase() : null;
  const args = m?.[3]?.trim() || '';

  // Buyruq boshqa botga yozilgan bo'lsa (masalan /kurs@boshqa_bot), e'tibor bermaymiz
  if (m?.[2] && m[2].toLowerCase() !== (await botUsername(tg)).toLowerCase()) return;

  await trackChat(env, msg.chat);

  if (msg.successful_payment) return handlePayment(tg, env, msg);
  if (msg.refunded_payment) return; // Telegram'ning "to'lov qaytarildi" xizmat xabari
  if (cmd === '/paysupport') {
    return tg.send(chatId, [
      '💳 <b>To\'lov bo\'yicha yordam</b>',
      '',
      `Savol yoki muammo bo'lsa, <a href="tg://user?id=${env.ADMIN_ID}">adminga yozing</a>.`,
      'Obunani bekor qilish: Telegram → Sozlamalar → Telegram Stars.',
    ].join('\n'));
  }

  if (cmd === '/id') {
    return tg.send(chatId, `🆔 Sizning Telegram ID'ingiz: <code>${msg.from?.id}</code>`);
  }
  if (cmd === '/stat' && isAdmin(env, msg.from?.id)) {
    return tg.send(chatId, await statsText(env));
  }

  if (isGroup) return handleGroupMessage(tg, env, msg, cmd, args);

  if (cmd === '/refund' && isAdmin(env, msg.from?.id)) return refundCommand(tg, env, chatId, args);

  // Karta orqali to'lov cheki (rasm yoki rasm-fayl)
  const isImageDoc = msg.document && /^image\//.test(msg.document.mime_type || '');
  if ((msg.photo || isImageDoc) && cardEnabled(env) && await handleReceipt(tg, env, msg)) return;

  if (text === BTN.PREMIUM) return sendPremiumInfo(tg, env, chatId, msg.from?.id);
  if (text === BTN.ADD_GROUP || text === OLD_ADD_GROUP) {
    const username = await botUsername(tg);
    return tg.send(chatId, [
      '👥 <b>Botni guruhga qo\'shing!</b>',
      '',
      'Pastdagi tugmani bosing va guruhni tanlang.',
      'Guruhda <code>/kurs</code> yozilsa, hammaga bugungi kursni ko\'rsataman.',
    ].join('\n'), {
      reply_markup: { inline_keyboard: [[{ text: '➕ Guruhni tanlash', url: `https://t.me/${username}?startgroup=true` }]] },
    });
  }

  if (cmd === '/start') {
    return tg.send(chatId, welcomeText(firstName), { reply_markup: MAIN_MENU });
  }
  if (cmd === '/yordam' || cmd === '/help' || text === BTN.HELP) {
    return tg.send(chatId, helpText(), { reply_markup: MAIN_MENU });
  }
  const premium = await isPremium(env, msg.from?.id);
  if (cmd === '/premium') return sendPremiumInfo(tg, env, chatId, msg.from?.id);
  if (cmd === '/kurs' || text === BTN.RATES) {
    return tg.send(chatId, await ratesText(await getRates(), premium), { reply_markup: ratesInline(premium) });
  }
  if (cmd === '/obuna' || text === BTN.SUBSCRIBE) {
    return tg.send(chatId, await toggleSubscription(env, chatId, firstName), { reply_markup: MAIN_MENU });
  }
  if ((cmd === '/konvert' || cmd === '/k') && !args || text === BTN.CONVERT) {
    return tg.send(chatId, convertHelpText(), { reply_markup: convertKeyboard(await getConvertCurrency(env, chatId)) });
  }

  const req = (cmd === '/konvert' || cmd === '/k') ? parseConvert(args) : (text && !cmd ? parseConvert(text) : null);
  if (req) {
    if (req.from) {
      if (isPremiumCurrency(req.from) && !premium) return sendPremiumInfo(tg, env, chatId, msg.from?.id);
      await setConvertCurrency(env, chatId, req.from); // "50 eur" yozsa, keyingi sonlar ham yevroda hisoblanadi
    } else {
      req.from = (await getConvertCurrency(env, chatId)) || 'USD';
      if (isPremiumCurrency(req.from) && !premium) return sendPremiumInfo(tg, env, chatId, msg.from?.id); // Premium tugagan
    }
    return tg.send(chatId, convertText(await getRates(), req, false, premium), { reply_markup: convertKeyboard(req.from) });
  }

  return tg.send(chatId, [
    unknownIntro(msg),
    '',
    'Men valyuta kursini ko\'rsataman va hisoblayman. Masalan, yozing: <code>100 dollar</code>',
    'Yoki quyidagi tugmalardan birini tanlang 👇',
  ].join('\n'), { reply_markup: MENU_INLINE });
}

// ---------- Guruhlar ----------
// Guruhda bot faqat buyruqlarga javob beradi va hech qachon "tushunmadim" deb yozmaydi
async function handleGroupMessage(tg, env, msg, cmd, args) {
  const chatId = msg.chat.id;
  const reply = { reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true } };

  // Bot guruhga qo'shilganda salomlashadi
  if (msg.new_chat_members?.length) {
    const me = (await botUsername(tg)).toLowerCase();
    if (msg.new_chat_members.some((u) => u.username?.toLowerCase() === me)) {
      return tg.send(chatId, groupHelpText());
    }
    return;
  }
  if (!cmd) return;

  if (cmd === '/start' || cmd === '/yordam' || cmd === '/help') {
    return tg.send(chatId, groupHelpText(), reply);
  }
  const premium = await isPremium(env, msg.from?.id);
  if (cmd === '/kurs') {
    return tg.send(chatId, await ratesText(await getRates(), premium), { ...reply, reply_markup: RATES_INLINE_GROUP });
  }
  if (cmd === '/k' || cmd === '/konvert') {
    const req = args ? parseConvert(args) : null;
    if (!req) {
      return tg.send(chatId, '✏️ Summa va valyutani yozing, masalan: <code>/k 100 dollar</code>', reply);
    }
    req.from = req.from || 'USD';
    if (isPremiumCurrency(req.from) && !premium) {
      return tg.send(chatId, `⭐ <b>${req.from}</b> Premium valyuta. Premium olish uchun botga shaxsiy chatda /premium yozing.`, reply);
    }
    return tg.send(chatId, convertText(await getRates(), req, true, premium), reply);
  }
  if (cmd === '/obuna') {
    if (!(await isGroupAdmin(tg, msg))) {
      return tg.send(chatId, '🔒 Guruh uchun kunlik obunani faqat <b>adminlar</b> yoqishi yoki o\'chirishi mumkin.', reply);
    }
    return tg.send(chatId, await toggleSubscription(env, chatId, msg.chat.title, true), reply);
  }
}

async function isGroupAdmin(tg, msg) {
  if (msg.sender_chat?.id === msg.chat.id) return true; // anonim admin
  if (!msg.from) return false;
  try {
    const member = await tg.call('getChatMember', { chat_id: msg.chat.id, user_id: msg.from.id });
    return member.status === 'creator' || member.status === 'administrator';
  } catch {
    return false;
  }
}

// Tushunarsiz xabarga, turiga qarab, birinchi qator
function unknownIntro(msg) {
  if (msg.sticker) return '😊 <b>Stiker yoqdi!</b> Lekin men faqat valyuta kursi bilan ishlayman.';
  if (msg.photo || msg.video || msg.animation) return '📷 <b>Men rasm va videolarni ko\'ra olmayman.</b>';
  if (msg.voice || msg.video_note || msg.audio) return '🎤 <b>Ovozli xabarni tinglay olmayman</b>, iltimos yozib yuboring.';
  if (msg.document) return '📄 <b>Men fayllarni o\'qiy olmayman.</b>';
  if (msg.text) return '🤔 <b>Kechirasiz, buni tushunmadim.</b>';
  return '🤷 <b>Bu turdagi xabarni tushunmayman.</b>';
}

async function handleCallback(tg, env, cq) {
  const chatId = cq.message?.chat.id;
  const messageId = cq.message?.message_id;
  const inGroup = cq.message?.chat.type !== 'private';
  await trackChat(env, cq.message?.chat);

  const premium = await isPremium(env, cq.from?.id);

  if (cq.data === 'refresh') {
    try {
      await tg.edit(chatId, messageId, await ratesText(await getRates(), inGroup ? false : premium), { reply_markup: inGroup ? RATES_INLINE_GROUP : ratesInline(premium) });
      return tg.answerCallback(cq.id, '✅ Kurs yangilandi');
    } catch (e) {
      if (String(e.description).includes('not modified')) return tg.answerCallback(cq.id, 'Kurs o\'zgarmagan');
      throw e;
    }
  }
  if (cq.data === 'convert_help') {
    await tg.answerCallback(cq.id);
    return tg.send(chatId, convertHelpText(), { reply_markup: convertKeyboard(await getConvertCurrency(env, chatId)) });
  }
  if (cq.data === 'card_pay') {
    await tg.answerCallback(cq.id);
    if (!cardEnabled(env)) return tg.send(chatId, '⚠️ Karta orqali to\'lov hozircha mavjud emas.');
    return tg.send(chatId, cardChooseText(env), {
      reply_markup: { inline_keyboard: [[
        { text: `📅 Oylik: ${som(cardPrice(env, 'month'))}`, callback_data: 'card_month' },
        { text: `🗓 Yillik: ${som(cardPrice(env, 'year'))}`, callback_data: 'card_year' },
      ]] },
    });
  }
  if (cq.data === 'card_month' || cq.data === 'card_year') {
    await tg.answerCallback(cq.id);
    if (!cardEnabled(env)) return tg.send(chatId, '⚠️ Karta orqali to\'lov hozircha mavjud emas.');
    return startCardRequest(tg, env, chatId, cq.from, cq.data === 'card_year' ? 'year' : 'month');
  }
  if (cq.data === 'card_cancel') {
    await ensureStateTable(env);
    await env.DB.prepare('DELETE FROM card_requests WHERE chat_id = ? AND status = \'waiting\'').bind(chatId).run();
    await tg.answerCallback(cq.id, 'Bekor qilindi');
    return tg.send(chatId, '❌ Karta orqali to\'lov bekor qilindi.');
  }
  if (/^cr_(ok|no|r|back):/.test(cq.data || '')) {
    if (!isAdmin(env, cq.from?.id)) return tg.answerCallback(cq.id);
    return cardDecision(tg, env, cq);
  }
  if (cq.data?.startsWith('rf_')) {
    if (!isAdmin(env, cq.from?.id)) return tg.answerCallback(cq.id);
    if (cq.data === 'rf_no') {
      await tg.answerCallback(cq.id);
      return tg.edit(chatId, messageId, '❌ Qaytarish bekor qilindi.');
    }
    return refundConfirm(tg, env, cq);
  }
  if (cq.data === 'premium_list') {
    await tg.answerCallback(cq.id);
    return tg.send(chatId, fullListText());
  }
  if (cq.data === 'rates_all') { // eski xabarlardagi tugma uchun
    await tg.answerCallback(cq.id);
    return sendPremiumInfo(tg, env, chatId, cq.from?.id);
  }
  if (cq.data === 'refresh_premium') {
    const until = await premiumUntil(env, cq.from?.id);
    if (!until) {
      await tg.answerCallback(cq.id);
      return sendPremiumInfo(tg, env, chatId, cq.from?.id);
    }
    try {
      await tg.edit(chatId, messageId, premiumRatesText(await getRates(), until), { reply_markup: cq.message.reply_markup });
      return tg.answerCallback(cq.id, '✅ Kurs yangilandi');
    } catch (e) {
      if (String(e.description).includes('not modified')) return tg.answerCallback(cq.id, 'Kurs o\'zgarmagan');
      throw e;
    }
  }
  if (cq.data === 'premium_info') {
    await tg.answerCallback(cq.id);
    return sendPremiumInfo(tg, env, chatId, cq.from?.id);
  }
  if (cq.data === 'conv_more') {
    await tg.answerCallback(cq.id);
    if (!premium) return sendPremiumInfo(tg, env, chatId, cq.from?.id);
    const current = await getConvertCurrency(env, chatId);
    return tg.send(chatId, `⭐ <b>${boldSans('Boshqa valyutalar')}</b>\n\nQaysi valyutani hisoblaymiz? 👇`, { reply_markup: premiumConvertKeyboard(current) });
  }
  if (cq.data?.startsWith('conv_')) {
    const code = cq.data.slice(5);
    if (code !== 'UZS' && !ALL_CURRENCIES[code]) return tg.answerCallback(cq.id);
    if (isPremiumCurrency(code) && !premium) {
      await tg.answerCallback(cq.id);
      return sendPremiumInfo(tg, env, chatId, cq.from?.id);
    }
    await setConvertCurrency(env, chatId, code);
    await tg.answerCallback(cq.id, '✅ Tanlandi. Endi summani yozing');
    return tg.send(chatId, convertChosenText(await getRates(), code), { reply_markup: convertKeyboard(code) });
  }
  if (cq.data === 'menu_rates') {
    await tg.answerCallback(cq.id);
    return tg.send(chatId, await ratesText(await getRates(), premium), { reply_markup: ratesInline(premium) });
  }
  if (cq.data === 'menu_sub') {
    await tg.answerCallback(cq.id);
    return tg.send(chatId, await toggleSubscription(env, chatId, cq.from?.first_name), { reply_markup: MAIN_MENU });
  }
  if (cq.data === 'menu_help') {
    await tg.answerCallback(cq.id);
    return tg.send(chatId, helpText(), { reply_markup: MAIN_MENU });
  }
  return tg.answerCallback(cq.id);
}

// ---------- Kunlik yuborish (cron) ----------
// Cron soat 8:00–8:59 (Toshkent) oralig'ida har daqiqada ishlaydi.
// Har safar bugun hali xabar olmagan obunachilardan bir guruhiga yuboradi.
export async function sendDaily(env) {
  const tg = new Telegram(env.BOT_TOKEN, env.TELEGRAM_API);
  const today = todayTashkent();
  let batch = Number(env.DAILY_BATCH) || DEFAULT_BATCH;
  await ensureStateTable(env);
  batch -= await sendYearReminders(tg, env, 5) * 2; // eslatmalar ham tashqi so'rovlar limitiga kiradi

  await ensureStateTable(env);
  const { results } = await env.DB.prepare(
    `SELECT s.chat_id, (p.until > datetime('now')) AS prem FROM subscribers s
     LEFT JOIN premium p ON p.chat_id = s.chat_id
     WHERE s.last_sent IS NULL OR s.last_sent < ? ORDER BY s.chat_id LIMIT ?`
  ).bind(today, batch).all();
  if (!results.length) return { sent: 0, removed: 0 };

  const rates = await getRates();
  const weekDiff = await weeklyUsdDiff(rates);

  let sent = 0, removed = 0;
  for (const { chat_id, prem } of results) {
    const premium = !!prem || isAdmin(env, chat_id);
    try {
      await tg.send(chat_id, morningText(rates, weekDiff, premium), { reply_markup: chat_id < 0 ? RATES_INLINE_GROUP : ratesInline(premium) });
      sent++;
    } catch (e) {
      // Bot bloklangan yoki chat o'chirilgan bo'lsa, obunachini ro'yxatdan olib tashlaymiz
      if (e.code === 403 || /chat not found|user is deactivated/i.test(e.description)) {
        await env.DB.prepare('DELETE FROM subscribers WHERE chat_id = ?').bind(chat_id).run();
        removed++;
        continue;
      }
      console.error('Yuborishda xato', chat_id, e.message);
    }
    await env.DB.prepare('UPDATE subscribers SET last_sent = ? WHERE chat_id = ?').bind(today, chat_id).run();
    await new Promise((r) => setTimeout(r, 50)); // Telegram limiti: sekundiga ~30 xabar
  }
  return { sent, removed };
}

// ---------- Bir martalik sozlash ----------
async function setup(request, env) {
  const tg = new Telegram(env.BOT_TOKEN, env.TELEGRAM_API);
  const origin = new URL(request.url).origin;

  await tg.call('setWebhook', {
    url: `${origin}/webhook`,
    secret_token: env.WEBHOOK_SECRET.trim(),
    allowed_updates: ['message', 'callback_query', 'pre_checkout_query'],
    drop_pending_updates: true,
  });
  await tg.call('setMyCommands', {
    commands: [
      { command: 'start', description: 'Botni boshlash' },
      { command: 'kurs', description: 'Bugungi kurs' },
      { command: 'konvert', description: 'Konvertatsiya' },
      { command: 'obuna', description: 'Kunlik obuna' },
      { command: 'premium', description: `⭐ Premium: ${PREMIUM_COUNT} ta valyuta` },
      { command: 'yordam', description: 'Yordam' },
    ],
  });
  await tg.call('setMyCommands', {
    scope: { type: 'all_group_chats' },
    commands: [
      { command: 'kurs', description: 'Bugungi kurs' },
      { command: 'k', description: 'Konvertatsiya: /k 100 dollar' },
      { command: 'obuna', description: 'Guruhga kunlik kurs (adminlar)' },
      { command: 'yordam', description: 'Yordam' },
    ],
  });
  // Botni birinchi marta ochganda bo'sh ekranda chiqadigan matn
  await tg.call('setMyDescription', {
    description: [
      `💵 ${boldSans('Dollar Kursi')}`,
      '',
      'Markaziy bankning rasmiy kurslari:',
      '✅ USD, EUR, RUB kurslari',
      '🔄 Tez konvertatsiya',
      '🔔 Har kuni ertalab kurs xabari',
      '',
      'Boshlash uchun START tugmasini bosing 👇',
    ].join('\n'),
  });
  await tg.call('setMyShortDescription', {
    short_description: '💵 CBU rasmiy kurslari, konvertatsiya va kunlik xabar\n👨‍💻 Developer: @Aliyevvv_a',
  });

  const me = await tg.call('getMe');
  return new Response(`✅ Tayyor! Bot @${me.username} ulandi.\nWebhook: ${origin}/webhook\nEndi Telegram'da botga /start yozing.`, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

// ---------- Worker kirish nuqtasi ----------
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (!env.BOT_TOKEN || !env.WEBHOOK_SECRET) {
      return new Response('BOT_TOKEN va WEBHOOK_SECRET sozlanmagan (README ga qarang)', { status: 500 });
    }

    if (url.pathname === '/setup') {
      const expected = env.WEBHOOK_SECRET.trim();
      const given = (url.searchParams.get('key') || '').trim();
      if (given !== expected) {
        // Kalitning o'zini ko'rsatmaymiz, faqat nima noto'g'ri ekanini aytamiz
        const hint = !given
          ? "Manzil oxirida ?key=... yo'q."
          : given === 'WEBHOOK_SECRET'
            ? "key= dan keyin kalit NOMI emas, uning QIYMATI yozilishi kerak."
            : `Siz yozgan kalit ${given.length} belgi, Cloudflare'dagi WEBHOOK_SECRET esa ${expected.length} belgi.`;
        return new Response(`Ruxsat yo'q: kalit mos kelmadi.\n${hint}`, {
          status: 403,
          headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
        });
      }
      if (!/^[A-Za-z0-9_-]{1,256}$/.test(expected)) {
        return new Response("WEBHOOK_SECRET da faqat lotin harflari, raqamlar, - va _ bo'lishi mumkin. Cloudflare'da uni o'zgartiring.", {
          status: 400,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      try {
        return await setup(request, env);
      } catch (e) {
        return new Response(`❌ Xato: ${e.message}`, { status: 500 });
      }
    }

    if (url.pathname === '/webhook' && request.method === 'POST') {
      // Faqat Telegram'dan kelgan so'rovlarni qabul qilamiz
      if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET.trim()) {
        return new Response('Ruxsat yo\'q', { status: 403 });
      }
      const update = await request.json();
      const tg = new Telegram(env.BOT_TOKEN, env.TELEGRAM_API);
      try {
        if (update.pre_checkout_query) {
          // To'lovdan oldin Telegram tasdiq so'raydi: 10 soniya ichida javob berish shart
          const q = update.pre_checkout_query;
          const ok = q.currency === 'XTR' && ['premium', 'premium_year'].includes(q.invoice_payload);
          await tg.call('answerPreCheckoutQuery', ok
            ? { pre_checkout_query_id: q.id, ok: true }
            : { pre_checkout_query_id: q.id, ok: false, error_message: 'To\'lovda xatolik. Qaytadan urinib ko\'ring.' });
        } else if (update.message) await handleMessage(tg, env, update.message);
        else if (update.callback_query) await handleCallback(tg, env, update.callback_query);
      } catch (e) {
        console.error('Xabarni qayta ishlashda xato', e.message);
        const chatId = update.message?.chat.id;
        if (chatId) {
          ctx.waitUntil(tg.send(chatId, '⚠️ Kechirasiz, xatolik yuz berdi. Birozdan keyin qayta urinib ko\'ring.').catch(() => {}));
        }
      }
      return new Response('ok'); // Telegram har doim 200 javob kutadi
    }

    return new Response('💵 Dollar Kursi boti ishlayapti', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendDaily(env).then((r) => console.log('Kunlik yuborish', r)));
  },
};
