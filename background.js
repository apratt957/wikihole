// ─────────────────────────────────────────────
//  WikiTrail — background.js (service worker)
// ─────────────────────────────────────────────

const WIKI_PATTERN = /^https?:\/\/([a-z]+\.)?wikipedia\.org\/wiki\/([^#?]+)/;

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

function isWikiUrl(url) {
  return WIKI_PATTERN.test(url);
}

function titleFromUrl(url) {
  // Strip fragment (#...) and query string (?...) before matching
  const clean = url.split("#")[0].split("?")[0];
  const match = clean.match(WIKI_PATTERN);
  if (!match) return null;
  return decodeURIComponent(match[2]).replace(/_/g, " ");
}

// ── Per-tab session storage (keyed by tabId) ──
// activeTabSessions: { [tabId]: session }
async function getAllSessions() {
  const { activeTabSessions } =
    await chrome.storage.local.get("activeTabSessions");
  return activeTabSessions || {};
}

async function getTabSession(tabId) {
  const all = await getAllSessions();
  return all[tabId] || null;
}

async function saveTabSession(tabId, session) {
  try {
    const all = await getAllSessions();
    if (session === null) {
      delete all[tabId];
    } else {
      all[tabId] = session;
    }
    await chrome.storage.local.set({ activeTabSessions: all });
  } catch (e) {
    console.error("[WikiTrail] Failed to save session:", e);
    if (chrome.runtime.lastError) {
      console.error("[WikiTrail] lastError:", chrome.runtime.lastError.message);
    }
  }
}

async function closeTabSession(tabId) {
  try {
    const session = await getTabSession(tabId);
    if (!session || session.nodes.length === 0) {
      await saveTabSession(tabId, null);
      return;
    }
    const { completedTrails = [] } =
      await chrome.storage.local.get("completedTrails");
    completedTrails.push({ ...session, endTime: Date.now() });
    await chrome.storage.local.set({ completedTrails });
    await saveTabSession(tabId, null);
  } catch (e) {
    console.error("[WikiTrail] Failed to close session:", e);
  }
}

// ─────────────────────────────────────────────
//  TAB STATE — persisted to chrome.storage.session
//  so it survives service worker restarts
//  { [tabId]: { url, title, arrivedAt } }
// ─────────────────────────────────────────────

async function getTabState() {
  const { tabState } = await chrome.storage.session.get("tabState");
  return tabState || {};
}

async function setTabState(state) {
  try {
    await chrome.storage.session.set({ tabState: state });
  } catch (e) {
    console.error("[WikiTrail] Failed to save tabState:", e);
  }
}

// ─────────────────────────────────────────────
//  CORE: handle a URL change in a tab
// ─────────────────────────────────────────────

async function handleNavigation(tabId, url) {
  const tabState = await getTabState();
  const prev = tabState[tabId] || null;
  const session = await getTabSession(tabId);

  const nowOnWiki = isWikiUrl(url);

  // ── Leaving Wikipedia ──
  if (!nowOnWiki) {
    if (prev && session) {
      updateTimeSpent(session, prev.title, prev.arrivedAt);
      await saveTabSession(tabId, session);
    }
    if (prev) {
      delete tabState[tabId];
      await setTabState(tabState);
    }
    // Close the session for this tab — they left Wikipedia
    if (session) {
      await closeTabSession(tabId);
    }
    return;
  }

  // ── On Wikipedia ──
  const title = titleFromUrl(url);
  if (!title) return;

  // Skip special pages
  if (
    /^(File|Special|Talk|User|Wikipedia|Help|Portal|Category|Template):/i.test(
      title,
    )
  )
    return;

  // Same page reload — ignore
  if (prev && prev.title === title) return;

  // ── Update time spent on previous page ──
  if (prev && session) {
    updateTimeSpent(session, prev.title, prev.arrivedAt);
  }

  // ── Start a new session for this tab if none exists ──
  if (!session) {
    const newSession = {
      id: `${tabId}-${Date.now()}`,
      tabId: tabId,
      startTime: Date.now(),
      nodes: [
        {
          title: title,
          url: url,
          from: null,
          time: Date.now(),
          timeSpent: 0,
          notes: [],
        },
      ],
    };
    tabState[tabId] = { url, title, arrivedAt: Date.now() };
    await setTabState(tabState);
    await saveTabSession(tabId, newSession);
    return;
  }

  // ── Add node to existing session ──
  const fromTitle = prev ? prev.title : null;
  const lastNode = session.nodes[session.nodes.length - 1];

  if (lastNode && lastNode.title === title) {
    tabState[tabId] = { url, title, arrivedAt: Date.now() };
    await setTabState(tabState);
    return;
  }

  session.nodes.push({
    title: title,
    url: url,
    from: fromTitle,
    time: Date.now(),
    timeSpent: 0,
    notes: [],
  });

  tabState[tabId] = { url, title, arrivedAt: Date.now() };
  await setTabState(tabState);
  await saveTabSession(tabId, session);
}

function updateTimeSpent(session, title, arrivedAt) {
  const node = session.nodes.find((n) => n.title === title);
  if (node) {
    node.timeSpent = (node.timeSpent || 0) + (Date.now() - arrivedAt);
  }
}

// ─────────────────────────────────────────────
//  TAB EVENT LISTENERS
// ─────────────────────────────────────────────

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    handleNavigation(tabId, tab.url);
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const tabState = await getTabState();
  const prev = tabState[tabId] || null;
  const session = await getTabSession(tabId);

  if (prev && session) {
    updateTimeSpent(session, prev.title, prev.arrivedAt);
    await saveTabSession(tabId, session);
  }

  await closeTabSession(tabId);

  delete tabState[tabId];
  await setTabState(tabState);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    const tabState = await getTabState();

    if (tab.url && isWikiUrl(tab.url)) {
      const title = titleFromUrl(tab.url);
      if (title) {
        // Reset arrivedAt clock since we just focused this tab
        tabState[tabId] = { url: tab.url, title, arrivedAt: Date.now() };
        await setTabState(tabState);
      }
    }
  } catch (e) {}
});

