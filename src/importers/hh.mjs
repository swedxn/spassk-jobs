const UA = 'SpasskJobs/1.0 (open-source public-interest aggregator; GitHub repository contact)';

async function json(url) {
  const response = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`HH HTTP ${response.status}`);
  return response.json();
}

function findArea(nodes) {
  for (const node of nodes || []) {
    if (node.name === 'Спасск-Дальний') return node.id;
    const nested = findArea(node.areas);
    if (nested) return nested;
  }
}

export async function importHH() {
  const areaId = findArea(await json('https://api.hh.ru/areas'));
  if (!areaId) throw new Error('HH: код города не найден');
  const first = await json(`https://api.hh.ru/vacancies?area=${areaId}&per_page=100&page=0&order_by=publication_time`);
  const pages = Math.min(first.pages || 1, 20);
  const items = [...first.items];
  for (let page = 1; page < pages; page++) {
    const data = await json(`https://api.hh.ru/vacancies?area=${areaId}&per_page=100&page=${page}&order_by=publication_time`);
    items.push(...data.items);
  }
  return items.map(v => ({ ...v, source: 'HeadHunter', city: v.area?.name, address: v.address?.raw || v.area?.name, description: [v.snippet?.requirement,v.snippet?.responsibility].filter(Boolean).join(' '), education: 'Не указано', checkedAt: new Date().toISOString() }));
}
