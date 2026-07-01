import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

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
