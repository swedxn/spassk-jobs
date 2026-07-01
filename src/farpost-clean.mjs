import { stripLeadingSalary } from './salary.mjs';

const MONTHS = 'января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря';
const escapeRx = value => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function cleanFarpostDescription(value, title = '') {
  let text = String(value ?? '')
    .replace(/^[₽Р]\s*["']?\s*>\s*/iu, '')
    .replace(/\s+/g, ' ')
    .trim();

  text = stripLeadingSalary(text);
  if (title) text = text.replace(new RegExp(`^${escapeRx(title)}(?:\\s+|$)`, 'iu'), '').trim();

  text = text
    .replace(new RegExp(`\\s+(?:(?:сегодня|вчера)(?:\\s+в\\s+\\d{1,2}:\\d{2})?|\\d{1,2}\\s+(?:${MONTHS})(?:\\s+20\\d{2})?)\\s+\\d{1,7}$`, 'iu'), '')
    .replace(/\s+\d{3,7}$/u, '')
    .replace(/^[·,.;:\s-]+|[·,.;:\s-]+$/gu, '')
    .trim();

  return text || 'Подробные обязанности и условия указаны в оригинале объявления.';
}
