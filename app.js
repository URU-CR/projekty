
/* ---------- helpers ---------- */
const APP_VERSION='1.12.0';
const g=document.getElementById('gantt');
const PALETTE=['#2196f3','#1fb8c4','#1cb36d','#8bc34a','#e6b800','#f39a1e','#a0522d','#5c6bff','#9c5bd6','#e67ab0','#607d8b','#795548','#00897b','#3f51b5','#c0ca33','#ff8f00','#6d4c41','#455a64','#7e57c2','#26a69a','#d4a017','#5d8aa8','#8e9a3a','#b5651d'];
const CRIT='var(--critical)';
const DAY=864e5, ROWH=34, ZOOM={day:34,week:14,month:5};
const iso=d=>d.toISOString().slice(0,10);
const parse=s=>new Date(s+'T00:00:00Z');
const addDays=(s,n)=>iso(new Date(parse(s).getTime()+n*DAY));
const diff=(a,b)=>Math.round((parse(b)-parse(a))/DAY);
const todayIso=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
let TODAY=todayIso();
function checkDate(){const t=todayIso();if(t!==TODAY){TODAY=t;if(typeof render==='function'&&S){if(V.autoDaily!==false&&V.lastDaily!==TODAY){V.todoPanel='open';V.lastDaily=TODAY}render()}}}
setInterval(checkDate,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkDate()});window.addEventListener('focus',checkDate);
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
let V={project:'ALL',zoom:'week',by:'project',person:'',status:'',group:'',narrow:false,open:[],mine:true,autoDaily:true,lastDaily:'',dopen:'',draft:''};
let focusId=null,focusTd=null,sel=null,clip=null,lastTodoId=null;
function load(){try{const v=JSON.parse(localStorage.getItem(KEY));if(v)V={...V,...v}}catch(e){}return false}
function save(){try{localStorage.setItem(KEY,JSON.stringify(V));localStorage.setItem(CACHE,JSON.stringify(S))}catch(e){}}
function toast(msg,err){let t=$('#toast');if(!t){t=document.createElement('div');t.id='toast';t.onclick=()=>t.style.display='none';document.body.appendChild(t)}t.textContent=msg+(err?'  (klepnutím zavřít)':'');t.className=err?'err':'';t.style.display='block';clearTimeout(t._h);if(err){try{const l=JSON.parse(localStorage.getItem('projekty-errors')||'[]');l.push(new Date().toISOString().slice(0,16)+' '+msg);localStorage.setItem('projekty-errors',JSON.stringify(l.slice(-10)))}catch(e){}}else t._h=setTimeout(()=>t.style.display='none',2000)}

function sample(){return {me:'',projects:[],todos:[]}}
/* ---------- lookups ---------- */
const curProjects=()=>V.project==='ALL'?S.projects:S.projects.filter(p=>p.id===V.project);
const findTask=(id)=>{for(const p of S.projects){let t=p.tasks.find(x=>x.id===id);if(t)return {t,p};if(p._liveTasks){t=p._liveTasks.find(x=>x.id===id);if(t)return {t,p,live:true}}}return null};
const origOf=(t,p)=>p._draft&&t.orig?(p._liveTasks||[]).find(x=>x.id===t.orig):null;
const proj=(id)=>S.projects.find(p=>p.id===id);
const kidsOf=(t,p)=>p.tasks.filter(x=>x.parent===t.id);
const depth=(t,p)=>{let d=0,c=t;while(c&&c.parent){c=p.tasks.find(x=>x.id===c.parent);if(!c)break;d++;if(d>10)break}return d};
const descendants=(t,p)=>{const out=[];const walk=x=>kidsOf(x,p).forEach(k=>{out.push(k);walk(k)});walk(t);return out};
const wbsOf=(t,p)=>{const parts=[];let c=t;while(c){const sib=p.tasks.filter(x=>x.parent===c.parent);parts.unshift(sib.indexOf(c)+1);c=c.parent?p.tasks.find(x=>x.id===c.parent):null}return parts.join('.')};
const hiddenByCollapse=(t,p)=>{let c=t;while(c.parent){c=p.tasks.find(x=>x.id===c.parent);if(!c)return false;if(c.collapsed)return true}return false};
const baseColor=(t,p)=>{const g=(p.groups||[]).find(g=>g.id===t.group);return t.color||(g?g.color:p.color)};
const colorOf=(t,p)=>{if(t.critical&&progressOf(t,p)<100)return CRIT;return baseColor(t,p)};
const groupName=(t,p)=>{const g=(p.groups||[]).find(g=>g.id===t.group);return g?g.name:''};
function span(t,p){const kids=kidsOf(t,p);if(!kids.length)return{start:t.start,end:t.end,group:false};
  const sp=kids.map(k=>span(k,p));return{start:sp.reduce((a,k)=>k.start<a?k.start:a,sp[0].start),end:sp.reduce((a,k)=>k.end>a?k.end:a,sp[0].end),group:true}}
function progressOf(t,p){const kids=kidsOf(t,p);if(!kids.length){if(t.autoProg&&t.todos&&t.todos.length)return Math.round(t.todos.filter(x=>x.done).length/t.todos.length*100);return t.progress||0}return Math.round(kids.reduce((a,k)=>a+progressOf(k,p),0)/kids.length)}
const openBlocking=t=>(t.todos||[]).filter(x=>!x.done&&x.block);
const overdueBlocking=t=>openBlocking(t).filter(x=>x.due&&x.due<TODAY);
function allTodos(){const out=[];for(const p of curProjects()){p.todos.forEach(td=>{if(!td.heading)out.push({td,p,t:null})});p.tasks.forEach(t=>t.todos.forEach(td=>out.push({td,p,t})))}if(V.project==='ALL')S.todos.forEach(td=>{if(!td.heading)out.push({td,p:null,t:null})});return out}
function findTodo(id){for(const p of S.projects){let td=p.todos.find(x=>x.id===id);if(td)return{td,list:p.todos,p,t:null};for(const t of [...p.tasks,...(p._liveTasks||[])]){td=(t.todos||[]).find(x=>x.id===id);if(td)return{td,list:t.todos,p,t}}}const td=S.todos.find(x=>x.id===id);return td?{td,list:S.todos,p:null,t:null}:null}
const todoList=key=>key==='me'?S.todos:key.startsWith('p:')?proj(key.slice(2))?.todos:findTask(key)?.t.todos;
const linkedNames=p=>Object.entries(p.teamLinks||{}).filter(([n,u])=>u===S.meId).map(([n])=>n);
const myNames=()=>{const l=S.projects.flatMap(linkedNames);return new Set((l.length?l:[S.me]).filter(Boolean))};
const myNameIn=p=>{const l=linkedNames(p);if(l.length)return l[0];return p.team.includes(S.me)?S.me:''};
const myRole=p=>p.myRole||(p.created_by===S.meId?'lead':'');
const canEditGroup=(p,gid)=>myRole(p)==='lead'||(p.access||[]).some(x=>x.user_id===S.meId&&x.group_id===gid&&x.can_edit);
const proposerOnly=()=>!!S.projects.length&&S.projects.every(p=>myRole(p)==='proposer');
const hasScope=p=>myRole(p)==='proposer'||!!p.myScoped;
const groupWritable=(p,gid)=>{const r=myRole(p);if(r==='lead')return true;if(r!=='editor')return false;if(!hasScope(p))return true;return (p.access||[]).some(x=>x.user_id===S.meId&&x.group_id===gid&&x.can_edit)};
const taskWritable=(t,p)=>{if(!groupWritable(p,t.group))return false;if(myRole(p)==='lead')return true;if(myRole(p)!=='editor')return false;const MY=new Set(linkedNames(p));return MY.has(t.resp)||(t.collab||[]).some(c=>MY.has(c))};
const isRO=p=>!!V.viewVer||(myRole(p)==='proposer'&&!p._draft);
function activeDraft(){for(const p of S.projects)if(p._draft){const pr=(p.proposals||[]).find(x=>x.id===p._draft);if(pr)return{p,pr}}return null}
function exitDraft(){leaveVersionView();for(const p of S.projects){if(p._draft){const pr=(p.proposals||[]).find(x=>x.id===p._draft);if(pr)pr.tasks=p.tasks;p.tasks=p._liveTasks||p.tasks;delete p._liveTasks;delete p._draft}}V.draft=''}
function enterDraft(p,pr){exitDraft();p._liveTasks=p.tasks;p.tasks=pr.tasks;p._draft=pr.id;V.draft=pr.id;V.project=p.id;V.by='project';V.group='';V.status=''}
function restoreDraft(){if(!V.draft)return;for(const p of S.projects){const pr=(p.proposals||[]).find(x=>x.id===V.draft&&x.status==='open');if(pr){enterDraft(p,pr);return}}V.draft=''}
function copyGroupTasks(live,gid){const src=live.filter(t=>t.group===gid);const map={};src.forEach(t=>map[t.id]=uid());return src.map(t=>({id:map[t.id],orig:t.id,name:t.name,start:t.start,end:t.end,color:t.color||'',group:t.group,resp:t.resp||'',collab:[...(t.collab||[])],critical:!!t.critical,milestone:!!t.milestone,progress:t.progress||0,collapsed:false,parent:t.parent&&map[t.parent]?map[t.parent]:null,note:t.note||'',deps:(t.deps||[]).map(d=>map[d]).filter(Boolean),unclear:!!t.unclear,question:t.question||'',links:[],log:[],docs:[],todos:[],_draft:true}))}
async function resetDraft(){const d=activeDraft();if(!d)return;const{p,pr}=d;if(!confirm('Nahradit obsah návrhu novou kopií aktuálního harmonogramu?\nDosavadní stav návrhu se před tím uloží jako verze.'))return;await saveDraftVersion('auto','před obnovením z aktuálního harmonogramu');const fresh=copyGroupTasks(p._liveTasks,pr.group);if(!fresh.length){toast('Skupina v aktuálním harmonogramu nemá žádné úkoly.',true);return}p.tasks=fresh;pr.tasks=fresh;commit();DB.sync(S).then(()=>saveDraftVersion('initial','výchozí stav (obnoveno z aktuálního harmonogramu)')).catch(()=>{});toast('Návrh obnoven z aktuálního harmonogramu')}
function createDraft(p,gid){const src=p.tasks.filter(t=>t.group===gid);if(!src.length){toast('Skupina nemá žádné úkoly.',true);return}
  const map={};src.forEach(t=>map[t.id]=uid());
  const tasks=src.map(t=>({id:map[t.id],orig:t.id,name:t.name,start:t.start,end:t.end,color:t.color||'',group:t.group,resp:t.resp||'',collab:[...(t.collab||[])],critical:!!t.critical,milestone:!!t.milestone,progress:t.progress||0,collapsed:false,parent:t.parent&&map[t.parent]?map[t.parent]:null,note:t.note||'',deps:(t.deps||[]).map(d=>map[d]).filter(Boolean),unclear:!!t.unclear,question:t.question||'',links:[],log:[],docs:[],todos:[],_draft:true}));
  const pr={id:uid(),group:gid,status:'open',note:'',created_by:S.meId,createdName:S.me,created_at:new Date().toISOString(),tasks,versions:[]};(p.proposals||=[]).push(pr);enterDraft(p,pr);commit();DB.sync(S).then(()=>saveDraftVersion('initial','výchozí stav (kopie aktuálního harmonogramu)')).catch(()=>{})}
function draftStats(p,pr){const live=p._draft===pr.id?p._liveTasks:p.tasks;const lb=Object.fromEntries(live.map(t=>[t.id,t]));const pts=p._draft===pr.id?p.tasks:pr.tasks;
  let nw=0,chg=0;const seen=new Set();for(const t of pts){if(!t.orig||!lb[t.orig]){nw++;continue}seen.add(t.orig);const o=lb[t.orig];if(o.name!==t.name||o.start!==t.start||o.end!==t.end||o.resp!==t.resp||!!o.milestone!==!!t.milestone||!!o.critical!==!!t.critical||(o.parent&&lb[o.parent]?o.parent:null)!==(t.parent?(pts.find(x=>x.id===t.parent)||{}).orig||'new':null))chg++}
  const del=live.filter(t=>t.group===pr.group&&!seen.has(t.id)).length;return{nw,chg,del}}
function draftChange(p,t){if(!p._draft||!t.orig)return null;const o=(p._liveTasks||[]).find(x=>x.id===t.orig);if(!o)return null;const ch=[];if(o.name!==t.name)ch.push('název: '+o.name);if(o.start!==t.start)ch.push('od: '+fmt(o.start));if(o.end!==t.end)ch.push('do: '+fmt(o.end));if(o.resp!==t.resp)ch.push('odp.: '+(o.resp||'—'));if(!!o.milestone!==!!t.milestone)ch.push('milník');if(!!o.critical!==!!t.critical)ch.push('kritický');return ch.length?ch:null}
async function approveDraft(){const d=activeDraft();if(!d)return;const{p,pr}=d;const st=draftStats(p,pr);if(!confirm(`Schválit návrh skupiny „${groupNameOf(p,pr.group)}“?\n${st.nw} nových, ${st.chg} změněných, ${st.del} zrušených úkolů${st.del?' (rušené úkoly ztratí ToDo, deník i dokumenty)':''}.`))return;
  await saveDraftVersion('approved','schválená verze');const N=p.tasks;exitDraft();const live=p.tasks;const lb=Object.fromEntries(live.map(t=>[t.id,t]));
  const idMap={};N.forEach(n=>idMap[n.id]=(n.orig&&lb[n.orig])?n.orig:n.id);
  const merged=N.map(n=>{const par=n.parent?idMap[n.parent]:null;const deps=(n.deps||[]).map(x=>idMap[x]).filter(Boolean);
    if(n.orig&&lb[n.orig]){const o=lb[n.orig];Object.assign(o,{name:n.name,start:n.start,end:n.end,color:n.color,resp:n.resp,collab:[...n.collab],critical:n.critical,milestone:n.milestone,note:n.note,unclear:n.unclear,question:n.question,parent:par,deps});if(o.milestone)o.end=o.start;return o}
    return {id:n.id,name:n.name,start:n.start,end:n.milestone?n.start:n.end,color:n.color,group:pr.group,resp:n.resp,collab:[...n.collab],critical:n.critical,milestone:n.milestone,progress:0,autoProg:false,collapsed:false,parent:par,note:n.note,unclear:n.unclear,question:n.question,deps,links:[],log:[],docs:[],todos:[]}});
  const mergedIds=new Set(merged.map(t=>t.id));const first=live.findIndex(t=>t.group===pr.group);const rest=live.filter(t=>t.group!==pr.group);const idx=first<0?rest.length:Math.min(first,rest.length);
  rest.splice(idx,0,...merged);const ids=new Set(rest.map(t=>t.id));rest.forEach(t=>{t.deps=(t.deps||[]).filter(x=>ids.has(x));if(t.parent&&!ids.has(t.parent))t.parent=null});
  p.tasks=rest;pr.status='approved';pr.tasks=[];commit();toast('Návrh schválen a promítnut do harmonogramu')}
