# ReleaseFlow Pro

**Files:** `Release.html`, `Release.js`
**Last Updated:** 2026-03-20

HTML app for tracking software release stages across months. No build tools, no dependencies beyond CDN fonts and Font Awesome. All data persisted in `localStorage`. JavaScript logic lives in `Release.js` (loaded via `<script src>`); `Release.html` contains only HTML structure and CSS.

---

## Tech Stack

| Concern | Solution |
|---|---|
| Styling | Inline CSS with CSS custom properties (`--bg`, `--primary`, etc.) |
| Icons | Font Awesome 6.4.0 (CDN) |
| Font | Plus Jakarta Sans (Google Fonts CDN) |
| Primary data | `releaseflow-data.json` via File System Access API (auto-saves on every change) |
| Fallback data | `localStorage` key `rf_compact_v1` (used when file not connected) |
| File handle persistence | IndexedDB (`rf_fsa` DB, `handles` store) — remembers chosen file across refreshes |
| Prefs | `localStorage`: `rf_theme`, `rf_activeMonth` |
| Framework | Vanilla JS — no libraries |

---

## Layout

```
NAV BAR (sticky)
  Logo | Month Picker Dropdown | Theme Toggle | + New Stage

PAGE HEADER
  Month Title (h2) | Sub-heading (editable inline)

TIMELINE
  [Side Label] [Dot] [Card]
  [Side Label] [Dot] [Card]
  ...
```

### Timeline grid
- `grid-template-columns: 130px 40px 1fr`
- Vertical line connects dots, colored green (Completed) / red (Blocked) / gray (Pending)

---

## Card Structure

```
┌─────────────────────────────────────────┐
│  Title (editable)          [Status Badge]│
│  Subtitle/Label (editable)               │
├─────────────────────────────────────────┤
│  [Tag pills...]  [+ Tag button]          │
├─────────────────────────────────────────┤
│  ⚠ Blocked Reasons (only if Blocked)    │
├─────────────────────────────────────────┤
│  SPECS BAND (2-col grid)                 │
│  Key        Key                          │
│  Value      Value      [× on hover]     │
│                        [+ Detail]        │
├─────────────────────────────────────────┤
│  [View Change Logs N]  [QA (N)]          │
├─────────────────────────────────────────┤
│  QA PANEL (expands below footer)         │
│  Check name         [Status Badge]  [×]  │
│  ...                                     │
│  [+ Add QA Check]                        │
├─────────────────────────────────────────┤
│  LOGS PANEL (expands below footer)       │
│  ▶ App (N)                               │
│  ▶ Gateway (N)                           │
│  ▶ Firmware (N)                          │
└─────────────────────────────────────────┘
```

---

## Data Model

```js
S.data = {
  "March 2026": {
    sub: "Q1 Release",        // editable sub-heading
    stages: [
      {
        title: "Alpha Release",
        label: "Phase",         // shown on timeline side + card subtitle
        status: "Pending",      // "Pending" | "Completed" | "Blocked"
        color: "var(--primary)",
        details: [{ k: "Version", v: "1.0" }],
        qa: [{ n: "Smoke Test", v: "Pending" }],  // v: Pending|Passed|Approved|Failed
        logs: { app: [], gateway: [], firmware: [] },
        tags: [{ n: "TAG NAME", d: "description" }],
        blockedReasons: [],
        // UI state (not persisted meaningfully):
        logsOpen: false,
        qaOpen: false,
        blockedOpen: false,
        openCat: "",            // which log category is expanded
        openTagIdx: undefined   // which tag popup is open
      }
    ]
  }
}
```

---

## Months

All 12 months of 2026 are pre-seeded on first load (without overwriting existing data):

| Month | Default Sub-heading |
|---|---|
| January–February | Q1 |
| March | Q1 Release |
| April–May | Q2 |
| June | Q2 Release |
| July–August | Q3 |
| September | Q3 Release |
| October–November | Q4 |
| December | Q4 Release |

Sub-headings are editable by clicking the text under the month title.
Month dropdown shows both the month name and its sub-heading.

---

## Status Cycle

Clicking the status badge on a card cycles:
`Pending` → `Completed` → `Blocked` → `Pending`

| Status | Badge style | Dot color | Line color | Display label |
|---|---|---|---|---|
| Pending | Gray outline | Gray | Gray | Pending |
| Completed | Green outline | Green | Green | Done |
| Blocked | Red outline | Red | Red | Blocked |

