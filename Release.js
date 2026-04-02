// Default months fallback (used only when no JSON file connected yet)
const DEFAULT_MONTHS = [
    { name: "January 2026",   sub: "Q1" },
    { name: "February 2026",  sub: "Q1" },
    { name: "March 2026",     sub: "Q1 Release" },
    { name: "April 2026",     sub: "Q2" },
    { name: "May 2026",       sub: "Q2" },
    { name: "June 2026",      sub: "Q2 Release" },
    { name: "July 2026",      sub: "Q3" },
    { name: "August 2026",    sub: "Q3" },
    { name: "September 2026", sub: "Q3 Release" },
    { name: "October 2026",   sub: "Q4" },
    { name: "November 2026",  sub: "Q4" },
    { name: "December 2026",  sub: "Q4 Release" }
];

let S = { data: {}, months: DEFAULT_MONTHS, activeMonth: "March 2026", theme: "light",
          cardStatuses: [
            {n:"Pending",    c:"#a1a1aa"},
            {n:"In Progress",c:"#f59e0b"},
            {n:"Completed",  c:"#16a34a"},
            {n:"Blocked",    c:"#dc2626"},
            {n:"On Hold",    c:"#8b5cf6"},
            {n:"Cancelled",  c:"#64748b"}
          ],
          approvalStatuses: [
            {n:"Pending",   c:"#a1a1aa"},
            {n:"In Review", c:"#0ea5e9"},
            {n:"Passed",    c:"#16a34a"},
            {n:"Approved",  c:"#5c6ac4"},
            {n:"Failed",    c:"#dc2626"},
            {n:"Waived",    c:"#f59e0b"}
          ] };
// Default colors for known status names (used in migration)
const ST_CLR = {'Pending':'#a1a1aa','In Progress':'#f59e0b','Completed':'#16a34a','Blocked':'#dc2626','On Hold':'#8b5cf6','Cancelled':'#64748b','In Review':'#0ea5e9','Passed':'#16a34a','Approved':'#5c6ac4','Failed':'#dc2626','Waived':'#f59e0b'};
function migrateStatus(x) { if (typeof x === 'string') return {n:x, c:ST_CLR[x]||'#a1a1aa'}; if (x.c === '#a1a1aa' && ST_CLR[x.n]) return {n:x.n, c:ST_CLR[x.n]}; return x; }

let tagTarget = null;
let dirHandle = null;   // File System Access API — directory handle for the project folder
let fileSaveTimer = null;
let S_history = [];
let editMode = false;

/* ── IndexedDB: persist directory handle across page refreshes ── */
function getDB() {
    return new Promise((res, rej) => {
        const req = indexedDB.open('rf_fsa', 1);
        req.onupgradeneeded = e => e.target.result.createObjectStore('handles');
        req.onsuccess = e => res(e.target.result);
        req.onerror = rej;
    });
}
async function persistDirHandle(h) {
    const db = await getDB();
    return new Promise((res, rej) => {
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(h, 'dir');
        tx.oncomplete = res; tx.onerror = rej;
    });
}
async function getStoredDirHandle() {
    const db = await getDB();
    return new Promise(res => {
        const tx = db.transaction('handles', 'readonly');
        const req = tx.objectStore('handles').get('dir');
        req.onsuccess = () => res(req.result || null);
        req.onerror = () => res(null);
    });
}

/* ── File System Access API — folder-based ── */
async function connectFile() {
    try {
        dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await persistDirHandle(dirHandle);
        await readFromFile();
    } catch(e) { /* user cancelled */ }
}

async function readFromFile() {
    if (!dirHandle) return;
    try {
        const fh = await dirHandle.getFileHandle('releaseflow-data.json');
        const file = await fh.getFile();
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (parsed.months && Array.isArray(parsed.months)) S.months = parsed.months;
        if (parsed.cardStatuses) S.cardStatuses = parsed.cardStatuses.map(migrateStatus);
        if (parsed.approvalStatuses) S.approvalStatuses = parsed.approvalStatuses.map(migrateStatus);
        const incoming = parsed.data || parsed;
        delete incoming._meta;
        S.data = incoming;
        S.months.forEach(m => {
            if (!S.data[m.name]) S.data[m.name] = { sub: m.sub, stages: [] };
        });
        const savedActive = localStorage.getItem('rf_activeMonth');
        S.activeMonth = (savedActive && S.data[savedActive]) ? savedActive : S.months[0].name;
        render();
        showStatus('File loaded ✓', 'success');
    } catch(e) {
        if (e.name !== 'NotFoundError') showToast('Could not load data: ' + e.message, 'error');
    }
}

async function writeToFile() {
    if (!dirHandle) return;
    const perm = await dirHandle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
        const req = await dirHandle.requestPermission({ mode: 'readwrite' });
        if (req !== 'granted') { showStatus('Write permission denied', 'error'); return; }
    }
    const payload = {
        _meta: { app: "ReleaseFlow Pro", savedAt: new Date().toISOString(), version: "1" },
        months: S.months,
        data: S.data,
        cardStatuses: S.cardStatuses,
        approvalStatuses: S.approvalStatuses
    };
    try {
        const fh = await dirHandle.getFileHandle('releaseflow-data.json', { create: true });
        const writable = await fh.createWritable();
        await writable.write(JSON.stringify(payload, null, 2));
        await writable.close();
        showStatus('Saved ✓', 'success');
    } catch(e) {
        showStatus('Save failed', 'error');
    }
}

/* ── Init ── */
async function init() {
    S.theme = localStorage.getItem('rf_theme') || 'light';
    applyTheme();
    document.body.classList.add('read-mode');
    const btn = document.getElementById('editModeBtn');
    if (btn) { btn.innerHTML = '<i class="fas fa-lock"></i> Read'; btn.style.color = 'var(--clr-block)'; }

    // Try loading from server first
    try {
        const res = await fetch('/data');
        if (res.ok) {
            const json = await res.json();
            if (json.data) {
                S.data = json.data;
                if (json.months) S.months = json.months;
                if (json.cardStatuses) S.cardStatuses = json.cardStatuses.map(migrateStatus);
                if (json.approvalStatuses) S.approvalStatuses = json.approvalStatuses.map(migrateStatus);
                S.months.forEach(m => {
                    if (!S.data[m.name]) S.data[m.name] = { sub: m.sub, stages: [] };
                });
                const savedActive = localStorage.getItem('rf_activeMonth');
                S.activeMonth = (savedActive && S.data[savedActive]) ? savedActive : S.months[0].name;
                render();
                return;
            }
        }
    } catch (e) {}

    // Fallback to localStorage
    const saved = localStorage.getItem('rf_compact_v1');
    if (saved) {
        try { S.data = JSON.parse(saved); } catch(e) {}
    }
    const savedSt = localStorage.getItem('rf_statuses');
    if (savedSt) {
        try {
            const p = JSON.parse(savedSt);
            if (p.card) S.cardStatuses = p.card.map(migrateStatus);
            if (p.approval) S.approvalStatuses = p.approval.map(migrateStatus);
        } catch(e) {}
    }
    S.months.forEach(m => {
        if (!S.data[m.name]) S.data[m.name] = { sub: m.sub, stages: [] };
    });
    const savedActive = localStorage.getItem('rf_activeMonth');
    S.activeMonth = (savedActive && S.data[savedActive]) ? savedActive : "March 2026";
    render();
}

/* ── Save: POST to server + localStorage backup ── */
function save() {
    localStorage.setItem('rf_compact_v1', JSON.stringify(S.data));
    localStorage.setItem('rf_statuses', JSON.stringify({card: S.cardStatuses, approval: S.approvalStatuses}));
    clearTimeout(fileSaveTimer);
    fileSaveTimer = setTimeout(() => saveToServer(), 300);
}

