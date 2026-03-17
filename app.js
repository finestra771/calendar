/* ═══════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════ */
let state = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  selectedDate: toYMD(new Date()),
  events: [],
  nextId: 1,
  bannerUrl: '',
  bannerPosY: 'center',
  bannerPosX: 'center',
  decoUrl: '',
  diaries: {},
  diarySettings: { font: "'Nanum Myeongjo',serif", size: '15px', icon: '🖊' },
  customFonts: [],   // [{name, family, dataUrl}]
  ddays: [],   // [{id, name, date, emoji, showHeader}]  — 여러 D-Day
  _ddayEditId: null,
  theme: 'lavender',
  customTheme: {},
  ytTracks: [],
  curTrack: 0,
  videoTracks: [],  // [{id, name, path}] — 로컬 동영상
  curVideo: 0,
  mediaSub: 'yt',   // 'yt' | 'video'
  stickers: [],       // [{id, url, x, y, size}]
  quickLinks: [],     // [{id, name, url, emoji}]
  gallery: [],         // [{id, url}]  — 이미지 데이터는 IndexedDB
  galIdx: 0,
  lpTab: 'yt',         // 'yt' | 'gallery'
};

/* ═══════════════════════════════════════════════════════
   INDEXEDDB (images)
═══════════════════════════════════════════════════════ */
let _db = null;
function openDB() {
  return new Promise(resolve => {
    if (_db) return resolve(_db);
    const req = indexedDB.open('cal_img_v2', 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror   = () => resolve(null);
  });
}
async function dbSet(key, val) {
  const db = await openDB(); if (!db) return;
  db.transaction('images','readwrite').objectStore('images').put(val, key);
}
async function dbGet(key) {
  const db = await openDB(); if (!db) return null;
  return new Promise(resolve => {
    const req = db.transaction('images').objectStore('images').get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror   = () => resolve(null);
  });
}
async function dbDel(key) {
  const db = await openDB(); if (!db) return;
  db.transaction('images','readwrite').objectStore('images').delete(key);
}

/* ═══════════════════════════════════════════════════════
   PERSISTENCE
═══════════════════════════════════════════════════════ */
function save() {
  try {
    localStorage.setItem('cal_v3', JSON.stringify({
      events:      state.events,
      nextId:      state.nextId,
      diaries:     state.diaries,
      diarySettings: state.diarySettings,
      customFonts:   state.customFonts.map(f=>({name:f.name, family:f.family})),
      ddays:       state.ddays,
      theme:       state.theme,
      customTheme: state.customTheme,
      bannerPosY:  state.bannerPosY,
      bannerPosX:  state.bannerPosX,
      bannerZoom:  state.bannerZoom,
      ytTracks:    state.ytTracks,
      curTrack:    state.curTrack,
      videoTracks: state.videoTracks.map(v=>({id:v.id,name:v.name,displayName:v.displayName||'',filePath:v.filePath||'',isAudio:v.isAudio})),
      curVideo:    state.curVideo,
      mediaSub:    state.mediaSub,
      stickers:    state.stickers,
      quickLinks:  state.quickLinks,
      gallery:     state.gallery.map(g=>({id:g.id,url:g.url})),
      galIdx:      state.galIdx,
      lpTab:       state.lpTab,
    }));
  } catch(e) { console.warn('save failed', e); }
}
function load() {
  try {
    const d = JSON.parse(localStorage.getItem('cal_v3') || '{}');
    if (d.events)      state.events      = d.events;
    if (d.nextId)      state.nextId      = d.nextId;
    if (d.diaries)     state.diaries     = d.diaries;
    if (d.diarySettings) state.diarySettings = { ...state.diarySettings, ...d.diarySettings };
    if (d.customFonts)   state.customFonts   = d.customFonts;
    if (d.ddays)  state.ddays = d.ddays;
    // 구버전 마이그레이션: dday 단일 → ddays 배열
    else if (d.dday && d.dday.date) {
      state.ddays = [{ id:'dd1', name:d.dday.name||'기념일', date:d.dday.date, emoji:'', showHeader:true }];
    }
    if (d.theme)       state.theme       = d.theme;
    if (d.customTheme) state.customTheme = d.customTheme;
    if (d.bannerPosY)  state.bannerPosY  = d.bannerPosY;
    if (d.bannerPosX)  state.bannerPosX  = d.bannerPosX;
    if (d.bannerZoom)  state.bannerZoom  = d.bannerZoom;
    if (d.ytTracks)    state.ytTracks    = d.ytTracks;
    if (d.curTrack != null) state.curTrack = d.curTrack;
    if (d.videoTracks) {
    state.videoTracks = d.videoTracks.map(v => {
      // name이 전체 경로인 경우 파일명만 추출
      const name = v.name.includes('\\') || v.name.includes('/')
        ? v.name.split(/[\/]/).pop()
        : v.name;
      return { ...v, name };
    });
  }
    if (d.curVideo != null) state.curVideo = d.curVideo;
    if (d.mediaSub)    state.mediaSub    = d.mediaSub;
    if (d.stickers)    state.stickers    = d.stickers;
    if (d.quickLinks)  state.quickLinks  = d.quickLinks;
    if (d.gallery)     state.gallery     = d.gallery;
    if (d.galIdx!=null) state.galIdx     = d.galIdx;
    if (d.lpTab)       state.lpTab       = d.lpTab;
  } catch(e) {}

  // 마이그레이션: 로컬 경로에 잘못 붙은 https:// 제거
  let migrated = false;
  const fixUrl = url => {
    if (!url) return url;
    const m = url.match(/^https?:\/\/([A-Za-z]:[\\\/].*)$/);
    if (m) { migrated = true; return m[1]; }
    return url;
  };
  state.events.forEach(ev => { (ev.links||[]).forEach(l => { l.url = fixUrl(l.url); }); });
  state.quickLinks.forEach(l => { l.url = fixUrl(l.url); });
  if (migrated) {
    try { localStorage.setItem('cal_v3', JSON.stringify({ events:state.events, nextId:state.nextId, diaries:state.diaries, diarySettings:state.diarySettings, customFonts:state.customFonts.map(f=>({name:f.name,family:f.family})), ddays:state.ddays, theme:state.theme, customTheme:state.customTheme, bannerPosY:state.bannerPosY, bannerPosX:state.bannerPosX, bannerZoom:state.bannerZoom, ytTracks:state.ytTracks, curTrack:state.curTrack, stickers:state.stickers, quickLinks:state.quickLinks, gallery:state.gallery.map(g=>({id:g.id,url:g.url})), galIdx:state.galIdx, lpTab:state.lpTab })); } catch(e) {}
  }
}
async function loadImages() {
  state.bannerUrl = await dbGet('banner') || '';
  state.decoUrl   = await dbGet('deco')   || '';
  // sticker images
  for (const s of state.stickers) {
    const img = await dbGet('sticker_' + s.id);
    if (img) s._imgData = img;
  }
  // custom fonts
  for (const f of state.customFonts) {
    const data = await dbGet('font_' + f.family);
    if (data) { f.dataUrl = data; applyCustomFont(f); }
  }
  // video tracks — filePath 있으면 _src 복원
  state.videoTracks.forEach(t => {
    if (t.filePath && !t._src) {
      t._src = 'file:///' + t.filePath.replace(/\\/g, '/');
    }
  });
  // gallery images
  for (const g of state.gallery) {
    const img = await dbGet('gallery_' + g.id);
    if (img) g._data = img;
  }
}

/* ═══════════════════════════════════════════════════════
   DATE HELPERS
═══════════════════════════════════════════════════════ */
function toYMD(d) { const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }  // 로컬 시간 기준
function ymd(y, m, d) { return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
function parseYMD(s) { return new Date(s + 'T00:00:00'); }
function todayYMD() { return toYMD(new Date()); }  // 항상 실시간 날짜
function daysBetween(a,b) { return Math.round((parseYMD(b)-parseYMD(a))/86400000); }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

const MO = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
const WD = ['일','월','화','수','목','금','토'];
function formatFullDate(s) {
  const d = parseYMD(s);
  return `${d.getFullYear()}년 ${MO[d.getMonth()]} ${d.getDate()}일 ${WD[d.getDay()]}요일`;
}

/* ═══════════════════════════════════════════════════════
   D-DAY (다중)
═══════════════════════════════════════════════════════ */
function ddayStr(date) {
  const diff = daysBetween(date, todayYMD());
  if (diff === 0) return 'D-Day';
  return diff > 0 ? `D+${diff}` : `D-${Math.abs(diff)}`;
}

function updateDDayUI() {
  // 헤더: showHeader인 D-Day 중 첫 번째
  const headerDD = state.ddays.find(d => d.showHeader);
  if (headerDD) {
    document.getElementById('dday-label').textContent = ddayStr(headerDD.date);
  } else {
    document.getElementById('dday-label').textContent = '';
  }
  renderDDayList();
}

function renderDDayList() {
  const list = document.getElementById('dday-list');
  if (!list) return;
  if (!state.ddays.length) {
    list.innerHTML = '<div class="dday-empty">D-Day를 추가해보세요</div>';
    return;
  }
  list.innerHTML = state.ddays.map(dd => {
    const str = ddayStr(dd.date);
    const d = parseYMD(dd.date);
    const dateLabel = `${d.getMonth()+1}/${d.getDate()}`;
    return `<div class="dday-item" onclick="openEditDDay('${dd.id}')">
      ${dd.emoji ? `<span class="dday-emoji">${esc(dd.emoji)}</span>` : ''}
      <span class="dday-badge">${str}</span>
      <span class="dday-name">${esc(dd.name)}</span>
      <span class="dday-item-edit" onclick="openEditDDay('${dd.id}')">✎</span>
    </div>`;
  }).join('');
}

function openAddDDay() {
  state._ddayEditId = null;
  document.getElementById('dday-modal-title').textContent = 'D-Day 추가';
  document.getElementById('dday-name-in').value = '';
  document.getElementById('dday-date-in').value = '';
  document.getElementById('dday-emoji-in').value = '';
  document.getElementById('dday-show-header').checked = true;
  document.getElementById('dday-del-btn').style.display = 'none';
  openModal('dday-modal');
}

function openEditDDay(id) {
  const dd = state.ddays.find(d => d.id === id);
  if (!dd) return;
  state._ddayEditId = id;
  document.getElementById('dday-modal-title').textContent = 'D-Day 편집';
  document.getElementById('dday-name-in').value = dd.name || '';
  document.getElementById('dday-date-in').value = dd.date || '';
  document.getElementById('dday-emoji-in').value = dd.emoji || '';
  document.getElementById('dday-show-header').checked = !!dd.showHeader;
  document.getElementById('dday-del-btn').style.display = 'inline-flex';
  openModal('dday-modal');
}

function saveDDay() {
  const name = document.getElementById('dday-name-in').value.trim();
  const date = document.getElementById('dday-date-in').value;
  if (!date) { alert('날짜를 선택해주세요'); return; }
  const dd = {
    id:         state._ddayEditId || 'dd' + Date.now(),
    name:       name || '기념일',
    date,
    emoji:      document.getElementById('dday-emoji-in').value.trim(),
    showHeader: document.getElementById('dday-show-header').checked,
  };
  if (state._ddayEditId) {
    const i = state.ddays.findIndex(d => d.id === state._ddayEditId);
    if (i >= 0) state.ddays[i] = dd;
  } else {
    state.ddays.push(dd);
  }
  save(); updateDDayUI(); closeModal('dday-modal');
}

function deleteDDay() {
  if (!state._ddayEditId) return;
  state.ddays = state.ddays.filter(d => d.id !== state._ddayEditId);
  save(); updateDDayUI(); closeModal('dday-modal');
}

/* ═══════════════════════════════════════════════════════
   THEME
═══════════════════════════════════════════════════════ */
function applyTheme(theme) {
  state.theme = theme;
  document.body.setAttribute('data-theme', theme);
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
  if (theme === 'custom') applyCustomThemeVars();
  save();
}
function applyCustomThemeVars() {
  const c = state.customTheme;
  const root = document.documentElement;
  const pairs = [
    ['--c-bg', c.bg||'#f5f0ff'],['--c-bg2', c.bg2||'#ede6ff'],
    ['--c-surface', c.surface||'#ffffff'],['--c-surface2', c.surface2||'#f8f5ff'],
    ['--c-border', c.border||'#ddd5f5'],['--c-border2', c.border2||'#c9baf0'],
    ['--c-accent', c.accent||'#8b6bd8'],['--c-accent2', c.accent2||'#6a4ec4'],
    ['--c-accent-light', c.accentLight||'#e8e0ff'],['--c-accent-soft', c.accentSoft||'#c8b8f8'],
    ['--c-text', c.text||'#2c2540'],['--c-text2', c.text2||'#6b5f85'],['--c-text3', c.text3||'#a898c8'],
  ];
  pairs.forEach(([k,v]) => root.style.setProperty(k, v));
  const a = c.accent||'#8b6bd8';
  root.style.setProperty('--c-hbg', `linear-gradient(135deg, ${a}cc, ${a}, ${a}dd)`);
}

const CUSTOM_FIELDS = [
  {key:'bg',      label:'배경'},
  {key:'bg2',     label:'배경2'},
  {key:'surface', label:'카드'},
  {key:'surface2',label:'카드2'},
  {key:'accent',  label:'강조색'},
  {key:'accent2', label:'강조색2'},
  {key:'accentLight',label:'강조 연'},
  {key:'accentSoft', label:'강조 소프트'},
  {key:'text',    label:'글자'},
  {key:'text2',   label:'글자2'},
  {key:'text3',   label:'글자3(힌트)'},
  {key:'border',  label:'테두리'},
];
const CUSTOM_DEFAULTS = {
  bg:'#f5f0ff',bg2:'#ede6ff',surface:'#ffffff',surface2:'#f8f5ff',
  accent:'#8b6bd8',accent2:'#6a4ec4',accentLight:'#e8e0ff',accentSoft:'#c8b8f8',
  text:'#2c2540',text2:'#6b5f85',text3:'#a898c8',border:'#ddd5f5',border2:'#c9baf0',
};

function openCustomThemeModal() {
  const grid = document.getElementById('theme-custom-grid');
  const cur = { ...CUSTOM_DEFAULTS, ...state.customTheme };
  grid.innerHTML = CUSTOM_FIELDS.map(f => `
    <div class="theme-row">
      <label>${f.label}</label>
      <input type="color" id="tc-${f.key}" value="${cur[f.key]||'#ffffff'}" />
    </div>`).join('');
  openModal('custom-theme-modal');
}
function saveCustomTheme() {
  const c = {};
  CUSTOM_FIELDS.forEach(f => { c[f.key] = document.getElementById('tc-'+f.key).value; });
  state.customTheme = c;
  applyTheme('custom');
  closeModal('custom-theme-modal');
}

/* ═══════════════════════════════════════════════════════
   CALENDAR
═══════════════════════════════════════════════════════ */
function checkRollovers() {
  const tod = parseYMD(todayYMD());
  let changed = false;
  state.events.forEach(ev => {
    if (ev.rollover && !ev.done && !ev.rolledOver && ev.rolloverDate) {
      if (parseYMD(ev.date) < tod) {
        const rv = parseYMD(ev.rolloverDate);
        if (rv >= tod) {
          ev.originalDate = ev.date; ev.date = ev.rolloverDate;
          ev.rolloverDate = null; ev.rolledOver = true; changed = true;
        }
      }
    }
  });
  if (changed) save();
}
function getVisibleEvents() {
  checkRollovers();
  const vS = new Date(state.year, state.month, 1);
  const vE = new Date(state.year, state.month+1, 0);
  const res = [];
  state.events.forEach(ev => {
    if (!ev.repeat) { res.push({...ev}); return; }
    const s = ev.repeatStart ? parseYMD(ev.repeatStart) : parseYMD(ev.date);
    const e = ev.repeatEnd   ? parseYMD(ev.repeatEnd)   : vE;
    let cur = new Date(s);
    while (cur <= e && cur <= vE) {
      if (cur >= vS) res.push({...ev, date:toYMD(cur), _repeated:true});
      if      (ev.repeat==='daily')   cur.setDate(cur.getDate()+1);
      else if (ev.repeat==='weekly')  cur.setDate(cur.getDate()+7);
      else if (ev.repeat==='monthly') cur.setMonth(cur.getMonth()+1);
      else break;
    }
  });
  return res;
}
function renderWeekdays() {
  document.getElementById('cal-weekdays').innerHTML =
    WD.map((d,i)=>`<div class="cal-weekday${i===0?' sun':i===6?' sat':''}">${d}</div>`).join('');
}
function renderCalendar() {
  updateDDayUI();
  document.getElementById('header-month').textContent = `${state.year}년 ${MO[state.month]}`;
  const allEvs = getVisibleEvents();
  const byDate = {};
  allEvs.forEach(ev => { if(!byDate[ev.date]) byDate[ev.date]=[]; byDate[ev.date].push(ev); });
  const firstDow = new Date(state.year, state.month, 1).getDay();
  const dim = new Date(state.year, state.month+1, 0).getDate();
  const dip = new Date(state.year, state.month, 0).getDate();
  const tod = todayYMD();
  let html='', count=0;
  for (let i=firstDow-1;i>=0;i--) {
    const pm=state.month===0?state.year-1:state.year, pmm=state.month===0?11:state.month-1;
    html += renderDay(ymd(pm,pmm,dip-i),dip-i,true,byDate,tod); count++;
  }
  for (let d=1;d<=dim;d++) { html += renderDay(ymd(state.year,state.month,d),d,false,byDate,tod); count++; }
  const rem = 7-(count%7); if(rem<7) for(let d=1;d<=rem;d++){
    const nm=state.month===11?state.year+1:state.year, nmm=state.month===11?0:state.month+1;
    html += renderDay(ymd(nm,nmm,d),d,true,byDate,tod); count++;
  }
  const grid = document.getElementById('cal-grid');
  grid.innerHTML = html;
  grid.style.gridTemplateRows = `repeat(${count/7}, 1fr)`;
}
function renderDay(dateStr, dayNum, isOther, byDate, tod) {
  const dow = parseYMD(dateStr).getDay();
  let cls = 'cal-day';
  if (isOther) cls+=' other-month';
  if (dateStr===tod) cls+=' today';
  if (dateStr===state.selectedDate) cls+=' selected';
  if (dow===0) cls+=' sun'; if (dow===6) cls+=' sat';
  const evs = byDate[dateStr]||[];
  let evHtml='';
  evs.slice(0,3).forEach(ev => {
    const rb = ev.repeat ? '<span class="repeat-badge">↻</span>' : '';
    const chipStyle = ev.color==='custom'&&ev.customColor
      ? `style="background:${ev.customColor}22;color:${ev.customColor};border-color:${ev.customColor}"`  : '';
    const dotStyle  = ev.color==='custom'&&ev.customColor
      ? `style="background:${ev.customColor}"`  : '';
    const chipCls = ev.color==='custom' ? '' : `ev-chip-c${ev.color||0}`;
    const dotCls  = ev.color==='custom' ? '' : `ev-dot-c${ev.color||0}`;
    evHtml += `<div class="ev-chip ${chipCls}${ev.done?' done':''}${ev.rolledOver?' moved':''}${ev.important?' important':''}" ${chipStyle} onclick="openEditEvent(event,'${ev.id}','${dateStr}')">
      <input type="checkbox" class="ev-chip-check" ${ev.done?'checked':''} onchange="toggleDone(event,'${ev.id}')" onclick="event.stopPropagation()">
      <div class="ev-chip-dot ${dotCls}" ${dotStyle}></div>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis">${esc(ev.title)}${rb}</span>
    </div>`;
  });
  if (evs.length>3) evHtml += `<div class="more-chip">+${evs.length-3}개</div>`;
  // 일기 아이콘
  const hasDiary = !isOther && state.diaries[dateStr] && state.diaries[dateStr].trim();
  const dIcon = hasDiary ? `<span class="diary-icon">${esc(state.diarySettings?.icon||'🖊')}</span>` : '';

  return `<div class="${cls}" onclick="selectDate('${dateStr}')">
    <div class="day-num">${dayNum}${dIcon}</div>
    <div class="day-events">${evHtml}</div>
  </div>`;
}
function selectDate(s) {
  state.selectedDate = s; renderCalendar(); renderSidebar();
}

/* ═══════════════════════════════════════════════════════
   SIDEBAR
═══════════════════════════════════════════════════════ */
/* ── 중요 이벤트 배너 ── */
function renderImportantBanner() {
  const banner = document.getElementById('important-banner');
  if (!banner) return;

  const tod = todayYMD();
  const important = state.events
    .filter(ev => ev.important && !ev.done && ev.date >= tod)
    .sort((a,b) => a.date.localeCompare(b.date));

  if (!important.length) {
    banner.style.display = 'none';
    banner.innerHTML = '';
    return;
  }

  const dots = ['#4c1d95','#831843','#065f46','#78350f','#1e3a8a','#7f1d1d'];
  const getBC = ev => ev.color==='custom'&&ev.customColor ? ev.customColor : dots[ev.color||0];
  const items = important.map(ev => {
    const d = parseYMD(ev.date);
    const dateStr = `${d.getMonth()+1}/${d.getDate()}`;
    const diff = Math.round((parseYMD(ev.date) - parseYMD(tod)) / 86400000);
    const diffStr = diff === 0 ? '오늘' : `D-${diff}`;
    return `<div class="important-banner-item" onclick="goToImportant('${ev.date}')">
      <div class="important-banner-dot" style="background:${getBC(ev)}"></div>
      <div class="important-banner-title">⭐ ${esc(ev.title)}</div>
      <div class="important-banner-date">${dateStr} <b>${diffStr}</b></div>
    </div>`;
  }).join('');

  banner.className = 'important-banner';
  banner.style.display = 'block';
  banner.innerHTML = `
    <div class="important-banner-header">⭐ 중요 이벤트 (${important.length})</div>
    <div class="important-banner-list">${items}</div>`;
}

function goToImportant(dateStr) {
  const d = parseYMD(dateStr);
  state.year  = d.getFullYear();
  state.month = d.getMonth();
  state.selectedDate = dateStr;
  renderCalendar();
  renderSidebar();
  // 이벤트 탭으로
  document.querySelectorAll('.sel-tab').forEach(t => t.classList.remove('active'));
  const evTab = document.querySelector('.sel-tab[data-stab="events"]');
  if (evTab) evTab.classList.add('active');
  document.getElementById('panel-events').style.display = 'block';
  document.getElementById('panel-diary').style.display  = 'none';
}

function renderSidebar() {
  document.getElementById('sel-date-text').textContent = formatFullDate(state.selectedDate);

  // 중요 이벤트 배너 — 오늘 이후 중요 이벤트 모두 표시
  renderImportantBanner();

  const evs = getVisibleEvents().filter(ev => ev.date===state.selectedDate);
  const list = document.getElementById('sidebar-event-list');
  if (!evs.length) {
    list.innerHTML = `<div style="font-size:11px;color:var(--text3);text-align:center;padding:12px">일정이 없습니다</div>`;
  } else {
    const dots=['#4c1d95','#831843','#065f46','#78350f','#1e3a8a','#7f1d1d'];
    const getDotColor = ev => ev.color==='custom'&&ev.customColor ? ev.customColor : dots[ev.color||0];
    list.innerHTML = evs.map(ev => {
      const links = (ev.links||[]).map(l=>`<span class="ev-link-tag" onclick="openLink(this.dataset.url)" data-url="${l.url.replace(/"/g,'&quot;')}">➈ ${esc(l.name)}</span>`).join('');
      const badges=[
        ev.rollover?'<span class="badge badge-rollover">↺ 넘기기</span>':'',
        ev.repeat?'<span class="badge badge-repeat">🔁 반복</span>':'',
        ev.rolledOver?'<span class="badge badge-moved">이동됨</span>':'',
      ].join('');
      return `<div class="ev-list-item" onclick="openEditEvent(event,'${ev.id}','${state.selectedDate}')">
        <div class="ev-list-header">
          <div class="ev-list-dot" style="background:${getDotColor(ev)}"></div>
          <div class="ev-list-title">${esc(ev.title)}</div>
          ${ev.time?`<div class="ev-list-time">${esc(ev.time)}</div>`:''}
        </div>
        ${ev.memo?`<div class="ev-list-memo">${esc(ev.memo)}</div>`:''}
        ${links?`<div class="ev-list-links">${links}</div>`:''}
        ${badges?`<div class="ev-list-badges">${badges}</div>`:''}
      </div>`;
    }).join('');
  }
  // 일기 textarea 내용 + 스타일 적용
  const dtxt = document.getElementById('diary-textarea');
  dtxt.value = state.diaries[state.selectedDate] || '';
  const ds = state.diarySettings;
  dtxt.style.fontFamily = ds.font;
  dtxt.style.fontSize   = ds.size;
  // 툴바 현재값 반영
  const dfont = document.getElementById('diary-font');
  const dsize = document.getElementById('diary-size');
  const dicon = document.getElementById('diary-icon');
  if (dfont) dfont.value = ds.font;
  if (dsize) dsize.value = ds.size;
  if (dicon) dicon.value = ds.icon || '';
}
function toggleDone(e, id) {
  e.stopPropagation();
  const ev = state.events.find(x=>x.id==id);
  if (ev) { ev.done = e.target.checked; save(); renderCalendar(); renderSidebar(); }
}
/* ═══════════════════════════════════════════════════════
   CUSTOM FONTS
═══════════════════════════════════════════════════════ */
function applyCustomFont(f) {
  // @font-face 동적 등록
  const style = document.getElementById('custom-font-style') || (() => {
    const s = document.createElement('style');
    s.id = 'custom-font-style';
    document.head.appendChild(s);
    return s;
  })();
  // 기존 내용에 추가
  if (!style.textContent.includes(f.family)) {
    style.textContent += `@font-face { font-family: '${f.family}'; src: url('${f.dataUrl}'); }\n`;
  }
}

function updateFontSelect() {
  const sel = document.getElementById('diary-font');
  if (!sel) return;
  // 기존 커스텀 옵션 제거
  Array.from(sel.options).forEach(o => { if (o.dataset.custom) o.remove(); });
  // 커스텀 폰트 옵션 추가 (+ 폰트 추가 앞에)
  const customOpt = sel.querySelector('option[value="__custom__"]');
  state.customFonts.forEach(f => {
    if (sel.querySelector(`option[value="'${f.family}',sans-serif"]`)) return;
    const opt = document.createElement('option');
    opt.value = `'${f.family}',sans-serif`;
    opt.textContent = f.name;
    opt.dataset.custom = '1';
    sel.insertBefore(opt, customOpt);
  });
}

function handleFontUpload(file) {
  if (!file) return;
  const name  = file.name.replace(/\.[^.]+$/, '');           // 확장자 제거
  const family = 'CustomFont_' + Date.now();
  const reader = new FileReader();
  reader.onload = e => {
    const dataUrl = e.target.result;
    const fontObj = { name, family, dataUrl };
    // 중복 이름 제거
    state.customFonts = state.customFonts.filter(f => f.name !== name);
    state.customFonts.push(fontObj);
    dbSet('font_' + family, dataUrl);
    applyCustomFont(fontObj);
    updateFontSelect();
    save();
    // 방금 업로드한 폰트 자동 선택
    const sel = document.getElementById('diary-font');
    if (sel) {
      sel.value = `'${family}',sans-serif`;
      state.diarySettings.font = sel.value;
      document.getElementById('diary-textarea').style.fontFamily = sel.value;
    }
  };
  reader.readAsDataURL(file);
}

function saveDiary() {
  const val = document.getElementById('diary-textarea').value;
  if (val.trim()) {
    state.diaries[state.selectedDate] = val;
  } else {
    delete state.diaries[state.selectedDate]; // 빈 내용이면 삭제
  }
  // 툴바 설정 저장
  const dfont = document.getElementById('diary-font');
  const dsize = document.getElementById('diary-size');
  const dicon = document.getElementById('diary-icon');
  if (dfont) state.diarySettings.font = dfont.value;
  if (dsize) state.diarySettings.size = dsize.value;
  if (dicon) state.diarySettings.icon = dicon.value || '🖊';
  save();
  renderCalendar(); // 아이콘 반영
  const btn = document.getElementById('diary-save-btn');
  btn.textContent='저장됨 ✓'; setTimeout(()=>btn.textContent='저장',1500);
}

/* ═══════════════════════════════════════════════════════
   EVENTS MODAL
═══════════════════════════════════════════════════════ */
let editingId=null, tmpLinks=[], tmpColor=0, tmpCustomColor='#8b6bd8';

function buildColorPicker() {
  const presets = [0,1,2,3,4,5].map(i =>
    `<div class="cpick cpick-${i}${i===tmpColor&&tmpColor!=='custom'?' active':''}" onclick="pickColor(${i})"></div>`
  ).join('');
  const customActive = tmpColor==='custom' ? ' active' : '';
  const customPick = `<label class="cpick cpick-custom${customActive}" title="직접 선택" style="background:${tmpCustomColor}">
    <input type="color" id="ev-custom-color" value="${tmpCustomColor}" style="opacity:0;width:0;height:0;position:absolute" />
  </label>`;
  document.getElementById('ev-color-picker').innerHTML = presets + customPick;
  // color input 이벤트
  const inp = document.getElementById('ev-custom-color');
  if (inp) inp.addEventListener('input', function() {
    tmpCustomColor = this.value;
    tmpColor = 'custom';
    buildColorPicker();
  });
}
function pickColor(i) { tmpColor=i; buildColorPicker(); }

function renderLinksInModal() {
  document.getElementById('link-count-label').textContent = `(${tmpLinks.length}/5)`;
  document.getElementById('ev-links-display').innerHTML = tmpLinks.map((l,i)=>
    `<span class="link-tag">⬈ ${esc(l.name)}<button class="link-del-btn" onclick="removeLink(${i})">✕</button></span>`
  ).join('');
  document.getElementById('link-add-row').style.display = tmpLinks.length>=5 ? 'none' : 'flex';
}
function removeLink(i) { tmpLinks.splice(i,1); renderLinksInModal(); }
function addLink() {
  const name = document.getElementById('link-name-in').value.trim();
  let url = document.getElementById('link-url-in').value.trim();
  if (!name||!url) { alert('이름과 URL을 모두 입력해주세요'); return; }
  if (!url.startsWith('http') && !isLocalPath(url)) url='https://'+url;
  if (tmpLinks.length>=5) return;
  tmpLinks.push({name,url});
  document.getElementById('link-name-in').value='';
  document.getElementById('link-url-in').value='';
  renderLinksInModal();
}

function openNewEvent(dateStr) {
  editingId=null; tmpLinks=[]; tmpColor=0; tmpCustomColor='#8b6bd8';
  ['ev-title','ev-memo'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('ev-date').value = dateStr||state.selectedDate||todayYMD();
  document.getElementById('ev-time').value='';
  document.getElementById('ev-important').checked=false;
  document.getElementById('ev-rollover').checked=false;
  document.getElementById('ev-rollover-date').style.display='none';
  document.getElementById('ev-rollover-date').value='';
  document.getElementById('ev-repeat').value='';
  document.getElementById('repeat-range').style.display='none';
  document.getElementById('ev-repeat-start').value='';
  document.getElementById('ev-repeat-end').value='';
  document.getElementById('modal-del-btn').style.display='none';
  buildColorPicker(); renderLinksInModal();
  openModal('modal-overlay');
  setTimeout(()=>document.getElementById('ev-title').focus(),60);
}
function openEditEvent(e, id, dateStr) {
  e.stopPropagation();
  const ev = state.events.find(x=>x.id==id); if(!ev) return;
  editingId=id; tmpLinks=JSON.parse(JSON.stringify(ev.links||[])); tmpColor=ev.color||0;
  if (ev.color==='custom') tmpCustomColor=ev.customColor||'#8b6bd8';
  document.getElementById('ev-title').value=ev.title||'';
  document.getElementById('ev-date').value=dateStr||ev.date;
  document.getElementById('ev-time').value=ev.time||'';
  document.getElementById('ev-memo').value=ev.memo||'';
  const ro=!!ev.rollover;
  document.getElementById('ev-important').checked=!!ev.important;
  document.getElementById('ev-rollover').checked=ro;
  document.getElementById('ev-rollover-date').value=ev.rolloverDate||'';
  document.getElementById('ev-rollover-date').style.display=ro?'block':'none';
  document.getElementById('ev-repeat').value=ev.repeat||'';
  document.getElementById('repeat-range').style.display=(ev.repeat&&ev.repeat!=='')?'flex':'none';
  document.getElementById('ev-repeat-start').value=ev.repeatStart||ev.date||'';
  document.getElementById('ev-repeat-end').value=ev.repeatEnd||'';
  document.getElementById('modal-del-btn').style.display='inline-flex';
  buildColorPicker(); renderLinksInModal();
  openModal('modal-overlay');
}
function saveEvent() {
  const title = document.getElementById('ev-title').value.trim();
  if (!title) { alert('일정 제목을 입력해주세요'); return; }
  const date = document.getElementById('ev-date').value;
  if (!date) { alert('날짜를 선택해주세요'); return; }
  const ev = {
    id: editingId||String(state.nextId++), title, date,
    time: document.getElementById('ev-time').value,
    memo: document.getElementById('ev-memo').value,
    color: tmpColor,
    customColor: tmpColor==='custom' ? tmpCustomColor : undefined,
    rollover: document.getElementById('ev-rollover').checked,
    rolloverDate: document.getElementById('ev-rollover-date').value||null,
    repeat: document.getElementById('ev-repeat').value||'',
    repeatStart: document.getElementById('ev-repeat-start').value||null,
    repeatEnd: document.getElementById('ev-repeat-end').value||null,
    links: JSON.parse(JSON.stringify(tmpLinks)),
    important: document.getElementById('ev-important').checked,
    done: editingId?(state.events.find(x=>x.id===editingId)?.done||false):false,
    rolledOver: editingId?(state.events.find(x=>x.id===editingId)?.rolledOver||false):false,
    originalDate: editingId?(state.events.find(x=>x.id===editingId)?.originalDate||null):null,
  };
  if (editingId) { const i=state.events.findIndex(x=>x.id===editingId); if(i>=0) state.events[i]=ev; }
  else state.events.push(ev);
  save(); renderCalendar(); renderSidebar(); closeModal('modal-overlay');
}
function deleteEvent() {
  if (!editingId) return;
  if (!confirm('이 일정을 삭제할까요?')) return;
  state.events = state.events.filter(x=>x.id!==editingId);
  save(); renderCalendar(); renderSidebar(); closeModal('modal-overlay');
}

/* ═══════════════════════════════════════════════════════
   BANNER
═══════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════
   BANNER — live drag preview
═══════════════════════════════════════════════════════ */
// _bp = banner position in percent (0–100 for both axes)
// stored as state.bannerPosX / state.bannerPosY  (e.g. "42%")
let _bpImg = null;   // current preview image src
let _bpX = 50, _bpY = 50;   // 0–100 percent
let _bpZoom = 100;   // 100–300
let _bpDragging = false, _bpDragStartX=0, _bpDragStartY=0, _bpDragOriginX=50, _bpDragOriginY=50;

function pctToStr(x, y) { return `${x}% ${y}%`; }
function strToPct(s) {
  // accepts "50% 50%" or keyword like "center top"
  const kw = { left:0, center:50, right:100, top:0, bottom:100 };
  const parts = (s||'50% 50%').split(' ');
  const parse = p => p.endsWith('%') ? parseFloat(p) : (kw[p] ?? 50);
  return { x: parse(parts[0]||'50%'), y: parse(parts[1]||'50%') };
}

function applyBanner(url, posStr) {
  if (url != null) state.bannerUrl = url;
  if (posStr != null) {
    // store as "X% Y%"
    state.bannerPosX = posStr.split(' ')[0] || '50%';
    state.bannerPosY = posStr.split(' ')[1] || '50%';
  }
  const bg   = document.getElementById('banner-bg');
  const ph   = document.getElementById('banner-placeholder');
  const ctrl = document.getElementById('banner-controls');
  if (state.bannerUrl) {
    bg.style.backgroundImage    = `url("${state.bannerUrl}")`;
    bg.style.backgroundPosition = `${state.bannerPosX} ${state.bannerPosY}`;
    bg.style.backgroundSize     = 'cover';
    ph.style.display  = 'none';
    ctrl.style.display = 'flex';
  } else {
    bg.style.backgroundImage = 'none';
    ph.style.display  = 'flex';
    ctrl.style.display = 'none';
  }
}

function openBannerModal() {
  // restore current state into modal
  const pos = strToPct(`${state.bannerPosX||'50%'} ${state.bannerPosY||'50%'}`);
  _bpX = pos.x; _bpY = pos.y;
  _bpZoom = state.bannerZoom || 100;
  _bpImg = state.bannerUrl || null;

  document.getElementById('banner-url-in').value = '';
  document.getElementById('banner-file-in').value = '';
  document.getElementById('banner-file-label').childNodes[0].textContent = '📁 파일 선택';
  updateBannerZoomUI();
  refreshBannerPreview();
  openModal('banner-modal');
}

function refreshBannerPreview() {
  const preview = document.getElementById('banner-preview');
  const empty   = document.getElementById('banner-preview-empty');
  const cross   = document.getElementById('banner-preview-crosshair');
  const zoomRow = document.getElementById('banner-zoom-row');

  if (!_bpImg) {
    empty.style.display = 'flex';
    cross.style.display = 'none';
    preview.classList.remove('has-img');
    // remove old img if any
    const old = preview.querySelector('.banner-preview-img');
    if (old) old.remove();
    zoomRow.style.display = 'none';
    return;
  }

  empty.style.display  = 'none';
  cross.style.display  = 'block';
  preview.classList.add('has-img');
  zoomRow.style.display = 'flex';

  let img = preview.querySelector('.banner-preview-img');
  if (!img) {
    img = document.createElement('img');
    img.className = 'banner-preview-img';
    img.draggable = false;
    preview.appendChild(img);
  }
  img.src = _bpImg;
  img.onload = () => positionBannerPreviewImg();
}

function positionBannerPreviewImg() {
  const preview = document.getElementById('banner-preview');
  const img     = preview.querySelector('.banner-preview-img');
  if (!img || !img.naturalWidth) return;

  const pw = preview.clientWidth;
  const ph = preview.clientHeight;
  const zoom = _bpZoom / 100;

  // Scale image so its short side fills preview, then apply zoom
  const scaleBase = Math.max(pw / img.naturalWidth, ph / img.naturalHeight);
  const scale = scaleBase * zoom;

  const iw = img.naturalWidth  * scale;
  const ih = img.naturalHeight * scale;

  // _bpX/Y are 0–100% of the "overflow" space
  const ox = (_bpX / 100) * Math.max(0, iw - pw);
  const oy = (_bpY / 100) * Math.max(0, ih - ph);

  img.style.width  = iw + 'px';
  img.style.height = ih + 'px';
  img.style.transform = `translate(${-ox}px, ${-oy}px)`;
}

function updateBannerZoomUI() {
  const slider = document.getElementById('banner-zoom');
  const val    = document.getElementById('banner-zoom-val');
  slider.value = _bpZoom;
  val.textContent = _bpZoom + '%';
}

function initBannerPreviewDrag() {
  const preview = document.getElementById('banner-preview');

  // Mouse
  preview.addEventListener('mousedown', e => {
    if (!_bpImg) return;
    _bpDragging = true;
    _bpDragStartX   = e.clientX;
    _bpDragStartY   = e.clientY;
    _bpDragOriginX  = _bpX;
    _bpDragOriginY  = _bpY;
    preview.style.cursor = 'grabbing';
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!_bpDragging) return;
    moveBannerPreview(e.clientX - _bpDragStartX, e.clientY - _bpDragStartY);
  });
  document.addEventListener('mouseup', () => {
    if (!_bpDragging) return;
    _bpDragging = false;
    document.getElementById('banner-preview').style.cursor = 'grab';
  });

  // Touch
  preview.addEventListener('touchstart', e => {
    if (!_bpImg) return;
    const t = e.touches[0];
    _bpDragging = true;
    _bpDragStartX  = t.clientX; _bpDragStartY  = t.clientY;
    _bpDragOriginX = _bpX;      _bpDragOriginY = _bpY;
    e.preventDefault();
  }, { passive:false });
  document.addEventListener('touchmove', e => {
    if (!_bpDragging) return;
    const t = e.touches[0];
    moveBannerPreview(t.clientX - _bpDragStartX, t.clientY - _bpDragStartY);
  }, { passive:true });
  document.addEventListener('touchend', () => { _bpDragging = false; });

  // Zoom slider
  document.getElementById('banner-zoom').addEventListener('input', function() {
    _bpZoom = parseInt(this.value);
    document.getElementById('banner-zoom-val').textContent = _bpZoom + '%';
    positionBannerPreviewImg();
  });
}

function moveBannerPreview(dx, dy) {
  const preview = document.getElementById('banner-preview');
  const img     = preview.querySelector('.banner-preview-img');
  if (!img) return;

  const pw = preview.clientWidth,  ph = preview.clientHeight;
  const iw = parseFloat(img.style.width),  ih = parseFloat(img.style.height);
  const overflowX = Math.max(0, iw - pw);
  const overflowY = Math.max(0, ih - ph);

  // dx pixels → delta in percent of overflow
  const dxPct = overflowX > 0 ? (-dx / overflowX) * 100 : 0;
  const dyPct = overflowY > 0 ? (-dy / overflowY) * 100 : 0;

  _bpX = Math.max(0, Math.min(100, _bpDragOriginX + dxPct));
  _bpY = Math.max(0, Math.min(100, _bpDragOriginY + dyPct));
  positionBannerPreviewImg();
}

function setBannerImageFromInput(src) {
  _bpImg  = src;
  _bpX    = 50; _bpY = 50; _bpZoom = 100;
  updateBannerZoomUI();
  refreshBannerPreview();
}

function saveBanner() {
  const urlIn = document.getElementById('banner-url-in').value.trim();
  const file  = document.getElementById('banner-file-in').files[0];
  const posStr = pctToStr(_bpX, _bpY);

  const commit = url => {
    if (url) dbSet('banner', url);
    state.bannerZoom = _bpZoom;
    applyBanner(url, posStr);
    // also apply zoom to actual banner bg
    document.getElementById('banner-bg').style.backgroundSize = `${_bpZoom}%`;
    save();
    closeModal('banner-modal');
  };

  if (file) { const r=new FileReader(); r.onload=e=>commit(e.target.result); r.readAsDataURL(file); }
  else if (urlIn) commit(urlIn);
  else if (_bpImg) commit(_bpImg);  // re-save with new position only
  else { closeModal('banner-modal'); }
}

/* ═══════════════════════════════════════════════════════
   STICKERS  –  full-page layer, drag + rotate + resize
═══════════════════════════════════════════════════════ */
let stickerEditMode = false;
let selectedStickerId = null;

// interaction state
let _si = {
  type: null,          // 'drag' | 'rotate' | 'resize'
  id: null,
  startX:0, startY:0,
  origX:0, origY:0,    // sticker x/y at drag start
  origSize:0,          // sticker size at resize start
  origAngle:0,         // sticker angle at rotate start
  cx:0, cy:0,          // sticker center at rotate/resize start
  startAngle:0,        // pointer angle at rotate start
};

function getStickerLayer() { return document.getElementById('sticker-layer'); }

function renderStickers() {
  const layer = getStickerLayer();
  layer.innerHTML = '';

  state.stickers.forEach(s => {
    const angle = s.angle || 0;
    const el = document.createElement('div');
    el.className = 'sticker' + (stickerEditMode ? ' editable' : '') + (s.id===selectedStickerId&&stickerEditMode?' selected':'');
    el.dataset.id = s.id;
    el.style.cssText = `left:${s.x}px;top:${s.y}px;width:${s.size}px;transform:rotate(${angle}deg)`;

    const img = document.createElement('img');
    img.src = s._imgData || s.url || '';
    img.style.cssText = 'width:100%;height:auto;display:block;pointer-events:none;user-select:none';
    img.onerror = ()=>{};
    el.appendChild(img);

    if (stickerEditMode) {
      // Delete handle
      const del = document.createElement('button');
      del.className = 'sticker-handle sticker-del-btn';
      del.textContent = '✕';
      del.title = '삭제';
      del.addEventListener('mousedown',  e=>{ e.stopPropagation(); deleteSticker(s.id); });
      del.addEventListener('touchstart', e=>{ e.stopPropagation(); deleteSticker(s.id); }, {passive:true});
      el.appendChild(del);

      // Rotate handle
      const rot = document.createElement('div');
      rot.className = 'sticker-handle sticker-rot-btn';
      rot.title = '회전';
      rot.textContent = '↻';
      rot.addEventListener('mousedown',  e => startInteract(e, 'rotate', s.id, el));
      rot.addEventListener('touchstart', e => startInteract(e, 'rotate', s.id, el), {passive:false});
      el.appendChild(rot);

      // Resize handle
      const res = document.createElement('div');
      res.className = 'sticker-handle sticker-res-btn';
      res.title = '크기';
      res.textContent = '⤡';
      res.addEventListener('mousedown',  e => startInteract(e, 'resize', s.id, el));
      res.addEventListener('touchstart', e => startInteract(e, 'resize', s.id, el), {passive:false});
      el.appendChild(res);

      // Drag on body
      el.addEventListener('mousedown',  e => startInteract(e, 'drag', s.id, el));
      el.addEventListener('touchstart', e => startInteract(e, 'drag', s.id, el), {passive:false});
    }

    layer.appendChild(el);
  });

  layer.classList.toggle('edit-mode', stickerEditMode);
  const btn = document.getElementById('sticker-edit-btn');
  if (btn) { btn.textContent = stickerEditMode ? '✏ 편집 완료' : '✏ 편집모드'; btn.classList.toggle('active', stickerEditMode); }
}

function getClientXY(e) {
  if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}

function startInteract(e, type, id, el) {
  if (!stickerEditMode) return;
  e.preventDefault(); e.stopPropagation();

  // select
  selectedStickerId = id;
  document.querySelectorAll('.sticker').forEach(s => s.classList.toggle('selected', s.dataset.id===id));

  const s = state.stickers.find(x=>x.id===id);
  if (!s) return;
  const pt = getClientXY(e);

  // sticker center in viewport coords
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width/2;
  const cy = rect.top  + rect.height/2;

  _si = { type, id,
    startX: pt.x, startY: pt.y,
    origX: s.x, origY: s.y,
    origSize: s.size,
    origAngle: s.angle||0,
    cx, cy,
    startAngle: Math.atan2(pt.y - cy, pt.x - cx),
  };
}

function onInteractMove(e) {
  if (!_si.type || !stickerEditMode) return;
  const pt = getClientXY(e);
  const s = state.stickers.find(x=>x.id===_si.id);
  if (!s) return;

  if (_si.type === 'drag') {
    // Coordinates relative to sticker-layer (which is fixed, top=50px)
    const layer = getStickerLayer().getBoundingClientRect();
    const dx = pt.x - _si.startX;
    const dy = pt.y - _si.startY;
    s.x = _si.origX + dx;
    s.y = _si.origY + dy;
  } else if (_si.type === 'rotate') {
    const curAngle = Math.atan2(pt.y - _si.cy, pt.x - _si.cx);
    const delta = (curAngle - _si.startAngle) * (180 / Math.PI);
    s.angle = (_si.origAngle + delta + 360) % 360;
  } else if (_si.type === 'resize') {
    const dx = pt.x - _si.startX;
    const dy = pt.y - _si.startY;
    const dist = Math.sqrt(dx*dx + dy*dy) * (dx+dy > 0 ? 1 : -1);
    s.size = Math.max(24, _si.origSize + dist * 0.8);
  }

  // Live update the element directly (no full re-render for perf)
  const el = document.querySelector(`.sticker[data-id="${_si.id}"]`);
  if (el) {
    el.style.left  = s.x + 'px';
    el.style.top   = s.y + 'px';
    el.style.width = s.size + 'px';
    el.style.transform = `rotate(${s.angle||0}deg)`;
  }
}

function onInteractEnd() {
  if (_si.type) { save(); _si.type = null; }
}

function addSticker() {
  const urlIn = document.getElementById('sticker-url-in').value.trim();
  const file  = document.getElementById('sticker-file-in').files[0];
  const size  = parseInt(document.getElementById('sticker-size-in').value) || 100;

  // Place near center of viewport
  const layer = getStickerLayer().getBoundingClientRect();
  const cx = (window.innerWidth  - layer.left) / 2 - size/2;
  const cy = (window.innerHeight - layer.top)  / 2 - size/2;

  const doAdd = (src, imgData) => {
    const id = 's' + Date.now();
    const st = { id, url: src, x: cx, y: cy, size, angle: 0 };
    if (imgData) { st._imgData = imgData; dbSet('sticker_'+id, imgData); }
    state.stickers.push(st);
    selectedStickerId = id;
    stickerEditMode = true;
    save(); renderStickers(); closeModal('sticker-modal');
  };
  if (file) { const r=new FileReader(); r.onload=e=>doAdd('',e.target.result); r.readAsDataURL(file); }
  else if (urlIn) doAdd(urlIn, null);
  else alert('이미지를 선택하거나 URL을 입력해주세요');
}

function deleteSticker(id) {
  state.stickers = state.stickers.filter(s=>s.id!==id);
  if (selectedStickerId===id) selectedStickerId=null;
  dbDel('sticker_'+id); save(); renderStickers();
}

function toggleStickerEditMode() {
  stickerEditMode = !stickerEditMode;
  if (!stickerEditMode) selectedStickerId = null;
  // update toolbar button
  const btn = document.getElementById('sticker-edit-btn');
  if (btn) {
    btn.textContent = stickerEditMode ? '✏ 편집 완료' : '✏ 편집모드';
    btn.classList.toggle('active', stickerEditMode);
  }
  renderStickers();
}

/* ═══════════════════════════════════════════════════════
   DECO IMAGE
═══════════════════════════════════════════════════════ */
function applyDeco(url) {
  state.decoUrl = url;
  if (url) dbSet('deco', url);
  const area = document.getElementById('sidebar-deco');
  if (url) {
    area.innerHTML = `<img src="${esc(url)}" alt="꾸미기" onerror="this.src=''" />
      <button class="deco-change-btn" onclick="openModal('deco-modal')">변경</button>`;
  } else {
    area.innerHTML = `<div class="deco-placeholder">
      <div class="deco-text">사이드바 꾸미기</div>
      <button class="deco-add-btn" onclick="openModal('deco-modal')">이미지 추가</button>
    </div>`;
  }
}
function saveDeco() {
  const url = document.getElementById('deco-url-in').value.trim();
  const file = document.getElementById('deco-file-in').files[0];
  if (file) { const r=new FileReader(); r.onload=e=>{applyDeco(e.target.result);closeModal('deco-modal');}; r.readAsDataURL(file); }
  else if (url) { applyDeco(url); closeModal('deco-modal'); }
  else alert('URL을 입력하거나 파일을 선택해주세요');
}

/* ═══════════════════════════════════════════════════════
   QUICK LINKS
═══════════════════════════════════════════════════════ */
function renderQuickLinks() {
  const list = document.getElementById('quicklinks-list');
  if (!state.quickLinks.length) {
    list.innerHTML = '<div class="ql-empty">링크를 추가해보세요</div>'; return;
  }
  list.innerHTML = state.quickLinks.map((l,i) =>
    `<span class="ql-tag" onclick="openLink(this.dataset.url)" data-url="${l.url.replace(/"/g,'&quot;')}">
      ${l.emoji ? `<span>${esc(l.emoji)}</span>` : ''}
      ${esc(l.name)}
      <button class="ql-del" onclick="delQuickLink(event,${i})">✕</button>
    </span>`
  ).join('');
}
function addQuickLink() {
  const name  = document.getElementById('ql-name-in').value.trim();
  let   url   = document.getElementById('ql-url-in').value.trim();
  const emoji = document.getElementById('ql-emoji-in').value.trim();
  if (!name||!url) { alert('이름과 URL을 입력해주세요'); return; }
  if (!url.startsWith('http') && !isLocalPath(url)) url='https://'+url;
  state.quickLinks.push({id:'q'+Date.now(), name, url, emoji});
  document.getElementById('ql-name-in').value='';
  document.getElementById('ql-url-in').value='';
  document.getElementById('ql-emoji-in').value='';
  save(); renderQuickLinks(); closeModal('quicklink-modal');
}
function delQuickLink(e, i) {
  e.preventDefault(); e.stopPropagation();
  state.quickLinks.splice(i,1); save(); renderQuickLinks();
}

/* ═══════════════════════════════════════════════════════
   YOUTUBE
═══════════════════════════════════════════════════════ */
function getYTId(url) {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  return m?m[1]:null;
}

/* ── 링크 열기 — 로컬 경로 vs 웹 URL 분기 ── */
function isLocalPath(url) {
  if (!url) return false;
  // Windows 절대경로: C:\ D:\ 등
  if (/^[A-Za-z]:[\\\/]/.test(url)) return true;
  // file:// 프로토콜
  if (url.startsWith('file://')) return true;
  // UNC 경로: \\server\share
  if (url.startsWith('\\\\') || url.startsWith('//')) return true;
  return false;
}

function openLink(url) {
  if (!url) return;
  // &quot; 등 HTML 엔티티 복원
  const decoded = url.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#x27;/g,"'");
  if (isLocalPath(decoded)) {
    const clean = decoded.replace(/^file:\/\/\//,'').replace(/\//g,'\\');
    if (typeof window.electronAPI?.openLocalPath === 'function') {
      window.electronAPI.openLocalPath(clean);
    } else {
      window.open('file:///' + clean.replace(/\\\\/g,'/'));
    }
  } else {
    window.open(decoded, '_blank', 'noopener');
  }
}

const isElectron = typeof window.electronAPI !== 'undefined';
const _ytHide  = () => { try { if (window.electronAPI?.ytHide)        window.electronAPI.ytHide(); } catch(e){} };
const _ytLoad  = (v) => { try { if (window.electronAPI?.ytLoad)        window.electronAPI.ytLoad(v); } catch(e){} };
const _ytPanel = (v) => { try { if (window.electronAPI?.ytPanelToggle) window.electronAPI.ytPanelToggle(v); } catch(e){} };

/* ── YouTube 링크 목록 (클릭 → 브라우저 오픈) ── */
function renderYT() {
  const trk  = state.ytTracks;
  const list = document.getElementById('yt-track-list');
  if (!list) return;
  if (!trk.length) {
    list.innerHTML = '<div style="font-size:11px;color:var(--text3);text-align:center;padding:12px">유튜브 URL을 추가하면<br>브라우저에서 바로 열려요 ♪</div>';
    return;
  }
  list.innerHTML = trk.map((t,i)=>`
    <div class="yt-track${i===state.curTrack?' active':''}" onclick="openYTLink(${i})">
      <div class="yt-track-icon">▶</div>
      <div class="yt-track-title">${esc(t.title||t.url)}</div>
      <button class="yt-track-open" onclick="openYTLink(${i},event)" title="브라우저로 열기">⬈</button>
      <button class="yt-track-del" onclick="delYT(event,${i})">✕</button>
    </div>`).join('');
}
function openYTLink(i, e) {
  if (e) e.stopPropagation();
  const t = state.ytTracks[i]; if (!t) return;
  state.curTrack = i;
  const url = t.url.startsWith('http') ? t.url : 'https://www.youtube.com/watch?v=' + (getYTId(t.url)||'');
  // Electron이면 shell.openExternal, 웹이면 window.open — 둘 중 하나만
  if (typeof window.electronAPI?.openExternal === 'function') {
    window.electronAPI.openExternal(url);
  } else {
    window.open(url, '_blank', 'noopener');
  }
  save(); renderYT();
}
function addYT() {
  const url   = document.getElementById('yt-url-in').value.trim();
  const title = document.getElementById('yt-title-in').value.trim();
  if (!url) { alert('URL을 입력해주세요'); return; }
  state.ytTracks.push({url, title:title||url});
  state.curTrack = state.ytTracks.length-1;
  document.getElementById('yt-url-in').value='';
  document.getElementById('yt-title-in').value='';
  save(); renderYT();
}
function playYT(i) { openYTLink(i); }
function delYT(e,i) {
  e.stopPropagation();
  state.ytTracks.splice(i,1);
  if (state.curTrack>=state.ytTracks.length) state.curTrack=Math.max(0,state.ytTracks.length-1);
  save(); renderYT();
}

/* ── 로컬 동영상 플레이어 ── */
function renderVideoPlayer() {
  const tracks = state.videoTracks;
  const list   = document.getElementById('video-track-list');
  const empty  = document.getElementById('video-empty');
  const video  = document.getElementById('local-video');
  const audio  = document.getElementById('local-audio');
  if (!list) return;

  list.innerHTML = tracks.map((t,i)=>`
    <div class="video-track${i===state.curVideo?' active':''}" onclick="playVideo(${i})">
      <div class="video-track-icon">${t.isAudio?'♪':'▶'}</div>
      <div class="video-track-title" ondblclick="renameVideo(event,${i})" title="더블클릭으로 제목 편집">${esc(t.displayName||t.name)}</div>
      <button class="video-track-del" onclick="delVideo(event,${i})">✕</button>
    </div>`).join('');

  if (!tracks.length) {
    if (empty) empty.style.display = 'flex';
    if (video) { video.src=''; video.style.display='none'; }
    if (audio) { audio.src=''; audio.style.display='none'; }
    return;
  }
  if (empty) empty.style.display = 'none';
  const cur = tracks[state.curVideo] || tracks[0];
  if (cur && cur._src) {
    if (cur.isAudio) {
      if (video) video.style.display='none';
      if (audio && audio.dataset.trackId !== cur.id) {
        audio.style.display='block'; audio.src=cur._src; audio.dataset.trackId=cur.id;
      } else if (audio) { audio.style.display='block'; }
    } else {
      if (audio) audio.style.display='none';
      if (video && video.dataset.trackId !== cur.id) {
        video.style.display='block'; video.src=cur._src; video.dataset.trackId=cur.id;
      } else if (video) { video.style.display='block'; }
    }
  }
}

function playVideo(i) {
  state.curVideo = i;
  const cur   = state.videoTracks[i];
  const video = document.getElementById('local-video');
  const audio = document.getElementById('local-audio');
  if (!cur || !cur._src) return;
  if (cur.isAudio) {
    if (video) { video.pause(); video.style.display='none'; }
    if (audio) { audio.style.display='block'; audio.src=cur._src; audio.dataset.trackId=cur.id; audio.play().catch(()=>{}); }
  } else {
    if (audio) { audio.pause(); audio.style.display='none'; }
    if (video) { video.style.display='block'; video.src=cur._src; video.dataset.trackId=cur.id; video.play().catch(()=>{}); }
  }
  renderVideoPlayer();
}

function delVideo(e, i) {
  e.stopPropagation();
  const t = state.videoTracks[i];
  if (t && t._src && !t.filePath) URL.revokeObjectURL(t._src);
  state.videoTracks.splice(i,1);
  if (state.curVideo >= state.videoTracks.length) state.curVideo = Math.max(0,state.videoTracks.length-1);
  const video = document.getElementById('local-video');
  if (video && state.videoTracks.length) {
    const nxt = state.videoTracks[state.curVideo];
    if (nxt && nxt._src) { video.src = nxt._src; video.dataset.trackId = nxt.id; }
  } else if (video) { video.src = ''; }
  save(); renderVideoPlayer();
}

let _renameVideoIdx = -1;
function renameVideo(e, i) {
  e.stopPropagation();
  const t = state.videoTracks[i];
  if (!t) return;
  _renameVideoIdx = i;
  const inp = document.getElementById('video-rename-in');
  inp.value = t.displayName || t.name;
  openModal('video-rename-modal');
  setTimeout(() => { inp.focus(); inp.select(); }, 60);
}
function saveVideoRename() {
  const inp = document.getElementById('video-rename-in');
  const newName = inp.value.trim();
  if (newName && _renameVideoIdx >= 0 && state.videoTracks[_renameVideoIdx]) {
    state.videoTracks[_renameVideoIdx].displayName = newName;
    save();
    renderVideoPlayer();
  }
  closeModal('video-rename-modal');
}

function addVideoFiles(files) {
  // 웹 환경 폴백 (blob)
  Array.from(files).forEach(file => {
    const id      = 'v' + Date.now() + Math.random().toString(36).slice(2,6);
    const isAudio = file.type.startsWith('audio/');
    const track   = { id, name: file.name, isAudio, filePath: '', _src: URL.createObjectURL(file) };
    state.videoTracks.push(track);
  });
  state.curVideo = state.videoTracks.length - 1;
  save(); renderVideoPlayer();
  if (state.videoTracks.length) playVideo(state.curVideo);
}

async function addMediaViaDialog() {
  // Electron: 네이티브 다이얼로그로 파일 경로 직접 수신
  if (typeof window.electronAPI?.selectMediaFiles !== 'function') {
    document.getElementById('video-file-in').click();
    return;
  }
  const paths = await window.electronAPI.selectMediaFiles();
  if (!paths || !paths.length) return;
  const audioExts = ['mp3','wav','flac','ogg','m4a','aac'];
  paths.forEach(filePath => {
    const id      = 'v' + Date.now() + Math.random().toString(36).slice(2,6);
    const name    = filePath.split(/[\/]/).pop();
    const ext     = name.split('.').pop().toLowerCase();
    const isAudio = audioExts.includes(ext);
    const src     = 'file:///' + filePath.replace(/\\/g, '/');
    state.videoTracks.push({ id, name, isAudio, filePath, _src: src });
  });
  state.curVideo = state.videoTracks.length - 1;
  save(); renderVideoPlayer();
  if (state.videoTracks.length) playVideo(state.curVideo);
}

function switchMediaSub(sub) {
  state.mediaSub = sub;
  document.getElementById('msub-yt').classList.toggle('active', sub==='yt');
  document.getElementById('msub-video').classList.toggle('active', sub==='video');
  document.getElementById('msub-panel-yt').style.display    = sub==='yt'    ? '' : 'none';
  document.getElementById('msub-panel-video').style.display = sub==='video' ? '' : 'none';
}


/* ═══════════════════════════════════════════════════════
   LEFT PANEL TAB SWITCH
═══════════════════════════════════════════════════════ */
function switchLPTab(tab) {
  state.lpTab = tab;
  document.getElementById('lp-tab-yt').classList.toggle('active', tab==='yt');
  document.getElementById('lp-tab-gallery').classList.toggle('active', tab==='gallery');
  document.getElementById('lp-yt').style.display      = tab==='yt'      ? '' : 'none';
  document.getElementById('lp-gallery').style.display = tab==='gallery' ? '' : 'none';
  if (tab==='yt') switchMediaSub(state.mediaSub||'yt');
}

/* ═══════════════════════════════════════════════════════
   GALLERY
═══════════════════════════════════════════════════════ */
let glTimer = null;
let glPlaying = false;

function renderGallery() {
  const imgs  = state.gallery;
  const idx   = state.galIdx;
  const imgEl = document.getElementById('gl-img');
  const empty = document.getElementById('gl-empty');
  const ctrl  = document.getElementById('gl-controls');
  const ctr   = document.getElementById('gl-counter');

  // 썸네일
  const thumbs = document.getElementById('gl-thumbs');
  thumbs.innerHTML = imgs.map((g,i) => `
    <div class="gl-thumb-wrap">
      <img class="gl-thumb${i===idx?' active':''}" src="${esc(g._data||g.url||'')}" onclick="glJump(${i})" draggable="false" />
      <button class="gl-thumb-del" onclick="glDelete(event,${i})">✕</button>
    </div>`).join('');

  if (!imgs.length) {
    imgEl.style.display = 'none';
    empty.style.display = '';
    ctrl.style.display  = 'none';
    return;
  }

  empty.style.display = 'none';
  ctrl.style.display  = 'flex';
  imgEl.style.display = 'block';
  imgEl.src = imgs[idx]._data || imgs[idx].url || '';
  ctr.textContent = `${idx+1} / ${imgs.length}`;

  // 자동재생 버튼 상태
  const playBtn = document.getElementById('gl-play-btn');
  if (playBtn) { playBtn.textContent = glPlaying ? '⏸' : '▶'; playBtn.classList.toggle('playing', glPlaying); }
}

function glJump(i) {
  state.galIdx = i; save(); renderGallery();
}
function glPrev() {
  if (!state.gallery.length) return;
  state.galIdx = (state.galIdx - 1 + state.gallery.length) % state.gallery.length;
  save(); renderGallery();
}
function glNext() {
  if (!state.gallery.length) return;
  state.galIdx = (state.galIdx + 1) % state.gallery.length;
  save(); renderGallery();
}
function glTogglePlay() {
  glPlaying = !glPlaying;
  if (glPlaying) {
    glTimer = setInterval(() => { glNext(); }, 3000);
  } else {
    clearInterval(glTimer); glTimer = null;
  }
  renderGallery();
}

function glAddUrl() {
  const url = document.getElementById('gl-url-in').value.trim();
  if (!url) return;
  const id = 'g' + Date.now();
  state.gallery.push({ id, url, _data: null });
  state.galIdx = state.gallery.length - 1;
  document.getElementById('gl-url-in').value = '';
  save(); renderGallery();
}

function glAddFiles(files) {
  let loaded = 0;
  Array.from(files).forEach(file => {
    const r = new FileReader();
    r.onload = e => {
      const id = 'g' + Date.now() + loaded;
      const data = e.target.result;
      state.gallery.push({ id, url: '', _data: data });
      dbSet('gallery_' + id, data);
      state.galIdx = state.gallery.length - 1;
      loaded++;
      save(); renderGallery();
    };
    r.readAsDataURL(file);
  });
}

function glDelete(e, i) {
  e.stopPropagation();
  const g = state.gallery[i];
  if (g) dbDel('gallery_' + g.id);
  state.gallery.splice(i, 1);
  state.galIdx = Math.max(0, Math.min(state.galIdx, state.gallery.length - 1));
  save(); renderGallery();
}


/* ═══════════════════════════════════════════════════════
   DIARY LIST
═══════════════════════════════════════════════════════ */
function openDiaryListModal() {
  const wrap = document.getElementById('diary-list-wrap');
  const entries = Object.entries(state.diaries)
    .filter(([, v]) => v && v.trim())
    .sort(([a],[b]) => b.localeCompare(a)); // 최신순

  if (!entries.length) {
    wrap.innerHTML = '<div class="diary-list-empty">작성된 일기가 없습니다</div>';
  } else {
    wrap.innerHTML = entries.map(([date, text]) => {
      const d = parseYMD(date);
      const dateStr = `${d.getMonth()+1}월 ${d.getDate()}일 ${['일','월','화','수','목','금','토'][d.getDay()]}`;
      const icon = state.diarySettings?.icon || '🖊';
      const preview = text.replace(/\n/g,' ').slice(0,50) + (text.length>50?'…':'');
      return `<div class="diary-list-item" onclick="goDiaryDate('${date}')">
        <div class="diary-list-date"><span>${icon}</span>${dateStr}</div>
        <div class="diary-list-preview">${esc(preview)}</div>
      </div>`;
    }).join('');
  }
  openModal('diary-list-modal');
}

function goDiaryDate(dateStr) {
  // 해당 날짜 월로 이동 + 날짜 선택 + 일기 탭 열기
  const d = parseYMD(dateStr);
  state.year  = d.getFullYear();
  state.month = d.getMonth();
  state.selectedDate = dateStr;
  closeModal('diary-list-modal');
  renderCalendar();
  renderSidebar();
  // 일기 탭으로 전환
  document.querySelectorAll('.sel-tab').forEach(t => t.classList.remove('active'));
  const diaryTab = document.querySelector('.sel-tab[data-stab="diary"]');
  if (diaryTab) diaryTab.classList.add('active');
  document.getElementById('panel-events').style.display = 'none';
  document.getElementById('panel-diary').style.display  = 'block';
}

/* ═══════════════════════════════════════════════════════
   MODAL HELPERS
═══════════════════════════════════════════════════════ */
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

/* ═══════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════ */
async function init() {
  load();
  await loadImages();
  applyTheme(state.theme);
  if (state.theme==='custom') applyCustomThemeVars();

  renderWeekdays();
  renderCalendar();
  renderSidebar();
  applyBanner(state.bannerUrl);
  // apply saved zoom
  if (state.bannerUrl && state.bannerZoom) {
    document.getElementById('banner-bg').style.backgroundSize = `${state.bannerZoom}%`;
  }
  applyDeco(state.decoUrl);
  renderStickers();
  renderQuickLinks();
  renderYT();
  renderVideoPlayer();
  switchMediaSub(state.mediaSub||'yt');
  renderGallery();
  updateFontSelect();
  switchLPTab(state.lpTab||'yt');

  // Nav
  document.getElementById('prev-btn').onclick = ()=>{
    if(state.month===0){state.year--;state.month=11;}else state.month--;
    renderCalendar();
  };
  document.getElementById('next-btn').onclick = ()=>{
    if(state.month===11){state.year++;state.month=0;}else state.month++;
    renderCalendar();
  };
  document.getElementById('today-btn').onclick = ()=>{
    state.year=new Date().getFullYear(); state.month=new Date().getMonth();
    state.selectedDate=todayYMD(); renderCalendar(); renderSidebar();
  };

  // Theme
  document.querySelectorAll('.theme-btn').forEach(b => {
    b.onclick = () => {
      if (b.dataset.theme==='custom') openCustomThemeModal();
      else applyTheme(b.dataset.theme);
    };
  });

  // YT
  document.getElementById('yt-toggle-btn').onclick = ()=>{
    const panel = document.getElementById('yt-panel');
    panel.classList.toggle('collapsed');
    const visible = !panel.classList.contains('collapsed');
    if (typeof window.electronAPI !== 'undefined') {
      _ytPanel(visible);
      if (visible) renderYT(); // BrowserView 다시 띄우기
    }
  };
  document.getElementById('yt-add-btn').onclick = addYT;
  document.getElementById('yt-url-in').addEventListener('keydown',e=>{if(e.key==='Enter')addYT();});

  // Gallery file input
  document.getElementById('gl-file-in').addEventListener('change', function() {
    if (this.files.length) glAddFiles(this.files);
    this.value = '';
  });
  document.getElementById('video-file-in').addEventListener('change', function() {
    if (this.files.length) addVideoFiles(this.files);
    this.value = '';
  });
  document.getElementById('gl-url-in').addEventListener('keydown', e=>{ if(e.key==='Enter') glAddUrl(); });

  // Banner — init drag preview once, wire file input
  initBannerPreviewDrag();
  document.getElementById('banner-file-in').addEventListener('change', function() {
    const file = this.files[0]; if (!file) return;
    const label = document.getElementById('banner-file-label');
    label.childNodes[0].textContent = '✓ ' + file.name.slice(0,18);
    const r = new FileReader();
    r.onload = e => setBannerImageFromInput(e.target.result);
    r.readAsDataURL(file);
  });
  document.getElementById('banner-url-in').addEventListener('input', function() {
    const url = this.value.trim();
    if (url) setBannerImageFromInput(url);
  });
  // Banner modal open via the ctrl button uses openBannerModal()
  document.querySelectorAll('.banner-ctrl-btn').forEach(b => {
    if (b.textContent.includes('변경')) b.onclick = openBannerModal;
  });

  // Event modal
  document.getElementById('modal-save-btn').onclick = saveEvent;
  document.getElementById('ev-rollover').addEventListener('change',function(){
    document.getElementById('ev-rollover-date').style.display=this.checked?'block':'none';
  });
  document.getElementById('ev-repeat').addEventListener('change',function(){
    const show=this.value!=='';
    document.getElementById('repeat-range').style.display=show?'flex':'none';
    if(show&&!document.getElementById('ev-repeat-start').value)
      document.getElementById('ev-repeat-start').value=document.getElementById('ev-date').value||todayYMD();
  });
  document.getElementById('link-add-btn').onclick = addLink;
  document.getElementById('link-url-in').addEventListener('keydown',e=>{if(e.key==='Enter')addLink();});

  // Sticker edit mode
  // Sticker size slider
  document.getElementById('sticker-size-in').addEventListener('input',function(){
    document.getElementById('sticker-size-val').textContent=this.value+'px';
  });

  // D-Day
  document.getElementById('dday-add-btn').onclick = openAddDDay;

  // Add event btn
  document.getElementById('add-event-btn').onclick = ()=>openNewEvent(state.selectedDate);

  // Diary
  document.getElementById('diary-save-btn').onclick = saveDiary;
  document.getElementById('diary-list-btn').onclick = openDiaryListModal;
  document.getElementById('diary-font-file').addEventListener('change', function() { if(this.files[0]) handleFontUpload(this.files[0]); this.value=''; });

  // 일기 툴바 — 실시간 textarea 스타일 적용
  document.getElementById('diary-font').addEventListener('change', function() {
    if (this.value === '__custom__') {
      document.getElementById('diary-font-file').click();
      // 선택을 이전 값으로 되돌림
      this.value = state.diarySettings.font;
      return;
    }
    state.diarySettings.font = this.value;
    document.getElementById('diary-textarea').style.fontFamily = this.value;
  });
  document.getElementById('diary-font-file').addEventListener('change', function() {
    if (this.files[0]) handleFontUpload(this.files[0]);
    this.value = '';
  });
  document.getElementById('diary-size').addEventListener('change', function() {
    state.diarySettings.size = this.value;
    document.getElementById('diary-textarea').style.fontSize = this.value;
  });

  // Sel tabs
  document.querySelectorAll('.sel-tab').forEach(t=>{
    t.onclick=()=>{
      document.querySelectorAll('.sel-tab').forEach(x=>x.classList.remove('active')); t.classList.add('active');
      document.getElementById('panel-events').style.display=t.dataset.stab==='events'?'block':'none';
      document.getElementById('panel-diary').style.display=t.dataset.stab==='diary'?'block':'none';
    };
  });

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(el=>{
    el.addEventListener('click',e=>{ if(e.target===el) closeModal(el.id); });
  });

  // Global sticker interaction handlers
  document.addEventListener('mousemove',  onInteractMove);
  document.addEventListener('mouseup',    onInteractEnd);
  document.addEventListener('touchmove',  e => { if(_si.type) { e.preventDefault(); onInteractMove(e); } }, {passive:false});
  document.addEventListener('touchend',   onInteractEnd);
}

// 자정에 오늘 날짜 자동 갱신
function scheduleNextMidnight() {
  const now  = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1, 0, 0, 5);
  const ms   = next - now;
  setTimeout(() => {
    renderCalendar();
    scheduleNextMidnight();
  }, ms);
}

// PC 시스템 날짜가 바뀌면 (수동 변경 포함) 30초마다 감지해서 반영
let _lastDateStr = toYMD(new Date());
setInterval(() => {
  const nowStr = toYMD(new Date());
  if (nowStr !== _lastDateStr) {
    _lastDateStr = nowStr;
    renderCalendar();
    updateDDayUI();
  }
}, 30000);

document.addEventListener('DOMContentLoaded', () => {
  init().then(() => scheduleNextMidnight());
  // 제목 편집 모달 Enter 키
  document.getElementById('video-rename-in')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveVideoRename();
    if (e.key === 'Escape') closeModal('video-rename-modal');
  });
});