---

## Features

### Specs / Details
- 2-column grid layout inside a gray band
- Key and value both editable inline (click to edit)
- Hover a detail to reveal `×` delete button (top-right of item)
- `+ Detail` button (right-aligned below grid)
- `+ Add Detail` full-width button when no details exist

### QA Checks
- Shown in expandable panel below the footer buttons
- Status badge is clickable — cycles: `Pending → Passed → Approved → Failed`
- Color-coded badges: gray / green / blue / red
- Name editable inline
- `×` to delete individual check
- `+ Add QA Check` button at panel bottom

### Change Logs
- Expandable panel below footer buttons
- 3 sub-categories: **App**, **Gateway**, **Firmware**
- Each category expands independently (`openCat` state)
- Entries editable inline, deletable with trash icon
- Press `Enter` in input to add new entry

### Tags
- Pills shown inline below card header
- Click pill to show inline popup (name + description) — not a full-width box
- Active pill turns filled-indigo; popup appears as a rounded chip next to it
- Circular `×` close button on popup
- `+ Tag` button opens modal to add name + description

### Blocked Reasons
- Appears as red banner inside card (only when status = Blocked)
- Collapsible list, editable inline, deletable
- Press `Enter` to add new reason

---

## Key Functions

| Function | Purpose |
|---|---|
| `init()` | Load from localStorage, seed missing months, apply theme, render |
| `render()` | Full re-render of timeline and nav state |
| `save()` | Serialize `S.data` to localStorage |
| `syncTitle(i, v)` | Update stage title |
| `syncLabel(i, v)` | Update stage label (shown on side + subtitle) |
| `cycleStatus(i)` | Rotate Pending → Completed → Blocked |
| `toggleColl(i, f)` | Toggle any boolean flag on a stage (logsOpen, qaOpen, etc.) |
| `toggleCat(i, k)` | Toggle log category open/closed |
| `toggleTag(i, ti)` | Toggle tag popup |
| `addStage()` | Push new default stage to active month |
| `delStage(i)` | Delete stage (with confirm) |
| `addKV(i)` / `updKV` / `delKV` | Manage spec details |
| `addQA(i)` / `updQA` / `delQA` | Manage QA checks |
| `addLog` / `updLog` / `delLog` | Manage log entries |
| `addList` / `updList` / `delList` | Manage blocked reasons |
| `saveSubHeading(v)` | Save edited sub-heading for active month |
| `switchMonth(m)` | Switch active month, persist to localStorage |
| `toggleTheme()` | Toggle light/dark, persist to localStorage |
| `exportJSON()` | Download all data as `releaseflow-data.json` |
| `importJSON()` | Trigger file picker to load a JSON file |
| `loadJSONFile(input)` | Parse selected JSON, merge into `S.data`, re-render |
| `showStatus(msg)` | Show brief inline status message in nav (auto-hides after 2.5s) |

---

## CSS Variables

```css
--bg            /* page background */
--surface       /* card / nav background */
--surface-2     /* subtle secondary surface */
--primary       /* indigo accent (#4f46e5 light / #818cf8 dark) */
--primary-light /* light indigo tint for badges/buttons */
--text-main     /* primary text */
--text-muted    /* secondary text */
--text-dim      /* placeholder / label text */
--border        /* border color */
--green         /* #10b981 */
--red           /* #ef4444 */
--blue          /* #3b82f6 */
```

---

## Change Log

### 2026-03-23 (39)
- Removed row-level color dot / box highlight from comments and logs (was coloring the whole row)
- Text highlight only: select any text inside a comment or log entry → floating pill toolbar appears above selection with 6 colors + clear

### 2026-03-23 (38)
- Text highlight toolbar: selecting text inside any comment or log entry shows a floating pill toolbar (6 colors + clear ×) above the selection; uses Selection/Range API (`surroundContents`/`extractContents`) to wrap text in `<span data-hl>` — no deprecated `execCommand`
- Clear removes all `span[data-hl]` inside the active contenteditable; `innerHTML` saved on blur to preserve formatting
- `updComment` and `updLog` now save `innerHTML` (not `innerText`) to persist highlight spans

