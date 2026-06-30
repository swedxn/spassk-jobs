import { assertRobotsAllowed, fetchText, sleep, stripHtml } from './web-utils.mjs';

const BASE = 'https://gderabota.ru/%D0%B2%D0%B0%D0%BA%D0%B0%D0%BD%D1%81%D0%B8%D0%B8/%D1%81%D0%BF%D0%B0%D1%81%D1%81%D0%BA-%D0%B4%D0%B0%D0%BB%D1%8C%D0%BD%D0%B8%D0%B9';

function absolute(href) { try { return new URL(href, BASE).href; } catch { return null; } }

function vacancyLinks(html) {
  const matches = [...html.matchAll(/<a\b[^>]*href=["']([^"']*\/([^/"']+)\/(\d+)(?:[?#][^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/giu)];
  const seen = new Set();
  return matches.flatMap(match => {
    const url = absolute(match[1]);
    const name = stripHtml(match[4]);
    let parsed, decodedPath; try { parsed=new URL(url); decodedPath=decodeURIComponent(parsed.pathname); } catch { return []; }
    if (!url || parsed.hostname !== 'gderabota.ru' || !decodedPath.startsWith('/вакансии/') || seen.has(url) || !name || /^(?:подробнее|откликнуться)$/iu.test(name)) return [];
    seen.add(url);
    return [{ match, url, id:match[3], name }];
  });
}

export function parseGdeRabota(html) {
  const links = vacancyLinks(html);
  return links.flatMap((card,index) => {
    const fragment = html.slice(card.match.index, links[index+1]?.match.index ?? Math.min(html.length, card.match.index+14000));
    const context = stripHtml(fragment).split(/Заполните квиз|Соседние города/iu)[0].trim();
    if (!/спасск[\s‑–—-]*дальн/iu.test(context) || card.name.length > 180) return [];
    const salary = context.match(/(?:от|до)?\s*\d[\d\s]*(?:[–—-]\s*\d[\d\s]*)?\s*₽/u)?.[0]?.replace(/\s+/g,' ').trim() || 'Не указана';
    const experience = context.match(/без опыта|от\s+\d+\s+(?:года|лет)(?:\s+до\s+\d+\s+лет)?/iu)?.[0] || 'Не указано';
    const schedule = context.match(/полный день|сменный график|гибкий график|удал[её]нн\w*|вахт\w*/iu)?.[0] || 'Не указано';
    const employer = context.match(/(?:\.\.\.|…)\s+(.{2,180}?)\s+Спасск[\s‑–—-]*Дальн/iu)?.[1]?.trim() || 'Работодатель указан в оригинале';
    const publishedAt = context.match(/(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(20\d{2})/iu)?.[0] || null;
    return [{ id:`gderabota-${card.id}`, name:card.name, employer, salary, city:'Спасск-Дальний', address:'Спасск-Дальний (точный адрес — в оригинале)', experience, education:'Не указано', schedule, description:context.slice(0,1200), source:'ГдеРабота', url:card.url, publishedAt, checkedAt:new Date().toISOString(), warnings:['Агрегированная карточка: проверьте источник и актуальность перед откликом'] }];
  });
}

function nextPage(html,current) {
  const pages=[...html.matchAll(/href=["']([^"']*[?&]page=(\d+)[^"']*)["']/giu)].map(match=>({url:absolute(match[1]),page:Number(match[2])})).filter(x=>x.url&&x.page>current).sort((a,b)=>a.page-b.page);
  return pages[0] || null;
}

export async function importGdeRabota() {
  await assertRobotsAllowed(BASE);
  const rows=[]; let url=BASE; let page=1;
  for(let i=0;i<25&&url;i++){
    const html=await fetchText(url);
    const parsed=parseGdeRabota(html);
    const before=rows.length;
    rows.push(...parsed.filter(item=>!rows.some(old=>old.url===item.url)));
    if(i>0 && rows.length===before) break;
    const next=nextPage(html,page); url=next?.url; page=next?.page||page+1;
    if(!url && i<24) url=`${BASE}?page=${page}`;
    if(url) await sleep(900);
  }
  if(!rows.length) throw new Error('ГдеРабота: карточки не найдены — возможно, изменилась разметка');
  return rows;
}
