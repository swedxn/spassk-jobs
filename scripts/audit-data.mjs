import fs from 'node:fs/promises';
import { auditVacancies } from '../src/audit.mjs';

const payload=JSON.parse(await fs.readFile(new URL('../data/vacancies.json',import.meta.url),'utf8'));
const result=auditVacancies(payload);
console.log(JSON.stringify(result,null,2));
if(!result.ok) process.exitCode=1;