### 2026-03-23 (37)
- Highlight colors for comments and log entries: small color dot on each row opens a 6-swatch mini picker (yellow, green, red, blue, purple, orange) + clear; row gets `background:${color}22` tint
- Comments: `c.c` field stores highlight color; `setCommentColor(i,ci,color)` saves it
- Logs: `s.logColors = {app:{li:color}, ...}` parallel map (strings unchanged); `setLogColor(i,cat,li,color)` saves
- `toggleHlPicker(i,type,li,cat)`: single `s.hlOpen` object tracks which picker is visible

### 2026-03-23 (36)
- Delete confirmation: replaced `confirm()` alert with in-card bar at bottom of card; trash click calls `confirmDelete(i)` → sets `s.deleteConfirm = true` → renders `.del-confirm-bar` overlay with "Cancel" and "Delete" buttons; `cancelDelete(i)` clears flag; `delStage(i)` no longer uses confirm dialog

### 2026-03-23 (35)
- Comments input: pill-style row (border-radius:20px, surface-2 bg) with focus border highlight (primary color) and a round arrow-up send button; Enter key also submits
- Change log input: same pill style (border-radius:16px) with a round + send button per category; focus ring on primary color

### 2026-03-23 (34)
- Comments edit: comment text div is now `contenteditable`; clicking text (or pencil icon) makes it editable inline with focus highlight (surface-2 bg + border ring); `onblur` calls `updComment(i, ci, el)` which saves trimmed text or reverts if empty
- Added `updComment(i, ci, el)` function; pencil icon (`fa-pencil-alt`) added beside × delete icon — clicking it focuses the editable div

### 2026-03-23 (33)
- New Stage modal: `addStage()` now opens `newStageModal` asking "Change Logs" or "Comments"; `createStage(type)` handles actual creation with `cardType`, `cardBg`, `cardColor`, `comments` fields
- Card type: `s.cardType = 'logs'` (default) shows Change Logs footer button + App/Gateway/Firmware panels; `cardType = 'comments'` shows Comments footer button + flat comment list panel
- Comments: `s.comments = [{text, ts}]`; `addComment(i, input)` adds with timestamp; `delComment(i, ci)` removes
- Card background: `s.cardBg` hex; card div gets `background:${cardBg}18`; new "Card Background" section in color picker (10 tinted square swatches + "Clear"); `setCardBg(i, c)` function
- Color picker expanded to 190px wide with two sections: "Accent" (circles) and "Card Background" (rounded squares shown as tints)

### 2026-03-23 (32)
- Migration fix: added `ST_CLR` map + `migrateStatus()` — upgrades old all-gray status colors to proper defaults by name; used in both `init()` and `readFromFile()`
- Card color override: `s.cardColor` field; small colored circle button in card-top opens 10-swatch popover; "Auto (Status color)" resets; `toggleCardColorPicker(i)`, `setCardColor(i,c)` — `stColor` now uses `s.cardColor || stObj.c`
- Status/approval pickers: added × delete button per item (hover-reveal via `onmouseenter`/`onmouseleave`); `removeCardStatus(n)`, `removeApprovalStatus(n)` functions
- Status picker dots: 9px filled circles with status color; click area is inner span with stopPropagation, × on right with stopPropagation

### 2026-03-23 (31)
- Status objects: `S.cardStatuses` and `S.approvalStatuses` changed from string arrays to `{n, c}` objects with built-in colors; migration handles old string format on load
- Card status badge: now uses inline style (`${stColor}22` bg, `${stColor}` text, `${stColor}66` border) instead of CSS classes
- Approval badge: same inline style approach using approvalStatuses color lookup
- Status/approval pickers: each option shows a colored dot (8px circle) before the name
- Add Status: opens `statusModal` with name input + 8 color swatches; `openStatusModal(type)`, `pickStatusColor(el)`, `saveNewStatus()`
- v-line: now 2px wide, uses `linear-gradient(to bottom, var(--st-color) 40%, transparent)` — color set per stage-row via `row.style.setProperty('--st-color', stColor)`
- Timeline dot: uses `var(--st-color)` for background and border (CSS var inheritance)
- Card border-left: uses `var(--st-color, var(--border-2))` via `.stage-row .card` CSS rule; removed old `.status-Pending/Completed/Blocked .card` rules
- Removed `.status-Completed .dot`, `.status-Blocked .dot` CSS rules (all driven by `--st-color` now)
- Side label: removed `contenteditable`, now shows `s.title` (mirrors card title in real-time via `syncTitle`); `syncLabel` no longer updates side-label

