
/* ---------- helpers ---------- */
const g=document.getElementById('gantt');
const PALETTE=['#2196f3','#1fb8c4','#1cb36d','#8bc34a','#e6b800','#f39a1e','#a0522d','#5c6bff','#9c5bd6','#e67ab0','#607d8b','#795548','#00897b','#3f51b5','#c0ca33','#ff8f00','#6d4c41','#455a64','#7e57c2','#26a69a','#d4a017','#5d8aa8','#8e9a3a','#b5651d'];
const CRIT='var(--critical)';
const DAY=864e5, ROWH=34, ZOOM={day:34,week:14,month:5};
const iso=d=>d.toISOString().slice(0,10);
const parse=s=>new Date(s+'T00:00:00Z');
const addDays=(s,n)=>iso(new Date(parse(s).getTime()+n*DAY));
const diff=(a,b)=>Math.round((parse(b)-parse(a))/DAY);
const TODAY=iso(new Date(Date.now()-new Date().getTimezoneOffset()*6e4));
const uid=()=>crypto.randomUUID();
const MON=['led','úno','bře','dub','kvě','čvn','čvc','srp','zář','říj','lis','pro'];
const fmt=s=>{const d=parse(s);return d.getUTCDate()+'. '+(d.getUTCMonth()+1)+'. '+d.getUTCFullYear()};
const fmts=s=>{const d=parse(s);return d.getUTCDate()+'. '+(d.getUTCMonth()+1)+'.'};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const KEY='projekty-view-v1';const CACHE='projekty-cache-v1';
const NOBODY='Nepřiřazeno';

/* ---------- state ---------- */
let S=null;
let V={project:'ALL',zoom:'week',by:'project',person:'',status:'',group:'',narrow:false,open:[],mine:true,autoDaily:true,lastDaily:'',dopen:''};
let focusId=null,focusTd=null,sel=null,clip=null,lastTodoId=null;
function load(){try{const v=JSON.parse(localStorage.getItem(KEY));if(v)V={...V,...v}}catch(e){}return false}
function save(){try{localStorage.setItem(KEY,JSON.stringify(V));localStorage.setItem(CACHE,JSON.stringify(S))}catch(e){}}
function toast(msg,err){let t=$('#toast');if(!t){t=document.createElement('div');t.id='toast';document.body.appendChild(t)}t.textContent=msg;t.className=err?'err':'';t.style.display='block';clearTimeout(t._h);t._h=setTimeout(()=>t.style.display='none',err?6000:2000)}

function sample(){return {me:'',projects:[],todos:[]}}
/* ---------- lookups ---------- */
const curProjects=()=>V.project==='ALL'?S.projects:S.projects.filter(p=>p.id===V.project);
const findTask=(id)=>{for(const p of S.projects){const t=p.tasks.find(x=>x.id===id);if(t)return {t,p}}return null};
const proj=(id)=>S.projects.find(p=>p.id===id);
const kidsOf=(t,p)=>p.tasks.filter(x=>x.parent===t.id);
const depth=(t,p)=>{let d=0,c=t;while(c&&c.parent){c=p.tasks.find(x=>x.id===c.parent);if(!c)break;d++;if(d>10)break}return d};
const descendants=(t,p)=>{const out=[];const walk=x=>kidsOf(x,p).forEach(k=>{out.push(k);walk(k)});walk(t);return out};
const wbsOf=(t,p)=>{const parts=[];let c=t;while(c){const sib=p.tasks.filter(x=>x.parent===c.parent);parts.unshift(sib.indexOf(c)+1);c=c.parent?p.tasks.find(x=>x.id===c.parent):null}return parts.join('.')};
const hiddenByCollapse=(t,p)=>{let c=t;while(c.parent){c=p.tasks.find(x=>x.id===c.parent);if(!c)return false;if(c.collapsed)return true}return false};
const colorOf=(t,p)=>{if(t.critical&&progressOf(t,p)<100)return CRIT;const g=(p.groups||[]).find(g=>g.id===t.group);return t.color||(g?g.color:p.color)};
const groupName=(t,p)=>{const g=(p.groups||[]).find(g=>g.id===t.group);return g?g.name:''};
function span(t,p){const kids=kidsOf(t,p);if(!kids.length)return{start:t.start,end:t.end,group:false};
  const sp=kids.map(k=>span(k,p));return{start:sp.reduce((a,k)=>k.start<a?k.start:a,sp[0].start),end:sp.reduce((a,k)=>k.end>a?k.end:a,sp[0].end),group:true}}
function progressOf(t,p){const kids=kidsOf(t,p);if(!kids.length){if(t.autoProg&&t.todos&&t.todos.length)return Math.round(t.todos.filter(x=>x.done).length/t.todos.length*100);return t.progress||0}return Math.round(kids.reduce((a,k)=>a+progressOf(k,p),0)/kids.length)}
const openBlocking=t=>(t.todos||[]).filter(x=>!x.done&&x.block);
const overdueBlocking=t=>openBlocking(t).filter(x=>x.due&&x.due<TODAY);
function allTodos(){const out=[];for(const p of curProjects()){p.todos.forEach(td=>out.push({td,p,t:null}));p.tasks.forEach(t=>t.todos.forEach(td=>out.push({td,p,t})))}if(V.project==='ALL')S.todos.forEach(td=>out.push({td,p:null,t:null}));return out}
function findTodo(id){for(const p of S.projects){let td=p.todos.find(x=>x.id===id);if(td)return{td,list:p.todos,p,t:null};for(const t of p.tasks){td=t.todos.find(x=>x.id===id);if(td)return{td,list:t.todos,p,t}}}const td=S.todos.find(x=>x.id===id);return td?{td,list:S.todos,p:null,t:null}:null}
const todoList=key=>key==='me'?S.todos:key.startsWith('p:')?proj(key.slice(2))?.todos:findTask(key)?.t.todos;
const myNames=()=>new Set([S.me,...S.projects.flatMap(p=>Object.entries(p.teamLinks||{}).filter(([n,u])=>u===S.meId).map(([n])=>n))].filter(Boolean));
const allPeople=()=>[...new Set([S.me,...S.projects.flatMap(p=>p.team)].filter(Boolean))];
const prioSort=(a,b)=>(b.td.imp?1:0)-(a.td.imp?1:0)||(a.td.pri||2)-(b.td.pri||2)||((a.td.due||'9')<(b.td.due||'9')?-1:1);
const isOpen=k=>V.open.includes(k);const toggleOpen=k=>{V.open=isOpen(k)?V.open.filter(x=>x!==k):[...V.open,k]};
function status(t,p){const sp=span(t,p),pr=progressOf(t,p);
  if(pr>=100)return{k:'done',l:'hotovo'};
  if(sp.end<TODAY)return{k:'late',l:'skluz '+diff(sp.end,TODAY)+' d'};
  if(overdueBlocking(t).length)return{k:'risk',l:'ohrožen'};
  if(sp.start<=addDays(TODAY,-2)&&pr===0&&!t.milestone)return{k:'stalled',l:'nezahájeno'};
  if(sp.end<=addDays(TODAY,7))return{k:'soon',l:sp.end===TODAY?'dnes':'za '+diff(TODAY,sp.end)+' d'};
  if(sp.start<=TODAY)return{k:'active',l:'běží'};
  return{k:'future',l:''}}
function matches(t,p){if(V.status){const k=status(t,p).k;if(V.status==='critical'){if(!t.critical||k==='done')return false}else if(V.status==='open'){if(k==='done')return false}else if(k!==V.status)return false}
  if(V.person&&t.resp!==V.person&&!(t.collab||[]).includes(V.person))return false;
  if(V.group&&t.group!==V.group)return false;return true}

function todoRows(rows,list,key,t,p,level){for(const td of list){if(V.person&&td.who!==V.person)continue;rows.push({type:'todo',td,t,p,level,key})}rows.push({type:'todoadd',key,t,p,level})}
function buildRows(){
  const rows=[];
  if(V.by==='todo_legacy'){
    const wk=addDays(TODAY,7);const MY=myNames();const meF=x=>!V.mine||!MY.size||MY.has(x.td.who)||!x.td.who;const all=allTodos().filter(x=>!x.td.done&&meF(x)&&(!V.person||x.td.who===V.person)&&(!V.group||(x.t&&x.t.group===V.group)));
    const B=[['Po termínu',x=>x.td.due&&x.td.due<TODAY],['Dnes',x=>x.td.due===TODAY],['Tento týden',x=>x.td.due>TODAY&&x.td.due<=wk],['Později',x=>x.td.due>wk],['Bez termínu',x=>!x.td.due]];
    for(const [label,f] of B){const l=all.filter(f).sort(prioSort);if(!l.length)continue;rows.push({type:'head',label,hint:l.length+' položek',color:label==='Po termínu'?'var(--critical)':''});
      l.forEach(x=>rows.push({type:'todo',td:x.td,t:x.t,p:x.p,level:0,key:'',ctx:true}))}
    const dn=allTodos().filter(x=>x.td.done&&meF(x));if(dn.length){rows.push({type:'head',label:'Hotové',hint:dn.length+' položek',color:''});dn.forEach(x=>rows.push({type:'todo',td:x.td,t:x.t,p:x.p,level:0,key:'',ctx:true}))}
    return rows;
  }
  if(V.by==='person'){
    const people=[...new Set(curProjects().flatMap(p=>p.team))];
    const all=curProjects().flatMap(p=>p.tasks.filter(t=>!kidsOf(t,p).length).map(t=>({t,p})));
    const buckets=[...people.map(n=>[n,all.filter(x=>x.t.resp===n||(x.t.collab||[]).includes(n))]),[NOBODY,all.filter(x=>!x.t.resp)]];
    for(const [name,list] of buckets){const vis=list.filter(x=>(V.person?x.t.resp===V.person||(x.t.collab||[]).includes(V.person):true)&&(!V.status||matches(x.t,x.p)||false)&&(!V.group||x.t.group===V.group));
      if(!vis.length&&(V.person||V.status||V.group))continue;if(name===NOBODY&&!vis.length)continue;
      rows.push({type:'head',label:name,color:'',hint:vis.length+' úkolů'});
      vis.sort((a,b)=>a.t.start<b.t.start?-1:1).forEach(x=>{rows.push({type:'task',t:x.t,p:x.p,level:0,group:false,collab:x.t.resp!==name});if(isOpen(x.t.id))todoRows(rows,x.t.todos,x.t.id,x.t,x.p,0)})}
    return rows;
  }
  for(const p of curProjects()){
    if(V.project==='ALL')rows.push({type:'head',label:p.name,color:p.color,hint:'vede '+(p.lead||'—'),p});
    for(const t of p.tasks){
      if(t.parent&&!p.tasks.find(x=>x.id===t.parent))t.parent=null;
      if(hiddenByCollapse(t,p))continue;
      const kids=kidsOf(t,p);
      if(!matches(t,p)&&!descendants(t,p).some(k=>matches(k,p)))continue;
      const lv=depth(t,p);
      rows.push({type:'task',t,p,level:lv,group:kids.length>0});
      if(isOpen(t.id))todoRows(rows,t.todos,t.id,t,p,lv);
    }
    if(!V.status&&!V.group){rows.push({type:'inbox',key:'p:'+p.id,p,list:p.todos,label:'Inbox projektu'});if(isOpen('p:'+p.id))todoRows(rows,p.todos,'p:'+p.id,null,p,0)}
  }
  if(V.project==='ALL'&&!V.status&&!V.group){rows.push({type:'inbox',key:'me',p:null,list:S.todos,label:'Můj inbox (mimo projekty)'});if(isOpen('me'))todoRows(rows,S.todos,'me',null,null,0)}
  return rows;
}

