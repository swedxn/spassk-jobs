import { assertRobotsAllowed, fetchText, stripHtml } from './web-utils.mjs';

const BASE='https://zhbi25.ru/about/vacancy';

export function parseZhbi25(html) {
  const section=String(html).split(/Актуальные вакансии/iu)[1]?.split(/КОНТАКТЫ/iu)[0] || '';
  const headings=[...section.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/giu)];
  return headings.flatMap((match,index)=>{
    const heading=stripHtml(match[1]);
    const title=heading.replace(/\s*(?:\(|\b)от\s+\d[\d\s]*\s*р\)?\s*$/iu,'').trim();
    if(!title || title.length>180) return [];
    const fragment=section.slice(match.index,headings[index+1]?.index ?? section.length);
    const description=stripHtml(fragment).replace(heading,'').trim().slice(0,1400);
    const salary=heading.match(/от\s+\d[\d\s]*\s*р/iu)?.[0].replace(/р$/iu,'₽') || 'Не указана';
    const schedule=/сменн/iu.test(description)?'Сменный график':/полная занятость/iu.test(description)?'Полная занятость':'Не указано';
    return [{
      id:`zhbi25-${title.toLowerCase().replace(/[^а-яa-z0-9]+/giu,'-').replace(/^-|-$/g,'')}`,
      name:title, employer:'ООО «Спасский завод ЖБИ»', salary,
      city:'Спасск-Дальний', address:'Спасск-Дальний, ул. Краснознаменная, 50',
      experience:/желание работать|обуч/iu.test(description)?'Без опыта':'Не указано', education:'Не указано', schedule,
      description, source:'Спасский завод ЖБИ — сайт работодателя', url:BASE,
      checkedAt:new Date().toISOString(), warnings:[]
    }];
  });
}

export async function importZhbi25() {
  await assertRobotsAllowed(BASE);
  const rows=parseZhbi25(await fetchText(BASE));
  if(!rows.length) throw new Error('Спасский завод ЖБИ: актуальные вакансии не распознаны');
  return rows;
}
