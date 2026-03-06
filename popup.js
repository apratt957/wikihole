// ─────────────────────────────────────────────
//  WikiTrail — popup.js
// ─────────────────────────────────────────────

const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const pageCount = document.getElementById("page-count");
const timeElapsed = document.getElementById("time-elapsed");
const sessionLabel = document.getElementById("session-start-label");
const emptyState = document.getElementById("empty-state");
const tooltip = document.getElementById("tooltip");
const btnEnd = document.getElementById("btn-end");
const btnHistory = document.getElementById("btn-history");
const btnSearchNotes = document.getElementById("btn-search-notes");
const historyPanel = document.getElementById("history-panel");
const historyList = document.getElementById("history-list");
const btnCloseHist = document.getElementById("btn-close-history");
const searchPanel = document.getElementById("search-panel");
const btnCloseSearch = document.getElementById("btn-close-search");
const searchInput = document.getElementById("notes-search-input");
const searchResults = document.getElementById("search-results");
const notesDrawer = document.getElementById("notes-drawer");
const drawerTitle = document.getElementById("drawer-node-title");
const drawerLink = document.getElementById("drawer-wiki-link");
const notesList = document.getElementById("notes-list");
const btnCloseDrawer = document.getElementById("btn-close-drawer");
const viewSelect = document.getElementById("view-select");
const endModal = document.getElementById("end-modal");
const modalName = document.getElementById("modal-name");
const modalTags = document.getElementById("modal-tags");
const btnModalCancel = document.getElementById("btn-modal-cancel");
const btnModalConfirm = document.getElementById("btn-modal-confirm");

let elapsedInterval = null;
let currentSession = null;
let currentTabId = null;
let currentView = "network";
let currentNodes = null;

