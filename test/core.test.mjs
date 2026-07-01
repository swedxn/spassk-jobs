import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { classifyLocation, dedupe, filterVacancies, formatSalary, normalizeSalaryText, normalizeVacancy, processVacancies, scoreVacancy, suspiciousSourceDrop, toCsv } from '../src/core.mjs';
import { parseFarpost } from '../src/importers/farpost.mjs';
import { parseRabota1000 } from '../src/importers/rabota1000.mjs';
import { parseCentrrabota } from '../src/importers/centrrabota.mjs';
import { parseTelegramMessages } from '../src/importers/telegram.mjs';
import { parseGdeRabota } from '../src/importers/gderabota.mjs';
import { parseZhbi25 } from '../src/importers/zhbi25.mjs';
import { importTrudvsem } from '../src/importers/trudvsem.mjs';
import { robotsAllows, stripHtml } from '../src/importers/web-utils.mjs';
import { addOpportunityScores, pruneHistory, reconcileHistory } from '../src/history.mjs';

const local = { id:'1', name:'Оператор техподдержки', employer:'Тест', city:'Спасск-Дальний', address:'Спасск-Дальний, Советская, 1', experience:'Без опыта', education:'СПО', salary:'50 000 ₽', description:'Обучение на месте', source:'HeadHunter', url:'https://hh.ru/vacancy/1' };

test('геофильтр принимает только явный Спасск-Дальний', () => {
  assert.equal(classifyLocation(local).accepted, true);
  assert.equal(classifyLocation({...local,city:'Приморский край',address:'Приморский край',name:'Оператор'}).accepted, false);
});

test('другие города и вахта отклоняются', () => {
  assert.equal(classifyLocation({...local,city:'Владивосток',address:'Владивосток'}).bucket, 'otherCity');
  assert.equal(classifyLocation({...local,city:'Спасск-Дальний',address:'Спасск-Дальний',schedule:'Вахта в Магадане'}).accepted, false);
  assert.equal(classifyLocation({...local,name:'Военнослужащий по контракту',description:'Служба по контракту'}).accepted, false);
  assert.equal(classifyLocation({...local,description:'Работа в г. Партизанск, служебный транспорт'}).bucket, 'otherCity');
  assert.equal(classifyLocation({...local,source:'FarPost',description:'ООО Компания. Приморский край, Владивосток, улица Светлая, 1'}).bucket,'otherCity');
  assert.equal(classifyLocation({...local,source:'FarPost',description:'Гостиница на 542 км трассы Хабаровск–Владивосток'}).accepted,true);
  assert.equal(classifyLocation({...local,city:'Спасск-Дальний',address:'Спасск-Дальний',source:'FarPost',description:'Работа в Спасском районе, село Липовцы'}).accepted,false);
  assert.equal(classifyLocation({...local,city:'Сибирцево',address:'Сибирцево'}).bucket,'otherCity');
});

test('полностью удалённая работа выносится в отдельный список', () => {
  assert.equal(classifyLocation({...local,schedule:'Удалённая работа'}).bucket,'remote');
  assert.equal(classifyLocation({...local,schedule:'Удалённая работа не предусмотрена'}).accepted,true);
});

test('дедупликация не зависит от id источника', () => {
  assert.equal(dedupe([normalizeVacancy(local),normalizeVacancy({...local,id:'2'})]).length, 1);
});

test('оценка учитывает профиль, отсутствие опыта и обучение', () => {
  const score=scoreVacancy(normalizeVacancy(local));
  assert.ok(score.score >= 75); assert.equal(score.fit,'Хорошо подходит');
});

test('фильтры поиска, опыта, зарплаты и пригодности', () => {
  const v={...normalizeVacancy(local),...scoreVacancy(normalizeVacancy(local))};
  assert.equal(filterVacancies([v],{query:'техподдерж',noExperience:true,salary:true,goodFit:true}).length,1);
  assert.equal(filterVacancies([v],{query:'повар'}).length,0);
});

test('импорт нормализует разные поля', () => {
  const v=normalizeVacancy({title:'Кассир',company:'Магазин',location:'Спасск-Дальний',source:'Тест'});
  assert.equal(v.name,'Кассир'); assert.equal(v.employer,'Магазин'); assert.ok(v.id);
});

