const STATUSES = ['не смотрел','интересно','хочу откликнуться','откликнулся','позвонил','жду ответа','пригласили','отказ','не подходит'];
const storeKey = 'spassk-jobs-tracker-v1';
let tracker = JSON.parse(localStorage.getItem(storeKey) || '{}');
let data = { meta:{}, vacancies:[], remote:[] };
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function saveTracker(){ localStorage.setItem(storeKey, JSON.stringify(tracker)); }
function salaryNumber(value){ return Math.max(...(String(value).replace(/\s/g,'').match(/\d+/g)||['0']).map(Number)); }
function noHigher(v){ return !/высш(?:ее|его)|бакалавр|магистр/iu.test(`${v.education} ${v.description}`); }
function noExp(v){ return /без опыта|не требуется/iu.test(`${v.experience} ${v.description}`); }

function updateMetrics(){
  const s=data.meta.stats||{};
  $('mActive').textContent=s.active??data.vacancies.length;
  $('mSources').textContent=data.meta.sourcesChecked??'—';
  $('mRejected').textContent=(data.meta.rejected?.otherCity||0)+(data.meta.rejected?.imprecise||0);
  $('mNoExp').textContent=s.noExperience??data.vacancies.filter(noExp).length;
  $('mNoHigher').textContent=s.noHigherEducation??data.vacancies.filter(noHigher).length;
  $('mSalary').textContent=s.withSalary??data.vacancies.filter(v=>v.salary!=='Не указана').length;
  $('mGood').textContent=s.goodFit??data.vacancies.filter(v=>v.score>=75).length;
  $('updateStatus').textContent=data.meta.fallback?'Данные сохранены, API недоступен':'Импорт работает';
  $('lastUpdate').textContent=`Последняя проверка: ${new Date(data.meta.generatedAt).toLocaleString('ru-RU',{dateStyle:'medium',timeStyle:'short'})}`;
}

function renderToday(){
  const best=[...data.vacancies].filter(v=>v.active).sort((a,b)=>b.score-a.score||salaryNumber(b.salary)-salaryNumber(a.salary)).slice(0,3);
  $('todayGrid').innerHTML=best.map((v,i)=>`<article class="today-card"><span class="rank">0${i+1} · ${esc(v.fit)}</span><h3>${esc(v.name)}</h3><p>${esc(v.employer)} · ${esc(v.salary)}</p><a href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">Открыть оригинал ↗</a></article>`).join('');
}

function current(){
  const q=$('search').value.trim().toLowerCase();
  let rows=data.vacancies.filter(v=>v.active!==false).filter(v=>!q||`${v.name} ${v.employer} ${v.address} ${v.description}`.toLowerCase().includes(q));
  if($('fNoExp').checked) rows=rows.filter(noExp);
  if($('fNoHigher').checked) rows=rows.filter(noHigher);
  if($('fSalary').checked) rows=rows.filter(v=>v.salary!=='Не указана');
  if($('fGood').checked) rows=rows.filter(v=>v.score>=75);
  if($('fFav').checked) rows=rows.filter(v=>tracker[v.id]?.favorite);
  const sort=$('sort').value;
  rows.sort(sort==='salary'?(a,b)=>salaryNumber(b.salary)-salaryNumber(a.salary):sort==='title'?(a,b)=>a.name.localeCompare(b.name,'ru'):sort==='new'?(a,b)=>String(b.publishedAt||b.checkedAt).localeCompare(String(a.publishedAt||a.checkedAt)):(a,b)=>b.score-a.score);
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
  node.querySelector('.fit').textContent=v.fit;
  node.querySelector('.original').href=v.url;
  node.querySelector('.badges').innerHTML=[noExp(v)?'Без опыта':'',noHigher(v)?'Без высшего':'',v.score>=75?'Хороший выбор':''].filter(Boolean).map(x=>`<span class="badge">${x}</span>`).join('');
  node.querySelector('.reasons').textContent=v.reasons?.length?`Почему: ${v.reasons.join('; ')}.`:'';
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
  try{ const response=await fetch('data/vacancies.json',{cache:'no-store'});if(!response.ok)throw new Error(response.status);data=await response.json();updateMetrics();renderToday();render();await loadSources(); }
  catch(error){$('updateStatus').textContent='Ошибка загрузки данных';$('lastUpdate').textContent='Откройте JSON-экспорт или повторите позже';$('resultCount').textContent='Данные временно недоступны';console.error(error);}
}

['search','sort','fNoExp','fNoHigher','fSalary','fGood','fFav'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',render));
$('trackerExport').addEventListener('click',exportTracker);
$('trackerImport').addEventListener('change',async e=>{try{const parsed=JSON.parse(await e.target.files[0].text());tracker=parsed.tracker||parsed;saveTracker();render();alert('Трекер импортирован');}catch{alert('Не удалось прочитать JSON трекера');}e.target.value='';});
init();