let _skipHistoryPush = false;
async function saveToServer() {
    if (!_skipHistoryPush) {
        S_history.push({ ts: new Date().toISOString(), snapshot: JSON.stringify({data: S.data, months: S.months, cardStatuses: S.cardStatuses, approvalStatuses: S.approvalStatuses}) });
        if (S_history.length > 20) S_history.shift();
    }
    _skipHistoryPush = false;
    const payload = {
        _meta: { app: "ReleaseFlow Pro", savedAt: new Date().toISOString(), version: "1" },
        months: S.months,
        data: S.data,
        cardStatuses: S.cardStatuses,
        approvalStatuses: S.approvalStatuses
    };
    try {
        const res = await fetch('/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (json.ok) showStatus('Saved ✓', 'success');
        else showStatus('Save failed', 'error');
    } catch (e) {
        // server not available, silently fall back to localStorage only
    }
}

function render() {
    document.getElementById('mActive').textContent = S.activeMonth;
    document.getElementById('headerMonth').textContent = S.activeMonth;
    const subEl = document.getElementById('headerSub');
    if (document.activeElement !== subEl) subEl.innerText = S.data[S.activeMonth].sub;
    document.getElementById('mList').innerHTML = S.months.map(m => {
        const isActive = m.name === S.activeMonth;
        const sub = S.data[m.name]?.sub || m.sub || '';
        return `<div style="padding:8px 14px; cursor:pointer; background:${isActive?'var(--primary-light)':''}; border-radius:6px; margin:2px 4px" onclick="switchMonth('${m.name}')">
            <div style="font-weight:${isActive?'900':'700'}; font-size:12px; color:${isActive?'var(--primary)':'var(--text-main)'};">${m.name}</div>
            ${sub ? `<div style="font-size:10px; font-weight:600; color:${isActive?'var(--primary)':'var(--text-dim)'}; margin-top:1px;">${sub}</div>` : ''}
        </div>`;
    }).join('');

    const stages = S.data[S.activeMonth].stages;
    const container = document.getElementById('timelineContainer');
    container.innerHTML = "";

    // Stage tracker bar
    const trackerEl = document.getElementById('stageTracker');
    if (stages.length > 0) {
        const firstPendingIdx = stages.findIndex(s => s.status !== 'Completed');
        const parts = stages.map((s, idx) => {
            const stObj = S.cardStatuses.find(x => x.n === s.status) || {c:'#a1a1aa'};
            const color = s.cardColor || stObj.c;
            const isDone = s.status === 'Completed';
            const isCurrent = idx === firstPendingIdx;
            const inner = isDone
                ? `<div class="st-circle st-done" style="background:${color};--st-shadow:${color}55">
                     <i class="fas fa-check" style="font-size:13px"></i>
                   </div>`
                : `<div class="st-circle st-pending" style="--st-border:${color};--st-color:${color};--st-shadow:${color}44">
                     <span style="font-size:11px;font-weight:800">${idx + 1}</span>
                   </div>`;
            const label = s.title || 'Untitled';
            const currentClass = isCurrent ? ' st-current' : '';
            const wrapCurrentClass = isCurrent ? ' st-current' : '';
            return `<div class="st-node${currentClass}" onclick="document.getElementById('stage-row-${idx}').scrollIntoView({behavior:'smooth',block:'start'})">
                <div class="st-circle-wrap${wrapCurrentClass}" style="--st-ring:${color}">
                    ${inner}
                </div>
                <div class="st-label" title="${s.title||''}">${label}</div>
            </div>`;
        }).reduce((acc, node, i) => {
            acc.push(node);
            if (i < stages.length - 1) {
                const leftDone  = stages[i].status === 'Completed';
                const rightDone = stages[i+1].status === 'Completed';
                const lc = stages[i].cardColor   || (S.cardStatuses.find(x => x.n === stages[i].status)  ||{c:'#a1a1aa'}).c;
                const rc = stages[i+1].cardColor || (S.cardStatuses.find(x => x.n === stages[i+1].status)||{c:'#a1a1aa'}).c;
                if (!leftDone && !rightDone) {
                    acc.push(`<div class="st-line st-line-pending" style="--st-line-color:${lc}44"></div>`);
                } else {
                    acc.push(`<div class="st-line" style="background:linear-gradient(to right,${lc},${rc})"></div>`);
                }
            }
            return acc;
        }, []);
        trackerEl.innerHTML = `<div class="stage-tracker"><div class="stage-tracker-inner">${parts.join('')}</div></div>`;
    } else {
        trackerEl.innerHTML = '';
    }

    // History panel
    let historyPanel = document.getElementById('history-panel');
    if (S.historyOpen) {
        if (!historyPanel) {
            historyPanel = document.createElement('div');
            historyPanel.id = 'history-panel';
            document.body.appendChild(historyPanel);
        }
        historyPanel.style.cssText = 'position:fixed;right:0;top:0;height:100vh;width:280px;z-index:500;background:var(--surface);border-left:1px solid var(--border);overflow-y:auto;padding:16px;box-shadow:-4px 0 20px rgba(0,0,0,.08)';
        historyPanel.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px"><span style="font-size:13px;font-weight:700;color:var(--text-main)"><i class="fas fa-history" style="color:var(--primary);margin-right:6px"></i>History</span><button onclick="toggleHistory()" style="background:none;border:none;cursor:pointer;font-size:14px;color:var(--text-dim);padding:4px"><i class="fas fa-times"></i></button></div>${S_history.length === 0 ? '<div style="font-size:12px;color:var(--text-dim);text-align:center;padding:20px 0">No history yet</div>' : [...S_history].reverse().map((h, ri) => { const idx = S_history.length - 1 - ri; return `<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 10px;border-radius:8px;margin-bottom:4px;background:var(--surface-2);gap:8px"><div><div style="font-size:11px;font-weight:600;color:var(--text-main)">${new Date(h.ts).toLocaleTimeString()}</div><div style="font-size:10px;color:var(--text-dim)">${new Date(h.ts).toLocaleDateString()}</div></div><button onclick="restoreHistory(${idx})" style="font-size:10px;font-weight:700;color:var(--primary);background:var(--primary-light);border:1px solid rgba(var(--primary-rgb),.25) !important;border-radius:6px;padding:4px 9px;cursor:pointer;font-family:inherit;white-space:nowrap">Restore</button></div>`; }).join('')}`;
    } else {
        if (historyPanel) historyPanel.remove();
    }

    stages.forEach((s, idx) => {
        // Migrate flat string arrays to versioned format
        ['app','gateway','firmware'].forEach(k => {
            if (!s.logs[k]) { s.logs[k] = []; return; }
            if (s.logs[k].length > 0 && typeof s.logs[k][0] === 'string') {
                s.logs[k] = [{ v: '', items: s.logs[k] }];
            }
        });
        const isComments = s.cardType === 'comments';
        const countEntries = k => (s.logs[k]||[]).reduce((sum, vg) => sum + (vg.items?.length||0), 0);
        const totalLogs = isComments ? (s.comments?.length||0) : (countEntries('app') + countEntries('gateway') + countEntries('firmware'));
        const stObj = S.cardStatuses.find(x => x.n === s.status) || {c:'#a1a1aa'};
        const stColor = s.cardColor || stObj.c;
        const row = document.createElement('div');
        row.id = `stage-row-${idx}`;
        row.className = `stage-row status-${s.status}`;
        row.style.setProperty('--st-color', stColor);
        row.innerHTML = `
            <div class="v-line"></div>
            <div class="side-label">${s.title || '—'}</div>
            <div class="dot-wrap"><div class="dot"></div></div>
            <div class="card" onmousedown="lpStart(event,this)" onmouseup="lpEnd()" onmouseleave="lpEnd()" ontouchstart="lpStart(event,this)" ontouchend="lpEnd()" ontouchmove="lpEnd()" style="${s.cardBg ? `background:${s.cardBg}18;` : ''}">
                ${s.deleteConfirm ? `<div class="del-confirm-bar">
                    <span><i class="fas fa-exclamation-triangle" style="margin-right:6px;font-size:11px"></i>Delete this stage?</span>
                    <div style="display:flex;gap:6px">
                        <button onclick="event.stopPropagation();cancelDelete(${idx})" class="del-confirm-btn del-confirm-cancel">Cancel</button>
                        <button onclick="event.stopPropagation();delStage(${idx})" class="del-confirm-btn del-confirm-ok">Delete</button>
                    </div>
                </div>` : ''}

                <!-- TOP: title + subtitle + date + QA + status -->
                <div class="card-top">
                    <div style="flex:1; min-width:0">
                        <div style="display:flex; align-items:baseline; gap:10px; flex-wrap:wrap">
                            <div class="card-title" contenteditable="true" oninput="syncTitle(${idx}, this.innerText)">${s.title || 'Untitled'}</div>
                            <input type="date" value="${s.date||''}" onchange="updDate(${idx},this.value)" style="font-size:11px;color:var(--text-dim);background:none;border:none !important;border-bottom:1px dashed var(--border) !important;padding:2px 0;cursor:pointer;font-family:inherit;font-weight:500;outline:none !important">
                        </div>
                        <div class="card-subtitle" contenteditable="true" onblur="syncLabel(${idx}, this.innerText)" style="margin-top:3px">${s.label || 'Phase'}</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:6px; flex-shrink:0; margin-left:12px">
                        <button class="qa-btn" onclick="toggleColl(${idx},'qaOpen')" style="padding:5px 12px; font-size:11px">
                            <i class="fas fa-check-circle"></i> Approvals${s.qa?.length > 0 ? ` (${s.qa.length})` : ''}
                        </button>
                        <div style="display:flex;align-items:center;gap:4px">
                          <div style="position:relative">
                            <div class="spill" onclick="toggleStatusPicker(${idx})" style="background:${stColor}22;color:${stColor};border-color:${stColor}66;cursor:pointer;user-select:none">${s.status} <i class="fas fa-chevron-down" style="font-size:7px;margin-left:2px;opacity:.7"></i></div>
                            ${s.statusPickerOpen ? `<div class="status-picker">
                              ${S.cardStatuses.map(st => `<div class="sp-item${s.status===st.n?' sp-active':''}" style="display:flex;align-items:center;padding:0" onmouseenter="this.querySelector('.del-st').style.opacity='1'" onmouseleave="this.querySelector('.del-st').style.opacity='0'">
                                <span onclick="setCardStatus(${idx},'${st.n.replace(/'/g,"\\'")}');event.stopPropagation()" style="display:flex;align-items:center;flex:1;padding:7px 6px 7px 12px;cursor:pointer">
                                  <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${st.c};margin-right:8px;flex-shrink:0"></span>${st.n}
                                </span>
                                <span class="del-st" onclick="event.stopPropagation();removeCardStatus('${st.n.replace(/'/g,"\\'")}')" style="opacity:0;font-size:13px;color:var(--text-dim);cursor:pointer;padding:7px 10px 7px 3px;transition:opacity .1s;line-height:1" title="Remove">×</span>
                              </div>`).join('')}
                              <div style="border-top:1px solid var(--border);padding:5px 12px">
                                <button onclick="addCardStatus()" style="font-size:11px;color:var(--primary);background:none;border:none !important;cursor:pointer;font-family:inherit;font-weight:600;padding:2px 0">+ Add Status</button>
                              </div>
                            </div>` : ''}
                          </div>
                          <div style="position:relative">
                            <div onclick="toggleCardColorPicker(${idx})" title="Card color" style="width:16px;height:16px;border-radius:50%;background:${stColor};cursor:pointer;box-shadow:0 0 0 2px var(--surface),0 0 0 3px ${stColor}66;flex-shrink:0;transition:transform .12s" onmouseenter="this.style.transform='scale(1.18)'" onmouseleave="this.style.transform='scale(1)'"></div>
                            ${s.cardColorPickerOpen ? `<div class="status-picker" style="right:0;padding:12px;min-width:0;width:190px">
                              <div style="font-size:9.5px;font-weight:700;color:var(--text-dim);letter-spacing:.5px;text-transform:uppercase;margin-bottom:6px">Accent</div>
                              <div style="display:grid;grid-template-columns:repeat(5,18px);gap:6px;margin-bottom:6px">
                                ${['#a1a1aa','#f59e0b','#16a34a','#dc2626','#0ea5e9','#8b5cf6','#5c6ac4','#64748b','#ec4899','#ef4444'].map(c => `<div onclick="setCardColor(${idx},'${c}')" style="width:18px;height:18px;border-radius:50%;background:${c};cursor:pointer;${(s.cardColor||stColor)===c?'outline:2px solid var(--text-main);outline-offset:2px':''}" onmouseenter="this.style.transform='scale(1.2)'" onmouseleave="this.style.transform='scale(1)'"></div>`).join('')}
                              </div>
                              <button onclick="setCardColor(${idx},'')" style="font-size:10px;color:var(--text-dim);background:none;border:1px dashed var(--border) !important;border-radius:5px;cursor:pointer;font-family:inherit;padding:3px 0;width:100%;text-align:center;margin-bottom:10px">Auto</button>
                              <div style="font-size:9.5px;font-weight:700;color:var(--text-dim);letter-spacing:.5px;text-transform:uppercase;margin-bottom:6px">Card Background</div>
                              <div style="display:grid;grid-template-columns:repeat(5,18px);gap:6px;margin-bottom:6px">
                                ${['#f59e0b','#16a34a','#dc2626','#0ea5e9','#8b5cf6','#5c6ac4','#ec4899','#64748b','#f97316','#06b6d4'].map(c => `<div onclick="setCardBg(${idx},'${c}')" style="width:18px;height:18px;border-radius:4px;background:${c}33;border:1.5px solid ${c}88;cursor:pointer;${s.cardBg===c?'outline:2px solid var(--text-main);outline-offset:2px':''}" onmouseenter="this.style.transform='scale(1.2)'" onmouseleave="this.style.transform='scale(1)'"></div>`).join('')}
                              </div>
                              <button onclick="setCardBg(${idx},'')" style="font-size:10px;color:var(--text-dim);background:none;border:1px dashed var(--border) !important;border-radius:5px;cursor:pointer;font-family:inherit;padding:3px 0;width:100%;text-align:center">Clear background</button>
                            </div>` : ''}
                          </div>
                        </div>
                        <div class="card-ghost-actions" style="margin-left:4px">
                          <div style="position:relative">
                            <button onclick="event.stopPropagation();toggleCardTypePicker(${idx})" title="Change card type" class="ghost-type-btn">
                              <i class="fas fa-${s.cardType==='comments'?'comment-alt':s.cardType==='none'?'minus':'list-ul'}"></i>
                            </button>
                            ${s.cardTypePickerOpen ? `<div onclick="event.stopPropagation()" style="position:absolute;right:0;top:32px;background:var(--surface);border:1px solid var(--border) !important;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.13);padding:6px;z-index:100;min-width:190px">
                              <div style="font-size:9.5px;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:.4px;padding:4px 8px 6px">Card Type</div>
                              ${[
                                {type:'logs',     icon:'list-ul',     label:'Change Logs', sub:'App · Gateway · Firmware'},
                                {type:'comments', icon:'comment-alt', label:'Comments',    sub:'Notes & comment thread'},
                                {type:'none',     icon:'minus',       label:'None',        sub:'Details & approvals only'}
                              ].map(opt => `<button onclick="changeCardType(${idx},'${opt.type}')" style="display:flex;align-items:center;gap:9px;width:100%;padding:8px 10px;background:${s.cardType===opt.type?'var(--primary-light)':'none'};border:none !important;border-radius:7px;cursor:pointer;font-family:inherit;text-align:left;transition:background .12s" onmouseenter="if('${s.cardType}'!=='${opt.type}')this.style.background='var(--surface-2)'" onmouseleave="if('${s.cardType}'!=='${opt.type}')this.style.background='none'">
                                <i class="fas fa-${opt.icon}" style="font-size:12px;color:${s.cardType===opt.type?'var(--primary)':'var(--text-dim)'};width:14px;text-align:center"></i>
                                <div>
                                  <div style="font-size:12px;font-weight:700;color:${s.cardType===opt.type?'var(--primary)':'var(--text-main)'}">${opt.label}</div>
                                  <div style="font-size:10px;color:var(--text-dim);margin-top:1px">${opt.sub}</div>
                                </div>
                                ${s.cardType===opt.type?'<i class="fas fa-check" style="margin-left:auto;color:var(--primary);font-size:10px"></i>':''}
                              </button>`).join('')}
                            </div>` : ''}
                          </div>
                          <button class="ghost-del" onclick="confirmDelete(${idx})" title="Delete stage"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                </div>

                <!-- TAGS -->
                ${(s.tags && s.tags.length > 0) || true ? `<div class="tag-row">
                    ${(s.tags || []).map((t, ti) => {
                      const tc = t.c || '', fc = t.fc || '';
                      const pillStyle = s.openTagIdx===ti
                        ? (tc ? `background:${tc};color:${fc||'#fff'};border-color:${tc} !important;` : `background:var(--primary);color:${fc||'#fff'};`)
                        : (tc ? `background:${tc}18;color:${fc||tc};border-color:${tc}44 !important;` : (fc ? `color:${fc};` : ''));
                      return `<span class="tag-pill" onclick="toggleTag(${idx},${ti})" style="${pillStyle}">${t.n}</span>
                      ${s.openTagIdx===ti ? `<div class="tag-popup" style="height:auto;flex-direction:column;align-items:flex-start;padding:12px 16px;gap:6px;min-width:260px;max-width:340px${tc?`;border-color:${tc} !important`:''}">
                        <div style="display:flex;align-items:center;justify-content:space-between;width:100%;gap:10px">
                          <span style="font-size:12.5px;font-weight:700;color:${fc||tc||'var(--text-main)'}">${t.sn ? `<span style="font-size:10px;font-weight:600;opacity:.55;margin-right:4px">#${t.sn}</span>` : ''}${t.n}</span>
                          <div style="display:flex;align-items:center;gap:5px">
                            <button onclick="openTagEdit(${idx},${ti})" style="height:22px;padding:0 9px;border-radius:6px;background:var(--primary-light);color:var(--primary);font-size:10.5px;font-weight:600;cursor:pointer;border:1px solid rgba(var(--primary-rgb),.22) !important;font-family:inherit"><i class="fas fa-pen" style="font-size:9px;margin-right:3px"></i>Edit</button>
                            <span class="tag-popup-close" onclick="toggleTag(${idx})"><i class="fas fa-times"></i></span>
                          </div>
                        </div>
                        ${(()=>{
                          const raw = (t.d || '').replace(/<[^>]*>/g,'').trim();
                          if (!raw) return '<span style="color:var(--text-dim);font-style:italic;font-size:12px">No description</span>';
                          return `<div style="font-size:12.5px;line-height:1.7;white-space:pre-wrap;word-break:break-word;color:${fc||'var(--text-muted)'};">${t.d}</div>`;
                        })()}
                      </div>` : ''}`;
                    }).join('')}
                    <button class="tag-btn" onclick="openMdl('tagModal', ${idx})">+ Tag</button>
                </div>` : ''}

                <!-- BLOCKED BANNER -->
                ${s.status === 'Blocked' ? `<div style="margin:0 1rem 0.8rem; background:#fef2f2; border:1px solid #fca5a5 !important; border-radius:10px; padding:10px 14px;">
                    <div class="s-head" onclick="toggleColl(${idx}, 'blockedOpen')" style="cursor:pointer; margin-bottom:0">
                        <span style="font-size:11px; font-weight:800; color:#dc2626;">\u26a0 Blocked Reasons (${s.blockedReasons?.length || 0})</span>
                        <i class="fas fa-chevron-${s.blockedOpen?'up':'down'}" style="color:#dc2626; font-size:10px"></i>
                    </div>
                    ${s.blockedOpen ? `<div style="margin-top:8px">${(s.blockedReasons || []).map((r, ri) => `<div class="data-row" style="padding:6px 0; border-color:#fca5a5 !important"><span style="font-weight:900; color:#dc2626; font-size:11px; min-width:16px">${ri+1}</span><div style="flex:1; font-size:12px" contenteditable="true" onblur="updList(${idx}, 'blockedReasons', ${ri}, this.innerText)">${r}</div><i class="far fa-trash-alt" style="opacity:0.3; cursor:pointer" onclick="delList(${idx}, 'blockedReasons', ${ri})"></i></div>`).join('')}<input placeholder="+ Add reason..." style="width:100%; padding:7px 0; font-size:11px; margin-top:6px; background:none; border-bottom:1px dashed #fca5a5 !important" onkeypress="if(event.key==='Enter') addList(${idx}, 'blockedReasons', this)"></div>` : ''}
                </div>` : ''}

                <!-- SPECS BAND -->
                ${(s.details && s.details.length > 0) ? `<div class="specs-band">
                    ${s.details.map((d, di) => `<div class="spec-item" data-idx="${idx}" data-di="${di}" style="position:relative" onmouseenter="this.querySelector('.spec-del').style.opacity='1'" onmouseleave="this.querySelector('.spec-del').style.opacity='0'">
                        <span style="font-size:10.5px;font-weight:600;color:var(--text-dim);min-width:18px;flex-shrink:0">${di+1}.</span>
                        <div class="spec-key" contenteditable="true"
                          onkeydown="specKeyDown(event,'key',${idx},${di})"
                          onblur="updKV(${idx},${di},'k',this.innerText)">${d.k}</div>
                        <div class="spec-val" contenteditable="true"
                          onkeydown="specKeyDown(event,'val',${idx},${di})"
                          onblur="updKV(${idx},${di},'v',this.innerText)">${d.v}</div>
                        <span class="spec-del" onclick="delKV(${idx},${di})" style="position:absolute;top:50%;right:0;transform:translateY(-50%);opacity:0;cursor:pointer;font-size:9px;color:var(--text-dim);transition:0.15s" title="Delete"><i class="fas fa-times"></i></span>
                    </div>`).join('')}
                </div>
                <div style="padding:0 1rem 0.8rem; text-align:right">
                    <button style="font-size:11px;color:var(--text-dim);background:none;cursor:pointer;border:1px dashed var(--border) !important;padding:3px 10px;border-radius:8px" onclick="addKVfocus(${idx})">+ Detail</button>
                </div>` : `<div style="padding:0 1rem 0.8rem"><button style="font-size:12px;font-weight:700;color:var(--primary);background:var(--primary-light);cursor:pointer;border:1px dashed var(--primary) !important;padding:7px 16px;border-radius:10px;width:100%" onclick="addKVfocus(${idx})">+ Add Detail</button></div>`}

                <!-- FOOTER ACTIONS -->
                ${s.cardType !== 'none' ? `<div class="card-footer">
                    <button class="logs-btn" onclick="toggleColl(${idx}, 'logsOpen')">
                        <i class="fas fa-${isComments?'comment-alt':'list-ul'}"></i> ${isComments?'Comments':'View Change Logs'} ${totalLogs > 0 ? `<span style="background:rgba(255,255,255,0.25);padding:1px 6px;border-radius:10px;font-size:10px">${totalLogs}</span>` : ''}
                    </button>
                </div>` : ''}

                <!-- QA PANEL -->
                ${s.qaOpen ? `<div class="expand-panel">
                    <div class="expand-panel-hdr">
                        <span>Approvals</span>
                        <span style="background:var(--border);padding:1px 8px;border-radius:10px;font-size:10px">${s.qa?.length||0}</span>
                    </div>
                    ${(s.qa||[]).map((q,qi)=>{
                        return `<div class="qa-row">
                            <span style="font-size:11px;font-weight:700;color:var(--text-dim);min-width:20px;flex-shrink:0">${qi+1}.</span>
                            <div style="flex:1;min-width:0">
                              <div class="qa-name" contenteditable="true" onblur="updQA(${idx},${qi},'n',this.innerText)">${q.n}</div>
                              <input type="date" value="${q.d||''}" onchange="updQA(${idx},${qi},'d',this.value)"
                                style="font-size:10px;color:var(--text-dim);background:none;border:none !important;border-bottom:1px dashed var(--border) !important;padding:1px 0;margin-top:2px;cursor:pointer;font-family:inherit;font-weight:500;outline:none !important;width:110px">
                            </div>
                            <div style="position:relative;flex-shrink:0">
                              ${(()=>{ const qaObj=S.approvalStatuses.find(x=>x.n===q.v)||{c:'#a1a1aa'}; return `<span class="qa-badge" onclick="toggleQAPicker(${idx},${qi})" style="background:${qaObj.c}22;color:${qaObj.c};border-color:${qaObj.c}66;cursor:pointer">${q.v} <i class="fas fa-chevron-down" style="font-size:6px;margin-left:2px;opacity:.7"></i></span>`; })()}
                              ${s.qaPickerOpen===qi ? `<div class="status-picker" style="right:0;min-width:140px">
                                ${S.approvalStatuses.map(st => `<div class="sp-item${q.v===st.n?' sp-active':''}" style="display:flex;align-items:center;padding:0" onmouseenter="this.querySelector('.del-st').style.opacity='1'" onmouseleave="this.querySelector('.del-st').style.opacity='0'">
                                  <span onclick="setQAStatus(${idx},${qi},'${st.n.replace(/'/g,"\\'")}');event.stopPropagation()" style="display:flex;align-items:center;flex:1;padding:7px 6px 7px 12px;cursor:pointer">
                                    <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${st.c};margin-right:8px;flex-shrink:0"></span>${st.n}
                                  </span>
                                  <span class="del-st" onclick="event.stopPropagation();removeApprovalStatus('${st.n.replace(/'/g,"\\'")}')" style="opacity:0;font-size:13px;color:var(--text-dim);cursor:pointer;padding:7px 10px 7px 3px;transition:opacity .1s;line-height:1" title="Remove">×</span>
                                </div>`).join('')}
                                <div style="border-top:1px solid var(--border);padding:5px 12px">
                                  <button onclick="addApprovalStatus()" style="font-size:11px;color:var(--primary);background:none;border:none !important;cursor:pointer;font-family:inherit;font-weight:600;padding:2px 0">+ Add Status</button>
                                </div>
                              </div>` : ''}
                            </div>
                            <i class="fas fa-times" style="opacity:0.2;cursor:pointer;font-size:10px;margin-left:4px" onclick="delQA(${idx},${qi})"></i>
                        </div>`;
                    }).join('')}
                    <div style="padding:10px 14px">
                        <button style="font-size:11px;font-weight:700;color:#059669;background:#ecfdf5;border:1px dashed #6ee7b7 !important;padding:7px 0;border-radius:8px;cursor:pointer;width:100%" onclick="addQA(${idx})">+ Add Approval</button>
                    </div>
                </div>` : ''}

                <!-- LOGS / COMMENTS PANEL -->
                ${s.logsOpen && s.cardType !== 'none' ? (isComments ? `<div class="expand-panel">
                    <div class="expand-panel-hdr">
                        <span>Comments</span>
                        <span style="background:var(--border);padding:1px 8px;border-radius:10px;font-size:10px">${(s.comments||[]).length}</span>
                    </div>
                    ${(s.comments||[]).map((c,ci)=>`<div class="qa-row" style="align-items:flex-start">
                        <div style="flex:1;min-width:0">
                          <div contenteditable="true" style="font-size:12.5px;color:var(--text-main);line-height:1.5;outline:none;border-radius:4px;padding:1px 3px;margin:-1px -3px" onfocus="this.style.background='var(--surface-2)';this.style.boxShadow='0 0 0 1px var(--border)'" onblur="updComment(${idx},${ci},this)">${c.text}</div>
                          <div style="font-size:10px;color:var(--text-dim);margin-top:2px">${c.ts}</div>
                        </div>
                        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;margin-left:8px;margin-top:3px">
                          <i class="fas fa-pencil-alt" title="Edit" style="opacity:0.2;cursor:pointer;font-size:10px" onclick="this.closest('.qa-row').querySelector('[contenteditable]').focus()"></i>
                          <i class="fas fa-times" style="opacity:0.2;cursor:pointer;font-size:10px" onclick="delComment(${idx},${ci})"></i>
                        </div>
                    </div>`).join('')}
                    <div style="padding:10px 13px">
                        <div style="display:flex;align-items:center;gap:8px;background:var(--surface-2);border:1px solid var(--border);border-radius:20px;padding:6px 8px 6px 14px;transition:border-color .15s" onfocusin="this.style.borderColor='var(--primary)'" onfocusout="this.style.borderColor='var(--border)'">
                            <input id="ci-${idx}" placeholder="Write a comment…" style="flex:1;font-size:12px;background:none;border:none !important;outline:none;font-family:inherit;color:var(--text-main)" onkeypress="if(event.key==='Enter'){addComment(${idx},this);event.preventDefault()}">
                            <button onclick="addComment(${idx},document.getElementById('ci-${idx}'))" style="background:var(--primary);color:#fff;border:none;border-radius:50%;width:26px;height:26px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas fa-arrow-up" style="font-size:10px"></i></button>
                        </div>
                    </div>
                </div>` : `<div class="expand-panel">
                    <div class="expand-panel-hdr">
                        <span>Change Logs</span>
                        <span style="background:var(--border);padding:1px 8px;border-radius:10px;font-size:10px">${totalLogs}</span>
                    </div>
                    ${[{k:'app',l:'App'},{k:'gateway',l:'Gateway'},{k:'firmware',l:'Firmware'}].map(cat=>{
                        const versions = s.logs[cat.k] || [];
                        const catTotal = versions.reduce((sum,vg)=>sum+(vg.items?.length||0),0);
                        return `
                        <div class="log-cat">
                            <div class="log-hdr" onclick="toggleCat(${idx},'${cat.k}')">
                                <span>${cat.l} <span style="font-weight:500;color:var(--text-dim)">(${catTotal})</span></span>
                                <i class="fas fa-chevron-${s.openCat===cat.k?'up':'down'}" style="font-size:10px;color:var(--text-dim)"></i>
                            </div>
                            ${s.openCat===cat.k?`<div>
                                ${versions.map((vg,vi)=>`
                                <div style="margin-bottom:4px;border-bottom:1px solid var(--border)">
                                    <div style="display:flex;align-items:center;gap:6px;padding:6px 12px;background:var(--surface-2)">
                                        <i class="fas fa-tag" style="font-size:9px;color:var(--primary);opacity:.7"></i>
                                        <input value="${vg.v||''}" placeholder="Device"
                                            style="flex:1;font-size:12px;font-weight:700;color:var(--text-main);background:none;border:none !important;border-bottom:1px dashed var(--border) !important;outline:none;font-family:inherit;padding:1px 0"
                                            onblur="renameVersion(${idx},'${cat.k}',${vi},this.value)">
                                        <i class="fas fa-times" title="Remove version" style="font-size:10px;color:var(--text-dim);cursor:pointer;opacity:.35;transition:opacity .12s" onmouseenter="this.style.opacity='.8'" onmouseleave="this.style.opacity='.35'" onclick="delVersion(${idx},'${cat.k}',${vi})"></i>
                                    </div>
                                    ${(vg.items||[]).map((l,li)=>`<div class="log-item" style="padding-left:28px">
                                        <span style="color:var(--primary);font-weight:900;min-width:16px;font-size:10px">${li+1}</span>
                                        <div style="flex:1" contenteditable="true" onblur="updLog(${idx},'${cat.k}',${vi},${li},this.innerHTML,this.innerText)">${l}</div>
                                        <i class="far fa-trash-alt" style="opacity:0.2;cursor:pointer" onclick="delLog(${idx},'${cat.k}',${vi},${li})"></i>
                                    </div>`).join('')}
                                    <div style="padding:4px 12px 8px 28px">
                                        <div style="display:flex;align-items:center;gap:8px;background:var(--surface-2);border:1px solid var(--border);border-radius:14px;padding:4px 6px 4px 11px;transition:border-color .15s" onfocusin="this.style.borderColor='var(--primary)'" onfocusout="this.style.borderColor='var(--border)'">
                                            <input id="li-${idx}-${cat.k}-${vi}" placeholder="Add changelog…" style="flex:1;font-size:11px;background:none;border:none !important;outline:none;font-family:inherit;color:var(--text-main)" onkeypress="if(event.key==='Enter'){addLog(${idx},'${cat.k}',${vi},this);event.preventDefault()}">
                                            <button onclick="addLog(${idx},'${cat.k}',${vi},document.getElementById('li-${idx}-${cat.k}-${vi}'))" style="background:var(--primary);color:#fff;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas fa-plus" style="font-size:8px"></i></button>
                                        </div>
                                    </div>
                                </div>`).join('')}
                                <div style="padding:6px 12px 10px">
                                    <button onclick="addVersion(${idx},'${cat.k}')" style="font-size:11px;font-weight:700;color:var(--primary);background:var(--primary-light);border:1px dashed var(--primary) !important;padding:6px 0;border-radius:8px;cursor:pointer;width:100%;font-family:inherit">+ Add Version</button>
                                </div>
                            </div>`:''}
                        </div>`;
                    }).join('')}
                </div>`) : ''}

            </div>
        `;
        container.appendChild(row);
    });

    // + Add Stage button at the bottom of the timeline
    const addBtn = document.createElement('div');
    addBtn.style.cssText = 'display:flex;justify-content:center;padding:0 0 1rem';
    addBtn.innerHTML = `<button onclick="addStage()" style="font-size:12px;font-weight:700;color:var(--primary);background:var(--primary-light);cursor:pointer;border:1.5px dashed var(--primary) !important;padding:8px 28px;border-radius:12px;font-family:inherit;letter-spacing:.2px;transition:background .12s">+ Add Stage</button>`;
    container.appendChild(addBtn);
}

/* --- LOGIC --- */
function syncTitle(i, v) { S.data[S.activeMonth].stages[i].title = v; const row = document.querySelectorAll('.stage-row')[i]; const sl = row?.querySelector('.side-label'); if(sl) sl.innerText = v; save(); }
function syncLabel(i, v) { S.data[S.activeMonth].stages[i].label = v; save(); }
function sync(i, v, isS) { if(isS) syncLabel(i,v); else syncTitle(i,v); }
function delQA(i, qi) { S.data[S.activeMonth].stages[i].qa.splice(qi,1); save(); render(); }
function cycleStatus(i) { const s = S.data[S.activeMonth].stages[i]; const st = ["Pending", "Completed", "Blocked"]; s.status = st[(st.indexOf(s.status) + 1) % 3]; save(); render(); }
function toggleColl(i, f) { S.data[S.activeMonth].stages[i][f] = !S.data[S.activeMonth].stages[i][f]; render(); }
function toggleCat(i, k) { const s = S.data[S.activeMonth].stages[i]; s.openCat = (s.openCat === k) ? "" : k; render(); }
function toggleTag(i, ti) { const s = S.data[S.activeMonth].stages[i]; s.openTagIdx = (s.openTagIdx === ti) ? undefined : ti; render(); }
function switchMonth(m) { S.activeMonth = m; localStorage.setItem('rf_activeMonth', m); document.getElementById('mDrop').style.display = 'none'; render(); }
function saveMonth() { const n = document.getElementById('newMName').value, s = document.getElementById('newMSub').value; if(!n) return; if(!S.data[n]) { S.data[n] = { sub: s, stages: [] }; S.months.push({ name: n, sub: s }); } S.activeMonth = n; localStorage.setItem('rf_activeMonth', n); save(); render(); closeMdl('monthModal'); }
function saveSubHeading(v) { S.data[S.activeMonth].sub = v.trim(); save(); }
let tagEditIdx = null;
function pickTagColor(el) {
  document.querySelectorAll('#tcRow .tc').forEach(t => t.classList.remove('sel'));
  el.classList.add('sel');
  document.getElementById('tColor').value = el.dataset.c;
}
function setTagColorPicker(c) {
  document.querySelectorAll('#tcRow .tc').forEach(t => t.classList.remove('sel'));
  document.getElementById('tColor').value = c || '';
  if (c) {
    const match = document.querySelector(`#tcRow .tc[data-c="${c}"]`);
    if (match) match.classList.add('sel');
  }
}
let _savedDescRange = null;
function saveDescSelection() {
  const desc = document.getElementById('tDesc');
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && desc.contains(sel.anchorNode)) {
    _savedDescRange = sel.getRangeAt(0).cloneRange();
  }
}
function pickTagTextColor(el) {
  document.querySelectorAll('#tcTextRow .tc').forEach(t => t.classList.remove('sel'));
  el.classList.add('sel');
  const color = el.dataset.c;
  document.getElementById('tTextColor').value = color;
  const desc = document.getElementById('tDesc');
  if (_savedDescRange && !_savedDescRange.collapsed) {
    desc.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(_savedDescRange);
    document.execCommand('foreColor', false, color || '#000000');
    _savedDescRange = null;
  } else {
    desc.style.color = color || '';
  }
}
function setTagTextColorPicker(c) {
  document.querySelectorAll('#tcTextRow .tc').forEach(t => t.classList.remove('sel'));
  document.getElementById('tTextColor').value = c || '';
  document.getElementById('tDesc').style.color = c || '';
  const match = document.querySelector(c ? `#tcTextRow .tc[data-c="${c}"]` : '#tcTextRow .tc[data-c=""]');
  if (match) match.classList.add('sel');
}
function descKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.execCommand('insertHTML', false, '<br>• ');
  }
}
function openTagEdit(i, ti) {
  const tag = S.data[S.activeMonth].stages[i].tags[ti];
  tagTarget = i; tagEditIdx = ti;
  document.getElementById('tName').value = tag.n;
  document.getElementById('tDesc').innerHTML = tag.d || '• ';
  setTagColorPicker(tag.c || '');
  setTagTextColorPicker(tag.fc || '');
  document.getElementById('tagModalTitle').textContent = 'Edit Tag';
  document.getElementById('tagDelBtn').style.display = 'block';
  if (tag.sn) {
    document.getElementById('tSnNum').textContent = tag.sn;
    document.getElementById('tSnBadge').style.display = 'flex';
  } else {
    document.getElementById('tSnBadge').style.display = 'none';
  }
  document.getElementById('tagModal').style.display = 'flex';
}
function saveTag() {
  const n = document.getElementById('tName').value.trim(), d = document.getElementById('tDesc').innerHTML.trim(), c = document.getElementById('tColor').value, fc = document.getElementById('tTextColor').value;
  if (!n) return;
  if (!S.data[S.activeMonth].stages[tagTarget].tags) S.data[S.activeMonth].stages[tagTarget].tags = [];
  const snNum = parseInt(document.getElementById('tSnNum').textContent) || null;
  const tagObj = { n, d };
  if (c) tagObj.c = c;
  if (fc) tagObj.fc = fc;
  if (tagEditIdx !== null) {
    const existing = S.data[S.activeMonth].stages[tagTarget].tags[tagEditIdx];
    if (existing.sn) tagObj.sn = existing.sn;
    S.data[S.activeMonth].stages[tagTarget].tags[tagEditIdx] = tagObj;
  } else {
    if (snNum) tagObj.sn = snNum;
    S.data[S.activeMonth].stages[tagTarget].tags.push(tagObj);
  }
  tagEditIdx = null;
  save(); render(); closeMdl('tagModal');
}
function delTagEdit() {
  if (tagEditIdx === null) return;
  S.data[S.activeMonth].stages[tagTarget].tags.splice(tagEditIdx, 1);
  tagEditIdx = null;
  save(); render(); closeMdl('tagModal');
}
function addStage() {
  const modal = document.getElementById('newStageModal');
  modal.style.display = 'flex';
  setTimeout(() => document.getElementById('newStageName').focus(), 80);
}
function createStage(type) {
  const nameEl = document.getElementById('newStageName');
  const title = (nameEl.value || '').trim() || 'New Stage';
  nameEl.value = '';
  S.data[S.activeMonth].stages.push({ title, label: "Phase", date: "", status: "Pending",
    cardType: type, cardColor: '', cardBg: '',
    details: [], qa: [], logs: {app:[], gateway:[], firmware:[]},
    comments: [], tags: [], blockedReasons: [] });
  save(); render(); closeMdl('newStageModal');
  const idx = S.data[S.activeMonth].stages.length - 1;
  setTimeout(() => document.getElementById('stage-row-' + idx)?.scrollIntoView({behavior:'smooth', block:'center'}), 80);
}
function addComment(i, input) {
  if (!input.value.trim()) return;
  if (!S.data[S.activeMonth].stages[i].comments) S.data[S.activeMonth].stages[i].comments = [];
  const now = new Date(); const ts = now.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) + ' ' + now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  S.data[S.activeMonth].stages[i].comments.push({text: input.value.trim(), ts});
  input.value = ''; save(); render();
}
function delComment(i, ci) { S.data[S.activeMonth].stages[i].comments.splice(ci, 1); save(); render(); }
function updComment(i, ci, el) { const v = el.innerHTML.trim(); if (el.innerText.trim()) { S.data[S.activeMonth].stages[i].comments[ci].text = v; save(); } else { el.innerHTML = S.data[S.activeMonth].stages[i].comments[ci].text; } el.style.background=''; el.style.boxShadow=''; }
function setCardBg(i, c) { S.data[S.activeMonth].stages[i].cardBg = c; S.data[S.activeMonth].stages[i].cardColorPickerOpen = false; save(); render(); }
function toggleCardTypePicker(i) { const s = S.data[S.activeMonth].stages[i]; s.cardTypePickerOpen = !s.cardTypePickerOpen; render(); }
function changeCardType(i, type) { S.data[S.activeMonth].stages[i].cardType = type; S.data[S.activeMonth].stages[i].cardTypePickerOpen = false; save(); render(); }
function updDate(i, v) { S.data[S.activeMonth].stages[i].date = v; save(); }
function confirmDelete(i) { S.data[S.activeMonth].stages[i].deleteConfirm = true; render(); }
function cancelDelete(i) { S.data[S.activeMonth].stages[i].deleteConfirm = false; render(); }
function delStage(i) { S.data[S.activeMonth].stages.splice(i, 1); save(); render(); }
function updKV(i, di, k, v) { S.data[S.activeMonth].stages[i].details[di][k] = v.trim(); save(); }
function addKV(i) { S.data[S.activeMonth].stages[i].details.push({k:"", v:""}); render(); }
function addKVfocus(i) {
  S.data[S.activeMonth].stages[i].details.push({k:"", v:""});
  render();
  setTimeout(() => {
    const all = document.querySelectorAll(`.spec-item[data-idx="${i}"]`);
    const last = all[all.length - 1];
    if (last) { const k = last.querySelector('.spec-key'); if (k) k.focus(); }
  }, 30);
}
function delKV(i, di) { S.data[S.activeMonth].stages[i].details.splice(di,1); render(); }
function specKeyDown(e, role, i, di) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (role === 'key') {
    // Move focus to the value field of this item
    const val = e.target.nextElementSibling;
    if (val && val.classList.contains('spec-val')) val.focus();
  } else {
    // Save current value and add new row
    updKV(i, di, 'v', e.target.innerText);
    addKVfocus(i);
  }
}
// ── Long-press delete ──
let _lpTimer = null, _lpCard = null;
function lpStart(e, card) {
  if (!editMode) return;
  if (e.target.isContentEditable || e.target.closest('button,input,select,.spill,.qa-btn,.tag-pill,.tag-btn,.logs-btn,.qa-badge,.spec-del,.ghost-del,.tag-popup')) return;
  _lpCard = card;
  _lpTimer = setTimeout(() => {
    if (_lpCard) {
      _lpCard.classList.add('lp-del');
      document.addEventListener('pointerdown', lpDismiss, { once: true, capture: true });
    }
  }, 550);
}
function lpEnd() { clearTimeout(_lpTimer); _lpTimer = null; }
function lpDismiss(e) {
  if (_lpCard && !_lpCard.contains(e.target)) {
    _lpCard.classList.remove('lp-del');
    _lpCard = null;
  }
}

