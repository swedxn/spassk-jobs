const STATUSES=['не смотрел','интересно','хочу откликнуться','откликнулся','позвонил','жду ответа','пригласили','отказ','не подходит'];
const storeKey='spassk-jobs-tracker-v1';
let tracker={};
try{tracker=JSON.parse(localStorage.getItem(storeKey)||'{}')}catch{localStorage.removeItem(storeKey)}
let data={meta:{},vacancies:[],remote:[]};
let changesData={summary:{new:0,changed:0,closed:0},events:[]};
let visibleLimit=40;
const previousVisit=localStorage.getItem('spassk-jobs-last-visit');
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const safeUrl=value=>{try{const url=new URL(value,location.href);return ['http:','https:'].includes(url.protocol)?url.href:'#'}catch{return '#'}};
const saveTracker=()=>localStorage.setItem(storeKey,JSON.stringify(tracker));
const salaryNumber=value=>Math.max(...(String(value).replace(/\s/g,'').match(/\d+/g)||['0']).map(Number));
const noExp=v=>/без опыта|не требуется/iu.test(`${v.experience} ${v.description}`);
const newForUser=v=>v.isNew||Boolean(previousVisit&&v.firstSeenAt&&new Date(v.firstSeenAt)>new Date(previousVisit));

function animateNumber(element,value){
  if(!element)return;
  const target=Number(value);
  if(!Number.isFinite(target)||matchMedia('(prefers-reduced-motion: reduce)').matches){element.textContent=value;return}
  const started=performance.now();
  const frame=now=>{const progress=Math.min(1,(now-started)/700);const eased=1-Math.pow(1-progress,3);element.textContent=Math.round(target*eased).toLocaleString('ru-RU');if(progress<1)requestAnimationFrame(frame)};
  requestAnimationFrame(frame);
}

function updateMetrics(){
  const s=data.meta.stats||{};
  const values={mActive:s.active??data.vacancies.length,mSources:data.meta.sourcesChecked??'—',mRejected:(data.meta.rejected?.otherCity||0)+(data.meta.rejected?.imprecise||0),mNoExp:s.noExperience??data.vacancies.filter(noExp).length,mNoHigher:s.noHigherEducation??'—',mSalary:s.withSalary??'—',mGood:s.goodFit??'—',mNew:s.newVacancies??0,mOpportunity:s.strongOpportunities??0};
  Object.entries(values).forEach(([id,value])=>animateNumber($(id),value));
  $('updateStatus').textContent=(data.meta.updateStatus||'Импорт работает').replace('Облачный импорт выполнен частично; недоступны:','Часть источников временно недоступна:');
  $('lastUpdate').textContent=`Обновлено ${new Date(data.meta.generatedAt).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}`;
}

function renderToday(){
  const best=[...data.vacancies].filter(v=>v.active!==false).sort((a,b)=>(b.opportunityScore||0)-(a.opportunityScore||0)||b.score-a.score).slice(0,3);
  $('todayGrid').innerHTML=best.map((v,i)=>`<article class="today-card reveal-card" style="--order:${i}"><span class="rank">0${i+1} / СОВПАДЕНИЕ ${v.score||0}%</span><h3>${esc(v.name)}</h3><p>${esc(v.employer)}<br>${esc(v.salary)}</p><a href="${esc(safeUrl(v.url))}" target="_blank" rel="noopener noreferrer"><span>Открыть оригинал</span><span>↗</span></a></article>`).join('');
}

function renderChanges(){
  const summary=changesData.summary||data.meta.changes||{};
  $('cNew').textContent=summary.new||0;$('cChanged').textContent=summary.changed||0;$('cClosed').textContent=summary.closed||0;
  const feed=(changesData.events||[]).slice(0,8);
  $('changeFeed').innerHTML=feed.map(event=>`<span>${esc(event.type)}: ${esc(event.name)}</span>`).join('');
}

function activeFilters(){return [$('fGood'),$('fNoExp'),$('fSalary'),$('fFav')].filter(input=>input.checked).length+Number(Boolean($('search').value.trim()))}

function current(){
  const q=$('search').value.trim().toLowerCase();
  let rows=data.vacancies.filter(v=>v.active!==false).filter(v=>!q||`${v.name} ${v.employer} ${v.address} ${v.description}`.toLowerCase().includes(q));
  if($('fGood').checked)rows=rows.filter(v=>v.score>=75);
  if($('fNoExp').checked)rows=rows.filter(noExp);
  if($('fSalary').checked)rows=rows.filter(v=>v.salary!=='Не указана');
  if($('fFav').checked)rows=rows.filter(v=>tracker[v.id]?.favorite);
  const sort=$('sort').value;
  rows.sort(sort==='salary'?(a,b)=>salaryNumber(b.salary)-salaryNumber(a.salary):sort==='new'?(a,b)=>String(b.firstSeenAt||b.publishedAt||b.checkedAt).localeCompare(String(a.firstSeenAt||a.publishedAt||a.checkedAt)):(a,b)=>(b.opportunityScore||0)-(a.opportunityScore||0)||b.score-a.score);
  return rows;
}

