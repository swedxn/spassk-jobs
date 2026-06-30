const UA = 'SpasskJobs/1.0 (+https://github.com/swedxn/spassk-jobs; public-interest vacancy aggregator)';

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const ENTITIES = { nbsp:' ', amp:'&', quot:'"', apos:"'", lt:'<', gt:'>', ndash:'–', mdash:'—', laquo:'«', raquo:'»', hellip:'…', copy:'©', reg:'®', rub:'₽' };
export const decodeEntities = value => String(value || '')
  .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
  .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
  .replace(/&([a-z]+);/gi,(match,name)=>ENTITIES[name.toLowerCase()] ?? match);
export const stripHtml = html => decodeEntities(String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export async function fetchText(url, timeout = 25000) {
  const response = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5' }, signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`${new URL(url).hostname} HTTP ${response.status}`);
  const charset = response.headers.get('content-type')?.match(/charset=([^;\s]+)/i)?.[1]?.replace(/["']/g,'') || 'utf-8';
  const bytes = await response.arrayBuffer();
  try {
    const decoded = new TextDecoder(charset).decode(bytes);
    const broken = (decoded.match(/�/g) || []).length;
    return broken > 5 ? new TextDecoder('windows-1251').decode(bytes) : decoded;
  } catch { return new TextDecoder('utf-8').decode(bytes); }
}

function patternRx(value) {
  const terminal = value.endsWith('$');
  const body = (terminal ? value.slice(0,-1) : value).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
  return new RegExp(`^${body}${terminal ? '$' : ''}`);
}

export function robotsAllows(robots, url, userAgent = 'SpasskJobs') {
  const target = new URL(url);
  const lines = robots.split(/\r?\n/).map(line => line.replace(/#.*/, '').trim()).filter(Boolean);
  const groups=[]; let group={agents:[],rules:[]};
  for (const line of lines) {
    const [rawKey, ...tail] = line.split(':'); const key = rawKey.toLowerCase(); const value = tail.join(':').trim();
    if (key === 'user-agent') {
      if (group.rules.length) { groups.push(group); group={agents:[],rules:[]}; }
      group.agents.push(value.toLowerCase());
      continue;
    }
    if ((key === 'allow' || key === 'disallow') && group.agents.length) group.rules.push({ allow:key === 'allow', value });
  }
  if (group.agents.length) groups.push(group);
  const ua=userAgent.toLowerCase();
  const exact=groups.filter(item=>item.agents.some(agent=>agent !== '*' && ua.includes(agent)));
  const selected=exact.length ? exact : groups.filter(item=>item.agents.includes('*'));
  const rules=selected.flatMap(item=>item.rules).filter(rule=>rule.value);
  const path = target.pathname + target.search;
  const matched = rules.filter(rule => patternRx(rule.value).test(path)).sort((a,b) => b.value.length - a.value.length || Number(b.allow)-Number(a.allow))[0];
  return !matched || matched.allow;
}

export async function assertRobotsAllowed(url) {
  const target = new URL(url);
  const robotsUrl = `${target.origin}/robots.txt`;
  let response;
  try { response = await fetch(robotsUrl, { headers:{'User-Agent':UA,Accept:'text/plain,*/*;q=0.5'}, signal:AbortSignal.timeout(15000) }); }
  catch (error) { throw new Error(`robots.txt недоступен — импорт отменён безопасно: ${error.message}`); }
  if (response.status === 404 || response.status === 410) return true;
  if (!response.ok) throw new Error(`robots.txt недоступен — импорт отменён безопасно: ${target.hostname} HTTP ${response.status}`);
  const robots=await response.text();
  if (!robotsAllows(robots,url)) throw new Error(`robots.txt запрещает путь ${target.pathname}`);
  return true;
}
