// ─────────────────────────────────────────────
//  WikiTrail — popup.js
// ─────────────────────────────────────────────

const statusDot      = document.getElementById('status-dot');
const statusText     = document.getElementById('status-text');
const pageCount      = document.getElementById('page-count');
const timeElapsed    = document.getElementById('time-elapsed');
const sessionLabel   = document.getElementById('session-start-label');
const emptyState     = document.getElementById('empty-state');
const tooltip        = document.getElementById('tooltip');
const btnEnd         = document.getElementById('btn-end');
const btnHistory     = document.getElementById('btn-history');
const historyPanel   = document.getElementById('history-panel');
const historyList    = document.getElementById('history-list');
const btnCloseHist   = document.getElementById('btn-close-history');
const notesDrawer    = document.getElementById('notes-drawer');
const drawerTitle    = document.getElementById('drawer-node-title');
const drawerLink     = document.getElementById('drawer-wiki-link');
const notesList      = document.getElementById('notes-list');
const btnCloseDrawer = document.getElementById('btn-close-drawer');
const viewSelect     = document.getElementById('view-select');
const endModal       = document.getElementById('end-modal');
const modalName      = document.getElementById('modal-name');
const modalTags      = document.getElementById('modal-tags');
const btnModalCancel = document.getElementById('btn-modal-cancel');
const btnModalConfirm= document.getElementById('btn-modal-confirm');

let elapsedInterval = null;
let currentSession  = null;
let currentTabId    = null;
let currentView     = 'network';
let currentNodes    = null;

// ─────────────────────────────────────────────
//  ESCAPE — sanitize all user strings before
//  injecting into innerHTML
// ─────────────────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────
async function init() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (activeTab && /wikipedia\.org\/wiki\//.test(activeTab.url)) {
    currentTabId = activeTab.id;
    const session = await getSessionForTab(currentTabId);
    currentSession = session;

    if (session && session.nodes.length > 0) {
      setActiveUI(session);
      renderView(session.nodes);
      startElapsedTimer(session.startTime);
      return;
    }
  }

  setIdleUI();
}

async function getSessionForTab(tabId) {
  const { activeTabSessions } = await chrome.storage.local.get('activeTabSessions');
  return (activeTabSessions && activeTabSessions[tabId]) || null;
}

async function getActiveTabSessions() {
  const { activeTabSessions } = await chrome.storage.local.get('activeTabSessions');
  return activeTabSessions || {};
}

// ─────────────────────────────────────────────
//  VIEW ROUTER
// ─────────────────────────────────────────────
function renderView(nodes) {
  currentNodes = nodes;
  notesDrawer.classList.remove('open');
  if      (currentView === 'network')  renderNetwork(nodes);
  else if (currentView === 'timeline') renderTimeline(nodes);
}

viewSelect.addEventListener('change', () => {
  currentView = viewSelect.value;
  if (currentNodes) renderView(currentNodes);
});

// ─────────────────────────────────────────────
//  UI STATE
// ─────────────────────────────────────────────
function setActiveUI(session) {
  statusDot.classList.add('active');
  statusText.textContent   = 'tracking';
  btnEnd.disabled          = false;
  emptyState.style.display = 'none';
  pageCount.textContent    = session.nodes.length;
  sessionLabel.textContent = `started ${formatTime(new Date(session.startTime))}`;
}

function setIdleUI() {
  statusDot.classList.remove('active');
  statusText.textContent   = 'idle';
  btnEnd.disabled          = true;
  emptyState.style.display = 'flex';
  pageCount.textContent    = '0';
  timeElapsed.textContent  = '0m';
  sessionLabel.textContent = '';
  clearInterval(elapsedInterval);
  d3.select('#graph-svg').selectAll('*').remove();
}