test('зарплата не захватывает номер школы или учреждения', () => {
  assert.equal(normalizeSalaryText('15 50 000 - 65 000 ₽'), '50 000–65 000 ₽');
  assert.equal(normalizeSalaryText('6 45 000 - 50 000 ₽'), '45 000–50 000 ₽');
  assert.equal(normalizeVacancy({...local,salary:'2 51 000 - 57 851 ₽'}).salary, '51 000–57 851 ₽');
});

test('одинаковые границы зарплаты показываются одной суммой', () => {
  assert.equal(normalizeSalaryText('93 352 - 93 352 ₽'), '93 352 ₽');
  assert.equal(formatSalary({from:40640,to:40640,currency:'RUR'}), '40 640 ₽');
});

test('Работа России проверяет городской код КЛАДР и текстовый поиск', async () => {
  const original=globalThis.fetch; const urls=[];
  globalThis.fetch=async url=>{urls.push(String(url));return {ok:true,json:async()=>({meta:{total:1},results:{vacancies:[{vacancy:{id:String(url).includes('/region/')?'region':'text','job-name':'Оператор',company:{name:'ООО Тест'},region:{name:'Спасск-Дальний'},addresses:{address:{location:'Спасск-Дальний'}},vac_url:'https://trudvsem.ru/vacancy/test'}}]}})};};
  try { const rows=await importTrudvsem(); assert.equal(rows.length,2); assert.ok(urls.some(url=>url.includes('/region/2500001000000'))); assert.ok(urls.some(url=>url.includes('text='))); }
  finally { globalThis.fetch=original; }
});

test('опасные URL отключаются при нормализации', () => {
  assert.equal(normalizeVacancy({...local,url:'javascript:alert(1)'}).url,'#');
  assert.match(normalizeVacancy({...local,url:'https://example.com/job'}).url,/^https:/u);
});

test('HTML entities корректно декодируются', () => {
  assert.equal(stripHtml('50&nbsp;000&ndash;70&nbsp;000&nbsp;₽'),'50 000–70 000 ₽');
});

test('robots.txt учитывает группы, самое длинное правило и конец строки', () => {
  const robots='User-agent: *\nDisallow: /private\nAllow: /private/jobs\n\nUser-agent: SpasskJobs\nDisallow: /blocked$\nAllow: /';
  assert.equal(robotsAllows(robots,'https://example.com/private','OtherBot'),false);
  assert.equal(robotsAllows(robots,'https://example.com/private/jobs','OtherBot'),true);
  assert.equal(robotsAllows(robots,'https://example.com/blocked','SpasskJobs'),false);
  assert.equal(robotsAllows(robots,'https://example.com/blocked/more','SpasskJobs'),true);
});

test('JSON и CSV экспортируются без потери кириллицы', () => {
  const v=normalizeVacancy(local); const json=JSON.stringify([v]); const csv=toCsv([v]);
  assert.match(json,/Оператор/); assert.match(csv,/Оператор/); assert.ok(csv.startsWith('\uFEFF'));
});

test('сетевой сбой не превращается в моки: используется проверенный seed', async () => {
  const failing=async()=>{throw new Error('getaddrinfo failed')};
  let rows=[]; try{rows=await failing()}catch{rows=JSON.parse(await fs.readFile(new URL('../data/manual-seed.json',import.meta.url),'utf8'))}
  const result=processVacancies(rows); assert.ok(result.vacancies.length>0); assert.ok(result.vacancies.every(v=>v.source==='HeadHunter'));
});

test('резкое неполное падение выдачи не закрывает сотню вакансий', () => {
  assert.equal(suspiciousSourceDrop(122,27),true);
  assert.equal(suspiciousSourceDrop(122,100),false);
  assert.equal(suspiciousSourceDrop(12,2),false);
});

test('основной список после импорта не содержит другие города', async () => {
  const seed=JSON.parse(await fs.readFile(new URL('../data/manual-seed.json',import.meta.url),'utf8'));
  const result=processVacancies(seed);
  assert.ok(result.vacancies.every(v=>/Спасск[\s-]*Дальн/iu.test(`${v.city} ${v.address} ${v.name}`)));
});

