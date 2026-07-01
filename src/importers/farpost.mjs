import { assertRobotsAllowed, fetchText, sleep, stripHtml } from './web-utils.mjs';
import { cleanFarpostDescription } from '../farpost-clean.mjs';
import { extractSalaryText } from '../salary.mjs';
import { parseFarpostPublishedAt } from '../date.mjs';

const BASE = 'https://www.farpost.ru/spassk-dalnii/rabota/vacansii/';

function absolute(href) { try { const url=new URL(href,BASE); url.search=''; url.hash=''; return url.href; } catch { return null; } }
function salary(text) { return extractSalaryText(text); }

export function parseFarpost(html, now = new Date()) {
  const rows = [];
  const rx = /<a\b[^>]*href=["']([^"']*\/spassk-dalnii\/rabota\/vacansii\/[^"'#?]+\.html[^"']*)["'][^>]*>([\s\S]*?)<\/a>/giu;
  for (const match of html.matchAll(rx)) {
    const url = absolute(match[1]);
    const name = stripHtml(match[2]).replace(/^\d[\d\s]*(?:[–—-]\s*\d[\d\s]*)?\s*₽\s*/u,'').trim();
    if (!url || !name || name.length < 3 || name.length > 180) continue;
    const rowStart = html.lastIndexOf('<tr', match.index);
    const rowEnd = html.indexOf('</tr>', match.index);
    const boundedRow = rowStart >= 0 && rowEnd > match.index && rowEnd - rowStart < 16000;
    const start = boundedRow ? rowStart : Math.max(0, match.index - 350);
    const end = boundedRow ? rowEnd + 5 : Math.min(html.length, match.index + match[0].length + 700);
    const fragment = html.slice(start, end).replace(/\b(?:class|href|data-[\w-]+|target|title)=["'][^"']*["']/gi,' ');
    const context = stripHtml(fragment);
    const employer = context.match(/(?:ООО|АО|ПАО|ИП|ФКУ|КГБУЗ|КГБУСО|ТС)\s*[«"']?[^.·]{2,90}/u)?.[0]?.trim() || 'Работодатель указан в оригинале';
    const address = context.match(/(?:Спасск[\s‑–—-]*Дальн(?:ий|его|ем)[^,.]{0,20}[,.]?\s*)?(?:ул(?:ица)?\.?|пер(?:еулок)?\.?|проспект|микрорайон)\s+[А-ЯЁа-яё0-9\s‑–—-]+(?:,?\s*\d+[а-яА-ЯёЁ\/]*)?/u)?.[0]?.trim() || 'Спасск-Дальний';
    rows.push({ id:`farpost-${url.match(/-(\d+)\.html/)?.[1] || Buffer.from(url).toString('base64url').slice(-18)}`, name, employer, salary:salary(context), city:'Спасск-Дальний', address:`Спасск-Дальний${address === 'Спасск-Дальний' ? '' : ', ' + address}`, experience:/без опыта/iu.test(context)?'Без опыта':'Не указано', education:/средн(?:ее|е-специальное)|без высшего/iu.test(context)?'Без высшего образования':'Не указано', schedule:/посмен/iu.test(context)?'Посменный':/дневн/iu.test(context)?'Дневной':'Не указано', description:cleanFarpostDescription(context,name).slice(0,900), source:'FarPost', url, publishedAt:parseFarpostPublishedAt(context,now), checkedAt:new Date().toISOString() });
  }
  return [...new Map(rows.map(row => [row.url,row])).values()];
}

export async function importFarpost() {
  await assertRobotsAllowed(BASE);
  const rows = [];
  for (let page = 1; page <= 6; page++) {
    const url = page === 1 ? BASE : `${BASE}?page=${page}`;
    const parsed = parseFarpost(await fetchText(url));
    const before = rows.length; rows.push(...parsed.filter(item => !rows.some(old => old.url === item.url)));
    if (!parsed.length || rows.length === before) break;
    await sleep(1200);
  }
  if (rows.length < 5) throw new Error(`FarPost: разметка изменилась, найдено только ${rows.length}; сохранён проверенный срез`);
  return rows;
}