/* ── Status helpers ── */
function statusCls(st) { return ['Pending','Completed','Blocked'].includes(st) ? st : 'custom'; }
function qaBadgeCls(st) { return ['Pending','Passed','Approved','Failed'].includes(st) ? st : 'Pending'; }
function toggleStatusPicker(i) { const s = S.data[S.activeMonth].stages[i]; s.statusPickerOpen = !s.statusPickerOpen; render(); }
function setCardStatus(i, st) { const s = S.data[S.activeMonth].stages[i]; s.status = st; s.cardColor = ''; s.statusPickerOpen = false; save(); render(); }
function removeCardStatus(n) { S.cardStatuses = S.cardStatuses.filter(x => x.n !== n); save(); render(); }
function removeApprovalStatus(n) { S.approvalStatuses = S.approvalStatuses.filter(x => x.n !== n); save(); render(); }
function toggleCardColorPicker(i) { const s = S.data[S.activeMonth].stages[i]; s.cardColorPickerOpen = !s.cardColorPickerOpen; render(); }
function setCardColor(i, c) { S.data[S.activeMonth].stages[i].cardColor = c; S.data[S.activeMonth].stages[i].cardColorPickerOpen = false; save(); render(); }
function addCardStatus() { openStatusModal('card'); }
function toggleQAPicker(i, qi) { const s = S.data[S.activeMonth].stages[i]; s.qaPickerOpen = (s.qaPickerOpen === qi) ? -1 : qi; render(); }
function setQAStatus(i, qi, st) { S.data[S.activeMonth].stages[i].qa[qi].v = st; S.data[S.activeMonth].stages[i].qaPickerOpen = -1; save(); render(); }
function addApprovalStatus() { openStatusModal('approval'); }
let statusModalType = 'card';
function openStatusModal(type) {
  statusModalType = type;
  document.getElementById('sName').value = '';
  document.getElementById('sColor').value = '#a1a1aa';
  document.querySelectorAll('#scRow .tc').forEach(t => t.classList.remove('sel'));
  const first = document.querySelector('#scRow .tc');
  if (first) first.classList.add('sel');
  document.getElementById('statusModal').style.display = 'flex';
}
function pickStatusColor(el) {
  document.querySelectorAll('#scRow .tc').forEach(t => t.classList.remove('sel'));
  el.classList.add('sel');
  document.getElementById('sColor').value = el.dataset.c;
}
function saveNewStatus() {
  const n = document.getElementById('sName').value.trim();
  const c = document.getElementById('sColor').value || '#a1a1aa';
  if (!n) return;
  if (statusModalType === 'card') {
    if (!S.cardStatuses.find(x => x.n === n)) S.cardStatuses.push({n, c});
  } else {
    if (!S.approvalStatuses.find(x => x.n === n)) S.approvalStatuses.push({n, c});
  }
  save(); render(); closeMdl('statusModal');
}