// ─────────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseTags(str) {
  return str
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(ms) {
  const mins = Math.round(ms / 60000);
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// ─────────────────────────────────────────────
//  STORAGE HELPERS
// ─────────────────────────────────────────────
async function getSessionForTab(tabId) {
  const { activeTabSessions } =
    await chrome.storage.local.get("activeTabSessions");
  return (activeTabSessions && activeTabSessions[tabId]) || null;
}

async function getActiveTabSessions() {
  const { activeTabSessions } =
    await chrome.storage.local.get("activeTabSessions");
  return activeTabSessions || {};
}

async function getAllTrails() {
  const { completedTrails = [] } =
    await chrome.storage.local.get("completedTrails");
  return completedTrails;
}

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────
async function init() {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (activeTab && /wikipedia\.org\/wiki\//.test(activeTab.url)) {
    currentTabId = activeTab.id;
    currentSession = await getSessionForTab(currentTabId);

    if (currentSession && currentSession.nodes.length > 0) {
      setActiveUI(currentSession);
      renderView(currentSession.nodes);
      startElapsedTimer(currentSession.startTime);
      return;
    }
  }

  setIdleUI();
}

// ─────────────────────────────────────────────
//  VIEW ROUTER
// ─────────────────────────────────────────────
function renderView(nodes) {
  currentNodes = nodes;
  notesDrawer.classList.remove("open");
  if (currentView === "network") renderNetwork(nodes);
  else if (currentView === "timeline") renderTimeline(nodes);
}

viewSelect.addEventListener("change", () => {
  currentView = viewSelect.value;
  if (currentNodes) renderView(currentNodes);
});

// ─────────────────────────────────────────────
//  UI STATE
// ─────────────────────────────────────────────
function setActiveUI(session) {
  statusDot.classList.add("active");
  statusText.textContent = "tracking";
  btnEnd.disabled = false;
  emptyState.style.display = "none";
  pageCount.textContent = session.nodes.length;
  sessionLabel.textContent = `started ${formatTime(new Date(session.startTime))}`;
}

function setIdleUI() {
  statusDot.classList.remove("active");
  statusText.textContent = "idle";
  btnEnd.disabled = true;
  emptyState.style.display = "flex";
  pageCount.textContent = "0";
  timeElapsed.textContent = "0m";
  sessionLabel.textContent = "";
  clearInterval(elapsedInterval);
  d3.select("#graph-svg").selectAll("*").remove();
}

function startElapsedTimer(startTime) {
  clearInterval(elapsedInterval);
  function update() {
    const mins = Math.floor((Date.now() - startTime) / 60000);
    timeElapsed.textContent =
      mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }
  update();
  elapsedInterval = setInterval(update, 10000);
}

// ─────────────────────────────────────────────
//  END TRAIL MODAL
// ─────────────────────────────────────────────
btnEnd.addEventListener("click", () => {
  if (!currentSession) return;
  modalName.value = "";
  modalTags.value = "";
  endModal.classList.add("open");
  modalName.focus();
});

btnModalCancel.addEventListener("click", () =>
  endModal.classList.remove("open"),
);

btnModalConfirm.addEventListener("click", async () => {
  if (!currentSession || currentTabId === null) return;

  const finishedTrail = {
    ...currentSession,
    endTime: Date.now(),
    name: modalName.value.trim() || null,
    tags: parseTags(modalTags.value),
  };

  try {
    const trails = await getAllTrails();
    trails.push(finishedTrail);
    const all = await getActiveTabSessions();
    delete all[currentTabId];
    await chrome.storage.local.set({
      completedTrails: trails,
      activeTabSessions: all,
    });
  } catch (e) {
    console.error("[WikiTrail] Failed to save trail:", e);
  }

  endModal.classList.remove("open");
  clearInterval(elapsedInterval);
  currentSession = null;
  currentNodes = null;
  setIdleUI();
});

modalName.addEventListener("keydown", (e) => {
  if (e.key === "Enter") modalTags.focus();
});
modalTags.addEventListener("keydown", (e) => {
  if (e.key === "Enter") btnModalConfirm.click();
});

// ─────────────────────────────────────────────
//  HISTORY PANEL
// ─────────────────────────────────────────────
btnHistory.addEventListener("click", async () => {
  renderHistoryList(await getAllTrails());
  historyPanel.classList.add("open");
});

btnCloseHist.addEventListener("click", () =>
  historyPanel.classList.remove("open"),
);

function renderHistoryList(trails) {
  historyList.innerHTML = "";

  if (trails.length === 0) {
    const p = document.createElement("p");
    p.className = "no-history";
    p.textContent = "No past trails yet. Go explore!";
    historyList.appendChild(p);
    return;
  }

  [...trails].reverse().forEach((trail, reversedIdx) => {
    const realIdx = trails.length - 1 - reversedIdx;
    const div = document.createElement("div");
    div.className = "trail-item";

    const date = new Date(trail.startTime);
    const duration = formatDuration(
      (trail.endTime || Date.now()) - trail.startTime,
    );
    const first = trail.nodes[0]?.title || "?";
    const last = trail.nodes[trail.nodes.length - 1]?.title || "?";
    const noteTotal = trail.nodes.reduce(
      (a, n) => a + (n.notes?.length || 0),
      0,
    );

    // Top row
    const topRow = document.createElement("div");
    topRow.className = "trail-item-top";

    const mainArea = document.createElement("div");
    mainArea.className = "trail-item-main";

    const nameEl = document.createElement("div");
    nameEl.className = trail.name ? "trail-name" : "trail-name unnamed";
    nameEl.textContent = trail.name || "Unnamed trail";

    const dateEl = document.createElement("div");
    dateEl.className = "trail-date";
    dateEl.textContent = `${date.toLocaleDateString()} at ${formatTime(date)} · ${duration} · ${trail.nodes.length} articles${noteTotal > 0 ? ` · 📝 ${noteTotal}` : ""}`;

    const summaryEl = document.createElement("div");
    summaryEl.className = "trail-summary";
    summaryEl.innerHTML = `<strong>${esc(first)}</strong> → … → <strong>${esc(last)}</strong>`;

    mainArea.appendChild(nameEl);
    mainArea.appendChild(dateEl);
    mainArea.appendChild(summaryEl);

    if (trail.tags?.length > 0) {
      const tagsEl = document.createElement("div");
      tagsEl.className = "trail-tags";
      trail.tags.forEach((tag) => {
        const pill = document.createElement("span");
        pill.className = "tag-pill";
        pill.textContent = tag;
        tagsEl.appendChild(pill);
      });
      mainArea.appendChild(tagsEl);
    }

    mainArea.addEventListener("click", () => {
      historyPanel.classList.remove("open");
      emptyState.style.display = "none";
      renderView(trail.nodes);
    });

    // Action buttons
    const actionsEl = document.createElement("div");
    actionsEl.className = "trail-actions";

    const btnEdit = makeActionBtn("✎", "Rename / retag");
    const btnExportH = makeActionBtn("H", "Export as HTML");
    const btnExportM = makeActionBtn("M", "Export as Markdown");
    const btnDelete = makeActionBtn("🗑", "Delete trail");
    btnDelete.style.cssText =
      "flex:0;padding:3px 8px;font-size:11px;color:#6a3030;background:#1a1a1a;border-color:#3a2020;";

    actionsEl.appendChild(btnEdit);
    actionsEl.appendChild(btnExportH);
    actionsEl.appendChild(btnExportM);
    actionsEl.appendChild(btnDelete);
    topRow.appendChild(mainArea);
    topRow.appendChild(actionsEl);
    div.appendChild(topRow);

    // Inline edit form
    const editForm = buildEditForm(trail, realIdx, (editForm) => {
      // on save callback — re-render list
      getAllTrails().then(renderHistoryList);
      editForm.classList.remove("open");
    });
    div.appendChild(editForm);

    btnEdit.addEventListener("click", (e) => {
      e.stopPropagation();
      editForm.classList.toggle("open");
      if (editForm.classList.contains("open"))
        editForm.querySelector("input").focus();
    });

    btnExportH.addEventListener("click", (e) => {
      e.stopPropagation();
      exportHtml(trail);
    });
    btnExportM.addEventListener("click", (e) => {
      e.stopPropagation();
      exportMarkdown(trail);
    });

    btnDelete.addEventListener("click", async (e) => {
      e.stopPropagation();
      // Swap button to a confirm state instead of a disruptive modal
      if (btnDelete.dataset.confirming !== "true") {
        btnDelete.dataset.confirming = "true";
        btnDelete.textContent = "?";
        btnDelete.title = "Click again to confirm delete";
        btnDelete.style.color = "#e07070";
        btnDelete.style.borderColor = "#e07070";
        // Auto-reset after 3s if not confirmed
        setTimeout(() => {
          if (btnDelete.dataset.confirming === "true") {
            btnDelete.dataset.confirming = "false";
            btnDelete.textContent = "🗑";
            btnDelete.title = "Delete trail";
            btnDelete.style.color = "#6a3030";
            btnDelete.style.borderColor = "#3a2020";
          }
        }, 3000);
        return;
      }
      // Confirmed — delete
      try {
        const trails = await getAllTrails();
        trails.splice(realIdx, 1);
        await chrome.storage.local.set({ completedTrails: trails });
        renderHistoryList(trails);
      } catch (err) {
        console.error("[WikiTrail] Failed to delete trail:", err);
      }
    });

    historyList.appendChild(div);
  });
}

function makeActionBtn(label, title) {
  const btn = document.createElement("button");
  btn.className = "trail-action-btn";
  btn.textContent = label;
  btn.title = title;
  return btn;
}

function buildEditForm(trail, realIdx, onSave) {
  const form = document.createElement("div");
  form.className = "trail-edit-form";

  const nameInput = document.createElement("input");
  nameInput.className = "modal-input";
  nameInput.type = "text";
  nameInput.placeholder = "Trail name";
  nameInput.maxLength = 80;
  nameInput.value = trail.name || "";

  const tagsInput = document.createElement("input");
  tagsInput.className = "modal-input";
  tagsInput.type = "text";
  tagsInput.placeholder = "Tags (comma-separated)";
  tagsInput.maxLength = 120;
  tagsInput.value = (trail.tags || []).join(", ");

  const actions = document.createElement("div");
  actions.className = "modal-actions";

  const btnCancel = document.createElement("button");
  btnCancel.textContent = "Cancel";
  btnCancel.addEventListener("click", () => form.classList.remove("open"));

  const btnSave = document.createElement("button");
  btnSave.textContent = "Save";
  btnSave.style.cssText =
    "background:#1a3a2a;color:#4caf77;border-color:#2a5a3a;";
  btnSave.addEventListener("click", async () => {
    try {
      const trails = await getAllTrails();
      trails[realIdx].name = nameInput.value.trim() || null;
      trails[realIdx].tags = parseTags(tagsInput.value);
      await chrome.storage.local.set({ completedTrails: trails });
      onSave(form);
    } catch (e) {
      console.error("[WikiTrail] Failed to save edits:", e);
    }
  });

  actions.appendChild(btnCancel);
  actions.appendChild(btnSave);
  form.appendChild(nameInput);
  form.appendChild(tagsInput);
  form.appendChild(actions);
  return form;
}

// ─────────────────────────────────────────────
//  NOTE SEARCH PANEL
// ─────────────────────────────────────────────
btnSearchNotes.addEventListener("click", async () => {
  searchInput.value = "";
  searchResults.innerHTML = "";
  searchPanel.classList.add("open");
  searchInput.focus();
  // Show all notes on open
  performSearch("", await getAllTrails());
});

btnCloseSearch.addEventListener("click", () =>
  searchPanel.classList.remove("open"),
);

let searchDebounce = null;
searchInput.addEventListener("input", async () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(async () => {
    performSearch(searchInput.value.trim(), await getAllTrails());
  }, 180);
});

