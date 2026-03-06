# WikiTrail

**Map your Wikipedia rabbit holes.**

WikiTrail is a Chrome extension that runs quietly in the background while you browse Wikipedia, recording every article you visit in order. Open the popup at any time to see your trail as an interactive graph — nodes sized by time spent, branches showing where you backtracked and went a different direction. Save notes on passages as you go, search across everything you've ever saved, and export your trails as clean HTML or Markdown documents.

![WikiTrail popup showing a force-directed network graph of a Wikipedia session]()

---

## Features

**Live trail tracking**
WikiTrail automatically detects when you open a Wikipedia article and starts recording. Each tab tracks its own independent session — two research tabs open at once never interfere with each other.

**Two visualisations**

- **Network** — a force-directed graph showing how articles connect, with node size scaled by time spent. Drag nodes, zoom, and pan.
- **Timeline** — a chronological list of every visit in order, including revisits, with time-spent bars and timestamps.

**Notes via right-click**
Highlight any text on a Wikipedia page, right-click, and choose _Save to current trail node_. The note is saved to that article and links back to the exact highlighted passage via a text fragment URL, so one tap takes you straight back to it.

**Search across all notes**
A global search panel queries every note you've ever saved, across every trail, with results linked back to the article and session they came from. Matches are highlighted inline.

**Session naming, tagging, and research questions**
When you end a trail you can give it a name and comma-separated tags. Past trails are fully editable after the fact.

**HTML and Markdown export**
Each completed trail can be exported as:

- A self-contained **HTML file** with an embedded static SVG graph, article list, timestamps, and all notes with links. Works offline and on mobile devices — no JavaScript required.
- A clean **Markdown file** ready to drop into Obsidian, Notion, or any notes app.

**Delete past trails**
Remove any completed trail from your history.

---

## Installation

WikiTrail is not yet on the Chrome Web Store. To install it manually:

1. Download or clone this repository
2. Download [D3 v7](https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js) and save it as `d3.min.js` in the extension folder
3. Open Chrome and navigate to `chrome://extensions`
4. Enable **Developer mode** (top right toggle)
5. Click **Load unpacked** and select the extension folder

The extension folder should contain:

```
wikitrail/
├── manifest.json
├── background.js
├── popup.html
├── popup.js
└── d3.min.js
```

---

## Usage

### Recording a trail

Navigate to any Wikipedia article — tracking starts automatically. The popup status indicator turns green and pulses while a session is active.

Open the popup at any time to see your trail so far. Switch between Network and Timeline views using the dropdown in the top bar.

### Saving notes

While on any Wikipedia article, highlight a passage of text, right-click, and choose **Save to current hole**. Notes are attached to the article they were saved from. Click any node in the graph or any bar in the timeline to open that article's notes drawer.

### Ending a trail

Click **End Trail** in the popup. A modal will ask for:

- **Trail name** — e.g. _Byzantine economics deep dive_
- **Tags** — comma-separated, e.g. _history, economics, research_

### Past trails

Click **Past Trails** to browse your history. Each trail shows its name, date, duration, article count, and note count. From here you can:

- **Click** a trail to view its graph
- **✎** — edit the name, research question, or tags
- **H** — export as a self-contained HTML file
- **M** — export as a Markdown document
- **🗑** — delete (tap once to arm, tap again within 3 seconds to confirm)

### Searching notes

Click **Search Notes** to open the global search panel. Type any query to search across all notes in all trails. Results show the note text (as a link if it has a text fragment URL), the article it came from, and which trail. Click a result to navigate to that trail and open the notes drawer for that article.

---

## Technical notes

**Per-tab sessions** — each Wikipedia tab maintains its own session stored under its tab ID. Closing a tab automatically saves its session to completed trails.

**Service worker persistence** — tab cursor state (current article and arrival time) is stored in `chrome.storage.session` rather than in memory, so time tracking survives Chrome killing and restarting the background service worker.

**Text fragment links** — saved notes link back to their source passage using the [Text Fragments](https://developer.mozilla.org/en-US/docs/Web/URI/Fragment/Text_fragments) spec (`#:~:text=...`). The fragment uses the first eight words of the selection to maximise compatibility — long fragments with footnote markers and special characters can fail to match in some browsers.

**Export graph** — the HTML export does not use D3 or any JavaScript. A spring/repulsion layout is computed in the extension at export time and the result is baked into a static SVG. The file opens in any browser with no network requests.

**Storage** — all data is stored locally in `chrome.storage.local`. Nothing leaves your browser.

---

## Permissions

| Permission              | Reason                                                               |
| ----------------------- | -------------------------------------------------------------------- |
| `tabs`                  | Read the URL of the active tab to detect Wikipedia navigation        |
| `storage`               | Save session data and completed trails locally                       |
| `activeTab`             | Access the current tab when the popup is open                        |
| `contextMenus`          | Add the _Save to current hole_ right-click option on Wikipedia pages |
| `*://*.wikipedia.org/*` | Track navigation and enable the context menu on Wikipedia only       |

---

## License

MIT