function updQA(i, qi, f, v) { S.data[S.activeMonth].stages[i].qa[qi][f] = typeof v === 'string' ? v.trim() : v; save(); render(); }
function addQA(i) { S.data[S.activeMonth].stages[i].qa.push({n:"Approval", v:"Pending", d:""}); render(); }
function quickAddApproval(i) { S.data[S.activeMonth].stages[i].qa.push({n:"Approval", v:"Pending", d:""}); S.data[S.activeMonth].stages[i].qaOpen = true; save(); render(); }
function addLog(i, c, vi, input) { if(!input.value.trim()) return; const vg = S.data[S.activeMonth].stages[i].logs[c][vi]; if(!vg.items) vg.items=[]; vg.items.push(input.value.trim()); input.value=""; save(); render(); }
function updLog(i, c, vi, li, html, text) { if (text?.trim()) { S.data[S.activeMonth].stages[i].logs[c][vi].items[li] = html; save(); } }
function delLog(i, c, vi, li) { S.data[S.activeMonth].stages[i].logs[c][vi].items.splice(li, 1); save(); render(); }
function addVersion(i, c) { S.data[S.activeMonth].stages[i].logs[c].push({v:'', items:[]}); save(); render(); setTimeout(()=>{ const vers=S.data[S.activeMonth].stages[i].logs[c]; const vi=vers.length-1; document.querySelector(`#stage-row-${i} input[id^="li-${i}-${c}-"]`)?.closest('.log-cat')?.querySelectorAll('input[placeholder="Device"]')[vi]?.focus(); },80); }
function delVersion(i, c, vi) { showConfirm('Remove this version and all its entries?', () => { S.data[S.activeMonth].stages[i].logs[c].splice(vi,1); save(); render(); }); }
function renameVersion(i, c, vi, val) { S.data[S.activeMonth].stages[i].logs[c][vi].v = val.trim(); save(); }
function addList(i, f, input) { if(!input.value.trim()) return; S.data[S.activeMonth].stages[i][f].push(input.value.trim()); input.value=""; save(); render(); }
function delList(i, f, li) { S.data[S.activeMonth].stages[i][f].splice(li, 1); save(); render(); }
function updList(i, f, li, v) { S.data[S.activeMonth].stages[i][f][li] = v; save(); }
function openMdl(id, i) {
  if (i !== undefined) tagTarget = i;
  if (id === 'tagModal') {
    tagEditIdx = null;
    document.getElementById('tName').value = '';
    document.getElementById('tDesc').innerHTML = '• ';
    setTagColorPicker('');
    setTagTextColorPicker('');
    document.getElementById('tagModalTitle').textContent = 'Add Tag';
    document.getElementById('tagDelBtn').style.display = 'none';
    // Show next serial number
    const allTags = (S.data[S.activeMonth]?.stages || []).flatMap(s => s.tags || []);
    const maxSn = allTags.reduce((m, t) => Math.max(m, t.sn || 0), 0);
    document.getElementById('tSnNum').textContent = maxSn + 1;
    document.getElementById('tSnBadge').style.display = 'flex';
  }
  document.getElementById(id).style.display = 'flex';
}
function highlightTagColors() {
  const label = document.getElementById('tColorLabel');
  const row = document.getElementById('tcRow');
  label.style.color = 'var(--primary)';
  row.style.outline = '2px solid var(--primary)';
  row.style.outlineOffset = '3px';
  row.style.borderRadius = '8px';
  row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  setTimeout(() => {
    label.style.color = '';
    row.style.outline = '';
    row.style.outlineOffset = '';
    row.style.borderRadius = '';
  }, 1800);
}
function closeMdl(id) { document.getElementById(id).style.display = 'none'; }
function toggleTheme() { S.theme = S.theme === 'light' ? 'dark' : 'light'; applyTheme(); localStorage.setItem('rf_theme', S.theme); render(); }
function applyTheme() { document.documentElement.setAttribute('data-theme', S.theme); }