function card(v,index=0){
  const node=$('cardTemplate').content.firstElementChild.cloneNode(true);
  node.dataset.id=v.id;node.style.setProperty('--order',index);
  node.querySelector('h3').textContent=v.name;
  node.querySelector('.employer').textContent=v.employer;
  node.querySelector('.salary').textContent=v.salary;
  node.querySelector('.facts').innerHTML=`<span>${esc(v.address)}</span><span>${esc(v.experience)}</span>`;
  node.querySelector('.description').textContent=v.description;
  node.querySelector('.education').textContent=v.education;
  node.querySelector('.schedule').textContent=v.schedule;
  node.querySelector('.source').textContent=v.source;
  const ring=node.querySelector('.match-ring');ring.style.setProperty('--score',v.score||0);ring.querySelector('strong').textContent=v.score||0;
  node.querySelector('.fit').textContent=v.fit;
  node.querySelector('.opportunity').textContent=v.opportunity||'Обычная вакансия';
  node.querySelector('.original').href=safeUrl(v.url);
  node.querySelector('.badges').innerHTML=[newForUser(v)?['Новое','new']:null,v.changedFields?.length?['Обновлено','changed']:null,noExp(v)?['Без опыта','']:null,v.score>=75?['Подходит','']:null].filter(Boolean).map(([label,cls])=>`<span class="badge ${cls}">${label}</span>`).join('');
  node.querySelector('.reasons').textContent=v.reasons?.length?`Почему подходит: ${v.reasons.join(' · ')}`:'';
  node.querySelector('.warnings').textContent=v.warnings?.length?`Обратите внимание: ${v.warnings.join(' · ')}`:'';
  const details=node.querySelector('.job-details');details.addEventListener('toggle',()=>node.classList.toggle('expanded',details.open));
  const fav=node.querySelector('.favorite');
  const setFav=()=>{const on=Boolean(tracker[v.id]?.favorite);fav.classList.toggle('active',on);fav.textContent=on?'★':'☆';fav.setAttribute('aria-label',on?'Убрать из избранного':'Добавить в избранное')};setFav();
  fav.addEventListener('click',()=>{tracker[v.id]={...tracker[v.id],favorite:!tracker[v.id]?.favorite};saveTracker();setFav();if($('fFav').checked)render()});
  const status=node.querySelector('.application-status');status.innerHTML=STATUSES.map(value=>`<option>${value}</option>`).join('');status.value=tracker[v.id]?.status||STATUSES[0];
  status.addEventListener('change',()=>{tracker[v.id]={...tracker[v.id],status:status.value};saveTracker()});
  const note=node.querySelector('.note');note.value=tracker[v.id]?.note||'';note.addEventListener('input',()=>{tracker[v.id]={...tracker[v.id],note:note.value};saveTracker()});
  return node;
}

function render(){
  const rows=current();const shown=rows.slice(0,visibleLimit);$('vacancyList').replaceChildren(...shown.map(card));
  $('resultCount').textContent=`${rows.length.toLocaleString('ru-RU')} ${rows.length===1?'вакансия':'вакансий'}`;
  $('empty').hidden=rows.length>0;
  $('loadMore').hidden=shown.length>=rows.length;$('loadMore').innerHTML=`Показать ещё ${Math.min(40,rows.length-shown.length)} <span>↓</span>`;
  $('clearFilters').hidden=activeFilters()===0;
}

function resetFilters(){
  $('search').value='';['fGood','fNoExp','fSalary','fFav'].forEach(id=>$(id).checked=false);$('sort').value='opportunity';visibleLimit=40;render();
}

function renderRemote(){
  const rows=(data.remote||[]).filter(v=>v.active!==false);$('remoteVacancies').hidden=!rows.length;
  if(rows.length){$('remoteList').replaceChildren(...rows.map(card));$('remoteCount').textContent=`Найдено: ${rows.length}`}
}

async function loadSources(){
  const sources=await fetch('data/sources.json').then(response=>response.json());
  $('sourceList').innerHTML=sources.map(source=>`<article class="source-row"><a href="${esc(safeUrl(source.url))}" target="_blank" rel="noopener noreferrer">${esc(source.name)} ↗</a><span class="source-state ${source.connected?'on':''}">${source.connected?'подключён':'вручную'}</span><p>${esc(source.access)}</p></article>`).join('');
}

function setupMotion(){
  const items=document.querySelectorAll('.reveal-on-scroll');
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){items.forEach(item=>item.classList.add('is-visible'));return}
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target)}}),{threshold:.12});
  items.forEach(item=>observer.observe(item));
}

function exportTracker(){const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),tracker},null,2)],{type:'application/json'});const anchor=document.createElement('a');anchor.href=URL.createObjectURL(blob);anchor.download='spassk-jobs-tracker.json';anchor.click();URL.revokeObjectURL(anchor.href)}

async function init(){
  try{
    const response=await fetch('data/vacancies.json',{cache:'no-store'});if(!response.ok)throw new Error(response.status);data=await response.json();
    changesData=await fetch('data/changes.json',{cache:'no-store'}).then(r=>r.ok?r.json():changesData).catch(()=>changesData);
    updateMetrics();renderChanges();renderToday();render();renderRemote();await loadSources();setupMotion();localStorage.setItem('spassk-jobs-last-visit',data.meta.generatedAt);
  }catch(error){$('updateStatus').textContent='Не удалось загрузить данные';$('lastUpdate').textContent='Повторите позже или откройте JSON';$('resultCount').textContent='Данные временно недоступны';console.error(error)}
}

['search','sort','fGood','fNoExp','fSalary','fFav'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',()=>{visibleLimit=40;render()}));
$('clearFilters').addEventListener('click',resetFilters);$('emptyReset').addEventListener('click',resetFilters);$('loadMore').addEventListener('click',()=>{visibleLimit+=40;render()});
$('trackerExport').addEventListener('click',exportTracker);
$('trackerImport').addEventListener('change',async event=>{try{const parsed=JSON.parse(await event.target.files[0].text());tracker=parsed.tracker||parsed;saveTracker();render();alert('Трекер импортирован')}catch{alert('Не удалось прочитать JSON трекера')}event.target.value=''});
document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();$('search').focus();$('vacancies').scrollIntoView({behavior:'smooth'})}});
init();
