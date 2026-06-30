import { assertRobotsAllowed, fetchText, stripHtml } from './web-utils.mjs';

const BASE = 'https://rabota1000.ru/spassk-dalni?sort=date';

function absolute(href) {
  try { return new URL(href, BASE).href; } catch { return null; }
}

function cards(html) {
  const matches = [...html.matchAll(/<a\b[^>]*href=["']([^"']*\/vacancy\/(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/giu)];
  const first = [];
  const seen = new Set();
  for (const match of matches) {
    if (seen.has(match[2])) continue;
    seen.add(match[2]);
    first.push(match);
  }
  return first.map((match, index) => ({
    id: match[2],
    url: absolute(match[1]),
    title: stripHtml(match[3]),
    fragment: html.slice(match.index, first[index + 1]?.index ?? Math.min(html.length, match.index + 10000))
  }));
}

export function parseRabota1000(html) {
  const rows = [];
  for (const card of cards(html)) {
    const context = stripHtml(card.fragment);
    const name = card.title.trim();
    if (!card.url || !name || name.length < 3 || name.length > 180 || !/спасск[\s‑–—-]*дальн/iu.test(context)) continue;
    const salary = context.match(/(?:от\s*)?\d[\d\s]*(?:[–—-]\s*\d[\d\s]*)?\s*руб\.?/iu)?.[0]?.replace(/\s+/g, ' ').trim() || 'Не указана';
    const employer = context.match(new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(?:${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+)?(?:${salary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+)?(.{2,120}?)\\s+Спасск[\\s‑–—-]*Дальн`, 'iu'))?.[1]?.trim() || 'Работодатель указан в оригинале';
    const publishedAt = context.match(/(\d{1,2})\s+(янв|фев|мар|апр|мая|июн|июл|авг|сен|окт|ноя|дек)[а-я.]*\s+(20\d{2})/iu)?.[0] || null;
    const description = context.match(/Описание\s+([\s\S]*?)(?:Источник:|$)/iu)?.[1]?.trim() || context.slice(0, 1000);
    rows.push({
      id: `rabota1000-${card.id}`,
      name,
      employer,
      salary,
      city: 'Спасск-Дальний',
      address: 'Спасск-Дальний (адрес уточнить в оригинале)',
      experience: /без опыта|опыт не требуется/iu.test(description) ? 'Без опыта' : 'Не указано',
      education: 'Не указано',
      schedule: /вахт/iu.test(description) ? 'Вахта' : /удал[её]н/iu.test(description) ? 'Удалённо' : 'Не указано',
      description: description.slice(0, 1200),
      source: 'Rabota1000',
      url: card.url,
      publishedAt,
      checkedAt: new Date().toISOString(),
      warnings: ['Агрегированная карточка: перед откликом проверьте дату и фактический адрес в оригинале']
    });
  }
  return rows;
}

export async function importRabota1000() {
  await assertRobotsAllowed(BASE);
  const rows = parseRabota1000(await fetchText(BASE));
  if (!rows.length) throw new Error('Rabota1000: не найдены карточки — возможно, изменилась разметка');
  return rows;
}