// ─────────────────────────────────────────────
//  WINDOW FOCUS — pause time tracking on blur
// ─────────────────────────────────────────────

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) return;

  try {
    const tabState = await getTabState();
    const all = await getAllSessions();

    for (const [tabIdStr, state] of Object.entries(tabState)) {
      const tabId = parseInt(tabIdStr);
      const session = all[tabId];
      if (session) {
        updateTimeSpent(session, state.title, state.arrivedAt);
        all[tabId] = session;
      }
      tabState[tabId] = { ...state, arrivedAt: Date.now() };
    }

    await chrome.storage.local.set({ activeTabSessions: all });
    await setTabState(tabState);
  } catch (e) {
    console.error("[WikiTrail] Focus blur save failed:", e);
  }
});

// ─────────────────────────────────────────────
//  CONTEXT MENU — "Save to current trail node"
// ─────────────────────────────────────────────

function registerContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "save-to-node",
      title: "Save to current trail node",
      contexts: ["selection"],
      documentUrlPatterns: ["*://*.wikipedia.org/*"],
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "save-to-node") return;

  const selectedText = info.selectionText?.trim();
  if (!selectedText) return;

  const session = await getTabSession(tab.id);
  if (!session) {
    console.log("[WikiTrail] No active session for this tab — note not saved.");
    return;
  }

  const currentTitle = titleFromUrl(tab.url);
  if (!currentTitle) return;

  // Match by title, fall back to URL match
  const node =
    session.nodes.find((n) => n.title === currentTitle) ||
    session.nodes.find((n) => n.url.split("#")[0] === tab.url.split("#")[0]);

  if (!node) {
    console.log("[WikiTrail] Node not found for title:", currentTitle);
    return;
  }

  if (!node.notes) node.notes = [];

  // Build a text fragment URL that jumps straight to the selected text.
  // We use only the first ~8 words as the fragment — long fragments with
  // footnote markers ([1], [2]), quotes, or special characters fail to match
  // reliably. A short prefix is enough to uniquely locate the passage.
  const baseUrl = node.url.split("#")[0];
  const prefixWords = selectedText.trim().split(/\s+/).slice(0, 8).join(" ");
  const fragmentUrl = `${baseUrl}#:~:text=${encodeURIComponent(prefixWords)}`;

  node.notes.push({ text: selectedText, url: fragmentUrl, time: Date.now() });

  await saveTabSession(tab.id, session);
  console.log(`[WikiTrail] Note saved to "${node.title}":`, selectedText);
});

// ─────────────────────────────────────────────
//  INSTALL / STARTUP
// ─────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.remove("activeSession"); // remove old single-session key
  await chrome.storage.local.remove("activeTabSessions"); // start fresh
  registerContextMenu();
  console.log("WikiTrail installed.");
});

chrome.runtime.onStartup.addListener(async () => {
  registerContextMenu();
  // On browser restart, close all open sessions cleanly
  const all = await getAllSessions();
  const { completedTrails = [] } =
    await chrome.storage.local.get("completedTrails");
  for (const session of Object.values(all)) {
    if (session && session.nodes.length > 0) {
      completedTrails.push({ ...session, endTime: Date.now() });
    }
  }
  await chrome.storage.local.set({ completedTrails, activeTabSessions: {} });
  await setTabState({});
});
