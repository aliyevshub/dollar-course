// O'zbekiston Markaziy banki (CBU) API bilan ishlash
// Hujjat: https://cbu.uz/uz/arkhiv-kursov-valyut/
const CBU_URL = 'https://cbu.uz/uz/arkhiv-kursov-valyut/json/';

// Bepul valyutalar (tartib bilan)
export const CURRENCIES = {
  USD: { flag: '🇺🇸', name: 'AQSH dollari' },
  EUR: { flag: '🇪🇺', name: 'Yevro' },
  RUB: { flag: '🇷🇺', name: 'Rossiya rubli' },
};

// Premium valyutalar (tartib bilan)
export const PREMIUM_CURRENCIES = {
  KZT: { flag: '🇰🇿', name: 'Qozog\'iston tengesi' },
  KGS: { flag: '🇰🇬', name: 'Qirg\'iz somi' },
  TJS: { flag: '🇹🇯', name: 'Tojik somonisi' },
  TMT: { flag: '🇹🇲', name: 'Turkman manati' },
  AFN: { flag: '🇦🇫', name: 'Afg\'on afg\'onisi' },
  TRY: { flag: '🇹🇷', name: 'Turk lirasi' },
  CNY: { flag: '🇨🇳', name: 'Xitoy yuani' },
  KRW: { flag: '🇰🇷', name: 'Koreya voni' },
  AED: { flag: '🇦🇪', name: 'BAA dirhami' },
  SAR: { flag: '🇸🇦', name: 'Saudiya riyoli' },
  GBP: { flag: '🇬🇧', name: 'Angliya funti' },
  PLN: { flag: '🇵🇱', name: 'Polsha zlotiysi' },
  AZN: { flag: '🇦🇿', name: 'Ozarbayjon manati' },
  BYN: { flag: '🇧🇾', name: 'Belarus rubli' },
  UAH: { flag: '🇺🇦', name: 'Ukraina grivnasi' },
  GEL: { flag: '🇬🇪', name: 'Gruziya larisi' },
  AMD: { flag: '🇦🇲', name: 'Armaniston drami' },
  JPY: { flag: '🇯🇵', name: 'Yaponiya iyenasi' },
  INR: { flag: '🇮🇳', name: 'Hindiston rupiyasi' },
  MYR: { flag: '🇲🇾', name: 'Malayziya ringgiti' },
  THB: { flag: '🇹🇭', name: 'Tailand bati' },
  QAR: { flag: '🇶🇦', name: 'Qatar riali' },
  KWD: { flag: '🇰🇼', name: 'Quvayt dinori' },
  EGP: { flag: '🇪🇬', name: 'Misr funti' },
  CHF: { flag: '🇨🇭', name: 'Shveytsariya franki' },
  CAD: { flag: '🇨🇦', name: 'Kanada dollari' },
  AUD: { flag: '🇦🇺', name: 'Avstraliya dollari' },
  CZK: { flag: '🇨🇿', name: 'Chexiya kronasi' },
};

// Qisqa ko'rinishda chiqadigan eng mashhur valyutalar
export const TOP_RATES = ['USD', 'EUR', 'RUB', 'KZT', 'TRY', 'CNY', 'KRW', 'AED'];
export const TOP_PREMIUM = ['KZT', 'TRY', 'CNY', 'KRW', 'AED', 'GBP'];

export const ALL_CURRENCIES = { ...CURRENCIES, ...PREMIUM_CURRENCIES };
export const isPremiumCurrency = (code) => !!PREMIUM_CURRENCIES[code];

const CACHE_SECONDS = 30 * 60; // kursni 30 daqiqa eslab qolamiz

async function fetchJson(url) {
  // Cloudflare'da natija keshlanadi, shunda har bir xabarda CBU'ga murojaat qilinmaydi
  const res = await fetch(url, { cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true } });
  if (!res.ok) throw new Error(`CBU javobi: ${res.status}`);
  return res.json();
}

// CBU javobini qulay ko'rinishga keltiradi: { USD: { rate, diff, date }, ... }
function normalize(list) {
  const out = {};
  for (const item of list) {
    if (!ALL_CURRENCIES[item.Ccy]) continue;
    const nominal = Number(item.Nominal) || 1;
    out[item.Ccy] = {
      rate: Number(item.Rate) / nominal, // 1 birlik uchun so'm
      diff: Number(item.Diff) / nominal,
      date: item.Date, // "10.11.2026"
    };
  }
  return out;
}

// Bugungi kurslar
export async function getRates() {
  return normalize(await fetchJson(CBU_URL));
}

// Ma'lum sanadagi kurslar (sana: Date obyekti)
export async function getRatesOn(date) {
  const iso = date.toISOString().slice(0, 10); // 2026-11-03
  return normalize(await fetchJson(`${CBU_URL}all/${iso}/`));
}

// "10.11.2026" -> Date (UTC)
export function parseCbuDate(s) {
  const [d, m, y] = s.split('.').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
