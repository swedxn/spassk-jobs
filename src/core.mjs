import crypto from 'node:crypto';

const CITY_RX = /спасск[\s‑–—-]*(дальн(?:ий|ем|его)|дальн)/iu;
const OTHER_CITIES = ['владивосток','уссурийск','артём','артем','находка','дальнереченск','лесозаводск','арсеньев','партизанск','дальнегорск','большой камень','фокино','лучегорск','кировский','сибирцево','черниговка','хороль','покровка','камень-рыболов','кавалерово','славянка','ольга','терней','липовцы','михайловка','раздольное','новошахтинский','светлогорье','благовещенск','магадан','хабаровск','москва','санкт-петербург'];
const PROFILE = ['техподдерж','системн','сетев','компьютер','it','оператор','продав','кассир','кладов','курьер','администратор','помощник','грузчик','достав','пвз','охран','ученик','стаж'];

export const clean = value => String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
export const stableId = (...parts) => crypto.createHash('sha256').update(parts.map(clean).join('|').toLowerCase()).digest('hex').slice(0, 20);

export function classifyLocation(vacancy) {
  const location = clean([vacancy.city, vacancy.address, vacancy.name].join(' ')).toLowerCase();
  const conditions = clean(vacancy.schedule + ' ' + vacancy.description);
  const remoteMention = /(?:^|\W)(?:полностью\s+)?удал[её]нн(?:ая|ую|ой|о|ый|ые|ого)?(?:\s+работа|\s+формат)?(?:$|\W)|remote/iu.test(conditions);
  const remote = vacancy.remote === true || (remoteMention && !/не\s+удал[её]нн|удал[её]нн[а-яё]*(?:\s+работа)?\s+(?:нет|не предусмотр)/iu.test(conditions));
  if (remote) return { accepted: false, bucket: 'remote', reason: 'Полностью удалённая вакансия вынесена из основного списка' };
  if (/вахт|переезд/iu.test(conditions)) return { accepted: false, bucket: 'otherCity', reason: 'Вахта или переезд исключены из основного списка' };
  if (/военнослужащ|контрактн\w*\s+служб|\bСВО\b/iu.test(vacancy.name + ' ' + conditions)) return { accepted: false, bucket: 'imprecise', reason: 'Фактическое место службы не подтверждено как Спасск-Дальний' };
  if (/FarPost/iu.test(vacancy.source) && /спасск(?:ий|ого|ом)\s+район/iu.test(conditions) && !CITY_RX.test(conditions)) return { accepted:false, bucket:'imprecise', reason:'Указан Спасский район без подтверждения города Спасск-Дальний' };
  if (OTHER_CITIES.some(city => location.includes(city))) return { accepted: false, bucket: 'otherCity', reason: 'Указан другой город' };
  const farpostOtherCity = /FarPost/iu.test(vacancy.source) && OTHER_CITIES.some(city => new RegExp(`(?:^|[,;.]\\s*|\\bг(?:ород)?\\.?\\s+)${city}(?=\\s|,|;|$)`, 'iu').test(conditions));
  if (farpostOtherCity) return { accepted: false, bucket: 'otherCity', reason: 'В объявлении FarPost явно указан другой город' };
  const explicitOtherWorkplace = OTHER_CITIES.some(city => new RegExp(`(?:работа|место работы|работать|объект|офис|склад|магазин)\\s*(?:находится\\s*)?(?:в|:)?\\s*(?:г(?:ороде)?\\.?\\s*)?${city}`, 'iu').test(conditions));
  if (explicitOtherWorkplace) return { accepted: false, bucket: 'otherCity', reason: 'В описании явно указано место работы в другом городе' };
  if (CITY_RX.test(location)) return { accepted: true, bucket: 'local', reason: 'Явно указан Спасск-Дальний' };
  return { accepted: false, bucket: 'imprecise', reason: 'Нет точного указания Спасска-Дальнего' };
}