test('проект не содержит обязательных платных сервисов', async () => {
  const packageText=await fs.readFile(new URL('../package.json',import.meta.url),'utf8');
  const workflow=await fs.readFile(new URL('../.github/workflows/update-and-deploy.yml',import.meta.url),'utf8');
  assert.doesNotMatch(packageText+workflow,/stripe|paid proxy|brightdata|scrapingbee|apify/iu);
  assert.match(workflow,/github-pages|deploy-pages/iu);
});

test('публичная выдача FarPost преобразуется в вакансии с оригинальной ссылкой', () => {
  const html='<article>от 50 000 ₽ <a href="/spassk-dalnii/rabota/vacansii/kladovschik-123456.html">Кладовщик</a> ООО Склад. Улица Советская 1 Без опыта</article>';
  const rows=parseFarpost(html); assert.equal(rows.length,1); assert.equal(rows[0].source,'FarPost'); assert.match(rows[0].url,/123456\.html/);
});

test('история различает новые, изменившиеся и исчезнувшие вакансии', () => {
  const previous=[normalizeVacancy(local)];
  const changed={...previous[0],salary:'60 000 ₽'};
  const first=reconcileHistory([changed,{...changed,id:'new-1',name:'Новая вакансия'}],previous,{},'2026-06-30T01:00:00Z');
  assert.equal(first.events.filter(e=>e.type==='new').length,1);
  assert.equal(first.events.filter(e=>e.type==='changed').length,1);
  const missing1=reconcileHistory([], [changed], first.history,'2026-06-30T02:00:00Z');
  assert.equal(missing1.events.filter(e=>e.type==='closed').length,2);
  assert.equal(missing1.history[changed.id].active,false);
});

test('история удаляет только давно неактивные записи', () => {
  const history={active:{active:true,lastSeenAt:'2025-01-01T00:00:00Z'},old:{active:false,lastSeenAt:'2025-01-01T00:00:00Z'},recent:{active:false,lastSeenAt:'2026-06-29T00:00:00Z'}};
  const pruned=pruneHistory(history,'2026-06-30T00:00:00Z');
  assert.deepEqual(Object.keys(pruned).sort(),['active','recent']);
});

test('Opportunity Score независим от Fit Score и учитывает свежесть', () => {
  const base={...normalizeVacancy(local),score:80,isNew:false,changedFields:[]};
  const [ordinary,fresh]=addOpportunityScores([base,{...base,id:'fresh',isNew:true}]);
  assert.ok(fresh.opportunityScore>ordinary.opportunityScore);
  assert.equal(typeof fresh.marketSalaryMedian,'number');
});

test('Rabota1000 импортирует публичные городские карточки', () => {
  const html='<article><a href="/vacancy/106770354">Продавец-консультант</a><a href="/vacancy/106770354">Продавец-консультант</a><b>60 000 руб.</b><a>DNS</a> Спасск-Дальний 29 июн. 2026 г. Описание Без опыта, обучаем. Источник: hh.ru</article>';
  const rows=parseRabota1000(html);
  assert.equal(rows.length,1); assert.equal(rows[0].source,'Rabota1000'); assert.match(rows[0].url,/106770354/);
});

test('ЦентрРабота импортирует открытые вакансии прямых работодателей', () => {
  const html='<div><a href="/vacancies/vacancy/prodavets-kassir_31143457">Продавец-кассир</a> ООО «МАГАЗИН» Приморский край, г Спасск-Дальний, Советская улица, 1 2026-06-20 от 53800 <a href="/vacancies/vacancy/prodavets-kassir_31143457">Смотреть</a></div>';
  const rows=parseCentrrabota(html);
  assert.equal(rows.length,1); assert.equal(rows[0].source,'ЦентрРабота'); assert.match(rows[0].address,/Спасск-Дальний/);
});

