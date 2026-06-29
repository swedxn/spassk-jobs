import { fetchText, sleep, stripHtml } from './web-utils.mjs';

const CHANNELS = ['Vakansii_Spasske_dalnem_RF','fareastjob','spasskadmin','spassktoday'];
const JOB_RX = /ваканси|требу(?:ется|ются)|ищем\s+(?:сотруд|работ)|нуж(?:ен|на)\s+(?:сотруд|работ)|приглашаем\s+на\s+работ|набор\s+сотруд/iu;
const SCAM_RX = /крипт|арбитраж|ставк[аи]|инвестиц|выкуп\s+товар|залог|перевод[ыа]?\s+по\s+карт|л[её]гкие деньги|доход\s+без\s+усилий/iu;

function parseMessages(html, channel) {
  const rows=[];
  const rx=/<div\b[^>]*class=["'][^"']*tgme_widget_message_wrap[^"']*["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*tgme_widget_message_wrap|<\/section>|$)/giu;
  for (const wrap of html.matchAll(rx)) {
    const block=wrap[1]; const post=block.match(/data-post=["']([^"']+)["']/i)?.[1];
    const body=block.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/iu)?.[1];
    const text=stripHtml(body);
    if (!post || !text || !JOB_RX.test(text) || SCAM_RX.test(text)) continue;
    if (channel !== 'Vakansii_Spasske_dalnem_RF' && !/спасск[\s‑–—-]*дальн/iu.test(text)) continue;
    const lines=text.split(/\n|[.!?]\s+/).map(x=>x.trim()).filter(Boolean);
    const title=(lines.find(line=>JOB_RX.test(line))||lines[0]||'Вакансия из Telegram').slice(0,150);
    const pay=text.match(/(?:от|до)?\s*\d[\d\s]*(?:[–—-]\s*\d[\d\s]*)?\s*(?:₽|руб)/iu)?.[0]||'Не указана';
    rows.push({id:`tg-${post.replace('/','-')}`,name:title,employer:`Telegram @${channel}`,salary:pay,city:'Спасск-Дальний',address:'Спасск-Дальний (адрес уточнить в посте)',experience:/без опыта/iu.test(text)?'Без опыта':'Не указано',education:'Не указано',schedule:/удал[её]н/iu.test(text)?'Удалённо':'Не указано',description:text.slice(0,1200),source:`Telegram @${channel}`,url:`https://t.me/${post}`,checkedAt:new Date().toISOString(),warnings:['Проверьте работодателя и условия до передачи персональных данных']});
  }
  return rows;
}

export async function importTelegram() {
  const rows=[]; const errors=[];
  for (const channel of CHANNELS) {
    try { rows.push(...parseMessages(await fetchText(`https://t.me/s/${channel}`),channel)); }
    catch(error){ errors.push(`${channel}: ${error.message}`); }
    await sleep(500);
  }
  if (!rows.length && errors.length === CHANNELS.length) throw new Error(`Telegram недоступен: ${errors.join('; ')}`);
  return [...new Map(rows.map(row=>[row.url,row])).values()];
}
