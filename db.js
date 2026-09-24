/* db.js — datová vrstva nad Supabase.
   Aplikace pracuje s objektem S (stejný tvar jako prototyp); DB.load() ho sestaví z tabulek,
   DB.sync(S) porovná se snímkem posledního stavu a pošle jen rozdíly (upsert / delete). */
const DB = (() => {
  const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  let user = null, prev = null, lastWrite = 0, onRemote = null, channel = null;
  const uuid = () => crypto.randomUUID();
  const chunk = (a, n = 200) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  /* ---------- auth ---------- */
  async function init(cb) {
    const { data: { session } } = await sb.auth.getSession();
    user = session?.user || null;
    sb.auth.onAuthStateChange((_e, s) => { const u = s?.user || null; const changed = (u?.id) !== (user?.id); user = u; if (changed) cb(user); });
    return user;
  }
  const signIn = (email, password) => sb.auth.signInWithPassword({ email, password });
  const signUp = (email, password, name) => sb.auth.signUp({ email, password, options: { data: { name } } });
  const signOut = () => sb.auth.signOut();
  const resetPassword = (email) => sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  const updatePassword = (password) => sb.auth.updateUser({ password });
  const me = () => user;
  const debug = async () => { const { data: { session } } = await sb.auth.getSession(); const r = await sb.rpc('whoami'); return { jsUser: session?.user?.id, jsEmail: session?.user?.email, db: r.data, dbError: r.error?.message }; };
  const setName = (name) => sb.from('profiles').update({ name }).eq('id', user.id).then(({ error }) => { if (error) throw error; });

  /* ---------- načtení ---------- */
  async function load() {
    const q = async (t, sel = '*', order) => { let r = sb.from(t).select(sel); if (order) r = r.order(order); const { data, error } = await r; if (error) throw error; return data || []; };
    const [profiles, projects, members, invites, team, groups, tasks, links, log, docs, todos, access, proposals, ptasks] = await Promise.all([
      q('profiles'), q('projects', '*', 'created_at'), q('project_members'), q('project_invites'), q('project_team', '*', 'sort'),
      q('task_groups', '*', 'sort'), q('tasks', '*', 'sort'), q('task_links', '*', 'sort'), q('task_log', '*', 'created_at'),
      q('documents', '*', 'created_at'), q('todos', '*', 'sort'), q('group_access'), q('proposals', '*', 'created_at'), q('proposal_tasks', '*', 'sort')]);
    const prof = Object.fromEntries(profiles.map(p => [p.id, p]));
    const myProfile = prof[user.id] || { name: user.email.split('@')[0], email: user.email };
    const S = { me: myProfile.name || '', meId: user.id, meEmail: user.email, profiles: prof, projects: [], todos: [] };
    const byTask = {}; const tMap = {};
    for (const p of projects) {
      const pt = team.filter(x => x.project_id === p.id);
      const P = {
        id: p.id, name: p.name, lead: p.lead_name || '', color: p.color, archived: p.archived, created_by: p.created_by,
        team: pt.map(x => x.name), _teamIds: Object.fromEntries(pt.map(x => [x.name, x.id])), teamLinks: Object.fromEntries(pt.filter(x => x.user_id).map(x => [x.name, x.user_id])),
        groups: groups.filter(g => g.project_id === p.id).map(g => ({ id: g.id, name: g.name, color: g.color })),
        members: members.filter(m => m.project_id === p.id).map(m => ({ user_id: m.user_id, role: m.role, email: prof[m.user_id]?.email || '?', name: prof[m.user_id]?.name || '' })),
        invites: invites.filter(i => i.project_id === p.id).map(i => ({ email: i.email, role: i.role, access: i.access || [] })),
        access: access.filter(a => a.project_id === p.id).map(a => ({ user_id: a.user_id, group_id: a.group_id, can_edit: !!a.can_edit })),
        myRole: (members.find(m => m.project_id === p.id && m.user_id === user.id) || {}).role || (p.created_by === user.id ? 'lead' : ''),
        proposals: [], tasks: [], todos: []
      };
      const rows = tasks.filter(t => t.project_id === p.id);
      // seřadit do stromového pořadí (rodič → potomci) podle sort
      const kids = {}; rows.forEach(t => { (kids[t.parent_id || 'root'] ||= []).push(t); });
      Object.values(kids).forEach(a => a.sort((x, y) => x.sort - y.sort));
      const walk = (pid) => (kids[pid] || []).forEach(t => { P.tasks.push(conv(t)); walk(t.id); });
      const conv = t => { const T = {
        id: t.id, name: t.name, start: t.start_date, end: t.end_date, color: t.color || '', group: t.group_id || '', resp: t.resp || '', collab: t.collab || [],
        critical: !!t.critical, milestone: !!t.milestone, progress: t.progress || 0, autoProg: !!t.auto_prog, collapsed: !!t.collapsed, parent: t.parent_id || null,
        note: t.note || '', deps: t.deps || [], created_by: t.created_by, unclear: !!t.unclear, question: t.question || '',
        links: links.filter(l => l.task_id === t.id).map(l => ({ id: l.id, name: l.name, url: l.url })),
        log: log.filter(l => l.task_id === t.id).map(l => ({ id: l.id, d: l.d, text: l.text, author: l.author, authorName: prof[l.author]?.name || '' })),
        docs: docs.filter(d => d.task_id === t.id).map(d => ({ id: d.id, name: d.name, path: d.path, size: d.size, uploaded_by: d.uploaded_by, created_at: d.created_at })),
        todos: [] }; tMap[t.id] = T; return T; };
      walk('root');
      for (const pr of proposals.filter(x => x.project_id === p.id && x.status === 'open')) {
        const rows2 = ptasks.filter(t => t.proposal_id === pr.id); const k2 = {}; rows2.forEach(t => { (k2[t.parent_id || 'root'] ||= []).push(t); });
        Object.values(k2).forEach(a => a.sort((x, y) => x.sort - y.sort));
        const PT = []; const walk2 = (pid) => (k2[pid] || []).forEach(t => { PT.push({ id: t.id, orig: t.orig_task_id || null, name: t.name, start: t.start_date, end: t.end_date, color: t.color || '', group: t.group_id || '', resp: t.resp || '', collab: t.collab || [], critical: !!t.critical, milestone: !!t.milestone, progress: t.progress || 0, collapsed: !!t.collapsed, parent: t.parent_id || null, note: t.note || '', deps: t.deps || [], unclear: !!t.unclear, question: t.question || '', links: [], log: [], docs: [], todos: [], _draft: true }); walk2(t.id); });
        walk2('root');
        P.proposals.push({ id: pr.id, group: pr.group_id, status: pr.status, note: pr.note || '', created_by: pr.created_by, createdName: prof[pr.created_by]?.name || '', created_at: pr.created_at, tasks: PT });
      }
      S.projects.push(P);
    }
    const pMap = Object.fromEntries(S.projects.map(p => [p.id, p]));
    for (const td of todos) {
      const T = { id: td.id, owner: td.owner, text: td.text, who: td.who || '', done: !!td.done, doneAt: td.done_at || '', due: td.due || '', block: !!td.block, pri: td.pri || 2, imp: !!td.imp };
      if (td.task_id && tMap[td.task_id]) tMap[td.task_id].todos.push(T);
      else if (td.project_id && pMap[td.project_id]) pMap[td.project_id].todos.push(T);
      else if (td.owner === user.id) S.todos.push(T);
    }
    prev = flatten(S);
    return S;
  }

  /* ---------- rozložení stavu na řádky tabulek ---------- */
  function flatten(S) {
    const F = { projects: {}, team: {}, groups: {}, tasks: {}, links: {}, log: {}, todos: {}, proposals: {}, ptasks: {} };
    let sortT = 0;
    for (const p of S.projects) {
      F.projects[p.id] = { id: p.id, name: p.name, lead_name: p.lead || '', color: p.color, archived: !!p.archived, created_by: p.created_by || user.id };
      p._teamIds ||= {}; p.teamLinks ||= {};
      p.team.forEach((name, i) => { const id = p._teamIds[name] ||= uuid(); F.team[id] = { id, project_id: p.id, name, user_id: p.teamLinks[name] || null, sort: i }; });
      p.groups.forEach((g, i) => { F.groups[g.id] = { id: g.id, project_id: p.id, name: g.name, color: g.color, sort: i }; });
      const live = p._draft ? p._liveTasks : p.tasks;
      live.forEach((t, i) => {
        F.tasks[t.id] = { id: t.id, project_id: p.id, parent_id: t.parent || null, sort: i, name: t.name || '', start_date: t.start, end_date: t.end, group_id: t.group || null, color: t.color || '',
          resp: t.resp || '', collab: t.collab || [], critical: !!t.critical, milestone: !!t.milestone, progress: t.progress || 0, auto_prog: !!t.autoProg, collapsed: !!t.collapsed, note: t.note || '', deps: t.deps || [], created_by: t.created_by || user.id, unclear: !!t.unclear, question: t.question || '' };
        (t.links || []).forEach((l, j) => { l.id ||= uuid(); F.links[l.id] = { id: l.id, task_id: t.id, name: l.name || '', url: l.url || '', sort: j }; });
        (t.log || []).forEach(l => { l.id ||= uuid(); F.log[l.id] = { id: l.id, task_id: t.id, d: l.d, text: l.text, author: l.author || user.id }; });
        (t.todos || []).forEach((td, j) => { F.todos[td.id] = todoRow(td, p.id, t.id, j); });
      });
      p.todos.forEach((td, j) => { F.todos[td.id] = todoRow(td, p.id, null, j); });
      for (const pr of (p.proposals || [])) {
        F.proposals[pr.id] = { id: pr.id, project_id: p.id, group_id: pr.group, status: pr.status || 'open', note: pr.note || '', created_by: pr.created_by || user.id };
        if (pr.status !== 'open') continue;
        const pts = p._draft === pr.id ? p.tasks : pr.tasks;
        pts.forEach((t, i) => { F.ptasks[t.id] = { id: t.id, proposal_id: pr.id, project_id: p.id, orig_task_id: t.orig || null, parent_id: t.parent || null, sort: i, name: t.name || '', start_date: t.start, end_date: t.end, group_id: t.group || null, color: t.color || '', resp: t.resp || '', collab: t.collab || [], critical: !!t.critical, milestone: !!t.milestone, progress: t.progress || 0, collapsed: !!t.collapsed, note: t.note || '', deps: t.deps || [], unclear: !!t.unclear, question: t.question || '' }; });
      }
    }
    S.todos.forEach((td, j) => { F.todos[td.id] = todoRow(td, null, null, j); });
    return F;
  }
  const todoRow = (td, pid, tid, sort) => ({ id: td.id, owner: td.owner || user.id, project_id: pid, task_id: tid, text: td.text || '', who: td.who || '', done: !!td.done, done_at: td.doneAt || null, due: td.due || null, block: !!td.block, pri: td.pri || 2, imp: !!td.imp, sort });

  /* ---------- synchronizace rozdílů ---------- */
  const TABLES = { projects: 'projects', team: 'project_team', groups: 'task_groups', tasks: 'tasks', links: 'task_links', log: 'task_log', todos: 'todos', proposals: 'proposals', ptasks: 'proposal_tasks' };
  const ORDER = ['projects', 'team', 'groups', 'tasks', 'links', 'log', 'todos', 'proposals', 'ptasks'];
  let syncing = null;
  async function sync(S) {
    if (!user) return;
    if (syncing) { await syncing; }
    syncing = (async () => {
      const next = flatten(S); const old = prev || {};
      lastWrite = Date.now();
      for (const k of ORDER) {
        const ups = Object.values(next[k]).filter(r => !same(r, (old[k] || {})[r.id]));
        // úkoly: rodiče před potomky (pole už je ve stromovém pořadí, jen zachovat)
        for (const c of chunk(ups)) { const { error } = await sb.from(TABLES[k]).upsert(c); if (error) throw new Error(`[${TABLES[k]}] ${error.message}${error.details ? ' – ' + error.details : ''}`); }
      }
      for (const k of [...ORDER].reverse()) {
        const dels = Object.keys(old[k] || {}).filter(id => !next[k][id]);
        for (const c of chunk(dels)) { const { error } = await sb.from(TABLES[k]).delete().in('id', c); if (error && error.code !== 'PGRST116') throw new Error(`[${TABLES[k]} delete] ${error.message}`); }
      }
      prev = next; lastWrite = Date.now();
    })();
    try { await syncing; } finally { syncing = null; }
  }

  /* ---------- členové projektu ---------- */
  async function addMember(projectId, email, role) {
    const { data: prof } = await sb.from('profiles').select('id').ilike('email', email).maybeSingle();
    if (prof) { const { error } = await sb.from('project_members').upsert({ project_id: projectId, user_id: prof.id, role }); if (error) throw error; return 'member'; }
    const { error } = await sb.from('project_invites').upsert({ project_id: projectId, email: email.toLowerCase(), role }); if (error) throw error; return 'invite';
  }
  async function setRole(projectId, userId, role) { const { error } = await sb.from('project_members').update({ role }).match({ project_id: projectId, user_id: userId }); if (error) throw error; }
  async function removeMember(projectId, userId) { const { error } = await sb.from('project_members').delete().match({ project_id: projectId, user_id: userId }); if (error) throw error; }
  async function removeInvite(projectId, email) { const { error } = await sb.from('project_invites').delete().match({ project_id: projectId, email }); if (error) throw error; }

  async function setAccess(projectId, groupId, userId, mode) { // mode: '' | 'read' | 'edit'
    if (!mode) { const { error } = await sb.from('group_access').delete().match({ group_id: groupId, user_id: userId }); if (error) throw error; return; }
    const { error } = await sb.from('group_access').upsert({ project_id: projectId, group_id: groupId, user_id: userId, can_edit: mode === 'edit' }); if (error) throw error;
  }
  async function setInviteAccess(projectId, email, access) { const { error } = await sb.from('project_invites').update({ access }).match({ project_id: projectId, email }); if (error) throw error; }
  async function setInviteRole(projectId, email, role) { const { error } = await sb.from('project_invites').update({ role }).match({ project_id: projectId, email }); if (error) throw error; }
  async function decideProposal(id, status) { const { error } = await sb.from('proposals').update({ status, decided_by: user.id, decided_at: new Date().toISOString() }).eq('id', id); if (error) throw error; }

  /* ---------- dokumenty ---------- */
  async function uploadDoc(projectId, taskId, file) {
    const path = `${projectId}/${taskId || 'inbox'}/${uuid()}-${file.name.replace(/[^\w.\-]+/g, '_')}`;
    const { error } = await sb.storage.from('task-files').upload(path, file, { upsert: false }); if (error) throw error;
    const row = { id: uuid(), project_id: projectId, task_id: taskId || null, name: file.name, path, size: file.size, mime: file.type, uploaded_by: user.id };
    const { error: e2 } = await sb.from('documents').insert(row); if (e2) throw e2;
    return { ...row, created_at: new Date().toISOString() };
  }
  async function docUrl(path) { const { data, error } = await sb.storage.from('task-files').createSignedUrl(path, 3600); if (error) throw error; return data.signedUrl; }
  async function deleteDoc(doc) { await sb.storage.from('task-files').remove([doc.path]); const { error } = await sb.from('documents').delete().eq('id', doc.id); if (error) throw error; }

  /* ---------- realtime ---------- */
  function subscribe(cb) {
    onRemote = cb; if (channel) return;
    let timer = null;
    const handler = () => { if (Date.now() - lastWrite < 2500) return; clearTimeout(timer); timer = setTimeout(() => onRemote && onRemote(), 1200); };
    channel = sb.channel('projekty')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, handler)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, handler)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_log' }, handler)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'proposal_tasks' }, handler)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'proposals' }, handler)
      .subscribe();
  }

  return { setAccess, setInviteAccess, setInviteRole, decideProposal, debug, init, signIn, signUp, signOut, resetPassword, updatePassword, setName, me, load, sync, addMember, setRole, removeMember, removeInvite, uploadDoc, docUrl, deleteDoc, subscribe, uuid };
})();