### 2026-03-23 (30)
- Removed `+` quick-add button beside Approvals in card-top
- Card status: replaced click-to-cycle with dropdown picker; `toggleStatusPicker(i)` / `setCardStatus(i, st)` / `addCardStatus()`; `statusCls()` maps unknown statuses to `.sp-custom`; default set: Pending, In Progress, Completed, Blocked, On Hold, Cancelled
- Approval status: replaced click-to-cycle with dropdown picker; `toggleQAPicker(i,qi)` / `setQAStatus(i,qi,st)` / `addApprovalStatus()`; `qaBadgeCls()` maps unknown to neutral; default set: Pending, In Review, Passed, Approved, Failed, Waived
- Both status lists support "+" Add Status (prompt) — custom entries persisted in `S.cardStatuses` / `S.approvalStatuses`, saved to localStorage (`rf_statuses`) and JSON file payload
- Added `.status-picker`, `.sp-item`, `.sp-item.sp-active`, `.sp-custom` CSS classes

### 2026-03-23 (29)
- Tag colors: color picker (8 preset swatches) added to tagModal; tag data stores `c` field; pill renders with `${c}18` bg / `${c}` text / `${c}44` border when color set; popup border and title also take color; `pickTagColor(el)`, `setTagColorPicker(c)` functions added; `openMdl`, `openTagEdit`, `saveTag` updated to handle color
- Removed auto colon from `.spec-key::after` — `content: ':'` set to `''`; user types colon manually
- Quick-add approval `+` button: small `+` icon button beside Approvals in card-top calls `quickAddApproval(i)` — pushes `{n,v,d}` entry, sets `qaOpen:true`, saves, re-renders
- `+ Add Stage` button: rendered after the stages forEach loop at the bottom of the timeline (calls existing `addStage()`)

### 2026-03-23 (28)
- Tag pill click: now shows inline reading popup with name (bold) + description + Edit button + close × — Edit button opens tagModal for editing; replaced direct `openTagEdit` call with `toggleTag` to show popup first
- Spec items: serial number `1.` `2.` added before each key as a dim 10.5px label with `min-width:18px`
- Approval rows: added `d` date field per qa item; row now shows number + stacked (name / date input) + status badge + delete; `addQA` pushes `{n, v, d:""}`; `updQA` handles all fields including date

### 2026-03-23 (27)
- Specs band: changed to `flex-direction: column` — each Key: Value pair is on its own line
- Card width: main-wrap and page-header max-width reduced from 820px to 660px; stage-row grid narrowed (60px 20px 1fr); v-line offset updated to 84px
- Date field: moved to first line alongside title (`align-items:baseline`); card-subtitle (phase label) moved to second line
- Tag pill click: now opens tagModal (same modal as + Tag) with tag pre-filled; supports edit + delete
- `openTagEdit(i, ti)`: pre-fills modal, sets `tagEditIdx`; `saveTag()`: updates existing tag if `tagEditIdx !== null`; `delTagEdit()`: removes tag
- tagModal HTML: added `id="tagModalTitle"`, `id="tagDelBtn"` (hidden by default, shown in edit mode)
- `openMdl('tagModal')` from + Tag button: resets to "Add" mode (clears fields, hides delete button)

### 2026-03-23 (26)
- Rewrote `specKeyDown(e, role, i, di)`: replaces inline onkeydown — 'key' role focuses nextElementSibling `.spec-val` directly; 'val' role saves then calls `addKVfocus`
- Rewrote `addKVfocus`: queries `.spec-item[data-idx]` then `.spec-key` inside last match, focuses directly without range logic
- Long press: changed `lpStart(e, card)` — passes `this` (card element) directly instead of `e.currentTarget`, which is unreliable in inline handlers
- Removed `placeCaretAtEnd` from Enter-key flow; plain `.focus()` is sufficient

### 2026-03-23 (25)
- Spec text: key font-weight 600, value font-weight 700 (bold)
- Enter key in spec-key: fixed race condition with blur/save — now uses `setTimeout(20)` before focusing value field
- `addKVfocus`: fixed querySelector from `.specs-band [data-idx]` to `.spec-item[data-idx]`
- Long press (550ms) on card body shows delete icon — card gets `lp-del` class, ghost-del turns red with scale; tapping outside dismisses
- `lpStart` / `lpEnd` / `lpDismiss` functions added; `lpStart` ignores interactive targets (buttons, contenteditable, badges, etc.)