test('Telegram принимает свежую вакансию и отбрасывает старую и мошенническую', () => {
  const block=(id,date,text)=>`<div class="tgme_widget_message_wrap"><div data-post="spassktoday/${id}"><div class="tgme_widget_message_text">${text}</div><time datetime="${date}"></time></div></div>`;
  const html=block(1,'2026-06-29T01:00:00Z','ВАКАНСИЯ г. Спасск-Дальний! Требуется продавец, без опыта, 55 000 руб.')+block(2,'2025-01-01T01:00:00Z','Вакансия г. Спасск-Дальний: кассир')+block(3,'2026-06-29T01:00:00Z','Вакансия Спасск-Дальний: лёгкие деньги и крипта');
  const rows=parseTelegramMessages(html,'spassktoday',Date.parse('2026-06-30T00:00:00Z'));
  assert.equal(rows.length,1); assert.equal(rows[0].experience,'Без опыта');
});

test('локальный Telegram-канал принимает только пост с точным Спасском и ролью', () => {
  const block=(id,text)=>`<div class="tgme_widget_message_wrap"><div data-post="rabota_spassk_dalnyq/${id}"><div class="tgme_widget_message_text">${text}</div><time datetime="2026-06-29T01:00:00Z"></time></div></div>`;
  const html=block(1,'Продавец-кассир (Спасск-Дальний, Краснознамённая, 31) 59 200 ₽ Обязанности: работа за кассой. Пятёрочка')+block(2,'Менеджер по продажам 90 000 ₽ Работа в другом городе');
  const rows=parseTelegramMessages(html,'rabota_spassk_dalnyq',Date.parse('2026-06-30T00:00:00Z'));
  assert.equal(rows.length,1); assert.match(rows[0].address,/Краснознамённая/); assert.match(rows[0].employer,/Пят/iu);
});

test('ГдеРабота преобразует публичную городскую карточку', () => {
  const html='<a href="https://ok.ru/group/70000035225182">Одноклассники</a><article><a href="/вакансии/спасск-дальний/воспитатель/147874">Воспитатель</a> 42 000 - 45 000 ₽ 29 июня 2026 Без опыта Полный день МБОУ приглашает педагога ... МБОУ СОШ № 15 Спасск-Дальний 29 июня 2026 <a href="/вакансии/спасск-дальний/воспитатель/147874">Подробнее</a></article>';
  const rows=parseGdeRabota(html);
  assert.equal(rows.length,1); assert.equal(rows[0].source,'ГдеРабота'); assert.match(rows[0].url,/147874/);
});

test('ГдеРабота отделяет номер школы от зарплаты', () => {
  const html='<article><a href="/вакансии/спасск-дальний/учитель-физики/555">Учитель физики в МБОУ СОШ № 15</a> 15 50 000 - 65 000 ₽ Без опыта Полный день МБОУ СОШ № 15 Спасск-Дальний <a href="/вакансии/спасск-дальний/учитель-физики/555">Подробнее</a></article>';
  const [row]=parseGdeRabota(html);
  assert.equal(row.salary,'50 000–65 000 ₽');
});

test('прямой сайт Спасского завода ЖБИ импортирует актуальные вакансии', () => {
  const html='<h2>Актуальные вакансии</h2><h3>Бетонщик-армировщик (От 50 000р)</h3><p>Желание работать. Полная занятость, сменный график.</p><h3>Машинист мостового крана (Крановщик) от 85 000р</h3><p>Работа в цеху.</p><div>КОНТАКТЫ</div>';
  const rows=parseZhbi25(html);
  assert.equal(rows.length,2); assert.equal(rows[0].salary,'От 50 000₽'); assert.match(rows[0].address,/Краснознаменная/);
});

test('бесплатное облачное обновление запускается каждые три часа', async () => {
  const workflow=await fs.readFile(new URL('../.github/workflows/update-and-deploy.yml',import.meta.url),'utf8');
  assert.match(workflow,/cron:\s*'17 \*\/3 \* \* \*'/u);
});

test('ручные fallback-карточки новых источников реальны и проходят геофильтр', async () => {
  const curated=JSON.parse(await fs.readFile(new URL('../data/curated-public.json',import.meta.url),'utf8'));
  const extra=curated.filter(row=>['JobLab','Своё Фермерство'].includes(row.source));
  assert.ok(extra.length >= 7);
  assert.ok(extra.every(row=>/^https:\/\//u.test(row.url)));
  assert.equal(processVacancies(extra).vacancies.length,extra.length);
});
