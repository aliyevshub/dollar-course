// Foydalanuvchi yozgan matndan konvertatsiya so'rovini ajratib olish
// Misollar: "100 usd", "100$", "$100", "50 eur", "1000 rub", "500000 so'm", "1 000 000 sum", "100"

const ALIASES = {
  USD: ['usd', '$', 'dollar', 'dollor', 'доллар', 'долл'],
  EUR: ['eur', '€', 'euro', 'evro', 'yevro', 'евро'],
  RUB: ['rub', '₽', 'rubl', 'rubl\'', 'рубль', 'руб'],
  UZS: ['uzs', 'som', 'so\'m', 'so‘m', 'soʻm', 'sum', 'сум', 'сўм', 'so`m'],
};

function findCurrency(word) {
  const w = word.toLowerCase().trim();
  if (!w) return null;
  for (const [code, list] of Object.entries(ALIASES)) {
    if (list.some((a) => w === a || (a.length > 2 && w.startsWith(a)))) return code;
  }
  return null;
}

// Natija: { amount: 100, from: 'USD' } yoki null
export function parseConvert(text) {
  const t = text.trim().replace(/\s+/g, ' ');
  // Raqam: "1 000 000", "1000000", "12.5", "12,5"
  const m = t.match(/^([^\d]*?)\s*(\d[\d\s]*(?:[.,]\d+)?)\s*(.*)$/);
  if (!m) return null;
  const amount = Number(m[2].replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e13) return null;

  const before = m[1].trim();
  const after = m[3].trim();
  if (!before && !after) return { amount, from: 'USD' }; // faqat raqam yozilsa, dollar deb olamiz

  const from = findCurrency(after) || findCurrency(before);
  return from ? { amount, from } : null;
}
