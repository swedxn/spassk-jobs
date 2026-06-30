import { assertRobotsAllowed, fetchText, stripHtml } from './web-utils.mjs';

const BASE = 'https://centrrabota.ru/vacancies/city/spassk-dalnii_406';

function absolute(href) {
  try { return new URL(href, BASE).href; } catch { return null; }
}

export function parseCentrrabota(html) {
  const matches = [...html.matchAll(/<a\b[^>]*href=["']([^"']*\/vacancies\/vacancy\/([^"'#?]+))["'][^>]*>([\s\S]*?)<\/a>/giu)];
  const unique = [];
  const seen = new Set();
  for (const match of matches) {
    const url = absolute(match[1]);
    if (!url || seen.has(url)) continue;
    const title = stripHtml(match[3]);
    if (/^смотреть$/iu.test(title)) continue;
    seen.add(url);
    unique.push({ match, url, title });
  }
  return unique.flatMap((card, index) => {
    const fragment = html.slice(card.match.index, unique[index + 1]?.match.index ?? Math.min(html.length, card.match.index + 6000));
    const context = stripHtml(fragment);
    if (!card.title || !/спасск[\s‑–—-]*дальн/iu.test(context)) return [];
    const salary = context.match(/(?:от|до)\s*\d[\d\s]*/iu)?.[0]?.replace(/\s+/g, ' ').trim() || 'Не указана';
    const address = context.match(/Приморский край[^\d]{0,40}(?:г\.?\s*)?Спасск[\s‑–—-]*Дальний[^\n]{0,180}?(?=\s+20\d{2}-\d{2}-\d{2}|\s+(?:от|до)\s*\d|$)/iu)?.[0]?.trim() || 'Спасск-Дальний';
    const afterTitle = context.slice(context.toLowerCase().indexOf(card.title.toLowerCase()) + card.title.length).trim();
    const employer = afterTitle.match(/^(.{2,160}?)\s+Приморский край/iu)?.[1]?.trim() || 'Работодатель указан в оригинале';
    const publishedAt = context.match(/20\d{2}-\d{2}-\d{2}/u)?.[0] || null;
    return [{
      id: `centrrabota-${card.url.split('_').at(-1) || Buffer.from(card.url).toString('base64url').slice(-16)}`,
      name: card.title,
      employer,
      salary: salary === 'Не указана' ? salary : `${salary} ₽`,
      city: 'Спасск-Дальний',
      address,
      experience: 'Не указано',
      education: 'Не указано',
      schedule: 'Не указано',
      description: `Открытая карточка вакансии работодателя. ${context.slice(0, 900)}`,
      source: 'ЦентрРабота',
      url: card.url,
      publishedAt,
      checkedAt: new Date().toISOString()
    }];
  });
}

export async function importCentrrabota() {
  await assertRobotsAllowed(BASE);
  const rows = parseCentrrabota(await fetchText(BASE));
  if (!rows.length) throw new Error('ЦентрРабота: не найдены карточки — возможно, изменилась разметка');
  return rows;
}