/* ---------- render ---------- */
function renderTabs(){
  $('#tabs').innerHTML=`<button class="tab ${V.project==='ALL'?'on':''}" data-p="ALL">Všechny projekty</button>`+
    S.projects.map(p=>`<button class="tab ${V.project===p.id?'on':''}" data-p="${p.id}"><span class="pd" style="background:${p.color}"></span>${esc(p.name)}</button>`).join('')+
    `<button class="tab add" data-p="__new">+ projekt</button>`;
  $$('#zoom button').forEach(b=>b.classList.toggle('on',b.dataset.z===V.zoom));
  $$('#by button').forEach(b=>b.classList.toggle('on',b.dataset.b===V.by));
  $('#narrow').checked=V.narrow;$('#autodailyL').textContent=V.autoDaily?'ano':'ne';
  $('#tabs').style.display=V.by==='daily'?'none':'';
}
function renderStrip(){
  const el=$('#strip');if(V.by==='daily'){el.style.display='none';return}el.style.display='';const ps=curProjects();
  const leafs=ps.flatMap(p=>p.tasks.filter(t=>!kidsOf(t,p).length).map(t=>({t,p})));
  const cnt=k=>leafs.filter(x=>status(x.t,x.p).k===k).length;
  const crit=leafs.filter(x=>x.t.critical&&status(x.t,x.p).k!=='done').length;
  const openTd=allTodos().filter(x=>!x.td.done),overTd=openTd.filter(x=>x.td.due&&x.td.due<TODAY).length;
  const stat=[['late','Ve skluzu',cnt('late')],['risk','Ohrožené',cnt('risk')],['stalled','Nezahájené',cnt('stalled')],['soon','Končí do 7 dnů',cnt('soon')],['critical','Kritické',crit],['open','Vše otevřené',leafs.length-cnt('done')],['todo','ToDo '+(overTd?'('+overTd+' po termínu)':''),openTd.length]];
  let h=`<div class="quick"><input id="quick" placeholder="${'Nový úkol do harmonogramu… (Enter)'}"><button class="btn pri" id="bDump" title="Sepsat vše, co máte v hlavě, a pak zatřídit">✎ Seznam</button></div>`;
  h+=`<span class="sepv"></span>`+stat.map(([k,l,n])=>`<button class="pill ${k} ${V.status===k?'on':''} ${n?'':'zero'}" data-st="${k}"><b>${n}</b> ${l}</button>`).join('');
  const people=[...new Set(ps.flatMap(p=>p.team))];
  h+=`<span class="sepv"></span><select id="person" class="pill"><option value="">Všichni lidé</option>${people.map(n=>`<option ${V.person===n?'selected':''}>${esc(n)}</option>`).join('')}</select>`;
  const p=proj(V.project);
  if(p&&p.groups.length)h+=`<span class="sepv"></span><span class="pill" style="border-color:transparent"><span class="pd" style="background:var(--critical)"></span>kritický</span><button class="lg btn" data-gsettings="1" title="Upravit skupiny a barvy" style="padding:2px 8px">Skupiny ✎</button>`+p.groups.map(g=>`<button class="pill ${V.group===g.id?'on':''}" data-g="${g.id}" title="Filtrovat skupinu"><span class="pd" style="background:${g.color}"></span>${esc(g.name)}</button>`).join('');
  el.innerHTML=h;
  if(V.person&&!people.includes(V.person)){V.person=''}
}

function render(){
  renderTabs();renderStrip();
  const g=$('#gantt'); g.classList.toggle('narrow',V.narrow);
  if(V.by==='daily'){renderDaily(g);return}
  if(!S.projects.length){g.innerHTML='<div class="empty"><p>Zatím žádný projekt.</p><p>Založte projekt tlačítkem „+ projekt“ nahoře, nebo si načtěte ukázková data v menu ⋯.</p></div>';return}
  const rows=buildRows();
  const px=ZOOM[V.zoom];
  let min=TODAY,max=TODAY;
  for(const p of S.projects)for(const t of p.tasks){if(t.start<min)min=t.start;if(t.end>max)max=t.end}
  let start=addDays(min,-7); const dow=(parse(start).getUTCDay()+6)%7; start=addDays(start,-dow);
  let end=addDays(max,21); if(diff(start,end)<90)end=addDays(start,90);
  const days=diff(start,end)+1, W=days*px;
  const X=s=>diff(start,s)*px;

  let L=`<div class="left"><div class="lhead"><span class="c-n">#</span><span>Úkol</span><span class="c-resp">Odpovědný</span><span class="c-st">Stav</span><span class="c-prog">%</span><span></span></div>`;
  let n=0;
  for(const r of rows){
    if(r.type==='head'){L+=`<div class="lrow head" ${r.p?`data-pid="${r.p.id}"`:''}><span class="c-n"></span><span class="c-name">${r.color?`<span class="dot" style="background:${r.color}"></span>`:''}<span class="nm">${esc(r.label)}</span><span class="hint">${esc(r.hint)}</span></span><span class="c-resp"></span><span class="c-st"></span><span class="c-prog"></span><span class="c-act">${r.p?'<button data-act="proj" title="Nastavení projektu">⚙</button>':''}</span></div>`;continue}
    if(r.type==='inbox'){const open=r.list.filter(x=>!x.done).length,over=r.list.some(x=>!x.done&&x.due&&x.due<TODAY);
      L+=`<div class="lrow inbox" data-key="${r.key}"><span class="c-n"></span><span class="c-name"><button class="tg" data-act="open">${isOpen(r.key)?'▾':'▸'}</button><span class="nm">${esc(r.label)}</span><button class="tdc ${over?'bad':''} ${r.list.length?'':'empty'}" data-act="open">${r.list.length-open}/${r.list.length} ✓</button></span><span class="c-resp"></span><span class="c-st"></span><span class="c-prog"></span><span class="c-act"></span></div>`;continue}
    if(r.type==='todoadd'){L+=`<div class="lrow todo todoadd" style="--lv:${r.level}" data-key="${r.key}"><span class="c-n"></span><span class="c-name"><span class="ind2"></span><input class="tt" data-new="1" placeholder="+ položka… (Enter)"></span><span class="c-resp"></span><span class="c-st"></span><span class="c-prog"></span><span class="c-act"></span></div>`;continue}
    if(r.type==='todo'){const td=r.td,over=td.due&&td.due<TODAY&&!td.done;const team=r.p?r.p.team:allPeople();
      L+=`<div class="lrow todo ${td.done?'done':''} ${over?'over':''}" style="--lv:${r.level}" data-td="${td.id}"><span class="c-n"></span><span class="c-name">${r.ctx?'':'<span class="ind2"></span>'}<input type="checkbox" data-tf="done" ${td.done?'checked':''}><input class="tt" data-tf="text" value="${esc(td.text)}" placeholder="Co je třeba udělat">${r.ctx?`<span class="cl">${esc(r.t?r.t.name:'inbox')}${r.p?' · '+esc(r.p.name):''}</span>`:''}<button class="imp ${td.imp?'on':''}" data-tf="imp" title="Důležité">★</button><button class="blk ${td.block?'on':''}" data-tf="block" title="Blokuje dokončení úkolu">⛔</button></span>
        <span class="c-resp"><select data-tf="who"><option value="">—</option>${[...new Set([...team,...(td.who?[td.who]:[])])].map(m=>`<option ${td.who===m?'selected':''}>${esc(m)}</option>`).join('')}</select></span>
        <span class="c-st"><input type="date" data-tf="due" value="${td.due||''}" title="Do kdy"></span><span class="c-prog"><select class="prs" data-tf="pri" title="Priorita"><option value="1" ${td.pri==1?'selected':''}>A</option><option value="2" ${!td.pri||td.pri==2?'selected':''}>B</option><option value="3" ${td.pri==3?'selected':''}>C</option></select></span><span class="c-act">${r.ctx?`<button data-tact="tri" title="Zatřídit / upravit">⋯</button>`:`<button data-tact="del" title="Smazat">×</button>`}</span></div>`;continue}
    const {t,p}=r,sp=span(t,p),st=status(t,p);n++;const wbs=V.by==='project'?wbsOf(t,p):String(n);
    const tdn=t.todos.length,tdd=t.todos.filter(x=>x.done).length,tdbad=overdueBlocking(t).length>0;
    const opts=p.team.map(m=>`<option ${t.resp===m?'selected':''}>${esc(m)}</option>`).join('');
    const tip=(t.milestone?fmt(t.start):fmt(sp.start)+' – '+fmt(sp.end)+' ('+(diff(sp.start,sp.end)+1)+' dní)')+(groupName(t,p)?' · '+groupName(t,p):'')+(t.note?'\n'+t.note:'')+(t.log.length?'\nPoslední záznam '+fmts(t.log[t.log.length-1].d)+': '+t.log[t.log.length-1].text:'');
    L+=`<div class="lrow lvl${r.level} ${r.group?'grp':''} ${t.critical?'crit':''} ${t.milestone?'ms':''}" style="--lv:${r.level}" data-id="${t.id}" data-pid="${p.id}">
      <span class="c-n" title="${wbs}">${wbs}</span>
      <span class="c-name"><span class="ind"></span><button class="tg ${r.group?'':'none'}" data-act="toggle">${t.collapsed?'▸':'▾'}</button><button class="dot" data-act="edit" title="Barva / skupina – otevře detail" style="border:0;padding:0;cursor:pointer;background:${colorOf(t,p)}"></button><input class="nm" data-f="name" value="${esc(t.name)}" placeholder="Název úkolu" title="${esc(tip)}">${V.by==='person'?`<span class="cl">${esc(p.name)}${r.collab?' · spolupráce':''}</span>`:''}${r.group?'':`<button class="tdc ${tdbad?'bad':''} ${tdn?'':'empty'}" data-act="open" title="ToDo k úkolu">${tdn?tdd+'/'+tdn:'+'} ✓</button>`}${t.note||t.log.length?`<span class="nt" data-act="edit" title="${esc((t.note||'')+(t.log.length?'\n'+t.log.length+' záznamů':''))}">≡${t.log.length||''}</span>`:''}</span>
      <span class="c-resp"><select data-f="resp"><option value="">—</option>${opts}</select></span>
      <span class="c-st">${st.l?`<span class="st ${st.k}">${st.l}</span>`:''}</span>
      <span class="c-prog">${t.milestone?'':r.group||t.autoProg?`<span class="hint" title="${t.autoProg?'Podle checklistu':''}">${progressOf(t,p)}</span>`:`<input type="number" data-f="progress" min="0" max="100" step="10" value="${t.progress||0}">`}</span>
      <span class="c-act"><button data-act="menu" title="Akce s úkolem">⋯</button></span></div>`;
  }
  L+='</div>';

  let M='',D='',C='';
  let d=start; let mStart=0;
  for(let i=0;i<days;i++,d=addDays(d,1)){
    const dt=parse(d), wd=(dt.getUTCDay()+6)%7, we=wd>=5, td=d===TODAY;
    if(we)C+=`<div class="col we" style="left:${i*px}px;width:${px}px"></div>`;
    if(dt.getUTCDate()===1)C+=`<div class="col mline" style="left:${i*px}px"></div>`;
    if(td)C+=`<div class="col td" style="left:${i*px}px;width:0"></div>`;
    if(V.zoom==='day')D+=`<span class="${we?'we':''} ${td?'td':''}" style="left:${i*px}px;width:${px}px">${dt.getUTCDate()}</span>`;
    else if(wd===0&&V.zoom==='week')D+=`<span style="left:${i*px}px;width:${7*px}px">${dt.getUTCDate()}. ${dt.getUTCMonth()+1}.</span>`;
    else if(wd===0&&V.zoom==='month')D+=`<span style="left:${i*px}px;width:${7*px}px"></span>`;
    const nd=addDays(d,1);
    if(parse(nd).getUTCMonth()!==dt.getUTCMonth()||i===days-1){const w=(i-mStart+1)*px;M+=`<span style="left:${mStart*px}px;width:${w}px">${w>60?MON[dt.getUTCMonth()]+' '+dt.getUTCFullYear():''}</span>`;mStart=i+1}
  }
  let B='',P='';const pos={};let ri=0;
  for(const r of rows){
    const top=ri*ROWH;
    if(r.type==='inbox'||r.type==='todoadd'){ri++;continue}
    if(r.type==='todo'){const td=r.td;if(td.due&&td.due>=start&&td.due<=end){B+=`<div class="tdot ${td.due<TODAY&&!td.done?'over':''} ${td.done?'done':''} ${td.block?'blk':''}" style="left:${X(td.due)+px/2-5}px;top:${top+11}px" title="${esc(td.text)} · ${fmt(td.due)}"></div>`}ri++;continue}
    if(r.type==='head'){C+=`<div class="prow" style="top:${top}px"></div>`;
      const ts=r.p?r.p.tasks:rows.filter(x=>x.type==='task').map(x=>x.t);
      if(r.p&&ts.length){const s=ts.reduce((a,t)=>t.start<a?t.start:a,ts[0].start),e=ts.reduce((a,t)=>t.end>a?t.end:a,ts[0].end);B+=`<div class="bar psum" style="left:${X(s)}px;top:${top+14}px;--c:${r.p.color};width:${(diff(s,e)+1)*px}px;background:${r.p.color}"></div>`}
      ri++;continue}
    const {t,p}=r,sp=span(t,p),st=status(t,p);
    const x=X(sp.start)+(t.milestone?px/2:0),w=t.milestone?24:(diff(sp.start,sp.end)+1)*px;
    pos[t.id]={x,w,top,ms:t.milestone};
    const prog=progressOf(t,p),col=colorOf(t,p);
    const dts=(t.milestone?fmts(t.start):`${fmts(sp.start)} – ${fmts(sp.end)}`)+(st.k==='late'?` · ${st.l}`:'');const dtc=st.k==='late'?'dt late':'dt';
    const who=`${esc(t.resp||'')}${t.collab&&t.collab.length?' + '+esc(t.collab.join(', ')):''}`;
    const inside=false;const nol=x<220;
    B+=`<div class="bar ${t.milestone?'ms':''} ${sp.group?'grp':''} ${t.critical?'crit':''} ${st.k==='late'?'late':''} ${st.k==='done'?'done':''} ${nol?'nol':''}" data-id="${t.id}" style="left:${x}px;top:${top+6}px;width:${w}px;background:${col};--c:${col}" title="${esc(t.name)}: ${fmt(sp.start)} – ${fmt(sp.end)}${st.l?' · '+st.l:''}">
      <div class="prog" style="width:${prog}%"></div><span class="h h-l"></span><span class="h h-r"></span>
      <span class="nml"><b>${esc(t.name)}</b></span><span class="lbl"><b>${esc(t.name)} · </b><i class="${dtc}">${dts}</i>${who?` <i>· ${who}</i>`:''}</span></div>`;
    for(const td of t.todos){if(!td.due||td.due<start||td.due>end)continue;B+=`<div class="tdot ${td.due<TODAY&&!td.done?'over':''} ${td.done?'done':''} ${td.block?'blk':''}" style="left:${X(td.due)+px/2-5}px;top:${top}px" title="${esc(td.text)} · ${fmt(td.due)}${td.who?' · '+esc(td.who):''}"></div>`}
    ri++;
  }
  for(const r of rows){ if(r.type!=='task')continue;const t=r.t;
    for(const did of (t.deps||[])){const a=pos[did],b=pos[t.id];if(!a||!b)continue;
      const pred=findTask(did);if(!pred)continue;const pe=span(pred.t,pred.p).end;const bad=pred.t.milestone?pe>t.start:pe>=t.start;
      const x1=a.ms?a.x+12:a.x+a.w, y1=a.top+17, x2=b.ms?b.x-12:b.x, y2=b.top+17;
      const path=x2>=x1+16?`M${x1},${y1} H${x1+8} V${y2} H${x2-4}`:`M${x1},${y1} H${x1+8} V${y1+ROWH/2} H${x2-12} V${y2} H${x2-4}`;
      P+=`<path class="${bad?'bad':''}" d="${path}"></path><polygon points="${x2},${y2} ${x2-6},${y2-4} ${x2-6},${y2+4}"></polygon>`;
    }}
  const H=rows.length*ROWH;
  g.innerHTML=L+`<div class="right" style="width:${W}px"><div class="rhead"><div class="mrow">${M}</div><div class="drow">${D}</div></div>
    <div class="rbody" style="width:${W}px;height:${Math.max(H,200)}px">${C}${B}<svg class="deps" width="${W}" height="${Math.max(H,200)}">${P}</svg></div></div>`;
  g.dataset.start=start; g.dataset.px=px;
  if(sel){const r=$(`.lrow[data-id="${sel}"]`);if(r)r.classList.add('sel');else sel=null}
  if(focusId){sel=focusId;const r=$(`.lrow[data-id="${focusId}"]`);if(r)r.classList.add('sel');const i=$(`.lrow[data-id="${focusId}"] input.nm`);if(i){i.focus();i.select()}focusId=null}
  if(focusTd){const i=focusTd.startsWith('td:')?$(`.lrow[data-td="${focusTd.slice(3)}"] input.tt`):$(`.lrow.todoadd[data-key="${focusTd}"] input.tt`);if(i)i.focus();focusTd=null}
}
function scrollToToday(){if(V.by==='daily')return;const x=diff(g.dataset.start,TODAY)*+g.dataset.px;g.scrollLeft=Math.max(0,x-(g.clientWidth-parseInt(getComputedStyle(g).getPropertyValue('--leftw')))/3)}

