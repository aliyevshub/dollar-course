// 💵 Valyuta Kursi Boti — Cloudflare Worker
//
//  /webhook  — Telegram xabarlarni shu manzilga yuboradi
//  /setup    — webhook, buyruqlar va bot tavsifini bir marta o'rnatish
//  cron      — har kuni ertalab obunachilarga kursni yuborish
import { Telegram } from './telegram.js';
import { getRates, getRatesOn, parseCbuDate, CURRENCIES } from './cbu.js';
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
};

const MAIN_MENU = {
  keyboard: [
    [{ text: BTN.RATES }, { text: BTN.CONVERT }],
    [{ text: BTN.SUBSCRIBE }, { text: BTN.HELP }],
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

function convertKeyboard(selected) {
  const btn = ([code, label]) => ({ text: (code === selected ? '✅ ' : '') + label, callback_data: `conv_${code}` });
  return { inline_keyboard: [CONVERT_OPTIONS.slice(0, 2).map(btn), CONVERT_OPTIONS.slice(2).map(btn)] };
}

// Xabarning o'zi ostida chiqadigan tugmalar
const MENU_INLINE = {
  inline_keyboard: [
    [{ text: BTN.RATES, callback_data: 'menu_rates' }, { text: BTN.CONVERT, callback_data: 'convert_help' }],
    [{ text: BTN.SUBSCRIBE, callback_data: 'menu_sub' }, { text: BTN.HELP, callback_data: 'menu_help' }],
  ],
};

const RATES_INLINE = {
  inline_keyboard: [[
    { text: '🔄 Yangilash', callback_data: 'refresh' },
    { text: '🔄 Konvertatsiya', callback_data: 'convert_help' },
  ]],
};

// Bir cron ishga tushishida nechta obunachiga yuboriladi.
// Bepul tarifda bitta ishga tushishda 50 ta tashqi so'rov limiti bor, shuning uchun 40.
const DEFAULT_BATCH = 40;

// ---------- Xabar matnlari ----------
function welcomeText(firstName) {
  return [
    `💵 <b>${boldSans('Dollar Kursi')}</b>`,
    '',
    `Assalomu alaykum, <b>${esc(firstName || 'do\'stim')}</b>! 👋`,
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
    '📌 <b>Tugmalar</b>',
    '💵 <b>Bugungi kurs</b>: Markaziy bankning bugungi kurslari',
    '🔄 <b>Konvertatsiya</b>: summani boshqa valyutaga o\'girish',
    '🔔 <b>Kunlik obuna</b>: har kuni ertalab kursni olish (yoqish yoki o\'chirish)',
    '',
    '🔄 <b>Konvertatsiya qanday ishlaydi?</b>',
    '1️⃣ <b>Konvertatsiya</b> tugmasini bosing',
    '2️⃣ Valyutani tanlang: dollar, yevro, rubl yoki so\'m',
    '3️⃣ Summani yozing, masalan: <code>100</code>',
    '',
    '💡 <b>Tezroq usul:</b> summa va valyutani birga yozing:',
    '<code>100 dollar</code> · <code>50 yevro</code> · <code>1000 rubl</code> · <code>500000 so\'m</code>',
    '',
    '⌨️ <b>Buyruqlar</b>',
    '/kurs: bugungi kurs',
    '/konvert: konvertatsiya',
    '/obuna: kunlik obuna',
    '/yordam: yordam',
    '',
    '<blockquote>🏦 Manba: O\'zbekiston Markaziy banki (cbu.uz)</blockquote>',
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
  const label = CONVERT_OPTIONS.find(([c]) => c === code)[1];
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

async function ratesText(rates) {
  const date = rates.USD?.date;
  return [
    `📊 <b>${boldSans('Bugungi kurslar')}</b>`,
    date ? `📅 <i>${uzDate(date)}</i>` : '',
    '',
    ratesTable(rates),
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

function morningText(rates, weekDiff) {
  return [
    `☀️ <b>${boldSans('Xayrli tong!')}</b>`,
    `📅 <i>${uzDate(rates.USD.date, true)}</i>`,
    '',
    ratesTable(rates),
    weeklyComment(weekDiff),
    '',
    '<i>Kuningiz xayrli o\'tsin!</i> 🌿',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

function convertText(rates, { amount, from }) {
  const lines = [`🔄 <b>${boldSans('Konvertatsiya')}</b>`, ''];
  if (from === 'UZS') {
    lines.push(`🇺🇿 <b>${smartMoney(amount)} so'm</b> =`, '');
    for (const [code, info] of Object.entries(CURRENCIES)) {
      if (!rates[code]) continue;
      lines.push(`${info.flag} <b>${money(amount / rates[code].rate)} ${code}</b>`);
    }
  } else {
    const r = rates[from];
    lines.push(`${CURRENCIES[from].flag} <b>${smartMoney(amount)} ${from}</b> = 🇺🇿 <b>${smartMoney(amount * r.rate)} so'm</b>`);
    lines.push('', `<i>Kurs: 1 ${from} = ${money(r.rate)} so'm</i>`);
  }
  lines.push('', '✏️ <i>Yana summa yozing yoki valyutani almashtiring</i> 👇');
  return lines.join('\n');
}

// ---------- Konvertatsiya uchun tanlangan valyuta (D1) ----------
let stateTableReady = false;
async function ensureStateTable(env) {
  if (stateTableReady) return;
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS convert_state (chat_id INTEGER PRIMARY KEY, currency TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime(\'now\')))'
  ).run();
  stateTableReady = true;
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

async function toggleSubscription(env, chatId, firstName) {
  const existing = await env.DB.prepare('SELECT chat_id FROM subscribers WHERE chat_id = ?').bind(chatId).first();
  if (existing) {
    await env.DB.prepare('DELETE FROM subscribers WHERE chat_id = ?').bind(chatId).run();
    return [
      '🔕 <b>Kunlik obuna bekor qilindi.</b>',
      '',
      'Qayta yoqish uchun <b>🔔 Kunlik obuna</b> tugmasini bosing.',
    ].join('\n');
  }
  await env.DB.prepare('INSERT INTO subscribers (chat_id, first_name, last_sent) VALUES (?, ?, ?)')
    .bind(chatId, firstName || null, todayTashkent()).run();
  return [
    '✅ <b>Ajoyib!</b> Siz kunlik obunaga yozildingiz.',
    '',
    '⏰ Har kuni soat <b>8:00</b> da kursni o\'zim yuboraman.',
    '🔕 Bekor qilish uchun tugmani yana bosing.',
  ].join('\n');
}

// ---------- Kiruvchi xabarlarni qayta ishlash ----------
async function handleMessage(tg, env, msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  const firstName = msg.from?.first_name;
  const cmd = text.startsWith('/') ? text.split(/[\s@]/)[0].toLowerCase() : null;

  if (cmd === '/start') {
    return tg.send(chatId, welcomeText(firstName), { reply_markup: MAIN_MENU });
  }
  if (cmd === '/yordam' || cmd === '/help' || text === BTN.HELP) {
    return tg.send(chatId, helpText(), { reply_markup: MAIN_MENU });
  }
  if (cmd === '/kurs' || text === BTN.RATES) {
    return tg.send(chatId, await ratesText(await getRates()), { reply_markup: RATES_INLINE });
  }
  if (cmd === '/obuna' || text === BTN.SUBSCRIBE) {
    return tg.send(chatId, await toggleSubscription(env, chatId, firstName), { reply_markup: MAIN_MENU });
  }
  if (cmd === '/konvert' || text === BTN.CONVERT) {
    return tg.send(chatId, convertHelpText(), { reply_markup: convertKeyboard(await getConvertCurrency(env, chatId)) });
  }

  const req = text ? parseConvert(text) : null;
  if (req) {
    if (req.from) {
      await setConvertCurrency(env, chatId, req.from); // "50 eur" yozsa, keyingi sonlar ham yevroda hisoblanadi
    } else {
      req.from = (await getConvertCurrency(env, chatId)) || 'USD';
    }
    return tg.send(chatId, convertText(await getRates(), req), { reply_markup: convertKeyboard(req.from) });
  }

  return tg.send(chatId, [
    unknownIntro(msg),
    '',
    'Men valyuta kursini ko\'rsataman va hisoblayman. Masalan, yozing: <code>100 dollar</code>',
    'Yoki quyidagi tugmalardan birini tanlang 👇',
  ].join('\n'), { reply_markup: MENU_INLINE });
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

  if (cq.data === 'refresh') {
    try {
      await tg.edit(chatId, messageId, await ratesText(await getRates()), { reply_markup: RATES_INLINE });
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
  if (cq.data?.startsWith('conv_')) {
    const code = cq.data.slice(5);
    if (!CONVERT_OPTIONS.some(([c]) => c === code)) return tg.answerCallback(cq.id);
    await setConvertCurrency(env, chatId, code);
    await tg.answerCallback(cq.id, '✅ Tanlandi. Endi summani yozing');
    return tg.send(chatId, convertChosenText(await getRates(), code), { reply_markup: convertKeyboard(code) });
  }
  if (cq.data === 'menu_rates') {
    await tg.answerCallback(cq.id);
    return tg.send(chatId, await ratesText(await getRates()), { reply_markup: RATES_INLINE });
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
  const batch = Number(env.DAILY_BATCH) || DEFAULT_BATCH;

  const { results } = await env.DB.prepare(
    'SELECT chat_id FROM subscribers WHERE last_sent IS NULL OR last_sent < ? ORDER BY chat_id LIMIT ?'
  ).bind(today, batch).all();
  if (!results.length) return { sent: 0, removed: 0 };

  const rates = await getRates();
  const text = morningText(rates, await weeklyUsdDiff(rates));

  let sent = 0, removed = 0;
  for (const { chat_id } of results) {
    try {
      await tg.send(chat_id, text, { reply_markup: RATES_INLINE });
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
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  });
  await tg.call('setMyCommands', {
    commands: [
      { command: 'start', description: 'Botni boshlash' },
      { command: 'kurs', description: 'Bugungi kurs' },
      { command: 'konvert', description: 'Konvertatsiya' },
      { command: 'obuna', description: 'Kunlik obuna' },
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
    short_description: '💵 CBU rasmiy kurslari, konvertatsiya va kunlik xabar',
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
        if (update.message) await handleMessage(tg, env, update.message);
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