function startElapsedTimer(startTime) {
  clearInterval(elapsedInterval);
  function update() {
    const mins = Math.floor((Date.now() - startTime) / 60000);
    timeElapsed.textContent = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }
  update();
  elapsedInterval = setInterval(update, 10000);
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function parseTags(str) {
  return str.split(',').map(t => t.trim()).filter(Boolean);
}

// ─────────────────────────────────────────────
//  END TRAIL — opens naming modal first
// ─────────────────────────────────────────────
btnEnd.addEventListener('click', () => {
  if (!currentSession) return;
  modalName.value = '';
  modalTags.value = '';
  endModal.classList.add('open');
  modalName.focus();
});

btnModalCancel.addEventListener('click', () => {
  endModal.classList.remove('open');
});

btnModalConfirm.addEventListener('click', async () => {
  if (!currentSession || currentTabId === null) return;

  const name = modalName.value.trim();
  const tags = parseTags(modalTags.value);

  const finishedTrail = {
    ...currentSession,
    endTime: Date.now(),
    name   : name || null,
    tags   : tags
  };

  try {
    const { completedTrails = [] } = await chrome.storage.local.get('completedTrails');
    completedTrails.push(finishedTrail);
    const all = await getActiveTabSessions();
    delete all[currentTabId];
    await chrome.storage.local.set({ completedTrails, activeTabSessions: all });
  } catch (e) {
    console.error('[WikiTrail] Failed to save trail:', e);
  }

  endModal.classList.remove('open');
  clearInterval(elapsedInterval);
  currentSession = null;
  currentNodes   = null;
  setIdleUI();
});

// Allow Enter to confirm in modal
modalName.addEventListener('keydown', (e) => { if (e.key === 'Enter') modalTags.focus(); });
modalTags.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnModalConfirm.click(); });

// ─────────────────────────────────────────────
//  HISTORY PANEL
// ─────────────────────────────────────────────
btnHistory.addEventListener('click', async () => {
  const { completedTrails = [] } = await chrome.storage.local.get('completedTrails');
  renderHistoryList(completedTrails);
  historyPanel.classList.add('open');
});

btnCloseHist.addEventListener('click', () => historyPanel.classList.remove('open'));

function renderHistoryList(trails) {
  historyList.innerHTML = '';

  if (trails.length === 0) {
    const p = document.createElement('p');
    p.className   = 'no-history';
    p.textContent = 'No past trails yet. Go explore!';
    historyList.appendChild(p);
    return;
  }

  [...trails].reverse().forEach((trail, reversedIdx) => {
    const realIdx  = trails.length - 1 - reversedIdx;
    const div      = document.createElement('div');
    div.className  = 'trail-item';

    const date     = new Date(trail.startTime);
    const duration = Math.round(((trail.endTime || Date.now()) - trail.startTime) / 60000);
    const first    = trail.nodes[0]?.title || '?';
    const last     = trail.nodes[trail.nodes.length - 1]?.title || '?';
    const noteTotal= trail.nodes.reduce((acc, n) => acc + (n.notes?.length || 0), 0);

    // ── Top row: name + action buttons ──
    const topRow = document.createElement('div');
    topRow.className = 'trail-item-top';

    const mainArea = document.createElement('div');
    mainArea.className = 'trail-item-main';

    const nameEl = document.createElement('div');
    nameEl.className   = trail.name ? 'trail-name' : 'trail-name unnamed';
    nameEl.textContent = trail.name || 'Unnamed trail';

    const dateEl = document.createElement('div');
    dateEl.className   = 'trail-date';
    dateEl.textContent = `${date.toLocaleDateString()} at ${formatTime(date)} · ${duration}m · ${trail.nodes.length} articles${noteTotal > 0 ? ` · 📝 ${noteTotal}` : ''}`;

    const summaryEl = document.createElement('div');
    summaryEl.className = 'trail-summary';
    summaryEl.innerHTML = `<strong>${esc(first)}</strong> → … → <strong>${esc(last)}</strong>`;

    mainArea.appendChild(nameEl);
    mainArea.appendChild(dateEl);
    mainArea.appendChild(summaryEl);

    // Tags
    if (trail.tags && trail.tags.length > 0) {
      const tagsEl = document.createElement('div');
      tagsEl.className = 'trail-tags';
      trail.tags.forEach(tag => {
        const pill = document.createElement('span');
        pill.className   = 'tag-pill';
        pill.textContent = tag;
        tagsEl.appendChild(pill);
      });
      mainArea.appendChild(tagsEl);
    }

    // Click main area to view trail
    mainArea.addEventListener('click', () => {
      historyPanel.classList.remove('open');
      emptyState.style.display = 'none';
      renderView(trail.nodes);
    });

    // ── Action buttons ──
    const actionsEl = document.createElement('div');
    actionsEl.className = 'trail-actions';

    const btnEdit = document.createElement('button');
    btnEdit.className   = 'trail-action-btn';
    btnEdit.textContent = '✎';
    btnEdit.title       = 'Rename / retag';

    const btnExport = document.createElement('button');
    btnExport.className   = 'trail-action-btn';
    btnExport.textContent = '↓';
    btnExport.title       = 'Export trail';

    actionsEl.appendChild(btnEdit);
    actionsEl.appendChild(btnExport);

    topRow.appendChild(mainArea);
    topRow.appendChild(actionsEl);
    div.appendChild(topRow);

    // ── Inline edit form ──
    const editForm = document.createElement('div');
    editForm.className = 'trail-edit-form';

    const editNameInput = document.createElement('input');
    editNameInput.className   = 'modal-input';
    editNameInput.type        = 'text';
    editNameInput.placeholder = 'Trail name';
    editNameInput.maxLength   = 80;
    editNameInput.value       = trail.name || '';

    const editTagsInput = document.createElement('input');
    editTagsInput.className   = 'modal-input';
    editTagsInput.type        = 'text';
    editTagsInput.placeholder = 'Tags (comma-separated)';
    editTagsInput.maxLength   = 120;
    editTagsInput.value       = (trail.tags || []).join(', ');

    const editActions = document.createElement('div');
    editActions.className = 'modal-actions';

    const btnEditCancel = document.createElement('button');
    btnEditCancel.textContent = 'Cancel';

    const btnEditSave = document.createElement('button');
    btnEditSave.textContent = 'Save';
    btnEditSave.style.cssText = 'background:#1a3a2a;color:#4caf77;border-color:#2a5a3a;';

    editActions.appendChild(btnEditCancel);
    editActions.appendChild(btnEditSave);
    editForm.appendChild(editNameInput);
    editForm.appendChild(editTagsInput);
    editForm.appendChild(editActions);
    div.appendChild(editForm);

    // Edit button toggles form
    btnEdit.addEventListener('click', (e) => {
      e.stopPropagation();
      editForm.classList.toggle('open');
      if (editForm.classList.contains('open')) editNameInput.focus();
    });

    btnEditCancel.addEventListener('click', () => editForm.classList.remove('open'));

    btnEditSave.addEventListener('click', async () => {
      try {
        const { completedTrails = [] } = await chrome.storage.local.get('completedTrails');
        completedTrails[realIdx].name = editNameInput.value.trim() || null;
        completedTrails[realIdx].tags = parseTags(editTagsInput.value);
        await chrome.storage.local.set({ completedTrails });
        editForm.classList.remove('open');
        // Refresh the list
        renderHistoryList(completedTrails);
      } catch (e) {
        console.error('[WikiTrail] Failed to save trail edits:', e);
      }
    });

    // Export button
    btnExport.addEventListener('click', (e) => {
      e.stopPropagation();
      exportTrail(trail);
    });

    historyList.appendChild(div);
  });
}