/* ---------- daily view ---------- */
const DAYS=['neděle','pondělí','úterý','středa','čtvrtek','pátek','sobota'];
function ctxOf(x){return x.t?`${esc(x.t.name)}${x.p?' · '+esc(x.p.name):''}`:x.p?esc(x.p.name):'mimo projekty'}
function renderDaily(g){
  const all=[];for(const p of S.projects){p.todos.forEach(td=>all.push({td,p,t:null}));p.tasks.forEach(t=>t.todos.forEach(td=>all.push({td,p,t})))}S.todos.forEach(td=>all.push({td,p:null,t:null}));
  const MY=myNames();const mine=x=>!MY.size||MY.has(x.td.who)||!x.td.who;
  const open=all.filter(x=>!x.td.done&&mine(x));const TOM=addDays(TODAY,1);
  const doneToday=all.filter(x=>x.td.done&&x.td.doneAt===TODAY&&mine(x));
  const lateTasks=S.projects.flatMap(p=>p.tasks.filter(t=>!kidsOf(t,p).length&&status(t,p).k==='late')).length;
  const endToday=S.projects.flatMap(p=>p.tasks.filter(t=>!kidsOf(t,p).length&&span(t,p).end===TODAY&&progressOf(t,p)<100)).length;
  const dt=parse(TODAY);
  const item=x=>{const td=x.td,over=td.due&&td.due<TODAY&&!td.done,o=V.dopen===td.id;
    const pOpts=`<option value="">— mimo projekty —</option>`+S.projects.map(p=>`<option value="${p.id}" ${x.p&&x.p.id===p.id?'selected':''}>${esc(p.name)}</option>`).join('');
    const tOpts=x.p?`<option value="">— inbox projektu —</option>`+x.p.tasks.filter(t=>!kidsOf(t,x.p).length&&progressOf(t,x.p)<100).map(t=>`<option value="${t.id}" ${x.t&&x.t.id===t.id?'selected':''}>${wbsOf(t,x.p)} ${esc(t.name)}</option>`).join(''):'';
    const pill=td.due&&(td.due!==TODAY||over)?`<span class="pill ${over?'over':''}">${over?'po termínu · '+fmts(td.due):td.due===TOM?'zítra':fmts(td.due)}</span>`:'';
    const bars=(x.p?`<i style="background:${x.p.color}"></i>`:'')+(td.pri==1?`<i style="background:var(--critical)"></i>`:'')+(td.imp?`<i style="background:#e6b800"></i>`:'');
    return `<div class="di ${td.done?'done':''} ${over?'over':''} ${o?'open':''}" data-td="${td.id}"><button class="chk" data-df="done" title="${td.done?'Vrátit mezi otevřené':'Hotovo'}">✓</button>
      <div class="body"><div class="line"><input class="dtext" data-df="text" value="${esc(td.text)}" size="${Math.max(6,Math.min(60,td.text.length+1))}">${pill}${x.t?`<span class="tag" title="${esc(x.t.name)}">⤷ ${esc(x.t.name)}</span>`:''}</div>${bars?`<div class="bars">${bars}</div>`:''}</div>
      ${td.done?`<button class="dopt x" data-ddel-q title="Odstranit ze seznamu">✕</button>`:`<button class="dopt" data-dopt="${td.id}" title="Termín, projekt, priorita">⋯</button>`}</div>
    ${o?`<div class="dopts" data-td="${td.id}"><label>Do kdy <input type="date" data-df="due" value="${td.due||''}"></label><div class="seg"><button data-dd="0">dnes</button><button data-dd="1">zítra</button><button data-dd="7">za týden</button><button data-dd="">bez</button></div>
      <label>Projekt <select data-df="pid">${pOpts}</select></label>${x.p?`<label>Úkol <select data-df="tid">${tOpts}</select></label>`:''}
      <label>Priorita <div class="seg"><button data-dp="1" class="${td.pri==1?'on':''}">A</button><button data-dp="2" class="${!td.pri||td.pri==2?'on':''}">B</button><button data-dp="3" class="${td.pri==3?'on':''}">C</button></div></label>
      <button type="button" class="btn ${td.imp?'on':''}" data-dimp>★ důležité</button>${x.t?`<button type="button" class="btn" data-dblk>${td.block?'⛔ blokuje úkol':'blokuje úkol?'}</button>`:''}<button type="button" class="btn danger" data-ddel>Smazat</button></div>`:''}`};
  const wk=addDays(TODAY,7);const dow=dt.getUTCDay();const fri=dow>=5||dow===0?addDays(TODAY,((5-dow)+7)%7||7):addDays(TODAY,5-dow);const wkDue=fri<=TOM?addDays(TOM,1):fri;
  const secs=[['Dnes','0',x=>!x.td.due||x.td.due<=TODAY],['Zítra','1',x=>x.td.due===TOM],['Tento týden',String(diff(TODAY,wkDue)),x=>x.td.due>TOM&&x.td.due<=wk],['Nadcházející','14',x=>x.td.due>wk]];
  let h=`<div class="daily"><div class="sub">${DAYS[dt.getUTCDay()]} ${fmt(TODAY)} · ${open.length} otevřených${doneToday.length?`, ${doneToday.length} hotovo`:''}${endToday||lateTasks?` · harmonogram: ${endToday?endToday+' končí dnes':''}${endToday&&lateTasks?', ':''}${lateTasks?`<a data-golate>${lateTasks} ve skluzu</a>`:''}`:''}</div>`;
  for(const [label,dd,f] of secs){const l=open.filter(f).sort((a,b)=>{const ao=a.td.due&&a.td.due<TODAY,bo=b.td.due&&b.td.due<TODAY;if(ao!==bo)return ao?-1:1;return prioSort(a,b)});
    h+=`<div class="dh2"><h2>${label}</h2><button data-dnew="${dd}" title="Přidat">+</button></div>`;
    if(V.dnew===dd)h+=`<div class="dadd"><input id="dadd" placeholder="Co je třeba udělat… (Enter)" autocomplete="off"></div>`;
    h+=l.map(item).join('');
    if(label==='Dnes'){if(!l.length&&!doneToday.length&&V.dnew!==dd)h+=`<div class="dempty">Nic na dnešek. Klepněte na + a napište, co je potřeba.</div>`;h+=doneToday.map(item).join('')}
    else if(!l.length&&V.dnew!==dd)h+=`<div class="dempty">—</div>`}
  h+=`<div class="sub" style="margin-top:28px">Enter v položce založí další pod ní · vložení víceřádkového textu do řádku vytvoří položku z každého řádku · ⋯ u položky nastaví termín, projekt a prioritu</div>`;
  h+=`</div>`;g.innerHTML=h;
  if(focusTd==='dadd'){const i=$('#dadd');if(i)i.focus();focusTd=null}
  else if(focusTd&&focusTd.startsWith('td:')){const i=$(`.di[data-td="${focusTd.slice(3)}"] .dtext`);if(i){i.focus()}focusTd=null}
}
g.addEventListener('keydown',e=>{if(e.target.classList.contains('dtext')){const box=e.target.closest('[data-td]');const f=findTodo(box.dataset.td);if(!f)return;
    if(e.key==='Enter'){e.preventDefault();f.td.text=e.target.value;const td={id:uid(),text:'',done:false,who:f.td.who,due:f.td.due,block:false,pri:2,imp:false};f.list.splice(f.list.indexOf(f.td)+1,0,td);focusTd='td:'+td.id;commit()}
    if(e.key==='Backspace'&&e.target.value===''){e.preventDefault();f.list.splice(f.list.indexOf(f.td),1);commit()}
    if(e.key==='Escape')e.target.blur();return}
  if(e.target.id==='dadd'){if(e.key==='Enter'){const v=e.target.value.trim();if(!v)return;const dd=V.dnew;quickTodo(v);const f=findTodo(lastTodoId);if(f&&dd!=='')f.td.due=addDays(TODAY,+dd);focusTd='dadd';commit()}if(e.key==='Escape'){V.dnew=null;render()}}});
g.addEventListener('change',e=>{const el=e.target;const df=el.dataset.df;if(!df)return;const box=el.closest('[data-td]');const f=findTodo(box.dataset.td);if(!f)return;const td=f.td;
  if(df==='done'){td.done=el.checked;td.doneAt=el.checked?TODAY:'';}
  else if(df==='text')td.text=el.value;
  else if(df==='due')td.due=el.value;
  else if(df==='pid'||df==='tid'){const pid=df==='pid'?el.value:(f.p?f.p.id:'');const tid=df==='tid'?el.value:'';const key=tid||(pid?'p:'+pid:'me');const list=todoList(key);if(list){f.list.splice(f.list.indexOf(td),1);list.push(td);const p=proj(pid);if(p&&td.who&&!p.team.includes(td.who))p.team.push(td.who)}}
  commit()});