function performSearch(query, trails) {
  searchResults.innerHTML = "";

  // Collect all notes across all trails + active session
  const allNotes = [];

  // Include active session notes
  if (currentSession) {
    currentSession.nodes.forEach((node) => {
      (node.notes || []).forEach((note) => {
        allNotes.push({
          note,
          articleTitle: node.title,
          articleUrl: node.url,
          trailName: currentSession.name || "Current session",
          trailNodes: currentSession.nodes,
          isCurrent: true,
        });
      });
    });
  }

  // Completed trails
  trails.forEach((trail) => {
    trail.nodes.forEach((node) => {
      (node.notes || []).forEach((note) => {
        allNotes.push({
          note,
          articleTitle: node.title,
          articleUrl: node.url,
          trailName: trail.name || "Unnamed trail",
          trailDate: new Date(trail.startTime),
          trailNodes: trail.nodes,
          isCurrent: false,
        });
      });
    });
  });

  // Filter
  const q = query.toLowerCase();
  const matches = q
    ? allNotes.filter(
        (r) =>
          r.note.text.toLowerCase().includes(q) ||
          r.articleTitle.toLowerCase().includes(q) ||
          r.trailName.toLowerCase().includes(q),
      )
    : allNotes;

  if (matches.length === 0) {
    const p = document.createElement("p");
    p.className = "no-results";
    p.textContent = query
      ? `No notes matching "${query}"`
      : "No notes saved yet.";
    searchResults.appendChild(p);
    return;
  }

  matches.forEach(
    ({
      note,
      articleTitle,
      articleUrl,
      trailName,
      trailDate,
      trailNodes,
      isCurrent,
    }) => {
      const item = document.createElement("div");
      item.className = "search-result-item";

      // Note text — highlighted if query matches, linked if has fragment URL
      const noteEl = document.createElement("div");
      noteEl.className = "search-result-note";

      const noteContent = q ? highlightText(note.text, q) : esc(note.text);

      if (note.url) {
        noteEl.innerHTML = `<a href="${esc(note.url)}" target="_blank">${noteContent}</a>`;
      } else {
        noteEl.innerHTML = noteContent;
      }

      // Meta line
      const metaEl = document.createElement("div");
      metaEl.className = "search-result-meta";

      const articleSpan = document.createElement("span");
      articleSpan.className = "result-article";
      articleSpan.textContent = `📄 ${articleTitle}`;

      const trailSpan = document.createElement("span");
      trailSpan.className = "result-trail";
      trailSpan.textContent = isCurrent
        ? `🟢 ${trailName}`
        : `🗂 ${trailName}${trailDate ? ` · ${trailDate.toLocaleDateString()}` : ""}`;

      metaEl.appendChild(articleSpan);
      metaEl.appendChild(trailSpan);

      item.appendChild(noteEl);
      item.appendChild(metaEl);

      // Clicking the result row opens the trail graph at that article
      item.addEventListener("click", (e) => {
        if (e.target.tagName === "A") return; // let link clicks through
        searchPanel.classList.remove("open");
        emptyState.style.display = "none";
        renderView(trailNodes);
        // Open the notes drawer for that article after a tick
        setTimeout(() => {
          const node = trailNodes.find((n) => n.title === articleTitle);
          if (node) openNotesDrawer(node);
        }, 50);
      });

      searchResults.appendChild(item);
    },
  );
}

