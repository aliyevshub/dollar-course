// O'zbekiston Markaziy banki (CBU) API bilan ishlash
// Hujjat: https://cbu.uz/uz/arkhiv-kursov-valyut/
const CBU_URL = 'https://cbu.uz/uz/arkhiv-kursov-valyut/json/';

// Botda ko'rsatiladigan valyutalar (tartib bilan)
export const CURRENCIES = {
  USD: { flag: '🇺🇸', name: 'AQSH dollari' },
  EUR: { flag: '🇪🇺', name: 'Yevro' },
  RUB: { flag: '🇷🇺', name: 'Rossiya rubli' },
};

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
    if (!CURRENCIES[item.Ccy]) continue;
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
