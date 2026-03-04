// ─────────────────────────────────────────────
//  WikiTrail — popup.js
// ─────────────────────────────────────────────

const statusDot      = document.getElementById('status-dot');
const statusText     = document.getElementById('status-text');
const pageCount      = document.getElementById('page-count');
const timeElapsed    = document.getElementById('time-elapsed');
const sessionLabel   = document.getElementById('session-start-label');
const emptyState     = document.getElementById('empty-state');
const graphSvg       = document.getElementById('graph-svg');
const tooltip        = document.getElementById('tooltip');
const btnEnd         = document.getElementById('btn-end');
const btnHistory     = document.getElementById('btn-history');
const btnExport      = document.getElementById('btn-export');
const historyPanel   = document.getElementById('history-panel');
const historyList    = document.getElementById('history-list');
const btnCloseHist   = document.getElementById('btn-close-history');
const notesDrawer    = document.getElementById('notes-drawer');
const drawerTitle    = document.getElementById('drawer-node-title');
const drawerLink     = document.getElementById('drawer-wiki-link');
const notesList      = document.getElementById('notes-list');
const btnCloseDrawer = document.getElementById('btn-close-drawer');
const viewSelect     = document.getElementById('view-select');

let elapsedInterval  = null;
let currentSession   = null;
let currentView      = 'network'; // 'network' | 'timeline' | 'heatmap'
let currentNodes     = null;      // last rendered node list, for view switching

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────
async function init() {
  const { activeSession } = await chrome.storage.local.get('activeSession');
  currentSession = activeSession || null;

  if (currentSession && currentSession.nodes.length > 0) {
    setActiveUI(currentSession);
    renderView(currentSession.nodes);
    startElapsedTimer(currentSession.startTime);
  } else {
    setIdleUI();
  }
}

// ─────────────────────────────────────────────
//  VIEW ROUTER
// ─────────────────────────────────────────────
function renderView(nodes) {
  currentNodes = nodes;
  notesDrawer.classList.remove('open'); // close drawer on view change
  if      (currentView === 'network')  renderNetwork(nodes);
  else if (currentView === 'timeline') renderTimeline(nodes);
  else if (currentView === 'heatmap')  renderHeatmap(nodes);
}

viewSelect.addEventListener('change', () => {
  currentView = viewSelect.value;
  if (currentNodes) renderView(currentNodes);
});

// ─────────────────────────────────────────────
//  UI STATE HELPERS
// ─────────────────────────────────────────────
function setActiveUI(session) {
  statusDot.classList.add('active');
  statusText.textContent = 'tracking';
  btnEnd.disabled = false;
  btnExport.disabled = false;
  emptyState.style.display = 'none';
  pageCount.textContent = session.nodes.length;
  const start = new Date(session.startTime);
  sessionLabel.textContent = `started ${formatTime(start)}`;
}

function setIdleUI() {
  statusDot.classList.remove('active');
  statusText.textContent = 'idle';
  btnEnd.disabled = true;
  btnExport.disabled = true;
  emptyState.style.display = 'flex';
  pageCount.textContent = '0';
  timeElapsed.textContent = '0m';
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
//  SHARED SVG SETUP HELPER
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
      let y = event.clientY - rect.top - 10;
      if (x + 190 > rect.width) x -= 200;
      tooltip.style.left = `${x}px`;
      tooltip.style.top  = `${y}px`;
    })
    .on('mouseleave', () => tooltip.classList.remove('visible'));
}

// ─────────────────────────────────────────────
//  VIEW 1 — NETWORK GRAPH (force-directed)
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
    const mins = Math.round(d.timeSpent / 60000);
    const noteCount = (d.notes || []).length;
    return `<strong>${d.title}</strong>${mins > 0 ? `<br>${mins}m spent` : ''} ${noteCount > 0 ? `<br>📝 ${noteCount} note${noteCount > 1 ? 's' : ''}` : ''}`;
  });

  node.on('click', (e, d) => { if (e.defaultPrevented) return; openNotesDrawer(d); });

  simulation.on('tick', () => {
    link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    node.attr('transform', d => `translate(${d.x},${d.y})`);
  });
}

