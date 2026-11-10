// Xabarlarni chiroyli ko'rinishga keltiruvchi yordamchi funksiyalar
import { CURRENCIES, ALL_CURRENCIES, parseCbuDate } from './cbu.js';

const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const WEEKDAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];

// Telegram HTML rejimi uchun matnni xavfsiz qilish
export function esc(s) {
  return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

// Sarlavhalar uchun qalin Unicode harflar: "Salom" -> "𝗦𝗮𝗹𝗼𝗺"
export function boldSans(text) {
  return [...text].map((ch) => {
    const c = ch.codePointAt(0);
    if (c >= 65 && c <= 90) return String.fromCodePoint(0x1d5d4 + c - 65);  // A-Z
    if (c >= 97 && c <= 122) return String.fromCodePoint(0x1d5ee + c - 97); // a-z
    if (c >= 48 && c <= 57) return String.fromCodePoint(0x1d7ec + c - 48);  // 0-9
    return ch;
  }).join('');
}

// 1199410.5 -> "1 199 410.50"
export function money(n, decimals = 2) {
  const [int, frac] = Math.abs(n).toFixed(decimals).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (n < 0 ? '-' : '') + grouped + (frac ? '.' + frac : '');
}

// Katta summalarda tiyinni ko'rsatmaymiz
export function smartMoney(n) {
  return money(n, Math.abs(n) >= 1000 || Number.isInteger(n) ? 0 : 2);
}

function diffBadge(diff) {
  if (diff > 0) return `🟢 +${money(diff)}`;
  if (diff < 0) return `🔴 ${money(diff)}`;
  return '⚪ 0.00';
}

// "10.11.2026" -> "10-noyabr, 2026"
export function uzDate(cbuDate, withWeekday = false) {
  const d = parseCbuDate(cbuDate);
  const base = `${d.getUTCDate()}-${MONTHS[d.getUTCMonth()]}`;
  return withWeekday ? `${base}, ${WEEKDAYS[d.getUTCDay()]}` : `${base}, ${d.getUTCFullYear()}`;
}

// Toshkent vaqti (UTC+5): "14:32"
export function tashkentTime(now = new Date()) {
  const t = new Date(now.getTime() + 5 * 3600 * 1000);
  return `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`;
}

// Kurslar jadvali (monospace blokda raqamlar tekis turadi)
export function ratesTable(rates, codes = Object.keys(CURRENCIES)) {
  // Dollar alohida qatorda, qalin va yirik raqamlar bilan (eng ko'p qidiriladigan kurs)
  let usdLine = '';
  if (codes[0] === 'USD' && rates.USD) {
    usdLine = `🇺🇸 <b>USD   ${boldSans(money(rates.USD.rate))}</b>   ${diffBadge(rates.USD.diff)}\n`;
    codes = codes.slice(1);
  }
  const rows = codes
    .filter((code) => rates[code])
    .map((code) => {
      const r = rates[code];
      return `${ALL_CURRENCIES[code].flag} ${code}  ${money(r.rate).padStart(10)}  ${diffBadge(r.diff)}`;
    });
  return usdLine + (rows.length ? `<pre>${rows.join('\n')}</pre>` : '');
}

// Dollar haqida bir qatorlik izoh
export function usdComment(rates) {
  const usd = rates.USD;
  if (!usd) return '';
  if (usd.diff > 0) return `📈 <b>Dollar</b> kechagiga nisbatan <b>${money(usd.diff)} so'm</b> qimmatladi`;
  if (usd.diff < 0) return `📉 <b>Dollar</b> kechagiga nisbatan <b>${money(-usd.diff)} so'm</b> arzonladi`;
  return `➖ <b>Dollar</b> kursi kechagidek qoldi`;
}

export function weeklyComment(weekDiff) {
  if (weekDiff == null) return '';
  const sign = weekDiff > 0 ? `🟢 <b>+${money(weekDiff)} so'm</b>` : weekDiff < 0 ? `🔴 <b>${money(weekDiff)} so'm</b>` : '⚪ <b>o\'zgarmadi</b>';
  return `📊 <b>Hafta davomida</b> dollar: ${sign}`;
}