g.addEventListener('paste',e=>{if(e.target.id!=='dadd')return;const txt=(e.clipboardData||window.clipboardData).getData('text');const lines=txt.split(/\r?\n/).map(s=>s.replace(/^[\s\-•*·]+/,'').trim()).filter(Boolean);if(lines.length<2)return;e.preventDefault();const dd=V.dnew;for(const l of lines){quickTodo(l);const f=findTodo(lastTodoId);if(f&&dd!=='')f.td.due=addDays(TODAY,+dd)}focusTd='dadd';commit()});
g.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const box=b.closest('[data-td]');
  if(b.dataset.dopt!==undefined){V.dopen=V.dopen===b.dataset.dopt?'':b.dataset.dopt;save();render();return}
  if(b.dataset.dnew!==undefined){V.dnew=V.dnew===b.dataset.dnew?null:b.dataset.dnew;focusTd='dadd';render();return}
  if(box&&b.dataset.df==='done'){const f=findTodo(box.dataset.td);if(!f)return;f.td.done=!f.td.done;f.td.doneAt=f.td.done?TODAY:'';commit();return}
  if(box&&b.hasAttribute('data-ddel-q')){const f=findTodo(box.dataset.td);if(!f)return;f.list.splice(f.list.indexOf(f.td),1);commit();return}
  if(b.hasAttribute('data-dlater')){V.laterOpen=!V.laterOpen;commit();return}
  if(b.hasAttribute('data-golate')){V.by='project';V.status='late';commit();return}
  if(!box)return;const f=findTodo(box.dataset.td);if(!f)return;const td=f.td;
  if(b.dataset.dd!==undefined){td.due=b.dataset.dd===''?'':addDays(TODAY,+b.dataset.dd);commit()}
  if(b.dataset.dp){td.pri=+b.dataset.dp;commit()}
  if(b.hasAttribute('data-dimp')){td.imp=!td.imp;commit()}
  if(b.hasAttribute('data-dblk')){td.block=!td.block;commit()}
  if(b.hasAttribute('data-ddel')){f.list.splice(f.list.indexOf(td),1);V.dopen='';commit()}
});

/* ---------- mutations ---------- */
function commit(){save();render();DB.sync(S).catch(e=>{console.error(e);toast('Nepodařilo se uložit do databáze: '+(e.message||e),true)})}
function blankTask(p){return{id:uid(),name:'',start:TODAY,end:addDays(TODAY,4),color:'',group:p.groups[0]?.id||'',resp:'',collab:[],critical:false,progress:0,parent:null,deps:[],milestone:false,collapsed:false,note:'',links:[],log:[],todos:[],docs:[],autoProg:false}}
function targetProject(afterId){let p=proj(V.project);if(!p){const f=afterId&&findTask(afterId);p=f?f.p:S.projects[0]}return p}
function addTask(afterId,init={}){
  const p=targetProject(afterId);if(!p){newProject();return}
  const t={...blankTask(p),...init};
  if(afterId){const i=p.tasks.findIndex(x=>x.id===afterId);const prev=p.tasks[i];if(prev){t.parent=prev.parent;if(!init.group)t.group=prev.group;if(!init.resp&&V.by==='person')t.resp=prev.resp;const ds=descendants(prev,p);let j=i+1;while(j<p.tasks.length&&ds.includes(p.tasks[j]))j++;p.tasks.splice(j,0,t)}else p.tasks.push(t)}
  else p.tasks.push(t);
  focusId=t.id;commit();return t;
}
function quickAdd(text){
  if(/^-\s*\S/.test(text)){quickTodo(text.replace(/^-\s*/,''));return}
  const p=targetProject();if(!p){newProject();return}
  const init={};let name=text;
  name=name.replace(/(^|\s)!(?=\s|$)/,(m,a)=>{init.critical=true;return a}).trim();
  name=name.replace(/(^|\s)(\d+)d\b/i,(m,a,n)=>{init.end=addDays(TODAY,+n-1);return a}).trim();
  name=name.replace(/(^|\s)(\d{1,2})\.\s?(\d{1,2})\.(\d{4})?/,(m,a,d,mo,y)=>{const yy=y||TODAY.slice(0,4);const s=`${yy}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;if(!isNaN(parse(s))){init.start=s;init.end=addDays(s,init.end?diff(TODAY,init.end):4)}return a}).trim();
  name=name.replace(/(^|\s)@(\S+)/,(m,a,w)=>{const who=p.team.find(x=>x.toLowerCase().startsWith(w.toLowerCase()));if(who)init.resp=who;else{p.team.push(w);init.resp=w}return a}).trim();
  name=name.replace(/(^|\s)#(\S+)/,(m,a,w)=>{const g=p.groups.find(x=>x.name.toLowerCase().startsWith(w.toLowerCase()));if(g)init.group=g.id;else{const ng={id:uid(),name:w,color:PALETTE[(p.groups.length*4+3)%PALETTE.length]};p.groups.push(ng);init.group=ng.id}return a}).trim();
  init.name=name.replace(/\s+/g,' ');
  if(init.start&&!init.end)init.end=addDays(init.start,4);
  p.tasks.push({...blankTask(p),...init});focusId=null;commit();
}
function addTodo(key,text,o={}){const list=todoList(key);if(!list)return;const td={id:uid(),text,done:false,who:S.me||'',due:'',block:false,pri:2,imp:false,...o};list.push(td);return td}
function quickTodo(text){const p=proj(V.project);let init={};let s=text.replace(/^-\s*/,'');
  s=s.replace(/(^|\s)!(?=\s|$)/,(m,a)=>{init.block=true;return a}).trim();
  s=s.replace(/(^|\s)(\d{1,2})\.\s?(\d{1,2})\.(\d{4})?/,(m,a,d,mo,y)=>{const yy=y||TODAY.slice(0,4);const v=`${yy}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;if(!isNaN(parse(v)))init.due=v;return a}).trim();
  let key=p?'p:'+p.id:'me';
  s=s.replace(/(^|\s)>(.+)$/,(m,a,w)=>{const q=w.trim().toLowerCase();const pool=p?p.tasks.map(t=>({t,p})):S.projects.flatMap(pp=>pp.tasks.map(t=>({t,p:pp})));const hit=pool.find(x=>x.t.name.toLowerCase().startsWith(q))||pool.find(x=>x.t.name.toLowerCase().includes(q));if(hit){key=hit.t.id;V.open=[...new Set([...V.open,hit.t.id])]}return a}).trim();
  const team=p?p.team:[...new Set(S.projects.flatMap(x=>x.team))];
  s=s.replace(/(^|\s)@(\S+)/,(m,a,w)=>{const who=team.find(x=>x.toLowerCase().startsWith(w.toLowerCase()));init.who=who||w;return a}).trim();
  if(!init.who&&S.me)init.who=S.me;
  lastTodoId=addTodo(key,s.replace(/\s+/g,' '),init)?.id;if(key==='me'||key.startsWith('p:'))V.open=[...new Set([...V.open,key])];commit()}
function cloneSubtree(t,p){const sub=[t,...descendants(t,p)];const map={};sub.forEach(x=>map[x.id]=uid());
  return sub.map(x=>{const c=JSON.parse(JSON.stringify(x));c.id=map[x.id];c.parent=x.parent&&map[x.parent]?map[x.parent]:null;c.deps=(x.deps||[]).map(d=>map[d]).filter(Boolean);c.todos=(x.todos||[]).map(td=>({...td,id:uid()}));c.collapsed=false;return c})}
function copyTask(id){const f=findTask(id);if(!f)return;clip={tasks:cloneSubtree(f.t,f.p),pid:f.p.id,name:f.t.name};}
function pasteTask(afterId,asChild){if(!clip){alert('Schránka je prázdná – nejdřív úkol zkopírujte.');return}
  let p,anchor=null;if(afterId){const f=findTask(afterId);p=f.p;anchor=f.t}else{p=proj(V.project)||S.projects[0]}if(!p)return;
  const items=cloneSubtree(clip.tasks[0],{tasks:clip.tasks});// re-id again so repeated paste is safe
  const root=items[0];if(p.id!==clip.pid){items.forEach(x=>{if(!p.groups.find(g=>g.id===x.group))x.group='';if(x.resp&&!p.team.includes(x.resp))p.team.push(x.resp)})}
  if(anchor){if(asChild){root.parent=anchor.id;anchor.collapsed=false;const pd=descendants(anchor,p);let j=p.tasks.indexOf(anchor)+1;while(j<p.tasks.length&&pd.includes(p.tasks[j]))j++;p.tasks.splice(j,0,...items)}
    else{root.parent=anchor.parent;const ds=descendants(anchor,p);let j=p.tasks.indexOf(anchor)+1;while(j<p.tasks.length&&ds.includes(p.tasks[j]))j++;p.tasks.splice(j,0,...items)}}
  else{root.parent=null;p.tasks.push(...items)}
  sel=root.id;commit()}
function duplicateTask(id){copyTask(id);pasteTask(id,false)}
function addChild(id){const f=findTask(id);if(!f)return;const t={...blankTask(f.p)};t.parent=id;t.group=f.t.group;f.t.collapsed=false;const pd=descendants(f.t,f.p);let j=f.p.tasks.indexOf(f.t)+1;while(j<f.p.tasks.length&&pd.includes(f.p.tasks[j]))j++;f.p.tasks.splice(j,0,t);focusId=t.id;commit()}
function delTask(id,quiet){const f=findTask(id);if(!f)return;const kids=descendants(f.t,f.p);if(!quiet&&!confirm(`Smazat úkol „${f.t.name||'bez názvu'}“${kids.length?' včetně '+kids.length+' podúkolů':''}?`))return;
  if(sel===id)sel=null;f.p.tasks=f.p.tasks.filter(x=>x.id!==id&&!kids.includes(x));f.p.tasks.forEach(x=>x.deps=(x.deps||[]).filter(d=>d!==id));commit()}
function moveTask(id,dir){const f=findTask(id);if(!f)return;const a=f.p.tasks;const t=a.find(x=>x.id===id);
  const sibs=a.filter(x=>x.parent===t.parent);const k=sibs.indexOf(t);const nb=sibs[k+dir];if(!nb)return;
  const blk=x=>[x,...descendants(x,f.p)];const bt=blk(t),bn=blk(nb);
  const first=dir>0?bn:bt,second=dir>0?bt:bn;const pos=Math.min(a.indexOf(t),a.indexOf(nb));
  const rest=a.filter(x=>!bt.includes(x)&&!bn.includes(x));let before=0;for(let i=0;i<pos;i++)if(rest.includes(a[i]))before++;
  rest.splice(before,0,...first,...second);f.p.tasks=rest;focusId=id;commit()}
function indent(id,on){const f=findTask(id);const a=f.p.tasks;const t=a.find(x=>x.id===id);
  if(on){let i=a.indexOf(t)-1;while(i>=0&&a[i].parent!==t.parent)i--;if(i<0)return;t.parent=a[i].id;a[i].collapsed=false}
  else{if(!t.parent)return;const par=a.find(x=>x.id===t.parent);t.parent=par.parent||null;const sub=[t,...descendants(t,f.p)];const rest=a.filter(x=>!sub.includes(x));const pd=descendants(par,f.p).filter(x=>!sub.includes(x));let j=rest.indexOf(par)+1;while(j<rest.length&&pd.includes(rest[j]))j++;rest.splice(j,0,...sub);f.p.tasks=rest}
  focusId=id;commit()}
function newProject(){const p={id:uid(),name:'Nový projekt',lead:S.me||'',color:PALETTE[(S.projects.length*5)%PALETTE.length],team:S.me?[S.me]:[],teamLinks:S.me?{[S.me]:S.meId}:{},_teamIds:{},groups:[],tasks:[],todos:[],members:[{user_id:S.meId,role:'lead',email:S.meEmail,name:S.me}],invites:[],created_by:S.meId};S.projects.push(p);V.project=p.id;save();render();openProj(p.id)}

