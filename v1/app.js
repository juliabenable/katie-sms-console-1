/* Benable SMS Console prototype. State = SEED + localStorage overlay. */
const LS_KEY = 'katie-sms-console-v1-app';

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY));
    if (saved && saved.v === 1 && saved.gen === SEED.gen && saved.matrix && saved.sends7d && saved.stats) return saved;
  } catch (e) {}
  return {
    v: 1,
    gen: SEED.gen,
    messages: JSON.parse(JSON.stringify(SEED.messages)),
    flags: JSON.parse(JSON.stringify(SEED.flags)),
    ladders: JSON.parse(JSON.stringify(SEED.ladders)),
    matrix: JSON.parse(JSON.stringify(SEED.matrix)),
    sends7d: JSON.parse(JSON.stringify(SEED.sends7d)),
    stats: JSON.parse(JSON.stringify(SEED.stats)),
    simCount: 0,
  };
}
let S = loadState();
const save = () => localStorage.setItem(LS_KEY, JSON.stringify(S));
const creators = SEED.creators;
const byId = id => creators.find(c => c.id === id);
const openFlags = () => S.flags.filter(f => f.status === 'open');
const flagFor = cid => openFlags().find(f => f.creatorId === cid);

const $ = s => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let activeTab = 'feed';
let activeLadder = 'product';
let drawerCreator = null;

function nowStamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  let h = d.getHours() % 12 || 12;
  return { t: `Today, ${h}:${p(d.getMinutes())}${d.getHours() < 12 ? 'a' : 'p'}`,
           ts: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` };
}

function toast(msg, slack) {
  const t = el('div', 'toast' + (slack ? ' slack' : ''), msg);
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), slack ? 5200 : 3400);
}

/* ---------- feed ---------- */
function renderFeed() {
  const brand = $('#f-brand').value, sender = $('#f-sender').value, q = $('#f-search').value.toLowerCase();
  const list = $('#feedlist'); list.innerHTML = '';
  const msgs = [...S.messages].sort((a, b) => b.ts.localeCompare(a.ts));
  let n = 0;
  const flagShown = new Set();
  for (const m of msgs) {
    const c = byId(m.creatorId); if (!c) continue;
    if (brand && c.brand !== brand) continue;
    if (sender === 'line:tony') { if (m.line !== 'tony') continue; }
    else if (sender && m.author !== sender) continue;
    if (q && !(m.body.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))) continue;
    let fl = flagFor(c.id);
    if (fl && flagShown.has(c.id)) fl = null;
    if (fl) flagShown.add(c.id);
    const row = el('button', 'crow' + (fl ? ' flagged' : ''));
    const whoLabel = m.author === 'katie' ? (m.senderName ? esc(m.senderName.split(' ')[0].toLowerCase()) : 'team') : m.author;
    row.innerHTML = `<span class="av">${c.initials}</span>
      <span class="main"><span class="l1"><span class="name">${esc(c.name)}</span><span class="bchip">${esc(c.brand)}</span>${m.line === 'tony' ? '<span class="linechip">Tony’s line</span>' : ''}${fl ? '<span class="flagpill">needs you</span>' : ''}<span class="l1right"><span class="who-chip ${m.author}">${whoLabel}</span><span class="t">${m.t}</span></span></span>
      <span class="snippet">${esc(m.body)}</span></span>`;
    row.addEventListener('click', () => openDrawer(c.id));
    list.appendChild(row); n++;
  }
  if (!n) list.appendChild(el('div', 'feed-empty', 'No texts match these filters.'));
}

/* ---------- flags ---------- */
function draftHTML(f) {
  let d = esc(f.draft);
  if (f.suspect) {
    const m = esc(f.suspect);
    d = d.replace(m, `<mark title="${esc(f.suspectWhy || '')}">${m}</mark>`);
  }
  return d;
}
function flagCardHTML(f, forDrawer) {
  const held = f.heldBody ? `<div class="fc-held"><b>HELD · ${esc(f.heldIntent)}</b><br>${esc(f.heldBody)}</div>` : '';
  return `<div class="fc-reason">Held: ${esc(f.reason)}</div>
    <div class="fc-sub">${esc(f.reasonText)} <span style="white-space:nowrap;">Held since ${esc(f.since)}.</span></div>${held}
    <div class="fc-draft" data-draft="${f.id}">${draftHTML(f)}</div>${f.suspect ? `<div class="suspectwhy">⚠ ${esc(f.suspectWhy)}</div>` : ''}
    <div class="fc-actions">
      <button class="btn primary" data-approve="${f.id}">Approve &amp; send</button>
      <button class="btn ghost" data-edit="${f.id}">Edit</button>
      <button class="btn quiet" data-dismiss="${f.id}">Dismiss</button>
      <span class="fc-editing-hint" data-hint="${f.id}" hidden>editing, Approve sends your version</span>
    </div>`;
}

function renderFlags() {
  const list = $('#flaglist'); list.innerHTML = '';
  const open = openFlags();
  $('#flagempty').hidden = open.length > 0;
  const badge = $('#flagcount');
  badge.textContent = open.length;
  badge.classList.toggle('zero', open.length === 0);
  for (const f of open) {
    const c = byId(f.creatorId);
    const card = el('div', 'flagitem');
    card.innerHTML = `<div class="f-top"><span class="av">${c.initials}</span>
      <span><span class="name">${esc(c.name)}</span> <span class="sub">· ${esc(c.brand)} · ${esc(c.campaign)}</span></span>
      <span class="since"><button class="btn quiet small" data-open="${c.id}">open thread →</button></span></div>` + flagCardHTML(f);
    list.appendChild(card);
  }
  wireFlagActions(list);
}

function wireFlagActions(root) {
  root.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); approveFlag(b.dataset.approve); }));
  root.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation();
    const id = b.dataset.edit;
    root.querySelectorAll(`[data-draft="${id}"]`).forEach(d => { d.contentEditable = 'true'; d.focus(); });
    root.querySelectorAll(`[data-hint="${id}"]`).forEach(h => h.hidden = false);
  }));
  root.querySelectorAll('[data-dismiss]').forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); dismissFlag(b.dataset.dismiss); }));
  root.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); openDrawer(b.dataset.open); }));
}

function approveFlag(id) {
  const f = S.flags.find(x => x.id === id); if (!f || f.status !== 'open') return;
  const edited = document.querySelector(`[data-draft="${id}"][contenteditable="true"]`) || document.querySelector(`[data-draft="${id}"]`);
  const body = (edited ? edited.innerText : f.draft).trim();
  const { t, ts } = nowStamp();
  const intent = (f.heldIntent.match(/^MSG-\w+/) || [null])[0];
  S.messages.push({ id: 'a' + Date.now(), creatorId: f.creatorId, author: 'agent', senderName: '', line: f.line || 'main', intent, body, t, ts, meta: 'approved by Katie' });
  if (intent) {
    if (!S.stats[intent]) S.stats[intent] = { unedited: 0, edited: 0 };
    const wasEdited = body !== f.draft.trim();
    S.stats[intent][wasEdited ? 'edited' : 'unedited']++;
  }
  f.status = 'resolved'; f.resolution = 'approved';
  save(); renderAll();
  toast(`Sent to ${byId(f.creatorId).name}. Flag cleared.`);
  if (f.id === 'f4') setTimeout(() => toast('Portal updated: Jehan B. marked declined for Mojo Fun.'), 900);
}

function dismissFlag(id) {
  const f = S.flags.find(x => x.id === id); if (!f || f.status !== 'open') return;
  f.status = 'resolved'; f.resolution = 'dismissed';
  save(); renderAll();
  toast('Flag dismissed. Nothing was sent; the held message stays held.');
}

/* ---------- drawer ---------- */
let drawerLine = 'main';
function openDrawer(cid, line) {
  drawerCreator = cid;
  drawerLine = line || 'main';
  const c = byId(cid);
  $('#d-name').textContent = c.name;
  $('#d-sub').textContent = `${c.brand} · ${c.campaign} · ${c.stage}`;
  renderDrawerBody();
  $('#drawer').hidden = false; $('#scrim').hidden = false;
}
function renderDrawerBody() {
  const c = byId(drawerCreator);
  const all = S.messages.filter(m => m.creatorId === c.id);
  const hasTony = all.some(m => m.line === 'tony');
  const tabs = $('#d-lines');
  tabs.hidden = !hasTony;
  if (!hasTony) drawerLine = 'main';
  tabs.querySelectorAll('.linetab').forEach(b => b.classList.toggle('active', b.dataset.line === drawerLine));
  const body = $('#d-body'); body.innerHTML = '';
  const msgs = all.filter(m => (m.line || 'main') === drawerLine).sort((a, b) => a.ts.localeCompare(b.ts));
  for (const m of msgs) {
    const inb = m.author === 'creator';
    body.appendChild(el('div', 'sms ' + (inb ? 'in' : 'out' + (m.author === 'agent' ? ' agent' : '') + (drawerLine === 'tony' ? ' tony' : '')), esc(m.body)));
    const who = inb ? 'creator' : (m.author === 'katie' ? (m.senderName || 'team') : m.author);
    body.appendChild(el('div', 'msgmeta' + (inb ? '' : ' r'), `${esc(who)}${m.meta ? ' · ' + esc(m.meta) : ''} · ${m.t}`));
  }
  const f = flagFor(c.id);
  if (f && (f.line || 'main') === drawerLine) {
    const card = el('div', 'd-flag', flagCardHTML(f, true));
    body.appendChild(card);
    wireFlagActions(card);
  }
  $('#d-input').placeholder = drawerLine === 'tony' ? 'Reply as Tony' : 'Reply as Katie';
  body.scrollTop = body.scrollHeight;
}
function closeDrawer() { $('#drawer').hidden = true; $('#scrim').hidden = true; drawerCreator = null; }

function sendReply() {
  const input = $('#d-input'); const text = input.value.trim();
  if (!text || !drawerCreator) return;
  const { t, ts } = nowStamp();
  S.messages.push({ id: 'k' + Date.now(), creatorId: drawerCreator, author: 'katie', senderName: drawerLine === 'tony' ? 'Tony Staehelin' : 'Katie Scalzo', line: drawerLine, body: text, t, ts });
  const f = flagFor(drawerCreator);
  if (f && (f.line || 'main') === drawerLine) { f.status = 'resolved'; f.resolution = 'replied'; toast('Flag cleared: you replied in the thread.'); }
  input.value = '';
  save(); renderAll(); renderDrawerBody();
}

/* ---------- ladders ---------- */
function nextMsgId() {
  const local = activeLadder === 'local';
  let max = 0;
  for (const k of ['product', 'local']) for (const r of S.ladders[k]) {
    const m = (local ? /^MSG-L(\d+)/ : /^MSG-(\d+)/).exec(r.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return (local ? 'MSG-L' : 'MSG-') + (max + 1);
}
function renderLadders() {
  const list = $('#ladderlist'); list.innerHTML = '';
  for (const r of S.ladders[activeLadder]) {
    const row = el('div', 'lrow' + (r.indent === 1 ? ' i1' : r.indent === 2 ? ' i2' : ''));
    if (r.status === 'branch') {
      row.innerHTML = `<div class="l-line branchrow"><span class="msgid"></span>${esc(r.name)}</div>`;
      list.appendChild(row); continue;
    }
    const line = el('button', 'l-line');
    const st = S.stats[r.id];
    let trust = '';
    if (st && (st.unedited + st.edited) > 0) {
      const n = st.unedited + st.edited;
      const pct = Math.round(100 * st.unedited / n);
      const ready = pct >= 90 && n >= 10;
      trust = `<span class="trust ${ready ? 'ready' : ''}" title="${st.unedited} of ${n} approved drafts sent unedited">${pct}% unedited · n=${n}${ready ? ' · ready for auto-send' : ''}</span>`;
    }
    line.innerHTML = `<span class="msgid">${esc(r.id)}</span><span class="l-name">${esc(r.name)}</span><span class="l-when">${esc(r.when)}</span>${trust}${r.edited ? '<span class="st editedchip">edited</span>' : ''}<span class="st ${r.status}">${r.status === 'new' ? 'new draft' : r.status}</span>`;
    const copy = el('div', 'l-copy');
    copy.hidden = true;
    const renderCopyView = () => {
      copy.innerHTML = (r.copy ? `<div class="bubblepreview">${esc(r.copy)}</div>` : '<em style="color:var(--ink-med)">No copy yet.</em>') +
        `<div class="l-editbar"><button class="btn ghost small" data-editrow>Edit message</button></div>`;
      copy.querySelector('[data-editrow]').addEventListener('click', () => renderCopyEdit());
    };
    const renderCopyEdit = () => {
      copy.innerHTML = `<div class="l-editform">
        <label>Name<input type="text" data-f="name" value="${esc(r.name)}"></label>
        <label>Fires<input type="text" data-f="when" value="${esc(r.when)}"></label>
        <label>Copy<textarea rows="3" data-f="copy">${esc(r.copy)}</textarea></label>
        <div class="af-actions"><button class="btn primary small" data-saverow>Save changes</button><button class="btn ghost small" data-cancelrow>Cancel</button></div>
      </div>`;
      copy.querySelector('[data-saverow]').addEventListener('click', () => {
        const get = f => copy.querySelector(`[data-f="${f}"]`).value.trim();
        const nm = get('name'), cp = get('copy');
        if (!nm || !cp) { toast('Name and copy cannot be empty.'); return; }
        r.name = nm; r.when = get('when'); r.copy = cp; r.edited = true; r.editedAt = new Date().toISOString();
        save(); renderAll();
        toast(`${r.id} updated. The live version keeps sending until Brian deploys the new copy.`);
      });
      copy.querySelector('[data-cancelrow]').addEventListener('click', renderCopyView);
    };
    renderCopyView();
    line.addEventListener('click', () => { copy.hidden = !copy.hidden; });
    row.appendChild(line); row.appendChild(copy);
    list.appendChild(row);
  }
}
function openAddForm() {
  const f = $('#addform'); f.hidden = false;
  $('#af-id').textContent = nextMsgId();
  const after = $('#af-after'); after.innerHTML = '';
  S.ladders[activeLadder].filter(r => r.status !== 'branch').forEach(r => {
    const o = document.createElement('option'); o.value = r.id; o.textContent = `${r.id} · ${r.name}`;
    after.appendChild(o);
  });
  after.selectedIndex = after.options.length - 1;
  $('#af-name').value = ''; $('#af-when').value = ''; $('#af-copy').value = '';
  $('#af-name').focus();
}
function saveNewMsg() {
  const name = $('#af-name').value.trim(), when = $('#af-when').value.trim(), copy = $('#af-copy').value.trim();
  if (!name || !copy) { toast('Give it a name and the copy at minimum.'); return; }
  const id = $('#af-id').textContent;
  const afterId = $('#af-after').value;
  const arr = S.ladders[activeLadder];
  let idx = arr.findIndex(r => r.id === afterId);
  const indent = idx >= 0 ? arr[idx].indent : 0;
  if (indent === 0) { while (arr[idx + 1] && (arr[idx + 1].status === 'branch' || arr[idx + 1].indent > 0)) idx++; }
  arr.splice(idx + 1, 0, { id, name, when: when || 'trigger to define with Brian', copy, status: 'new', indent });
  $('#addform').hidden = true;
  save(); renderAll();
  toast(`${id} saved as draft. It will not fire until Julia and Brian wire the trigger.`);
}

/* ---------- automations matrix (v1) ---------- */
const BRANDS = ['MD Solar Sciences', 'Celeste Naturals', '28 Litsea', 'Pecan Moon', 'Mojo Fun'];
function renderMatrix() {
  const tbl = $('#matrixtable'); if (!tbl) return;
  const intents = S.ladders.product.filter(r => r.status !== 'branch');
  let html = '<tr><th>Automation</th>' + BRANDS.map(b => `<th>${esc(b.replace(' Sciences', ''))}</th>`).join('') + '</tr>';
  for (const r of intents) {
    html += `<tr><td><span class="msgid">${esc(r.id)}</span> ${esc(r.name)}</td>`;
    for (const b of BRANDS) {
      const key = `${r.id}|${b}`;
      let state = S.matrix[key] || 'off';
      const sends = S.sends7d[key];
      const silent = state === 'live' && (sends === 0);
      const cls = silent ? 'err' : state;
      const sym = silent ? '!' : state === 'live' ? '●' : state === 'paused' ? '◐' : '○';
      const tip = silent ? 'Live but zero sends in 7 days. Click to pause, or investigate.' : `${state}${sends !== undefined ? ' · ' + sends + ' sends in 7d' : ''} · click to toggle`;
      html += `<td><button class="mcell ${cls}" data-key="${esc(key)}" title="${esc(tip)}">${sym}</button></td>`;
    }
    html += '</tr>';
  }
  tbl.innerHTML = html;
  tbl.querySelectorAll('.mcell').forEach(btn => btn.addEventListener('click', () => {
    const key = btn.dataset.key;
    const cur = S.matrix[key] || 'off';
    if (cur === 'off') { toast('This message is not wired for that brand yet. Add it via the ladder first.'); return; }
    S.matrix[key] = cur === 'live' ? 'paused' : 'live';
    save(); renderAll();
    const [i, b] = key.split('|');
    toast(S.matrix[key] === 'paused' ? `${i} paused for ${b}. Queued sends for that brand are held.` : `${i} live again for ${b}.`);
  }));
}

/* ---------- digest (v1) ---------- */
function renderDigest() {
  const box = $('#digestcard'); if (!box) return;
  const open = openFlags();
  const today = S.messages.filter(m => m.ts >= '2026-08-26');
  const agentSends = today.filter(m => m.author === 'agent').length;
  const autoSends = today.filter(m => m.author === 'auto').length;
  const inbound = today.filter(m => m.author === 'creator').length;
  const silent = Object.entries(S.matrix).filter(([k, v]) => v === 'live' && S.sends7d[k] === 0);
  const paused = Object.entries(S.matrix).filter(([k, v]) => v === 'paused');
  box.innerHTML = `
    <div class="dg-head"><div><div class="dg-title">Morning digest</div><div class="dg-sub">Wednesday Aug 27, 8:00am · auto-posts to #sms-needs-katie</div></div>
    <button class="btn ghost" id="dg-slack">Send to Slack</button></div>
    <div class="dg-grid">
      <div class="dg-stat"><b>${open.length}</b><span>flags waiting on you</span></div>
      <div class="dg-stat"><b>${autoSends + agentSends}</b><span>sent since yesterday (${agentSends} agent, ${autoSends} auto)</span></div>
      <div class="dg-stat"><b>${inbound}</b><span>creator replies in</span></div>
      <div class="dg-stat ${silent.length ? 'warn' : ''}"><b>${silent.length}</b><span>live automations with zero sends in 7d</span></div>
    </div>
    ${silent.length ? `<div class="dg-anom"><b>Needs a look:</b> ${silent.map(([k]) => { const [i, b] = k.split('|'); return `${i} for ${b}`; }).join(' · ')} <span class="dg-why">(live, but nothing fired all week, this is how a silent reminder bug hides)</span></div>` : ''}
    ${paused.length ? `<div class="dg-anom paused"><b>Paused by you:</b> ${paused.map(([k]) => { const [i, b] = k.split('|'); return `${i} for ${b}`; }).join(' · ')}</div>` : ''}
    <div class="dg-flags">${open.map(f => { const c = byId(f.creatorId); return `<div class="dg-flagline"><span class="av small">${c.initials}</span> ${esc(c.name)} · ${esc(f.reason.toLowerCase())} · held since ${esc(f.since)}</div>`; }).join('') || '<div class="dg-flagline all-clear">Nothing waiting. Quiet morning.</div>'}</div>`;
  const btn = $('#dg-slack');
  if (btn) btn.addEventListener('click', () => toast('<b># sms-needs-katie</b> · Morning digest posted.', true));
}

/* ---------- demo controls ---------- */
const SIMS = [
  { cid: 'madison', body: 'Hey! My package says delivered but I do not see it anywhere?? Can you check', reason: 'Delivery problem', reasonText: 'Creator reports a missing package. Shipping issue: holding the delivered confirmation text.', heldIntent: 'MSG-05 · Delivered', heldBody: 'Your MD Solar package was delivered! 🎉 You have 10 days to upload your draft.', draft: 'Oh no! Sometimes carriers mark it a few hours early. Can you check with neighbors or your mailroom? If it is not there by tomorrow morning I will have a replacement sent right away.' },
  { cid: 'ilona', body: 'sorry been slammed this week, can I get a few more days for the draft?', reason: 'Extension request', reasonText: 'Creator asks to move a deadline. Date commitments always come to you.', heldIntent: 'MSG-06 · Draft reminder', heldBody: 'Hi Ilona, friendly nudge! Your Celeste Naturals draft is due in 3 days.', draft: 'Of course, life happens! Would Monday work? I will move your due date and pause the reminders until then.' },
  { cid: 'alyssa', body: 'omg I LOVE the steamers, the eucalyptus one is unreal', reason: 'Nice moment worth a human touch', reasonText: 'Positive small talk on a new collab. Drafted a warm reply; approve or make it yours.', heldIntent: '(no send queued)', heldBody: '', draft: 'That one is my favorite too!! So happy you love them. Cannot wait to see what you create 💜' },
];
function simulateInbound() {
  let sim = null;
  for (let k = 0; k < SIMS.length; k++) {
    const cand = SIMS[(S.simCount + k) % SIMS.length];
    if (!flagFor(cand.cid)) { sim = cand; S.simCount += k + 1; break; }
  }
  if (!sim) { toast('All demo scenarios are already waiting in Needs you.'); return; }
  const { t, ts } = nowStamp();
  S.messages.push({ id: 'sim' + Date.now(), creatorId: sim.cid, author: 'creator', senderName: '', line: 'main', body: sim.body, t, ts });
  S.flags.push({ id: 'fsim' + Date.now(), creatorId: sim.cid, line: 'main', reason: sim.reason, reasonText: sim.reasonText, heldIntent: sim.heldIntent, heldBody: sim.heldBody, draft: sim.draft, since: t.replace('Today, ', ''), status: 'open' });
  save(); renderAll();
  const c = byId(sim.cid);
  toast(`<b># sms-needs-katie</b> · Herd is holding a send for ${esc(c.name)} (${esc(c.brand)}): ${esc(sim.reason.toLowerCase())}. Draft ready.`, true);
}

