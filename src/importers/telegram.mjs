import { fetchText, sleep, stripHtml } from './web-utils.mjs';

const CHANNELS = [
  { name:'Vakansii_Spasske_dalnem_RF', queries:[''] },
  { name:'fareastjob', queries:['', 'Спасск'] },
  { name:'spasskadmin', queries:['', 'вакансия', 'требуется'] },
  { name:'spassktoday', queries:['', 'вакансия', 'требуется'] },
  { name:'yo_spasskd', queries:['вакансия', 'требуется'] },
  { name:'spasskped', queries:['вакансия', 'требуется'] },
  { name:'gimnazia_spd', queries:['вакансия', 'требуется'] },
  { name:'scooll_3', queries:['вакансия', 'требуется'] }
];
const ROLE = 'продав|кассир|водител|грузчик|сотрудник|менеджер|администратор|повар|уборщ|дворник|оператор|кладов|курьер|охран|слесар|электр|инженер|учител|воспитател|врач|медсестр|бухгалтер|специалист|мастер|рабочи[йех]|разнораб|пекар|барист|официант|стаж[её]р|ученик|техник|монт[её]р|сварщик|комплектов|санитар';
const JOB_RX = new RegExp(`ваканси|(?:на\\s+(?:постоянную\\s+)?работу\\s+)?требу(?:ется|ются)\\s+(?:[^\\s,.!?]+\\s+){0,3}(?:${ROLE})|ищем\\s+(?:в\\s+команду\\s+)?(?:${ROLE})|нуж(?:ен|на|ны)\\s+(?:${ROLE})|приглашаем\\s+на\\s+работ|набор\\s+сотруд`, 'iu');
const SCAM_RX = /мошенн|крипт|арбитраж|ставк[аи]|инвестиц|выкуп\s+товар|залог|перевод[ыа]?\s+по\s+карт|л[её]гкие деньги|доход\s+без\s+усилий/iu;
const MAX_AGE_MS = 120 * 24 * 60 * 60 * 1000;

export function parseTelegramMessages(html, channel, now = Date.now()) {
  const rows=[];
  const rx=/<div\b[^>]*class=["'][^"']*tgme_widget_message_wrap[^"']*["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*tgme_widget_message_wrap|<\/section>|$)/giu;
  for (const wrap of html.matchAll(rx)) {
    const block=wrap[1]; const post=block.match(/data-post=["']([^"']+)["']/i)?.[1];
    const body=block.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/iu)?.[1];
    const text=stripHtml(body);
    const publishedAt=block.match(/<time\b[^>]*datetime=["']([^"']+)["']/iu)?.[1] || null;
    if (!post || !text || !JOB_RX.test(text) || SCAM_RX.test(text)) continue;
    if (publishedAt && now - Date.parse(publishedAt) > MAX_AGE_MS) continue;
    if (channel !== 'Vakansii_Spasske_dalnem_RF' && !/спасск[\s‑–—-]*дальн/iu.test(text)) continue;
    const lines=text.split(/\n|[.!?]\s+/).map(x=>x.trim()).filter(Boolean);
    const title=(lines.find(line=>JOB_RX.test(line))||lines[0]||'Вакансия из Telegram').slice(0,150);
    const pay=text.match(/(?:от|до)?\s*\d[\d\s]*(?:[–—-]\s*\d[\d\s]*)?\s*(?:₽|руб)/iu)?.[0]||'Не указана';
    rows.push({id:`tg-${post.replace('/','-')}`,name:title,employer:`Telegram @${channel}`,salary:pay,city:'Спасск-Дальний',address:'Спасск-Дальний (адрес уточнить в посте)',experience:/без опыта|опыт не требуется/iu.test(text)?'Без опыта':'Не указано',education:'Не указано',schedule:/удал[её]н/iu.test(text)?'Удалённо':'Не указано',description:text.slice(0,1200),source:`Telegram @${channel}`,url:`https://t.me/${post}`,publishedAt,checkedAt:new Date().toISOString(),warnings:['Проверьте работодателя и условия до передачи персональных данных']});
  }
  return rows;
}

export async function importTelegram() {
  const rows=[]; const errors=[];
  for (const channel of CHANNELS) {
    for (const query of channel.queries) {
      const url = `https://t.me/s/${channel.name}${query ? `?q=${encodeURIComponent(query)}` : ''}`;
      try { rows.push(...parseTelegramMessages(await fetchText(url),channel.name)); }
      catch(error){ errors.push(`${channel.name}${query ? ` [${query}]` : ''}: ${error.message}`); }
      await sleep(350);
    }
  }
  const requestCount = CHANNELS.reduce((sum, channel) => sum + channel.queries.length, 0);
  if (!rows.length && errors.length === requestCount) throw new Error(`Telegram недоступен: ${errors.join('; ')}`);
  return [...new Map(rows.map(row=>[row.url,row])).values()];
}