/* ---------- task dialog ---------- */
function openTask(id,focusLog){const f=findTask(id);if(!f)return;const {t,p}=f;const dlg=$('#tdlg');dlg.classList.remove('wide');const kids=kidsOf(t,p).length;
  const others=p.tasks.filter(x=>x.id!==id&&x.parent!==id);
  const custom=!!t.color;
  const logHtml=()=>t.log.length?t.log.slice().reverse().map((e,i)=>`<div><button type="button" data-lgrm="${t.log.length-1-i}" title="Smazat záznam">×</button><b>${fmts(e.d)} ${e.d.slice(0,4)}${e.authorName?' · '+esc(e.authorName):''}</b>${esc(e.text)}</div>`).join(''):'<span class="hint">Zatím žádné záznamy. Sem patří průběh: co se stalo, na co se čeká, kdo co slíbil.</span>';
  dlg.innerHTML=`<form method="dialog"><div class="dh"><span>${esc(t.name||'Úkol')} <span class="hint">· ${esc(p.name)}</span></span><button type="button" data-x>×</button></div><div class="db">
    <div class="f"><label>Název</label><input type="text" name="name" value="${esc(t.name)}"></div>
    <div class="f2"><div class="f"><label>Začátek</label><input type="date" name="start" value="${t.start}" ${kids?'disabled':''}></div>
      <div class="f"><label>Konec</label><input type="date" name="end" value="${t.end}" ${kids||t.milestone?'disabled':''}></div>
      <div class="f"><label>Dní</label><input type="number" name="dur" min="1" value="${diff(t.start,t.end)+1}" ${kids||t.milestone?'disabled':''}></div></div>
    <div class="f2"><div class="f"><label>Odpovědný</label><select name="resp"><option value="">—</option>${p.team.map(m=>`<option ${t.resp===m?'selected':''}>${esc(m)}</option>`).join('')}</select></div>
      <div class="f" style="grid-column:span 2"><label>Skupina úkolů (určuje barvu)</label><select name="group"><option value="">— bez skupiny —</option>${p.groups.map(g=>`<option value="${g.id}" ${t.group===g.id?'selected':''}>${esc(g.name)}</option>`).join('')}</select>${p.groups.length?'':'<span class="hint">Skupiny založíte v nastavení projektu, nebo rychlým zadáním „#Skupina“.</span>'}</div></div>
    <div class="f"><label><input type="checkbox" name="usecolor" ${custom?'checked':''}> Vlastní barva místo barvy skupiny <span class="hint">(kritický úkol je vždy červený)</span></label><div class="sw" style="${custom?'':'display:none'}">${PALETTE.map(c=>`<button type="button" data-c="${c}" class="${c===t.color?'on':''}" style="background:${c}"></button>`).join('')}<input type="hidden" name="color" value="${t.color||colorOf(t,p)}"></div></div>
    <div class="f"><label>Spolupracovníci</label><div class="chips">${p.team.filter(m=>m!==t.resp).map(m=>`<label class="chip ${(t.collab||[]).includes(m)?'on':''}"><input type="checkbox" name="collab" value="${esc(m)}" ${(t.collab||[]).includes(m)?'checked':''}>${esc(m)}</label>`).join('')||'<span class="hint">Tým projektu je prázdný – doplňte lidi v nastavení projektu.</span>'}</div></div>
    <div class="fx"><label><input type="checkbox" name="critical" ${t.critical?'checked':''}> Kritický úkol</label><label><input type="checkbox" name="milestone" ${t.milestone?'checked':''} ${kids?'disabled':''}> Milník (jeden den)</label>
      <label>Hotovo <input type="number" name="progress" min="0" max="100" step="5" value="${t.progress||0}" ${kids?'disabled':''} style="width:64px;border:1px solid var(--line);border-radius:6px;padding:4px 6px;background:var(--bg)"> %</label></div>
    <div class="f"><label>ToDo k úkolu (checklist) <span class="hint">· ⛔ = blokuje dokončení</span></label><div class="todol" id="todol"></div><div class="fx" style="margin-top:4px"><button type="button" class="btn" data-tdadd>+ položka</button><label><input type="checkbox" name="autoProg" ${t.autoProg?'checked':''}> Hotovost % počítat z checklistu</label></div></div>
    <div class="f"><label>Zadání a podrobnosti</label><textarea name="note" rows="3" placeholder="Cíl, postup, dohody, na co nezapomenout…">${esc(t.note||'')}</textarea></div>
    <div class="f"><label>Deník úkolu (průběh řešení)</label><div class="logadd"><textarea name="newlog" rows="2" placeholder="Nový záznam k dnešnímu dni… (Ctrl+Enter)"></textarea><button type="button" class="btn" data-lgadd>Zapsat</button></div><div class="log" id="log">${logHtml()}</div></div>
    <div class="f"><label>Dokumenty</label><div class="deplist" id="docs"></div><div class="fx"><label class="btn" style="cursor:pointer">📎 Nahrát soubor <input type="file" name="docfile" multiple hidden></label><span class="hint" id="docstat"></span></div></div>
    <div class="f"><label>Odkazy</label><div class="team" id="links"></div><div><button type="button" class="btn" data-addl>+ přidat odkaz</button></div></div>
    <div class="f"><label>Zařadit pod (nadřazený úkol)</label><select name="parent"><option value="">— žádný —</option>${(()=>{const ds=descendants(t,p);return p.tasks.filter(x=>x.id!==id&&!ds.includes(x)).map(x=>`<option value="${x.id}" ${t.parent===x.id?'selected':''}>${'\u00a0'.repeat(depth(x,p)*3)+esc(x.name)}</option>`).join('')})()}</select></div>
    <div class="f"><label>Navazuje na (předchůdci)</label><div class="deplist" id="deplist"></div><div class="fx" style="margin-top:4px"><select name="depadd" style="flex:1;border:1px solid var(--line);background:var(--bg);border-radius:6px;padding:6px 8px"><option value="">+ přidat předchůdce…</option>${others.map(x=>`<option value="${x.id}">${'\u00a0'.repeat(depth(x,p)*3)+wbsOf(x,p)+' '+esc(x.name||'bez názvu')}</option>`).join('')}</select></div></div>
    </div><div class="df"><div class="left-actions"><button type="button" class="btn" data-mv="-1" title="Posunout nahoru">↑</button><button type="button" class="btn" data-mv="1" title="Posunout dolů">↓</button><button type="button" class="btn" data-ind="1" ${t.parent?'disabled':''}>Zanořit</button><button type="button" class="btn" data-ind="0" ${t.parent?'':'disabled'}>Vynořit</button><button type="button" class="btn danger" data-del>Smazat</button></div>
    <button type="button" class="btn" data-x>Zavřít</button><button type="submit" class="btn pri">Uložit</button></div></form>`;
  const fm=$('form',dlg),E=n=>fm.elements[n];let links=(t.links||[]).map(l=>({...l}));let todos=t.todos.map(x=>({...x}));let deps=[...(t.deps||[])];
  const rdocs=()=>{$('#docs',fm).innerHTML=(t.docs||[]).map(d=>`<div><span><a href="#" data-doc="${d.id}">${esc(d.name)}</a> <span class="hint">${d.size?Math.round(d.size/1024)+' kB':''}</span></span><button type="button" data-docrm="${d.id}" title="Smazat">×</button></div>`).join('')||'<span class="hint">Zatím žádné soubory.</span>'};rdocs();
  const rdep=()=>{$('#deplist',fm).innerHTML=deps.map(d=>{const x=p.tasks.find(y=>y.id===d);return x?`<div><span>${wbsOf(x,p)} ${esc(x.name)} <span class="hint">${fmts(span(x,p).end)}</span></span><button type="button" data-deprm="${d}" title="Odebrat">×</button></div>`:''}).join('')||'<span class="hint">Žádné vazby.</span>';const s=E('depadd');[...s.options].forEach(o=>o.disabled=deps.includes(o.value))};rdep();
  const rtd=()=>{$('#todol',fm).innerHTML=todos.map((x,i)=>`<div class="${x.done?'done':''}"><input type="checkbox" data-td="done" data-i="${i}" ${x.done?'checked':''}><input type="text" data-td="text" data-i="${i}" value="${esc(x.text)}" placeholder="Co je třeba udělat"><select data-td="who" data-i="${i}"><option value="">—</option>${p.team.map(m=>`<option ${x.who===m?'selected':''}>${esc(m)}</option>`).join('')}</select><input type="date" data-td="due" data-i="${i}" value="${x.due||''}"><button type="button" data-td="block" data-i="${i}" class="blk ${x.block?'on':''}" style="color:${x.block?'var(--critical)':'var(--muted)'}" title="Blokuje dokončení">⛔</button><button type="button" data-td="rm" data-i="${i}">×</button></div>`).join('')||'<span class="hint">Drobné akce, které podmiňují úkol – zavolat, poslat, ověřit…</span>'};rtd();
  const rl=()=>{$('#links',fm).innerHTML=links.map((l,i)=>`<div><input type="text" value="${esc(l.name)}" placeholder="název" data-ln="${i}" style="flex:0 0 40%"><input type="text" value="${esc(l.url)}" placeholder="https://…" data-lu="${i}">${l.url?`<a href="${esc(l.url)}" target="_blank" title="Otevřít">↗</a>`:''}<button type="button" data-lrm="${i}" title="Odebrat">×</button></div>`).join('')};rl();
  const addLog=()=>{const v=E('newlog').value.trim();if(!v)return;t.log.push({id:uid(),d:TODAY,text:v,author:S.meId,authorName:S.me});E('newlog').value='';$('#log',fm).innerHTML=logHtml();save()};
  fm.addEventListener('input',e=>{const d=e.target.dataset;if(d.ln!==undefined)links[+d.ln].name=e.target.value;if(d.lu!==undefined)links[+d.lu].url=e.target.value;
    if(d.td&&e.target.tagName!=='BUTTON'){const x=todos[+d.i];if(d.td==='done'){x.done=e.target.checked;e.target.parentElement.classList.toggle('done',x.done)}else x[d.td]=e.target.value}});
  fm.addEventListener('keydown',e=>{if(e.target.dataset.td==='text'&&e.key==='Enter'){e.preventDefault();todos.splice(+e.target.dataset.i+1,0,{id:uid(),text:'',done:false,who:'',due:'',block:false});rtd();$$('#todol input[type=text]',fm)[+e.target.dataset.i+1].focus()}
    if(e.target.name==='newlog'&&e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();addLog()}});
  fm.addEventListener('click',e=>{const a=e.target.closest('a[data-doc]');if(a){e.preventDefault();const d=(t.docs||[]).find(x=>x.id===a.dataset.doc);if(d)DB.docUrl(d.path).then(u=>window.open(u,'_blank')).catch(err=>toast(err.message,true));return}
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.deprm){deps=deps.filter(d=>d!==b.dataset.deprm);rdep()}
    if(b.dataset.docrm){const d=(t.docs||[]).find(x=>x.id===b.dataset.docrm);if(d&&confirm('Smazat soubor '+d.name+'?')){DB.deleteDoc(d).then(()=>{t.docs=t.docs.filter(x=>x!==d);rdocs()}).catch(err=>toast(err.message,true))}}
    if(b.hasAttribute('data-tdadd')){todos.push({id:uid(),text:'',done:false,who:'',due:'',block:false});rtd();const ins=$$('#todol input[type=text]',fm);ins[ins.length-1].focus()}
    if(b.dataset.td==='rm'){todos.splice(+b.dataset.i,1);rtd()}
    if(b.dataset.td==='block'){todos[+b.dataset.i].block=!todos[+b.dataset.i].block;rtd()}
    if(b.hasAttribute('data-lgadd'))addLog();
    if(b.dataset.lgrm!==undefined){t.log.splice(+b.dataset.lgrm,1);$('#log',fm).innerHTML=logHtml();save()}
    if(b.hasAttribute('data-addl')){links.push({name:'',url:''});rl();const ins=$$('#links input',fm);ins[ins.length-2].focus()}
    if(b.dataset.lrm){links.splice(+b.dataset.lrm,1);rl()}
    if(b.dataset.c){$$('.sw button',fm).forEach(x=>x.classList.remove('on'));b.classList.add('on');E('color').value=b.dataset.c}
    if(b.hasAttribute('data-x')){dlg.close();render()}
    if(b.hasAttribute('data-del')){dlg.close();delTask(id)}
    if(b.dataset.mv){dlg.close();moveTask(id,+b.dataset.mv)}
    if(b.dataset.ind){dlg.close();indent(id,b.dataset.ind==='1')}
  });
  fm.addEventListener('change',async e=>{const n=e.target.name;
    if(n==='docfile'){const files=[...e.target.files];const st=$('#docstat',fm);for(const f of files){st.textContent='Nahrávám '+f.name+'…';try{const d=await DB.uploadDoc(p.id,t.id,f);(t.docs||=[]).push(d);rdocs()}catch(err){toast('Nahrání selhalo: '+(err.message||err),true)}}st.textContent='';e.target.value='';return}
    if(n==='depadd'&&e.target.value){deps.push(e.target.value);e.target.value='';rdep()}
    if(n==='dur'){const v=Math.max(1,+E('dur').value||1);E('end').value=addDays(E('start').value,v-1)}
    if(n==='start'||n==='end'){if(E('end').value<E('start').value)E('end').value=E('start').value;E('dur').value=diff(E('start').value,E('end').value)+1}
    if(n==='milestone'){E('end').disabled=E('milestone').checked;E('dur').disabled=E('milestone').checked;if(E('milestone').checked){E('end').value=E('start').value;E('dur').value=1}}
    if(n==='usecolor'){$('.sw',fm).style.display=E('usecolor').checked?'':'none'}
    if(n==='color'){$$('.sw button',fm).forEach(x=>x.classList.toggle('on',x.dataset.c===E('color').value))}
    if(e.target.closest('.chip'))e.target.closest('.chip').classList.toggle('on',e.target.checked);
  });
  fm.addEventListener('submit',()=>{
    addLog();
    t.todos=todos.filter(x=>x.text.trim());t.autoProg=E('autoProg').checked;
    if(!kids&&!t.autoProg&&+E('progress').value>=100&&openBlocking(t).length){alert('Úkol má otevřené blokující ToDo, nelze ho označit za hotový:\n– '+openBlocking(t).map(x=>x.text).join('\n– '));E('progress').value=t.progress||0}
    t.name=E('name').value.trim();t.color=E('usecolor').checked?E('color').value:'';t.group=E('group').value;t.resp=E('resp').value;t.collab=$$('input[name=collab]:checked',fm).map(x=>x.value);
    t.note=E('note').value.trim();t.links=links.filter(l=>l.url||l.name);t.critical=E('critical').checked;t.milestone=E('milestone').checked;t.deps=deps;
    if(!kids){t.start=E('start').value||t.start;t.end=t.milestone?t.start:(E('end').value||t.end);if(t.end<t.start)t.end=t.start;t.progress=+E('progress').value||0}
    const np=E('parent').value||null;if(np!==t.parent){const sub=[t,...descendants(t,p)];t.parent=np;const rest=p.tasks.filter(x=>!sub.includes(x));if(np){const par=rest.find(x=>x.id===np);const pd=descendants(par,p).filter(x=>!sub.includes(x));let j=rest.indexOf(par)+1;while(j<rest.length&&pd.includes(rest[j]))j++;rest.splice(j,0,...sub);par.collapsed=false}else rest.push(...sub);p.tasks=rest}
    commit()});
  dlg.showModal();
  if(focusLog)E('newlog').focus();
}

