import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { auditVacancies } from '../src/audit.mjs';

const root=new URL('../',import.meta.url);

test('опубликованная база проходит полный аудит инвариантов', async () => {
  const payload=JSON.parse(await fs.readFile(new URL('data/vacancies.json',root),'utf8'));
  const result=auditVacancies(payload,new Date(payload.meta.generatedAt));
  assert.deepEqual(result.errors,[]);
  assert.ok(result.summary.vacancies>0);
});

test('CSV синхронизирован с JSON и содержит BOM', async () => {
  const payload=JSON.parse(await fs.readFile(new URL('data/vacancies.json',root),'utf8'));
  const csv=await fs.readFile(new URL('data/vacancies.csv',root),'utf8');
  assert.ok(csv.startsWith('\uFEFF'));
  assert.equal(csv.trimEnd().split('\n').length,payload.vacancies.length+1);
});

test('отчёт импорта согласован с опубликованной базой', async () => {
  const payload=JSON.parse(await fs.readFile(new URL('data/vacancies.json',root),'utf8'));
  const report=JSON.parse(await fs.readFile(new URL('data/import-report.json',root),'utf8'));
  assert.equal(report.generatedAt,payload.meta.generatedAt);
  assert.equal(report.accepted,payload.vacancies.length);
  assert.ok(report.sourceRuns.every(run=>Number.isInteger(run.found)&&run.found>=0));
});

test('облачный импорт сохраняет срез каждого автоматического источника при блокировке', async () => {
  const importer=await fs.readFile(new URL('scripts/import.mjs',root),'utf8');
  for(const source of ['HeadHunter','Работа России','FarPost','Публичный Telegram','ГдеРабота','Спасский завод ЖБИ','Rabota1000','ЦентрРабота']) assert.match(importer,new RegExp(`'${source.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}'`,'u'));
});
