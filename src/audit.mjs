import { classifyLocation, stats } from './core.mjs';
import { parseSourceDate, plausiblePublishedDate } from './date.mjs';
import { salaryNumber } from './salary.mjs';

const LISTING_DATE=/\s(?:сегодня|вчера)(?:\s+в\s+\d{1,2}:\d{2})?(?:\s+\d{1,7})?$|\s\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+20\d{2})?(?:\s+\d{1,7})?$/iu;
const REQUIRED=['id','name','employer','city','address','experience','education','schedule','description','source','url'];

const issue=(code,index,job,detail)=>({code,index,id:job?.id,name:job?.name,source:job?.source,detail});

export function auditVacancies(payload, now = new Date()) {
  const vacancies=Array.isArray(payload) ? payload : payload?.vacancies;
  const meta=Array.isArray(payload) ? null : payload?.meta;
  const errors=[];
  const warnings=[];
  if(!Array.isArray(vacancies)) return {ok:false,errors:[{code:'payload',detail:'vacancies must be an array'}],warnings,summary:{vacancies:0,errors:1,warnings:0}};

  const ids=new Map();
  vacancies.forEach((job,index)=>{
    for(const field of REQUIRED) if(typeof job?.[field] !== 'string' || !job[field].trim()) errors.push(issue('required-field',index,job,field));

    if(ids.has(job.id)) errors.push(issue('duplicate-id',index,job,`also at ${ids.get(job.id)}`));
    else ids.set(job.id,index);

    let url;
    try { url=new URL(job.url); } catch { errors.push(issue('invalid-url',index,job,job.url)); }
    if(url && !['http:','https:'].includes(url.protocol)) errors.push(issue('unsafe-url',index,job,job.url));

    const location=classifyLocation(job);
    if(!location.accepted) errors.push(issue('non-local',index,job,location.reason));
    if(job.active === false) errors.push(issue('inactive-in-main-list',index,job,'active=false'));

    if(job.publishedAt && !parseSourceDate(job.publishedAt)) errors.push(issue('invalid-published-date',index,job,job.publishedAt));
    if(job.publishedAt && !plausiblePublishedDate(job.publishedAt,now)) errors.push(issue('future-published-date',index,job,job.publishedAt));
    for(const field of ['firstSeenAt','lastSeenAt','checkedAt']) {
      if(job[field] && !parseSourceDate(job[field])) errors.push(issue('invalid-date',index,job,`${field}: ${job[field]}`));
    }

    const warningsList=Array.isArray(job.warnings)?job.warnings:[];
    if(new Set(warningsList).size !== warningsList.length) errors.push(issue('duplicate-warnings',index,job,`${warningsList.length} total`));
    if(!Number.isFinite(Number(job.score)) || job.score<0 || job.score>100) errors.push(issue('invalid-score',index,job,job.score));
    if(salaryNumber(job.salary)>0 && !/₽/u.test(job.salary)) warnings.push(issue('salary-currency',index,job,job.salary));
    if(/(\d[\d ]+)\s*[–—-]\s*\1(?:\D|$)/u.test(job.salary||'')) errors.push(issue('repeated-salary',index,job,job.salary));

    if(job.source==='FarPost') {
      if(LISTING_DATE.test(job.address)) errors.push(issue('farpost-address-metadata',index,job,job.address));
      const cityCount=(job.address.match(/Спасск[\s‑–—-]*Дальн/giu)||[]).length;
      if(cityCount>1) errors.push(issue('duplicate-city-in-address',index,job,job.address));
      if(/^[₽Р]\s*["']?\s*>/iu.test(job.description)) errors.push(issue('farpost-description-prefix',index,job,job.description.slice(0,80)));
    }
  });

  if(meta) {
    if(Number(meta.accepted)!==vacancies.length) errors.push({code:'meta-accepted',detail:`${meta.accepted} != ${vacancies.length}`});
    const actual=stats(vacancies);
    for(const key of ['active','noExperience','noHigherEducation','withSalary','goodFit','newVacancies','changedVacancies','strongOpportunities']) {
      if(Number(meta.stats?.[key])!==actual[key]) errors.push({code:'meta-stats',detail:`${key}: ${meta.stats?.[key]} != ${actual[key]}`});
    }
  }

  return {ok:errors.length===0,errors,warnings,summary:{vacancies:vacancies.length,errors:errors.length,warnings:warnings.length}};
}
