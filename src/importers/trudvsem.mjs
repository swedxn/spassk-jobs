export async function importTrudvsem() {
  const base = 'https://opendata.trudvsem.ru/api/v1/vacancies';
  const rows = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const url = `${base}?text=${encodeURIComponent('Спасск-Дальний')}&limit=100&offset=${offset}`;
    const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'SpasskJobs/1.0 open-source aggregator' }, signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw new Error(`Работа России HTTP ${response.status}`);
    const data = await response.json();
    const page = data?.results?.vacancies || data?.vacancies || [];
    rows.push(...page);
    const total = Number(data?.meta?.total || rows.length);
    if (!page.length || rows.length >= total) break;
  }
  return rows.map(row => {
    const v = row.vacancy || row;
    const addresses = Array.isArray(v.addresses?.address) ? v.addresses.address : v.addresses?.address ? [v.addresses.address] : [];
    return { id: `trudvsem-${v.id || v.vac_url}`, name: v['job-name'], employer: v.company?.name, salary: v.salary, city: v.region?.name, address: addresses.map(x=>x?.location).filter(Boolean).join('; ') || v.region?.name, experience: v.requirement?.experience || 'Не указано', education: v.requirement?.education || 'Не указано', schedule: v['schedule'] || v.employment || 'Не указано', description: [v.duty,v.requirement?.qualification].filter(Boolean).join(' '), source: 'Работа России', url: v.vac_url, publishedAt: v['creation-date'], checkedAt: new Date().toISOString() };
  });
}
