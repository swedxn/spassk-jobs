import fs from 'node:fs/promises';
import { processVacancies, stats, suspiciousSourceDrop, toCsv } from '../src/core.mjs';
import { importHH } from '../src/importers/hh.mjs';
import { importTrudvsem } from '../src/importers/trudvsem.mjs';
import { importFarpost } from '../src/importers/farpost.mjs';
import { importTelegram } from '../src/importers/telegram.mjs';
import { importRabota1000 } from '../src/importers/rabota1000.mjs';
import { importCentrrabota } from '../src/importers/centrrabota.mjs';
import { importGdeRabota } from '../src/importers/gderabota.mjs';
import { importZhbi25 } from '../src/importers/zhbi25.mjs';
import { addOpportunityScores, pruneHistory, reconcileHistory } from '../src/history.mjs';

const root = new URL('../', import.meta.url);
const read = async name => JSON.parse(await fs.readFile(new URL(name, root), 'utf8'));
const readOr = async (name, fallback) => { try { return await read(name); } catch { return fallback; } };
const write = (name, data) => fs.writeFile(new URL(name, root), data);
const sources = [];
const collected = [];
const previousData = await readOr('data/vacancies.json',{vacancies:[]});
const runStartedAt = new Date();
const SNAPSHOT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const freshSnapshot = row => {
  const date=Date.parse(row.checkedAt || row.publishedAt || '');
  return Number.isFinite(date) && runStartedAt.getTime()-date <= SNAPSHOT_MAX_AGE_MS;
};

const runs = await Promise.all([['HeadHunter', importHH], ['Работа России', importTrudvsem], ['FarPost', importFarpost], ['Публичный Telegram', importTelegram], ['ГдеРабота', importGdeRabota], ['Спасский завод ЖБИ', importZhbi25], ['Rabota1000', importRabota1000], ['ЦентрРабота', importCentrrabota]].map(async ([name, importer]) => {
  try { const rows = await importer(); return { source: { name, mode: 'auto', status: 'ok', found: rows.length }, rows }; }
  catch (error) { return { source: { name, mode: 'auto', status: 'blocked', found: 0, error: String(error.message || error) }, rows: [] }; }
}));

const sourceMatches = {
  'HeadHunter': source => source === 'HeadHunter',
  'Работа России': source => source === 'Работа России',
  'FarPost': source => source === 'FarPost',
  'Публичный Telegram': source => source.startsWith('Telegram @'),
  'ГдеРабота': source => source === 'ГдеРабота',
  'Спасский завод ЖБИ': source => source === 'Спасский завод ЖБИ — сайт работодателя'
};
for (const run of runs) {
  const matches=sourceMatches[run.source.name];
  const previousCount=matches ? (previousData.vacancies||[]).filter(v=>matches(v.source)).length : 0;
  if(run.source.status==='ok' && suspiciousSourceDrop(previousCount,run.rows.length)){
    run.source.observed=run.rows.length;
    run.source.found=0;
    run.source.status='blocked';
    run.source.error=`Защитная остановка: источник внезапно вернул ${run.rows.length} вместо прежних ${previousCount}; сохранён предыдущий срез`;
    run.rows=[];
  }
  sources.push(run.source);
  collected.push(...run.rows);
}
for (const run of runs.filter(run=>run.source.status==='blocked')) {
  const matches=sourceMatches[run.source.name]; if(!matches) continue;
  const retained=(previousData.vacancies||[]).filter(v=>matches(v.source) && freshSnapshot(v));
  if(retained.length){ collected.push(...retained.map(v=>({...v,warnings:[...(v.warnings||[]),'Источник временно недоступен; сохранён последний успешный срез']}))); run.source.retained=retained.length; }
}