/* ---------- morning list / triage ---------- */
let dumpDraft='';
function openDump(lines,existingIds){
  const dlg=$('#tdlg');dlg.classList.add('wide');
  const me=S.me||'';const people=allPeople();
  let items;
  if(existingIds){items=existingIds.map(id=>{const f=findTodo(id);return {id,text:f.td.text,pid:f.p?f.p.id:'',tid:f.t?f.t.id:'',who:f.td.who,due:f.td.due,pri:f.td.pri||2,imp:!!f.td.imp,block:!!f.td.block}})}
  const step1=()=>{
    dlg.innerHTML=`<form method="dialog"><div class="dh"><span>Seznam – co mám v hlavě</span><button type="button" data-x>×</button></div><div class="db dump">
      <div class="hint">Napište všechno, každou věc na nový řádek – bez třídění a bez formátu. Chcete-li, oddělte skupiny řádkem s názvem projektu a dvojtečkou (např. „ESPIS:“); položky pod ním se do projektu předvyplní. Zatřídit, přidat termíny a priority budete v dalším kroku.</div>
      <textarea name="dump" placeholder="zavolat ICZ kvůli certifikátu&#10;poslat Martinovi tabulku míst&#10;&#10;Web ÚRÚ:&#10;připomínky k designu&#10;domluvit schůzku s Cognito">${esc(dumpDraft)}</textarea>
      ${me?'':`<div class="f"><label>Kdo jsem (aby se ToDo předvyplňovala na mě)</label><input type="text" name="me" list="ppl2" placeholder="Jméno"><datalist id="ppl2">${people.map(m=>`<option value="${esc(m)}">`).join('')}</datalist></div>`}
      </div><div class="df"><button type="button" class="btn" data-x>Zavřít</button><button type="submit" class="btn pri">Zatřídit →</button></div></form>`;
    const fm=$('form',dlg);fm.elements.dump.focus();
    fm.addEventListener('input',()=>dumpDraft=fm.elements.dump.value);
    fm.addEventListener('click',e=>{if(e.target.closest('[data-x]')){dlg.close();dlg.classList.remove('wide')}});
    fm.addEventListener('submit',e=>{e.preventDefault();if(fm.elements.me&&fm.elements.me.value.trim())S.me=fm.elements.me.value.trim();
      const ls=fm.elements.dump.value.split('\n').map(s=>s.replace(/^[\s\-•*·]+/,'').trim());let pid='',tid='';items=[];
      for(const l of ls){if(!l)continue;const m=l.match(/^(.+?):\s*$/);if(m){const q=m[1].toLowerCase();const p=S.projects.find(p=>p.name.toLowerCase().startsWith(q))||S.projects.find(p=>p.name.toLowerCase().includes(q));pid=p?p.id:'';tid='';if(!p){const hit=S.projects.flatMap(pp=>pp.tasks.map(t=>({t,pp}))).find(x=>x.t.name.toLowerCase().startsWith(q));if(hit){pid=hit.pp.id;tid=hit.t.id}}continue}
        items.push({text:l,pid:pid||(V.project!=='ALL'?V.project:''),tid,who:S.me||'',due:'',pri:2,imp:false,block:false})}
      if(!items.length)return;step2()});
  };
  const step2=()=>{
    const pOpts=v=>`<option value="">— mimo projekty —</option>`+S.projects.map(p=>`<option value="${p.id}" ${v===p.id?'selected':''}>${esc(p.name)}</option>`).join('');
    const tOpts=(pid,v)=>{const p=proj(pid);return `<option value="">— inbox projektu —</option>`+(p?p.tasks.filter(t=>!kidsOf(t,p).length&&progressOf(t,p)<100).map(t=>`<option value="${t.id}" ${v===t.id?'selected':''}>${esc(t.name)}</option>`).join(''):'')};
    const wOpts=(pid,v)=>{const p=proj(pid);const ppl=[...new Set([...(p?p.team:people),...(me?[me]:[]),...(v?[v]:[])])];return `<option value="">—</option>`+ppl.map(m=>`<option ${v===m?'selected':''}>${esc(m)}</option>`).join('')};
    const rowHtml=(it,i)=>`<div class="r" data-i="${i}"><span class="hint">${i+1}</span><input type="text" data-k="text" value="${esc(it.text)}"><select data-k="pid">${pOpts(it.pid)}</select><select data-k="tid">${tOpts(it.pid,it.tid)}</select><select data-k="who">${wOpts(it.pid,it.who)}</select><div class="dq"><input type="date" data-k="due" value="${it.due||''}"><button type="button" data-d="0" title="dnes">D</button><button type="button" data-d="1" title="zítra">Z</button></div><select data-k="pri"><option value="1" ${it.pri==1?'selected':''}>A</option><option value="2" ${it.pri==2?'selected':''}>B</option><option value="3" ${it.pri==3?'selected':''}>C</option></select><button type="button" data-k="imp" class="${it.imp?'on':''}" title="Důležité">★</button><button type="button" data-k="block" class="blk ${it.block?'on':''}" title="Blokuje dokončení úkolu">⛔</button><button type="button" class="rm" data-k="rm">×</button></div>`;
    dlg.innerHTML=`<form method="dialog"><div class="dh"><span>Zatřídit ${items.length} položek</span><button type="button" data-x>×</button></div><div class="db">
      <div class="tri"><div class="r hd"><span></span><span>Co</span><span>Projekt</span><span>K úkolu</span><span>Kdo</span><span>Do kdy (D = dnes, Z = zítra)</span><span>Prio</span><span>★</span><span>⛔</span><span></span></div>${items.map(rowHtml).join('')}</div>
      <div class="hint">Bez projektu → Můj inbox. S projektem bez úkolu → Inbox projektu. Priorita A/B/C řadí položky v denním seznamu, ★ je zvedne úplně nahoru. ⛔ znamená, že bez této položky nejde úkol dokončit.</div>
      </div><div class="df">${existingIds?'':'<div class="left-actions"><button type="button" class="btn" data-back>← Zpět k seznamu</button></div>'}<button type="button" class="btn" data-x>Zavřít</button><button type="submit" class="btn pri">Uložit vše</button></div></form>`;
    const fm=$('form',dlg);
    fm.addEventListener('input',e=>{const r=e.target.closest('.r');if(!r)return;const it=items[+r.dataset.i];const k=e.target.dataset.k;if(!k)return;it[k]=k==='pri'?+e.target.value:e.target.value;
      if(k==='pid'){it.tid='';const p=proj(it.pid);if(p&&it.who&&!p.team.includes(it.who)&&it.who!==me)it.who='';$('[data-k=tid]',r).innerHTML=tOpts(it.pid,'');$('[data-k=who]',r).innerHTML=wOpts(it.pid,it.who)}});
    fm.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const r=b.closest('.r');
      if(b.hasAttribute('data-x')){dlg.close();dlg.classList.remove('wide');render();return}
      if(b.hasAttribute('data-back')){step1();return}
      if(!r)return;const it=items[+r.dataset.i];
      if(b.dataset.d!==undefined){it.due=addDays(TODAY,+b.dataset.d);$('[data-k=due]',r).value=it.due}
      if(b.dataset.k==='imp'){it.imp=!it.imp;b.classList.toggle('on',it.imp)}
      if(b.dataset.k==='block'){it.block=!it.block;b.classList.toggle('on',it.block)}
      if(b.dataset.k==='rm'){it.rm=true;r.remove()}});
    fm.addEventListener('submit',e=>{e.preventDefault();
      for(const it of items){if(it.rm||!it.text.trim())continue;const key=it.tid||(it.pid?'p:'+it.pid:'me');
        if(it.id){const f=findTodo(it.id);if(f){f.list.splice(f.list.indexOf(f.td),1);const list=todoList(key);if(list)list.push({...f.td,text:it.text.trim(),who:it.who,due:it.due,pri:it.pri,imp:it.imp,block:it.block});continue}}
        const p=proj(it.pid);if(p&&it.who&&!p.team.includes(it.who))p.team.push(it.who);
        addTodo(key,it.text.trim(),{who:it.who,due:it.due,pri:it.pri,imp:it.imp,block:it.block})}
      dumpDraft='';dlg.close();dlg.classList.remove('wide');if(!existingIds)V.by='daily';commit()});
  };
  if(existingIds)step2();else if(lines){items=lines;step2()}else step1();
  dlg.showModal();
}