// ─────────────────────────────────────────────
//  VIEW 2 — TIMELINE (chronological, with dupes)
//  Vertical scrollable list showing every page
//  visit in order, including revisits.
// ─────────────────────────────────────────────
function renderTimeline(nodes) {
  const W        = 460;
  const ROW_H    = 52;
  const PAD_LEFT = 100;
  const H        = Math.max(300, nodes.length * ROW_H + 40);
  const svg      = initSvg(W, H);

  svg.call(d3.zoom().scaleExtent([0.5, 2]).on('zoom', (e) => g.attr('transform', e.transform)));

  const g = svg.append('g');

  const maxTime = Math.max(...nodes.map(n => n.timeSpent || 0), 1);
  const barScale = d3.scaleLinear().domain([0, maxTime]).range([4, W - PAD_LEFT - 40]);

  // Spine line
  g.append('line')
    .attr('x1', PAD_LEFT - 16).attr('y1', 20)
    .attr('x2', PAD_LEFT - 16).attr('y2', H - 20)
    .attr('stroke', '#1e3a5a').attr('stroke-width', 2);

  const row = g.selectAll('g.trow')
    .data(nodes).join('g')
    .attr('class', 'trow')
    .attr('transform', (d, i) => `translate(0, ${i * ROW_H + 20})`);

  // Connector dot on spine
  row.append('circle')
    .attr('cx', PAD_LEFT - 16).attr('cy', 16)
    .attr('r', 4)
    .attr('fill', (d, i) => i === 0 ? '#4caf77' : i === nodes.length - 1 ? '#f7d67e' : '#7eb8f7')
    .attr('stroke', '#0f0f0f').attr('stroke-width', 1.5);

  // Connector tick
  row.append('line')
    .attr('x1', PAD_LEFT - 16).attr('y1', 16)
    .attr('x2', PAD_LEFT - 4) .attr('y2', 16)
    .attr('stroke', '#1e3a5a').attr('stroke-width', 1);

  // Time label (left)
  row.append('text')
    .attr('x', PAD_LEFT - 22).attr('y', 20)
    .attr('text-anchor', 'end')
    .attr('font-size', 9).attr('fill', '#555')
    .text(d => {
      const t = new Date(d.time);
      return t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    });

  // Time spent bar
  row.append('rect')
    .attr('x', PAD_LEFT).attr('y', 8)
    .attr('height', 16).attr('rx', 3)
    .attr('width', d => barScale(d.timeSpent || 0))
    .attr('fill', (d, i) => i === 0 ? '#1a3a2a' : i === nodes.length - 1 ? '#2a2a1a' : '#1a2f4a')
    .attr('stroke', (d, i) => i === 0 ? '#4caf77' : i === nodes.length - 1 ? '#f7d67e' : '#7eb8f7')
    .attr('stroke-width', 1)
    .style('cursor', 'pointer')
    .on('click', (e, d) => openNotesDrawer({ ...d, notes: d.notes || [] }));

  // Article title on bar
  row.append('text')
    .attr('x', PAD_LEFT + 6).attr('y', 20)
    .attr('font-size', 10).attr('fill', '#ccc')
    .attr('pointer-events', 'none')
    .text(d => d.title.length > 32 ? d.title.slice(0, 30) + '…' : d.title);

  // Notes badge
  row.filter(d => (d.notes || []).length > 0)
    .append('text')
    .attr('x', PAD_LEFT + barScale(0) + 6)
    .attr('y', 20)
    .attr('font-size', 9).attr('fill', '#888')
    .attr('pointer-events', 'none')
    .text(d => `📝 ${d.notes.length}`);

  attachTooltip(row, d => {
    const mins = Math.round((d.timeSpent || 0) / 60000);
    const secs = Math.round((d.timeSpent || 0) / 1000) % 60;
    const noteCount = (d.notes || []).length;
    return `<strong>${d.title}</strong><br>${mins > 0 ? `${mins}m ${secs}s` : `${secs}s`} spent${noteCount > 0 ? `<br>📝 ${noteCount} note${noteCount > 1 ? 's' : ''}` : ''}`;
  });
}

