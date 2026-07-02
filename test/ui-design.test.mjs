import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isNoHigherEducationVacancy, vacancyFacts } from '../src/qualification.mjs';

const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('карточка вакансии открывается по центру, а не правой шторкой', () => {
  assert.match(styles, /\.modal-layer\s*{[^}]*place-items:\s*center/s);
  assert.doesNotMatch(app, /x:\s*['"]100%['"]/);
  assert.match(app, /scale:\s*0\.94/);
});

test('светлая и тёмная темы сохраняются и применяются до загрузки React', () => {
  assert.match(app, /spassk-jobs-theme-v1/);
  assert.match(app, /document\.startViewTransition/);
  assert.match(styles, /html\[data-theme="dark"\]/);
  assert.match(html, /prefers-color-scheme:\s*dark/);
});

test('диалог вакансии удерживает клавиатурный фокус', () => {
  assert.match(app, /const keepFocusInside/);
  assert.match(app, /data-modal-close/);
  assert.match(app, /aria-modal="true"/);
});

test('минималистичный интерфейс использует собственный бренд и не возвращает лишние подписи', () => {
  assert.match(app, /assets\/brand-mark\.webp/);
  assert.match(app, /Работа в/);
  assert.doesNotMatch(app, /Работа, которая/);
  assert.doesNotMatch(app, /Только точный город/);
  assert.doesNotMatch(app, /Показаны только вакансии/);
  assert.doesNotMatch(app, /Вакансия в Спасске-Дальнем/);
  assert.doesNotMatch(app, /Подходит вам|Сначала подходящие|% совпадение|Почему такой результат/);
});

test('статусы обновления анимированы, а детали вакансии имеют читаемую типографику', () => {
  assert.match(app, /live-orbit/);
  assert.doesNotMatch(app, /В эфире|status-radar/);
  assert.match(styles, /@keyframes signal-ring/);
  assert.match(styles, /\.detail-item strong\s*{[^}]*font-size:\s*16px/s);
});

test('общий каталог фильтрует вакансии без требования высшего образования', () => {
  const open = { education: 'СПО', description: 'Обучение на месте', experience: 'Без опыта', salary: '50 000 ₽', schedule: 'Полный день' };
  const higher = { education: 'Высшее образование', description: 'Требуется диплом бакалавра' };
  assert.equal(isNoHigherEducationVacancy(open), true);
  assert.equal(isNoHigherEducationVacancy(higher), false);
  assert.deepEqual(vacancyFacts(open), ['Можно без опыта', 'Высшее образование не требуется', 'Зарплата указана', 'График: Полный день']);
});