/* ---------- project dialog ---------- */
function openProj(id){const p=proj(id);if(!p)return;const dlg=$('#pdlg');
  dlg.innerHTML=`<form method="dialog"><div class="dh"><span>Projekt</span><button type="button" data-x>×</button></div><div class="db">
    <div class="f"><label>Název projektu</label><input type="text" name="name" value="${esc(p.name)}"></div>
    <div class="f"><label>Vedoucí projektu</label><input type="text" name="lead" value="${esc(p.lead||'')}" list="ppl"><datalist id="ppl">${p.team.map(m=>`<option value="${esc(m)}">`).join('')}</datalist></div>
    <div class="f"><label>Barva projektu</label><div class="sw">${PALETTE.map(c=>`<button type="button" data-c="${c}" class="${c===p.color?'on':''}" style="background:${c}"></button>`).join('')}<input type="hidden" name="color" value="${p.color}"></div></div>
    <div class="f"><label>Tým projektu <span class="hint">· jména u úkolů; vpravo lze jméno spojit s přihlášeným uživatelem (kvůli právům řešitele a jeho ToDo)</span></label><div class="team" id="team"></div><div><button type="button" class="btn" data-addm>+ přidat osobu</button></div></div>
    <div class="f"><label>Přístup (přihlášení uživatelé)</label><div class="deplist" id="members"></div><div class="fx"><input type="text" name="invmail" placeholder="e-mail" style="flex:1;border:1px solid var(--line);background:var(--bg);border-radius:6px;padding:6px 8px"><select name="invrole" style="border:1px solid var(--line);background:var(--bg);border-radius:6px;padding:6px 8px"><option value="editor">řešitel</option><option value="viewer">čtenář</option><option value="lead">vedoucí</option></select><button type="button" class="btn" data-inv>Přidat</button></div><span class="hint">Pokud se uživatel ještě nezaregistroval, uloží se pozvánka a členství vznikne při jeho registraci. Vedoucí upravuje vše, řešitel své úkoly, deník, odkazy a ToDo, čtenář jen čte.</span></div>
    <div class="f"><label>Skupiny úkolů (logické celky – barva úkolů)</label><div class="team" id="groups"></div><div><button type="button" class="btn" data-addg>+ přidat skupinu</button></div></div>
    </div><div class="df"><div class="left-actions"><button type="button" class="btn danger" data-del>Smazat projekt</button></div><button type="button" class="btn" data-x>Zavřít</button><button type="submit" class="btn pri">Uložit</button></div></form>`;
  const fm=$('form',dlg),E=n=>fm.elements[n];let team=[...p.team];let groups=p.groups.map(g=>({...g}));
  let links=Object.assign({},p.teamLinks||{});const ROLE={lead:'vedoucí',editor:'řešitel',viewer:'čtenář'};
  const uOpts=v=>`<option value="">— nespojeno —</option>`+(p.members||[]).map(m=>`<option value="${m.user_id}" ${v===m.user_id?'selected':''}>${esc(m.name||m.email)}</option>`).join('');
  const rt=()=>{$('#team',fm).innerHTML=team.map((m,i)=>`<div><input type="text" value="${esc(m)}" data-i="${i}"><select data-ul="${i}" style="flex:0 0 150px;font-size:12px">${uOpts(links[m])}</select><button type="button" data-rm="${i}" title="Odebrat">×</button></div>`).join('')};rt();
  const rm=()=>{$('#members',fm).innerHTML=(p.members||[]).map(m=>`<div><span>${esc(m.name||'')} <span class="hint">${esc(m.email)}</span></span><select data-role="${m.user_id}" style="font-size:12px" ${m.user_id===S.meId?'disabled':''}>${Object.entries(ROLE).map(([k,v])=>`<option value="${k}" ${m.role===k?'selected':''}>${v}</option>`).join('')}</select>${m.user_id===S.meId?'':`<button type="button" data-mrm="${m.user_id}" title="Odebrat">×</button>`}</div>`).join('')+(p.invites||[]).map(i=>`<div><span>${esc(i.email)} <span class="hint">pozvánka · ${ROLE[i.role]}</span></span><button type="button" data-irm="${esc(i.email)}" title="Zrušit pozvánku">×</button></div>`).join('')||'<span class="hint">Zatím jen vy.</span>'};rm();
  let gOpen=-1;const rg=()=>{$('#groups',fm).innerHTML=groups.map((g,i)=>`<div><button type="button" data-gpick="${i}" title="Změnit barvu" style="width:30px;height:28px;border-radius:6px;border:2px solid var(--line);background:${g.color};padding:0;flex:none"></button><input type="text" value="${esc(g.name)}" data-gn="${i}" placeholder="název skupiny"><button type="button" data-grm="${i}" title="Odebrat">×</button></div>${gOpen===i?`<div class="sw" style="padding:4px 0 8px 36px">${PALETTE.map(c=>`<button type="button" data-gc="${i}" data-c="${c}" class="${c===g.color?'on':''}" style="background:${c}"></button>`).join('')}</div>`:''}`).join('')};rg();
  fm.addEventListener('input',e=>{const d=e.target.dataset;if(d.i!==undefined){const old=team[+d.i];team[+d.i]=e.target.value;if(links[old]!==undefined){links[e.target.value]=links[old];delete links[old]}}if(d.gn!==undefined)groups[+d.gn].name=e.target.value});
  fm.addEventListener('change',async e=>{const d=e.target.dataset;if(d.ul!==undefined){const nm=team[+d.ul];if(e.target.value)links[nm]=e.target.value;else delete links[nm]}
    if(d.role){try{await DB.setRole(p.id,d.role,e.target.value);const m=p.members.find(x=>x.user_id===d.role);if(m)m.role=e.target.value;toast('Role změněna')}catch(err){toast(err.message,true)}}});
  fm.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
    if(b.dataset.gpick!==undefined){gOpen=gOpen===+b.dataset.gpick?-1:+b.dataset.gpick;rg();return}
    if(b.dataset.gc!==undefined){groups[+b.dataset.gc].color=b.dataset.c;gOpen=-1;rg();return}
    if(b.dataset.c){$$('.sw button',fm).forEach(x=>x.classList.remove('on'));b.classList.add('on');E('color').value=b.dataset.c}
    if(b.hasAttribute('data-addm')){team.push('');rt();const ins=$$('#team input',fm);ins[ins.length-1].focus()}
    if(b.hasAttribute('data-inv')){const em=E('invmail').value.trim(),role=E('invrole').value;if(!em)return;DB.addMember(p.id,em,role).then(async kind=>{E('invmail').value='';if(kind==='member'){const prof=Object.values(S.profiles||{}).find(x=>x.email.toLowerCase()===em.toLowerCase());p.members.push({user_id:prof.id,role,email:prof.email,name:prof.name||''});toast('Uživatel přidán')}else{p.invites.push({email:em.toLowerCase(),role});toast('Pozvánka uložena')}rm();rt()}).catch(err=>toast(err.message,true))}
    if(b.dataset.mrm){DB.removeMember(p.id,b.dataset.mrm).then(()=>{p.members=p.members.filter(m=>m.user_id!==b.dataset.mrm);rm()}).catch(err=>toast(err.message,true))}
    if(b.dataset.irm){DB.removeInvite(p.id,b.dataset.irm).then(()=>{p.invites=p.invites.filter(i=>i.email!==b.dataset.irm);rm()}).catch(err=>toast(err.message,true))}
    if(b.dataset.rm){team.splice(+b.dataset.rm,1);rt()}
    if(b.hasAttribute('data-addg')){groups.push({id:uid(),name:'',color:PALETTE[(groups.length*4+3)%PALETTE.length]});rg();const ins=$$('#groups input[type=text]',fm);ins[ins.length-1].focus()}
    if(b.dataset.grm){groups.splice(+b.dataset.grm,1);rg()}
    if(b.hasAttribute('data-x'))dlg.close();
    if(b.hasAttribute('data-del')){if(confirm(`Smazat projekt „${p.name}“ včetně ${p.tasks.length} úkolů?`)){S.projects=S.projects.filter(x=>x.id!==id);V.project='ALL';dlg.close();commit()}}
  });
  fm.addEventListener('submit',()=>{
    p.team.forEach((old,i)=>{const nw=team[i];if(nw!==undefined&&nw!==old&&old){p.tasks.forEach(t=>{if(t.resp===old)t.resp=nw;t.collab=(t.collab||[]).map(c=>c===old?nw:c)});if(p.lead===old)p.lead=nw}});
    p.team=[...new Set(team.map(x=>x.trim()).filter(Boolean))];p.teamLinks=Object.fromEntries(Object.entries(links).filter(([n,u])=>u&&p.team.includes(n.trim())).map(([n,u])=>[n.trim(),u]));p.groups=groups.filter(g=>g.name.trim());p.name=E('name').value.trim()||p.name;p.lead=E('lead').value.trim();p.color=E('color').value;commit()});
  dlg.showModal();
}

/* ---------- context menu ---------- */
const ctx=$('#ctx');
function openCtx(id,x,y){const f=findTask(id);if(!f)return;sel=id;$$('.lrow.sel').forEach(r=>r.classList.remove('sel'));const r=$(`.lrow[data-id="${id}"]`);if(r)r.classList.add('sel');
  const t=f.t;const sibs=f.p.tasks.filter(x=>x.parent===t.parent);const k=sibs.indexOf(t);
  ctx.innerHTML=`<button data-op="edit">Detail úkolu <kbd>Enter</kbd></button><div class="sep"></div>
    <button data-op="add">Přidat úkol pod tento</button><button data-op="child">Přidat podúkol</button><div class="sep"></div>
    <button data-op="copy">Kopírovat <kbd>Ctrl+C</kbd></button><button data-op="paste" ${clip?'':'disabled'}>Vložit pod tento <kbd>Ctrl+V</kbd></button><button data-op="pastechild" ${clip?'':'disabled'}>Vložit jako podúkol</button><button data-op="dup">Duplikovat <kbd>Ctrl+D</kbd></button><div class="sep"></div>
    <button data-op="up" ${k>0?'':'disabled'}>Posunout nahoru <kbd>Alt+↑</kbd></button><button data-op="down" ${k<sibs.length-1?'':'disabled'}>Posunout dolů <kbd>Alt+↓</kbd></button><button data-op="in" ${k>0?'':'disabled'}>Zanořit <kbd>Alt+Tab</kbd></button><button data-op="out" ${t.parent?'':'disabled'}>Vynořit <kbd>Alt+Shift+Tab</kbd></button><div class="sep"></div>
    <button data-op="del" class="danger">Smazat <kbd>Delete</kbd></button>`;
  ctx.classList.add('open');const w=ctx.offsetWidth||220,hh=ctx.offsetHeight||360;ctx.style.left=Math.min(x,innerWidth-w-8)+'px';ctx.style.top=Math.min(y,innerHeight-hh-8)+'px';ctx.dataset.id=id}
ctx.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;const id=ctx.dataset.id;ctx.classList.remove('open');
  ({edit:()=>openTask(id),add:()=>addTask(id),child:()=>addChild(id),copy:()=>{copyTask(id);render()},paste:()=>pasteTask(id,false),pastechild:()=>pasteTask(id,true),dup:()=>duplicateTask(id),up:()=>moveTask(id,-1),down:()=>moveTask(id,1),in:()=>indent(id,true),out:()=>indent(id,false),del:()=>delTask(id)})[b.dataset.op]()});
document.addEventListener('click',e=>{if(!e.target.closest('#ctx,[data-act=menu]'))ctx.classList.remove('open')});
document.addEventListener('keydown',e=>{if(e.key==='Escape')ctx.classList.remove('open');
  if(!sel||$('dialog[open]')||/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))return;
  const id=sel;const c=e.ctrlKey||e.metaKey;
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();delTask(id)}
  else if(c&&e.key.toLowerCase()==='c'){e.preventDefault();copyTask(id)}
  else if(c&&e.key.toLowerCase()==='v'){e.preventDefault();pasteTask(id,false)}
  else if(c&&e.key.toLowerCase()==='d'){e.preventDefault();duplicateTask(id)}
  else if(e.altKey&&e.key==='ArrowUp'){e.preventDefault();moveTask(id,-1)}
  else if(e.altKey&&e.key==='ArrowDown'){e.preventDefault();moveTask(id,1)}
  else if(e.altKey&&e.key==='Tab'){e.preventDefault();indent(id,!e.shiftKey)}
  else if(e.key==='Enter'){e.preventDefault();openTask(id)}
  else if(e.key==='ArrowDown'||e.key==='ArrowUp'){const rows=$$('.lrow[data-id]');const i=rows.findIndex(r=>r.dataset.id===id);const n=rows[i+(e.key==='ArrowDown'?1:-1)];if(n){e.preventDefault();sel=n.dataset.id;rows[i].classList.remove('sel');n.classList.add('sel');n.scrollIntoView({block:'nearest'})}}
});

/* ---------- events ---------- */
$('#tabs').addEventListener('click',e=>{const b=e.target.closest('.tab');if(!b)return;if(b.dataset.p==='__new'){newProject();return}V.project=b.dataset.p;V.person='';V.group='';commit();scrollToToday()});
$('#zoom').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;V.zoom=b.dataset.z;commit();scrollToToday()});
$('#by').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;V.by=b.dataset.b;V.status='';commit()});
$('#bToday').onclick=scrollToToday;
$('#narrow').onchange=e=>{V.narrow=e.target.checked;commit()};
$('#strip').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.st==='todo'){V.by='daily';V.status='';commit();return}
  if(b.dataset.st){V.status=V.status===b.dataset.st?'':b.dataset.st;commit()}
  if(b.dataset.g){V.group=V.group===b.dataset.g?'':b.dataset.g;commit()}
  if(b.dataset.gsettings){openProj(V.project)}});
$('#strip').addEventListener('change',e=>{if(e.target.id==='person'){V.person=e.target.value;commit()}});
$('#strip').addEventListener('click',e=>{if(e.target.id==='bDump')openDump();const m=e.target.closest('[data-mine]');if(m){V.mine=!V.mine;commit()}});
$('#strip').addEventListener('keydown',e=>{if(e.target.id==='quick'&&e.key==='Enter'){const v=e.target.value.trim();if(!v)return;quickAdd(v);setTimeout(()=>{const q=$('#quick');q.focus()},0)}});
const menu=$('#menu');
menu.querySelector(':scope > button').onclick=e=>{menu.classList.toggle('open');e.stopPropagation()};
document.addEventListener('click',()=>menu.classList.remove('open'));
menu.addEventListener('click',e=>{const b=e.target.closest('[data-m]');if(!b)return;menu.classList.remove('open');
  switch(b.dataset.m){
    case 'proj':{const p=proj(V.project)||S.projects[0];if(p)openProj(p.id);else newProject();break}
    case 'newproj':newProject();break;
    case 'autodaily':V.autoDaily=!V.autoDaily;commit();break;
    case 'export':{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(S,null,2)],{type:'application/json'}));a.download=`projekty-${TODAY}.json`;a.click();break}
    case 'import':{const dlg=$('#pdlg');dlg.innerHTML=`<form method="dialog"><div class="dh"><span>Import JSON</span><button type="button" data-x>×</button></div><div class="db"><div class="hint">Buď vyberte soubor .json, nebo vložte text zkopírovaný z prototypu (⋯ → Export JSON → Kopírovat do schránky). Projekty se přidají k existujícím.</div><div><button type="button" class="btn" data-file>Vybrat soubor…</button></div><textarea name="json" rows="8" placeholder="Sem vložte JSON…" style="width:100%;font:11px monospace;border:1px solid var(--line);border-radius:6px;padding:6px;background:var(--bg);color:inherit"></textarea></div><div class="df"><button type="button" class="btn" data-x>Zavřít</button><button type="submit" class="btn pri">Importovat vložený text</button></div></form>`;
      const fm=dlg.querySelector('form');fm.addEventListener('click',e=>{if(e.target.closest('[data-x]'))dlg.close();if(e.target.closest('[data-file]')){dlg.close();$('#file').click()}});
      fm.addEventListener('submit',e=>{e.preventDefault();try{const j=JSON.parse(fm.elements.json.value.trim());if(!j.projects)throw 0;dlg.close();importJson(j)}catch(err){alert('Text není platný export z aplikace.')}});dlg.showModal();break}
    case 'logout':DB.signOut();break;
    case 'pwd':changePassword();break;
    case 'name':{const n=prompt('Vaše jméno (tak, jak je uvedené v týmech projektů):',S.me||'');if(n!==null){S.me=n.trim();DB.setName(S.me).then(()=>toast('Jméno uloženo')).catch(e=>toast(e.message,true));render()}break}
    case 'wipe':if(confirm('Opravdu smazat všechna data? Doporučujeme nejdřív export.')){S={projects:[]};V.project='ALL';commit()}break;
  }});
