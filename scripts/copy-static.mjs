import { cp, copyFile, mkdir, writeFile } from 'node:fs/promises';

await mkdir('dist/data', { recursive: true });
await cp('data', 'dist/data', { recursive: true, force: true });
await copyFile('LICENSE', 'dist/LICENSE');
await writeFile('dist/.nojekyll', '');
