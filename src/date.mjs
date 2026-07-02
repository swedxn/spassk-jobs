const MONTHS = {
  январь:0, января:0, янв:0,
  февраль:1, февраля:1, фев:1,
  март:2, марта:2, мар:2,
  апрель:3, апреля:3, апр:3,
  май:4, мая:4,
  июнь:5, июня:5, июн:5,
  июль:6, июля:6, июл:6,
  август:7, августа:7, авг:7,
  сентябрь:8, сентября:8, сен:8, сент:8,
  октябрь:9, октября:9, окт:9,
  ноябрь:10, ноября:10, ноя:10,
  декабрь:11, декабря:11, дек:11,
};

const vladivostokParts = (value = new Date()) => Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Vladivostok', year:'numeric', month:'2-digit', day:'2-digit',
  }).formatToParts(value).filter(part => part.type !== 'literal').map(part => [part.type,Number(part.value)]),
);

const isoDay = (year,month,day) => `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
const validCalendarDate = (year,month,day) => {
  const date=new Date(Date.UTC(year,month,day,12));
  return date.getUTCFullYear()===year && date.getUTCMonth()===month && date.getUTCDate()===day ? date : null;
};

export function parseSourceDate(value) {
  if (!value) return null;
  const text=String(value).trim().toLocaleLowerCase('ru-RU').replace(/\.$/u,'');
  const russian=text.match(/^(\d{1,2})\s+([а-яё.]+)(?:\s+(20\d{2}))?/iu);
  if (russian) {
    const month=MONTHS[russian[2].replace(/\.$/u,'')];
    if (month !== undefined) return validCalendarDate(Number(russian[3] || vladivostokParts().year),month,Number(russian[1]));
  }
  const iso=text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|t)/iu);
  if (iso && !validCalendarDate(Number(iso[1]),Number(iso[2])-1,Number(iso[3]))) return null;
  const parsed=new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseFarpostPublishedAt(text, now = new Date()) {
  const source=String(text || '');
  const relative=source.match(/(?:^|\s)(сегодня|вчера)(?:\s+в\s+(\d{1,2}):(\d{2}))?/iu);
  const current=vladivostokParts(now);
  if (relative) {
    const base=new Date(Date.UTC(current.year,current.month-1,current.day,12));
    if (relative[1].toLocaleLowerCase('ru-RU') === 'вчера') base.setUTCDate(base.getUTCDate()-1);
    const date=isoDay(base.getUTCFullYear(),base.getUTCMonth(),base.getUTCDate());
    if(relative[2] && (Number(relative[2])>23 || Number(relative[3])>59)) return null;
    return relative[2] ? `${date}T${String(relative[2]).padStart(2,'0')}:${relative[3]}:00+10:00` : date;
  }

  const absolute=source.match(/(?:^|\s)(\d{1,2})\s+([а-яё.]+)(?:\s+(20\d{2}))?/iu);
  if (!absolute) return null;
  const month=MONTHS[absolute[2].toLocaleLowerCase('ru-RU').replace(/\.$/u,'')];
  if (month === undefined) return null;
  const explicitYear=Number(absolute[3]);
  // FarPost places the view counter immediately after the date. A counter such
  // as "2035" must not become the publication year.
  const hasCredibleYear=Boolean(explicitYear && explicitYear <= current.year);
  let year=hasCredibleYear ? explicitYear : current.year;
  const day=Number(absolute[1]);
  const candidate=validCalendarDate(year,month,day);
  if(!candidate) return null;
  const today=new Date(Date.UTC(current.year,current.month-1,current.day,12));
  if (!hasCredibleYear && candidate.getTime() > today.getTime()+31*86400000) year-=1;
  return isoDay(year,month,day);
}

export function plausiblePublishedDate(value, now = new Date()) {
  const date=parseSourceDate(value);
  if (!date) return null;
  return date.getTime() <= now.getTime()+36*60*60*1000 ? date : null;
}

export function jobDateValue(job, now = new Date()) {
  const published=plausiblePublishedDate(job.publishedAt,now);
  return (published || parseSourceDate(job.firstSeenAt || job.checkedAt))?.getTime() || 0;
}

function formatDate(value, options, parsedDate = null) {
  const date=parsedDate || parseSourceDate(value);
  if (!date) return null;
  return new Intl.DateTimeFormat('ru-RU', { timeZone:'Asia/Vladivostok', ...options }).format(date).replace(/\s+г\.$/u,'');
}

export function publicationInfo(job, now = new Date()) {
  const published=plausiblePublishedDate(job.publishedAt,now);
  const publishedDate=published && formatDate(job.publishedAt,{day:'numeric',month:'long',year:'numeric'},published);
  const publishedTime=published && String(job.publishedAt || '').includes('T')
    ? formatDate(job.publishedAt,{hour:'2-digit',minute:'2-digit'},published)
    : null;
  const publishedShort=published && formatDate(job.publishedAt,{day:'numeric',month:'short'},published);
  if (publishedDate) return {
    label:'Дата',
    full:`На сайте: ${publishedDate}${publishedTime ? `, ${publishedTime}` : ''}`,
    short:`На сайте ${publishedShort}`,
  };

  const seen=job.firstSeenAt || job.checkedAt;
  const seenFull=formatDate(seen,{day:'numeric',month:'long',year:'numeric'});
  const seenShort=formatDate(seen,{day:'numeric',month:'short'});
  return {
    label:'Даты',
    full:seenFull ? `На сайте: не указана\nДобавлена: ${seenFull}` : 'Дата публикации: неизвестна',
    short:seenShort ? `Найдена ${seenShort}` : 'Дата неизвестна',
  };
}
