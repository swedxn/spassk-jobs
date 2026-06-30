const STATUSES = ['не смотрел','интересно','хочу откликнуться','откликнулся','позвонил','жду ответа','пригласили','отказ','не подходит'];
const storeKey = 'spassk-jobs-tracker-v1';
let tracker = JSON.parse(localStorage.getItem(storeKey) || '{}');
let data = { meta:{}, vacancies:[], remote:[] };
let changesData = { summary:{new:0,changed:0,closed:0}, events:[] };
const previousVisit = localStorage.getItem('spassk-jobs-last-visit');
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function saveTracker(){ localStorage.setItem(storeKey, JSON.stringify(tracker)); }
function salaryNumber(value){ return Math.max(...(String(value).replace(/\s/g,'').match(/\d+/g)||['0']).map(Number)); }
function noHigher(v){ return !/высш(?:ее|его)|бакалавр|магистр/iu.test(`${v.education} ${v.description}`); }
function noExp(v){ return /без опыта|не требуется/iu.test(`${v.experience} ${v.description}`); }
function newForUser(v){ return v.isNew || (!!previousVisit && !!v.firstSeenAt && new Date(v.firstSeenAt)>new Date(previousVisit)); }

function updateMetrics(){
  const s=data.meta.stats||{};
  $('mActive').textContent=s.active??data.vacancies.length;
  $('mSources').textContent=data.meta.sourcesChecked??'—';
  $('mRejected').textContent=(data.meta.rejected?.otherCity||0)+(data.meta.rejected?.imprecise||0);
  $('mNoExp').textContent=s.noExperience??data.vacancies.filter(noExp).length;
  $('mNoHigher').textContent=s.noHigherEducation??data.vacancies.filter(noHigher).length;
  $('mSalary').textContent=s.withSalary??data.vacancies.filter(v=>v.salary!=='Не указана').length;
  $('mGood').textContent=s.goodFit??data.vacancies.filter(v=>v.score>=75).length;
  $('mNew').textContent=s.newVacancies??data.vacancies.filter(newForUser).length;
  $('mOpportunity').textContent=s.strongOpportunities??data.vacancies.filter(v=>v.opportunityScore>=80).length;
  $('updateStatus').textContent=data.meta.updateStatus||'Импорт работает';
  $('lastUpdate').textContent=`Последняя проверка: ${new Date(data.meta.generatedAt).toLocaleString('ru-RU',{dateStyle:'medium',timeStyle:'short'})}`;
}

function renderToday(){
  const best=[...data.vacancies].filter(v=>v.active).sort((a,b)=>(b.opportunityScore||0)-(a.opportunityScore||0)||b.score-a.score).slice(0,3);
  $('todayGrid').innerHTML=best.map((v,i)=>`<article class="today-card"><span class="rank">0${i+1} · шанс ${v.opportunityScore||0}/100</span><h3>${esc(v.name)}</h3><p>${esc(v.employer)} · ${esc(v.salary)}</p><a href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">Открыть оригинал ↗</a></article>`).join('');
}

function renderChanges(){
  const summary=changesData.summary||data.meta.changes||{};
  $('cNew').textContent=summary.new||0; $('cChanged').textContent=summary.changed||0; $('cClosed').textContent=summary.closed||0;
  const feed=(changesData.events||[]).slice(0,8);
  $('changeFeed').innerHTML=feed.length?feed.map(event=>{const v=data.vacancies.find(item=>item.id===event.vacancyId);const label=event.type==='new'?'Новая':event.type==='changed'?'Изменилась':'Исчезла';return v?`<a href="${esc(v.url)}" target="_blank" rel="noopener">${label}: ${esc(event.name)}</a>`:`<span>${label}: ${esc(event.name)}</span>`;}).join(''): '<span>Изменений после последнего снимка пока нет.</span>';
}

function current(){
  const q=$('search').value.trim().toLowerCase();
  let rows=data.vacancies.filter(v=>v.active!==false).filter(v=>!q||`${v.name} ${v.employer} ${v.address} ${v.description}`.toLowerCase().includes(q));
  if($('fNoExp').checked) rows=rows.filter(noExp);
  if($('fNoHigher').checked) rows=rows.filter(noHigher);
  if($('fSalary').checked) rows=rows.filter(v=>v.salary!=='Не указана');
  if($('fGood').checked) rows=rows.filter(v=>v.score>=75);
  if($('fNew').checked) rows=rows.filter(newForUser);
  if($('fChanged').checked) rows=rows.filter(v=>v.changedFields?.length);
  if($('fFav').checked) rows=rows.filter(v=>tracker[v.id]?.favorite);
  const sort=$('sort').value;
  rows.sort(sort==='opportunity'?(a,b)=>(b.opportunityScore||0)-(a.opportunityScore||0)||b.score-a.score:sort==='salary'?(a,b)=>salaryNumber(b.salary)-salaryNumber(a.salary):sort==='title'?(a,b)=>a.name.localeCompare(b.name,'ru'):sort==='new'?(a,b)=>String(b.firstSeenAt||b.publishedAt||b.checkedAt).localeCompare(String(a.firstSeenAt||a.publishedAt||a.checkedAt)):(a,b)=>b.score-a.score);
  return rows;
}

