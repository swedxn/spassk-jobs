export async function importTrudvsem() {
  const url = 'https://opendata.trudvsem.ru/api/v1/vacancies/region/%D0%9F%D1%80%D0%B8%D0%BC%D0%BE%D1%80%D1%81%D0%BA%D0%B8%D0%B9%20%D0%BA%D1%80%D0%B0%D0%B9';
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'SpasskJobs/1.0 open-source aggregator' }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Работа России HTTP ${response.status}`);
  const data = await response.json();
  const rows = data?.results?.vacancies || data?.vacancies || [];
  return rows.map(row => {
    const v = row.vacancy || row;
    return { id: `trudvsem-${v.id || v.vac_url}`, name: v['job-name'], employer: v.company?.name, salary: v.salary, city: v.region?.name, address: v.addresses?.address?.[0]?.location || v.region?.name, experience: v.requirement?.experience || 'Не указано', education: v.requirement?.education || 'Не указано', schedule: v['schedule'] || v.employment || 'Не указано', description: [v.duty,v.requirement?.qualification].filter(Boolean).join(' '), source: 'Работа России', url: v.vac_url, publishedAt: v['creation-date'], checkedAt: new Date().toISOString() };
  });
}
