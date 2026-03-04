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

let elapsedInterval = null;
let currentSession  = null;   // session for the active Wikipedia tab
let currentTabId    = null;   // which tab we're showing
let currentView     = 'network';
let currentNodes    = null;

// ─────────────────────────────────────────────
//  ESCAPE — used everywhere we inject strings
//  into innerHTML to prevent XSS
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
//  INIT — find the active Wikipedia tab and
//  load its session, if any
// ─────────────────────────────────────────────
async function init() {
  // Find the currently active tab
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
  statusText.textContent    = 'tracking';
  btnEnd.disabled           = false;
  emptyState.style.display  = 'none';
  pageCount.textContent     = session.nodes.length;
  sessionLabel.textContent  = `started ${formatTime(new Date(session.startTime))}`;
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
      tooltip.innerHTML = htmlFn(d);  // htmlFn must use esc() on all user data
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
//  VIEW 1 — NETWORK (force-directed)
// ─────────────────────────────────────────────
function renderNetwork(nodes) {
  const W = 480, H = 300;
  const svg = initSvg(W, H);

  svg.append('defs').append('marker')
    .attr('id', 'arrow')
    .attr('viewBox', '0 -4 8 8')
    .attr('refX', 20).attr('refY', 0)
    .attr('markerWidth', 5).attr('markerHeight', 5)
    .attr('orient', 'auto')
    .append('path').attr('d', 'M0,-4L8,0L0,4').attr('fill', '#2a4a6b');

  const nodeMap  = new Map();
  const linkData = [];

  nodes.forEach((n, i) => {
    if (!nodeMap.has(n.title)) {
      nodeMap.set(n.title, {
        id: n.title, title: n.title, url: n.url,
        timeSpent: n.timeSpent || 0, notes: n.notes || [], index: i
      });
    }
  });

  nodes.forEach((n) => {
    if (n.from && nodeMap.has(n.from) && nodeMap.has(n.title)) {
      const exists = linkData.some(l => l.source === n.from && l.target === n.title);
      if (!exists) linkData.push({ source: n.from, target: n.title });
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

  const link = g.append('g').selectAll('line')
    .data(linkData).join('line').attr('class', 'link');

  const node = g.append('g').selectAll('g')
    .data(nodeData).join('g')
    .attr('class', d => {
      if (d.index === 0) return 'node start';
      if (d.index === nodes.length - 1) return 'node current';
      return 'node';
    })
    .call(d3.drag()
      .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag',  (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on('end',   (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
    );

  node.append('circle').attr('r', d => rScale(d.timeSpent));
  node.append('text')
    .attr('dy', d => rScale(d.timeSpent) + 11)
    .text(d => d.title.length > 18 ? d.title.slice(0, 16) + '…' : d.title);

  attachTooltip(node, d => {
    const mins      = Math.round(d.timeSpent / 60000);
    const noteCount = (d.notes || []).length;
    return `<strong>${esc(d.title)}</strong>`
      + (mins > 0 ? `<br>${mins}m spent` : '')
      + (noteCount > 0 ? `<br>📝 ${noteCount} note${noteCount > 1 ? 's' : ''}` : '');
  });

  node.on('click', (e, d) => { if (e.defaultPrevented) return; openNotesDrawer(d); });

  simulation.on('tick', () => {
    link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    node.attr('transform', d => `translate(${d.x},${d.y})`);
  });
}

// ─────────────────────────────────────────────
//  VIEW 2 — TIMELINE (chronological with dupes)
// ─────────────────────────────────────────────
function renderTimeline(nodes) {
  const W        = 460;
  const ROW_H    = 52;
  const PAD_LEFT = 100;
  const H        = Math.max(300, nodes.length * ROW_H + 40);
  const svg      = initSvg(W, H);

  const g = svg.append('g');
  svg.call(d3.zoom().scaleExtent([0.5, 2]).on('zoom', (e) => g.attr('transform', e.transform)));

  const maxTime  = Math.max(...nodes.map(n => n.timeSpent || 0), 1);
  const barScale = d3.scaleLinear().domain([0, maxTime]).range([4, W - PAD_LEFT - 40]);

  g.append('line')
    .attr('x1', PAD_LEFT - 16).attr('y1', 20)
    .attr('x2', PAD_LEFT - 16).attr('y2', H - 20)
    .attr('stroke', '#1e3a5a').attr('stroke-width', 2);

  const row = g.selectAll('g.trow')
    .data(nodes).join('g')
    .attr('class', 'trow')
    .attr('transform', (d, i) => `translate(0, ${i * ROW_H + 20})`);

  row.append('circle')
    .attr('cx', PAD_LEFT - 16).attr('cy', 16).attr('r', 4)
    .attr('fill', (d, i) => i === 0 ? '#4caf77' : i === nodes.length - 1 ? '#f7d67e' : '#7eb8f7')
    .attr('stroke', '#0f0f0f').attr('stroke-width', 1.5);

  row.append('line')
    .attr('x1', PAD_LEFT - 16).attr('y1', 16)
    .attr('x2', PAD_LEFT - 4) .attr('y2', 16)
    .attr('stroke', '#1e3a5a').attr('stroke-width', 1);

  row.append('text')
    .attr('x', PAD_LEFT - 22).attr('y', 20)
    .attr('text-anchor', 'end').attr('font-size', 9).attr('fill', '#555')
    .text(d => formatTime(new Date(d.time)));

  row.append('rect')
    .attr('x', PAD_LEFT).attr('y', 8)
    .attr('height', 16).attr('rx', 3)
    .attr('width', d => barScale(d.timeSpent || 0))
    .attr('fill',   (d, i) => i === 0 ? '#1a3a2a' : i === nodes.length - 1 ? '#2a2a1a' : '#1a2f4a')
    .attr('stroke', (d, i) => i === 0 ? '#4caf77' : i === nodes.length - 1 ? '#f7d67e' : '#7eb8f7')
    .attr('stroke-width', 1)
    .style('cursor', 'pointer')
    .on('click', (e, d) => openNotesDrawer({ ...d, notes: d.notes || [] }));

  // D3 text elements use .text() not innerHTML — no escaping needed here
  row.append('text')
    .attr('x', PAD_LEFT + 6).attr('y', 20)
    .attr('font-size', 10).attr('fill', '#ccc')
    .attr('pointer-events', 'none')
    .text(d => d.title.length > 32 ? d.title.slice(0, 30) + '…' : d.title);

  row.filter(d => (d.notes || []).length > 0)
    .append('text')
    .attr('x', PAD_LEFT + barScale(0) + 6).attr('y', 20)
    .attr('font-size', 9).attr('fill', '#888')
    .attr('pointer-events', 'none')
    .text(d => `📝 ${d.notes.length}`);

  attachTooltip(row, d => {
    const mins      = Math.round((d.timeSpent || 0) / 60000);
    const secs      = Math.round((d.timeSpent || 0) / 1000) % 60;
    const noteCount = (d.notes || []).length;
    return `<strong>${esc(d.title)}</strong>`
      + `<br>${mins > 0 ? `${mins}m ${secs}s` : `${secs}s`} spent`
      + (noteCount > 0 ? `<br>📝 ${noteCount} note${noteCount > 1 ? 's' : ''}` : '');
  });
}

// ─────────────────────────────────────────────
//  END TRAIL
// ─────────────────────────────────────────────
btnEnd.addEventListener('click', async () => {
  if (!currentSession || currentTabId === null) return;

  try {
    const { completedTrails = [] } = await chrome.storage.local.get('completedTrails');
    completedTrails.push({ ...currentSession, endTime: Date.now() });
    const all = await getActiveTabSessions();
    delete all[currentTabId];
    await chrome.storage.local.set({ completedTrails, activeTabSessions: all });
  } catch (e) {
    console.error('[WikiTrail] Failed to end trail:', e);
  }

  clearInterval(elapsedInterval);
  currentSession = null;
  currentNodes   = null;
  setIdleUI();
});

async function getActiveTabSessions() {
  const { activeTabSessions } = await chrome.storage.local.get('activeTabSessions');
  return activeTabSessions || {};
}

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
    historyList.innerHTML = '<p class="no-history">No past trails yet. Go explore!</p>';
    return;
  }

  [...trails].reverse().forEach((trail) => {
    const div      = document.createElement('div');
    div.className  = 'trail-item';
    const date     = new Date(trail.startTime);
    const duration = Math.round((trail.endTime - trail.startTime) / 60000);
    const first    = trail.nodes[0]?.title   || '?';
    const last     = trail.nodes[trail.nodes.length - 1]?.title || '?';

    // Use esc() on article titles before injecting into innerHTML
    const dateEl = document.createElement('div');
    dateEl.className   = 'trail-date';
    dateEl.textContent = `${date.toLocaleDateString()} at ${formatTime(date)} · ${duration}m`;

    const summaryEl = document.createElement('div');
    summaryEl.className = 'trail-summary';
    summaryEl.innerHTML = `<strong>${esc(first)}</strong> → … → <strong>${esc(last)}</strong> &nbsp;·&nbsp; ${trail.nodes.length} articles`;

    div.appendChild(dateEl);
    div.appendChild(summaryEl);

    div.addEventListener('click', () => {
      historyPanel.classList.remove('open');
      emptyState.style.display = 'none';
      renderView(trail.nodes);
    });

    historyList.appendChild(div);
  });
}

// ─────────────────────────────────────────────
//  NOTES DRAWER
// ─────────────────────────────────────────────
function openNotesDrawer(nodeData) {
  drawerTitle.textContent = nodeData.title;   // .textContent — safe
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
      const div      = document.createElement('div');
      div.className  = 'note-item';
      const timeStr  = new Date(note.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const textEl   = document.createElement('div');
      textEl.textContent = note.text;   // .textContent — safe

      const timeEl   = document.createElement('div');
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
//  LIVE POLLING
//  Polls every 1s when an active session exists,
//  backs off to every 5s when idle.
// ─────────────────────────────────────────────
let lastNodeCount  = 0;
let pollFast       = false;

function startPolling() {
  let idleRounds = 0;

  async function poll() {
    if (currentTabId === null) {
      // Try to find an active Wikipedia tab
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab && /wikipedia\.org\/wiki\//.test(activeTab.url)) {
        currentTabId = activeTab.id;
      }
    }

    if (currentTabId !== null) {
      const session = await getSessionForTab(currentTabId);

      if (session && session.nodes.length !== lastNodeCount) {
        lastNodeCount  = session.nodes.length;
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

    // Back off when idle: first 5 rounds fast (1s), then slow (5s)
    idleRounds++;
    const isActive = currentSession !== null;
    const delay    = (isActive || idleRounds < 5) ? 1000 : 5000;
    setTimeout(poll, delay);
  }

  setTimeout(poll, 1000);
}

// ─────────────────────────────────────────────
//  GO
// ─────────────────────────────────────────────
init();
startPolling();
