import fs from 'node:fs/promises';
import { processVacancies, stats, toCsv } from '../src/core.mjs';
import { importHH } from '../src/importers/hh.mjs';
import { importTrudvsem } from '../src/importers/trudvsem.mjs';
import { importFarpost } from '../src/importers/farpost.mjs';
import { importTelegram } from '../src/importers/telegram.mjs';
import { importRabota1000 } from '../src/importers/rabota1000.mjs';
import { importCentrrabota } from '../src/importers/centrrabota.mjs';
import { addOpportunityScores, reconcileHistory } from '../src/history.mjs';

const root = new URL('../', import.meta.url);
const read = async name => JSON.parse(await fs.readFile(new URL(name, root), 'utf8'));
const readOr = async (name, fallback) => { try { return await read(name); } catch { return fallback; } };
const write = (name, data) => fs.writeFile(new URL(name, root), data);
const sources = [];
const collected = [];

const runs = await Promise.all([['HeadHunter', importHH], ['Работа России', importTrudvsem], ['FarPost', importFarpost], ['Публичный Telegram', importTelegram], ['Rabota1000', importRabota1000], ['ЦентрРабота', importCentrrabota]].map(async ([name, importer]) => {
  try { const rows = await importer(); return { source: { name, mode: 'auto', status: 'ok', found: rows.length }, rows }; }
  catch (error) { return { source: { name, mode: 'auto', status: 'blocked', found: 0, error: String(error.message || error) }, rows: [] }; }
}));
for (const run of runs) { sources.push(run.source); collected.push(...run.rows); }

const curatedAll = await read('data/curated-public.json');
const farpostRun = runs.find(run => run.source.name === 'FarPost');
const curated = farpostRun?.rows.length ? curatedAll.filter(row => row.source !== 'FarPost') : curatedAll;
collected.push(...curated);
sources.push({ name:'Проверенные публичные страницы работодателей', mode:'curated', status:'ok', found:curated.length, note:farpostRun?.rows.length ? 'Ручной FarPost-срез отключён, так как живой импорт успешен' : 'Включён страховочный FarPost-срез' });

let fallback = false;
const hhRun = runs.find(run => run.source.name === 'HeadHunter');
if (!hhRun?.rows.length) {
  const seed = await read('data/manual-seed.json');
  collected.push(...seed);
  sources.push({ name:'HeadHunter — последний проверенный срез', mode:'fallback', status:'ok', found:seed.length });
}
fallback = !runs.some(run => run.rows.length);

const previousData = await readOr('data/vacancies.json',{vacancies:[]});
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
await write('data/history.json', JSON.stringify(reconciled.history, null, 2));
await write('data/changes.json', JSON.stringify({ generatedAt:now, summary:changeSummary, events:reconciled.events.slice(0,250) }, null, 2));
await write('data/import-report.json', JSON.stringify(report, null, 2));
await write('data/import-report.md', `# Отчёт импорта\n\nДата: ${now}\n\n- Статус: ${report.updateStatus}\n- Проверено источников: ${report.sourcesChecked}\n- Принято строго по Спасску-Дальнему: ${report.accepted}\n- Отброшено из-за другого города: ${rejected.otherCity}\n- Отброшено без точного города: ${rejected.imprecise}\n- Дубликатов: ${rejected.duplicate}\n- Без опыта: ${report.stats.noExperience}\n- Без высшего образования: ${report.stats.noHigherEducation}\n- Хорошо подходят: ${report.stats.goodFit}\n- Новых с прошлого обновления: ${changeSummary.new}\n- Изменившихся: ${changeSummary.changed}\n- Исчезнувших после повторной проверки: ${changeSummary.closed}\n`);
console.log(JSON.stringify(report, null, 2));
