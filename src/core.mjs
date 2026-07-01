import crypto from 'node:crypto';
import { normalizeSalaryText, salaryNumber } from './salary.mjs';
import { cleanFarpostAddress, cleanFarpostDescription } from './farpost-clean.mjs';
import { isNoExperienceVacancy } from './qualification.mjs';
import { cleanGdeRabotaDescription } from './gderabota-clean.mjs';
import { isDirectVacancyLink } from './source-link.mjs';

export { normalizeSalaryText } from './salary.mjs';

const CITY_RX = /спасск[\s‑–—-]*(дальн(?:ий|ем|его)|дальн)/iu;
const OTHER_CITIES = ['владивосток','уссурийск','артём','артем','находка','дальнереченск','лесозаводск','арсеньев','партизанск','дальнегорск','большой камень','фокино','лучегорск','кировский','сибирцево','черниговка','хороль','покровка','камень-рыболов','кавалерово','славянка','ольга','терней','липовцы','михайловка','раздольное','новошахтинский','светлогорье','благовещенск','магадан','хабаровск','москва','санкт-петербург'];
const PROFILE = ['техподдерж','системн','сетев','компьютер','it','оператор','продав','кассир','кладов','курьер','администратор','помощник','грузчик','достав','пвз','охран','ученик','стаж'];
const FARPOST_NON_CITY = /(?:хасанск|нанайск|надеждинск)\w*\s+район|хабаровск\w*\s+край|(?:^|[^а-яё])(?:село|пос(?:е|ё)лок|пгт)\s+[а-яё]|(?:^|[(,;])\s*[сп]\.\s*[а-яё]|андреевк|ливадия|малмыж|корфовск|вольно[\s‑–—-]*надеждинск|тор\s+надеждинск/iu;
const WORD_EDGE = '[^а-яёa-z0-9]';

export const clean = value => String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
export const stableId = (...parts) => crypto.createHash('sha256').update(parts.map(clean).join('|').toLowerCase()).digest('hex').slice(0, 20);
export const suspiciousSourceDrop = (previousCount,currentCount,minPrevious=20,minRatio=0.55) => previousCount >= minPrevious && currentCount < previousCount * minRatio;

export function classifyLocation(vacancy) {
  const location = clean([vacancy.city, vacancy.address, vacancy.name].join(' ')).toLowerCase();
  const conditions = clean([vacancy.name,vacancy.schedule,vacancy.description].join(' '));
  const remoteMention = /(?:^|\W)(?:полностью\s+)?удал[её]нн(?:ая|ую|ой|о|ый|ые|ого)?(?:\s+работа|\s+формат)?(?:$|\W)|remote/iu.test(conditions);
  const remote = vacancy.remote === true || (remoteMention && !/не\s+удал[её]нн|удал[её]нн[а-яё]*(?:\s+работа)?\s+(?:нет|не предусмотр)/iu.test(conditions));
  const rotation=/вахт/iu.test(conditions) && !/не\s+вахт|вахт\w*\s+не\s+(?:требуется|предусмотрена)/iu.test(conditions);
  const relocation=/переезд/iu.test(conditions) && !/без\s+переезда|переезд\s+не\s+(?:требуется|предусмотрен)/iu.test(conditions);
  if (rotation || relocation) return { accepted: false, bucket: 'otherCity', reason: 'Вахта или переезд исключены из основного списка' };
  if (remote) return { accepted: false, bucket: 'remote', reason: 'Полностью удалённая вакансия вынесена из основного списка' };
  if (/военнослужащ|контрактн\w*\s+служб|(?:^|[^а-яёa-z0-9])СВО(?=$|[^а-яёa-z0-9])/iu.test(vacancy.name + ' ' + conditions)) return { accepted: false, bucket: 'imprecise', reason: 'Фактическое место службы не подтверждено как Спасск-Дальний' };
  if (/FarPost/iu.test(vacancy.source) && /спасск(?:ий|ого|ом)\s+район/iu.test(conditions) && !CITY_RX.test(conditions)) return { accepted:false, bucket:'imprecise', reason:'Указан Спасский район без подтверждения города Спасск-Дальний' };
  if (/FarPost/iu.test(vacancy.source) && FARPOST_NON_CITY.test(conditions)) return { accepted:false, bucket:'otherCity', reason:'В объявлении FarPost указано другое поселение или регион' };
  if (OTHER_CITIES.some(city => location.includes(city))) return { accepted: false, bucket: 'otherCity', reason: 'Указан другой город' };
  const farpostOtherCity = /FarPost/iu.test(vacancy.source) && OTHER_CITIES.some(city => new RegExp(`(?:^|[,;.]\\s*|[^а-яё]г(?:ород)?\\.?\\s+)${city}(?=\\s|,|;|$)`, 'iu').test(conditions));
  if (farpostOtherCity) return { accepted: false, bucket: 'otherCity', reason: 'В объявлении FarPost явно указан другой город' };
  const explicitOtherWorkplace = OTHER_CITIES.some(city => new RegExp(`(?:работа|место работы|работать|объект|офис|склад|магазин)\\s*(?:находится\\s*)?(?:в|:)?\\s*(?:г(?:ороде)?\\.?\\s*)?${city}`, 'iu').test(conditions));
  if (explicitOtherWorkplace) return { accepted: false, bucket: 'otherCity', reason: 'В описании явно указано место работы в другом городе' };
  if (CITY_RX.test(location)) return { accepted: true, bucket: 'local', reason: 'Явно указан Спасск-Дальний' };
  return { accepted: false, bucket: 'imprecise', reason: 'Нет точного указания Спасска-Дальнего' };
}

export function normalizeVacancy(raw) {
  const name = clean(raw.name || raw.title);
  const employer = clean(raw.employer?.name || raw.employer || raw.company || 'Работодатель не указан');
  const rawAddress = clean(raw.address?.raw || raw.address || raw.location || raw.city || 'Спасск-Дальний');
  const source = clean(raw.source?.name || raw.source || 'Источник');
  const address = source === 'FarPost' ? cleanFarpostAddress(rawAddress) : rawAddress;
  const city = clean(raw.area?.name || raw.city || (CITY_RX.test(address) ? 'Спасск-Дальний' : address));
  const salary = typeof raw.salary === 'string' ? normalizeSalaryText(raw.salary) : formatSalary(raw.salary);
  const experience = clean(raw.experience?.name || raw.experience || 'Не указано');
  const education = clean(raw.education || 'Не указано');
  const schedule = clean(raw.schedule?.name || raw.schedule || 'Не указано');
  const rawDescription = clean(raw.description || raw.snippet?.requirement || raw.snippet?.responsibility || 'Подробности — в оригинале вакансии.');
  const description = source === 'FarPost' ? cleanFarpostDescription(rawDescription,name) : source === 'ГдеРабота' ? cleanGdeRabotaDescription(rawDescription,name) : rawDescription;
  const candidateUrl = raw.alternate_url || raw.url || raw.vac_url || '#';
  let url='#';
  try { const parsed=new URL(candidateUrl); if (['http:','https:'].includes(parsed.protocol)) url=parsed.href; } catch { /* invalid and unsafe URLs stay disabled */ }
  const id = clean(raw.id || stableId(source, name, employer, address));
  const warnings = [...new Set((Array.isArray(raw.warnings) ? raw.warnings : []).map(clean).filter(Boolean))];
  if(!isDirectVacancyLink({source,url})) warnings.push('Прямая карточка временно недоступна; ссылка ведёт на источник — найдите вакансию по названию');
  const salaryValue=salaryNumber(salary);
  if (salaryValue > 0 && salaryValue < 15000 && !/(?:за|в)\s+(?:час|день|смену|месяц)|\/\s*(?:час|день|смен|мес)/iu.test(salary)) warnings.push('Сумма может быть указана за смену, день или час — уточните период оплаты в оригинале');
  return { id, name, employer, salary, city, address, experience, education, schedule, description, source, url, publishedAt: raw.published_at || raw.publishedAt || null, checkedAt: raw.checkedAt || new Date().toISOString(), remote: raw.remote === true, active: raw.active !== false, warnings:[...new Set(warnings)] };
}

export function formatSalary(salary) {
  if (!salary) return 'Не указана';
  const fmt = n => n == null ? '' : new Intl.NumberFormat('ru-RU').format(n).replace(/\u00a0/g, ' ');
  const currency = salary.currency === 'RUR' ? '₽' : clean(salary.currency || '₽');
  if (salary.from && salary.to && Number(salary.from) === Number(salary.to)) return `${fmt(salary.from)} ${currency}`;
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
  if (salaryNumber(vacancy.salary) > 0) { score += 5; reasons.push('зарплата указана'); }
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
    const legalForm = new RegExp(`(^|${WORD_EDGE})(?:ооо|оао|пао|ао|ип|тс|фку|кгбуз|кгбусо)(?=$|${WORD_EDGE})`,'giu');
    const simple = value => clean(value).toLowerCase().replace(/ё/g,'е').replace(/спасск[\s‑–—-]*дальн\w*/giu,' ').replace(legalForm,'$1 ').replace(/[^а-яa-z0-9]+/giu,' ').trim();
    const titleText=vacancy.name.replace(/\s+(?:\(\s*)?от\s+\d[\d\s]*\s*(?:₽|р(?:уб(?:\.|ля|лей)?)?)\)?\s*$/iu,'');
    const title = simple(titleText.replace(/\([^)]*(?:улиц|ул\.|спасск|\d)[^)]*\)/giu,' ').replace(/(^|[^а-яё])заработная\s+плата(?=$|[^а-яё]).*$/iu,'$1 '));
    const employerRaw = simple(vacancy.employer);
    const aliases = [['пятероч','пятерочка'],['мегаполис','мегаполис'],['российские железные дороги','ржд'],['ржд','ржд'],['винлаб','винлаб'],['ростелеком','ростелеком'],['лента','лента'],['мтс','мтс']];
    const employer = aliases.find(([needle]) => employerRaw.includes(needle))?.[1] || employerRaw;
    const address = simple(vacancy.address).replace(/(^|[^а-яё])(?:улица|ул|дом|д)(?=$|[^а-яё])/giu,'$1 ').trim();
    const key = [title,employer,address].join('|');
    const specificAddress = address.replace(/(^|[^а-яё])спасск\s+дальний(?=$|[^а-яё])/giu,'$1 ').trim();
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
    return (!query || hay.includes(query)) && (!filters.noExperience || isNoExperienceVacancy(v)) && (!filters.salary || salaryNumber(v.salary) > 0) && (!filters.goodFit || v.score >= 75);
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
    noExperience: vacancies.filter(isNoExperienceVacancy).length,
    noHigherEducation: vacancies.filter(v => !/высш(?:ее|его)|бакалавр|магистр/iu.test(v.education + ' ' + v.description)).length,
    withSalary: vacancies.filter(v => salaryNumber(v.salary) > 0).length,
    goodFit: vacancies.filter(v => v.score >= 75).length,
    newVacancies: vacancies.filter(v => v.isNew).length,
    changedVacancies: vacancies.filter(v => v.changedFields?.length).length,
    strongOpportunities: vacancies.filter(v => v.opportunityScore >= 80).length
  };
}