export function normalizeVacancy(raw) {
  const name = clean(raw.name || raw.title);
  const employer = clean(raw.employer?.name || raw.employer || raw.company || 'Работодатель не указан');
  const address = clean(raw.address?.raw || raw.address || raw.location || raw.city || 'Спасск-Дальний');
  const city = clean(raw.area?.name || raw.city || (CITY_RX.test(address) ? 'Спасск-Дальний' : address));
  const salary = typeof raw.salary === 'string' ? raw.salary : formatSalary(raw.salary);
  const experience = clean(raw.experience?.name || raw.experience || 'Не указано');
  const education = clean(raw.education || 'Не указано');
  const schedule = clean(raw.schedule?.name || raw.schedule || 'Не указано');
  const description = clean(raw.description || raw.snippet?.requirement || raw.snippet?.responsibility || 'Подробности — в оригинале вакансии.');
  const source = clean(raw.source?.name || raw.source || 'Источник');
  const candidateUrl = raw.alternate_url || raw.url || raw.vac_url || '#';
  let url='#';
  try { const parsed=new URL(candidateUrl); if (['http:','https:'].includes(parsed.protocol)) url=parsed.href; } catch { /* invalid and unsafe URLs stay disabled */ }
  const id = clean(raw.id || stableId(source, name, employer, address));
  return { id, name, employer, salary, city, address, experience, education, schedule, description, source, url, publishedAt: raw.published_at || raw.publishedAt || null, checkedAt: raw.checkedAt || new Date().toISOString(), remote: raw.remote === true, active: raw.active !== false, warnings: Array.isArray(raw.warnings) ? raw.warnings : [] };
}

export function formatSalary(salary) {
  if (!salary) return 'Не указана';
  const fmt = n => n == null ? '' : new Intl.NumberFormat('ru-RU').format(n);
  const currency = salary.currency === 'RUR' ? '₽' : clean(salary.currency || '₽');
  if (salary.from && salary.to) return `${fmt(salary.from)}–${fmt(salary.to)} ${currency}`;
  if (salary.from) return `от ${fmt(salary.from)} ${currency}`;
  if (salary.to) return `до ${fmt(salary.to)} ${currency}`;
  return 'Не указана';
}

export function scoreVacancy(vacancy) {
  const hay = clean([vacancy.name,vacancy.description,vacancy.experience,vacancy.education,vacancy.schedule].join(' ')).toLowerCase();
  let score = 35;
  const reasons = [];
  if (/без опыта|не требуется|готовы обуч|обучение|стаж[её]р|ученик/iu.test(hay)) { score += 25; reasons.push('подходит без опыта или есть обучение'); }
  if (!/высш(?:ее|его)|бакалавр|магистр/iu.test(hay)) { score += 15; reasons.push('высшее образование не заявлено'); }
  const matched = PROFILE.find(word => hay.includes(word));
  if (matched) { score += 20; reasons.push('направление совпадает с интересами'); }
  if (vacancy.salary && vacancy.salary !== 'Не указана') { score += 5; reasons.push('зарплата указана'); }
  if (/1[–-]3|3[–-]6|опыт от|высш/iu.test(hay)) { score -= 25; reasons.push('заявлен опыт или повышенные требования'); }
  if (/вахт|переезд/iu.test(hay)) { score -= 40; reasons.push('есть риск вахты или переезда'); }
  score = Math.max(0, Math.min(100, score));
  return { score, fit: score >= 75 ? 'Хорошо подходит' : score >= 50 ? 'Можно рассмотреть' : 'Слабое совпадение', reasons };
}