// ─────────────────────────────────────────────
//  VIEW 3 — RABBIT HOLE SPIRAL 🐇
//  Articles arranged in an Archimedean spiral,
//  ordered chronologically from centre outward.
//  The deeper into the hole you went, the further
//  from the centre. Links trace the path as a
//  glowing thread. Unique articles only — revisits
//  pulse their node instead of duplicating.
// ─────────────────────────────────────────────
function renderHeatmap(nodes) {
  const W = 480, H = 320;
  const svg = initSvg(W, H);

  // Deduplicate for the spiral, preserving first-visit order
  const seen    = new Map();
  const unique  = [];
  nodes.forEach((n, i) => {
    if (!seen.has(n.title)) { seen.set(n.title, unique.length); unique.push({ ...n, visitCount: 1, notes: n.notes || [] }); }
    else                     { unique[seen.get(n.title)].visitCount++; }
  });

  const total = unique.length;
  if (total === 0) return;

  // Spiral layout: r = a * theta
  const a        = 18;        // tightness
  const thetaStep = 0.55;     // angle step per article
  const positions = unique.map((n, i) => {
    const theta = i * thetaStep;
    const r     = a * theta;
    return {
      ...n,
      x: W / 2 + r * Math.cos(theta),
      y: H / 2 + r * Math.sin(theta),
      theta, r
    };
  });

  const maxTime  = Math.max(...positions.map(n => n.timeSpent || 0), 1);
  const rScale   = d3.scaleLinear().domain([0, maxTime]).range([5, 15]);
  const depthMax = positions.length - 1;

  // Colour: gradient from teal (shallow) to amber (deep)
  const colourScale = d3.scaleSequential()
    .domain([0, depthMax])
    .interpolator(d3.interpolateRgb('#4caf77', '#f7a03a'));

  const g = svg.append('g');
  svg.call(d3.zoom().scaleExtent([0.4, 3]).on('zoom', (e) => g.attr('transform', e.transform)));

  // Glowing spiral path (decorative underlay)
  const lineGen = d3.line().x(d => d.x).y(d => d.y).curve(d3.curveCatmullRom.alpha(0.5));

  g.append('path')
    .datum(positions)
    .attr('d', lineGen)
    .attr('fill', 'none')
    .attr('stroke', '#1a2f4a')
    .attr('stroke-width', 12)
    .attr('opacity', 0.5);

  g.append('path')
    .datum(positions)
    .attr('d', lineGen)
    .attr('fill', 'none')
    .attr('stroke', '#7eb8f7')
    .attr('stroke-width', 1.2)
    .attr('stroke-dasharray', '4 3')
    .attr('opacity', 0.4);

  // Nodes
  const node = g.selectAll('g.snode')
    .data(positions).join('g')
    .attr('class', 'snode')
    .attr('transform', d => `translate(${d.x},${d.y})`)
    .style('cursor', 'pointer');

  // Glow ring for revisited articles
  node.filter(d => d.visitCount > 1)
    .append('circle')
    .attr('r', d => rScale(d.timeSpent || 0) + 5)
    .attr('fill', 'none')
    .attr('stroke', d => colourScale(positions.indexOf(d)))
    .attr('stroke-width', 1.5)
    .attr('opacity', 0.35);

  node.append('circle')
    .attr('r', d => rScale(d.timeSpent || 0))
    .attr('fill', (d, i) => {
      if (i === 0)              return '#1a3a2a';
      if (i === total - 1)      return '#2a2a1a';
      return '#131d2e';
    })
    .attr('stroke', (d, i) => colourScale(i))
    .attr('stroke-width', 1.8);

  // Depth index label inside circle
  node.append('text')
    .attr('text-anchor', 'middle').attr('dy', '0.35em')
    .attr('font-size', 8).attr('fill', '#aaa')
    .attr('pointer-events', 'none')
    .text((d, i) => i + 1);

  // Article label outside
  node.append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', d => rScale(d.timeSpent || 0) + 11)
    .attr('font-size', 9).attr('fill', '#bbb')
    .attr('pointer-events', 'none')
    .text(d => d.title.length > 16 ? d.title.slice(0, 14) + '…' : d.title);

  attachTooltip(node, (d) => {
    const i    = positions.indexOf(d);
    const mins = Math.round((d.timeSpent || 0) / 60000);
    const secs = Math.round((d.timeSpent || 0) / 1000) % 60;
    const noteCount = (d.notes || []).length;
    return `<strong>${d.title}</strong><br>#${i + 1} in the hole`
      + (d.visitCount > 1 ? `<br>↩ revisited ${d.visitCount}×` : '')
      + `<br>${mins > 0 ? `${mins}m ${secs}s` : `${secs}s`} spent`
      + (noteCount > 0 ? `<br>📝 ${noteCount} note${noteCount > 1 ? 's' : ''}` : '');
  });

  node.on('click', (e, d) => { if (e.defaultPrevented) return; openNotesDrawer(d); });
}