### 2026-03-23 (24)
- Spec key/value fields: Enter in key field moves focus to value field; Enter in value field saves current entry and adds a new blank detail row, auto-focusing its key field
- Added `addKVfocus(i)` helper — adds blank `{k:"", v:""}` entry, renders, then focuses last key via `setTimeout`
- Added `placeCaretAtEnd(el)` utility — positions cursor at end of a contenteditable element after focus
- `+ Detail` button now also uses `addKVfocus` for consistent focus behavior
- New entries start with empty k/v instead of "Key"/"Value" placeholder

### 2026-03-23 (23)
- Specs band: removed all box/chip styling — now plain inline text `Key: Value` with no background, no border, no border-radius
- `.spec-item`: no background/border, just `display:inline-flex; gap:0 16px`, right padding for delete button
- `.spec-key`: 400 weight muted, colon via `::after`; `.spec-val`: 600 weight main color

### 2026-03-23 (22)
- Design tokens: canvas changed to warm paper `#fdfcf8`, surface-2 to `#f7f6f1`, borders to warm `#e4e2d8`/`#cbc8bc`, shadows reduced to near-zero for flat notepad feel
- Dark mode: canvas changed to warm-dark `#141210`, surfaces warm-tinted dark
- Nav: removed box-shadow, increased padding to `2rem`, background warm-tinted
- Page header: max-width 820px, `padding-bottom` + `border-bottom` separator, larger h2 (1.9rem), sub text 13px regular
- Main wrap: max-width 820px, padding `2rem`, stage-row margin `2.25rem`; v-line thinner (1px) + positioned at 99px
- Card: `box-shadow: none` at rest, only shows `var(--shadow-1)` on hover; removed gradient from card-top; card-top padding increased
- Spacing: tag-row, specs-band, card-footer all given more generous padding/margins
- `line-height: 1.6` on body for airy reading

### 2026-03-23 (21)
- Specs band: removed table/row layout entirely — now `display:flex; flex-wrap:wrap; gap:5px` chip row
- Each `.spec-item` is an inline chip (surface-2 bg, 1px border, 6px radius, 11.5px font)
- `.spec-key` renders muted label + colon via `::after { content: ':' }`, `.spec-val` bold value — no borders between them
- Delete button repositioned to `right:5px; top:50%; transform:translateY(-50%)` inside chip

### 2026-03-23 (20)
- Tag popup: now `position:absolute; top: calc(100%); left:18px` — floats below the tag row without pushing any pills; card `overflow` changed to `visible` to allow popup to escape card bounds
- Card accent strip: switched from `::before` pseudo-element to direct `border-left: 3px solid` — simpler, works with `overflow:visible`, rounded corners naturally follow `border-radius`
- Card top: subtle `linear-gradient` tint from primary color (3% opacity) + `border-bottom` separator between header and body
- Specs band: zebra-stripe rows (odd=surface, even=surface-2), `display:flex; align-items:stretch` for full-height key column, row height auto (8px vertical padding instead of fixed height)
- Tag pill: refined to 22px height, slightly stronger border opacity, box-shadow on hover

### 2026-03-23 (19)
- JS: Renamed "QA Checks" → "Approvals" in panel header, button label, add-button text, and default new-item name
- CSS: Fixed status badge / delete-button overlap — `card-top` right padding increased to 46px (10px ghost-del offset + 26px width + 10px gap)
- CSS: Specs band redesigned as a simple compact list — 30px row height, key left (42%, surface-2 bg, muted), value right (bold), no Type/Version headers, no grid layout

### 2026-03-23 (18)
- Specs band redesigned as a vertical table with "Type" | "Version" column headers
- Headers rendered via `.specs-band::before` ("Type", left 50%) and `.specs-band::after` ("Version", right 50%) using `position:absolute; top:0` inside the band's `position:relative` container; `padding-top:30px` reserves the header row
- Each `.spec-item` is a full-width flex row: `.spec-key` (50%, muted, right-border divider) | `.spec-val` (flex:1, bold, `padding-right:28px` leaves room for the × delete button)

### 2026-03-23 (17)
- Specs band redesigned as compact inline chips: `[Firmware | 3.83]  [Hub Version | 9.82]`
- Each spec-item is now a 26px-tall pill with a key section (muted, small caps) separated by an internal border from the value section (bold)
- Replaced CSS grid layout with `display: flex; flex-wrap: wrap; gap: 5px`
- Band border replaced with a single `border-top` on the specs-band container (cleaner, no surrounding box)