function card(v){
  const node=$('cardTemplate').content.firstElementChild.cloneNode(true);
  node.dataset.id=v.id;
  node.querySelector('h3').textContent=v.name;
  node.querySelector('.employer').textContent=v.employer;
  node.querySelector('.salary').textContent=v.salary;
  node.querySelector('.facts').innerHTML=`<span>${esc(v.address)}</span><span>${esc(v.experience)}</span>`;
  node.querySelector('.description').textContent=v.description;
  node.querySelector('.education').textContent=v.education;
  node.querySelector('.schedule').textContent=v.schedule;
  node.querySelector('.source').textContent=v.source;
  node.querySelector('.score strong').textContent=v.score;
  node.querySelector('.opportunity-score strong').textContent=v.opportunityScore??0;
  node.querySelector('.fit').textContent=v.fit;
  node.querySelector('.opportunity').textContent=v.opportunity||'Обычная вакансия';
  node.querySelector('.original').href=v.url;
  node.querySelector('.badges').innerHTML=[newForUser(v)?['Новое','new']:null,v.changedFields?.length?['Изменилось','changed']:null,noExp(v)?['Без опыта','']:null,noHigher(v)?['Без высшего','']:null,v.score>=75?['Хороший выбор','']:null].filter(Boolean).map(([x,c])=>`<span class="badge ${c}">${x}</span>`).join('');
  node.querySelector('.reasons').textContent=[v.reasons?.length?`Fit: ${v.reasons.join('; ')}.`:'',v.opportunityReasons?.length?`Возможность: ${v.opportunityReasons.join('; ')}.`:''].filter(Boolean).join(' ');
  node.querySelector('.warnings').textContent=v.warnings?.length?`Обратите внимание: ${v.warnings.join('; ')}.`:'';
  const fav=node.querySelector('.favorite');
  const setFav=()=>{const on=!!tracker[v.id]?.favorite;fav.classList.toggle('active',on);fav.textContent=on?'★':'☆';fav.setAttribute('aria-label',on?'Убрать из избранного':'Добавить в избранное');}; setFav();
  fav.addEventListener('click',()=>{tracker[v.id]={...tracker[v.id],favorite:!tracker[v.id]?.favorite};saveTracker();setFav();if($('fFav').checked)render();});
  const status=node.querySelector('.application-status');
  status.innerHTML=STATUSES.map(x=>`<option>${x}</option>`).join(''); status.value=tracker[v.id]?.status||STATUSES[0];
  status.addEventListener('change',()=>{tracker[v.id]={...tracker[v.id],status:status.value};saveTracker();});
  const note=node.querySelector('.note'); note.value=tracker[v.id]?.note||'';
  note.addEventListener('input',()=>{tracker[v.id]={...tracker[v.id],note:note.value};saveTracker();});
  return node;
}

function render(){
  const rows=current(); const list=$('vacancyList'); list.replaceChildren(...rows.map(card));
  $('resultCount').textContent=`Найдено: ${rows.length} из ${data.vacancies.length}`; $('empty').hidden=rows.length>0;
}

async function loadSources(){
  const sources=await fetch('data/sources.json').then(r=>r.json());
  $('sourceList').innerHTML=sources.map(s=>`<article class="source-row"><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)} ↗</a><span class="source-state ${s.connected?'on':''}">${s.connected?'подключён':'ручная проверка'}</span><p>${esc(s.access)}</p></article>`).join('');
}

function exportTracker(){ const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),tracker},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='spassk-jobs-tracker.json';a.click();URL.revokeObjectURL(a.href); }

async function init(){
  try{ const response=await fetch('data/vacancies.json',{cache:'no-store'});if(!response.ok)throw new Error(response.status);data=await response.json();changesData=await fetch('data/changes.json',{cache:'no-store'}).then(r=>r.ok?r.json():changesData).catch(()=>changesData);updateMetrics();renderChanges();renderToday();render();await loadSources();localStorage.setItem('spassk-jobs-last-visit',data.meta.generatedAt); }
  catch(error){$('updateStatus').textContent='Ошибка загрузки данных';$('lastUpdate').textContent='Откройте JSON-экспорт или повторите позже';$('resultCount').textContent='Данные временно недоступны';console.error(error);}
}

['search','sort','fNoExp','fNoHigher','fSalary','fGood','fNew','fChanged','fFav'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',render));
$('trackerExport').addEventListener('click',exportTracker);
$('trackerImport').addEventListener('change',async e=>{try{const parsed=JSON.parse(await e.target.files[0].text());tracker=parsed.tracker||parsed;saveTracker();render();alert('Трекер импортирован');}catch{alert('Не удалось прочитать JSON трекера');}e.target.value='';});
init();
