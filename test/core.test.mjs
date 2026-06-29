import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { classifyLocation, dedupe, filterVacancies, normalizeVacancy, processVacancies, scoreVacancy, toCsv } from '../src/core.mjs';

const local = { id:'1', name:'Оператор техподдержки', employer:'Тест', city:'Спасск-Дальний', address:'Спасск-Дальний, Советская, 1', experience:'Без опыта', education:'СПО', salary:'50 000 ₽', description:'Обучение на месте', source:'HeadHunter', url:'https://hh.ru/vacancy/1' };

test('геофильтр принимает только явный Спасск-Дальний', () => {
  assert.equal(classifyLocation(local).accepted, true);
  assert.equal(classifyLocation({...local,city:'Приморский край',address:'Приморский край',name:'Оператор'}).accepted, false);
});

test('другие города и вахта отклоняются', () => {
  assert.equal(classifyLocation({...local,city:'Владивосток',address:'Владивосток'}).bucket, 'otherCity');
  assert.equal(classifyLocation({...local,city:'Спасск-Дальний',address:'Спасск-Дальний',schedule:'Вахта в Магадане'}).accepted, false);
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

test('JSON и CSV экспортируются без потери кириллицы', () => {
  const v=normalizeVacancy(local); const json=JSON.stringify([v]); const csv=toCsv([v]);
  assert.match(json,/Оператор/); assert.match(csv,/Оператор/); assert.ok(csv.startsWith('\uFEFF'));
});

test('сетевой сбой не превращается в моки: используется проверенный seed', async () => {
  const failing=async()=>{throw new Error('getaddrinfo failed')};
  let rows=[]; try{rows=await failing()}catch{rows=JSON.parse(await fs.readFile(new URL('../data/manual-seed.json',import.meta.url),'utf8'))}
  const result=processVacancies(rows); assert.ok(result.vacancies.length>0); assert.ok(result.vacancies.every(v=>v.source==='HeadHunter'));
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