### 2026-03-23 (16)
- Complete redesign with intentional design-token system (canvas/surface/primary/semantic layers)
- Nav: 3-column CSS Grid (logo | centered month picker | right actions) — month toggle always perfectly centered
- Month toggle has rotating caret, `.open` class toggled via JS onclick
- Cards: left accent strip via `card::before` pseudo-element, rounded by card's `overflow:hidden border-radius`; replaces top-stripe approach
- Card `padding-left: 18px` everywhere (card-top, tag-row, footer) gives visual clearance from accent strip
- Specs band: internal cell borders per cell (right+bottom), odd-last-item spans 2 columns via `:last-child:nth-child(odd) { grid-column: span 2 }`
- QA badge & spill: fixed height `24px`/`21px` with inline-flex for perfect vertical alignment
- Dot: spring cubic-bezier animation, double-ring glow (color ring + blur glow) for Completed/Blocked
- Modal: split heading into `.modal-hd-icon` tile + `h4` for richer visual weight
- Custom styled scrollbar (5px, rounded, transparent track)
- Font: Inter with `font-optical-sizing: auto` and `font-feature-settings: 'cv11','ss01'`

### 2026-03-23 (15)
- Full UI redesign: Inter font, Zinc+Indigo token system, 780px max-width
- Nav: logo-mark icon tile with gradient, glassmorphism, month dot indicator, `ab`/`ab-primary`/`ab-icon` button system, separator divider
- Cards: crisp 1px border, 2px top status stripe, subtle `sh-1` → `sh-2` hover shadow, no scale jank
- Specs band: grid with internal dividers (right+bottom borders per cell), cleaner than banded rows
- QA badge, tag pill, spill all use fixed height (`height: 20–22px`) for alignment
- Logs/QA expand panels: clean inner header with surface-2 bg, pill count badge
- Modals: icon tile in heading, cubic-bezier spring animation, proper blur backdrop
- Dark mode: zinc-950 bg, zinc-900 surface, proper layered surfaces, indigo-400 accent

### 2026-03-23 (14)
- Narrowed layout: max-width reduced from 1080px → 800px (cards ≈ 580px wide)
- Tightened timeline grid: `88px 32px 1fr` (was `130px 40px 1fr`), gap 14px
- Switched font to Inter for cleaner readability
- Replaced `.m-btn` with `.nb` / `.nb-primary` / `.nb-icon` system; logo now uses a colored icon tile
- All padding tightened: card-top 14px, footer 14px, panels 12px
- Removed decorative body gradients; clean flat background
- Cleaned nav: month picker styled as pill, utility buttons as compact nav-buttons
- `card-divider` helper class added
- All JS-facing class names preserved unchanged

### 2026-03-23 (13)
- Full UI redesign: richer color palette, subtle radial-gradient page background
- Nav: glassmorphism (`backdrop-filter: blur`), glowing logo icon, improved button hierarchy
- Cards: colored top-border accent per status (green/red), deeper shadow with hover lift
- Timeline dots: colored glow rings for Completed (green) and Blocked (red)
- Vertical line: gradient fade-out instead of flat color
- Buttons: gradient primary button with drop shadow, dashed tag button with color hover
- Modals: replaced hardcoded `white` with CSS-var aware `.modal-card` / `.modal-backdrop` classes (dark mode compatible), `backdrop-filter` blur overlay, slide-in animation
- `page-header` wrapper class added for consistent spacing
- Dark mode deepened: richer surface hierarchy (`--surface-2`, `--surface-3`), navy-tinted backgrounds

### 2026-03-20 (12)
- Switched from file handle to **directory handle** (`showDirectoryPicker`) for all file operations
- Import now picks the project folder (not the JSON file directly)
- `releaseflow-data.json` read/written via `dirHandle.getFileHandle(...)` — no extra dialog
- `generateViewer()` writes `view.html` directly into the folder silently, then opens in new tab
- Removed `fileHandle`, `persistHandle`, `getStoredHandle` — replaced by `dirHandle`, `persistDirHandle`, `getStoredDirHandle`

### 2026-03-20 (11)
- `generateViewer()` simplified: no dialogs, no File System Access API
- Clicking Generate downloads `view.html` to browser's default downloads folder and opens it in a new tab instantly

### 2026-03-20 (10)
- `generateViewer()` now uses `showDirectoryPicker` instead of `showSaveFilePicker`
- First click: user picks the project folder once — stored in IndexedDB as `dir` key
- Every subsequent click: silently writes `index.html` into that folder with no dialog
- Replaced `persistViewerHandle`/`getStoredViewerHandle` with `persistDirHandle`/`getStoredDirHandle`