// ─────────────────────────────────────────────
//  END TRAIL
// ─────────────────────────────────────────────
btnEnd.addEventListener('click', async () => {
  if (!currentSession) return;
  const { completedTrails = [] } = await chrome.storage.local.get('completedTrails');
  completedTrails.push({ ...currentSession, endTime: Date.now() });
  await chrome.storage.local.set({ completedTrails, activeSession: null });
  clearInterval(elapsedInterval);
  currentSession = null;
  currentNodes   = null;
  setIdleUI();
});

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
  if (trails.length === 0) {
    historyList.innerHTML = '<p class="no-history">No past trails yet. Go explore!</p>';
    return;
  }
  historyList.innerHTML = '';
  [...trails].reverse().forEach((trail) => {
    const div      = document.createElement('div');
    div.className  = 'trail-item';
    const date     = new Date(trail.startTime);
    const duration = Math.round((trail.endTime - trail.startTime) / 60000);
    const first    = trail.nodes[0]?.title || '?';
    const last     = trail.nodes[trail.nodes.length - 1]?.title || '?';
    div.innerHTML  = `
      <div class="trail-date">${date.toLocaleDateString()} at ${formatTime(date)} · ${duration}m</div>
      <div class="trail-summary"><strong>${first}</strong> → … → <strong>${last}</strong> &nbsp;·&nbsp; ${trail.nodes.length} articles</div>
    `;
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
  drawerTitle.textContent = nodeData.title;
  drawerLink.href         = nodeData.url;
  notesList.innerHTML     = '';

  const notes = nodeData.notes || [];
  if (notes.length === 0) {
    notesList.innerHTML = '<p class="no-notes">No notes yet. Highlight text on this Wikipedia page and right-click → "Save to current hole".</p>';
  } else {
    notes.forEach(note => {
      const div       = document.createElement('div');
      div.className   = 'note-item';
      const time      = new Date(note.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      div.innerHTML   = `<div>${escapeHtml(note.text)}</div><div class="note-time">${time}</div>`;
      notesList.appendChild(div);
    });
  }
  notesDrawer.classList.add('open');
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

btnCloseDrawer.addEventListener('click', () => notesDrawer.classList.remove('open'));

// ─────────────────────────────────────────────
//  EXPORT PNG
// ─────────────────────────────────────────────
btnExport.addEventListener('click', () => {
  const svgEl   = document.getElementById('graph-svg');
  const svgData = new XMLSerializer().serializeToString(svgEl);
  const canvas  = document.createElement('canvas');
  const ctx     = canvas.getContext('2d');
  const img     = new Image();
  canvas.width  = svgEl.clientWidth  || 460;
  canvas.height = svgEl.clientHeight || 300;
  const blob    = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url     = URL.createObjectURL(blob);
  img.onload    = () => {
    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    const link    = document.createElement('a');
    link.download = `wikitrail-${Date.now()}.png`;
    link.href     = canvas.toDataURL('image/png');
    link.click();
  };
  img.src = url;
});

// ─────────────────────────────────────────────
//  LIVE POLLING
// ─────────────────────────────────────────────
let lastNodeCount = 0;

function startPolling() {
  setInterval(async () => {
    const { activeSession } = await chrome.storage.local.get('activeSession');

    if (activeSession && activeSession.nodes.length !== lastNodeCount) {
      lastNodeCount  = activeSession.nodes.length;
      currentSession = activeSession;
      setActiveUI(activeSession);
      renderView(activeSession.nodes);
      startElapsedTimer(activeSession.startTime);
    }

    if (!activeSession && currentSession) {
      currentSession = null;
      currentNodes   = null;
      lastNodeCount  = 0;
      setIdleUI();
    }
  }, 1000);
}

// ─────────────────────────────────────────────
//  GO
// ─────────────────────────────────────────────
init();
startPolling();