// ─────────────────────────────────────────────
//  EXPORT — generates a self-contained HTML file
// ─────────────────────────────────────────────
function exportTrail(trail) {
  const name     = trail.name || 'Unnamed trail';
  const tags     = (trail.tags || []);
  const date     = new Date(trail.startTime);
  const duration = Math.round(((trail.endTime || Date.now()) - trail.startTime) / 60000);
  const nodes    = trail.nodes;
  const noteTotal= nodes.reduce((acc, n) => acc + (n.notes?.length || 0), 0);

  // Build the articles + notes section as HTML
  const articlesHtml = nodes.map((n, i) => {
    const mins     = Math.round((n.timeSpent || 0) / 60000);
    const secs     = Math.round((n.timeSpent || 0) / 1000) % 60;
    const timeStr  = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    const notesHtml= (n.notes || []).map(note => {
      const timeStr = new Date(note.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
      const textHtml = note.url
        ? `<a class="note-link" href="${esc(note.url)}" target="_blank">${esc(note.text)}</a>`
        : `<div class="note-text">${esc(note.text)}</div>`;
      return `
      <div class="note">
        ${textHtml}
        <div class="note-meta">${timeStr}</div>
      </div>`;
    }).join('');

    return `
      <div class="article ${i === 0 ? 'first' : i === nodes.length-1 ? 'last' : ''}">
        <div class="article-top">
          <div class="article-num">${i + 1}</div>
          <div class="article-info">
            <a class="article-title" href="${esc(n.url)}" target="_blank">${esc(n.title)}</a>
            <div class="article-meta">${timeStr} · ${new Date(n.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
          </div>
        </div>
        ${notesHtml ? `<div class="notes">${notesHtml}</div>` : ''}
      </div>`;
  }).join('');

  // Build graph data for embedded D3
  const nodeMap  = new Map();
  const linkData = [];
  nodes.forEach((n, i) => {
    if (!nodeMap.has(n.title)) nodeMap.set(n.title, { id: n.title, title: n.title, timeSpent: n.timeSpent || 0, index: i });
  });
  nodes.forEach(n => {
    if (n.from && nodeMap.has(n.from) && nodeMap.has(n.title)) {
      if (!linkData.some(l => l.source === n.from && l.target === n.title))
        linkData.push({ source: n.from, target: n.title });
    }
  });
  const nodeData = Array.from(nodeMap.values());

  const graphDataScript = `
    const nodeData = ${JSON.stringify(nodeData)};
    const linkData = ${JSON.stringify(linkData)};
  `;

  const tagsHtml = tags.length > 0
    ? tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(name)} — WikiTrail</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"><\/script>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#0f0f0f;color:#e0e0e0;font-family:Georgia,serif;max-width:860px;margin:0 auto;padding:32px 24px}
  h1{font-size:22px;color:#fff;margin-bottom:6px}
  .meta{font-size:12px;color:#555;margin-bottom:10px}
  .meta strong{color:#888}
  .tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:24px}
  .tag{font-size:11px;color:#7eb8f7;background:#0f2035;border:1px solid #1e3a5a;border-radius:10px;padding:3px 10px}
  .stats{display:flex;gap:24px;margin-bottom:28px;padding:14px 18px;background:#141414;border-radius:8px;border:1px solid #1e1e1e}
  .stat-val{font-size:22px;color:#fff;line-height:1}
  .stat-label{font-size:11px;color:#555;margin-top:3px}
  #graph-wrap{background:#111;border-radius:8px;border:1px solid #1e1e1e;margin-bottom:32px;overflow:hidden}
  #graph-wrap svg{width:100%;height:420px;display:block}
  .link{stroke:#2a4a6b;stroke-width:1.5px;marker-end:url(#arrow)}
  .node circle{fill:#1a2f4a;stroke:#7eb8f7;stroke-width:1.5px}
  .node.start circle{fill:#1a3a2a;stroke:#4caf77}
  .node.last circle{fill:#2a2a1a;stroke:#f7d67e}
  .node text{fill:#ccc;font-size:10px;font-family:Georgia,serif;pointer-events:none;text-anchor:middle}
  h2{font-size:15px;color:#aaa;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #1e1e1e}
  .article{padding:14px 0;border-bottom:1px solid #141414}
  .article-top{display:flex;gap:12px;align-items:flex-start}
  .article-num{min-width:26px;height:26px;border-radius:50%;background:#1a2f4a;border:1px solid #7eb8f7;display:flex;align-items:center;justify-content:center;font-size:11px;color:#7eb8f7;flex-shrink:0}
  .article.first .article-num{background:#1a3a2a;border-color:#4caf77;color:#4caf77}
  .article.last  .article-num{background:#2a2a1a;border-color:#f7d67e;color:#f7d67e}
  .article-title{color:#7eb8f7;font-size:14px;text-decoration:none}
  .article-title:hover{text-decoration:underline}
  .article-meta{font-size:11px;color:#555;margin-top:3px}
  .notes{margin-top:10px;margin-left:38px;display:flex;flex-direction:column;gap:6px}
  .note{background:#161616;border:1px solid #222;border-radius:5px;padding:8px 12px}
  .note-text{font-size:12px;color:#bbb;line-height:1.5}
  .note-link{font-size:12px;color:#7eb8f7;line-height:1.5;text-decoration:none}
  .note-link:hover{text-decoration:underline}
  .note-meta{font-size:10px;color:#444;margin-top:4px}
  footer{margin-top:40px;padding-top:16px;border-top:1px solid #1a1a1a;font-size:11px;color:#333;text-align:center}
</style>
</head>
<body>
<h1>${esc(name)}</h1>
<div class="meta">
  <strong>${date.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</strong>
  &nbsp;·&nbsp; started ${formatTime(date)}
</div>
${tagsHtml ? `<div class="tags">${tagsHtml}</div>` : ''}
<div class="stats">
  <div><div class="stat-val">${nodes.length}</div><div class="stat-label">articles</div></div>
  <div><div class="stat-val">${duration}m</div><div class="stat-label">total time</div></div>
  <div><div class="stat-val">${noteTotal}</div><div class="stat-label">notes saved</div></div>
  <div><div class="stat-val">${nodes.filter((n,i,a) => a.findIndex(x=>x.title===n.title)===i).length}</div><div class="stat-label">unique articles</div></div>
</div>

<div id="graph-wrap"><svg id="graph-svg"></svg></div>

<h2>Article trail</h2>
${articlesHtml}

<footer>Exported from WikiTrail</footer>

<script>
${graphDataScript}
(function(){
  const W=860,H=420;
  const svg=d3.select('#graph-svg').attr('viewBox','0 0 '+W+' '+H);
  svg.append('defs').append('marker').attr('id','arrow').attr('viewBox','0 -4 8 8').attr('refX',20).attr('refY',0).attr('markerWidth',5).attr('markerHeight',5).attr('orient','auto').append('path').attr('d','M0,-4L8,0L0,4').attr('fill','#2a4a6b');
  const maxT=Math.max(...nodeData.map(n=>n.timeSpent),1);
  const r=d3.scaleLinear().domain([0,maxT]).range([6,18]);
  const sim=d3.forceSimulation(nodeData).force('link',d3.forceLink(linkData).id(d=>d.id).distance(90).strength(0.8)).force('charge',d3.forceManyBody().strength(-220)).force('center',d3.forceCenter(W/2,H/2)).force('collide',d3.forceCollide(d=>r(d.timeSpent)+14));
  const g=svg.append('g');
  svg.call(d3.zoom().scaleExtent([0.3,3]).on('zoom',e=>g.attr('transform',e.transform)));
  const link=g.append('g').selectAll('line').data(linkData).join('line').attr('class','link');
  const node=g.append('g').selectAll('g').data(nodeData).join('g').attr('class',d=>d.index===0?'node start':d.index===nodeData.length-1?'node last':'node').call(d3.drag().on('start',(e,d)=>{if(!e.active)sim.alphaTarget(0.3).restart();d.fx=d.x;d.fy=d.y}).on('drag',(e,d)=>{d.fx=e.x;d.fy=e.y}).on('end',(e,d)=>{if(!e.active)sim.alphaTarget(0);d.fx=null;d.fy=null}));
  node.append('circle').attr('r',d=>r(d.timeSpent));
  node.append('text').attr('dy',d=>r(d.timeSpent)+12).text(d=>d.title.length>20?d.title.slice(0,18)+'…':d.title);
  sim.on('tick',()=>{link.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y).attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);node.attr('transform',d=>'translate('+d.x+','+d.y+')')});
})();
<\/script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const slug = (trail.name || 'wikitrail').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  a.download = `${slug}-${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}.html`;
  a.href     = url;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────
//  NOTES DRAWER
// ─────────────────────────────────────────────
function openNotesDrawer(nodeData) {
  drawerTitle.textContent = nodeData.title;
  drawerLink.href         = nodeData.url;
  notesList.innerHTML     = '';

  const notes = nodeData.notes || [];

  if (notes.length === 0) {
    const p = document.createElement('p');
    p.className   = 'no-notes';
    p.textContent = 'No notes yet. Highlight text on this Wikipedia page and right-click → "Save to current hole".';
    notesList.appendChild(p);
  } else {
    notes.forEach(note => {
      const div     = document.createElement('div');
      div.className = 'note-item';
      const timeStr = new Date(note.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // If we have a fragment URL, render as a link — otherwise plain text
      const textEl = document.createElement(note.url ? 'a' : 'div');
      textEl.textContent = note.text;
      if (note.url) {
        textEl.href      = note.url;
        textEl.target    = '_blank';
        textEl.className = 'note-link';
      }

      const timeEl       = document.createElement('div');
      timeEl.className   = 'note-time';
      timeEl.textContent = timeStr;
      div.appendChild(textEl);
      div.appendChild(timeEl);
      notesList.appendChild(div);
    });
  }

  notesDrawer.classList.add('open');
}

btnCloseDrawer.addEventListener('click', () => notesDrawer.classList.remove('open'));

// ─────────────────────────────────────────────
//  SVG HELPERS
// ─────────────────────────────────────────────
function initSvg(W, H) {
  const svg = d3.select('#graph-svg');
  svg.selectAll('*').remove();
  emptyState.style.display = 'none';
  svg.attr('viewBox', `0 0 ${W} ${H}`);
  return svg;
}

function attachTooltip(selection, htmlFn) {
  selection
    .on('mouseenter', (event, d) => {
      tooltip.innerHTML = htmlFn(d);
      tooltip.classList.add('visible');
    })
    .on('mousemove', (event) => {
      const rect = document.getElementById('graph-container').getBoundingClientRect();
      let x = event.clientX - rect.left + 12;
      let y = event.clientY - rect.top  - 10;
      if (x + 190 > rect.width) x -= 200;
      tooltip.style.left = `${x}px`;
      tooltip.style.top  = `${y}px`;
    })
    .on('mouseleave', () => tooltip.classList.remove('visible'));
}

// ─────────────────────────────────────────────
//  VIEW 1 — NETWORK
// ─────────────────────────────────────────────
function renderNetwork(nodes) {
  const W = 480, H = 300;
  const svg = initSvg(W, H);

  svg.append('defs').append('marker')
    .attr('id', 'arrow').attr('viewBox', '0 -4 8 8')
    .attr('refX', 20).attr('refY', 0)
    .attr('markerWidth', 5).attr('markerHeight', 5).attr('orient', 'auto')
    .append('path').attr('d', 'M0,-4L8,0L0,4').attr('fill', '#2a4a6b');

  const nodeMap = new Map();
  const linkData = [];

  nodes.forEach((n, i) => {
    if (!nodeMap.has(n.title))
      nodeMap.set(n.title, { id: n.title, title: n.title, url: n.url, timeSpent: n.timeSpent || 0, notes: n.notes || [], index: i });
  });
  nodes.forEach(n => {
    if (n.from && nodeMap.has(n.from) && nodeMap.has(n.title)) {
      if (!linkData.some(l => l.source === n.from && l.target === n.title))
        linkData.push({ source: n.from, target: n.title });
    }
  });

  const nodeData = Array.from(nodeMap.values());
  const maxTime  = Math.max(...nodeData.map(n => n.timeSpent), 1);
  const rScale   = d3.scaleLinear().domain([0, maxTime]).range([6, 16]);

  const simulation = d3.forceSimulation(nodeData)
    .force('link',    d3.forceLink(linkData).id(d => d.id).distance(70).strength(0.8))
    .force('charge',  d3.forceManyBody().strength(-180))
    .force('center',  d3.forceCenter(W / 2, H / 2))
    .force('collide', d3.forceCollide(d => rScale(d.timeSpent) + 12));

  const g = svg.append('g');
  svg.call(d3.zoom().scaleExtent([0.4, 3]).on('zoom', (e) => g.attr('transform', e.transform)));

  const link = g.append('g').selectAll('line').data(linkData).join('line').attr('class', 'link');
  const node = g.append('g').selectAll('g').data(nodeData).join('g')
    .attr('class', d => d.index === 0 ? 'node start' : d.index === nodes.length - 1 ? 'node current' : 'node')
    .call(d3.drag()
      .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag',  (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on('end',   (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
    );

  node.append('circle').attr('r', d => rScale(d.timeSpent));
  node.append('text').attr('dy', d => rScale(d.timeSpent) + 11)
    .text(d => d.title.length > 18 ? d.title.slice(0, 16) + '…' : d.title);

  attachTooltip(node, d => {
    const mins = Math.round(d.timeSpent / 60000);
    const nc   = (d.notes || []).length;
    return `<strong>${esc(d.title)}</strong>`
      + (mins > 0 ? `<br>${mins}m spent` : '')
      + (nc > 0 ? `<br>📝 ${nc} note${nc > 1 ? 's' : ''}` : '');
  });

  node.on('click', (e, d) => { if (e.defaultPrevented) return; openNotesDrawer(d); });

  simulation.on('tick', () => {
    link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    node.attr('transform', d => `translate(${d.x},${d.y})`);
  });
}

// ─────────────────────────────────────────────
//  VIEW 2 — TIMELINE
// ─────────────────────────────────────────────
function renderTimeline(nodes) {
  const W = 460, ROW_H = 52, PAD_LEFT = 100;
  const H = Math.max(300, nodes.length * ROW_H + 40);
  const svg = initSvg(W, H);

  const g = svg.append('g');
  svg.call(d3.zoom().scaleExtent([0.5, 2]).on('zoom', (e) => g.attr('transform', e.transform)));

  const maxTime  = Math.max(...nodes.map(n => n.timeSpent || 0), 1);
  const barScale = d3.scaleLinear().domain([0, maxTime]).range([4, W - PAD_LEFT - 40]);

  g.append('line')
    .attr('x1', PAD_LEFT - 16).attr('y1', 20)
    .attr('x2', PAD_LEFT - 16).attr('y2', H - 20)
    .attr('stroke', '#1e3a5a').attr('stroke-width', 2);

  const row = g.selectAll('g.trow').data(nodes).join('g')
    .attr('class', 'trow')
    .attr('transform', (d, i) => `translate(0, ${i * ROW_H + 20})`);

  row.append('circle')
    .attr('cx', PAD_LEFT - 16).attr('cy', 16).attr('r', 4)
    .attr('fill', (d, i) => i === 0 ? '#4caf77' : i === nodes.length - 1 ? '#f7d67e' : '#7eb8f7')
    .attr('stroke', '#0f0f0f').attr('stroke-width', 1.5);

  row.append('line')
    .attr('x1', PAD_LEFT - 16).attr('y1', 16).attr('x2', PAD_LEFT - 4).attr('y2', 16)
    .attr('stroke', '#1e3a5a').attr('stroke-width', 1);

  row.append('text')
    .attr('x', PAD_LEFT - 22).attr('y', 20)
    .attr('text-anchor', 'end').attr('font-size', 9).attr('fill', '#555')
    .text(d => formatTime(new Date(d.time)));

  row.append('rect')
    .attr('x', PAD_LEFT).attr('y', 8).attr('height', 16).attr('rx', 3)
    .attr('width', d => barScale(d.timeSpent || 0))
    .attr('fill',   (d, i) => i === 0 ? '#1a3a2a' : i === nodes.length - 1 ? '#2a2a1a' : '#1a2f4a')
    .attr('stroke', (d, i) => i === 0 ? '#4caf77' : i === nodes.length - 1 ? '#f7d67e' : '#7eb8f7')
    .attr('stroke-width', 1).style('cursor', 'pointer')
    .on('click', (e, d) => openNotesDrawer({ ...d, notes: d.notes || [] }));

  row.append('text')
    .attr('x', PAD_LEFT + 6).attr('y', 20).attr('font-size', 10).attr('fill', '#ccc')
    .attr('pointer-events', 'none')
    .text(d => d.title.length > 32 ? d.title.slice(0, 30) + '…' : d.title);

  row.filter(d => (d.notes || []).length > 0)
    .append('text').attr('x', PAD_LEFT + barScale(0) + 6).attr('y', 20)
    .attr('font-size', 9).attr('fill', '#888').attr('pointer-events', 'none')
    .text(d => `📝 ${d.notes.length}`);

  attachTooltip(row, d => {
    const mins = Math.round((d.timeSpent || 0) / 60000);
    const secs = Math.round((d.timeSpent || 0) / 1000) % 60;
    const nc   = (d.notes || []).length;
    return `<strong>${esc(d.title)}</strong>`
      + `<br>${mins > 0 ? `${mins}m ${secs}s` : `${secs}s`} spent`
      + (nc > 0 ? `<br>📝 ${nc} note${nc > 1 ? 's' : ''}` : '');
  });
}

// ─────────────────────────────────────────────
//  LIVE POLLING — fast when active, backs off idle
// ─────────────────────────────────────────────
let lastNodeCount = 0;
let idleRounds    = 0;

function startPolling() {
  async function poll() {
    if (currentTabId === null) {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab && /wikipedia\.org\/wiki\//.test(activeTab.url)) currentTabId = activeTab.id;
    }

    if (currentTabId !== null) {
      const session = await getSessionForTab(currentTabId);

      if (session && session.nodes.length !== lastNodeCount) {
        lastNodeCount = session.nodes.length;
        currentSession = session;
        setActiveUI(session);
        renderView(session.nodes);
        startElapsedTimer(session.startTime);
        idleRounds = 0;
      }

      if (!session && currentSession) {
        currentSession = null;
        currentNodes   = null;
        lastNodeCount  = 0;
        currentTabId   = null;
        setIdleUI();
      }
    }

    idleRounds++;
    const delay = (currentSession !== null || idleRounds < 5) ? 1000 : 5000;
    setTimeout(poll, delay);
  }

  setTimeout(poll, 1000);
}

// ─────────────────────────────────────────────
//  GO
// ─────────────────────────────────────────────
init();
startPolling();
