const UA = 'SpasskJobs/1.0 (+https://github.com/swedxn/spassk-jobs; public-interest vacancy aggregator)';

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const stripHtml = html => String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/\s+/g, ' ').trim();

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
  return new RegExp('^' + value.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*') + '');
}

export async function assertRobotsAllowed(url) {
  const target = new URL(url);
  const robotsUrl = `${target.origin}/robots.txt`;
  let robots;
  try { robots = await fetchText(robotsUrl, 15000); }
  catch (error) { throw new Error(`robots.txt недоступен — импорт отменён безопасно: ${error.message}`); }
  const lines = robots.split(/\r?\n/).map(line => line.replace(/#.*/, '').trim()).filter(Boolean);
  let applies = false;
  const rules = [];
  for (const line of lines) {
    const [rawKey, ...tail] = line.split(':'); const key = rawKey.toLowerCase(); const value = tail.join(':').trim();
    if (key === 'user-agent') { applies = value === '*' || /spasskjobs/i.test(value); continue; }
    if (applies && (key === 'allow' || key === 'disallow') && value) rules.push({ allow:key === 'allow', value });
  }
  const path = target.pathname + target.search;
  const matched = rules.filter(rule => patternRx(rule.value).test(path)).sort((a,b) => b.value.length - a.value.length)[0];
  if (matched && !matched.allow) throw new Error(`robots.txt запрещает путь ${target.pathname}`);
  return true;
}
