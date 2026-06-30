import fs from 'node:fs/promises';
import { processVacancies, stats, toCsv } from '../src/core.mjs';
import { importHH } from '../src/importers/hh.mjs';
import { importTrudvsem } from '../src/importers/trudvsem.mjs';
import { importFarpost } from '../src/importers/farpost.mjs';
import { importTelegram } from '../src/importers/telegram.mjs';

const root = new URL('../', import.meta.url);
const read = async name => JSON.parse(await fs.readFile(new URL(name, root), 'utf8'));
const write = (name, data) => fs.writeFile(new URL(name, root), data);
const sources = [];
const collected = [];

const runs = await Promise.all([['HeadHunter', importHH], ['Работа России', importTrudvsem], ['FarPost', importFarpost], ['Публичный Telegram', importTelegram]].map(async ([name, importer]) => {
  try { const rows = await importer(); return { source: { name, mode: 'auto', status: 'ok', found: rows.length }, rows }; }
  catch (error) { return { source: { name, mode: 'auto', status: 'blocked', found: 0, error: String(error.message || error) }, rows: [] }; }
}));
for (const run of runs) { sources.push(run.source); collected.push(...run.rows); }

const curated = await read('data/curated-public.json');
collected.push(...curated);
sources.push({ name:'Проверенные публичные страницы работодателей', mode:'curated', status:'ok', found:curated.length });

let fallback = false;
const hhRun = runs.find(run => run.source.name === 'HeadHunter');
if (!hhRun?.rows.length) {
  const seed = await read('data/manual-seed.json');
  collected.push(...seed);
  sources.push({ name:'HeadHunter — последний проверенный срез', mode:'fallback', status:'ok', found:seed.length });
}
fallback = !runs.some(run => run.rows.length);

const { vacancies, remote, rejected } = processVacancies(collected);
const checked = await read('data/sources.json');
const now = new Date().toISOString();
const blocked = sources.filter(source => source.status === 'blocked');
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
  policy: 'Основной список: только явный Спасск-Дальний; общерегиональные, другие города, вахта и переезд исключены.'
};

await write('data/vacancies.json', JSON.stringify({ meta: report, vacancies, remote }, null, 2));
await write('data/vacancies.csv', toCsv(vacancies));
await write('data/import-report.json', JSON.stringify(report, null, 2));
await write('data/import-report.md', `# Отчёт импорта\n\nДата: ${now}\n\n- Статус: ${report.updateStatus}\n- Проверено источников: ${report.sourcesChecked}\n- Принято строго по Спасску-Дальнему: ${report.accepted}\n- Отброшено из-за другого города: ${rejected.otherCity}\n- Отброшено без точного города: ${rejected.imprecise}\n- Дубликатов: ${rejected.duplicate}\n- Без опыта: ${report.stats.noExperience}\n- Без высшего образования: ${report.stats.noHigherEducation}\n- Хорошо подходят: ${report.stats.goodFit}\n`);
console.log(JSON.stringify(report, null, 2));
