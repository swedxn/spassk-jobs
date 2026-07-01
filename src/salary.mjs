const AMOUNT_SOURCE = String.raw`(?:\d{1,3}(?:[\s\u00a0\u202f]\d{3})+|\d{4,9})`;
const SALARY_RX = new RegExp(String.raw`(?:^|[^\d])(?:(от|до)\s*)?(${AMOUNT_SOURCE})(?:\s*[–—-]\s*(${AMOUNT_SOURCE}))?\s*(₽|руб(?:\.|ля|лей)?|р\b)?`, 'iu');
const EMBEDDED_SALARY_RX = new RegExp(String.raw`(?:от|до)?\s*${AMOUNT_SOURCE}(?:\s*[–—-]\s*${AMOUNT_SOURCE})?\s*(?:₽|руб(?:\.|ля|лей)?|р\b)`, 'iu');
const LEADING_SALARY_RX = new RegExp(String.raw`^(?:от|до)?\s*${AMOUNT_SOURCE}(?:\s*[–—-]\s*${AMOUNT_SOURCE})?\s*(?:₽|руб(?:\.|ля|лей)?|р\b)?\s*`, 'iu');

const amount = value => Number(String(value || '').replace(/\D/g, '')) || 0;
const formatAmount = value => new Intl.NumberFormat('ru-RU').format(value).replace(/\u00a0/g, ' ');

export function normalizeSalaryText(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text || /не указан/iu.test(text)) return 'Не указана';
  const match = text.match(SALARY_RX);
  if (!match) return text;

  const prefix = match[1]?.toLocaleLowerCase('ru-RU');
  const first = amount(match[2]);
  const second = amount(match[3]);
  if (!first) return 'Не указана';

  if (second && second !== first) return `${formatAmount(first)}–${formatAmount(second)} ₽`;
  if (prefix) return `${prefix} ${formatAmount(first)} ₽`;
  return `${formatAmount(first)} ₽`;
}

export function salaryNumber(value) {
  const normalized = normalizeSalaryText(value);
  const values = [...normalized.matchAll(/\d{1,3}(?:[\s\u00a0\u202f]\d{3})+|\d{4,9}/gu)].map(match => amount(match[0]));
  return Math.max(0, ...values);
}

export function extractSalaryText(value) {
  const match = String(value ?? '').match(EMBEDDED_SALARY_RX);
  return match ? normalizeSalaryText(match[0]) : 'Не указана';
}

export function stripLeadingSalary(value) {
  return String(value ?? '').replace(LEADING_SALARY_RX, '').trim();
}
