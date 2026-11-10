// Foydalanuvchi yozgan matndan konvertatsiya so'rovini ajratib olish
// Misollar: "100 usd", "100$", "$100", "50 eur", "1000 rub", "500000 so'm", "1 000 000 sum", "100"

// Odamlar ko'p yozadigan xato va qisqa variantlar ham bor ("dolar", "долар", "rubel"...)
const ALIASES = {
  USD: ['usd', '$', 'dol', 'dlr', 'дол', 'бакс'], // "dol..." — dollar, dolar, dolr, dollr...
  EUR: ['eur', '€', 'euro', 'evro', 'yevro', 'ewro', 'евро', 'эвро', 'евр'],
  RUB: ['rub', '₽', 'rubl', 'rubel', 'ruble', 'рубль', 'рубл', 'руб'],
  UZS: ['uzs', 'som', 'so\'m', 'sum', 'сум', 'сўм', 'сом'],
  // Premium valyutalar
  KZT: ['kzt', 'tenge', 'tenga', 'тенге', 'тнг', '₸'],
  KGS: ['kgs', 'кгс'],
  TJS: ['tjs', 'somoni', 'сомони'],
  TMT: ['tmt', 'manat', 'манат'],
  AFN: ['afn', 'afgani', 'afg\'oni', 'афгани'],
  TRY: ['try', 'lira', 'лира', '₺'],
  CNY: ['cny', 'yuan', 'юань', 'rmb', 'юан'],
  KRW: ['krw', 'won', 'von', 'вон', '₩'],
  AED: ['aed', 'dirham', 'дирхам'],
  SAR: ['sar', 'riyal', 'riyol', 'риял', 'реал'],
  GBP: ['gbp', 'funt', 'pound', 'фунт', '£'],
  PLN: ['pln', 'zlot', 'злот'],
  AZN: ['azn', 'ozarbayjon', 'азн'],
  BYN: ['byn', 'belarus', 'бел'],
  UAH: ['uah', 'grivna', 'griven', 'гривн', '₴'],
  GEL: ['gel', 'lari', 'лари', '₾'],
  AMD: ['amd', 'dram', 'драм', '֏'],
  JPY: ['jpy', 'yen', 'iyena', 'йен', 'иен'],
  INR: ['inr', 'rupi', 'рупи', '₹'],
  MYR: ['myr', 'ringgit', 'ринггит'],
  THB: ['thb', 'baht', 'bat', 'бат', '฿'],
  QAR: ['qar', 'qatar', 'катар'],
  KWD: ['kwd', 'dinor', 'dinar', 'динар'],
  EGP: ['egp', 'misr', 'египет'],
  CHF: ['chf', 'frank', 'franc', 'франк'],
  CAD: ['cad', 'kanada', 'канад'],
  AUD: ['aud', 'avstral', 'австрал'],
  CZK: ['czk', 'krona', 'chex', 'крон'],
};

function findCurrency(word) {
  // Telefonlardagi turli apostroflarni (’ ‘ ʻ ʼ `) bitta ' ga keltiramiz
  const w = word.toLowerCase().trim().replace(/[’‘ʻʼ`]/g, "'").replace(/[.!?,]+$/, '');
  if (!w) return null;
  // Avval to'liq mos keladiganini, bo'lmasa eng uzun mos boshlanishni olamiz
  // ("somoni" -> TJS, "so'm" -> UZS, "dollar" -> USD)
  let best = null, bestLen = 0;
  for (const [code, list] of Object.entries(ALIASES)) {
    for (const a of list) {
      if (w === a) return code;
      if (a.length > 2 && w.startsWith(a) && a.length > bestLen) { best = code; bestLen = a.length; }
    }
  }
  return best;
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
  if (!before && !after) return { amount, from: null }; // faqat raqam: valyutani foydalanuvchi tanlagani bo'yicha olamiz

  const from = findCurrency(after) || findCurrency(before);
  return from ? { amount, from } : null;
}