const curatedAll = await read('data/curated-public.json');
const farpostRun = runs.find(run => run.source.name === 'FarPost');
const liveSources = new Set(runs.filter(run=>run.rows.length).map(run=>run.source.name));
const availableSources = new Set(runs.filter(run=>run.rows.length || run.source.retained).map(run=>run.source.name));
const curatedFresh = curatedAll.filter(freshSnapshot);
const curated = curatedFresh.filter(row => !(row.source === 'FarPost' && availableSources.has('FarPost')) && !(row.source === 'ГдеРабота' && availableSources.has('ГдеРабота')) && !(row.source === 'Спасский завод ЖБИ — сайт работодателя' && liveSources.has('Спасский завод ЖБИ')));
collected.push(...curated);
sources.push({ name:'Проверенные публичные страницы работодателей', mode:'curated', status:'ok', found:curated.length, expired:curatedAll.length-curatedFresh.length, note:farpostRun?.rows.length ? 'Ручной FarPost-срез отключён, так как живой импорт успешен' : 'Включён страховочный FarPost-срез; снимки старше 14 дней не показываются' });

let fallback = false;
const hhRun = runs.find(run => run.source.name === 'HeadHunter');
if (!hhRun?.rows.length) {
  const seed = (await read('data/manual-seed.json')).filter(freshSnapshot);
  collected.push(...seed);
  sources.push({ name:'HeadHunter — последний проверенный срез', mode:'fallback', status:'ok', found:seed.length });
}
fallback = !runs.some(run => run.rows.length);

const storedHistory = await readOr('data/history.json',{});
const processed = processVacancies(collected);
const now = new Date().toISOString();
const reconciled = reconcileHistory(processed.vacancies,previousData.vacancies||[],storedHistory,now);
const vacancies = addOpportunityScores(reconciled.vacancies);
const remote = processed.remote;
const rejected = processed.rejected;
const checked = await read('data/sources.json');
const blocked = sources.filter(source => source.status === 'blocked');
const changeSummary = { new:reconciled.events.filter(event=>event.type==='new').length, changed:reconciled.events.filter(event=>event.type==='changed').length, closed:reconciled.events.filter(event=>event.type==='closed').length };
const report = {
  generatedAt: now,
  updateStatus: fallback ? 'Сетевой доступ к автоматическим источникам заблокирован; сохранены проверенные реальные срезы' : blocked.length ? `Облачный импорт выполнен частично; недоступны: ${blocked.map(x=>x.name).join(', ')}` : 'Облачный импорт выполнен полностью',
  fallback,
  sourcesChecked: checked.length,
  sourcesConnected: sources.filter(s => s.status === 'ok').length,
  sourceRuns: sources,
  raw: collected.length,
  accepted: vacancies.length,
  remote: remote.length,
  rejected,
  stats: stats(vacancies),
  changes: changeSummary,
  policy: 'Основной список: только явный Спасск-Дальний; общерегиональные, другие города, вахта и переезд исключены.'
};

await write('data/vacancies.json', JSON.stringify({ meta: report, vacancies, remote }, null, 2));
await write('data/vacancies.csv', toCsv(vacancies));
await write('data/history.json', JSON.stringify(pruneHistory(reconciled.history,now), null, 2));
await write('data/changes.json', JSON.stringify({ generatedAt:now, summary:changeSummary, events:reconciled.events.slice(0,250) }, null, 2));
await write('data/import-report.json', JSON.stringify(report, null, 2));
await write('data/import-report.md', `# Отчёт импорта\n\nДата: ${now}\n\n- Статус: ${report.updateStatus}\n- Проверено источников: ${report.sourcesChecked}\n- Принято строго по Спасску-Дальнему: ${report.accepted}\n- Отброшено из-за другого города: ${rejected.otherCity}\n- Отброшено без точного города: ${rejected.imprecise}\n- Дубликатов: ${rejected.duplicate}\n- Без опыта: ${report.stats.noExperience}\n- Без высшего образования: ${report.stats.noHigherEducation}\n- Хорошо подходят: ${report.stats.goodFit}\n- Новых с прошлого обновления: ${changeSummary.new}\n- Изменившихся: ${changeSummary.changed}\n- Исчезнувших после повторной проверки: ${changeSummary.closed}\n`);
console.log(JSON.stringify(report, null, 2));