// Wrap query matches in a highlight span (safe — escapes before replacing)
function highlightText(text, query) {
  const escaped = esc(text);
  const escapedQ = esc(query).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${escapedQ})`, "gi");
  return escaped.replace(re, '<span class="search-highlight">$1</span>');
}

// ─────────────────────────────────────────────
//  NOTES DRAWER
// ─────────────────────────────────────────────
function openNotesDrawer(nodeData) {
  drawerTitle.textContent = nodeData.title;
  drawerLink.href = nodeData.url;
  notesList.innerHTML = "";

  const notes = nodeData.notes || [];
  if (notes.length === 0) {
    const p = document.createElement("p");
    p.className = "no-notes";
    p.textContent =
      'No notes yet. Highlight text on this Wikipedia page and right-click → "Save to current trail node".';
    notesList.appendChild(p);
  } else {
    notes.forEach((note) => {
      const div = document.createElement("div");
      div.className = "note-item";
      const timeStr = new Date(note.time).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      const textEl = document.createElement(note.url ? "a" : "div");
      textEl.textContent = note.text;
      if (note.url) {
        textEl.href = note.url;
        textEl.target = "_blank";
        textEl.className = "note-link";
      }

      const timeEl = document.createElement("div");
      timeEl.className = "note-time";
      timeEl.textContent = timeStr;

      div.appendChild(textEl);
      div.appendChild(timeEl);
      notesList.appendChild(div);
    });
  }

  notesDrawer.classList.add("open");
}

btnCloseDrawer.addEventListener("click", () =>
  notesDrawer.classList.remove("open"),
);

// ─────────────────────────────────────────────
//  EXPORT — HTML
// ─────────────────────────────────────────────
function exportHtml(trail) {
  const name = trail.name || "Unnamed trail";
  const tags = trail.tags || [];
  const date = new Date(trail.startTime);
  const duration = formatDuration(
    (trail.endTime || Date.now()) - trail.startTime,
  );
  const nodes = trail.nodes;
  const noteTotal = nodes.reduce((a, n) => a + (n.notes?.length || 0), 0);

  // ── Build unique node + link lists ──
  const nodeMap = new Map();
  const linkData = [];
  nodes.forEach((n, i) => {
    if (!nodeMap.has(n.title))
      nodeMap.set(n.title, {
        id: n.title,
        title: n.title,
        url: n.url,
        timeSpent: n.timeSpent || 0,
        index: i,
      });
  });
  nodes.forEach((n) => {
    if (n.from && nodeMap.has(n.from) && nodeMap.has(n.title))
      if (!linkData.some((l) => l.source === n.from && l.target === n.title))
        linkData.push({ source: n.from, target: n.title });
  });
  const nodeData = Array.from(nodeMap.values());

  // ── Static force layout — computed here, baked into SVG ──
  // Runs a simple iterative spring/repulsion simulation entirely in the
  // extension. Output is plain SVG with hardcoded coordinates — zero JS
  // required in the exported file, works on iOS Safari with no caveats.
  const W = 600,
    H = 380;
  const maxTime = Math.max(...nodeData.map((n) => n.timeSpent), 1);
  const rScale = (t) => 6 + (Math.min(t, maxTime) / maxTime) * 12; // 6–18px

  // Seed positions on a circle so the sim converges cleanly
  nodeData.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / nodeData.length;
    const rad = Math.min(W, H) * 0.3;
    n.x = W / 2 + rad * Math.cos(angle);
    n.y = H / 2 + rad * Math.sin(angle);
    n.vx = 0;
    n.vy = 0;
  });

  // Build a lookup for fast link traversal
  const idxById = new Map(nodeData.map((n, i) => [n.id, i]));
  const linkedPairs = linkData
    .map((l) => ({
      si: idxById.get(l.source),
      ti: idxById.get(l.target),
    }))
    .filter((l) => l.si !== undefined && l.ti !== undefined);

  const LINK_DIST = Math.min(W, H) * 0.22;
  const REPEL = 2800;
  const DAMP = 0.82;
  const CENTER_F = 0.012;
  const ITERATIONS = 280;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const alpha = 1 - iter / ITERATIONS;

    // Repulsion between all pairs
    for (let i = 0; i < nodeData.length; i++) {
      for (let j = i + 1; j < nodeData.length; j++) {
        const a = nodeData[i],
          b = nodeData[j];
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const d2 = dx * dx + dy * dy + 0.01;
        const f = (REPEL * alpha) / d2;
        a.vx -= f * dx;
        a.vy -= f * dy;
        b.vx += f * dx;
        b.vy += f * dy;
      }
    }

    // Spring attraction along links
    for (const { si, ti } of linkedPairs) {
      const a = nodeData[si],
        b = nodeData[ti];
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - LINK_DIST) * 0.3 * alpha;
      a.vx += f * (dx / d);
      a.vy += f * (dy / d);
      b.vx -= f * (dx / d);
      b.vy -= f * (dy / d);
    }

    // Centering
    nodeData.forEach((n) => {
      n.vx += (W / 2 - n.x) * CENTER_F;
      n.vy += (H / 2 - n.y) * CENTER_F;
      n.vx *= DAMP;
      n.vy *= DAMP;
      n.x += n.vx;
      n.y += n.vy;
      // Clamp to canvas with padding
      const r = rScale(n.timeSpent) + 14;
      n.x = Math.max(r, Math.min(W - r, n.x));
      n.y = Math.max(r, Math.min(H - r, n.y));
    });
  }

  // ── Render static SVG from computed positions ──
  const svgLines = linkData
    .map((l) => {
      const s = nodeData[idxById.get(l.source)];
      const t = nodeData[idxById.get(l.target)];
      if (!s || !t) return "";
      return `<line x1="${s.x.toFixed(1)}" y1="${s.y.toFixed(1)}" x2="${t.x.toFixed(1)}" y2="${t.y.toFixed(1)}" stroke="#2a4a6b" stroke-width="1.5" marker-end="url(#arrow)"/>`;
    })
    .join("\n");

  const svgNodes = nodeData
    .map((n, i) => {
      const r = rScale(n.timeSpent).toFixed(1);
      const isFirst = n.index === 0;
      const isLast = n.index === nodeData.length - 1;
      const fill = isFirst ? "#1a3a2a" : isLast ? "#2a2a1a" : "#1a2f4a";
      const stroke = isFirst ? "#4caf77" : isLast ? "#f7d67e" : "#7eb8f7";
      const sw = isLast ? "2" : "1.5";
      const label = n.title.length > 16 ? n.title.slice(0, 14) + "…" : n.title;
      const ly = (parseFloat(r) + 12).toFixed(1);
      return `<g>
  <circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>
  <text x="${n.x.toFixed(1)}" y="${(n.y + parseFloat(ly)).toFixed(1)}" text-anchor="middle" font-size="9.5" font-family="Georgia,serif" fill="#ccc">${esc(label)}</text>
