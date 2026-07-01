const MONTHS='января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря';
const escapeRx=value=>String(value||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

export function cleanGdeRabotaDescription(value,name='') {
  let text=String(value||'').replace(/\s+/g,' ').trim();
  if(name) text=text.replace(new RegExp(`^${escapeRx(name)}(?:\\s+|$)`,'iu'),'').trim();
  text=text
    .replace(/^(?:от\s+|до\s+)?\d[\d\s]*(?:\s*[–—-]\s*\d[\d\s]*)?\s*₽\s*/iu,'')
    .replace(new RegExp(`^\\d{1,2}\\s+(?:${MONTHS})\\s+20\\d{2}(?:,\\s*\\d{1,2}:\\d{2})?\\s*`,'iu'),'')
    .replace(/^(?:без опыта|опыт не требуется|от\s+\d+\s+(?:года|лет)(?:\s+до\s+\d+\s+лет)?)\s*/iu,'')
    .replace(/^(?:полная|частичная|проектная)\s+занятость\s*/iu,'')
    .replace(/^(?:полный день|сменный график|гибкий график|удал[её]нн\w*|вахт\w*)\s*/iu,'')
    .trim();
  return text || 'Подробные обязанности и условия указаны в оригинале объявления.';
}