### 2026-03-20 (9)
- `generateViewer()` now saves the file first, then opens the tab — tab only opens on successful save
- If user cancels the first-time picker, nothing happens (no tab opened)
- Status message changed to "Saved & opened ✓"

### 2026-03-20 (8)
- Generated viewer nav: replaced individual month buttons with a `<select>` dropdown
- Viewer dropdown populates options once on first render, then sets `select.value = VM` on re-render

### 2026-03-20 (7)
- `generateViewer()` now opens the viewer in a new browser tab automatically (via blob URL)
- First click prompts once to pick save location (`index.html`); handle stored in IndexedDB as `viewer` key
- Subsequent clicks auto-save without prompting (overwrite), then open new tab
- Added `persistViewerHandle()` and `getStoredViewerHandle()` IndexedDB helpers

### 2026-03-20 (6)
- Moved all JavaScript out of `Release.html` into a separate `Release.js` file
- `Release.html` now loads JS via `<script src="Release.js"></script>`
- Replaced non-ASCII Unicode characters (`✓`, `⚠`, `─`) with escape sequences (`\u2713`, `\u26a0`) in JS strings

### 2026-03-20 (5)
- Fixed SyntaxError: `buildViewerHTML` rewritten using string array + `.join()` — no nested template literals
- `<script>` tag in generated HTML split as `'<scr'+'ipt>'` to prevent HTML parser conflict
- Removed "Connect File" nav button and `updateConnectBtn()` function
- `importJSON()` now uses File System Access API (`showOpenFilePicker`) when available, falls back to `<input type=file>`
- `init()` cleaned up — no longer references removed DOM elements

### 2026-03-20 (4)
- Added `date` field to each stage card (shown below title/label, saved to JSON)
- QA button moved from card footer to card-top header row, left of the status badge
- Re-added Import and Export buttons to nav (alongside Connect File)
- Added **Generate** button — saves a standalone read-only `index.html` using File System Access API (`showSaveFilePicker`)
  - Generated viewer embeds all data as inline JS, supports month switching, shows specs/QA/logs read-only
  - No editing controls — purely for sharing/viewing
- `buildViewerHTML()` function produces the full self-contained viewer HTML
- `updDate(i, v)` function added to save stage date

### 2026-03-20 (3)
- `releaseflow-data.json` is now the primary data source
- Added File System Access API — user picks file once; handle stored in IndexedDB (`rf_fsa`) and reused on every page load
- Every `save()` call auto-writes to the JSON file (debounced 300ms)
- `months` array moved into `releaseflow-data.json` — source of truth for month order/sub-headings
- `ALL_MONTHS` constant replaced by `S.months` (loaded from JSON)
- New month added via modal also appends to `S.months` and writes to file
- Nav "Connect File" button: green check when connected, prompts re-connect if permission lapsed
- localStorage kept as automatic fallback when file not connected
- Removed manual Export/Import buttons (replaced by always-on file sync)
- `showStatus()` shows "Saved ✓" / "Loaded from file ✓" in nav

### 2026-03-20 (2)
- Added Export JSON button — downloads `releaseflow-data.json` with all data + `_meta` wrapper (app name, exportedAt, version)
- Added Import JSON button — file picker loads `.json`, merges into current data, re-renders
- Import supports both wrapped format (`{ _meta, data }`) and raw format
- Brief "Exported ✓" / "Imported ✓" status message appears in nav after each action
- Hidden `<input type="file">` used for import file picker

### 2026-03-20 (1)
- Initial documented state
- Cards redesigned: clean white, title+subtitle top, status badge top-right
- Specs shown as 2-column stacked grid (key above value) with hover-delete `×`
- QA panel expands **below** footer buttons (not above specs)
- Change Logs panel expands **below** footer buttons
- QA status uses clickable color-coded badge (cycles on click, no dropdown)
- Tags show as inline popup chip (not full-width box), with circular `×` close
- All 12 months of 2026 pre-seeded with Q1/Q2/Q3/Q4 sub-headings
- Sub-heading editable inline (click to edit, saves on blur)
- Month dropdown shows sub-heading under each month name
- Active month persisted via `rf_activeMonth` localStorage key
- Delete option added to spec detail items (hover to reveal `×`)
