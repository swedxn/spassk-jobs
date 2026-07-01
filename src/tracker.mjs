export const TRACKER_STATUSES = [
  'не смотрел',
  'интересно',
  'хочу откликнуться',
  'откликнулся',
  'позвонил',
  'жду ответа',
  'пригласили',
  'отказ',
  'не подходит',
];

export function sanitizeTracker(value) {
  if(!value || typeof value!=='object' || Array.isArray(value)) return {};
  const result={};
  for(const [id,state] of Object.entries(value)) {
    if(!id || !state || typeof state!=='object' || Array.isArray(state)) continue;
    const clean={};
    if(typeof state.favorite==='boolean') clean.favorite=state.favorite;
    if(TRACKER_STATUSES.includes(state.status)) clean.status=state.status;
    if(typeof state.note==='string') clean.note=state.note.slice(0,5000);
    if(Object.keys(clean).length) result[id]=clean;
  }
  return result;
}