export function dedupe(vacancies) {
  const seen = new Set();
  const seenPlaces = new Set();
  const result = [];
  for (const vacancy of vacancies) {
    const simple = value => clean(value).toLowerCase().replace(/ё/g,'е').replace(/спасск[\s‑–—-]*дальн\w*/giu,' ').replace(/\b(?:ооо|оао|пао|ао|ип|тс|фку|кгбуз|кгбусо)\b/giu,' ').replace(/[^а-яa-z0-9]+/giu,' ').trim();
    const title = simple(vacancy.name.replace(/\([^)]*(?:улиц|ул\.|спасск|\d)[^)]*\)/giu,' ').replace(/\bзаработная\s+плата\b.*$/iu,' '));
    const employerRaw = simple(vacancy.employer);
    const aliases = [['пятероч','пятерочка'],['мегаполис','мегаполис'],['российские железные дороги','ржд'],['ржд','ржд'],['винлаб','винлаб'],['ростелеком','ростелеком'],['лента','лента'],['мтс','мтс']];
    const employer = aliases.find(([needle]) => employerRaw.includes(needle))?.[1] || employerRaw;
    const address = simple(vacancy.address).replace(/\b(?:улица|ул|дом|д)\b/giu,' ').trim();
    const key = [title,employer,address].join('|');
    const specificAddress = address.replace(/\bспасск\s+дальний\b/giu,' ').trim();
    const placeKey = specificAddress && !/уточнить|оригинал/iu.test(address) ? [title,specificAddress].join('|') : null;
    if (!seen.has(key) && (!placeKey || !seenPlaces.has(placeKey))) { seen.add(key); if(placeKey)seenPlaces.add(placeKey); result.push(vacancy); }
  }
  return result;
}

export function processVacancies(raw) {
  const normalized = raw.map(normalizeVacancy);
  const rejected = { otherCity: 0, imprecise: 0, remote: 0, duplicate: 0 };
  const local = [];
  const remote = [];
  for (const vacancy of normalized) {
    const geo = classifyLocation(vacancy);
    if (geo.accepted) local.push(vacancy);
    else { rejected[geo.bucket]++; if (geo.bucket === 'remote') remote.push(vacancy); }
  }
  const unique = dedupe(local);
  rejected.duplicate = local.length - unique.length;
  const enriched = unique.map(v => ({ ...v, ...scoreVacancy(v) }));
  return { vacancies: enriched, remote: dedupe(remote).map(v => ({...v,...scoreVacancy(v)})), rejected };
}

export function filterVacancies(vacancies, filters = {}) {
  const query = clean(filters.query).toLowerCase();
  return vacancies.filter(v => {
    const hay = clean(Object.values(v).join(' ')).toLowerCase();
    return (!query || hay.includes(query)) && (!filters.noExperience || /без опыта|не требуется/iu.test(v.experience + ' ' + v.description)) && (!filters.salary || v.salary !== 'Не указана') && (!filters.goodFit || v.score >= 75);
  });
}

export function toCsv(vacancies) {
  const columns = ['id','name','employer','salary','city','address','experience','education','schedule','source','url','score','fit','opportunityScore','opportunity','firstSeenAt','lastSeenAt','isNew','publishedAt','checkedAt'];
  const q = v => `"${String(v ?? '').replaceAll('"','""')}"`;
  return '\uFEFF' + [columns.join(','), ...vacancies.map(v => columns.map(k => q(v[k])).join(','))].join('\n');
}

export function stats(vacancies) {
  return {
    active: vacancies.filter(v => v.active).length,
    noExperience: vacancies.filter(v => /без опыта|не требуется/iu.test(v.experience + ' ' + v.description)).length,
    noHigherEducation: vacancies.filter(v => !/высш(?:ее|его)|бакалавр|магистр/iu.test(v.education + ' ' + v.description)).length,
    withSalary: vacancies.filter(v => v.salary !== 'Не указана').length,
    goodFit: vacancies.filter(v => v.score >= 75).length,
    newVacancies: vacancies.filter(v => v.isNew).length,
    changedVacancies: vacancies.filter(v => v.changedFields?.length).length,
    strongOpportunities: vacancies.filter(v => v.opportunityScore >= 80).length
  };
}
