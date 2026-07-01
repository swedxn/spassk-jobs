const AMOUNT_SOURCE = String.raw`(?:\d{1,3}(?:[\s\u00a0\u202f]\d{3})+|\d{3,9})`;
const CURRENCY_SOURCE = String.raw`(?:₽|руб(?:\.|ля|лей)?|р(?=$|[^а-яёa-z]))`;
const PERIOD_SOURCE = String.raw`(?:\s*(?:за|в)\s+(?:час|день|смену|месяц)|\s*\/\s*(?:час|день|смен(?:а|у)|мес(?:яц)?))?`;
const SALARY_RX = new RegExp(String.raw`(?:^|[^\d])(?:(от|до)\s*)?(${AMOUNT_SOURCE})(?:\s*[–—-]\s*(${AMOUNT_SOURCE}))?\s*(${CURRENCY_SOURCE})?(${PERIOD_SOURCE})`, 'iu');
const EMBEDDED_SALARY_RX = new RegExp(String.raw`(?:от|до)?\s*${AMOUNT_SOURCE}(?:\s*[–—-]\s*${AMOUNT_SOURCE})?\s*${CURRENCY_SOURCE}${PERIOD_SOURCE}`, 'iu');
const LEADING_SALARY_RX = new RegExp(String.raw`^(?:от|до)?\s*${AMOUNT_SOURCE}(?:\s*[–—-]\s*${AMOUNT_SOURCE})?\s*(?:${CURRENCY_SOURCE})?${PERIOD_SOURCE}\s*`, 'iu');

const amount = value => Number(String(value || '').replace(/\D/g, '')) || 0;
const formatAmount = value => new Intl.NumberFormat('ru-RU').format(value).replace(/\u00a0/g, ' ');
const normalizePeriod = value => {
  const text=String(value||'').replace(/\s+/g,' ').trim().toLocaleLowerCase('ru-RU');
  if(!text) return '';
  if(/^\/\s*час/u.test(text)) return 'за час';
  if(/^\/\s*день/u.test(text)) return 'за день';
  if(/^\/\s*смен/iu.test(text)) return 'за смену';
  if(/^\/\s*мес/iu.test(text)) return 'в месяц';
  return text;
};

export function normalizeSalaryText(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text || /не указан/iu.test(text)) return 'Не указана';
  const match = text.match(SALARY_RX);
  if (!match) return text;

  const prefix = match[1]?.toLocaleLowerCase('ru-RU');
  const first = amount(match[2]);
  const second = amount(match[3]);
  const period = normalizePeriod(match[5]);
  const suffix = period ? ` ${period}` : '';
  if (!first) return 'Не указана';

  if (second && second !== first) return `${formatAmount(first)}–${formatAmount(second)} ₽${suffix}`;
  if (prefix) return `${prefix} ${formatAmount(first)} ₽${suffix}`;
  return `${formatAmount(first)} ₽${suffix}`;
}

export function salaryNumber(value) {
  const normalized = normalizeSalaryText(value);
  const values = [...normalized.matchAll(/\d{1,3}(?:[\s\u00a0\u202f]\d{3})+|\d{3,9}/gu)].map(match => amount(match[0]));
  return Math.max(0, ...values);
}

export function extractSalaryText(value) {
  const match = String(value ?? '').match(EMBEDDED_SALARY_RX);
  return match ? normalizeSalaryText(match[0]) : 'Не указана';
}

export function stripLeadingSalary(value) {
  return String(value ?? '').replace(LEADING_SALARY_RX, '').trim();
}