</g>`;
    })
    .join("\n");

  const graphSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;background:#111;border-radius:8px;border:1px solid #1e1e1e;margin-bottom:8px">
  <defs>
    <marker id="arrow" viewBox="0 -4 8 8" refX="18" refY="0" markerWidth="5" markerHeight="5" orient="auto">
      <path d="M0,-4L8,0L0,4" fill="#2a4a6b"/>
    </marker>
  </defs>
  ${svgLines}
  ${svgNodes}
</svg>`;

  // ── Articles + notes ──
  const articlesHtml = nodes
    .map((n, i) => {
      const mins = Math.round((n.timeSpent || 0) / 60000);
      const secs = Math.round((n.timeSpent || 0) / 1000) % 60;
      const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      const notesHtml = (n.notes || [])
        .map((note) => {
          const t = new Date(note.time).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
          const textHtml = note.url
            ? `<a class="note-link" href="${esc(note.url)}">${esc(note.text)}</a>`
            : `<span class="note-text">${esc(note.text)}</span>`;
          return `<div class="note">${textHtml}<div class="note-meta">${t}</div></div>`;
        })
        .join("");
      const cls = i === 0 ? "first" : i === nodes.length - 1 ? "last" : "";
      return `<div class="article ${cls}">
  <div class="article-top">
    <div class="article-num">${i + 1}</div>
    <div class="article-info">
      <a class="article-title" href="${esc(n.url)}">${esc(n.title)}</a>
      <div class="article-meta">${timeStr} · ${new Date(n.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
    </div>
  </div>
  ${notesHtml ? `<div class="notes">${notesHtml}</div>` : ""}
</div>`;
    })
    .join("\n");

  const tagsHtml = tags
    .map((t) => `<span class="tag">${esc(t)}</span>`)
    .join("");
  const uniqueCount = nodes.filter(
    (n, i, a) => a.findIndex((x) => x.title === n.title) === i,
  ).length;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(name)} — WikiTrail</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0f0f0f;color:#e0e0e0;font-family:Georgia,serif;max-width:800px;margin:0 auto;padding:24px 16px}
