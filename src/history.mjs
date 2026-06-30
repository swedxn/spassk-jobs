const TRACKED_FIELDS = ['name','employer','salary','address','experience','education','schedule'];

const same = value => String(value ?? '').replace(/\s+/g,' ').trim();

export function reconcileHistory(vacancies, previous = [], stored = {}, now = new Date().toISOString()) {
  const previousById = new Map(previous.map(item => [item.id,item]));
  const currentIds = new Set(vacancies.map(item => item.id));
  const history = { ...stored };
  const events = [];
  const enriched = vacancies.map(vacancy => {
    const prior = previousById.get(vacancy.id);
    const old = stored[vacancy.id];
    const isNew = !prior && !old;
    const changedFields = prior ? TRACKED_FIELDS.filter(field => same(prior[field]) !== same(vacancy[field])) : [];
    const firstSeenAt = old?.firstSeenAt || prior?.firstSeenAt || (isNew ? now : prior?.checkedAt || now);
    if (isNew) events.push({ type:'new', vacancyId:vacancy.id, name:vacancy.name, source:vacancy.source, at:now });
    if (changedFields.length) events.push({ type:'changed', vacancyId:vacancy.id, name:vacancy.name, source:vacancy.source, fields:changedFields, before:Object.fromEntries(changedFields.map(field=>[field,prior[field]])), after:Object.fromEntries(changedFields.map(field=>[field,vacancy[field]])), at:now });
    history[vacancy.id] = { firstSeenAt, lastSeenAt:now, active:true, missedRuns:0, seenRuns:(old?.seenRuns || 0)+1, lastChangedAt:changedFields.length?now:old?.lastChangedAt||null };
    return { ...vacancy, firstSeenAt, lastSeenAt:now, isNew, changedFields };
  });

  for (const prior of previous) {
    if (currentIds.has(prior.id)) continue;
    const old = stored[prior.id] || { firstSeenAt:prior.firstSeenAt || prior.checkedAt || now, seenRuns:1, missedRuns:0 };
    const missedRuns = (old.missedRuns || 0)+1;
    history[prior.id] = { ...old, lastSeenAt:old.lastSeenAt || prior.checkedAt || now, active:missedRuns < 2, missedRuns };
    if (missedRuns === 2) events.push({ type:'closed', vacancyId:prior.id, name:prior.name, source:prior.source, at:now });
  }
  return { vacancies:enriched, history, events };
}

function salaryValue(value) {
  const numbers = String(value || '').replace(/\s/g,'').match(/\d+/g)?.map(Number) || [];
  const amount = Math.max(...numbers,0);
  return amount >= 15000 && amount <= 500000 ? amount : null;
}

function role(vacancy) {
  const text = `${vacancy.name} ${vacancy.description}`.toLowerCase();
  const groups = [
    ['it',/техподдерж|системн|сетев|компьютер|програм|it\b|связи|электромех/iu],
    ['retail',/продав|кассир|магазин|мерчендайз/iu],
    ['warehouse',/кладов|грузчик|комплектов|склад|сборщик/iu],
    ['delivery',/курьер|достав|экспедитор|водител/iu],
    ['admin',/администратор|менеджер|оператор|документооборот/iu],
    ['service',/повар|пекарь|бариста|официант|уборщик|мойщик|сидел/iu],
    ['security',/охран|безопасност|сторож|инспектор/iu],
    ['production',/слесар|токар|бетон|электро|механик|рабочий|мастер/iu]
  ];
  return groups.find(([,rx])=>rx.test(text))?.[0] || 'other';
}

export function addOpportunityScores(vacancies) {
  const groups = new Map();
  for (const vacancy of vacancies) {
    const value=salaryValue(vacancy.salary); if(!value) continue;
    const key=role(vacancy); groups.set(key,[...(groups.get(key)||[]),value]);
  }
  const medians = new Map([...groups].map(([key,values])=>{values.sort((a,b)=>a-b);return [key,values[Math.floor(values.length/2)]];}));
  return vacancies.map(vacancy => {
    let score=20+Math.round((vacancy.score||0)*0.2); const reasons=[];
    const text=`${vacancy.name} ${vacancy.description} ${vacancy.experience} ${vacancy.education}`;
    if(vacancy.isNew){score+=25;reasons.push('новая вакансия');}
    if(vacancy.changedFields?.includes('salary')){score+=10;reasons.push('зарплата изменилась');}
    if(/без опыта|не требуется/iu.test(text)){score+=15;reasons.push('можно без опыта');}
    if(/обучени|стаж[её]р|ученик|наставник/iu.test(text)){score+=10;reasons.push('есть обучение или наставничество');}
    if(!/высш(?:ее|его)|бакалавр|магистр/iu.test(text)){score+=5;reasons.push('высшее не заявлено');}
    const amount=salaryValue(vacancy.salary); const benchmark=medians.get(role(vacancy));
    if(amount&&benchmark){const ratio=amount/benchmark;if(ratio>=1.25){score+=15;reasons.push('зарплата выше медианы похожих вакансий');}else if(ratio<0.7){score-=5;reasons.push('зарплата ниже медианы похожих вакансий');}}
    else if(amount){score+=5;reasons.push('зарплата указана');}
    if(/HeadHunter|Работа России|Сайт работодателя|МТС|Energybase/iu.test(vacancy.source)){score+=10;reasons.push('источник с повышенным доверием');}
    else if(/FarPost/iu.test(vacancy.source)){score+=4;}
    score-=Math.min(20,(vacancy.warnings?.length||0)*7);
    score=Math.max(0,Math.min(100,score));
    return {...vacancy,opportunityScore:score,opportunity:score>=80?'Срочно посмотреть':score>=60?'Сильная возможность':'Обычная вакансия',opportunityReasons:reasons,marketSalaryMedian:benchmark||null};
  });
}
