export function isDirectVacancyLink(job) {
  let url;
  try { url=new URL(job?.url); } catch { return false; }
  if(job?.source==='HeadHunter') return /\/vacancy\/\d+(?:\/|$)/u.test(url.pathname);
  if(job?.source==='JobLab') return !/\/city\/\d+\/?$/u.test(url.pathname);
  return true;
}

export const sourceLinkLabel = job => isDirectVacancyLink(job) ? 'Открыть оригинал' : 'Открыть источник';
