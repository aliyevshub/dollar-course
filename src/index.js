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
    `💵 <b>${boldSans('Valyuta Kursi Boti')}</b>`,
    '',
    `Assalomu alaykum, <b>${esc(firstName || 'do\'stim')}</b>! 👋`,
    '',
    'Men sizga <b>O\'zbekiston Markaziy banki</b>ning rasmiy kurslarini tez va qulay yetkazaman.',
    '',
    `<b>✨ ${boldSans('Nima qila olaman')}:</b>`,
    '💵 <b>Bugungi kurs</b>: USD, EUR, RUB',
    '🔄 <b>Konvertatsiya</b>: <code>100 usd</code> deb yozing, hisoblab beraman',
    '🔔 <b>Kunlik obuna</b>: har kuni ertalab 9:00 da kurs',
    'ℹ️ <b>Yordam</b>: barcha buyruqlar',
    '',
    '<blockquote>📅 Kurslar har kuni avtomatik yangilanadi</blockquote>',
    '',
    '👇 <i>Quyidagi tugmalardan birini tanlang:</i>',
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
    '/obuna: kunlik obunani yoqish yoki o\'chirish',
    '/yordam: shu xabar',
    '',
    '<b>Konvertatsiya misollari:</b>',
    '<code>100 usd</code>  ·  <code>50 eur</code>  ·  <code>1000 rub</code>',
    '<code>1 000 000 so\'m</code>  ·  <code>$250</code>',
    '',
    '<blockquote>🏦 Manba: O\'zbekiston Markaziy banki (cbu.uz)</blockquote>',
  ].join('\n');
}

function convertHelpText() {
  return [
    `🔄 <b>${boldSans('Konvertatsiya')}</b>`,
    '',
    'Summa va valyutani yozing, men hisoblab beraman:',
    '',
    '<code>100 usd</code>: dollarni so\'mga',
    '<code>50 eur</code>: yevroni so\'mga',
    '<code>1000 rub</code>: rublni so\'mga',
    '<code>1 000 000 so\'m</code>: so\'mni valyutalarga',
  ].join('\n');
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
  lines.push('', '💡 <i>Boshqa misollar:</i> <code>50 eur</code>, <code>1000 rub</code>, <code>1 000 000 so\'m</code>');
  return lines.join('\n');
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
    '⏰ Har kuni soat <b>9:00</b> da kursni o\'zim yuboraman.',
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
  if (text === BTN.CONVERT) {
    return tg.send(chatId, convertHelpText(), { reply_markup: MAIN_MENU });
  }

  const req = text ? parseConvert(text) : null;
  if (req) {
    return tg.send(chatId, convertText(await getRates(), req), { reply_markup: MAIN_MENU });
  }

  return tg.send(chatId, [
    '🤔 Tushunmadim.',
    '',
    'Konvertatsiya uchun summa va valyutani yozing, masalan: <code>100 usd</code>',
    'Yoki quyidagi tugmalardan birini tanlang 👇',
  ].join('\n'), { reply_markup: MAIN_MENU });
}

async function handleCallback(tg, cq) {
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
    return tg.send(chatId, convertHelpText(), { reply_markup: MAIN_MENU });
  }
  return tg.answerCallback(cq.id);
}

// ---------- Kunlik yuborish (cron) ----------
// Cron soat 9:00–9:59 (Toshkent) oralig'ida har daqiqada ishlaydi.
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
    secret_token: env.WEBHOOK_SECRET,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  });
  await tg.call('setMyCommands', {
    commands: [
      { command: 'start', description: 'Botni boshlash' },
      { command: 'kurs', description: 'Bugungi kurs' },
      { command: 'obuna', description: 'Kunlik obuna' },
      { command: 'yordam', description: 'Yordam' },
    ],
  });
  // Botni birinchi marta ochganda bo'sh ekranda chiqadigan matn
  await tg.call('setMyDescription', {
    description: [
      `💵 ${boldSans('Valyuta Kursi Boti')}`,
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

  return new Response(`✅ Tayyor! Webhook: ${origin}/webhook\nEndi Telegram'da botga /start yozing.`, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
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
      if (url.searchParams.get('key') !== env.WEBHOOK_SECRET) return new Response('Ruxsat yo\'q', { status: 403 });
      try {
        return await setup(request, env);
      } catch (e) {
        return new Response(`❌ Xato: ${e.message}`, { status: 500 });
      }
    }

    if (url.pathname === '/webhook' && request.method === 'POST') {
      // Faqat Telegram'dan kelgan so'rovlarni qabul qilamiz
      if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) {
        return new Response('Ruxsat yo\'q', { status: 403 });
      }
      const update = await request.json();
      const tg = new Telegram(env.BOT_TOKEN, env.TELEGRAM_API);
      try {
        if (update.message) await handleMessage(tg, env, update.message);
        else if (update.callback_query) await handleCallback(tg, update.callback_query);
      } catch (e) {
        console.error('Xabarni qayta ishlashda xato', e.message);
        const chatId = update.message?.chat.id;
        if (chatId) {
          ctx.waitUntil(tg.send(chatId, '⚠️ Kechirasiz, xatolik yuz berdi. Birozdan keyin qayta urinib ko\'ring.').catch(() => {}));
        }
      }
      return new Response('ok'); // Telegram har doim 200 javob kutadi
    }

    return new Response('💵 Valyuta Kursi Boti ishlayapti', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendDaily(env).then((r) => console.log('Kunlik yuborish', r)));
  },
};