h1{font-size:clamp(16px,5vw,22px);color:#fff;margin-bottom:6px}
.meta{font-size:12px;color:#555;margin-bottom:8px}
.tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px}
.tag{font-size:11px;color:#7eb8f7;background:#0f2035;border:1px solid #1e3a5a;border-radius:10px;padding:3px 10px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));gap:12px;margin-bottom:24px;padding:14px 16px;background:#141414;border-radius:8px;border:1px solid #1e1e1e}
.stat-val{font-size:clamp(18px,5vw,22px);color:#fff;line-height:1}
.stat-label{font-size:11px;color:#555;margin-top:3px}
#graph-section{margin-bottom:28px}
.graph-hint{text-align:center;font-size:11px;color:#333;padding:4px 0 0}
h2{font-size:15px;color:#aaa;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #1e1e1e}
.article{padding:14px 0;border-bottom:1px solid #141414}
.article-top{display:flex;gap:12px;align-items:flex-start}
.article-num{min-width:26px;height:26px;border-radius:50%;background:#1a2f4a;border:1px solid #7eb8f7;display:flex;align-items:center;justify-content:center;font-size:11px;color:#7eb8f7;flex-shrink:0}
.article.first .article-num{background:#1a3a2a;border-color:#4caf77;color:#4caf77}
.article.last  .article-num{background:#2a2a1a;border-color:#f7d67e;color:#f7d67e}
.article-info{flex:1;min-width:0}
.article-title{color:#7eb8f7;font-size:clamp(13px,3.5vw,15px);text-decoration:none;line-height:1.4;word-break:break-word}
.article-meta{font-size:11px;color:#555;margin-top:3px}
.notes{margin-top:10px;margin-left:38px;display:flex;flex-direction:column;gap:6px}
.note{background:#161616;border:1px solid #222;border-radius:5px;padding:8px 12px}
.note-text{font-size:12px;color:#bbb;line-height:1.5}
.note-link{font-size:12px;color:#7eb8f7;line-height:1.5;text-decoration:none;display:block}
.note-link:hover,.note-link:active{text-decoration:underline}
.note-meta{font-size:10px;color:#444;margin-top:4px}
footer{margin-top:40px;padding-top:16px;border-top:1px solid #1a1a1a;font-size:11px;color:#333;text-align:center}
@media(max-width:480px){.notes{margin-left:0}}
</style>
</head>
<body>
<h1>${esc(name)}</h1>
<div class="meta">${date.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} · started ${formatTime(date)}</div>
${tagsHtml ? `<div class="tags">${tagsHtml}</div>` : ""}
<div class="stats">
  <div><div class="stat-val">${nodes.length}</div><div class="stat-label">articles</div></div>
  <div><div class="stat-val">${duration}</div><div class="stat-label">duration</div></div>
  <div><div class="stat-val">${noteTotal}</div><div class="stat-label">notes</div></div>
  <div><div class="stat-val">${uniqueCount}</div><div class="stat-label">unique</div></div>
</div>
<div id="graph-section">
${graphSvg}
<div class="graph-hint">🟢 start &nbsp;·&nbsp; 🟡 end</div>
</div>
<h2>Article trail</h2>
${articlesHtml}
<footer>Exported from WikiTrail</footer>
</body>
</html>`;

  downloadFile(html, buildFilename(trail, "html"), "text/html;charset=utf-8");
}
// ─────────────────────────────────────────────
//  EXPORT — MARKDOWN
// ─────────────────────────────────────────────
function exportMarkdown(trail) {
  const name = trail.name || "Unnamed trail";
  const date = new Date(trail.startTime);
  const duration = formatDuration(
    (trail.endTime || Date.now()) - trail.startTime,
  );
  const nodes = trail.nodes;
  const tags = trail.tags || [];

  let md = "";

  // Front matter
  md += `# ${name}\n\n`;

  md += `**Date:** ${date.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}  \n`;
  md += `**Started:** ${formatTime(date)}  \n`;
  md += `**Duration:** ${duration}  \n`;
  md += `**Articles:** ${nodes.length}  \n`;

  if (tags.length > 0) {
    md += `**Tags:** ${tags.join(", ")}  \n`;
  }

  const uniqueCount = nodes.filter(
    (n, i, a) => a.findIndex((x) => x.title === n.title) === i,
  ).length;
  const noteTotal = nodes.reduce((a, n) => a + (n.notes?.length || 0), 0);
  md += `**Unique articles:** ${uniqueCount}  \n`;
  if (noteTotal > 0) md += `**Notes saved:** ${noteTotal}  \n`;

  md += `\n---\n\n`;

  // Article trail
  md += `## Trail\n\n`;
  nodes.forEach((n, i) => {
    const mins = Math.round((n.timeSpent || 0) / 60000);
    const secs = Math.round((n.timeSpent || 0) / 1000) % 60;
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    const label = i === 0 ? " 🟢" : i === nodes.length - 1 ? " 🟡" : "";

    md += `### ${i + 1}. [${n.title}](${n.url})${label}\n`;
    md += `*${timeStr} · ${formatTime(new Date(n.time))}*\n`;

    if (n.notes?.length > 0) {
      md += `\n`;
      n.notes.forEach((note) => {
        const t = new Date(note.time).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        if (note.url) {
          // Markdown link pointing to the text fragment
          md += `> [${note.text}](${note.url})  \n`;
        } else {
          md += `> ${note.text}  \n`;
        }
        md += `> <sub>${t}</sub>\n`;
      });
    }

    md += `\n`;
  });

  md += `---\n\n*Exported from WikiTrail*\n`;

  downloadFile(md, buildFilename(trail, "md"), "text/markdown;charset=utf-8");
}

// ─────────────────────────────────────────────
//  EXPORT HELPERS
// ─────────────────────────────────────────────
function buildFilename(trail, ext) {
  const date = new Date(trail.startTime);
  const slug = (trail.name || "wikitrail")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug}-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}.${ext}`;
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.download = filename;
  a.href = url;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────
//  SVG HELPERS
// ─────────────────────────────────────────────
function initSvg(W, H) {
  const svg = d3.select("#graph-svg");
  svg.selectAll("*").remove();
  emptyState.style.display = "none";
  svg.attr("viewBox", `0 0 ${W} ${H}`);
  return svg;
}

function attachTooltip(selection, htmlFn) {
  selection
    .on("mouseenter", (event, d) => {
      tooltip.innerHTML = htmlFn(d);
      tooltip.classList.add("visible");
    })
    .on("mousemove", (event) => {
      const rect = document
        .getElementById("graph-container")
        .getBoundingClientRect();
      let x = event.clientX - rect.left + 12,
        y = event.clientY - rect.top - 10;
      if (x + 190 > rect.width) x -= 200;
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
    })
    .on("mouseleave", () => tooltip.classList.remove("visible"));
}

// ─────────────────────────────────────────────
//  VIEW 1 — NETWORK
// ─────────────────────────────────────────────
function renderNetwork(nodes) {
  const W = 480,
    H = 300,
    svg = initSvg(W, H);
  svg
    .append("defs")
    .append("marker")
    .attr("id", "arrow")
    .attr("viewBox", "0 -4 8 8")
    .attr("refX", 20)
    .attr("refY", 0)
    .attr("markerWidth", 5)
    .attr("markerHeight", 5)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-4L8,0L0,4")
    .attr("fill", "#2a4a6b");

  const nodeMap = new Map(),
    linkData = [];
  nodes.forEach((n, i) => {
    if (!nodeMap.has(n.title))
      nodeMap.set(n.title, {
        id: n.title,
        title: n.title,
        url: n.url,
        timeSpent: n.timeSpent || 0,
        notes: n.notes || [],
        index: i,
      });
  });
  nodes.forEach((n) => {
    if (
      n.from &&
      nodeMap.has(n.from) &&
      nodeMap.has(n.title) &&
      !linkData.some((l) => l.source === n.from && l.target === n.title)
    )
      linkData.push({ source: n.from, target: n.title });
  });

  const nodeData = Array.from(nodeMap.values());
  const maxTime = Math.max(...nodeData.map((n) => n.timeSpent), 1);
  const rScale = d3.scaleLinear().domain([0, maxTime]).range([6, 16]);

  const sim = d3
    .forceSimulation(nodeData)
    .force(
      "link",
      d3
        .forceLink(linkData)
        .id((d) => d.id)
        .distance(70)
        .strength(0.8),
    )
    .force("charge", d3.forceManyBody().strength(-180))
    .force("center", d3.forceCenter(W / 2, H / 2))
    .force(
      "collide",
      d3.forceCollide((d) => rScale(d.timeSpent) + 12),
    );

  const g = svg.append("g");
  svg.call(
    d3
      .zoom()
      .scaleExtent([0.4, 3])
      .on("zoom", (e) => g.attr("transform", e.transform)),
  );
  const link = g
    .append("g")
    .selectAll("line")
    .data(linkData)
    .join("line")
    .attr("class", "link");
  const node = g
    .append("g")
    .selectAll("g")
    .data(nodeData)
    .join("g")
    .attr("class", (d) =>
      d.index === 0
        ? "node start"
        : d.index === nodes.length - 1
          ? "node current"
          : "node",
    )
    .call(
      d3
        .drag()
        .on("start", (e, d) => {
          if (!e.active) sim.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (e, d) => {
          d.fx = e.x;
          d.fy = e.y;
        })
        .on("end", (e, d) => {
          if (!e.active) sim.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }),
    );

  node.append("circle").attr("r", (d) => rScale(d.timeSpent));
  node
    .append("text")
    .attr("dy", (d) => rScale(d.timeSpent) + 11)
    .text((d) => (d.title.length > 18 ? d.title.slice(0, 16) + "…" : d.title));

  attachTooltip(node, (d) => {
    const mins = Math.round(d.timeSpent / 60000),
      nc = (d.notes || []).length;
    return (
      `<strong>${esc(d.title)}</strong>` +
      (mins > 0 ? `<br>${mins}m spent` : "") +
      (nc > 0 ? `<br>📝 ${nc} note${nc > 1 ? "s" : ""}` : "")
    );
  });
  node.on("click", (e, d) => {
    if (e.defaultPrevented) return;
    openNotesDrawer(d);
  });
  sim.on("tick", () => {
    link
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);
    node.attr("transform", (d) => `translate(${d.x},${d.y})`);
  });
}

// ─────────────────────────────────────────────
//  VIEW 2 — TIMELINE
// ─────────────────────────────────────────────
function renderTimeline(nodes) {
  const W = 460,
    ROW_H = 52,
    PAD_LEFT = 100,
    H = Math.max(300, nodes.length * ROW_H + 40);
  const svg = initSvg(W, H);
  const g = svg.append("g");
  svg.call(
    d3
      .zoom()
      .scaleExtent([0.5, 2])
      .on("zoom", (e) => g.attr("transform", e.transform)),
  );

  const maxTime = Math.max(...nodes.map((n) => n.timeSpent || 0), 1);
  const barScale = d3
    .scaleLinear()
    .domain([0, maxTime])
    .range([4, W - PAD_LEFT - 40]);

  g.append("line")
    .attr("x1", PAD_LEFT - 16)
    .attr("y1", 20)
    .attr("x2", PAD_LEFT - 16)
    .attr("y2", H - 20)
    .attr("stroke", "#1e3a5a")
    .attr("stroke-width", 2);

  const row = g
    .selectAll("g.trow")
    .data(nodes)
    .join("g")
    .attr("class", "trow")
    .attr("transform", (d, i) => `translate(0,${i * ROW_H + 20})`);
  row
    .append("circle")
    .attr("cx", PAD_LEFT - 16)
    .attr("cy", 16)
    .attr("r", 4)
    .attr("fill", (d, i) =>
      i === 0 ? "#4caf77" : i === nodes.length - 1 ? "#f7d67e" : "#7eb8f7",
    )
    .attr("stroke", "#0f0f0f")
    .attr("stroke-width", 1.5);
  row
    .append("line")
    .attr("x1", PAD_LEFT - 16)
    .attr("y1", 16)
    .attr("x2", PAD_LEFT - 4)
    .attr("y2", 16)
    .attr("stroke", "#1e3a5a")
    .attr("stroke-width", 1);
  row
    .append("text")
    .attr("x", PAD_LEFT - 22)
    .attr("y", 20)
    .attr("text-anchor", "end")
    .attr("font-size", 9)
    .attr("fill", "#555")
    .text((d) => formatTime(new Date(d.time)));
  row
    .append("rect")
    .attr("x", PAD_LEFT)
    .attr("y", 8)
    .attr("height", 16)
    .attr("rx", 3)
    .attr("width", (d) => barScale(d.timeSpent || 0))
    .attr("fill", (d, i) =>
      i === 0 ? "#1a3a2a" : i === nodes.length - 1 ? "#2a2a1a" : "#1a2f4a",
    )
    .attr("stroke", (d, i) =>
      i === 0 ? "#4caf77" : i === nodes.length - 1 ? "#f7d67e" : "#7eb8f7",
    )
    .attr("stroke-width", 1)
    .style("cursor", "pointer")
    .on("click", (e, d) => openNotesDrawer({ ...d, notes: d.notes || [] }));
  row
    .append("text")
    .attr("x", PAD_LEFT + 6)
    .attr("y", 20)
    .attr("font-size", 10)
    .attr("fill", "#ccc")
    .attr("pointer-events", "none")
    .text((d) => (d.title.length > 32 ? d.title.slice(0, 30) + "…" : d.title));
  row
    .filter((d) => (d.notes || []).length > 0)
    .append("text")
    .attr("x", PAD_LEFT + barScale(0) + 6)
    .attr("y", 20)
    .attr("font-size", 9)
    .attr("fill", "#888")
    .attr("pointer-events", "none")
    .text((d) => `📝 ${d.notes.length}`);

  attachTooltip(row, (d) => {
    const mins = Math.round((d.timeSpent || 0) / 60000),
      secs = Math.round((d.timeSpent || 0) / 1000) % 60,
      nc = (d.notes || []).length;
    return (
      `<strong>${esc(d.title)}</strong><br>${mins > 0 ? `${mins}m ${secs}s` : `${secs}s`} spent` +
      (nc > 0 ? `<br>📝 ${nc} note${nc > 1 ? "s" : ""}` : "")
    );
  });
}

// ─────────────────────────────────────────────
//  LIVE POLLING
// ─────────────────────────────────────────────
let lastNodeCount = 0,
  idleRounds = 0;

function startPolling() {
  async function poll() {
    if (currentTabId === null) {
      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (activeTab && /wikipedia\.org\/wiki\//.test(activeTab.url))
        currentTabId = activeTab.id;
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
        currentNodes = null;
        lastNodeCount = 0;
        currentTabId = null;
        setIdleUI();
      }
    }

    idleRounds++;
    setTimeout(poll, currentSession !== null || idleRounds < 5 ? 1000 : 5000);
  }
  setTimeout(poll, 1000);
}

// ─────────────────────────────────────────────
//  GO
// ─────────────────────────────────────────────
init();
startPolling();