/* ---------- wiring ---------- */
function persistOpenEdits() {
  document.querySelectorAll('[data-draft][contenteditable="true"]').forEach(elm => {
    const f = S.flags.find(x => x.id === elm.dataset.draft);
    if (f && f.status === 'open') f.draft = elm.innerText.trim();
  });
}
function renderAll() { persistOpenEdits(); renderFeed(); renderFlags(); renderLadders(); renderMatrix(); renderDigest(); if (drawerCreator) renderDrawerBody(); }

function init() {
  const brands = [...new Set(creators.map(c => c.brand))];
  for (const b of brands) { const o = document.createElement('option'); o.value = b; o.textContent = 'Brand: ' + b; $('#f-brand').appendChild(o); }
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    activeTab = t.dataset.tab;
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + activeTab));
  }));
  document.querySelectorAll('.segbtn').forEach(b => b.addEventListener('click', () => {
    activeLadder = b.dataset.ladder;
    document.querySelectorAll('.segbtn').forEach(x => x.classList.toggle('active', x === b));
    $('#addform').hidden = true;
    renderLadders();
  }));
  ['f-brand', 'f-sender'].forEach(id => $('#' + id).addEventListener('change', renderFeed));
  $('#f-search').addEventListener('input', renderFeed);
  document.querySelectorAll('.linetab').forEach(b => b.addEventListener('click', () => { drawerLine = b.dataset.line; renderDrawerBody(); }));
  $('#d-close').addEventListener('click', closeDrawer);
  $('#scrim').addEventListener('click', closeDrawer);
  $('#d-send').addEventListener('click', sendReply);
  $('#d-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendReply(); });
  $('#addmsg').addEventListener('click', openAddForm);
  $('#af-save').addEventListener('click', saveNewMsg);
  $('#af-cancel').addEventListener('click', () => $('#addform').hidden = true);
  $('#demo-inbound').addEventListener('click', simulateInbound);
  $('#demo-reset').addEventListener('click', () => { localStorage.removeItem(LS_KEY); S = loadState(); renderAll(); toast('Demo data reset.'); });
  renderAll();
}
init();
