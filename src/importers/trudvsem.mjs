const API='https://opendata.trudvsem.ru/api/v1/vacancies';
const CITY_KLADR='2500001000000';

async function fetchPages(endpoint) {
  const rows=[];
  for(let offset=0;offset<3000;offset+=100){
    const join=endpoint.includes('?')?'&':'?';
    const url=`${endpoint}${join}limit=100&offset=${offset}`;
    const response=await fetch(url,{headers:{Accept:'application/json','User-Agent':'SpasskJobs/1.0 open-source aggregator'},signal:AbortSignal.timeout(25000)});
    if(!response.ok) throw new Error(`${new URL(endpoint).pathname} HTTP ${response.status}`);
    const data=await response.json();
    const page=data?.results?.vacancies || data?.vacancies || [];
    rows.push(...page);
    const total=Number(data?.meta?.total ?? rows.length);
    if(!page.length || page.length<100 || rows.length>=total) break;
  }
  return rows;
}

export async function importTrudvsem() {
  const endpoints=[`${API}/region/${CITY_KLADR}`,`${API}?text=${encodeURIComponent('Спасск-Дальний')}`];
  const attempts=await Promise.allSettled(endpoints.map(fetchPages));
  const rows=attempts.flatMap(result=>result.status==='fulfilled'?result.value:[]);
  if(!rows.length && attempts.every(result=>result.status==='rejected')) throw new Error(`Работа России недоступна: ${attempts.map(result=>result.reason?.message).join('; ')}`);
  const unique=[...new Map(rows.map(row=>{const v=row.vacancy||row;return [String(v.id||v.vac_url),row];})).values()];
  return unique.map(row => {
    const v = row.vacancy || row;
    const addresses = Array.isArray(v.addresses?.address) ? v.addresses.address : v.addresses?.address ? [v.addresses.address] : [];
    return { id: `trudvsem-${v.id || v.vac_url}`, name: v['job-name'], employer: v.company?.name, salary: v.salary, city: v.region?.name, address: addresses.map(x=>x?.location).filter(Boolean).join('; ') || v.region?.name, experience: v.requirement?.experience || 'Не указано', education: v.requirement?.education || 'Не указано', schedule: v['schedule'] || v.employment || 'Не указано', description: [v.duty,v.requirement?.qualification].filter(Boolean).join(' '), source: 'Работа России', url: v.vac_url, publishedAt: v['creation-date'], checkedAt: new Date().toISOString() };
  });
}