function rejectDraft(){const d=activeDraft();if(!d)return;const{p,pr}=d;if(!confirm('Zamítnout a smazat návrh?'))return;exitDraft();pr.status='rejected';pr.tasks=[];commit()}
const snapTasks=ts=>ts.map(t=>({id:t.id,orig:t.orig||null,name:t.name,start:t.start,end:t.end,color:t.color||'',group:t.group,resp:t.resp||'',collab:[...(t.collab||[])],critical:!!t.critical,milestone:!!t.milestone,progress:t.progress||0,collapsed:!!t.collapsed,parent:t.parent||null,note:t.note||'',deps:[...(t.deps||[])],unclear:!!t.unclear,question:t.question||''}));
const fmtDT=s=>{const d=new Date(s);return d.getDate()+'. '+(d.getMonth()+1)+'. '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')};
async function saveDraftVersion(kind,name){const d=activeDraft();if(!d)return;const{p,pr}=d;try{const v=await DB.saveVersion(p.id,pr.id,name,kind,snapTasks(p.tasks));v.authorName=S.me;(pr.versions||=[]).push(v);renderDraftBar();if(kind==='manual')toast('Verze uložena')}catch(e){toast('Verzi se nepodařilo uložit: '+(e.message||e),true)}}
function diffTasks(A,B){const ab=Object.fromEntries(A.map(t=>[t.orig||t.id,t])),bb=Object.fromEntries(B.map(t=>[t.orig||t.id,t]));const out=[];
  for(const t of B){const o=ab[t.orig||t.id];if(!o){out.push({k:'add',t:t.name});continue}const ch=[];if(o.name!==t.name)ch.push(`název „${o.name}“ → „${t.name}“`);if(o.start!==t.start)ch.push(`od ${fmts(o.start)} → ${fmts(t.start)}`);if(o.end!==t.end)ch.push(`do ${fmts(o.end)} → ${fmts(t.end)}`);if(o.resp!==t.resp)ch.push(`odp. ${o.resp||'—'} → ${t.resp||'—'}`);if(!!o.milestone!==!!t.milestone)ch.push(t.milestone?'nově milník':'už ne milník');if(!!o.critical!==!!t.critical)ch.push(t.critical?'nově kritický':'už ne kritický');if(!!o.unclear!==!!t.unclear)ch.push(t.unclear?'k upřesnění':'upřesněno');if(ch.length)out.push({k:'chg',t:t.name,ch})}
  for(const t of A){if(!bb[t.orig||t.id])out.push({k:'del',t:t.name})}return out}
function showDiff(title,A,B){const df=diffTasks(A,B);const dlg=$('#pdlg');dlg.classList.remove('proj');dlg.innerHTML=`<form method="dialog"><div class="dh"><span>${esc(title)}</span><button type="button" data-x>×</button></div><div class="db"><div class="vdiff">${df.length?df.map(x=>`<div class="${x.k}">${x.k==='add'?'➕ nový: ':x.k==='del'?'➖ zrušen: ':'✎ '}<b>${esc(x.t)}</b>${x.ch?' – '+esc(x.ch.join('; ')):''}</div>`).join(''):'<span class="hint">Žádné rozdíly.</span>'}</div></div><div class="df"><button type="button" class="btn" data-x>Zavřít</button></div></form>`;dlg.querySelector('form').addEventListener('click',e=>{if(e.target.closest('[data-x]'))dlg.close()});dlg.showModal()}
async function versionAction(op,vid){const d=activeDraft();if(!d)return;const{p,pr}=d;const v=(pr.versions||[]).find(x=>x.id===vid);if(!v)return;
  let snap;try{snap=await DB.getVersion(vid)}catch(e){toast(e.message,true);return}const vt=(snap.tasks||[]).map(t=>({...t,links:[],log:[],docs:[],todos:[],_draft:true}));
  if(op==='diff'){showDiff(`Verze „${v.name}“ → současný stav návrhu`,vt,p._verTasks||p.tasks);return}
  if(op==='view'){V.viewVer=vid;p._verTasks=p.tasks;p.tasks=vt;render();return}
  if(op==='restore'){if(!confirm(`Obnovit návrh do stavu verze „${v.name}“ (${fmtDT(v.created_at)})?\nSoučasný stav se před obnovením automaticky uloží jako verze.`))return;await saveDraftVersion('auto','před obnovením verze „'+v.name+'“');p.tasks=vt;pr.tasks=vt;commit();toast('Návrh obnoven z verze')}}
function leaveVersionView(){const d=activeDraft();if(d&&d.p._verTasks){d.p.tasks=d.p._verTasks;delete d.p._verTasks}V.viewVer='';}
const FIELD={name:'název',start:'od',end:'do',resp:'odpovědný',progress:'plnění',critical:'kritický',milestone:'milník',unclear:'k upřesnění',group:'skupina',note:'zadání',parent:'nadřazený'};
const fmtVal=(f,v)=>v==null||v===''?'—':(f==='start'||f==='end')?fmts(v):f==='progress'?v+' %':(f==='critical'||f==='milestone'||f==='unclear')?(v==='true'?'ano':'ne'):v;
function chgText(c){if(c.kind==='new')return 'nový úkol';if(c.kind==='deleted')return 'úkol smazán';if(c.kind==='log')return 'deník: „'+(c.new||'')+'“';if(c.kind==='doc')return 'soubor: '+(c.new||'');if(c.kind==='todo')return (c.field==='done'?'splněno ToDo: ':c.field==='undone'?'vráceno ToDo: ':'nové ToDo: ')+(c.new||'');return (FIELD[c.field]||c.field)+': '+fmtVal(c.field,c.old)+' → '+fmtVal(c.field,c.new)}
const unreadOf=(p,tid)=>S.trackChanges?(p.changes||[]).filter(c=>c.task_id===tid&&!c.read&&c.author!==S.meId):[];
const unreadAll=p=>S.trackChanges?(p.changes||[]).filter(c=>!c.read&&c.author!==S.meId):[];
async function ackChanges(p,ids){if(!ids.length)return;try{await DB.markRead(ids);(p.changes||[]).forEach(c=>{if(ids.includes(c.id))c.read=true});render()}catch(e){toast(e.message,true)}}
function revertChange(p,c){const t=p.tasks.find(x=>x.id===c.task_id);if(!t||c.kind!=='task'){toast('Tuto změnu nelze vrátit automaticky.',true);return}
  const f=c.field,v=c.old;if(f==='name')t.name=v||'';else if(f==='start'){t.start=v;if(t.end<t.start)t.end=t.start}else if(f==='end'){t.end=v;if(t.milestone)t.end=t.start}else if(f==='resp')t.resp=v||'';else if(f==='progress')t.progress=+v||0;else if(f==='critical')t.critical=v==='true';else if(f==='milestone')t.milestone=v==='true';else if(f==='unclear')t.unclear=v==='true';else if(f==='note')t.note=v||'';else{toast('Tuto změnu nelze vrátit automaticky.',true);return}
  ackChanges(p,[c.id]);commit();toast('Vráceno: '+chgText(c))}
const groupNameOf=(p,gid)=>((p.groups||[]).find(g=>g.id===gid)||{}).name||'?';
const allPeople=()=>[...new Set([S.me,...S.projects.flatMap(p=>p.team)].filter(Boolean))];
const prioSort=(a,b)=>(b.td.imp?1:0)-(a.td.imp?1:0)||(a.td.pri||4)-(b.td.pri||4)||((a.td.due||'9')<(b.td.due||'9')?-1:1);
const isOpen=k=>V.open.includes(k);const toggleOpen=k=>{V.open=isOpen(k)?V.open.filter(x=>x!==k):[...V.open,k]};
function status(t,p){const sp=span(t,p),pr=progressOf(t,p);
  if(pr>=100)return{k:'done',l:'hotovo'};
  if(sp.end<TODAY)return{k:'late',l:'po termínu '+diff(sp.end,TODAY)+' d'};
  if(overdueBlocking(t).length)return{k:'risk',l:'ohrožen'};
  if(sp.start<=addDays(TODAY,-2)&&pr===0&&!t.milestone)return{k:'stalled',l:'nezahájeno'};
  // ve skluzu: termín ještě běží, ale % plnění je nižší, než odpovídá uplynulé části trvání (tolerance 1 den)
  if(!t.milestone&&sp.start<TODAY){const dur=diff(sp.start,sp.end)+1,el=diff(sp.start,TODAY);const exp=el/dur*100;const lag=Math.round((exp-pr)/100*dur);if(lag>=1&&exp-pr>=5)return{k:'behind',l:'skluz ~'+lag+' d'}}
  if(sp.end<=addDays(TODAY,7))return{k:'soon',l:sp.end===TODAY?'dnes':'za '+diff(TODAY,sp.end)+' d'};
  if(sp.start<=TODAY)return{k:'active',l:'běží'};
  return{k:'future',l:''}}
function matches(t,p){if(V.status){const k=status(t,p).k;if(V.status==='changes'){if(!unreadOf(p,t.id).length)return false}else if(V.status==='unclear'){if(!t.unclear)return false}else if(V.status==='critical'){if(!t.critical||k==='done')return false}else if(V.status==='open'){if(k==='done')return false}else if(k!==V.status)return false}
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
      const ot=origOf(t,p);if(ot?isOpen(ot.id):isOpen(t.id))todoRows(rows,(ot||t).todos,(ot||t).id,ot||t,p,lv);
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
  {const lm=V.leftMode||(V.narrow?'narrow':'full');$('#leftwL').textContent=lm==='full'?'plná':lm==='narrow'?'úzká':'skrytá (jen Gantt)';$('#stripL').textContent=V.hideStrip?'skrytá':'zobrazena';document.body.classList.toggle('nostrip',!!V.hideStrip)}$('#autodailyL').textContent=V.autoDaily?'ano':'ne';$('#bartipL').textContent=V.barTip===false?'ne':'ano';const tl=$('#trackL');if(tl)tl.textContent=S.trackChanges===false?'vypnuto':'zapnuto';

}
function renderDraftBar(){const el=$('#draftbar');const d=activeDraft();const cp=proj(V.project);if(!d&&cp&&isRO(cp)&&V.by==='project'){const props=(cp.proposals||[]).filter(x=>x.status==='open');el.className='on';el.innerHTML=`<b>JEN KE ČTENÍ</b> <span class="stat">Jste navrhovatel – aktuální harmonogram nelze upravovat. Změny dělejte v návrhu:</span> ${props.map(pr=>`<button class="btn pri" data-enter="${pr.id}">Otevřít návrh ${esc(groupNameOf(cp,pr.group))}</button>`).join('')}${cp.groups.filter(g=>canEditGroup(cp,g.id)&&!props.some(x=>x.group===g.id)).map(g=>`<button class="btn pri" data-newdraft="${g.id}">+ Založit návrh pro ${esc(g.name)}</button>`).join('')}`;return}
  if(!d||V.by!=='project'){el.className='';el.innerHTML='';return}const{p,pr}=d;const st=draftStats(p,pr);const lead=myRole(p)==='lead';
  if(V.viewVer){const v=(pr.versions||[]).find(x=>x.id===V.viewVer);el.className='on';el.innerHTML=`<b>PROHLÍŽÍTE VERZI</b> <b>${esc(v?v.name:'')}</b> <span class="stat">· ${v?fmtDT(v.created_at):''} · ${esc(v?.authorName||'')} · jen ke čtení</span><button class="btn" data-vdiff="${V.viewVer}">Porovnat se současným návrhem</button><button class="btn" data-vrestore="${V.viewVer}">Obnovit do této verze</button><button class="btn pri" data-vclose>Zpět k návrhu</button>`;return}
  const vers=(pr.versions||[]).slice().sort((x,y)=>x.created_at<y.created_at?1:-1);const KIND={initial:'výchozí stav',approved:'schváleno',auto:'automaticky',manual:''};
  el.className='on';el.innerHTML=`<b>NÁVRH</b> skupiny <b>${esc(groupNameOf(p,pr.group))}</b> <span class="stat">· založil ${esc(pr.createdName||'')} ${pr.created_at?fmts(pr.created_at.slice(0,10)):''} · ${st.nw} nových, ${st.chg} změněných, ${st.del} zrušených · změny se ukládají průběžně</span><input id="draftnote" placeholder="Poznámka k návrhu (např. návrh za ICZ po schůzce 24. 9.)" value="${esc(pr.note||'')}"><button class="btn" data-savever title="Uložit pojmenovaný snímek návrhu, ke kterému se lze vrátit">Uložit verzi</button><select class="vers" id="versel"><option value="">Verze (${vers.length})…</option>${vers.map(v=>`<option value="${v.id}">${fmtDT(v.created_at)} · ${esc(v.name||KIND[v.kind]||'')}${v.authorName?' · '+esc(v.authorName):''}</option>`).join('')}</select>${lead?'<button class="btn" data-reset title="Nahradit obsah návrhu čerstvou kopií aktuálního harmonogramu (poznámka a verze zůstanou)">Znovu z aktuálního</button><button class="btn pri" data-approve>Schválit a promítnout</button><button class="btn danger" data-reject>Zamítnout</button>':''}`}
function renderStrip(){
  const el=$('#strip');const ps=curProjects();
  const leafs=ps.flatMap(p=>p.tasks.filter(t=>!kidsOf(t,p).length).map(t=>({t,p})));
  const cnt=k=>leafs.filter(x=>status(x.t,x.p).k===k).length;
  const crit=leafs.filter(x=>x.t.critical&&status(x.t,x.p).k!=='done').length;
  const openTd=allTodos().filter(x=>!x.td.done),overTd=openTd.filter(x=>x.td.due&&x.td.due<TODAY).length;
  const stat=[['late','Po termínu',cnt('late')],['behind','Ve skluzu',cnt('behind')],['risk','Ohrožené',cnt('risk')],['stalled','Nezahájené',cnt('stalled')],['soon','Končí do 7 dnů',cnt('soon')],['critical','Kritické',crit],['changes','Nové změny',curProjects().reduce((n,p)=>n+unreadAll(p).length,0)],['unclear','K upřesnění',S.projects.flatMap(p=>curProjects().includes(p)?p.tasks:[]).filter(t=>t.unclear).length],['open','Vše otevřené',leafs.length-cnt('done')],['todo','ToDo '+(overTd?'('+overTd+' po termínu)':''),openTd.length]];
  let h=`<div class="quick"><input id="quick" placeholder="Nový úkol do harmonogramu… (Enter)"></div>`;
  h+=`<span class="sepv"></span>`+stat.map(([k,l,n])=>`<button class="pill ${k} ${V.status===k?'on':''} ${n?'':'zero'}" data-st="${k}"><b>${n}</b> ${l}</button>`).join('')+`<button class="pill ${V.depsHi?'on':''}" data-depshi="1">⤳ Vazby</button><button class="pill ${V.extShow?'on':''}" data-extshow="1">┆ Cizí termíny</button>`+(V.status==='changes'&&proj(V.project)&&unreadAll(proj(V.project)).length?`<button class="pill chg" data-ackall="1">✓ Vzít vše na vědomí</button>`:'');
  const people=[...new Set(ps.flatMap(p=>p.team))];
  h+=`<span class="sepv"></span><select id="person" class="pill"><option value="">Všichni lidé</option>${people.map(n=>`<option ${V.person===n?'selected':''}>${esc(n)}</option>`).join('')}</select>`;
  const p=proj(V.project);
  if(p&&p.groups.length)h+=`<span class="sepv"></span><span class="pill" style="border-color:transparent"><span class="pd" style="background:var(--critical)"></span>kritický</span>${myRole(p)==='lead'?'<button class="lg btn" data-gsettings="1" style="padding:2px 8px">Skupiny ✎</button>':''}`+p.groups.map(g=>`<button class="pill ${V.group===g.id?'on':''}" data-g="${g.id}"><span class="pd" style="background:${g.color}"></span>${esc(g.name)}</button>`).join('');
  if(p&&V.by==='project'){const props=(p.proposals||[]).filter(x=>x.status==='open');if(props.length||(V.group&&canEditGroup(p,V.group)))h+=`<span class="sepv"></span>`;
    if(props.length)h+=`<button class="pill draft ${V.draft?'':'on'}" data-live="1">Aktuální</button>`;
    h+=props.map(pr=>`<button class="pill draft ${V.draft===pr.id?'on':''}" data-draft="${pr.id}">✎ Návrh: ${esc(groupNameOf(p,pr.group))}</button>`).join('');
    const cand=myRole(p)==='proposer'?p.groups.filter(g=>canEditGroup(p,g.id)):(V.group&&canEditGroup(p,V.group)?[p.groups.find(g=>g.id===V.group)].filter(Boolean):[]);
    h+=cand.filter(g=>!props.some(x=>x.group===g.id)).map(g=>`<button class="pill draft" data-newdraft="${g.id}">+ Otevřít návrh pro ${esc(g.name)}</button>`).join('')}
  el.innerHTML=h;
  if(V.person&&!people.includes(V.person)){V.person=''}
}

function render(){
  renderTabs();renderStrip();
  const g=$('#gantt');const lm=V.leftMode||(V.narrow?'narrow':'full'); g.classList.toggle('narrow',lm==='narrow');g.classList.toggle('noleft',lm==='off');g.classList.toggle('depshi',!!V.depsHi);renderDraftBar();const cp=proj(V.project);g.classList.toggle('draft',!!V.draft);g.classList.toggle('viewver',!!V.viewVer);g.classList.toggle('ro',!!V.viewVer||!!(cp&&isRO(cp)&&V.by==='project'));g.style.setProperty('--leftw',lm!=='full'?'':(V.leftw?V.leftw+'px':''));
  renderTodoPanel();if(kd.classList.contains('open'))renderKontrola();const kb=$('#kBtn');if(kb){const qn=S.projects.some(p=>myRole(p)==='lead');kb.style.display=qn?'':'none';if(qn){const q=reviewQueue();const left=q.filter(x=>!(x.age===0||x.ref)).length;kb.innerHTML=`Kontrola <b>${left}</b>`;kb.classList.toggle('done',!left)}}
  if(!S.projects.length){g.innerHTML='<div class="empty"><p>Zatím žádný projekt.</p><p>Pokud jste byl pozván jako navrhovatel, zkontrolujte, že jste se zaregistroval na stejný e-mail, na který přišla pozvánka, a obnovte stránku. Jinak založte projekt tlačítkem „+ projekt“ nahoře.</p></div>';return}
  const rows=buildRows();
  const px=ZOOM[V.zoom];
  let min=TODAY,max=TODAY;
  for(const p of S.projects)for(const t of p.tasks){if(t.start<min)min=t.start;if(t.end>max)max=t.end}
  for(const p of S.projects)if(p.deadline){if(p.deadline<min)min=p.deadline;if(p.deadline>max)max=p.deadline}
  let start=addDays(min,-7); const dow=(parse(start).getUTCDay()+6)%7; start=addDays(start,-dow);
  let end=addDays(max,21); if(diff(start,end)<90)end=addDays(start,90);
  const days=diff(start,end)+1, W=days*px;
  const X=s=>diff(start,s)*px;

  let L=`<div class="left"><div class="lhead"><span class="c-n">#</span><span>Úkol</span><span class="c-resp">Odpovědný</span><span class="c-st">Stav</span><span class="c-prog">%</span><span></span></div>`;
  let n=0;
  for(const r of rows){
    if(r.type==='head'){L+=`<div class="lrow head" ${r.p?`data-pid="${r.p.id}"`:''}><span class="c-n"></span><span class="c-name">${r.color?`<span class="dot" style="background:${r.color}"></span>`:''}<span class="nm">${esc(r.label)}</span><span class="hint">${esc(r.hint)}</span></span><span class="c-resp"></span><span class="c-st"></span><span class="c-prog"></span><span class="c-act">${r.p?'<button data-act="proj">⚙</button>':''}</span></div>`;continue}
    if(r.type==='inbox'){const items=r.list.filter(x=>!x.heading);const open=items.filter(x=>!x.done).length,over=items.some(x=>!x.done&&x.due&&x.due<TODAY);
      L+=`<div class="lrow inbox" data-key="${r.key}"><span class="c-n"></span><span class="c-name"><button class="tg" data-act="open">${isOpen(r.key)?'▾':'▸'}</button><span class="nm">${esc(r.label)}</span><button class="tdc ${over?'bad':open?'open':''} ${r.list.length?'':'empty'}" data-act="open">${items.length?(open?'☐ ':'✓ ')+(items.length-open)+'/'+items.length:'+ ToDo'}</button></span><span class="c-resp"></span><span class="c-st"></span><span class="c-prog"></span><span class="c-act"></span></div>`;continue}
    if(r.type==='todoadd'){L+=`<div class="lrow todo todoadd" style="--lv:${r.level}" data-key="${r.key}"><span class="c-n"></span><span class="c-name"><span class="ind2"></span><input class="tt" data-new="1" placeholder="+ položka… (Enter)"></span><span class="c-resp"></span><span class="c-st"></span><span class="c-prog"></span><span class="c-act"></span></div>`;continue}
    if(r.type==='todo'&&r.td.heading){L+=`<div class="lrow todo thead" style="--lv:${r.level}" data-td="${r.td.id}"><span class="c-n"></span><span class="c-name"><span class="ind2"></span><input class="tt" data-tf="text" value="${esc(r.td.text)}" placeholder="Nadpis skupiny"></span><span class="c-resp"></span><span class="c-st"></span><span class="c-prog"></span><span class="c-act"></span></div>`;continue}
    if(r.type==='todo'){const td=r.td,over=td.due&&td.due<TODAY&&!td.done;const team=r.p?r.p.team:allPeople();
      L+=`<div class="lrow todo ${td.done?'done':''} ${over?'over':''}" style="--lv:${r.level}" data-td="${td.id}"><span class="c-n"></span><span class="c-name">${r.ctx?'':'<span class="ind2"></span>'}<input type="checkbox" data-tf="done" ${td.done?'checked':''}><input class="tt" data-tf="text" value="${esc(td.text)}" placeholder="Co je třeba udělat">${r.ctx?`<span class="cl">${esc(r.t?r.t.name:'inbox')}${r.p?' · '+esc(r.p.name):''}</span>`:''}<button class="imp ${td.imp?'on':''}" data-tf="imp">★</button><button class="blk ${td.block?'on':''}" data-tf="block">⛔</button></span>
        <span class="c-resp"><select data-tf="who"><option value="">—</option>${[...new Set([...team,...(td.who?[td.who]:[])])].map(m=>`<option ${td.who===m?'selected':''}>${esc(m)}</option>`).join('')}</select></span>
        <span class="c-st"><input type="date" data-tf="due" value="${td.due||''}"></span><span class="c-prog"><select class="prs" data-tf="pri"><option value="0" ${!td.pri?'selected':''}>—</option><option value="1" ${td.pri==1?'selected':''}>A</option><option value="2" ${td.pri==2?'selected':''}>B</option><option value="3" ${td.pri==3?'selected':''}>C</option></select></span><span class="c-act">${r.ctx?`<button data-tact="tri">⋯</button>`:`<button data-tact="del">×</button>`}</span></div>`;continue}
    const {t,p}=r,sp=span(t,p),st=status(t,p);n++;const wbs=V.by==='project'?wbsOf(t,p):String(n);const dch=p._draft?draftChange(p,t):null;const uc=p._draft?[]:unreadOf(p,t.id);const chgtag=uc.length?`<span class="chgtag" data-act="ack" data-tip="${esc(uc.map(c=>'<b>'+esc(c.authorName)+' · '+fmtDT(c.at)+'</b>\n'+esc(chgText(c))).join('\n\n'))}\n\nKlepnutím vzít na vědomí">✎ ${uc.length>1?uc.length+' změn':'změna'} · ${esc(uc[uc.length-1].authorName)}</span>`:'';const pmark=p._draft?(!t.orig?'<span class="pmark new">nový</span>':dch?`<span class="pmark chg" title="Původně – ${esc(dch.join(', '))}">≠</span>`:''):'';
    const ot=origOf(t,p)||t;const tdn=(ot.todos||[]).length,tdd=(ot.todos||[]).filter(x=>x.done).length,tdbad=(ot.todos||[]).some(x=>!x.done&&x.due&&x.due<TODAY);
    const opts=p.team.map(m=>`<option ${t.resp===m?'selected':''}>${esc(m)}</option>`).join('');
    const tip=(t.milestone?fmt(t.start):fmt(sp.start)+' – '+fmt(sp.end)+' ('+(diff(sp.start,sp.end)+1)+' dní)')+(groupName(t,p)?' · '+groupName(t,p):'')+(t.unclear?'\n? K UPŘESNĚNÍ: '+(t.question||''):'')+(t.note?'\n'+t.note:'')+(t.log.length?'\nPoslední záznam '+fmts(t.log[t.log.length-1].d)+': '+t.log[t.log.length-1].text:'');
    L+=`<div class="lrow lvl${r.level} ${r.group?'grp':''} ${t.critical?'crit':''} ${t.milestone?'ms':''} ${p._draft&&!t.orig?'pnew':''} ${st.k==='done'?'done':''} ${uc.length?'chg':''}" style="--lv:${r.level}" data-id="${t.id}" data-pid="${p.id}">
      <span class="c-n">${wbs}</span>
      <span class="c-name"><span class="ind"></span>${r.group?`<button class="tg" data-act="toggle">${t.collapsed?'▸':'▾'}</button>`:(ot.todos||[]).length?`<button class="tg" data-act="open" data-tkey="${ot.id}">${isOpen(ot.id)?'▾':'▸'}</button>`:`<button class="tg none"></button>`}<button class="dot" data-act="edit" style="border:0;padding:0;cursor:pointer;background:${colorOf(t,p)}"></button><input class="nm" data-f="name" value="${esc(t.name)}" placeholder="Název úkolu"${V.barTip===false?'':` title="${esc(tip)}"`}>${V.by==='person'?`<span class="cl">${esc(p.name)}${r.collab?' · spolupráce':''}</span>`:''}${pmark}${chgtag}${t.unclear?`<span class="qm" data-act="edit" title="K upřesnění: ${esc(t.question||'')}">?</span>`:''}${r.group||(p._draft&&!t.orig)?'':`<button class="tdc ${tdbad?'bad':tdn&&tdd<tdn?'open':''} ${tdn?'':'empty'}" data-act="open" data-tkey="${ot.id}">${tdn?(tdd<tdn?'☐ ':'✓ ')+tdd+'/'+tdn:'+ ToDo'}</button>`}${ot.note?`<span class="ic" data-act="edit" title="Zadání: ${esc(ot.note.slice(0,200))}">≡</span>`:''}${(ot.log||[]).length?`<span class="ic" data-act="edit" title="Deník: ${ot.log.length} záznamů">✎${ot.log.length}</span>`:''}${(ot.docs||[]).length?`<span class="ic" data-act="edit" title="Soubory: ${(ot.docs||[]).map(x=>esc(x.name)).join(', ')}">📎${ot.docs.length}</span>`:''}${(ot.links||[]).length?`<span class="ic" data-act="edit" title="Odkazy: ${(ot.links||[]).map(x=>esc(x.name||x.url)).join(', ')}">🔗</span>`:''}</span>
      <span class="c-resp"><select data-f="resp"><option value="">—</option>${opts}</select></span>
      <span class="c-st">${st.l?`<span class="st ${st.k}">${st.l}</span>`:''}</span>
      <span class="c-prog">${p._draft?`<span class="hint">${t.milestone?(t.progress>=100?'✓':''):progressOf(t,p)}</span>`:t.milestone?`<input type="checkbox" data-f="msdone" ${(t.progress||0)>=100?'checked':''}>`:r.group||t.autoProg?`<span class="hint" title="${t.autoProg?'Podle checklistu':''}">${progressOf(t,p)}</span>`:`<input type="checkbox" data-f="msdone" ${(t.progress||0)>=100?'checked':''}><select data-f="progress" class="prsel">${[...new Set([0,25,50,75,100,t.progress||0])].sort((a,b)=>a-b).map(v=>`<option value="${v}" ${(t.progress||0)===v?'selected':''}>${v}</option>`).join('')}</select>`}</span>
      <span class="c-act"><button data-act="menu">⋯</button></span></div>`;
  }
  L+='<div class="splitter"></div></div>';

  let M='',D='',C='',DL='';
  let d=start; let mStart=0;
  for(let i=0;i<days;i++,d=addDays(d,1)){
    const dt=parse(d), wd=(dt.getUTCDay()+6)%7, we=wd>=5, td=d===TODAY;
    if(we)C+=`<div class="col we" style="left:${i*px}px;width:${px}px"></div>`;
    if(dt.getUTCDate()===1)C+=`<div class="col mline" style="left:${i*px}px"></div>`;
    if(td)C+=`<div class="col td" style="left:${i*px}px;width:0"></div>`;
    if(V.extShow)for(const xp of curProjects())for(const xt of xp.tasks){if(xt.external&&(xt.milestone?xt.start:xt.end)===d&&matches(xt,xp)){C+=`<div class="col ext" style="left:${i*px+(xt.milestone?px/2:px)}px;width:0"></div>`;DL+=`<div class="extm" style="left:${i*px+(xt.milestone?px/2:px)}px" title="Cizí termín: ${esc(xt.name)} · ${fmt(xt.milestone?xt.start:xt.end)}${xp!==proj(V.project)?' · '+esc(xp.name):''}"><b>${esc(xt.name)}</b></div>`}}
    for(const dp of curProjects()){if(dp.deadline===d){C+=`<div class="col dl" style="left:${i*px}px;width:0"></div>`;DL+=`<div class="dlm" style="left:${i*px}px" title="Deadline ${esc(dp.name)}: ${fmt(dp.deadline)}${dp.deadline<TODAY?' (uplynul)':' – zbývá '+diff(TODAY,dp.deadline)+' d'}"><span class="fl">${FLAME}</span>${curProjects().length>1?`<b>${esc(dp.name)}</b>`:''}</div>`}}
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
    if(r.type==='todo'){const td=r.td;const dd=td.due||(r.t?span(r.t,r.p).end:'');if(dd&&dd>=start&&dd<=end){B+=`<div class="tdot sub ${td.due&&td.due<TODAY&&!td.done?'over':''} ${td.done?'done':''} ${td.block?'blk':''}" style="left:${X(dd)+px/2-6}px;top:${top+10}px" title="${esc(td.text)}${td.due?' · '+fmt(td.due):' · bez termínu'}"></div><span class="sublbl ${td.done?'done':''}" style="left:${X(dd)+px/2+10}px;top:${top}px">${esc(td.text)}</span>`}ri++;continue}
    if(r.type==='head'){C+=`<div class="prow" style="top:${top}px"></div>`;
      const ts=r.p?r.p.tasks:rows.filter(x=>x.type==='task').map(x=>x.t);
      if(r.p&&ts.length){const s=ts.reduce((a,t)=>t.start<a?t.start:a,ts[0].start),e=ts.reduce((a,t)=>t.end>a?t.end:a,ts[0].end);B+=`<div class="bar psum" style="left:${X(s)}px;top:${top+14}px;--c:${r.p.color};width:${(diff(s,e)+1)*px}px;background:${r.p.color}"></div>`}
      ri++;continue}
    const {t,p}=r,sp=span(t,p),st=status(t,p);
    const x=X(sp.start)+(t.milestone?px/2:0),w=t.milestone?24:(diff(sp.start,sp.end)+1)*px;
    pos[t.id]={x,w,top,ms:t.milestone};
    const prog=progressOf(t,p),col=colorOf(t,p);
    let CH='',chd='',chtip='';
    if(!p._draft&&!t.milestone&&!sp.group){const uc2=unreadOf(p,t.id).filter(c=>c.kind==='task'&&(c.field==='start'||c.field==='end'));if(uc2.length){const os=uc2.find(c=>c.field==='start')?.old||sp.start,oe=uc2.find(c=>c.field==='end')?.old||sp.end;
      if(os&&oe&&(os!==sp.start||oe!==sp.end)){chtip=`Původně ${fmt(os)} – ${fmt(oe)} (${diff(os,oe)+1} d) → nyní ${fmt(sp.start)} – ${fmt(sp.end)} (${diff(sp.start,sp.end)+1} d)`;
        const seg=(a,b,cls)=>{if(a>b)return'';return`<div class="${cls}" style="left:${X(a)}px;top:${top+6}px;width:${(diff(a,b)+1)*px}px" ></div>`};
        CH+=`<div class="chgold" style="left:${X(os)}px;top:${top+6}px;width:${(diff(os,oe)+1)*px}px" ></div>`;
        if(os<sp.start)CH+=seg(os,addDays(sp.start,-1),'chgcut');if(oe>sp.end)CH+=seg(addDays(sp.end,1),oe,'chgcut');
        if(sp.start<os)CH+=seg(sp.start,addDays(os,-1),'chgadd');if(sp.end>oe)CH+=seg(addDays(oe,1),sp.end,'chgadd');
        const ds=diff(os,sp.start),de=diff(oe,sp.end),sg=n=>(n>0?'+':'−')+Math.abs(n)+' d';
        chd=ds===de?`posun ${sg(ds)}`:ds===0?`konec ${sg(de)}`:de===0?`začátek ${sg(ds)}`:`začátek ${sg(ds)}, konec ${sg(de)}`}}}
    const dts=(t.milestone?fmts(t.start):`${fmts(sp.start)} – ${fmts(sp.end)}`)+(st.k==='late'||st.k==='behind'?` · ${st.l}`:'');const dtc=st.k==='late'?'dt late':st.k==='behind'?'dt behind':'dt';
    const who=`${esc(t.resp||'')}${t.collab&&t.collab.length?' + '+esc(t.collab.join(', ')):''}`;
    const inside=false;const nol=x<220;
    B+=`<div class="bar ${t.milestone?'ms':''} ${sp.group?'grp':''} ${t.critical?'crit':''} ${st.k==='late'?'late':''} ${st.k==='behind'?'behind':''} ${st.k==='done'?'done':''} ${nol?'nol':''} ${t.unclear?'unclear':''}" data-id="${t.id}" style="left:${x}px;top:${top+6}px;width:${w}px;background:${col};--c:${col};--gc:${baseColor(t,p)}"${V.barTip===false?'':` title="${esc(t.name)}: ${fmt(sp.start)} – ${fmt(sp.end)}${st.l?' · '+st.l:''}${who?' · '+who:''}${chtip?'\n'+esc(chtip):''}"`}>
      <div class="prog" style="width:${prog}%"></div><span class="h h-l"></span><span class="h h-r"></span>
      <span class="nml"><b>${esc(t.name)}</b></span><span class="lbl">${dmark(t,p)}${qnote(t,p)}<b>${esc(t.name)} · </b><i class="${dtc}">${dts}</i>${who?` <i>· ${who}</i>`:''}${chd?` <i class="chgd" title="${esc(chtip)}">⟲ ${chd}</i>`:''}</span></div>`+CH;
    for(const td of t.todos){if(!td.due||td.due<start||td.due>end)continue;B+=`<div class="tdot ${td.due<TODAY&&!td.done?'over':''} ${td.done?'done':''} ${td.block?'blk':''}" style="left:${X(td.due)+px/2-5}px;top:${top}px" title="${esc(td.text)} · ${fmt(td.due)}${td.who?' · '+esc(td.who):''}"></div>`}
    ri++;
  }
  for(const r of rows){ if(r.type!=='task')continue;const t=r.t;
    for(const did of (t.deps||[])){const a=pos[did],b=pos[t.id];if(!a||!b)continue;
      const pred=findTask(did);if(!pred)continue;const pe=span(pred.t,pred.p).end;const bad=pred.t.milestone?pe>t.start:pe>=t.start;
      const x1=a.ms?a.x+12:a.x+a.w, y1=a.top+17, x2=b.ms?b.x-12:b.x, y2=b.top+17;
      const path=x2>=x1+16?`M${x1},${y1} H${x1+8} V${y2} H${x2-4}`:`M${x1},${y1} H${x1+8} V${y1+ROWH/2} H${x2-12} V${y2} H${x2-4}`;
      P+=`<path class="${bad?'bad':''}" d="${path}"></path><polygon class="${bad?'bad':''}" points="${x2},${y2} ${x2-5},${y2-3} ${x2-5},${y2+3}"></polygon>`;
    }}
  const H=rows.length*ROWH;
  g.innerHTML=L+`<div class="right" style="width:${W}px"><div class="rhead"><div class="mrow">${M}</div><div class="drow">${D}</div>${DL}</div>
    <div class="rbody" style="width:${W}px;height:${Math.max(H,200)}px">${C}${B}<svg class="deps" width="${W}" height="${Math.max(H,200)}">${P}</svg></div></div>`;
  g.dataset.start=start; g.dataset.px=px;
  if(sel){const r=$(`.lrow[data-id="${sel}"]`);if(r)r.classList.add('sel');else sel=null}
  if(focusId){sel=focusId;const r=$(`.lrow[data-id="${focusId}"]`);if(r)r.classList.add('sel');const i=$(`.lrow[data-id="${focusId}"] input.nm`);if(i){i.focus();i.select()}focusId=null}
  if(focusTd){const i=focusTd.startsWith('td:')?$(`.lrow[data-td="${focusTd.slice(3)}"] input.tt`):$(`.lrow.todoadd[data-key="${focusTd}"] input.tt`);if(i)i.focus();focusTd=null}
}
function scrollToToday(){const x=diff(g.dataset.start,TODAY)*+g.dataset.px;g.scrollLeft=Math.max(0,x-(g.clientWidth-parseInt(getComputedStyle(g).getPropertyValue('--leftw')))/3)}

/* ---------- daily view ---------- */
const DAYS=['neděle','pondělí','úterý','středa','čtvrtek','pátek','sobota'];
function ctxOf(x){return x.t?`${esc(x.t.name)}${x.p?' · '+esc(x.p.name):''}`:x.p?esc(x.p.name):'mimo projekty'}
/* ---------- plovoucí panel ToDo (pravý horní roh) ---------- */
const tp=document.createElement('div');tp.id='tp';document.body.appendChild(tp);
// jednoduchý jednobarevný plamen (currentColor)
const FLAME=`<svg class="flame" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 1.5c.4 3.2-1.1 5-2.7 6.6C7.6 9.9 6 11.7 6 14.6 6 18.4 8.7 21 12 21s6-2.6 6-6.4c0-2.2-.9-4-2.1-5.6-.3 1.3-1 2.2-1.9 2.6.3-3.3-.5-6.6-2-10.1zm0 10.2c1.3 2 2.2 3.4 2.2 4.8 0 1.4-1 2.5-2.2 2.5s-2.2-1.1-2.2-2.5c0-1.4.9-2.8 2.2-4.8z"/></svg>`;
/* odpočet do deadline (D:H:M) – v záhlaví, pro projekty se zapnutým odpočtem */
function renderCountdown(){const el=$('#cd');if(!el)return;const ps=(V.project==='ALL'?S.projects:S.projects.filter(p=>p.id===V.project)).filter(p=>p.deadline&&p.countdown);
  const now=new Date();el.innerHTML=ps.map(p=>{const t=new Date(p.deadline+'T00:00:00');let ms=t-now;const past=ms<0;ms=Math.abs(ms);const dd=Math.floor(ms/864e5),hh=Math.floor(ms%864e5/36e5),mm=Math.floor(ms%36e5/6e4);
    return `<span class="cdp ${past?'past':dd<14?'soon':''}" title="${esc(p.name)} – deadline ${fmt(p.deadline)}${past?' uplynul':''}">${FLAME}${S.projects.length>1?`<i>${esc(p.name)}</i>`:''}<b>${past?'−':''}${String(dd).padStart(2,'0')}<u>d</u>${String(hh).padStart(2,'0')}<u>h</u>${String(mm).padStart(2,'0')}<u>m</u></b></span>`}).join('')}
setInterval(()=>{if(S&&S.projects)renderCountdown()},30000);
function renderTodoPanel(){renderCountdown();
  const mode=V.todoPanel||'';const btn=$('#todoBtn');
  const all=[];for(const p of S.projects){p.todos.forEach(td=>all.push({td,p,t:null}))}S.todos.forEach(td=>all.push({td,p:null,t:null}));
  const MY=myNames();const mine=x=>!MY.size||MY.has(x.td.who)||!x.td.who;const vis=all.filter(mine);
  const open=vis.filter(x=>!x.td.done&&!x.td.heading);const TOM=addDays(TODAY,1);
  const overN=open.filter(x=>x.td.due&&x.td.due<TODAY).length;
  if(btn){btn.innerHTML=`ToDo <b>${open.length}</b>${overN?`<i class="ov">${overN}</i>`:''}`;btn.classList.toggle('on',mode==='open')}
  tp.className=mode;if(!mode){tp.innerHTML='';return}
  const doneToday=vis.filter(x=>x.td.done&&x.td.doneAt===TODAY&&!x.td.heading);
  if(mode==='min'){tp.innerHTML=`<div class="tph"><button class="tpt" data-tp="open">☐ ToDo <b>${open.length}</b>${overN?` · <span class="ov">${overN} po termínu</span>`:''}</button><button data-tp="close" class="x">✕</button></div>`;return}
  const lateTasks=S.projects.flatMap(p=>p.tasks.filter(t=>!kidsOf(t,p).length&&status(t,p).k==='late')).length;const behindTasks=S.projects.flatMap(p=>p.tasks.filter(t=>!kidsOf(t,p).length&&status(t,p).k==='behind')).length;
  const endToday=S.projects.flatMap(p=>p.tasks.filter(t=>!kidsOf(t,p).length&&span(t,p).end===TODAY&&progressOf(t,p)<100)).length;
  const dt=parse(TODAY);
  const PRI={0:'Bez priority',1:'Vysoká priorita',2:'Střední priorita',3:'Nízká priorita'};
  const TRI=`<svg viewBox="0 0 20 18" width="15" height="13" aria-hidden="true"><path d="M10 1.8 18.6 16.4H1.4Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 6.6v4.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="10" cy="13.5" r="1.1" fill="currentColor"/></svg>`;
  const ring=(t,p)=>{const pr=progressOf(t,p),r=6,c=2*Math.PI*r;return `<svg class="ring" viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="${r}" fill="none" stroke="var(--accent-soft)" stroke-width="2.5"/><circle cx="8" cy="8" r="${r}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-dasharray="${(c*pr/100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 8 8)"/></svg>`};
  const item=x=>{const td=x.td,over=td.due&&td.due<TODAY&&!td.done,o=V.dopen===td.id;
    if(td.heading)return `<div class="di head" data-td="${td.id}"><span class="grab" data-grab>⠿</span><div class="body"><div class="line"><input class="dtext" data-df="text" value="${esc(td.text)}" placeholder="Nadpis skupiny"></div></div><button class="dopt x" data-ddel-q>✕</button></div>`;
    const pOpts=`<option value="">— mimo projekty —</option>`+S.projects.map(p=>`<option value="${p.id}" ${x.p&&x.p.id===p.id?'selected':''}>${esc(p.name)}</option>`).join('');
    const tOpts=x.p?`<option value="">— inbox projektu —</option>`+x.p.tasks.filter(t=>!kidsOf(t,x.p).length&&progressOf(t,x.p)<100).map(t=>`<option value="${t.id}" ${x.t&&x.t.id===t.id?'selected':''}>${wbsOf(t,x.p)} ${esc(t.name)}</option>`).join(''):'';
    const pill=td.due&&(td.due!==TODAY||over)?`<span class="pill ${over?'over':''}">${over?fmts(td.due):td.due===TOM?'zítra':fmts(td.due)}</span>`:'';
    const pri=+td.pri||0;const ref=td.taskRef?findTask(td.taskRef):null;
    return `<div class="di ${td.done?'done':''} ${over?'over':''} ${o?'open':''} p${pri}" data-td="${td.id}"><span class="grab" data-grab>⠿</span><button class="star ${td.imp?'on':''}" data-dimp>★</button><button class="pri" data-dpri title="${pri?'Priorita '+['','A','B','C'][pri]:''}">${TRI}</button><button class="chk" data-df="done">✓</button>
      <div class="body"><div class="line">${td.kind&&KIND[td.kind]?`<button class="kind ${td.kind}" data-dkind title="${KIND[td.kind].l}${td.contact?' – '+esc(td.contact):''} (zkratka na Macu/iPhonu)">${KIND[td.kind].i}</button>`:`<button class="kind none" data-dkind title="Označit jako telefonát / e-mail / SMS / WhatsApp">·</button>`}<input class="dtext" data-df="text" value="${esc(td.text)}">${pill}${x.t?`<span class="tag">⤷ ${esc(x.t.name)}</span>`:''}${ref?`<span class="ringw" title="${esc(ref.t.name)}: ${progressOf(ref.t,ref.p)} %">${ring(ref.t,ref.p)}</span>`:''}${x.p?`<span class="pdot" style="background:${x.p.color}" title="${esc(x.p.name)}"></span>`:''}</div></div>
      ${td.done?`<button class="dopt x" data-ddel-q>✕</button>`:`<button class="dopt" data-dopt="${td.id}">⋯</button>`}</div>
    ${o?`<div class="dopts" data-td="${td.id}"><label>Do kdy <input type="date" data-df="due" value="${td.due||''}"></label><div class="seg"><button data-dd="0">dnes</button><button data-dd="1">zítra</button><button data-dd="7">za týden</button><button data-dd="">bez</button></div>
      <label>Projekt <select data-df="pid">${pOpts}</select></label>${x.p?`<label>Úkol <select data-df="tid">${tOpts}</select></label>`:''}
      <label>Druh <div class="seg"><button data-dk="" class="${!td.kind?'on':''}">–</button><button data-dk="call" class="${td.kind==='call'?'on':''}">📞</button><button data-dk="mail" class="${td.kind==='mail'?'on':''}">✉️</button><button data-dk="sms" class="${td.kind==='sms'?'on':''}">💬</button><button data-dk="wa" class="${td.kind==='wa'?'on':''}">${KIND.wa.i}</button></div></label><label>Kontakt <input type="text" data-df="contact" value="${esc(td.contact||'')}" placeholder="jméno jako v Kontaktech" size="18"></label>
      ${x.t?`<button type="button" class="btn" data-dblk>${td.block?'⛔ blokuje úkol':'blokuje úkol?'}</button>`:''}<button type="button" class="btn danger" data-ddel>Smazat</button></div>`:''}`};
  // jeden seznam: ruční pořadí (ord); položky bez ord podle starého pravidla (po termínu, priorita, termín)
  const l=vis.filter(x=>!x.td.done);const legacy=(a,b)=>{const ao=a.td.due&&a.td.due<TODAY,bo=b.td.due&&b.td.due<TODAY;if(ao!==bo)return ao?-1:1;return prioSort(a,b)};
  l.sort((a,b)=>{const ao=a.td.ord||0,bo=b.td.ord||0;if(ao&&bo)return ao-bo;if(ao||bo)return ao?-1:1;return legacy(a,b)});l.forEach((x,i)=>x.td.ord=i+1);
  const sub=[`${open.length} otevřených`,doneToday.length?`${doneToday.length} hotovo`:'',endToday?`${endToday} končí dnes`:'',lateTasks?`<a data-golate>${lateTasks} po termínu</a>`:'',behindTasks?`<a data-gobehind>${behindTasks} ve skluzu</a>`:'',(()=>{const n=S.projects.reduce((s,p)=>s+unreadAll(p).length,0);return n?`<a data-gochg>${n} ${n===1?'změna':n<5?'změny':'změn'}</a>`:''})()].filter(Boolean).join(' · ');
  let h=`<div class="tph"><b>ToDo</b><span class="sub">${DAYS[dt.getUTCDay()]} ${fmt(TODAY)}</span><span class="sp"></span><button data-tp="min" title="Zmenšit">–</button><button data-tp="close" class="x" title="Zavřít">✕</button></div>
  <div class="tpsub">${sub}</div>
  <div class="dsec" data-dd="0"><div class="dadd ${V.dhead?'head':''}"><input id="dadd" placeholder="${V.dhead?'Nadpis skupiny… (Enter)':'Co je třeba udělat… (Enter)'}" autocomplete="off"><button class="hb ${V.dhead?'on':''}" data-dhead="0" title="Přidat nadpis skupiny">Nadpis</button></div>
  <div class="tpl">${l.map(item).join('')}${!l.length&&!doneToday.length?`<div class="dempty">Nic otevřeného.</div>`:''}${doneToday.map(item).join('')}</div></div>`;
  tp.innerHTML=h;
  if(focusTd==='dadd'){const i=$('#dadd');if(i)i.focus();focusTd=null}
  else if(focusTd&&focusTd.startsWith('td:')){const i=tp.querySelector(`.di[data-td="${focusTd.slice(3)}"] .dtext`);if(i){i.focus()}focusTd=null}
}
const KIND={call:{i:'📞',l:'Zavolat',sc:'scCall',d:'Zavolat'},mail:{i:'✉️',l:'Napsat e-mail',sc:'scMail',d:'Napsat'},sms:{i:'💬',l:'Poslat SMS',sc:'scSms',d:'SMS'},wa:{i:'<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="#25d366" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z"/><path fill="#fff" d="M9.3 7.6c-.2-.5-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.3 5.2 4.5 2.6 1 3.1.8 3.6.8.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.1-.3-.2-.6-.3l-2-1c-.3-.1-.5-.2-.7.1l-1 1.2c-.2.2-.4.2-.7.1-.3-.2-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.5-.5.3-.5c.1-.2 0-.4 0-.5l-.9-2.4z"/></svg>',l:'Napsat na WhatsApp',sc:'scWa',d:'WhatsApp'}};
const KSEQ=['','call','mail','sms','wa'];
// volání / e-mail / SMS / WhatsApp přes Zkratky (Shortcuts) – fungují na Macu i iPhonu; jména zkratek v menu ⋯
function runContact(td){const who=(td.contact||'').trim();if(!who){toast('U položky chybí jméno kontaktu (⋯ → Kontakt)',true);return}
  const K=KIND[td.kind]||KIND.call;const name=V[K.sc]||K.d;const subj=td.text.replace(/^(tel|zavolat|call|mail|email|e-mail|napsat|sms|wa|whatsapp|texta?)\s+/i,'');
  const input=td.kind==='call'?who:who+'|'+subj;
  location.href=`shortcuts://run-shortcut?name=${encodeURIComponent(name)}&input=text&text=${encodeURIComponent(input)}`;
  if(navigator.clipboard)navigator.clipboard.writeText(who).catch(()=>{});toast(K.l+': '+who+' – spouštím zkratku „'+name+'“ (jméno je i ve schránce)')}
function setTodoPanel(m){V.todoPanel=m;save();renderTodoPanel();if(m==='open'){focusTd='dadd';const i=$('#dadd');if(i)i.focus()}}
tp.addEventListener('click',e=>{const b=e.target.closest('[data-tp]');if(!b)return;setTodoPanel(b.dataset.tp==='close'?'':b.dataset.tp)});
tp.addEventListener('keydown',e=>{if(e.target.classList.contains('dtext')){const box=e.target.closest('[data-td]');const f=findTodo(box.dataset.td);if(!f)return;
    if(e.key==='Enter'){e.preventDefault();f.td.text=e.target.value;const td={id:uid(),text:'',done:false,who:f.td.who,due:f.td.due,block:false,pri:0,imp:false,ord:(f.td.ord||0)+0.5};f.list.splice(f.list.indexOf(f.td)+1,0,td);focusTd='td:'+td.id;commit()}
    if(e.key==='Backspace'&&e.target.value===''){e.preventDefault();f.list.splice(f.list.indexOf(f.td),1);commit()}
    if(e.key==='Escape')e.target.blur();return}
  if(e.target.id==='dadd'){if(e.key==='Enter'){const v=e.target.value.trim();if(!v)return;quickTodo(v,{personal:true});const f=findTodo(lastTodoId);if(f){f.td.ord=firstOrd();if(V.dhead){f.td.heading=true;f.td.block=false;f.td.pri=0;f.td.imp=false}}focusTd='dadd';commit()}if(e.key==='Escape'){if(V.dhead){V.dhead=false;render()}else setTodoPanel('min')}}});
tp.addEventListener('change',e=>{const el=e.target;const df=el.dataset.df;if(!df)return;const box=el.closest('[data-td]');const f=findTodo(box.dataset.td);if(!f)return;const td=f.td;
  if(df==='done'){td.done=el.checked;td.doneAt=el.checked?TODAY:'';}
  else if(df==='text')td.text=el.value;
  else if(df==='due')td.due=el.value;
  else if(df==='contact')td.contact=el.value.trim();
  else if(df==='pid'||df==='tid'){const pid=df==='pid'?el.value:(f.p?f.p.id:'');const tid=df==='tid'?el.value:'';const key=tid||(pid?'p:'+pid:'me');const list=todoList(key);if(list){f.list.splice(f.list.indexOf(td),1);list.push(td);const p=proj(pid);if(p&&td.who&&!p.team.includes(td.who))p.team.push(td.who)}}
  commit()});
tp.addEventListener('paste',e=>{if(e.target.id!=='dadd')return;const txt=(e.clipboardData||window.clipboardData).getData('text');const lines=txt.split(/\r?\n/).map(s=>s.replace(/^[\s\-•*·]+/,'').trim()).filter(Boolean);if(lines.length<2)return;e.preventDefault();const base=firstOrd()-lines.length;lines.forEach((l,i)=>{quickTodo(l,{personal:true});const f=findTodo(lastTodoId);if(f){f.td.ord=base+i}});V.dhead=false;focusTd='dadd';commit()});
tp.addEventListener('click',e=>{const b=e.target.closest('button,a[data-golate],a[data-gobehind],a[data-gochg]');if(!b)return;const box=b.closest('[data-td]');
  if(b.dataset.dopt!==undefined){V.dopen=V.dopen===b.dataset.dopt?'':b.dataset.dopt;save();render();return}
    if(b.dataset.dhead!==undefined){V.dhead=!V.dhead;focusTd='dadd';render();return}
  if(box&&b.dataset.df==='done'){const f=findTodo(box.dataset.td);if(!f)return;f.td.done=!f.td.done;f.td.doneAt=f.td.done?TODAY:'';commit();return}
  if(box&&b.hasAttribute('data-ddel-q')){const f=findTodo(box.dataset.td);if(!f)return;f.list.splice(f.list.indexOf(f.td),1);commit();return}
  if(b.hasAttribute('data-dlater')){V.laterOpen=!V.laterOpen;commit();return}
  if(b.hasAttribute('data-golate')){V.by='project';V.status='late';commit();return}if(b.hasAttribute('data-gobehind')){V.by='project';V.status='behind';commit();return}
  if(b.hasAttribute('data-gochg')){V.by='project';V.status='changes';const pp=S.projects.find(p=>unreadAll(p).length);if(pp)V.project=pp.id;commit();return}
  if(!box)return;const f=findTodo(box.dataset.td);if(!f)return;const td=f.td;
  if(b.dataset.dd!==undefined){td.due=b.dataset.dd===''?'':addDays(TODAY,+b.dataset.dd);commit()}
  if(b.dataset.dk!==undefined){td.kind=b.dataset.dk;commit()}
  if(b.hasAttribute('data-dkind')){if(e.shiftKey||e.altKey||!td.kind){td.kind=KSEQ[(KSEQ.indexOf(td.kind||'')+1)%KSEQ.length];if(td.kind&&!td.contact){const m=td.text.replace(/^(tel|zavolat|call|mail|email|e-mail|napsat|sms|wa|whatsapp|texta?)\s+/i,'').match(/^([^–\-:,(]+?)\s*(?:[–\-:,(]|$)/);if(m)td.contact=m[1].trim()}commit()}else runContact(td);return}
  if(b.hasAttribute('data-dpri')){td.pri=({0:1,1:2,2:3,3:0})[+td.pri||0];commit()}
  if(b.hasAttribute('data-dimp')){td.imp=!td.imp;commit()}
  if(b.hasAttribute('data-dblk')){td.block=!td.block;commit()}
  if(b.hasAttribute('data-ddel')){f.list.splice(f.list.indexOf(td),1);V.dopen='';commit()}
});
/* přetahování položek v denním seznamu (⠿): změní pořadí i den */
(function(){let dd=null;
  // skupina = nadpis + položky pod ním až po další nadpis (v rámci sekce, bez hotových)
  const groupOf=box=>{const out=[box];if(!box.classList.contains('head'))return out;let n=box.nextElementSibling;while(n&&n.classList.contains('di')&&!n.classList.contains('head')&&!n.classList.contains('done')){out.push(n);n=n.nextElementSibling}return out};
  tp.addEventListener('pointerdown',e=>{const h=e.target.closest('[data-grab]');if(!h||e.button!==0)return;const box=h.closest('.di[data-td]');if(!box)return;e.preventDefault();dd={id:box.dataset.td,box,grp:groupOf(box),y0:e.clientY,moved:false,pid:e.pointerId,line:null,ghost:null,before:null,sec:null};h.setPointerCapture(e.pointerId)});
  tp.addEventListener('pointermove',e=>{if(!dd)return;if(!dd.moved){if(Math.abs(e.clientY-dd.y0)<4)return;dd.moved=true;dd.grp.forEach(x=>x.classList.add('dragsrc'));dd.line=document.createElement('div');dd.line.className='dropline';tp.appendChild(dd.line);dd.ghost=document.createElement('div');dd.ghost.className='dragghost';dd.ghost.textContent=(dd.box.querySelector('.dtext').value||'(bez textu)')+(dd.grp.length>1?` (+${dd.grp.length-1})`:'');document.body.appendChild(dd.ghost);document.body.style.cursor='grabbing'}
    dd.ghost.style.left=(e.clientX+14)+'px';dd.ghost.style.top=(e.clientY-12)+'px';
    // cíl: sekce pod kurzorem (nebo nejbližší), uvnitř první položka, jejíž střed je pod kurzorem
    const secs=[...tp.querySelectorAll('.dsec')];let sec=null;for(const s of secs){const r=s.getBoundingClientRect();if(e.clientY>=r.top&&e.clientY<=r.bottom){sec=s;break}}
    if(!sec){let best=1e9;for(const s of secs){const r=s.getBoundingClientRect();const d=Math.min(Math.abs(e.clientY-r.top),Math.abs(e.clientY-r.bottom));if(d<best){best=d;sec=s}}}
    if(!sec)return;dd.sec=sec;const items=[...sec.querySelectorAll('.di[data-td]')].filter(x=>!dd.grp.includes(x)&&!x.classList.contains('done'));let before=null;for(const it of items){const r=it.getBoundingClientRect();if(e.clientY<r.top+r.height/2){before=it;break}}
    dd.before=before;const dr=tp.getBoundingClientRect();let y;if(before)y=before.getBoundingClientRect().top;else if(items.length)y=items[items.length-1].getBoundingClientRect().bottom;else y=sec.querySelector('.tpl').getBoundingClientRect().top+2;
    dd.line.style.display='block';dd.line.style.left='28px';dd.line.style.right='8px';dd.line.style.top=(y-dr.top-1)+'px'});
  const end=e=>{if(!dd)return;const d=dd;dd=null;if(!d.moved)return;d.grp.forEach(x=>x.classList.remove('dragsrc'));d.line.remove();d.ghost.remove();document.body.style.cursor='';if(e.type!=='pointerup'||!d.sec)return;
    const tds=d.grp.map(x=>findTodo(x.dataset.td)).filter(Boolean).map(f=>f.td);if(!tds.length)return;const ddv=d.sec.dataset.dd;const n=tds.length;
    let base;if(d.before){const bf=findTodo(d.before.dataset.td);base=(bf?bf.td.ord||0:0)-1}else{let mx=0;d.sec.querySelectorAll('.di[data-td]').forEach(x=>{const o=findTodo(x.dataset.td);if(o&&!tds.includes(o.td)&&o.td.ord>mx)mx=o.td.ord});base=mx}
    tds.forEach((td,i)=>{td.ord=base+(i+1)/(n+1)});
    commit()};
  tp.addEventListener('pointerup',end);tp.addEventListener('pointercancel',end);
})();

/* ---------- mutations ---------- */
function commit(){if(V.viewVer)leaveVersionView();const d=activeDraft();if(d)d.pr.tasks=d.p.tasks;save();render();DB.sync(S).catch(e=>{console.error(e);toast('Nepodařilo se uložit do databáze: '+(e.message||e)+(/\[tasks\].*row-level/.test(e.message||'')?' — úkol musí mít vás jako odpovědného/spolupracovníka a ležet ve skupině, kde smíte zapisovat.':''),true)})}
function blankTask(p){const wg=(!p._draft&&myRole(p)==='editor'&&hasScope(p))?(p.groups.find(g=>groupWritable(p,g.id))||{}).id:null;return{id:uid(),name:'',start:TODAY,end:addDays(TODAY,4),color:'',group:p._draft?((p.proposals||[]).find(x=>x.id===p._draft)||{}).group||'':(wg||p.groups[0]?.id||''),_draft:!!p._draft,resp:(myRole(p)==='editor'?(linkedNames(p)[0]||''):''),collab:[],critical:false,progress:0,parent:null,deps:[],milestone:false,collapsed:false,note:'',links:[],log:[],todos:[],docs:[],autoProg:false}}
function targetProject(afterId){let p=proj(V.project);if(!p){const f=afterId&&findTask(afterId);p=f?f.p:S.projects[0]}return p}
function addTask(afterId,init={}){
  const p=targetProject(afterId);if(!p){newProject();return}
  const t={...blankTask(p),...init};
  if(!p._draft&&myRole(p)==='editor'){if(!t.resp){toast('Nový úkol můžete založit, jen když je vaše jméno v týmu spojené s vaším účtem (vedoucí: Nastavení projektu → Tým → Uložit).',true);return}if(!groupWritable(p,t.group)){toast('Do této skupiny nemáte právo zapisovat.',true);return}}
  if(afterId){const i=p.tasks.findIndex(x=>x.id===afterId);const prev=p.tasks[i];if(prev){t.parent=prev.parent;if(!init.group&&(p._draft||groupWritable(p,prev.group)))t.group=prev.group;if(!init.resp&&V.by==='person')t.resp=prev.resp;const ds=descendants(prev,p);let j=i+1;while(j<p.tasks.length&&ds.includes(p.tasks[j]))j++;p.tasks.splice(j,0,t)}else p.tasks.push(t)}
  else p.tasks.push(t);
  focusId=t.id;commit();return t;
}
function quickAdd(text){
  {const cp=proj(V.project);if(cp&&myRole(cp)==='editor'){if(!blankTask(cp).resp){toast('Nový úkol můžete založit, jen když je vaše jméno v týmu projektu spojené s vaším účtem (nastaví vedoucí).',true);return}if(hasScope(cp)){const wg=cp.groups.find(g=>groupWritable(cp,g.id));if(!wg){toast('Nemáte skupinu, do které byste mohl zapisovat.');return}}}}
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
  const nt={...blankTask(p),...init};p.tasks.push(nt);focusId=null;commit();openTask(nt.id);
}
function addTodo(key,text,o={}){const list=todoList(key);if(!list)return;const td={id:uid(),text,done:false,who:S.me||'',due:'',block:false,pri:0,imp:false,...o};list.push(td);return td}
function quickTodo(text,o={}){const p=proj(V.project);let init={};let s=text.replace(/^-\s*/,'');
  // „tel Kozák – termín“ / „mail Jandová: smlouva“ → druh položky + kontakt (jméno před oddělovačem – : , nebo celý text)
  s=s.replace(/^(tel|zavolat|call|mail|email|e-mail|napsat|sms|wa|whatsapp|texta?)\s+/i,(m,k)=>{k=k.toLowerCase();init.kind=/^(tel|zavolat|call)$/.test(k)?'call':/^sms$/.test(k)?'sms':/^(wa|whatsapp|texta?)$/.test(k)?'wa':'mail';return ''});
  if(init.kind){const m=s.match(/^([^–\-:,(]+?)\s*(?:[–\-:,(]|$)/);if(m)init.contact=m[1].trim()}
  s=s.replace(/(^|\s)!(?=\s|$)/,(m,a)=>{init.block=true;return a}).trim();
  s=s.replace(/(^|\s)(\d{1,2})\.\s?(\d{1,2})\.(\d{4})?/,(m,a,d,mo,y)=>{const yy=y||TODAY.slice(0,4);const v=`${yy}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;if(!isNaN(parse(v)))init.due=v;return a}).trim();
  let key=(p&&!o.personal)?'p:'+p.id:'me';  // v denním seznamu patří nová položka mimo projekty (do projektu ji zařadí ⋯ nebo „>úkol“)
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
function setGroupForSubtree(id){const f=findTask(id);if(!f)return;const{t,p}=f;const dlg=$('#pdlg');dlg.classList.remove('proj');
  dlg.innerHTML=`<form method="dialog"><div class="dh"><span>Skupina pro fázi „${esc(t.name)}“</span><button type="button" data-x>×</button></div><div class="db">
    <div class="hint">Nastaví skupinu (a tím barvu) této fázi a všem jejím ${descendants(t,p).length} podúkolům. Vlastní barvy jednotlivých úkolů zůstanou.</div>
    <div class="f"><label>Skupina</label><select name="g"><option value="__new">+ nová skupina „${esc(t.name)}“</option>${p.groups.map(g=>`<option value="${g.id}" ${t.group===g.id?'selected':''}>${esc(g.name)}</option>`).join('')}</select></div>
    <div class="f" id="newg"><label>Barva nové skupiny</label><div class="sw">${PALETTE.map((c,k)=>`<button type="button" data-c="${c}" class="${k===(p.groups.length*4+3)%PALETTE.length?'on':''}" style="background:${c}"></button>`).join('')}<input type="hidden" name="color" value="${PALETTE[(p.groups.length*4+3)%PALETTE.length]}"></div></div>
    </div><div class="df"><button type="button" class="btn" data-x>Zavřít</button><button type="submit" class="btn pri">Použít</button></div></form>`;
  const fm=$('form',dlg);const E=n=>fm.elements[n];
  fm.addEventListener('change',e=>{if(e.target.name==='g')$('#newg',fm).style.display=e.target.value==='__new'?'':'none'});
  fm.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.c){$$('.sw button',fm).forEach(x=>x.classList.remove('on'));b.classList.add('on');E('color').value=b.dataset.c}if(b.hasAttribute('data-x'))dlg.close()});
  fm.addEventListener('submit',()=>{let gid=E('g').value;if(gid==='__new'){const g={id:uid(),name:t.name,color:E('color').value};p.groups.push(g);gid=g.id}
    [t,...descendants(t,p)].forEach(x=>x.group=gid);commit();toast('Skupina nastavena pro fázi i podúkoly')});
  dlg.showModal()}
function addChild(id){const f=findTask(id);if(!f)return;const t={...blankTask(f.p)};t.parent=id;if(f.p._draft||groupWritable(f.p,f.t.group))t.group=f.t.group;f.t.collapsed=false;const pd=descendants(f.t,f.p);let j=f.p.tasks.indexOf(f.t)+1;while(j<f.p.tasks.length&&pd.includes(f.p.tasks[j]))j++;f.p.tasks.splice(j,0,t);focusId=t.id;commit()}
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
function newProject(){const p={id:uid(),name:'Nový projekt',lead:S.me||'',color:PALETTE[(S.projects.length*5)%PALETTE.length],team:S.me?[S.me]:[],teamLinks:S.me?{[S.me]:S.meId}:{},_teamIds:{},groups:[],tasks:[],todos:[],members:[{user_id:S.meId,role:'lead',email:S.meEmail,name:S.me}],invites:[],access:[],proposals:[],myRole:'lead',created_by:S.meId};S.projects.push(p);V.project=p.id;save();render();openProj(p.id)}

/* ---------- task dialog ---------- */
function openTask(id,focusLog){const f=findTask(id);if(!f)return;const {t,p}=f;const dlg=$('#tdlg');dlg.classList.remove('wide');const RO=isRO(p)||(!p._draft&&!taskWritable(t,p));const kids=kidsOf(t,p).length;const DR=!!p._draft;const orig=DR&&t.orig?(p._liveTasks||[]).find(x=>x.id===t.orig):null;if(DR){t.todos=t.todos||[];t.log=t.log||[];t.links=t.links||[]}const LT=orig||t;const HIDE=DR&&(!orig||myRole(p)==='proposer');
  const others=p.tasks.filter(x=>x.id!==id&&x.parent!==id);
  const custom=!!t.color;
  const logHtml=()=>LT.log.length?LT.log.slice().reverse().map((e,i)=>`<div><button type="button" data-lgrm="${LT.log.length-1-i}">×</button><b>${fmts(e.d)} ${e.d.slice(0,4)}${e.authorName?' · '+esc(e.authorName):''}</b>${esc(e.text)}</div>`).join(''):'<span class="hint">Zatím žádné záznamy. Sem patří průběh: co se stalo, na co se čeká, kdo co slíbil.</span>';
  dlg.innerHTML=`<form method="dialog"><div class="dh"><span>${esc(t.name||'Úkol')} <span class="hint">· ${esc(p.name)}</span></span><button type="button" data-x>×</button></div><div class="db">
    <div class="f"><label>Název</label><input type="text" name="name" value="${esc(t.name)}"></div>
    <div class="f2"><div class="f"><label>Začátek</label><input type="date" name="start" value="${t.start}" ${kids?'disabled':''}></div>
      <div class="f"><label>Konec</label><input type="date" name="end" value="${t.end}" ${kids||t.milestone?'disabled':''}></div>
      <div class="f"><label>Dní</label><input type="number" name="dur" min="1" value="${diff(t.start,t.end)+1}" ${kids||t.milestone?'disabled':''}></div></div>
    <div class="f2"><div class="f"><label>Odpovědný</label><select name="resp"><option value="">—</option>${p.team.map(m=>`<option ${t.resp===m?'selected':''}>${esc(m)}</option>`).join('')}</select></div>
      <div class="f" style="grid-column:span 2"><label>Skupina úkolů (určuje barvu)</label><select name="group"><option value="">— bez skupiny —</option>${p.groups.map(g=>`<option value="${g.id}" ${t.group===g.id?'selected':''}>${esc(g.name)}</option>`).join('')}</select>${p.groups.length?'':'<span class="hint">Skupiny založíte v nastavení projektu, nebo rychlým zadáním „#Skupina“.</span>'}</div></div>
    <div class="f"><label><input type="checkbox" name="usecolor" ${custom?'checked':''}> Vlastní barva místo barvy skupiny <span class="hint">(kritický úkol je vždy červený)</span></label><div class="sw" style="${custom?'':'display:none'}">${PALETTE.map(c=>`<button type="button" data-c="${c}" class="${c===t.color?'on':''}" style="background:${c}"></button>`).join('')}<input type="hidden" name="color" value="${t.color||colorOf(t,p)}"></div></div>
    <div class="f"><label>Spolupracovníci</label><div class="chips">${p.team.filter(m=>m!==t.resp).map(m=>`<label class="chip ${(t.collab||[]).includes(m)?'on':''}"><input type="checkbox" name="collab" value="${esc(m)}" ${(t.collab||[]).includes(m)?'checked':''}>${esc(m)}</label>`).join('')||'<span class="hint">Tým projektu je prázdný – doplňte lidi v nastavení projektu.</span>'}</div></div>
    <div class="fx"><label><input type="checkbox" name="critical" ${t.critical?'checked':''}> Kritický úkol</label><label><input type="checkbox" name="milestone" ${t.milestone?'checked':''} ${kids?'disabled':''}> Milník (jeden den)</label><label><input type="checkbox" name="external" ${t.external?'checked':''}> Cizí termín <span class="hint">– svislá linka přes graf</span></label>
      <label id="progwrap" style="${t.milestone?'display:none':''}">Hotovo <select name="progress" ${kids||DR?'disabled':''} style="border:1px solid var(--line);border-radius:6px;padding:4px 6px;background:var(--bg)">${[0,25,50,75,100].map(v=>`<option value="${v}" ${(t.progress||0)===v?'selected':''}>${v} %</option>`).join('')}</select></label><label id="msdonewrap" style="${t.milestone?'':'display:none'}"><input type="checkbox" name="msdone" ${(t.progress||0)>=100?'checked':''} ${DR?'disabled':''}> Milník splněn</label></div>
    ${DR?`<div class="hint" style="background:var(--bg);padding:8px 10px;border-radius:6px">Upravujete <b>návrh</b>. Plnění se v návrhu nemění. ${HIDE?(orig?'ToDo, deník a dokumenty aktuálního úkolu jsou pro vás jen ke čtení.':'ToDo a deník půjde doplnit až po schválení návrhu.'):'ToDo, deník a dokumenty níže patří k <b>aktuálnímu</b> úkolu a ukládají se hned.'}${HIDE&&orig&&orig.log.length?'<br><b>Deník aktuálního úkolu:</b><br>'+orig.log.slice(-5).map(e=>fmts(e.d)+' '+esc(e.text)).join('<br>'):''}${HIDE&&orig&&orig.todos.length?'<br><b>ToDo:</b> '+orig.todos.map(x=>(x.done?'✓ ':'☐ ')+esc(x.text)).join(', '):''}</div>`:''}
    <div class="f" style="${HIDE?'display:none':''}"><label>ToDo k úkolu (checklist) <span class="hint">· ⛔ = blokuje dokončení</span></label><div class="todol" id="todol"></div><div class="fx" style="margin-top:4px"><input type="text" id="tdnew" placeholder="+ položka… (Enter přidá další)" style="flex:1;min-width:200px" autocomplete="off"><label><input type="checkbox" name="autoProg" ${t.autoProg?'checked':''}> Hotovost % počítat z checklistu</label></div></div>
    <div class="f"><label><input type="checkbox" name="unclear" ${t.unclear?'checked':''}> <b>K upřesnění</b> <span class="hint">– úkol je nejasný, potřebuje vysvětlení nebo rozhodnutí</span></label><textarea name="question" rows="2" placeholder="Co je nejasné / na co se zeptat a koho…" style="${t.unclear?'':'display:none'}">${esc(t.question||'')}</textarea></div>
    <div class="f"><label>Zadání a podrobnosti</label><textarea name="note" rows="3" placeholder="Cíl, postup, dohody, na co nezapomenout…">${esc(t.note||'')}</textarea></div>
    <div class="f" style="${HIDE?'display:none':''}"><label>Deník úkolu (průběh řešení)</label><div class="logadd"><textarea name="newlog" rows="2" placeholder="Nový záznam k dnešnímu dni… (Ctrl+Enter)"></textarea><button type="button" class="btn" data-lgadd>Zapsat</button></div><div class="log" id="log">${logHtml()}</div></div>
    <div class="f" style="${HIDE?'display:none':''}"><label>Dokumenty</label><div class="deplist" id="docs"></div><div class="fx"><label class="btn" style="cursor:pointer">📎 Nahrát soubor <input type="file" name="docfile" multiple hidden></label><span class="hint" id="docstat"></span></div></div>
    <div class="f" style="${HIDE?'display:none':''}"><label>Odkazy</label><div class="team" id="links"></div><div><button type="button" class="btn" data-addl>+ přidat odkaz</button></div></div>
    <div class="f"><label>Historie změn</label><div class="hist" id="hist"></div></div>
    <div class="f"><label>Zařadit pod (nadřazený úkol)</label><select name="parent"><option value="">— žádný —</option>${(()=>{const ds=descendants(t,p);return p.tasks.filter(x=>x.id!==id&&!ds.includes(x)).map(x=>`<option value="${x.id}" ${t.parent===x.id?'selected':''}>${'\u00a0'.repeat(depth(x,p)*3)+esc(x.name)}</option>`).join('')})()}</select></div>
    <div class="f"><label>Navazuje na (předchůdci)</label><div class="deplist" id="deplist"></div><div class="fx" style="margin-top:4px"><select name="depadd" style="flex:1;border:1px solid var(--line);background:var(--bg);border-radius:6px;padding:6px 8px"><option value="">+ přidat předchůdce…</option>${others.map(x=>`<option value="${x.id}">${'\u00a0'.repeat(depth(x,p)*3)+wbsOf(x,p)+' '+esc(x.name||'bez názvu')}</option>`).join('')}</select></div></div>
    </div><div class="df"><div class="left-actions"><button type="button" class="btn" data-mv="-1">↑</button><button type="button" class="btn" data-mv="1">↓</button><button type="button" class="btn" data-ind="1" ${t.parent?'disabled':''}>Zanořit</button><button type="button" class="btn" data-ind="0" ${t.parent?'':'disabled'}>Vynořit</button><button type="button" class="btn danger" data-del>Smazat</button></div>
    <button type="button" class="btn" data-x>Zavřít</button><button type="submit" class="btn" data-next>Uložit a další úkol</button><button type="submit" class="btn pri">Uložit</button></div></form>`;
  const fm=$('form',dlg),E=n=>fm.elements[n];let links=(LT.links||[]).map(l=>({...l}));let todos=(LT.todos||[]).map(x=>({...x}));let deps=[...(t.deps||[])];
  const rhist=()=>{const hs=(p.changes||[]).filter(c=>c.task_id===LT.id).slice().reverse();$('#hist',fm).innerHTML=hs.length?hs.slice(0,40).map(c=>`<div class="${!c.read&&c.author!==S.meId&&S.trackChanges?'unread':''}"><span class="w">${fmtDT(c.at)} · ${esc(c.authorName)}</span><span class="x">${esc(chgText(c))}</span>${c.kind==='task'&&myRole(p)==='lead'&&!DR?`<button type="button" data-revert="${c.id}">Vrátit</button>`:''}</div>`).join(''):'<span class="hint">Zatím žádné změny.</span>'};rhist();
  const rdocs=()=>{$('#docs',fm).innerHTML=(LT.docs||[]).map(d=>`<div><span><a href="#" data-doc="${d.id}">${esc(d.name)}</a> <span class="hint">${d.size?Math.round(d.size/1024)+' kB':''}</span></span><button type="button" data-docrm="${d.id}">×</button></div>`).join('')||'<span class="hint">Zatím žádné soubory.</span>'};rdocs();
  const rdep=()=>{$('#deplist',fm).innerHTML=deps.map(d=>{const x=p.tasks.find(y=>y.id===d);return x?`<div><span>${wbsOf(x,p)} ${esc(x.name)} <span class="hint">${fmts(span(x,p).end)}</span></span><button type="button" data-deprm="${d}">×</button></div>`:''}).join('')||'<span class="hint">Žádné vazby.</span>';const s=E('depadd');[...s.options].forEach(o=>o.disabled=deps.includes(o.value))};rdep();
  const rtd=()=>{$('#todol',fm).innerHTML=todos.map((x,i)=>`<div class="${x.done?'done':''}"><input type="checkbox" data-td="done" data-i="${i}" ${x.done?'checked':''}><input type="text" data-td="text" data-i="${i}" value="${esc(x.text)}" placeholder="Co je třeba udělat"><select data-td="who" data-i="${i}"><option value="">—</option>${p.team.map(m=>`<option ${x.who===m?'selected':''}>${esc(m)}</option>`).join('')}</select><input type="date" data-td="due" data-i="${i}" value="${x.due||''}"><button type="button" data-td="block" data-i="${i}" class="blk ${x.block?'on':''}" style="color:${x.block?'var(--critical)':'var(--muted)'}">⛔</button><button type="button" data-td="rm" data-i="${i}">×</button></div>`).join('')||'<span class="hint">Drobné akce, které podmiňují úkol – zavolat, poslat, ověřit…</span>'};rtd();
  const rl=()=>{$('#links',fm).innerHTML=links.map((l,i)=>`<div><input type="text" value="${esc(l.name)}" placeholder="název" data-ln="${i}" style="flex:0 0 40%"><input type="text" value="${esc(l.url)}" placeholder="https://…" data-lu="${i}">${l.url?`<a href="${esc(l.url)}" target="_blank">↗</a>`:''}<button type="button" data-lrm="${i}">×</button></div>`).join('')};rl();
  const addLog=()=>{const v=E('newlog').value.trim();if(!v)return;LT.log.push({id:uid(),d:TODAY,text:v,author:S.meId,authorName:S.me});E('newlog').value='';$('#log',fm).innerHTML=logHtml();save()};
  fm.addEventListener('input',e=>{const d=e.target.dataset;if(d.ln!==undefined)links[+d.ln].name=e.target.value;if(d.lu!==undefined)links[+d.lu].url=e.target.value;
    if(d.td&&e.target.tagName!=='BUTTON'){const x=todos[+d.i];if(d.td==='done'){x.done=e.target.checked;e.target.parentElement.classList.toggle('done',x.done)}else x[d.td]=e.target.value}});
  fm.addEventListener('keydown',e=>{if(e.target.id==='tdnew'&&e.key==='Enter'){e.preventDefault();const v=e.target.value.trim();if(!v)return;todos.push({id:uid(),text:v,done:false,who:'',due:'',block:false});rtd();e.target.value='';e.target.focus()}
    if(e.target.dataset.td==='text'&&e.key==='Enter'){e.preventDefault();const i=+e.target.dataset.i;todos[i].text=e.target.value;const ins=$$('#todol input[type=text]',fm);if(ins[i+1])ins[i+1].focus();else $('#tdnew',fm).focus()}
    if(e.target.dataset.td==='text'&&e.key==='Backspace'&&e.target.value===''){e.preventDefault();const i=+e.target.dataset.i;todos.splice(i,1);rtd();const ins=$$('#todol input[type=text]',fm);(ins[i-1]||$('#tdnew',fm)).focus()}
    if(e.target.name==='newlog'&&e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();addLog()}});
  fm.addEventListener('click',e=>{const a=e.target.closest('a[data-doc]');if(a){e.preventDefault();const d=(LT.docs||[]).find(x=>x.id===a.dataset.doc);if(d)DB.docUrl(d.path).then(u=>window.open(u,'_blank')).catch(err=>toast(err.message,true));return}
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.deprm){deps=deps.filter(d=>d!==b.dataset.deprm);rdep()}
    if(b.dataset.revert){const c=(p.changes||[]).find(x=>x.id===b.dataset.revert);if(c&&confirm('Vrátit změnu: '+chgText(c)+'?')){dlg.close();revertChange(p,c)}return}
    if(b.dataset.docrm){const d=(LT.docs||[]).find(x=>x.id===b.dataset.docrm);if(d&&confirm('Smazat soubor '+d.name+'?')){DB.deleteDoc(d).then(()=>{LT.docs=LT.docs.filter(x=>x!==d);rdocs()}).catch(err=>toast(err.message,true))}}

    if(b.dataset.td==='rm'){todos.splice(+b.dataset.i,1);rtd()}
    if(b.dataset.td==='block'){todos[+b.dataset.i].block=!todos[+b.dataset.i].block;rtd()}
    if(b.hasAttribute('data-lgadd'))addLog();
    if(b.dataset.lgrm!==undefined){LT.log.splice(+b.dataset.lgrm,1);$('#log',fm).innerHTML=logHtml();save()}
    if(b.hasAttribute('data-addl')){links.push({name:'',url:''});rl();const ins=$$('#links input',fm);ins[ins.length-2].focus()}
    if(b.dataset.lrm){links.splice(+b.dataset.lrm,1);rl()}
    if(b.dataset.c){$$('.sw button',fm).forEach(x=>x.classList.remove('on'));b.classList.add('on');E('color').value=b.dataset.c}
    if(b.hasAttribute('data-x')){dlg.close();render()}
    if(b.hasAttribute('data-del')){dlg.close();delTask(id)}
    if(b.dataset.mv){dlg.close();moveTask(id,+b.dataset.mv)}
    if(b.dataset.ind){dlg.close();indent(id,b.dataset.ind==='1')}
  });
  fm.addEventListener('change',async e=>{const n=e.target.name;
    if(n==='docfile'){const files=[...e.target.files];const st=$('#docstat',fm);for(const f of files){st.textContent='Nahrávám '+f.name+'…';try{const d=await DB.uploadDoc(p.id,LT.id,f);(LT.docs||=[]).push(d);rdocs()}catch(err){toast('Nahrání selhalo: '+(err.message||err),true)}}st.textContent='';e.target.value='';return}
    if(n==='depadd'&&e.target.value){deps.push(e.target.value);e.target.value='';rdep()}
    if(n==='dur'){const v=Math.max(1,+E('dur').value||1);E('end').value=addDays(E('start').value,v-1)}
    if(n==='start'||n==='end'){if(E('end').value<E('start').value)E('end').value=E('start').value;E('dur').value=diff(E('start').value,E('end').value)+1}
    if(n==='milestone'){const ms=E('milestone').checked;E('end').disabled=ms;E('dur').disabled=ms;if(ms){E('end').value=E('start').value;E('dur').value=1}$('#progwrap',fm).style.display=ms?'none':'';$('#msdonewrap',fm).style.display=ms?'':'none'}
    if(n==='usecolor'){$('.sw',fm).style.display=E('usecolor').checked?'':'none'}
    if(n==='unclear'){E('question').style.display=E('unclear').checked?'':'none';if(E('unclear').checked)E('question').focus()}
    if(n==='color'){$$('.sw button',fm).forEach(x=>x.classList.toggle('on',x.dataset.c===E('color').value))}
    if(e.target.closest('.chip'))e.target.closest('.chip').classList.toggle('on',e.target.checked);
  });
  let andNext=false;fm.addEventListener('click',e=>{const b=e.target.closest('button[type=submit]');if(b)andNext=b.hasAttribute('data-next')});
  fm.addEventListener('submit',()=>{
    if(!HIDE){addLog();{const nv=(E('tdnew')||{}).value;if(nv&&nv.trim())todos.push({id:uid(),text:nv.trim(),done:false,who:'',due:'',block:false})}LT.todos=todos.filter(x=>x.text.trim());if(!DR)t.autoProg=E('autoProg').checked}
    if(!DR&&!kids&&!t.autoProg&&+E('progress').value>=100&&openBlocking(t).length){alert('Úkol má otevřené blokující ToDo, nelze ho označit za hotový:\n– '+openBlocking(t).map(x=>x.text).join('\n– '));E('progress').value=t.progress||0}
    if(!DR&&myRole(p)==='editor'){const MY=new Set(linkedNames(p));const nr=E('resp').value,nc=$$('input[name=collab]:checked',fm).map(x=>x.value);if(!MY.has(nr)&&!nc.some(c=>MY.has(c))){alert('Jako řešitel musíte u úkolu zůstat odpovědný nebo spolupracovník – jinak byste ho už nemohl upravovat.');return}}
    t.name=E('name').value.trim();t.color=E('usecolor').checked?E('color').value:'';t.group=E('group').value;t.resp=E('resp').value;t.collab=$$('input[name=collab]:checked',fm).map(x=>x.value);
    t.unclear=E('unclear').checked;t.question=E('question').value.trim();t.note=E('note').value.trim();if(!HIDE)LT.links=links.filter(l=>l.url||l.name);t.critical=E('critical').checked;t.milestone=E('milestone').checked;t.external=E('external').checked;t.deps=deps;
    if(!kids){t.start=E('start').value||t.start;t.end=t.milestone?t.start:(E('end').value||t.end);if(t.end<t.start)t.end=t.start;if(!DR)t.progress=t.milestone?(E('msdone').checked?100:0):(+E('progress').value||0)}
    const np=E('parent').value||null;if(np!==t.parent){const sub=[t,...descendants(t,p)];t.parent=np;const rest=p.tasks.filter(x=>!sub.includes(x));if(np){const par=rest.find(x=>x.id===np);const pd=descendants(par,p).filter(x=>!sub.includes(x));let j=rest.indexOf(par)+1;while(j<rest.length&&pd.includes(rest[j]))j++;rest.splice(j,0,...sub);par.collapsed=false}else rest.push(...sub);p.tasks=rest}
    if(andNext){andNext=false;save();addTask(id);return}
    commit()});
  dlg.showModal();
  if(RO){$$('input,select,textarea,button',fm).forEach(el=>{if(!el.hasAttribute('data-x'))el.disabled=true});const s=$('.df .btn.pri',fm);if(s)s.style.display='none';$('.dh span',fm).insertAdjacentHTML('beforeend',' <span class="hint">· jen ke čtení – upravujte v návrhu</span>')}
  if(focusLog&&!RO)E('newlog').focus();
}

/* ---------- morning list / triage ---------- */
let dumpDraft='';
function openDump(lines,existingIds){
  const dlg=$('#tdlg');dlg.classList.add('wide');
  const me=S.me||'';const people=allPeople();
  let items;
  if(existingIds){items=existingIds.map(id=>{const f=findTodo(id);return {id,text:f.td.text,pid:f.p?f.p.id:'',tid:f.t?f.t.id:'',who:f.td.who,due:f.td.due,pri:f.td.pri||0,imp:!!f.td.imp,block:!!f.td.block}})}
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
        items.push({text:l,pid:pid||(V.project!=='ALL'?V.project:''),tid,who:S.me||'',due:'',pri:0,imp:false,block:false})}
      if(!items.length)return;step2()});
  };
  const step2=()=>{
    const pOpts=v=>`<option value="">— mimo projekty —</option>`+S.projects.map(p=>`<option value="${p.id}" ${v===p.id?'selected':''}>${esc(p.name)}</option>`).join('');
    const tOpts=(pid,v)=>{const p=proj(pid);return `<option value="">— inbox projektu —</option>`+(p?p.tasks.filter(t=>!kidsOf(t,p).length&&progressOf(t,p)<100).map(t=>`<option value="${t.id}" ${v===t.id?'selected':''}>${esc(t.name)}</option>`).join(''):'')};
    const wOpts=(pid,v)=>{const p=proj(pid);const ppl=[...new Set([...(p?p.team:people),...(me?[me]:[]),...(v?[v]:[])])];return `<option value="">—</option>`+ppl.map(m=>`<option ${v===m?'selected':''}>${esc(m)}</option>`).join('')};
    const rowHtml=(it,i)=>`<div class="r" data-i="${i}"><span class="hint">${i+1}</span><input type="text" data-k="text" value="${esc(it.text)}"><select data-k="pid">${pOpts(it.pid)}</select><select data-k="tid">${tOpts(it.pid,it.tid)}</select><select data-k="who">${wOpts(it.pid,it.who)}</select><div class="dq"><input type="date" data-k="due" value="${it.due||''}"><button type="button" data-d="0">D</button><button type="button" data-d="1">Z</button></div><select data-k="pri"><option value="0" ${!it.pri?'selected':''}>—</option><option value="1" ${it.pri==1?'selected':''}>A</option><option value="2" ${it.pri==2?'selected':''}>B</option><option value="3" ${it.pri==3?'selected':''}>C</option></select><button type="button" data-k="imp" class="${it.imp?'on':''}">★</button><button type="button" data-k="block" class="blk ${it.block?'on':''}">⛔</button><button type="button" class="rm" data-k="rm">×</button></div>`;
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
      dumpDraft='';dlg.close();dlg.classList.remove('wide');if(!existingIds)V.todoPanel='open';commit()});
  };
  if(existingIds)step2();else if(lines){items=lines;step2()}else step1();
  dlg.showModal();
}

/* ---------- project dialog ---------- */
function openProj(id){const p=proj(id);if(!p)return;const dlg=$('#pdlg');dlg.classList.add('proj');
  dlg.innerHTML=`<form method="dialog"><div class="dh"><span>Projekt</span><button type="button" data-x>×</button></div><div class="db">
    <div class="f"><label>Název projektu</label><input type="text" name="name" value="${esc(p.name)}"></div>
    <div class="f"><label>Vedoucí projektu</label><input type="text" name="lead" value="${esc(p.lead||'')}" list="ppl"><datalist id="ppl">${p.team.map(m=>`<option value="${esc(m)}">`).join('')}</datalist></div>
    <div class="f"><label>Barva projektu</label><div class="sw">${PALETTE.map(c=>`<button type="button" data-c="${c}" class="${c===p.color?'on':''}" style="background:${c}"></button>`).join('')}<input type="hidden" name="color" value="${p.color}"></div></div>
    <div class="f"><label>Deadline <span class="hint">· finální termín projektu – červená linka s 🔥 v grafu; úkoly ho mohou přesahovat</span></label><div class="fx"><input type="date" name="deadline" value="${p.deadline||''}"><label class="chk"><input type="checkbox" name="countdown" ${p.countdown?'checked':''}> zobrazovat odpočet (D:H:M) v záhlaví</label></div></div>
    <div class="f"><label>Tým projektu <span class="hint">· jména u úkolů; vpravo lze jméno spojit s přihlášeným uživatelem (kvůli právům řešitele a jeho ToDo)</span></label><div class="team" id="team"></div><div><button type="button" class="btn" data-addm>+ přidat osobu</button></div></div>
    <div class="f"><label>Přístup (přihlášení uživatelé)</label><div class="deplist" id="members"></div><div class="fx"><input type="text" name="invmail" placeholder="e-mail" style="flex:1;border:1px solid var(--line);background:var(--bg);border-radius:6px;padding:6px 8px"><select name="invrole" style="border:1px solid var(--line);background:var(--bg);border-radius:6px;padding:6px 8px"><option value="editor">řešitel</option><option value="proposer">navrhovatel (jen vybrané skupiny, upravuje návrh)</option><option value="viewer">čtenář</option><option value="lead">vedoucí</option></select><button type="button" class="btn" data-inv>Přidat</button></div><span class="hint">Pokud se uživatel ještě nezaregistroval, uloží se pozvánka a členství vznikne při jeho registraci. Vedoucí upravuje vše, řešitel své úkoly, deník, odkazy a ToDo, čtenář jen čte. Navrhovatel (např. ICZ, VITA) vidí jen skupiny, které mu povolíte, a úpravy dělá v návrhu, který schvalujete. U řešitele a čtenáře zaškrtněte „omezit na vybrané skupiny“ a pak u skupin zvolte přístup; bez zaškrtnutí vidí celý projekt.</span></div>
    <div class="f"><label>Skupiny úkolů (logické celky – barva úkolů)</label><div class="team" id="groups"></div><div><button type="button" class="btn" data-addg>+ přidat skupinu</button></div></div>
    </div><div class="df"><div class="left-actions"><button type="button" class="btn danger" data-del>Smazat projekt</button></div><button type="button" class="btn" data-x>Zavřít</button><button type="submit" class="btn pri">Uložit</button></div></form>`;
  const fm=$('form',dlg),E=n=>fm.elements[n];let team=[...p.team];let groups=p.groups.map(g=>({...g}));
  let links=Object.assign({},p.teamLinks||{});const ROLE={lead:'vedoucí',editor:'řešitel',viewer:'čtenář',proposer:'navrhovatel'};
  const uOpts=v=>`<option value="">— nespojeno —</option>`+(p.members||[]).map(m=>`<option value="${m.user_id}" ${v===m.user_id?'selected':''}>${esc(m.name||m.email)}</option>`).join('');
  const rt=()=>{$('#team',fm).innerHTML=team.map((m,i)=>`<div><input type="text" value="${esc(m)}" data-i="${i}"><select data-ul="${i}" style="flex:0 0 150px;font-size:12px">${uOpts(links[m])}</select><button type="button" data-rm="${i}">×</button></div>`).join('')};rt();
  const acc=(uid_,gid)=>{const x=(p.access||[]).find(a=>a.user_id===uid_&&a.group_id===gid);return x?(x.can_edit?'edit':'read'):''};
  const rm=()=>{$('#members',fm).innerHTML=(p.members||[]).map(m=>`<div style="flex-wrap:wrap"><span>${esc(m.name||'')} <span class="hint">${esc(m.email)}</span></span><select data-role="${m.user_id}" style="font-size:12px" ${m.user_id===S.meId?'disabled':''}>${Object.entries(ROLE).map(([k,v])=>`<option value="${k}" ${m.role===k?'selected':''}>${v}</option>`).join('')}</select>${m.user_id===S.meId?'':`<button type="button" data-mrm="${m.user_id}">×</button>`}${(m.role==='proposer'||m.role==='editor'||m.role==='viewer')?`<div class="roles" style="flex-basis:100%">${m.role!=='proposer'?`<div><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-scoped="${m.user_id}" ${m.scoped?'checked':''}> omezit na vybrané skupiny (jinak vidí celý projekt)</label></div>`:''}${m.role!=='proposer'&&!m.scoped?'':(p.groups||[]).map(g=>`<div><span class="pd" style="width:9px;height:9px;border-radius:3px;background:${g.color};display:inline-block;flex:none"></span><span>${esc(g.name)}</span><select data-acc="${m.user_id}" data-gid="${g.id}" style="font-size:12px"><option value="" ${acc(m.user_id,g.id)===''?'selected':''}>— nevidí —</option><option value="read" ${acc(m.user_id,g.id)==='read'?'selected':''}>jen čtení</option>${m.role==='viewer'?'':`<option value="edit" ${acc(m.user_id,g.id)==='edit'?'selected':''}>${m.role==='proposer'?'návrhy úprav':'čtení a úpravy'}</option>`}</select></div>`).join('')}</div>`:''}</div>`).join('')+(p.invites||[]).map(i=>`<div style="flex-wrap:wrap"><span>${esc(i.email)} <span class="hint">pozvánka</span></span><select data-irole="${esc(i.email)}" style="font-size:12px">${Object.entries(ROLE).map(([k,v])=>`<option value="${k}" ${i.role===k?'selected':''}>${v}</option>`).join('')}</select><button type="button" data-irm="${esc(i.email)}">×</button>${(i.role==='proposer'||i.role==='editor'||i.role==='viewer')?`<div class="roles" style="flex-basis:100%">${i.role!=='proposer'?`<div><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-iscoped="${esc(i.email)}" ${i.scoped?'checked':''}> omezit na vybrané skupiny (jinak vidí celý projekt)</label></div>`:''}${i.role!=='proposer'&&!i.scoped?'':(p.groups||[]).map(g=>{const x=(i.access||[]).find(z=>z.group_id===g.id);const v=x?(x.can_edit?'edit':'read'):'';return `<div><span class="pd" style="width:9px;height:9px;border-radius:3px;background:${g.color};display:inline-block;flex:none"></span><span>${esc(g.name)}</span><select data-iacc="${esc(i.email)}" data-gid="${g.id}" style="font-size:12px"><option value="" ${v===''?'selected':''}>— nevidí —</option><option value="read" ${v==='read'?'selected':''}>jen čtení</option>${i.role==='viewer'?'':`<option value="edit" ${v==='edit'?'selected':''}>${i.role==='proposer'?'návrhy úprav':'čtení a úpravy'}</option>`}</select></div>`}).join('')}<span class="hint">Přístup se přenese při registraci uživatele.</span></div>`:''}</div>`).join('')||'<span class="hint">Zatím jen vy.</span>'};rm();
  let gOpen=-1;const rg=()=>{$('#groups',fm).innerHTML=groups.map((g,i)=>`<div><button type="button" data-gpick="${i}" style="width:30px;height:28px;border-radius:6px;border:2px solid var(--line);background:${g.color};padding:0;flex:none"></button><input type="text" value="${esc(g.name)}" data-gn="${i}" placeholder="název skupiny"><button type="button" data-grm="${i}">×</button></div>${gOpen===i?`<div class="sw" style="padding:4px 0 8px 36px">${PALETTE.map(c=>`<button type="button" data-gc="${i}" data-c="${c}" class="${c===g.color?'on':''}" style="background:${c}"></button>`).join('')}</div>`:''}`).join('')};rg();
  fm.addEventListener('input',e=>{const d=e.target.dataset;if(d.i!==undefined){const old=team[+d.i];team[+d.i]=e.target.value;if(links[old]!==undefined){links[e.target.value]=links[old];delete links[old]}}if(d.gn!==undefined)groups[+d.gn].name=e.target.value});
  fm.addEventListener('change',async e=>{const d=e.target.dataset;if(d.ul!==undefined){const nm=team[+d.ul];if(e.target.value)links[nm]=e.target.value;else delete links[nm]}
    if(d.role){try{await DB.setRole(p.id,d.role,e.target.value);const m=p.members.find(x=>x.user_id===d.role);if(m)m.role=e.target.value;toast('Role změněna');rm()}catch(err){toast(err.message,true)}}
    if(d.scoped){try{await DB.setScoped(p.id,d.scoped,e.target.checked);const m=p.members.find(x=>x.user_id===d.scoped);if(m)m.scoped=e.target.checked;toast(e.target.checked?'Omezeno na vybrané skupiny':'Vidí celý projekt');rm()}catch(err){toast(err.message,true)}}
    if(d.iscoped){try{await DB.setInviteScoped(p.id,d.iscoped,e.target.checked);const inv=p.invites.find(x=>x.email===d.iscoped);if(inv)inv.scoped=e.target.checked;rm()}catch(err){toast(err.message,true)}}
    if(d.irole){try{await DB.setInviteRole(p.id,d.irole,e.target.value);const inv=p.invites.find(x=>x.email===d.irole);if(inv)inv.role=e.target.value;toast('Role pozvánky změněna');rm()}catch(err){toast(err.message,true)}}
    if(d.iacc){try{const inv=p.invites.find(x=>x.email===d.iacc);if(!inv)return;inv.access=(inv.access||[]).filter(x=>x.group_id!==d.gid);if(e.target.value)inv.access.push({group_id:d.gid,can_edit:e.target.value==='edit'});await DB.setInviteAccess(p.id,d.iacc,inv.access);toast('Přístup uložen (uplatní se po registraci)')}catch(err){toast(err.message,true)}}
    if(d.acc){try{await DB.setAccess(p.id,d.gid,d.acc,e.target.value);p.access=(p.access||[]).filter(x=>!(x.user_id===d.acc&&x.group_id===d.gid));if(e.target.value)p.access.push({user_id:d.acc,group_id:d.gid,can_edit:e.target.value==='edit'});toast('Přístup uložen')}catch(err){toast(err.message,true)}}});
  fm.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
    if(b.dataset.gpick!==undefined){gOpen=gOpen===+b.dataset.gpick?-1:+b.dataset.gpick;rg();return}
    if(b.dataset.gc!==undefined){groups[+b.dataset.gc].color=b.dataset.c;gOpen=-1;rg();return}
    if(b.dataset.c){$$('.sw button',fm).forEach(x=>x.classList.remove('on'));b.classList.add('on');E('color').value=b.dataset.c}
    if(b.hasAttribute('data-addm')){team.push('');rt();const ins=$$('#team input',fm);ins[ins.length-1].focus()}
    if(b.hasAttribute('data-inv')){const em=E('invmail').value.trim(),role=E('invrole').value;if(!em)return;DB.addMember(p.id,em,role).then(async kind=>{E('invmail').value='';if(kind==='member'){const prof=Object.values(S.profiles||{}).find(x=>x.email.toLowerCase()===em.toLowerCase());p.members.push({user_id:prof.id,role,scoped:false,email:prof.email,name:prof.name||''});toast('Uživatel přidán')}else{p.invites.push({email:em.toLowerCase(),role,scoped:false,access:[]});toast('Pozvánka uložena – u navrhovatele níže nastavte skupiny')}rm();rt()}).catch(err=>toast(err.message,true))}
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
    p.team=[...new Set(team.map(x=>x.trim()).filter(Boolean))];p.teamLinks=Object.fromEntries(Object.entries(links).filter(([n,u])=>u&&p.team.includes(n.trim())).map(([n,u])=>[n.trim(),u]));p.groups=groups.filter(g=>g.name.trim());p.name=E('name').value.trim()||p.name;p.lead=E('lead').value.trim();p.color=E('color').value;p.deadline=E('deadline').value||'';p.countdown=!!E('deadline').value&&E('countdown').checked;commit()});
  dlg.showModal();
}

/* ---------- context menu ---------- */
const ctx=$('#ctx');
function openCtx(id,x,y){const f=findTask(id);if(!f)return;if(isRO(f.p)||(!f.p._draft&&!taskWritable(f.t,f.p))){barMenu(id,x,y);return}sel=id;$$('.lrow.sel').forEach(r=>r.classList.remove('sel'));const r=$(`.lrow[data-id="${id}"]`);if(r)r.classList.add('sel');
  const t=f.t;const sibs=f.p.tasks.filter(x=>x.parent===t.parent);const k=sibs.indexOf(t);
  ctx.innerHTML=`<button data-op="edit">Detail úkolu <kbd>Enter</kbd></button><button data-op="unclear">${t.unclear?'Zrušit označení „k upřesnění“':'Označit „k upřesnění“ ?'}</button>${kidsOf(t,f.p).length&&myRole(f.p)==='lead'?'<button data-op="grp">Skupina (barva) pro celou fázi…</button>':''}<div class="sep"></div>
    <button data-op="add">Přidat úkol pod tento</button><button data-op="child">Přidat podúkol</button><div class="sep"></div>
    <button data-op="copy">Kopírovat <kbd>Ctrl+C</kbd></button><button data-op="paste" ${clip?'':'disabled'}>Vložit pod tento <kbd>Ctrl+V</kbd></button><button data-op="pastechild" ${clip?'':'disabled'}>Vložit jako podúkol</button><button data-op="dup">Duplikovat <kbd>Ctrl+D</kbd></button><div class="sep"></div>
    <button data-op="up" ${k>0?'':'disabled'}>Posunout nahoru <kbd>Alt+↑</kbd></button><button data-op="down" ${k<sibs.length-1?'':'disabled'}>Posunout dolů <kbd>Alt+↓</kbd></button><button data-op="in" ${k>0?'':'disabled'}>Zanořit <kbd>Alt+Tab</kbd></button><button data-op="out" ${t.parent?'':'disabled'}>Vynořit <kbd>Alt+Shift+Tab</kbd></button><div class="sep"></div>
    <button data-op="del" class="danger">Smazat <kbd>Delete</kbd></button>`;
  ctx.classList.add('open');const w=ctx.offsetWidth||220,hh=ctx.offsetHeight||360;ctx.style.left=Math.min(x,innerWidth-w-8)+'px';ctx.style.top=Math.min(y,innerHeight-hh-8)+'px';ctx.dataset.id=id}
ctx.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;const id=ctx.dataset.id;ctx.classList.remove('open');
  ({grp:()=>setGroupForSubtree(id),checked:()=>{const f=findTask(id);if(!f)return;f.t.checked=f.t.checked===TODAY?'':TODAY;commit();toast(f.t.checked?'Dnes zkontrolováno':'Značka zrušena')},addtodo:()=>{const f=findTask(id);if(!f)return;if(todoRefOf(f.t)){toast('Úkol už v ToDo je');return}S.todos.push({id:uid(),owner:S.meId,text:'Kontrola '+f.t.name,who:S.me||'',done:false,doneAt:'',due:TODAY,block:false,pri:0,imp:false,taskRef:id});commit();toast('Přidáno do dnešního ToDo')},unclear:()=>{const f=findTask(id);f.t.unclear=!f.t.unclear;if(f.t.unclear&&!f.t.question)openTask(id);else commit()},edit:()=>openTask(id),add:()=>addTask(id),child:()=>addChild(id),copy:()=>{copyTask(id);render()},paste:()=>pasteTask(id,false),pastechild:()=>pasteTask(id,true),dup:()=>duplicateTask(id),up:()=>moveTask(id,-1),down:()=>moveTask(id,1),in:()=>indent(id,true),out:()=>indent(id,false),del:()=>delTask(id)})[b.dataset.op]()});
document.addEventListener('click',e=>{if(Date.now()-(+ctx.dataset.t||0)<500)return;if(!e.target.closest('#ctx,[data-act=menu]'))ctx.classList.remove('open')});
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
$('#tabs').addEventListener('click',e=>{const b=e.target.closest('.tab');if(!b)return;if(b.dataset.p==='__new'){newProject();return}if(V.draft)exitDraft();V.project=b.dataset.p;V.person='';V.group='';commit();scrollToToday()});
$('#zoom').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;V.zoom=b.dataset.z;commit();scrollToToday()});
$('#by').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.b!=='project'&&V.draft)exitDraft();V.by=b.dataset.b;V.prevBy=V.by;V.status='';commit();scrollToToday()});
$('#bToday').onclick=scrollToToday;

$('#strip').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.depshi){V.depsHi=!V.depsHi;save();$('#gantt').classList.toggle('depshi',!!V.depsHi);b.classList.toggle('on',!!V.depsHi);return}
  if(b.dataset.extshow){V.extShow=!V.extShow;save();render();return}
  if(b.dataset.ackall){const p=proj(V.project);if(p)ackChanges(p,unreadAll(p).map(c=>c.id));return}
  if(b.dataset.st==='todo'){V.todoPanel=V.todoPanel==='open'?'':'open';commit();return}
  if(b.dataset.st){V.status=V.status===b.dataset.st?'':b.dataset.st;commit()}
  if(b.dataset.g){V.group=V.group===b.dataset.g?'':b.dataset.g;commit()}
  if(b.dataset.gsettings){openProj(V.project)}
  if(b.dataset.newdraft){const p=proj(V.project);if(p)createDraft(p,b.dataset.newdraft)}
  if(b.dataset.live){if(V.draft){exitDraft();commit()}}
  if(b.dataset.draft){const p=proj(V.project);const pr=(p.proposals||[]).find(x=>x.id===b.dataset.draft);if(!pr)return;if(V.draft!==pr.id){enterDraft(p,pr);commit()}}});
$('#draftbar').addEventListener('change',e=>{if(e.target.id==='versel'&&e.target.value){const vid=e.target.value;e.target.value='';versionAction('view',vid)}});
$('#draftbar').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const cp=proj(V.project);if(b.hasAttribute('data-savever')){const n=prompt('Název verze (např. „po schůzce s ICZ 24. 9.“):');if(n!==null)saveDraftVersion('manual',n.trim()||'bez názvu');return}if(b.dataset.vdiff){versionAction('diff',b.dataset.vdiff);return}if(b.dataset.vrestore){const vid=b.dataset.vrestore;leaveVersionView();versionAction('restore',vid);return}if(b.hasAttribute('data-vclose')){leaveVersionView();render();return}if(b.dataset.newdraft&&cp){createDraft(cp,b.dataset.newdraft);return}if(b.dataset.enter&&cp){const pr=(cp.proposals||[]).find(x=>x.id===b.dataset.enter);if(pr){enterDraft(cp,pr);commit()}return}if(b.hasAttribute('data-approve'))approveDraft();if(b.hasAttribute('data-reject'))rejectDraft();if(b.hasAttribute('data-reset'))resetDraft();});
$('#draftbar').addEventListener('change',e=>{if(e.target.id==='draftnote'){const d=activeDraft();if(d){d.pr.note=e.target.value;save();DB.sync(S).catch(err=>toast(err.message,true))}}});
$('#strip').addEventListener('change',e=>{if(e.target.id==='person'){V.person=e.target.value;commit()}});
$('#strip').addEventListener('click',e=>{const m=e.target.closest('[data-mine]');if(m){V.mine=!V.mine;commit()}});
$('#strip').addEventListener('keydown',e=>{if(e.target.id==='quick'&&e.key==='Enter'){const v=e.target.value.trim();if(!v)return;const cp=proj(V.project);if(cp&&isRO(cp)){toast('Aktuální harmonogram je pro vás jen ke čtení – otevřete návrh.');return}quickAdd(v);setTimeout(()=>{const q=$('#quick');q.focus()},0)}});
const menu=$('#menu');
$('#todoBtn').addEventListener('click',()=>setTodoPanel(V.todoPanel==='open'?'':'open'));
$('#kBtn').addEventListener('click',openKontrola);
$('#helpBtn').addEventListener('click',()=>openHelp());
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&V.todoPanel==='open'&&!$('dialog[open]')&&!e.target.closest('#tp'))setTodoPanel('min')});
menu.querySelector(':scope > button').onclick=e=>{menu.classList.toggle('open');e.stopPropagation()};
document.addEventListener('click',()=>menu.classList.remove('open'));
menu.addEventListener('click',e=>{const b=e.target.closest('[data-m]');if(!b)return;menu.classList.remove('open');
  switch(b.dataset.m){
    case 'proj':{const p=proj(V.project)||S.projects[0];if(p)openProj(p.id);else newProject();break}
    case 'newproj':newProject();break;
    case 'dump':openDump();break;
    case 'leftw':{const lm=V.leftMode||(V.narrow?'narrow':'full');V.leftMode=lm==='full'?'narrow':lm==='narrow'?'off':'full';V.narrow=V.leftMode==='narrow';save();render();break}
    case 'strip':V.hideStrip=!V.hideStrip;save();render();break;
    case 'autodaily':V.autoDaily=!V.autoDaily;commit();break;
    case 'shortcuts':{for(const k of ['call','mail','sms','wa']){const K=KIND[k];const v=prompt('Název zkratky – '+K.l+' (aplikace Zkratky na Macu/iPhonu):',V[K.sc]||K.d);if(v===null)break;V[K.sc]=v.trim()||K.d}save();toast('Uloženo');break}
    case 'bartip':V.barTip=V.barTip===false;save();render();toast(V.barTip?'Bublina u názvu a baru zapnuta':'Bublina u názvu a baru vypnuta');break;
    case 'track':S.trackChanges=!S.trackChanges;DB.setTrack(S.trackChanges).catch(e=>toast(e.message,true));render();break;
    case 'export':{exitDraft();$('#pdlg').classList.remove('proj');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(S,(k,v)=>k.startsWith('_')?undefined:v,2)],{type:'application/json'}));a.download=`projekty-${TODAY}.json`;a.click();break}
    case 'gpro':$('#xfile').click();break;
    case 'import':{const dlg=$('#pdlg');dlg.classList.remove('proj');dlg.innerHTML=`<form method="dialog"><div class="dh"><span>Import JSON</span><button type="button" data-x>×</button></div><div class="db"><div class="hint">Buď vyberte soubor .json, nebo vložte text zkopírovaný z prototypu (⋯ → Export JSON → Kopírovat do schránky). Projekty se přidají k existujícím.</div><div><button type="button" class="btn" data-file>Vybrat soubor…</button></div><textarea name="json" rows="8" placeholder="Sem vložte JSON…" style="width:100%;font:11px monospace;border:1px solid var(--line);border-radius:6px;padding:6px;background:var(--bg);color:inherit"></textarea></div><div class="df"><button type="button" class="btn" data-x>Zavřít</button><button type="submit" class="btn pri">Importovat vložený text</button></div></form>`;
      const fm=dlg.querySelector('form');fm.addEventListener('click',e=>{if(e.target.closest('[data-x]'))dlg.close();if(e.target.closest('[data-file]')){dlg.close();$('#file').click()}});
      fm.addEventListener('submit',e=>{e.preventDefault();try{const j=JSON.parse(fm.elements.json.value.trim());if(!j.projects)throw 0;dlg.close();importJson(j)}catch(err){alert('Text není platný export z aplikace.')}});dlg.showModal();break}
    case 'logout':DB.signOut();break;
    case 'diag':DB.debug().then(d=>{const errs=JSON.parse(localStorage.getItem('projekty-errors')||'[]');$('#pdlg').classList.remove('proj');const txt='Verze aplikace '+APP_VERSION+'\n'+JSON.stringify(d,null,1)+'\n\nPoslední chyby:\n'+(errs.join('\n')||'žádné');const dlg=$('#pdlg');dlg.innerHTML=`<form method="dialog"><div class="dh"><span>Diagnostika</span><button type="button" data-x>×</button></div><div class="db"><textarea rows="14" readonly style="width:100%;font:11px monospace;border:1px solid var(--line);border-radius:6px;padding:6px;background:var(--bg);color:inherit">${esc(txt)}</textarea></div><div class="df"><button type="button" class="btn" data-clr>Smazat historii chyb</button><button type="button" class="btn" data-x>Zavřít</button><button type="button" class="btn pri" data-copy>Kopírovat</button></div></form>`;dlg.querySelector('form').addEventListener('click',e=>{if(e.target.closest('[data-x]'))dlg.close();if(e.target.closest('[data-clr]')){localStorage.removeItem('projekty-errors');dlg.close()}if(e.target.closest('[data-copy]')){navigator.clipboard&&navigator.clipboard.writeText(txt);toast('Zkopírováno')}});dlg.showModal()}).catch(e=>alert('Diagnostika selhala: '+e.message));break;
    case 'pwd':changePassword();break;
    case 'name':{const n=prompt('Vaše jméno (tak, jak je uvedené v týmech projektů):',S.me||'');if(n!==null){S.me=n.trim();DB.setName(S.me).then(()=>toast('Jméno uloženo')).catch(e=>toast(e.message,true));render()}break}
    case 'wipe':if(confirm('Opravdu smazat všechna data? Doporučujeme nejdřív export.')){S={projects:[]};V.project='ALL';commit()}break;
  }});
$('#file').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const j=JSON.parse(r.result);if(!j.projects)throw 0;importJson(j)}catch(err){alert('Soubor nelze načíst – není to export z této aplikace.')}};r.readAsText(f);e.target.value=''};
function importJson(j){const map={};const nid=o=>map[o]||(map[o]=uid());
  for(const p of j.projects){const P={id:nid(p.id),name:p.name,lead:p.lead||'',color:p.color||PALETTE[0],deadline:p.deadline||'',countdown:!!p.countdown,team:[...new Set(p.team||[])],teamLinks:{},_teamIds:{},groups:(p.groups||[]).map(g=>({id:nid(g.id),name:g.name,color:g.color})),members:[],invites:[],access:[],proposals:[],myRole:'lead',created_by:S.meId,tasks:[],todos:[]};
    for(const t of p.tasks||[]){P.tasks.push({id:nid(t.id),name:t.name||'',start:t.start,end:t.end,color:t.color||'',group:(t.group&&(p.groups||[]).some(g=>g.id===t.group))?nid(t.group):'',resp:t.resp||'',collab:t.collab||[],critical:!!t.critical,milestone:!!t.milestone,progress:t.progress||0,autoProg:!!t.autoProg,collapsed:!!t.collapsed,parent:t.parent?nid(t.parent):null,note:t.note||'',unclear:!!t.unclear,question:t.question||'',external:!!t.external,quick:t.quick||'',checked:t.checked||'',deps:(t.deps||[]).map(nid),links:(t.links||[]).map(l=>({id:uid(),name:l.name||'',url:l.url||''})),log:(t.log||[]).map(l=>({id:uid(),d:l.d,text:l.text})),docs:[],todos:(t.todos||[]).map(td=>({...td,id:uid()}))})}
    P.todos=(p.todos||[]).map(td=>({...td,id:uid()}));S.projects.push(P)}
  S.todos.push(...(j.todos||[]).map(td=>({...td,id:uid()})));if(!S.me&&j.me)S.me=j.me;
  V.project='ALL';V.by='project';V.status='';V.person='';V.group='';commit();scrollToToday();toast('Import proběhl – '+j.projects.length+' projektů')}

g.addEventListener('change',e=>{const el=e.target;const row=el.closest('.lrow');if(!row)return;if(g.classList.contains('ro'))return;if(row.dataset.id){const f0=findTask(row.dataset.id);if(f0&&!f0.p._draft&&!taskWritable(f0.t,f0.p)){toast(groupWritable(f0.p,f0.t.group)?'Můžete upravovat jen úkoly, kde jste odpovědný nebo spolupracovník.':'Tuto skupinu máte jen ke čtení.');render();return}}
  if(el.dataset.tf){const f=findTodo(row.dataset.td);if(!f)return;if(myRole(f.p)==='proposer'){toast('ToDo úkolů může upravovat jen tým projektu.');render();return}const k=el.dataset.tf;f.td[k]=k==='done'?el.checked:k==='pri'?+el.value:el.value;if(k==='done')f.td.doneAt=el.checked?TODAY:'';commit();return}
  if(!el.dataset.f)return;const f=findTask(row.dataset.id);if(!f)return;const t=f.t;
  const k=el.dataset.f;let v=el.value;if(k==='msdone'){v=el.checked?100:(t.progress>=100?75:t.progress||0);if(v===100&&openBlocking(t).length){alert('Milník má otevřené blokující ToDo:\n– '+openBlocking(t).map(x=>x.text).join('\n– '));render();return}t.progress=v;commit();return}if(k==='progress'){v=Math.min(100,Math.max(0,+v||0));if(v>=100&&openBlocking(t).length){alert('Úkol má otevřené blokující ToDo:\n– '+openBlocking(t).map(x=>x.text).join('\n– '));render();return}}t[k]=v;commit()});
g.addEventListener('keydown',e=>{const el=e.target;const row=el.closest('.lrow');
  if(el.classList.contains('tt')){
    if(e.key==='Enter'){e.preventDefault();const cpp=proj(V.project);if(cpp&&myRole(cpp)==='proposer'){toast('ToDo úkolů může upravovat jen tým projektu.');return}if(el.dataset.new){const v=el.value.trim();if(!v)return;addTodo(row.dataset.key,v);focusTd=row.dataset.key;commit()}else{const f=findTodo(row.dataset.td);if(!f)return;f.td.text=el.value;if(!el.value.trim()){f.list.splice(f.list.indexOf(f.td),1)}
        // Enter = potvrdit a přejít na další řádek (nebo na „+ položka“); prázdnou položku nezakládáme
        let nx=row.nextElementSibling;while(nx&&!(nx.classList.contains('todo')))nx=null;
        if(nx&&nx.classList.contains('todoadd'))focusTd=nx.dataset.key;else if(nx&&nx.dataset.td)focusTd='td:'+nx.dataset.td;commit()}}
    if(e.key==='Escape')el.blur();
    if(e.key==='Backspace'&&el.value===''&&!el.dataset.new){e.preventDefault();const f=findTodo(row.dataset.td);if(f){f.list.splice(f.list.indexOf(f.td),1);commit()}}
    return}
  if(!el.classList.contains('nm'))return;
  if(e.key==='Enter'){e.preventDefault();const f=findTask(row.dataset.id);f.t.name=el.value;save();if(el.value.trim()&&!isRO(f.p))openTask(row.dataset.id);else commit()}
  if(e.key==='Escape')el.blur();
  if(e.key==='Tab'&&e.altKey){e.preventDefault();findTask(row.dataset.id).t.name=el.value;indent(row.dataset.id,!e.shiftKey)}
  if(e.key==='ArrowDown'&&e.altKey){e.preventDefault();moveTask(row.dataset.id,1)}
  if(e.key==='ArrowUp'&&e.altKey){e.preventDefault();moveTask(row.dataset.id,-1)}
});
g.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;const row=b.closest('.lrow');
  if(b.dataset.act==='ack'){const f=findTask(row.dataset.id);if(f)ackChanges(f.p,unreadOf(f.p,f.t.id).map(c=>c.id));return}
  if(b.dataset.act==='edit')openTask(row.dataset.id,b.classList.contains('nt'));
  if(b.dataset.act==='menu'){const r=b.getBoundingClientRect();openCtx(row.dataset.id,r.left-200,r.bottom+4)}
  if(b.dataset.act==='proj')openProj(row.dataset.pid);
  if(b.dataset.act==='toggle'){const f=findTask(row.dataset.id);f.t.collapsed=!f.t.collapsed;commit()}
  if(b.dataset.act==='open'){const k=row.dataset.key||b.dataset.tkey||row.dataset.id;toggleOpen(k);if(isOpen(k)){const l=todoList(k);if(l&&!l.length)focusTd=k}commit()}
});
g.addEventListener('click',e=>{const b=e.target.closest('[data-tact],[data-tf=block],[data-tf=imp]');if(!b)return;const row=b.closest('.lrow');const f=findTodo(row.dataset.td);if(!f)return;if(myRole(f.p)==='proposer'){toast('ToDo úkolů může upravovat jen tým projektu.');return}
  if(b.dataset.tact==='del'){f.list.splice(f.list.indexOf(f.td),1);commit()}
  if(b.dataset.tact==='tri'){openDump(null,[f.td.id])}
  if(b.dataset.tf==='block'){f.td.block=!f.td.block;commit()}
  if(b.dataset.tf==='imp'){f.td.imp=!f.td.imp;commit()}});
// denní řízení: ToDo „Kontrola …“ (ikona ☐ na baru, dokud není odškrtnuto) a „Dnes zkontrolováno“ (ikona ✓ jen dnes)
// další pořadové číslo v denním seznamu (malé celé číslo – sloupec ord je integer)
// nová položka jde na začátek seznamu (menší než všechna dosavadní pořadí; 0 se vyhýbáme – znamená „bez pořadí“)
const firstOrd=()=>{let m=Infinity;const f=td=>{if(td.ord&&td.ord<m)m=td.ord};S.todos.forEach(f);S.projects.forEach(p=>p.todos.forEach(f));let v=(m===Infinity?1:Math.floor(m))-1;return v===0?-1:v};
const nextOrd=()=>{let m=0;const f=td=>{if(td.ord>m)m=td.ord};S.todos.forEach(f);S.projects.forEach(p=>p.todos.forEach(f));return Math.floor(m)+1};
const todoRefOf=t=>S.todos.find(td=>td.taskRef===t.id&&!td.done);
// rychlá poznámka: ikonka za čtverečkem; prázdná = nenápadná, s textem = žlutý lístek (text v bublině); klepnutí otevře malý editor
function qnote(t,p){if(p._draft)return'';const can=myRole(p)==='lead'||taskWritable(t,p);if(!t.quick&&!can)return'';
  return `<i class="qn ${t.quick?'on':''}" data-qn="${t.id}" ${t.quick?`title="${esc(t.quick)}"`:''}>${t.quick?'✎':'+'}</i>`}
const qnBox=document.createElement('div');qnBox.id='qn';qnBox.innerHTML=`<input placeholder="Rychlá poznámka… (Enter uloží, Esc zavře)" maxlength="300"><button type="button" data-qnx title="">✕</button>`;document.body.appendChild(qnBox);
function openQn(id,x,y){const f=findTask(id);if(!f)return;qnBox.dataset.id=id;const i=qnBox.querySelector('input');i.value=f.t.quick||'';qnBox.querySelector('[data-qnx]').style.display=f.t.quick?'':'none';qnBox.style.display='flex';qnBox.style.left=Math.min(x,innerWidth-340)+'px';qnBox.style.top=Math.min(y+10,innerHeight-50)+'px';i.focus();i.select()}
function closeQn(){qnBox.style.display='none';qnBox.dataset.id=''}
function setQuick(t,v){v=(v||'').trim();if(t.quick&&t.quick!==v){t.log=t.log||[];t.log.push({id:uid(),d:TODAY,text:'Rychlá poznámka: '+t.quick,author:S.meId,authorName:S.me})}t.quick=v}
qnBox.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();const f=findTask(qnBox.dataset.id);if(f){setQuick(f.t,qnBox.querySelector('input').value);commit()}closeQn()}if(e.key==='Escape'){closeQn()}});
qnBox.addEventListener('click',e=>{if(e.target.closest('[data-qnx]')){const f=findTask(qnBox.dataset.id);if(f){setQuick(f.t,'');commit()}closeQn()}});
document.addEventListener('pointerdown',e=>{if(qnBox.style.display!=='none'&&!e.target.closest('#qn,[data-qn]'))closeQn()});
// stáří denní kontroly ve dnech (0 = dnes, 1 = včera, 2 = předevčírem; 3+ = už se nezobrazuje)
const chkAge=t=>{if(!t.checked)return 99;const d=diff(t.checked,TODAY);return d<0?0:d};
const chkOn=t=>chkAge(t)<=2;
function dmark(t,p){if(p._draft||myRole(p)!=='lead')return'';if(t.milestone||progressOf(t,p)>=100)return'';  // milníky a hotové úkoly se denně nekontrolují
  // souhrnný bar (fáze): neklikací, ✓ se doplní samo, jakmile jsou všechny otevřené podřízené úkoly zkontrolované nebo v ToDo
  if(kidsOf(t,p).length){const leaves=descendants(t,p).filter(x=>!kidsOf(x,p).length&&!x.milestone&&progressOf(x,p)<100);if(!leaves.length)return'';const all=leaves.length>0&&leaves.every(x=>todoRefOf(x)||chkOn(x));const age=all?Math.max(...leaves.filter(x=>!todoRefOf(x)).map(chkAge),0):0;return `<i class="dm auto ${all?'chk d'+age:''}">${all?'✓':''}</i>`}
  const ref=todoRefOf(t);const age=chkAge(t);const st=ref?'todo':age<=2?'chk d'+age:'';const over=ref&&ref.due&&ref.due<TODAY;const atit=age===1?'Zkontrolováno včera':age===2?'Zkontrolováno předevčírem':'';
  return `<i class="dm ${st} ${over?'over':''}" data-dchk="${t.id}" ${!ref&&atit?`title="${atit}"`:''}>${ref?'☐':age<=2?'✓':''}</i>`}
function barMenu(id,x,y){const f=findTask(id);if(!f)return;ctx.dataset.t=Date.now();
  ctx.innerHTML=`<button data-op="edit">Detail úkolu</button>`;ctx.classList.add('open');ctx.style.left=Math.min(x,innerWidth-240)+'px';ctx.style.top=Math.min(y,innerHeight-90)+'px';ctx.dataset.id=id}
let lastBarDown={id:null,t:0};
g.addEventListener('dblclick',e=>{const bar=e.target.closest('.bar');if(!bar||!bar.dataset.id||bar.classList.contains('grp')||e.target.closest('[data-dchk],[data-qn]'))return;e.preventDefault();lastBarDown.t=0;openTask(bar.dataset.id)});
g.addEventListener('click',e=>{const q=e.target.closest('[data-qn]');if(!q)return;e.stopPropagation();const f=findTask(q.dataset.qn);if(!f)return;if(!(myRole(f.p)==='lead'||taskWritable(f.t,f.p)))return;const r=q.getBoundingClientRect();openQn(q.dataset.qn,r.left,r.bottom)});
function cycleCheck(id,mode){const f=findTask(id);if(!f||myRole(f.p)!=='lead')return;const t=f.t;const ref=todoRefOf(t);
  const toTodo=()=>{t.checked='';S.todos.push({id:uid(),owner:S.meId,text:'Kontrola '+t.name,who:S.me||'',done:false,doneAt:'',due:TODAY,block:false,pri:0,imp:false,taskRef:t.id,ord:firstOrd()});toast('Přidáno do dnešního ToDo')};
  if(mode==='chk'){if(ref)S.todos.splice(S.todos.indexOf(ref),1);t.checked=TODAY;toast('Dnes zkontrolováno')}
  else if(mode==='todo'){if(!ref)toTodo()}
  else if(ref){S.todos.splice(S.todos.indexOf(ref),1);t.checked='';toast('Kontrola odebrána z ToDo')}
  else if(t.checked&&t.checked!==TODAY&&chkOn(t)){t.checked=TODAY;toast('Dnes zkontrolováno')}
  else if(t.checked===TODAY)toTodo();
  else{t.checked=TODAY;toast('Dnes zkontrolováno')}
  commit()}
g.addEventListener('click',e=>{const sq=e.target.closest('[data-dchk]');if(!sq)return;e.stopPropagation();cycleCheck(sq.dataset.dchk)});
/* ---------- Kontrola: denní průchod úkoly jako frontou ---------- */
const kd=document.createElement('dialog');kd.id='kdlg';kd.tabIndex=-1;document.body.appendChild(kd);let kdSel=null;
function reviewQueue(){const out=[];for(const p of curProjects()){if(myRole(p)!=='lead')continue;for(const t of p.tasks){if(kidsOf(t,p).length||t.milestone||progressOf(t,p)>=100)continue;if(V.person&&t.resp!==V.person&&!(t.collab||[]).includes(V.person))continue;out.push({t,p,st:status(t,p),age:chkAge(t),ref:!!todoRefOf(t)})}}
  const R={late:0,behind:1,risk:2,soon:3,stalled:4,active:5,future:6};
  out.sort((a,b)=>(R[a.st.k]??9)-(R[b.st.k]??9)||b.age-a.age||(a.t.end<b.t.end?-1:1));return out}
function openKontrola(){kd.classList.add('open');renderKontrola();kd.showModal()}
function renderKontrola(){if(!kd.open&&!kd.classList.contains('open'))return;const q=reviewQueue();const todo=q.filter(x=>!(x.age===0||x.ref));const done=q.length-todo.length;
  if(kdSel&&!todo.some(x=>x.t.id===kdSel))kdSel=null;if(!kdSel&&todo.length)kdSel=todo[0].t.id;
  const row=x=>{const t=x.t,p=x.p;const last=(t.log||[]).slice(-1)[0];const pr=progressOf(t,p);
    return `<div class="kr ${kdSel===t.id?'sel':''} st-${x.st.k}" data-id="${t.id}"><i class="dm ${x.age<=2?'chk d'+x.age:''}" data-kchk="${t.id}" title="${x.age===1?'Zkontrolováno včera':x.age===2?'Zkontrolováno předevčírem':''}">${x.age<=2?'✓':''}</i>
      <div class="kn"><b data-kopen="${t.id}">${esc(t.name)}</b><span class="hint">${curProjects().length>1?esc(p.name)+' · ':''}${fmts(t.start)} – ${fmts(t.end)}${t.resp?' · '+esc(t.resp):''}</span>${t.quick?`<span class="kq">✎ ${esc(t.quick)}</span>`:''}${last?`<span class="kl">${fmts(last.d)}: ${esc(last.text.slice(0,120))}</span>`:''}</div>
      ${x.st.l?`<span class="st ${x.st.k}">${x.st.l}</span>`:'<span></span>'}
      <input type="number" class="kp" min="0" max="100" step="5" value="${pr}" data-kprog="${t.id}" ${t.autoProg?'disabled title="Podle checklistu"':''}><span class="pc">%</span>
      <button class="kb" data-ktodo="${t.id}" title="Do ToDo (T)">☐</button><button class="kb" data-kqn="${t.id}" title="Rychlá poznámka (P)">${t.quick?'✎':'+'}</button></div>`};
  kd.innerHTML=`<form method="dialog"><div class="dh"><span>Denní kontrola <span class="hint">· zbývá <b>${todo.length}</b> z ${q.length}${done?` · ${done} dnes hotovo`:''}</span></span><span class="hint kk">↓↑ pohyb · K zkontrolováno · T do ToDo · P poznámka · Enter detail · Esc zavřít</span><button type="button" data-x>×</button></div>
    <div class="db kbody">${todo.length?todo.map(row).join(''):`<div class="dempty">Vše zkontrolováno. ${q.length?'Dnes jste prošel '+q.length+' úkolů.':''}</div>`}</div></form>`;
  const sel=kd.querySelector('.kr.sel');if(sel&&sel.scrollIntoView)sel.scrollIntoView({block:'nearest'});if(!kd.contains(document.activeElement)||!document.activeElement.matches('input'))kd.focus()}
kd.addEventListener('click',e=>{const x=e.target.closest('[data-x]');if(x){kd.classList.remove('open');kd.close();return}
  const r=e.target.closest('.kr');if(r&&!e.target.closest('input,button,[data-kchk],[data-kopen]')){kdSel=r.dataset.id;kd.querySelectorAll('.kr').forEach(k=>k.classList.toggle('sel',k.dataset.id===kdSel))}
  const c=e.target.closest('[data-kchk]');if(c){kdSel=nextInQueue(c.dataset.kchk);cycleCheck(c.dataset.kchk,'chk');return}
  const td=e.target.closest('[data-ktodo]');if(td){kdSel=nextInQueue(td.dataset.ktodo);cycleCheck(td.dataset.ktodo,'todo');return}
  const qn=e.target.closest('[data-kqn]');if(qn){const rc=qn.getBoundingClientRect();openQn(qn.dataset.kqn,rc.left-300,rc.bottom);return}
  const op=e.target.closest('[data-kopen]');if(op){openTask(op.dataset.kopen);return}});
kd.addEventListener('change',e=>{const i=e.target.closest('[data-kprog]');if(!i)return;const f=findTask(i.dataset.kprog);if(!f)return;const v=Math.min(100,Math.max(0,+i.value||0));if(v>=100&&openBlocking(f.t).length){alert('Úkol má otevřené blokující ToDo:\n– '+openBlocking(f.t).map(x=>x.text).join('\n– '));renderKontrola();return}f.t.progress=v;commit()});
function nextInQueue(id){const ids=[...kd.querySelectorAll('.kr')].map(k=>k.dataset.id);const i=ids.indexOf(id);return ids[i+1]||ids[i-1]||null}
kd.addEventListener('keydown',e=>{if(e.target.matches('input')&&!['Escape'].includes(e.key)&&!(e.key==='Enter'))return;const ids=[...kd.querySelectorAll('.kr')].map(k=>k.dataset.id);const i=ids.indexOf(kdSel);
  if(e.key==='ArrowDown'){e.preventDefault();kdSel=ids[Math.min(ids.length-1,i+1)]||kdSel;renderKontrola()}
  else if(e.key==='ArrowUp'){e.preventDefault();kdSel=ids[Math.max(0,i-1)]||kdSel;renderKontrola()}
  else if((e.key==='k'||e.key==='K')&&kdSel){e.preventDefault();const n=nextInQueue(kdSel);const id=kdSel;kdSel=n;cycleCheck(id,'chk')}
  else if((e.key==='t'||e.key==='T')&&kdSel){e.preventDefault();const n=nextInQueue(kdSel);const id=kdSel;kdSel=n;cycleCheck(id,'todo')}
  else if((e.key==='p'||e.key==='P')&&kdSel){e.preventDefault();const b=kd.querySelector(`.kr[data-id="${kdSel}"] [data-kqn]`);if(b){const rc=b.getBoundingClientRect();openQn(kdSel,rc.left-300,rc.bottom)}}
  else if(e.key==='Enter'&&kdSel&&!e.target.matches('input')){e.preventDefault();openTask(kdSel)}
  else if(e.key==='Escape'){kd.classList.remove('open')}});
kd.addEventListener('close',()=>kd.classList.remove('open'));
g.addEventListener('contextmenu',e=>{const el=e.target.closest('.bar[data-id],.lrow[data-id]');if(!el)return;e.preventDefault();openCtx(el.dataset.id,e.clientX,e.clientY)});
g.addEventListener('click',e=>{if(e.target.closest('button,input,select,.bar'))return;const row=e.target.closest('.lrow[data-id]');if(!row)return;$$('.lrow.sel').forEach(r=>r.classList.remove('sel'));sel=row.dataset.id;row.classList.add('sel')});
let drag=null;
g.addEventListener('pointerdown',e=>{const bar=e.target.closest('.bar');if(!bar||!bar.dataset.id||bar.classList.contains('grp')||e.button!==0||e.target.closest('.lbl'))return;
  // dvojí stisk na stejném baru do 400 ms = nabídka (záloha, pokud prohlížeč dblclick po zachycení ukazatele nepošle)
  const now=Date.now();if(lastBarDown.id===bar.dataset.id&&now-lastBarDown.t<400){lastBarDown.t=0;drag=null;openTask(bar.dataset.id);return}lastBarDown={id:bar.dataset.id,t:now};
  if(g.classList.contains('ro'))return;const f=findTask(bar.dataset.id);if(!f)return;if(!f.p._draft&&!taskWritable(f.t,f.p))return;
  const mode=e.target.classList.contains('h-l')?'l':e.target.classList.contains('h-r')?'r':'m';
  drag={bar,t:f.t,mode,x0:e.clientX,start:f.t.start,end:f.t.end,left:parseFloat(bar.style.left),moved:false,px:+g.dataset.px,pid:e.pointerId};
  // preventDefault až při skutečném tažení – jinak prohlížeč nepošle click/dblclick
});
g.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x0;if(Math.abs(dx)>3&&!drag.moved){drag.moved=true;try{drag.bar.setPointerCapture(drag.pid)}catch(_){}}if(!drag.moved)return;e.preventDefault();
  const dd=Math.round(dx/drag.px);const {t,px}=drag;
  if(drag.mode==='m'){drag.bar.style.left=(drag.left+dd*px)+'px';drag.ns=addDays(drag.start,dd);drag.ne=addDays(drag.end,dd)}
  else if(drag.mode==='r'){const d=Math.max(1,diff(drag.start,drag.end)+1+dd);drag.bar.style.width=d*px+'px';drag.ns=drag.start;drag.ne=addDays(drag.start,d-1)}
  else{const d=Math.max(1,diff(drag.start,drag.end)+1-dd);const ns=addDays(drag.end,-(d-1));drag.bar.style.left=(drag.left+diff(drag.start,ns)*px)+'px';drag.bar.style.width=d*px+'px';drag.ns=ns;drag.ne=drag.end}
  const dl=drag.bar.querySelector('.lbl i.dt');if(dl)dl.textContent=`${fmts(drag.ns)} – ${fmts(drag.ne)}`});
const endDrag=e=>{if(!drag)return;const d=drag;drag=null;if(d.moved&&d.ns){d.t.start=d.ns;d.t.end=d.ne;commit()}else if(!d.moved&&e.type==='pointerup'){$$('.lrow.sel').forEach(r=>r.classList.remove('sel'));sel=d.t.id;const r=$(`.lrow[data-id="${d.t.id}"]`);if(r){if(r.scrollIntoView)r.scrollIntoView({block:"nearest"});r.classList.add("sel")}}};
g.addEventListener('pointerup',endDrag);g.addEventListener('pointercancel',endDrag);document.addEventListener('pointerup',e=>{if(drag&&!e.target.closest('.gantt'))drag=null});
document.addEventListener('keydown',e=>{if(e.key==='l'&&!e.ctrlKey&&!e.metaKey&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)&&!$('dialog[open]')){e.preventDefault();openDump()}
  if(e.key==='n'&&!e.ctrlKey&&!e.metaKey&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)&&!$('dialog[open]')){e.preventDefault();$('#quick').focus()}});

/* ---------- auth & init ---------- */
function showAuth(msg){$('#auth').style.display='flex';$('#authmsg').textContent=msg||''}
function hideAuth(){$('#auth').style.display='none'}
async function changePassword(){const p=prompt('Nové heslo (min. 8 znaků):');if(!p)return;try{await DB.updatePassword(p);toast('Heslo změněno')}catch(e){toast(e.message,true)}}
async function boot(){
  {const hv=(document.querySelector('meta[name=app-version]')||{}).content;if(hv&&hv!==APP_VERSION){toast('Stránka je z jiné verze ('+hv+') než aplikace ('+APP_VERSION+') – obnovte ji (Cmd/Ctrl+Shift+R).',true)}}
  const NEED=['saveVersion','claimInvites','setScoped','setInviteScoped','markRead','setTrack'];const miss=NEED.filter(f=>typeof DB[f]!=='function');if(!(DB.SCHEMA>=24))miss.push('SCHEMA 24');if(miss.length){alert('Soubor db.js na serveru je starší než aplikace (chybí: '+miss.join(', ')+'). Nahrajte prosím aktuální db.js z balíčku a obnovte stránku (Cmd/Ctrl+Shift+R).')}
  load();S={me:'',projects:[],todos:[]};
  try{const c=JSON.parse(localStorage.getItem(CACHE));if(c&&c.projects)S=c}catch(e){}
  const u=await DB.init(async user=>{if(user){await start()}else{S={me:'',projects:[],todos:[]};render();showAuth()}});
  if(u)await start();else{render();showAuth()}
}
async function start(){
  hideAuth();$('#gantt').innerHTML='<div class="empty">Načítám data…</div>';
  try{const n=await DB.claimInvites();if(n)toast('Byl jste přidán do '+n+' projektu/ů');S=await DB.load();$('#who').textContent=S.me||S.meEmail;$('#brand').title='verze '+APP_VERSION}
  catch(e){console.error(e);toast('Data se nepodařilo načíst: '+(e.message||e),true)}
  if(V.by==='todo'||V.by==='daily')V.by='project';
  if(innerWidth<=760){V.todoPanel='open';V.hideStrip=true}
  if(proposerOnly()){V.by='project';V.autoDaily=false;if(!proj(V.project)||myRole(proj(V.project))!=='proposer')V.project=S.projects[0].id;restoreDraft();if(!V.draft){const p0=proj(V.project);const pr=(p0.proposals||[]).find(x=>x.status==='open');if(pr)enterDraft(p0,pr)}}
  else{if(V.autoDaily!==false&&V.lastDaily!==TODAY){V.todoPanel='open';V.lastDaily=TODAY}
  if(V.project!=='ALL'&&!proj(V.project))V.project='ALL';
  restoreDraft()}
  document.body.classList.toggle('proposer',proposerOnly());
  save();render();scrollToToday();
  DB.subscribe(async()=>{try{const open=$('dialog[open]');if(open)return;S=await DB.load();restoreDraft();render()}catch(e){}});
}
$('#authform').addEventListener('submit',async e=>{e.preventDefault();const f=e.target;const em=f.email.value.trim(),pw=f.password.value;$('#authmsg').textContent='';
  try{if(f.dataset.mode==='signup'){const {error}=await DB.signUp(em,pw,f.uname.value.trim());if(error)throw error;$('#authmsg').textContent='Účet vytvořen. Pokud je zapnuté potvrzení e-mailu, potvrďte ho a přihlaste se.'}
    else{const {error}=await DB.signIn(em,pw);if(error)throw error}}
  catch(err){const m=err.message||'';$('#authmsg').textContent=m==='Invalid login credentials'?'Nesprávný e-mail nebo heslo.':m.includes('Database error saving new user')?'Účet se nepodařilo založit (chyba databáze). Zkuste to znovu za chvíli, nebo požádejte správce o založení účtu.':m.includes('already registered')?'Tento e-mail už účet má – použijte „Mám účet – přihlásit“.':m}});
$('#authmode').addEventListener('click',()=>{const f=$('#authform');const su=f.dataset.mode!=='signup';f.dataset.mode=su?'signup':'login';$('#pwlabel').textContent=su?'Heslo, kterým se budete přihlašovat (min. 6 znaků)':'Heslo';$('#authsubmit').textContent=su?'Vytvořit účet':'Přihlásit';$('#authmode').textContent=su?'Mám účet – přihlásit':'Nemám účet – zaregistrovat';$('#unamef').style.display=su?'':'none'});
$('#authreset').addEventListener('click',async()=>{const em=$('#authform').email.value.trim();if(!em){$('#authmsg').textContent='Zadejte e-mail.';return}const {error}=await DB.resetPassword(em);$('#authmsg').textContent=error?error.message:'Odkaz pro změnu hesla byl odeslán.'});
boot();

/* ---------- import z GanttPRO (xlsx) ---------- */
function loadScript(src){return new Promise((res,rej)=>{if(document.querySelector(`script[src="${src}"]`))return res();const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error('Knihovnu se nepodařilo načíst'));document.head.appendChild(s)})}
function ganttproToJson(wb){
  const ws=wb.Sheets[wb.SheetNames[0]];const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null});
  const hi=rows.findIndex(r=>r&&r.includes('WBS Number'));if(hi<0)throw new Error('V souboru chybí řádek se sloupci GanttPRO (WBS Number…).');
  const H=rows[hi];const col=n=>{const c=H.indexOf(n);if(c<0)throw new Error('Chybí sloupec '+n);return c};
  const wbs=col('WBS Number'),asg=col('Assigned to'),st=col('Planned start date'),en=col('Planned end date'),pr=col('Progress (%)'),pri=col('Priority'),desc=col('Task description'),typ=col('Type'),lvl=col('Level');
  const pname=(rows[hi-1]&&rows[hi-1][0])||'Projekt';
  const d=v=>{if(v==null||v==='')return null;if(v&&typeof v.getTime==='function')return iso(new Date(v.getTime()-v.getTimezoneOffset()*6e4));if(typeof v==='number'){const o=XLSX.SSF.parse_date_code(v);return `${o.y}-${String(o.m).padStart(2,'0')}-${String(o.d).padStart(2,'0')}`}const m=String(v).match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);if(m)return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;return String(v).slice(0,10)};
  const groups=[],tasks=[],byw={},team=[];const PH=['#9c5bd6','#2196f3','#f39a1e','#1cb36d','#e6b800','#1fb8c4','#a0522d','#5c6bff','#e67ab0','#607d8b'];
  for(const r of rows.slice(hi+1)){if(!r||r[wbs]==null||r[wbs]==='')continue;const w=String(r[wbs]);let name='';for(let c=wbs+1;c<asg;c++)if(r[c]){name=String(r[c]).trim();break}
    const a=String(r[asg]||'').split(',').map(x=>x.trim()).filter(Boolean);a.forEach(x=>{if(!team.includes(x))team.push(x)});
    const t={id:uid(),name,start:d(r[st]),end:d(r[en]),color:'',group:'',resp:a[0]||'',collab:a.slice(1),critical:r[pri]==='Highest',progress:+(r[pr]||0),parent:null,deps:[],milestone:r[typ]==='milestone',collapsed:false,note:String(r[desc]||'').trim(),links:[],log:[],todos:[],docs:[],autoProg:false};
    if(!t.start)t.start=TODAY;if(!t.end)t.end=t.start;
    const level=+(r[lvl]||1);
    if(level===1){const g={id:uid(),name:name.replace(/^\d+\s*·\s*/,''),color:PH[groups.length%PH.length]};groups.push(g);t.group=g.id;t.progress=0}
    else{const par=byw[w.split('.').slice(0,-1).join('.')];if(par){t.parent=par.id;t.group=par.group}}
    byw[w]=t;tasks.push(t)}
  return {projects:[{id:uid(),name:pname,lead:S.me||'',color:PALETTE[(S.projects.length*5)%PALETTE.length],team,groups,tasks,todos:[]}],todos:[]}
}
$('#xfile').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;
  try{await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');const buf=await f.arrayBuffer();const wb=XLSX.read(buf,{cellDates:true});const j=ganttproToJson(wb);
    if(!confirm(`Importovat projekt „${j.projects[0].name}“ (${j.projects[0].tasks.length} úkolů, tým: ${j.projects[0].team.join(', ')||'—'})?`))return;importJson(j)}
  catch(err){toast('Import z GanttPRO selhal: '+(err.message||err),true)}};

/* ---------- přesun úkolů tažením v tabulce ---------- */
(function(){
  let dr=null;const IND=22;
  function rowsInfo(){return $$('.lrow[data-id]').map(el=>{const f=findTask(el.dataset.id);return {el,id:el.dataset.id,t:f.t,p:f.p,depth:depth(f.t,f.p),rect:el.getBoundingClientRect()}})}
  g.addEventListener('pointerdown',e=>{const cn=e.target.closest('.lrow[data-id] .c-n');if(!cn||e.button!==0||V.by!=='project'||g.classList.contains('ro'))return;const row=cn.closest('.lrow');
    dr={id:row.dataset.id,x0:e.clientX,y0:e.clientY,moved:false,rows:null,target:null};e.preventDefault()});
  document.addEventListener('pointermove',e=>{if(!dr)return;
    if(!dr.moved){if(Math.abs(e.clientX-dr.x0)<4&&Math.abs(e.clientY-dr.y0)<4)return;dr.moved=true;const f=findTask(dr.id);dr.src=f;dr.sub=[f.t,...descendants(f.t,f.p)];dr.rows=rowsInfo();
      dr.left=$('.left');dr.line=document.createElement('div');dr.line.className='dropline';dr.left.appendChild(dr.line);dr.ghost=document.createElement('div');dr.ghost.className='dragghost';dr.ghost.textContent=f.t.name||'(bez názvu)';document.body.appendChild(dr.ghost);
      $(`.lrow[data-id="${dr.id}"]`).classList.add('dragsrc');document.body.style.cursor='grabbing'}
    dr.ghost.style.left=(e.clientX+14)+'px';dr.ghost.style.top=(e.clientY-12)+'px';
    const gr=g.getBoundingClientRect();if(e.clientY<gr.top+60)g.scrollTop-=12;else if(e.clientY>gr.bottom-40)g.scrollTop+=12;
    dr.rows=rowsInfo();
    const rows=dr.rows.filter(r=>r.p===dr.src.p&&!dr.sub.includes(r.t));let prev=null;let firstRow=dr.rows.find(r=>r.p===dr.src.p);
    for(const r of rows){if(e.clientY>r.rect.top+r.rect.height/2)prev=r}
    if(prev===null&&firstRow&&e.clientY<firstRow.rect.top+firstRow.rect.height/2){/* před první */}
    const leftRect=dr.left.getBoundingClientRect();
    // přirozená hloubka = podle místa dopadu; vodorovný posun myši od začátku tažení ji mění po úrovních
    let natural=0;if(prev){const after=rows[rows.indexOf(prev)+1];natural=(after&&after.t.parent===prev.t.id)?prev.depth+1:prev.depth}
    let maxD=prev?prev.depth+1:0,d=Math.max(0,Math.min(maxD,natural+Math.round((e.clientX-dr.x0)/IND)));
    if(prev&&prev.t.collapsed&&d>prev.depth)d=prev.depth;
    dr.target={prev,depth:d};
    const y=(prev?prev.rect.bottom:(firstRow?firstRow.rect.top:leftRect.top))-leftRect.top;
    dr.line.style.display='block';dr.line.style.top=(y-1)+'px';dr.lastY=e.clientY;dr.lastX=e.clientX;dr.line.style.left=(44+8+d*IND)+'px';dr.line.style.right='6px'});
  const end=e=>{if(!dr)return;const d=dr;dr=null;if(!d.moved)return;
    d.line.remove();d.ghost.remove();document.body.style.cursor='';$$('.lrow.dragsrc').forEach(r=>r.classList.remove('dragsrc'));
    if(e.type!=='pointerup'||!d.target)return;dropTask(d.src,d.sub,d.target)};
  document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end);
  function dropTask(src,sub,tg){const p=src.p;const a=p.tasks;const rest=a.filter(x=>!sub.includes(x));const t=src.t;
    let parent=null,idx=0;
    if(tg.prev){const P=tg.prev.t;if(tg.depth>tg.prev.depth){parent=P.id;idx=rest.indexOf(P)+1}
      else{let A=P;while(depth(A,p)>tg.depth){A=rest.find(x=>x.id===A.parent)||A}parent=A.parent||null;const ad=descendants(A,p).filter(x=>!sub.includes(x));idx=rest.indexOf(A)+1;while(idx<rest.length&&ad.includes(rest[idx]))idx++}}
    if(parent===t.parent&&rest.indexOf(a[a.indexOf(t)])===-1){/* no-op check below */}
    t.parent=parent;if(parent){const pp=rest.find(x=>x.id===parent);if(pp)pp.collapsed=false}
    rest.splice(idx,0,...sub);p.tasks=rest;sel=t.id;commit();const r=$(`.lrow[data-id="${t.id}"]`);if(r){if(r.scrollIntoView)r.scrollIntoView({block:"nearest"});r.classList.add("sel")}}
})();

/* ---------- posuvný předěl tabulka / graf ---------- */
(function(){let sp=null;
  g.addEventListener('pointerdown',e=>{const h=e.target.closest('.splitter');if(!h)return;e.preventDefault();sp={x0:e.clientX,w0:$('.left').getBoundingClientRect().width,h};h.classList.add('on');document.body.style.cursor='col-resize'});
  document.addEventListener('pointermove',e=>{if(!sp)return;const w=Math.max(260,Math.min(window.innerWidth*.8,sp.w0+e.clientX-sp.x0));V.leftw=Math.round(w);g.style.setProperty('--leftw',V.leftw+'px')});
  const end=()=>{if(!sp)return;sp.h.classList.remove('on');sp=null;document.body.style.cursor='';save()};
  document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end);
})();


/* ---------- Nápověda: zásuvka vlevo, hledání, sbalené skupiny; každou novou funkci doplnit sem ---------- */
const HI={sq:'<i class="dm"></i>',chk:'<i class="dm chk">✓</i>',todo:'<i class="dm todo">☐</i>',qn:'<i class="qn">+</i>',qnon:'<i class="qn on">✎</i>',star:'<b style="color:#e6a700">★</b>',
  tri:'<span style="color:var(--critical)"><svg viewBox="0 0 20 18" width="15" height="13"><path d="M10 1.8 18.6 16.4H1.4Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 6.6v4.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="10" cy="13.5" r="1.1" fill="currentColor"/></svg></span>',
  chg:'<span class="chgtag">✎ 2 změny</span>',late:'<span class="st late">po termínu</span>',behind:'<span class="st behind">skluz</span>',risk:'<span class="st risk">ohrožen</span>',stalled:'<span class="st stalled">nezahájeno</span>',
  tdc:'<span class="tdc open">☐ 0/3</span>',qm:'<span class="qm">?</span>',ms:'<span style="display:inline-block;width:12px;height:12px;background:var(--text);transform:rotate(45deg)"></span>',
  crit:'<span style="display:inline-block;width:22px;height:10px;background:var(--critical);border-radius:2px"></span>',bar:'<span style="display:inline-block;width:22px;height:10px;background:#3b7dd8;border-radius:2px"></span>',
  grab:'<b style="color:var(--muted)">⠿</b>',dot:'<span class="pdot" style="background:#3b7dd8;display:inline-block;width:9px;height:9px;border-radius:50%"></span>',grp:'<span style="display:inline-block;width:22px;height:4px;background:#3b7dd8;border-radius:2px"></span>',
  todayl:'<span style="display:inline-block;width:0;height:14px;border-left:2px dashed var(--today)"></span>',dl:'<span style="display:inline-block;width:0;height:14px;border-left:2px solid var(--critical)"></span>',ext:'<span style="display:inline-block;width:0;height:14px;border-left:2px dashed #7c3aed"></span>',
  ghost:'<span style="display:inline-block;width:22px;height:10px;border:1.5px dashed #d97706;border-radius:2px"></span>',hatch:'<span style="display:inline-block;width:22px;height:10px;background:repeating-linear-gradient(135deg,rgba(217,119,6,.6) 0 3px,transparent 3px 7px)"></span>',
  deps:'<span style="color:var(--muted)">⤳</span>',link:'<span style="color:var(--accent)">⤷</span>',kbd:k=>`<kbd>${k}</kbd>`};
const HELP=[
 {g:'Denní rutina',items:[
  [HI.sq,'Čtvereček denní kontroly','Za barem (jen vedoucí). Klepnutí: '+HI.chk+' dnes zkontrolováno → '+HI.todo+' do mého ToDo („Kontrola …“, drží do odškrtnutí; červený po termínu) → prázdný. ✓ drží 3 dny a slábne; klepnutí na vybledlou ✓ ji obnoví. U fází se ✓ doplní samo, když jsou všechny otevřené podúkoly zkontrolované nebo v ToDo. Hotové úkoly a milníky čtvereček nemají.'],
  ['<b>Kontrola 14</b>','Denní kontrola (fronta)','Tlačítko v záhlaví otevře seznam otevřených úkolů seřazený podle naléhavosti (po termínu → skluz → ohrožené → končí brzy → nezahájené → nejdéle nekontrolované). V řádku: ✓, název (klepnutí = detail), stav, %, do ToDo, poznámka, poslední záznam deníku. Zkontrolované řádky mizí, nahoře „zbývá X z Y“. Klávesy: ↓↑, K zkontrolováno, T do ToDo, P poznámka, Enter detail, Esc zavřít.'],
  [HI.qn,'Rychlá poznámka','„+“ za čtverečkem otevře jednořádkový editor (Enter uloží, Esc zavře). Uložená poznámka je '+HI.qnon+', text v bublině. Při přepsání nebo zrušení se předchozí text sám zapíše do deníku úkolu s datem.'],
  ['<b>ToDo 6</b>','ToDo panel','Tlačítko vpravo nahoře (počet otevřených · po termínu). Plovoucí panel v pravém horním rohu: – zmenší na lištu, ✕ zavře, Esc zmenší. Nová položka jde nahoru, mimo projekty, bez priority; „Nadpis“ založí nadpis skupiny. Enter v položce založí další pod ní, Backspace v prázdné ji smaže. Vložení více řádků = více položek.'],
  [HI.star+' '+HI.tri,'Priorita a důležitost','★ důležité (klepnutím). Trojúhelník: šedý bez priority → červený A → oranžový B → zelený C → bez. ⋯ u položky: termín (dnes/zítra/za týden), projekt a úkol, blokuje úkol, smazat.'],
  ['📞 ✉️ 💬','Telefonát / e-mail / SMS / WhatsApp z ToDo','Zadání „tel Kozák – termín“, „mail Jandová: smlouva“, „sms Míka …“ nebo „wa Míka …“ označí položku a uloží jméno kontaktu (upravit v ⋯). Klepnutí na ikonu spustí zkratku „Zavolat“ / „Napsat“ / „SMS“ / „WhatsApp“ v aplikaci Zkratky (Mac i iPhone), která najde osobu v Kontaktech a vytočí ji / otevře zprávu s textem položky; jméno je zároveň ve schránce. Shift+klepnutí přepíná druh. Názvy zkratek v menu ⋯.'],
 ['📱','iPhone','Na úzké obrazovce se po přihlášení otevře rovnou ToDo panel přes celou obrazovku (harmonogram zůstává dostupný po zavření panelu, ale pro mobil je příliš široký).'],
 [HI.grab,'Přetažení v ToDo','Za ⠿ mění pořadí; nadpis bere s sebou položky pod ním až po další nadpis. Termín přetažení nemění.'],
  ['<b>L</b> / <b>N</b>','Zkratky','L – seznam „co mám v hlavě“ (ranní vysypání a roztřídění), N – nový úkol do harmonogramu, Delete – smazat vybraný úkol, Ctrl+C/V/D kopírovat, vložit, duplikovat, Alt+↑↓ posun, Alt+Tab zanořit.'],
 ]},
 {g:'Harmonogram',items:[
  [HI.bar,'Bar úkolu','Tažením posun, za okraje změna délky. Dvojklik otevře detail. Pravé tlačítko: detail, k upřesnění, skupina pro fázi, přidat/kopírovat/vložit/duplikovat, posun, zanoření, smazat. Tmavší část = plnění v %.'],
  [HI.grp,'Fáze (souhrnný bar)','Úkol s podúkoly: tenký bar od prvního do posledního podúkolu, % jako průměr. „Skupina (barva) pro celou fázi…“ přebarví všechny podúkoly.'],
  [HI.ms,'Milník','Jednodenní kosočtverec; zaškrtnutím splněn (vyžaduje uzavřené blokující ToDo).'],
  [HI.crit,'Kritický úkol','Vždy sytě červený bez ohledu na skupinu; po 100 % se vrátí k barvě skupiny.'],
  [HI.late+' '+HI.behind,'Stavy','Po termínu = konec uplynul a není 100 %. Ve skluzu = termín běží, ale % je nižší, než odpovídá uplynulé části (≥ 1 den, ≥ 5 b.). Dále '+HI.risk+' (blokující ToDo po termínu), '+HI.stalled+' (2 dny po startu a 0 %), „končí do 7 dnů“, „běží“. Filtry v liště ukazují počty.'],
  [HI.todayl+' '+HI.dl+' '+HI.ext,'Svislé linky','Čárkovaná červená = dnes. Plná červená s '+FLAME.replace('class="flame"','class="flame" style="color:var(--critical)"')+' = deadline projektu (Nastavení projektu; úkoly ho mohou přesahovat; volitelně odpočet v záhlaví). Fialová čárkovaná = cizí termín (zaškrtnutí „Cizí termín“ v detailu úkolu/milníku; název v časové ose) – zobrazí se jen po zapnutí pilulky „┆ Cizí termíny“ v liště, jako Vazby.'],
  [HI.chg,'Změny od kolegů','Žlutý štítek u úkolu a žlutý proužek řádku: co se změnilo, kdo, kdy (bublina). „Vzít na vědomí“ u štítku, nebo hromadně ve filtru „Nové změny“. Vedoucí může změnu vrátit. Vypnout lze v menu ⋯ (Sledování změn).'],
  [HI.ghost+' '+HI.hatch,'Posun termínu (nepřečtený)','Oranžový čárkovaný rámeček = původní rozsah, šrafování = ubrané dny, oranžový proužek = přidané dny, štítek „⟲ posun +3 d“ (bublina „Původně … → nyní …“). Zmizí po vzetí na vědomí.'],
  [HI.deps,'Vazby','V detailu úkolu „Předchůdci“. Tenké šedé čárkované šipky; tlačítko „Vazby“ v liště je zvýrazní a ztlumí ostatní.'],
  [HI.tdc,'Checklist úkolu','▸ u úkolu rozbalí podúkoly (ToDo úkolu); odznak hotovo/celkem – modrý s otevřenými, červený po termínu, šedý vše hotovo. ⛔ = položka blokuje dokončení. „Hotovost % počítat z checklistu“ v detailu.'],
  [HI.qm,'K upřesnění','Označení nejasného úkolu s otázkou; filtr „K upřesnění“; v pravém tlačítku zapnout/zrušit.'],
  [HI.link,'ToDo z kontroly','Položka „Kontrola …“ v ToDo má vpravo kroužek s % plnění úkolu (název úkolu v bublině).'],
  ['<b>⋯</b>','Zobrazení','V menu ⋯: „Levá tabulka“ přepíná plná → úzká → skrytá (jen Gantt); šířku lze táhnout za její okraj. „Lišta rychlých filtrů“ ji skryje/zobrazí (filtry platí dál). Den/Týden/Měsíc = měřítko, „Dnes“ posune graf na dnešek. „Podle lidí“ seskupí úkoly podle odpovědných.'],
  [HI.dot,'Barvy','Barva úkolu vychází ze skupiny (Nastavení projektu → skupiny); v detailu lze zvolit vlastní. Klepnutí na čtvereček barvy v řádku otevře detail. Legenda skupin v záhlaví projektu filtruje skupinu.'],
 ]},
 {g:'Role a sdílení',items:[
  ['<b>vedoucí</b>','Vedoucí projektu','Vše: úkoly, tým, skupiny, pozvánky, schvalování návrhů, vrácení změn, denní kontrola.'],
  ['<b>řešitel</b>','Řešitel','Upravuje úkoly, kde je odpovědný nebo spolupracovník (jméno v týmu musí být spojené s účtem). Volitelně omezen na skupiny (čtení a úpravy / jen čtení).'],
  ['<b>navrhovatel</b>','Navrhovatel','Vidí jen přidělené skupiny, úpravy dělá ve společném návrhu skupiny (modrá lišta). Vedoucí návrh schválí a promítne, nebo zamítne; verze návrhu lze ukládat, porovnat a obnovit.'],
  ['<b>čtenář</b>','Čtenář','Jen čtení, bez ToDo projektu.'],
  ['<b>⋯</b>','Menu','Nastavení projektu (tým, skupiny, deadline), nový projekt, ranní ToDo, bublina u názvu a baru, sledování změn, seznam „co mám v hlavě“, jméno, heslo, diagnostika, export/import JSON, import z GanttPRO.'],
 ]},
];
const hd=document.createElement('div');hd.id='help';document.body.appendChild(hd);
function openHelp(){hd.classList.toggle('open');if(hd.classList.contains('open')){renderHelp('');setTimeout(()=>{const i=$('#hq');if(i)i.focus()},0)}}
function renderHelp(q){q=(q||'').trim().toLowerCase();const strip=h=>h.replace(/<[^>]+>/g,' ').toLowerCase();
  let h=`<div class="hh"><b>Nápověda</b><span class="hint">verze ${APP_VERSION}</span><span class="sp"></span><button data-hx>✕</button></div><div class="hs"><input id="hq" placeholder="Hledat… (název funkce, ikona, slovo)" value="${esc(q)}" autocomplete="off"></div><div class="hb">`;
  for(const g of HELP){const items=g.items.filter(([i,t,d])=>!q||(t+' '+strip(d)+' '+strip(i)).toLowerCase().includes(q));if(!items.length)continue;
    h+=`<details ${q?'open':''}><summary>${esc(g.g)} <span class="hint">${items.length}</span></summary>${items.map(([i,t,d])=>`<div class="hi"><span class="ic">${i}</span><div><b>${esc(t)}</b><p>${d}</p></div></div>`).join('')}</details>`}
  h+=`</div>`;hd.innerHTML=h;const inp=$('#hq');inp.addEventListener('input',()=>{const v=inp.value;const pos=inp.selectionStart;renderHelp(v);const i2=$('#hq');i2.focus();i2.setSelectionRange(pos,pos)})}
hd.addEventListener('click',e=>{if(e.target.closest('[data-hx]'))hd.classList.remove('open')});
document.addEventListener('keydown',e=>{if(e.key==='?'&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)&&!$('dialog[open]')){e.preventDefault();openHelp()}if(e.key==='Escape'&&hd.classList.contains('open')&&!$('dialog[open]'))hd.classList.remove('open')});

/* ---------- okamžitá bublina ---------- */
(function(){const tip=document.createElement('div');tip.id='tip';document.body.appendChild(tip);
  const show=(el,e)=>{tip.innerHTML=el.dataset.tip;tip.style.display='block';move(e)};
  const move=e=>{const r=tip.getBoundingClientRect();let x=e.clientX+14,y=e.clientY+16;if(x+r.width>innerWidth-8)x=e.clientX-r.width-10;if(y+r.height>innerHeight-8)y=e.clientY-r.height-10;tip.style.left=x+'px';tip.style.top=y+'px'};
  // každý title v aplikaci se při prvním najetí převede na okamžitou bublinu (data-tip); nativní zpožděný tooltip se tím vypne
  const adopt=el=>{if(el&&!el.dataset.tip&&el.getAttribute('title')){el.dataset.tip=esc(el.getAttribute('title'));el.removeAttribute('title')}return el};
  document.addEventListener('pointerover',e=>{if(!e.target.closest)return;const el=adopt(e.target.closest('[data-tip],[title]'));if(el&&el.dataset.tip)show(el,e)});
  document.addEventListener('pointermove',e=>{if(tip.style.display==='block'){if(!e.target.closest('[data-tip]'))tip.style.display='none';else move(e)}});
  document.addEventListener('pointerout',e=>{if(e.target.closest&&e.target.closest('[data-tip]')&&!(e.relatedTarget&&e.relatedTarget.closest&&e.relatedTarget.closest('[data-tip]')))tip.style.display='none'});
  document.addEventListener('pointerdown',()=>tip.style.display='none');
})();