function showStatus(msg, type) { showToast(msg, type); }
function showToast(msg, type = 'info', actions = null, duration = 3000) {
    const icons = { info: 'fa-info-circle', success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle' };
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<i class="fas ${icons[type]||icons.info} toast-icon"></i><span style="flex:1">${msg}</span>${actions ? `<div class="toast-actions">${actions.map(a=>`<button class="toast-action-btn" data-action="${a.label}">${a.label}</button>`).join('')}</div>` : ''}`;
    if (actions) {
        actions.forEach(a => el.querySelector(`[data-action="${a.label}"]`).addEventListener('click', () => { a.cb(); removeToast(el); }));
    }
    container.appendChild(el);
    const t = duration > 0 ? setTimeout(() => removeToast(el), duration) : null;
    el.addEventListener('click', () => { if (!actions) { clearTimeout(t); removeToast(el); } });
    return el;
}
function removeToast(el) {
    el.classList.add('removing');
    el.addEventListener('animationend', () => el.remove(), { once: true });
}
function showConfirm(msg, onConfirm) {
    showToast(msg, 'warning', [
        { label: 'Cancel', cb: () => {} },
        { label: 'Confirm', cb: onConfirm }
    ], 0);
}

/* --- HISTORY --- */
function toggleHistory() { S.historyOpen = !S.historyOpen; render(); }
function restoreHistory(idx) {
    const h = S_history[idx];
    if (!h) return;
    // Snapshot current state so we can undo
    const undoSnapshot = JSON.stringify({data: S.data, months: S.months, cardStatuses: S.cardStatuses, approvalStatuses: S.approvalStatuses});
    const p = JSON.parse(h.snapshot);
    S.data = p.data; S.months = p.months; S.cardStatuses = p.cardStatuses; S.approvalStatuses = p.approvalStatuses;
    S.historyOpen = false;
    localStorage.setItem('rf_compact_v1', JSON.stringify(S.data));
    localStorage.setItem('rf_statuses', JSON.stringify({card: S.cardStatuses, approval: S.approvalStatuses}));
    _skipHistoryPush = true;
    saveToServer();
    render();
    const time = new Date(h.ts).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'});
    showToast('Restored to ' + time, 'success', [{
        label: 'Undo',
        cb: () => {
            const prev = JSON.parse(undoSnapshot);
            S.data = prev.data; S.months = prev.months; S.cardStatuses = prev.cardStatuses; S.approvalStatuses = prev.approvalStatuses;
            localStorage.setItem('rf_compact_v1', JSON.stringify(S.data));
            localStorage.setItem('rf_statuses', JSON.stringify({card: S.cardStatuses, approval: S.approvalStatuses}));
            _skipHistoryPush = true;
            saveToServer();
            render();
            showToast('Restore undone', 'info');
        }
    }], 5000);
}

/* --- EDIT MODE --- */
function toggleEditMode() {
    const btn = document.getElementById('editModeBtn');
    if (editMode) {
        editMode = false;
        document.body.classList.add('read-mode');
        if (btn) { btn.innerHTML = '<i class="fas fa-lock"></i> Read'; btn.style.color = 'var(--clr-block)'; }
        showToast('Read mode — view only', 'info');
    } else {
        const modal = document.getElementById('pwModal');
        const input = document.getElementById('pwInput');
        const err = document.getElementById('pwError');
        input.value = '';
        input.type = 'password';
        input.querySelector && (input.querySelector('i') || null);
        err.style.display = 'none';
        modal.style.display = 'flex';
        setTimeout(() => input.focus(), 80);
    }
}
function submitPassword() {
    const pw = document.getElementById('pwInput').value;
    const err = document.getElementById('pwError');
    const btn = document.getElementById('editModeBtn');
    if (pw === '912211') {
        closePwModal();
        editMode = true;
        document.body.classList.remove('read-mode');
        if (btn) { btn.innerHTML = '<i class="fas fa-lock-open"></i> Edit'; btn.style.color = ''; }
        showToast('Edit mode unlocked ✓', 'success');
    } else {
        err.style.display = 'block';
        const input = document.getElementById('pwInput');
        input.style.borderColor = '#dc2626';
        input.style.animation = 'none';
        setTimeout(() => { input.style.animation = 'pw-shake .3s ease'; }, 10);
        setTimeout(() => { input.style.borderColor = 'var(--border)'; input.style.animation = ''; }, 600);
        input.select();
    }
}
function closePwModal() {
    document.getElementById('pwModal').style.display = 'none';
    document.getElementById('pwInput').value = '';
    document.getElementById('pwError').style.display = 'none';
}

/* --- EXPORT / IMPORT --- */
function exportJSON() {
    const wb = XLSX.utils.book_new();
    S.months.forEach(m => {
        const stages = S.data[m.name]?.stages || [];
        const rows = [['Stage','Status','Date','Label','Details','QA Approvals','Card Type']];
        stages.forEach(s => {
            const details = (s.details||[]).map(d=>`${d.k}: ${d.v}`).join('; ');
            const qa = (s.qa||[]).map(q=>`${q.n}: ${q.v}`).join('; ');
            rows.push([s.title||'', s.status||'', s.date||'', s.label||'', details, qa, s.cardType||'']);
        });
        const ws = XLSX.utils.aoa_to_sheet(rows);
        // Column widths
        ws['!cols'] = [20,12,12,14,40,30,12].map(w=>({wch:w}));
        // Bold header row
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let C = range.s.c; C <= range.e.c; C++) {
            const cell = ws[XLSX.utils.encode_cell({r:0,c:C})];
            if (cell) { cell.s = { font: { bold: true }, fill: { fgColor: { rgb: 'E8F0FE' } } }; }
        }
        const sheetName = m.name.replace(/[:\\\/\?\*\[\]]/g,'').slice(0,31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });
    XLSX.writeFile(wb, 'releaseflow-export.xlsx');
    showStatus('Exported ✓', 'success');
}
function importJSON() {
    if (window.showOpenFilePicker) { connectFile(); }
    else { document.getElementById('jsonFileInput').value = ''; document.getElementById('jsonFileInput').click(); }
}

/* --- GENERATE view.html --- */
async function generateViewer() {
    if (!dirHandle) {
        showStatus('Click Import first to connect your project folder', 'warning');
        return;
    }
    const html = buildViewerHTML();
    // Write view.html into the project folder — no dialog
    try {
        const fh = await dirHandle.getFileHandle('view.html', { create: true });
        const w = await fh.createWritable();
        await w.write(html);
        await w.close();
    } catch(e) {
        showStatus('Save failed', 'error');
        return;
    }
    // Open in new tab
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showStatus('Saved & opened ✓', 'success');
}

function buildViewerHTML() {
    const dataStr = JSON.stringify({ months: S.months, data: S.data });

    const scriptContent = [
        'const VD = ' + dataStr + ';',
        'let VM = VD.months[0].name;',
        'function vRender() {',
        '  var sel = document.getElementById("mNav");',
        '  if (!sel.options.length) {',
        '    VD.months.forEach(function(m) {',
        '      var o = document.createElement("option");',
        '      o.value = m.name; o.textContent = m.name;',
        '      sel.appendChild(o);',
        '    });',
        '  }',
        '  sel.value = VM;',
        '  document.getElementById("vTitle").textContent = VM;',
        '  document.getElementById("vSub").textContent = VD.data[VM] ? VD.data[VM].sub : "";',
        '  var stages = (VD.data[VM] && VD.data[VM].stages) || [];',
        '  var c = document.getElementById("vContainer");',
        '  c.innerHTML = "";',
        '  stages.forEach(function(s) {',
        '    var cls = s.status==="Completed"?"done":s.status==="Blocked"?"blocked":"";',
        '    var sl  = s.status==="Completed"?"Done":s.status;',
        '    var tl  = ((s.logs&&s.logs.app?s.logs.app.length:0)+(s.logs&&s.logs.gateway?s.logs.gateway.length:0)+(s.logs&&s.logs.firmware?s.logs.firmware.length:0));',
        '    var h = "";',
        '    h += "<div class=\\"vline\\"></div>";',
        '    h += "<div class=\\"slabel\\">" + (s.label||"") + "</div>";',
        '    h += "<div class=\\"dot-w\\"><div class=\\"dot\\"></div></div>";',
        '    h += "<div class=\\"card\\">";',
        '    h += "<div class=\\"ctop\\">";',
        '    h += "<div style=\\"flex:1\\">";',
        '    h += "<div class=\\"ctitle\\">" + (s.title||"") + "</div>";',
        '    h += "<div class=\\"csub\\">" + (s.label||"") + "</div>";',
        '    if(s.date) h += "<div class=\\"cdate\\">" + s.date + "</div>";',
        '    h += "</div>";',
        '    h += "<div class=\\"topright\\">";',
        '    if(s.qa&&s.qa.length) h += "<span class=\\"spill qa-count\\">QA (" + s.qa.length + ")</span>";',
        '    h += "<span class=\\"spill sp-" + s.status + "\\">" + sl + "</span>";',
        '    h += "</div></div>";',
        '    if(s.tags&&s.tags.length) { h += "<div class=\\"tags\\">"+s.tags.map(function(t){return"<span class=\\"tpill\\">"+t.n+"</span>";}).join("")+"</div>"; }',
        '    if(s.details&&s.details.length) { h += "<div class=\\"specs\\">"+s.details.map(function(d){return"<div class=\\"si\\"><div class=\\"sk\\">"+d.k+"</div><div class=\\"sv\\">"+d.v+"</div></div>";}).join("")+"</div>"; }',
        '    if(s.qa&&s.qa.length) { h += "<div class=\\"qa-list\\"><div class=\\"qa-hdr\\">QA Checks</div>"+s.qa.map(function(q){return"<div class=\\"qa-r\\"><span style=\\"flex:1;font-weight:600\\">"+q.n+"</span><span class=\\"qa-badge-s qa-"+q.v+"\\">"+q.v+"</span></div>";}).join("")+"</div>"; }',
        '    if(tl>0) {',
        '      var lh = "<div class=\\"logs\\"><div class=\\"logs-hdr\\"><span>Change Logs</span><span>"+tl+"</span></div>";',
        '      [{k:"app",l:"App"},{k:"gateway",l:"Gateway"},{k:"firmware",l:"Firmware"}].forEach(function(cat){',
        '        if(s.logs[cat.k]&&s.logs[cat.k].length) {',
        '          lh += "<div class=\\"lcat-hdr\\">"+cat.l+" ("+s.logs[cat.k].length+")</div>";',
        '          s.logs[cat.k].forEach(function(e,i){ lh += "<div class=\\"litem\\"><span style=\\"color:#4f46e5;font-weight:900;min-width:20px\\">"+(i+1)+"</span><span>"+e+"</span></div>"; });',
        '        }',
        '      });',
        '      lh += "</div>"; h += lh;',
        '    }',
        '    h += "</div>";',
        '    var row = document.createElement("div");',
        '    row.className = "row " + cls;',
        '    row.innerHTML = h;',
        '    c.appendChild(row);',
        '  });',
        '}',
        'vRender();'
    ].join('\n');

    var css = ':root{--bg:#f8fafc;--surface:#fff;--surface-2:#f1f5f9;--primary:#4f46e5;--primary-light:#eef2ff;--text-main:#0f172a;--text-dim:#94a3b8;--border:#e2e8f0;--green:#10b981;--red:#ef4444;}'
            + '*{box-sizing:border-box;margin:0;padding:0;}'
            + 'body{font-family:"Plus Jakarta Sans",sans-serif;background:var(--bg);color:var(--text-main);}'
            + 'nav{position:sticky;top:0;z-index:100;background:var(--surface);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;padding:0 2rem;height:52px;flex-wrap:wrap;}'
            + '.logo{font-weight:800;font-size:1rem;color:var(--primary);margin-right:auto;}'
            + '#mNav{background:var(--surface-2);border:1px solid var(--border);padding:6px 12px;border-radius:10px;font-weight:700;font-size:12px;font-family:inherit;color:var(--text-main);cursor:pointer;outline:none;}'
            + '.wrap{max-width:1050px;margin:1.5rem auto;padding:0 1.5rem 5rem;}'
            + '.hdr{margin-bottom:1.5rem;}.hdr h2{font-weight:900;letter-spacing:-1px;}.hdr p{font-size:12px;color:var(--text-dim);font-weight:600;}'
            + '.row{display:grid;grid-template-columns:130px 40px 1fr;gap:0 18px;margin-bottom:2rem;align-items:start;position:relative;}'
            + '.vline{position:absolute;left:149px;top:40px;bottom:-40px;width:2px;background:var(--border);}'
            + '.row.done .vline{background:var(--green);}.row.blocked .vline{background:var(--red);}.row:last-child .vline{display:none;}'
            + '.slabel{text-align:right;font-size:10px;font-weight:900;text-transform:uppercase;color:var(--text-dim);padding-top:14px;}'
            + '.dot-w{display:flex;justify-content:center;padding-top:12px;}'
            + '.dot{width:14px;height:14px;border-radius:50%;background:var(--surface);border:3px solid var(--border);box-shadow:0 0 0 4px var(--bg);}'
            + '.row.done .dot{border-color:var(--green);background:var(--green);}.row.blocked .dot{border-color:var(--red);background:var(--red);}'
            + '.card{background:var(--surface);border:1px solid var(--border);border-radius:18px;box-shadow:0 2px 10px rgba(0,0,0,.05);overflow:hidden;}'
            + '.ctop{padding:.9rem 1.1rem;display:flex;justify-content:space-between;align-items:flex-start;}'
            + '.ctitle{font-size:1rem;font-weight:800;}.csub{font-size:12px;color:var(--text-dim);font-weight:600;margin-top:2px;}.cdate{font-size:11px;color:var(--text-dim);font-weight:600;margin-top:2px;}'
            + '.topright{display:flex;align-items:center;gap:8px;flex-shrink:0;margin-left:12px;}'
            + '.spill{padding:5px 14px;border-radius:20px;font-size:11px;font-weight:700;border:1.5px solid transparent;}'
            + '.sp-Completed,.sp-Done{background:#ecfdf5;color:#059669;border-color:#6ee7b7;}.sp-Blocked{background:#fef2f2;color:#dc2626;border-color:#fca5a5;}.sp-Pending{background:var(--surface-2);color:var(--text-dim);border-color:var(--border);}'
            + '.qa-count{background:var(--surface-2);color:var(--text-dim);border:1px solid var(--border);padding:5px 12px;border-radius:20px;font-size:11px;font-weight:700;}'
            + '.tags{display:flex;flex-wrap:wrap;gap:6px;padding:0 1.1rem 8px;}'
            + '.tpill{padding:3px 10px;border-radius:20px;font-size:10px;font-weight:800;text-transform:uppercase;background:var(--primary-light);color:var(--primary);border:1px solid var(--primary);}'
            + '.specs{margin:0 1rem 1rem;background:var(--bg);border-radius:12px;padding:12px 16px;display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;}'
            + '.si{display:flex;flex-direction:column;gap:3px;padding:6px 0;border-bottom:1px solid var(--border);}.si:nth-last-child(-n+2){border-bottom:none;}'
            + '.sk{font-size:11px;color:var(--text-dim);font-weight:600;}.sv{font-size:.95rem;font-weight:800;}'
            + '.qa-list{margin:0 1rem 1rem;border:1px solid var(--border);border-radius:12px;overflow:hidden;}'
            + '.qa-hdr{padding:9px 14px;font-size:11px;font-weight:900;text-transform:uppercase;color:var(--text-dim);background:var(--surface-2);border-bottom:1px solid var(--border);}'
            + '.qa-r{display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid var(--border);font-size:12px;}.qa-r:last-child{border-bottom:none;}'
            + '.qa-badge-s{font-size:10px;font-weight:800;padding:3px 10px;border-radius:20px;}'
            + '.qa-Pending{background:var(--surface-2);color:var(--text-dim);border:1px solid var(--border);}'
            + '.qa-Passed{background:#ecfdf5;color:#059669;border:1px solid #6ee7b7;}'
            + '.qa-Approved{background:#eff6ff;color:#2563eb;border:1px solid #93c5fd;}'
            + '.qa-Failed{background:#fef2f2;color:#dc2626;border:1px solid #fca5a5;}'
            + '.logs{margin:0 1rem 1rem;border:1px solid var(--border);border-radius:12px;overflow:hidden;}'
            + '.logs-hdr{padding:9px 14px;font-size:11px;font-weight:900;text-transform:uppercase;color:var(--text-dim);background:var(--surface-2);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;}'
            + '.lcat-hdr{padding:9px 14px;font-weight:800;font-size:12px;border-bottom:1px solid var(--border);background:var(--surface);}'
            + '.litem{display:flex;gap:10px;padding:7px 14px;font-size:12px;border-bottom:1px solid var(--border);}.litem:last-child{border-bottom:none;}';

    var parts = [
        '<!DOCTYPE html>',
        '<html lang="en"><head>',
        '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">',
        '<title>ReleaseFlow | Viewer</title>',
        '<link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">',
        '<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">',
        '<style>' + css + '</style>',
        '</head><body>',
        '<nav>',
        '  <span class="logo"><i class="fas fa-layer-group"></i> ReleaseFlow Viewer</span>',
        '  <select id="mNav" onchange="VM=this.value;vRender()"></select>',
        '  <span style="font-size:11px;color:var(--text-dim);font-weight:600">Read Only</span>',
        '</nav>',
        '<div class="wrap">',
        '  <div class="hdr"><h2 id="vTitle"></h2><p id="vSub"></p></div>',
        '  <div id="vContainer"></div>',
        '</div>',
        '<scr' + 'ipt>',
        scriptContent,
        '</scr' + 'ipt>',
        '</body></html>'
    ];

    return parts.join('\n');
}

// Fallback: manual file load via <input type=file> (used when FSA API unavailable)
function loadJSONFile(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parsed = JSON.parse(e.target.result);
            if (parsed.months) S.months = parsed.months;
            const incoming = parsed.data || parsed;
            delete incoming._meta;
            Object.assign(S.data, incoming);
            S.months.forEach(m => { if (!S.data[m.name]) S.data[m.name] = { sub: m.sub, stages: [] }; });
            save(); render();
            showStatus('Loaded ✓', 'success');
        } catch(err) { showToast('Invalid JSON file.', 'error'); }
    };
    reader.readAsText(file);
}

init();

/* ── Text highlight toolbar ── */
document.addEventListener('mouseup', function(e) {
  if (e.target.closest('#hl-toolbar')) return;
  setTimeout(() => {
    const sel = window.getSelection();
    const toolbar = document.getElementById('hl-toolbar');
    if (!sel || sel.isCollapsed || !sel.toString().trim()) { toolbar.style.display = 'none'; return; }
    const el = sel.anchorNode?.parentElement?.closest('[contenteditable]');
    if (!el || !el.closest('.expand-panel')) { toolbar.style.display = 'none'; return; }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    toolbar.style.display = 'flex';
    toolbar.style.left = Math.max(8, rect.left + rect.width / 2 - 110) + 'px';
    toolbar.style.top  = (rect.top - 44) + 'px';
  }, 10);
});
document.addEventListener('keydown', function() { document.getElementById('hl-toolbar').style.display = 'none'; });

function applyHighlight(color) {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);

  if (color === 'transparent') {
    // Remove all highlight spans inside the active contenteditable
    const anchor = sel.anchorNode?.parentElement?.closest('[contenteditable]');
    if (anchor) { anchor.querySelectorAll('span[data-hl]').forEach(sp => sp.replaceWith(...sp.childNodes)); anchor.normalize(); }
  } else {
    const span = document.createElement('span');
    span.setAttribute('data-hl', '1');
    span.style.cssText = `color:${color};font-weight:600`;
    try {
      range.surroundContents(span);
    } catch {
      const contents = range.extractContents();
      span.appendChild(contents);
      range.insertNode(span);
    }
  }

  sel.removeAllRanges();
  document.getElementById('hl-toolbar').style.display = 'none';
}