$('#file').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const j=JSON.parse(r.result);if(!j.projects)throw 0;importJson(j)}catch(err){alert('Soubor nelze načíst – není to export z této aplikace.')}};r.readAsText(f);e.target.value=''};
function importJson(j){const map={};const nid=o=>map[o]||(map[o]=uid());
  for(const p of j.projects){const P={id:nid(p.id),name:p.name,lead:p.lead||'',color:p.color||PALETTE[0],team:[...new Set(p.team||[])],teamLinks:{},_teamIds:{},groups:(p.groups||[]).map(g=>({id:nid(g.id),name:g.name,color:g.color})),members:[],invites:[],tasks:[],todos:[]};
    for(const t of p.tasks||[]){P.tasks.push({id:nid(t.id),name:t.name||'',start:t.start,end:t.end,color:t.color||'',group:t.group?nid(t.group):'',resp:t.resp||'',collab:t.collab||[],critical:!!t.critical,milestone:!!t.milestone,progress:t.progress||0,autoProg:!!t.autoProg,collapsed:!!t.collapsed,parent:t.parent?nid(t.parent):null,note:t.note||'',deps:(t.deps||[]).map(nid),links:(t.links||[]).map(l=>({id:uid(),name:l.name||'',url:l.url||''})),log:(t.log||[]).map(l=>({id:uid(),d:l.d,text:l.text})),docs:[],todos:(t.todos||[]).map(td=>({...td,id:uid()}))})}
    P.todos=(p.todos||[]).map(td=>({...td,id:uid()}));S.projects.push(P)}
  S.todos.push(...(j.todos||[]).map(td=>({...td,id:uid()})));if(!S.me&&j.me)S.me=j.me;
  V.project='ALL';V.by='project';V.status='';V.person='';V.group='';commit();scrollToToday();toast('Import proběhl – '+j.projects.length+' projektů')}

g.addEventListener('change',e=>{const el=e.target;const row=el.closest('.lrow');if(!row)return;
  if(el.dataset.tf){const f=findTodo(row.dataset.td);if(!f)return;const k=el.dataset.tf;f.td[k]=k==='done'?el.checked:k==='pri'?+el.value:el.value;if(k==='done')f.td.doneAt=el.checked?TODAY:'';commit();return}
  if(!el.dataset.f)return;const f=findTask(row.dataset.id);if(!f)return;const t=f.t;
  const k=el.dataset.f;let v=el.value;if(k==='progress'){v=Math.min(100,Math.max(0,+v||0));if(v>=100&&openBlocking(t).length){alert('Úkol má otevřené blokující ToDo:\n– '+openBlocking(t).map(x=>x.text).join('\n– '));render();return}}t[k]=v;commit()});
g.addEventListener('keydown',e=>{const el=e.target;const row=el.closest('.lrow');
  if(el.classList.contains('tt')){
    if(e.key==='Enter'){e.preventDefault();if(el.dataset.new){const v=el.value.trim();if(!v)return;addTodo(row.dataset.key,v);focusTd=row.dataset.key;commit()}else{const f=findTodo(row.dataset.td);if(!f)return;f.td.text=el.value;const i=f.list.indexOf(f.td);const td={id:uid(),text:'',done:false,who:'',due:'',block:false};f.list.splice(i+1,0,td);focusTd='td:'+td.id;commit()}}
    if(e.key==='Escape')el.blur();
    if(e.key==='Backspace'&&el.value===''&&!el.dataset.new){e.preventDefault();const f=findTodo(row.dataset.td);if(f){f.list.splice(f.list.indexOf(f.td),1);commit()}}
    return}
  if(!el.classList.contains('nm'))return;
  if(e.key==='Enter'){e.preventDefault();findTask(row.dataset.id).t.name=el.value;addTask(row.dataset.id)}
  if(e.key==='Escape')el.blur();
  if(e.key==='Tab'&&e.altKey){e.preventDefault();findTask(row.dataset.id).t.name=el.value;indent(row.dataset.id,!e.shiftKey)}
  if(e.key==='ArrowDown'&&e.altKey){e.preventDefault();moveTask(row.dataset.id,1)}
  if(e.key==='ArrowUp'&&e.altKey){e.preventDefault();moveTask(row.dataset.id,-1)}
});
g.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;const row=b.closest('.lrow');
  if(b.dataset.act==='edit')openTask(row.dataset.id,b.classList.contains('nt'));
  if(b.dataset.act==='menu'){const r=b.getBoundingClientRect();openCtx(row.dataset.id,r.left-200,r.bottom+4)}
  if(b.dataset.act==='proj')openProj(row.dataset.pid);
  if(b.dataset.act==='toggle'){const f=findTask(row.dataset.id);f.t.collapsed=!f.t.collapsed;commit()}
  if(b.dataset.act==='open'){const k=row.dataset.key||row.dataset.id;toggleOpen(k);if(isOpen(k)){const l=todoList(k);if(l&&!l.length)focusTd=k}commit()}
});
g.addEventListener('click',e=>{const b=e.target.closest('[data-tact],[data-tf=block],[data-tf=imp]');if(!b)return;const row=b.closest('.lrow');const f=findTodo(row.dataset.td);if(!f)return;
  if(b.dataset.tact==='del'){f.list.splice(f.list.indexOf(f.td),1);commit()}
  if(b.dataset.tact==='tri'){openDump(null,[f.td.id])}
  if(b.dataset.tf==='block'){f.td.block=!f.td.block;commit()}
  if(b.dataset.tf==='imp'){f.td.imp=!f.td.imp;commit()}});
g.addEventListener('dblclick',e=>{const bar=e.target.closest('.bar');if(bar&&bar.dataset.id)openTask(bar.dataset.id)});
g.addEventListener('contextmenu',e=>{const el=e.target.closest('.bar[data-id],.lrow[data-id]');if(!el)return;e.preventDefault();openCtx(el.dataset.id,e.clientX,e.clientY)});
g.addEventListener('click',e=>{if(e.target.closest('button,input,select,.bar'))return;const row=e.target.closest('.lrow[data-id]');if(!row)return;$$('.lrow.sel').forEach(r=>r.classList.remove('sel'));sel=row.dataset.id;row.classList.add('sel')});
let drag=null;
g.addEventListener('pointerdown',e=>{const bar=e.target.closest('.bar');if(!bar||!bar.dataset.id||bar.classList.contains('grp')||e.button!==0)return;
  const f=findTask(bar.dataset.id);if(!f)return;
  const mode=e.target.classList.contains('h-l')?'l':e.target.classList.contains('h-r')?'r':'m';
  drag={bar,t:f.t,mode,x0:e.clientX,start:f.t.start,end:f.t.end,left:parseFloat(bar.style.left),moved:false,px:+g.dataset.px};
  bar.setPointerCapture(e.pointerId);e.preventDefault()});
g.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x0;if(Math.abs(dx)>3)drag.moved=true;if(!drag.moved)return;
  const dd=Math.round(dx/drag.px);const {t,px}=drag;
  if(drag.mode==='m'){drag.bar.style.left=(drag.left+dd*px)+'px';drag.ns=addDays(drag.start,dd);drag.ne=addDays(drag.end,dd)}
  else if(drag.mode==='r'){const d=Math.max(1,diff(drag.start,drag.end)+1+dd);drag.bar.style.width=d*px+'px';drag.ns=drag.start;drag.ne=addDays(drag.start,d-1)}
  else{const d=Math.max(1,diff(drag.start,drag.end)+1-dd);const ns=addDays(drag.end,-(d-1));drag.bar.style.left=(drag.left+diff(drag.start,ns)*px)+'px';drag.bar.style.width=d*px+'px';drag.ns=ns;drag.ne=drag.end}
  drag.bar.title=`${t.name}: ${fmt(drag.ns)} – ${fmt(drag.ne)}`});
const endDrag=e=>{if(!drag)return;const d=drag;drag=null;if(d.moved&&d.ns){d.t.start=d.ns;d.t.end=d.ne;commit()}else if(!d.moved&&e.type==='pointerup'){$$('.lrow.sel').forEach(r=>r.classList.remove('sel'));sel=d.t.id;const r=$(`.lrow[data-id="${d.t.id}"]`);if(r){r.scrollIntoView({block:'nearest'});r.classList.add('sel')}}};
g.addEventListener('pointerup',endDrag);g.addEventListener('pointercancel',endDrag);
document.addEventListener('keydown',e=>{if(e.key==='l'&&!e.ctrlKey&&!e.metaKey&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)&&!$('dialog[open]')){e.preventDefault();openDump()}
  if(e.key==='n'&&!e.ctrlKey&&!e.metaKey&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)&&!$('dialog[open]')){e.preventDefault();$('#quick').focus()}});

/* ---------- auth & init ---------- */
function showAuth(msg){$('#auth').style.display='flex';$('#authmsg').textContent=msg||''}
function hideAuth(){$('#auth').style.display='none'}
async function changePassword(){const p=prompt('Nové heslo (min. 8 znaků):');if(!p)return;try{await DB.updatePassword(p);toast('Heslo změněno')}catch(e){toast(e.message,true)}}
async function boot(){
  load();S={me:'',projects:[],todos:[]};
  try{const c=JSON.parse(localStorage.getItem(CACHE));if(c&&c.projects)S=c}catch(e){}
  const u=await DB.init(async user=>{if(user){await start()}else{S={me:'',projects:[],todos:[]};render();showAuth()}});
  if(u)await start();else{render();showAuth()}
}
async function start(){
  hideAuth();$('#gantt').innerHTML='<div class="empty">Načítám data…</div>';
  try{S=await DB.load();$('#who').textContent=S.me||S.meEmail}
  catch(e){console.error(e);toast('Data se nepodařilo načíst: '+(e.message||e),true)}
  if(V.by==='todo')V.by='daily';
  if(V.autoDaily!==false&&V.lastDaily!==TODAY){V.by='daily';V.lastDaily=TODAY;V.dnew='0'}
  if(V.project!=='ALL'&&!proj(V.project))V.project='ALL';
  save();render();scrollToToday();
  DB.subscribe(async()=>{try{const open=$('dialog[open]');if(open)return;S=await DB.load();render()}catch(e){}});
}
$('#authform').addEventListener('submit',async e=>{e.preventDefault();const f=e.target;const em=f.email.value.trim(),pw=f.password.value;$('#authmsg').textContent='';
  try{if(f.dataset.mode==='signup'){const {error}=await DB.signUp(em,pw,f.uname.value.trim());if(error)throw error;$('#authmsg').textContent='Účet vytvořen. Pokud je zapnuté potvrzení e-mailu, potvrďte ho a přihlaste se.'}
    else{const {error}=await DB.signIn(em,pw);if(error)throw error}}
  catch(err){$('#authmsg').textContent=err.message==='Invalid login credentials'?'Nesprávný e-mail nebo heslo.':err.message}});
$('#authmode').addEventListener('click',()=>{const f=$('#authform');const su=f.dataset.mode!=='signup';f.dataset.mode=su?'signup':'login';$('#authsubmit').textContent=su?'Vytvořit účet':'Přihlásit';$('#authmode').textContent=su?'Mám účet – přihlásit':'Nemám účet – zaregistrovat';$('#unamef').style.display=su?'':'none'});
$('#authreset').addEventListener('click',async()=>{const em=$('#authform').email.value.trim();if(!em){$('#authmsg').textContent='Zadejte e-mail.';return}const {error}=await DB.resetPassword(em);$('#authmsg').textContent=error?error.message:'Odkaz pro změnu hesla byl odeslán.'});
boot();
