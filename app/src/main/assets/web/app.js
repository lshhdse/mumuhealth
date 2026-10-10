import { MEALS, localDate, shiftDate, weekDates, daySummary, mealEnergy, validateMeal, validateWorkout, validateTemplate, escapeHtml as e } from './domain.mjs';
import defaultTemplates from './workout-templates.json';

const paths = {
  leaf: '<path d="M5 19C2 10 7 3 20 4c1 12-5 17-15 15Z"/><path d="m5 19 10-10m-5 5V9m0 5h6"/>',
  home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h1m6 0h1"/>',
  settings: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-5 3-8 8-8s8 3 8 8"/>',
  gear: '<path d="m9 3-1 3-3 1v4l3 1 1 3h6l1-3 3-1V7l-3-1-1-3Z"/><circle cx="12" cy="9" r="2"/><path d="M5 20h14"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-3.7c-1.5-1 .2-3.3 2-3.3h2a3 3 0 0 0 3-3c0-4.4-4-8-9-8Z"/><path d="M7 8h.01M12 6h.01M17 8h.01M6 13h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  sunrise: '<path d="M3 17h18M6 13a6 6 0 0 1 12 0M12 3v3M4 7l2 2m12 0 2-2M4 21h16"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',
  moon: '<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/><path d="m18 3 .5 2 2 .5-2 .5-.5 2-.5-2-2-.5 2-.5Z"/>',
  dumbbell: '<path d="M2 9v6m3-9v12m3-13v14m0-7h8m0-7v14m3-13v12m3-9v6"/>',
  run: '<circle cx="15" cy="4" r="2"/><path d="m7 10 4-3 4 3h5m-9-3-2 7 5 3v5m-5-8-4 6H2"/>',
  arrow: '<path d="m9 5 7 7-7 7"/>',
  left: '<path d="m15 5-7 7 7 7"/>',
  camera: '<path d="M3 7h4l2-3h6l2 3h4v13H3Z"/><circle cx="12" cy="13" r="4"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 5 5 3-3 4 4"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/><path d="m19 2 .8 2.2L22 5l-2.2.8L19 8l-.8-2.2L16 5l2.2-.8Z"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 15v6h16v-6"/>',
  check: '<path d="m5 12 4 4L19 6"/>'
};
const icon = (name, cls = '') => `<svg viewBox="0 0 24 24" class="icon ${cls}" aria-hidden="true">${paths[name] || paths.leaf}</svg>`;
const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
const main = document.querySelector('#main');
const overlay = document.querySelector('#overlay');
const themes = [
  { id: 'blue', name: '晴空蓝', caption: '清爽 · 明亮' },
  { id: 'sage', name: '鼠尾草绿', caption: '自然 · 平静' },
  { id: 'plum', name: '雾紫', caption: '柔和 · 安静' },
  { id: 'rose', name: '玫瑰粉', caption: '温柔 · 轻盈' },
  { id: 'amber', name: '暖杏', caption: '温暖 · 朴素' }
];
const themeId = value => themes.some(theme => theme.id === value) ? value : 'blue';
let state = { page: 'today', settingsView: 'root', date: localDate(), data: { version: 1, meals: [], workouts: [], templates: [] }, settings: {}, native: false, appVersion: '1.0.5' };
let savingAppearance = false;
let updateState = { status: 'idle', available: false };
let dismissedUpdate = 0;
let installingUpdate = false;
let editor = null, busy = false, toastTimer, requestSeq = 0, confirmResolve;
const pending = new Map();
window.nativeResult = json => {
  try {
    const response = JSON.parse(json), promise = pending.get(response.id);
    if (!promise) return;
    pending.delete(response.id);
    response.error ? promise.reject(new Error(response.error)) : promise.resolve(response.result);
  } catch { /* Ignore malformed or stale native replies. */ }
};
window.mealAnalysisUpdated = json => {
  try {
    const meal = JSON.parse(json);
    const current = state.data.meals.find(item => item.id === meal.id);
    if (!current || current.analysisToken !== meal.analysisToken || current.updatedAt > meal.updatedAt) return;
    putRecord('meals', meal);
    if (editor?.kind === 'meal' && editor.record.id === meal.id) return;
    if (editor?.kind === 'meal-detail' && editor.record.id === meal.id) {
      editor.record = meal;
      showMealDetail();
    }
    render();
    toast(meal.analysisStatus === 'done' ? '这一餐的热量估算完成。' : '这一餐分析未完成，记录已保留。');
  } catch { /* Ignore stale native notifications. */ }
};
function call(method, payload = {}) {
  if (window.NativeBridge) return new Promise((resolve, reject) => {
    const id = String(++requestSeq);
    pending.set(id, { resolve, reject });
    try { window.NativeBridge.call(method, JSON.stringify(payload), id); }
    catch (error) { pending.delete(id); reject(error); }
  });
  return previewCall(method, payload);
}
const previewKey = 'mumu.preview.records.v1';
let previewConfig = { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', textModel: 'qwen-plus', visionModel: 'qwen3-vl-plus', hasKey: false, theme: themeId(localStorage.getItem('mumu.preview.theme')) };
function previewData(recoverPending = false) {
  const raw = localStorage.getItem(previewKey);
  const data = raw ? JSON.parse(raw) : { version: 1, meals: [], workouts: [] };
  if (!Array.isArray(data.templates)) data.templates = JSON.parse(JSON.stringify(defaultTemplates));
  if (recoverPending) {
    let changed = false;
    for (const meal of data.meals) if (meal.analysisStatus === 'pending') {
      meal.analysisStatus = 'failed'; meal.analysisError = '浏览器预览未连接 AI。请在安卓 APP 中填写密钥后重试。'; changed = true;
    }
    if (changed) localStorage.setItem(previewKey, JSON.stringify(data));
  }
  return data;
}
async function previewCall(method, payload) {
  if (method === 'init') return { data: previewData(true), settings: previewConfig, native: false, appVersion: '1.0.5' };
  if (method === 'appearance') { previewConfig = { ...previewConfig, theme: themeId(payload.theme) }; localStorage.setItem('mumu.preview.theme', previewConfig.theme); return previewConfig; }
  if (method === 'checkUpdate') return { status: 'preview', available: false };
  if (method === 'installUpdate') throw new Error('请在安卓 APP 中安装更新。');
  if (method === 'saveMeal' || method === 'saveWorkout') {
    const data = previewData(), kind = method === 'saveMeal' ? 'meals' : 'workouts';
    const item = { ...payload, id: payload.id || newToken(), updatedAt: Date.now() };
    const index = data[kind].findIndex(record => record.id === item.id);
    index === -1 ? data[kind].push(item) : data[kind].splice(index, 1, item);
    localStorage.setItem(previewKey, JSON.stringify(data));
    if (method === 'saveMeal' && item.analysisStatus === 'pending') setTimeout(() => {
      const latest = previewData(), current = latest.meals.find(record => record.id === item.id);
      if (!current || current.analysisToken !== item.analysisToken || current.analysisStatus !== 'pending') return;
      current.analysisStatus = 'failed'; current.analysisError = '浏览器预览未连接 AI。请在安卓 APP 中填写密钥后重试。';
      current.updatedAt = Date.now(); localStorage.setItem(previewKey, JSON.stringify(latest));
      window.mealAnalysisUpdated(JSON.stringify(current));
    }, 500);
    return item;
  }
  if (method === 'saveWorkouts') {
    if (!Array.isArray(payload.records) || !payload.records.length || payload.records.length > 30) throw new Error('请添加 1 到 30 项运动。');
    const data = previewData();
    const items = payload.records.map((record, index) => {
      const error = validateWorkout(record);
      if (error) throw new Error(`运动 ${index + 1}：${error}`);
      return { ...record, id: record.id || newToken(), updatedAt: Date.now() };
    });
    for (const item of items) {
      const index = data.workouts.findIndex(record => record.id === item.id);
      index === -1 ? data.workouts.push(item) : data.workouts.splice(index, 1, item);
    }
    localStorage.setItem(previewKey, JSON.stringify(data));
    return items;
  }
  if (method === 'saveTemplate') {
    const error = validateTemplate(payload);
    if (error) throw new Error(error);
    const data = previewData(), template = { ...payload, id: payload.id || newToken(), updatedAt: Date.now() };
    const index = data.templates.findIndex(item => item.id === template.id);
    index === -1 ? data.templates.push(template) : data.templates.splice(index, 1, template);
    localStorage.setItem(previewKey, JSON.stringify(data)); return template;
  }
  if (method === 'delete') { const data = previewData(); data[payload.kind] = data[payload.kind].filter(record => record.id !== payload.id); localStorage.setItem(previewKey, JSON.stringify(data)); return true; }
  if (method === 'settings') { previewConfig = { ...previewConfig, baseUrl: payload.baseUrl, textModel: payload.textModel, visionModel: payload.visionModel, hasKey: false }; return previewConfig; }
  if (method === 'analyze' || method === 'testAi') throw new Error('浏览器预览未连接 AI。请在安卓 APP 中填写密钥后使用真实识别。');
  if (method === 'photo') return new Promise(resolve => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
    input.onchange = () => { const file = input.files[0]; if (!file) return resolve(null); const reader = new FileReader(); reader.onload = () => resolve({ name: reader.result, url: reader.result }); reader.readAsDataURL(file); };
    input.addEventListener('cancel', () => resolve(null)); input.click();
  });
  if (method === 'export') { const blob = new Blob([JSON.stringify(previewData(), null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `沐沐健康-${localDate()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return true; }
  if (method === 'openHelp') { window.open('https://help.aliyun.com/zh/model-studio/get-api-key', '_blank', 'noopener'); return true; }
  throw new Error('此功能请在安卓 APP 中使用。');
}
function toast(message) { const node = document.querySelector('#toast'); node.textContent = message; node.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 3300); }
function displayDate(date) { const d = new Date(`${date}T12:00:00`); return `${d.getMonth() + 1} 月 ${d.getDate()} 日`; }
function weekName(date) { return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(`${date}T12:00:00`).getDay()]; }
function weekRange(dates) {
  const start = dates[0].split('-').join('/');
  const end = dates[0].slice(0,4) === dates[6].slice(0,4) ? dates[6].slice(5).replace('-','/') : dates[6].split('-').join('/');
  return `${start} — ${end}`;
}
function titleBar() { return `<div class="topline"><div class="brand"><span class="brand-mark">${icon('check')}</span><span>沐沐 <small>MUMU</small></span></div><span class="date-label">${displayDate(localDate())} · ${weekName(localDate())}</span></div>`; }
const botanical = `<svg class="botanical" viewBox="0 0 140 140" aria-hidden="true"><circle cx="73" cy="72" r="50" fill="none" stroke="#c2d4a4" stroke-opacity=".17"/><path d="M51 109C28 72 48 35 99 32c16 42-2 81-48 77Z" fill="#a6bd85" fill-opacity=".14"/><path d="M51 109 88 48M66 84l-9-23m18 8 21-6" fill="none" stroke="#d2dda7" stroke-width="1.7" stroke-linecap="round"/><circle cx="107" cy="96" r="3" fill="#d7dfac" fill-opacity=".7"/><circle cx="34" cy="42" r="2" fill="#d7dfac" fill-opacity=".6"/></svg>`;
function summaryCard(summary) {
  const value = summary.knownCount ? summary.kcal.toLocaleString() : '—';
  return `<section class="summary-card" aria-label="当天饮食热量"><p class="eyebrow">今日概览</p><p class="energy-label">${summary.unknownCount || summary.pendingCount ? '已完成估算的热量' : '饮食估算热量'}</p><div class="energy-value">${value}<small>千卡</small></div>${botanical}${summary.unknownCount ? `<p class="summary-note">另有 ${summary.unknownCount} 项食物未填写热量，未计入总数</p>` : ''}${summary.pendingCount ? `<p class="summary-note">${summary.pendingCount} 餐正在分析，完成后自动更新</p>` : ''}<div class="summary-footer"><span><span class="dots">${[0,1,2].map(i => `<i class="dot ${i < summary.mealCount ? 'done' : ''}"></i>`).join('')}</span>已记录 ${summary.mealCount} / 3 餐</span><span>${summary.workouts.length ? `${summary.workouts.length} 条训练记录` : '每一餐，慢慢记录'}</span></div></section>`;
}
function mealTitle(record) {
  const title = record.title?.trim();
  if (title) return title;
  const description = record.description?.trim().replace(/\s+/g, ' ');
  if (description) return description.length > 28 ? `${description.slice(0, 28)}…` : description;
  return record.foods?.map(food => food.name).filter(Boolean).join(' · ') || '餐食照片';
}
function energyText(record) {
  if (record.analysisStatus === 'pending') return '<span class="pending-energy">分析中</span><small>稍后自动更新</small>';
  const energy = mealEnergy(record);
  return `${energy.known ? `约 ${energy.kcal.toLocaleString()}` : '—'}<small>${record.analysisStatus === 'failed' ? '分析未完成' : energy.unknown ? '部分热量未知' : '千卡'}</small>`;
}
function mealRecord(record, meal) {
  const label = mealTitle(record);
  const subtitle = record.analysisStatus === 'pending' ? 'AI 正在估算热量' : record.analysisStatus === 'failed' ? '点开查看并重试分析' : record.source === 'ai' ? 'AI 估算 · 点开看详情' : '点开看详情';
  return `<button class="meal-record" data-action="view-meal" data-id="${e(record.id)}" aria-label="查看${meal.label}：${e(label)}">${record.photo ? `<img class="record-image" src="${e(photoUrl(record.photo))}" alt="餐食照片">` : ''}<span class="record-body"><h3>${e(label)}</h3><p>${subtitle}</p></span><span class="record-energy">${energyText(record)}</span>${icon('arrow','chevron')}</button>`;
}
function mealSection(summary) {
  return `<section><div class="section-title"><h2>饮食记录</h2><span>${summary.meals.length ? `${summary.meals.length} 条记录` : '好好吃饭，好好生活'}</span></div>${Object.entries(MEALS).map(([key, meal]) => {
    const items = summary.meals.filter(record => record.meal === key);
    return `<article class="meal-card"><div class="meal-head"><div class="meal-icon ${meal.tone}">${icon(meal.icon)}</div><div class="meal-title"><h3>${meal.label}</h3><p>${items.length ? `${items.length} 条饮食记录` : meal.caption}</p></div><button class="add-round" data-action="add-meal" data-meal="${key}" aria-label="添加${meal.label}">${icon('plus','icon-sm')}</button></div>${items.map(record => mealRecord(record,meal)).join('')}</article>`;
  }).join('')}</section>`;
}
function workoutSection(summary) {
  return `<section class="workout-section"><div class="section-title"><h2>训练记录</h2><button data-action="add-workout">${icon('plus','icon-sm')} 记录训练</button></div>${summary.workouts.length ? `<div class="workout-list">${summary.workouts.map(record => `<button class="workout-row" data-action="edit-workout" data-id="${e(record.id)}"><span class="meal-icon ${record.type === 'cardio' ? 'sage' : 'lavender'}">${icon(record.type === 'cardio' ? 'run' : 'dumbbell')}</span><span class="record-body"><h3>${e(record.name)}</h3><p>${record.type === 'cardio' ? `有氧 · ${record.minutes} 分钟` : `力量 · ${record.sets} 组 × ${record.reps} 次${record.weight === null ? '' : ` · ${record.weight} kg`}`}</p></span>${icon('arrow','chevron')}</button>`).join('')}</div>` : `<button class="workout-empty" data-action="add-workout"><span class="meal-icon">${icon('dumbbell')}</span><span class="record-body"><h3>给身体一点活动的时间</h3><p>有氧或力量，记录每一次行动</p></span>${icon('arrow','chevron')}</button>`}</section>`;
}
function photoUrl(name) { return name.startsWith('data:') ? name : `https://app.mumu.local/photos/${encodeURIComponent(name)}`; }
function renderToday() {
  state.date = localDate();
  const summary = daySummary(state.data, state.date);
  return `${titleBar()}${state.native ? '' : '<p class="preview-notice">界面预览 · 真实拍照与 AI 识别请使用安卓安装包</p>'}<header class="heading"><p class="eyebrow">我的今日清单</p><h1>今天</h1><p>饮食与训练，都轻松记在这里。</p></header>${summaryCard(summary)}${draftButton()}${mealSection(summary)}${workoutSection(summary)}<p class="footnote">不必完美，记录就是一个好的开始。</p>`;
}
function draftButton() { try { return localStorage.getItem('mumu.draft') ? '<div class="section-title"><span>有一条未保存的饮食草稿</span><button data-action="resume-draft">继续记录 →</button></div>' : ''; } catch { return ''; } }
function renderHistory() {
  const summary = daySummary(state.data, state.date);
  const dates = weekDates(state.date);
  const max = Math.max(1, ...dates.map(date => daySummary(state.data,date).kcal));
  return `${titleBar()}<div class="history-heading"><div><p class="eyebrow">按周查看</p><h1>历史记录</h1></div></div><div class="date-switch week-switch"><button data-action="shift-week" data-offset="-1" aria-label="上一周">${icon('left')}</button><strong>${weekRange(dates)}</strong><button data-action="shift-week" data-offset="1" aria-label="下一周">${icon('arrow')}</button></div><div class="selected-date-line"><span>${displayDate(state.date)} · ${weekName(state.date)}</span><label class="date-control">${icon('calendar','icon-sm')} 选日期<input id="history-date" type="date" value="${e(state.date)}" aria-label="选择历史日期"></label></div><div class="week-strip">${dates.map(date => `<button class="week-day ${date === state.date ? 'selected' : ''} ${daySummary(state.data,date).meals.length || daySummary(state.data,date).workouts.length ? 'has-record' : ''}" data-action="choose-date" data-date="${date}" aria-label="${date}"><span>${weekName(date)}</span><strong>${Number(date.slice(-2))}</strong><i class="day-dot"></i></button>`).join('')}</div><div class="stats-row"><div class="stat-cell"><strong>${summary.knownCount ? summary.kcal.toLocaleString() : '—'}</strong><span>${summary.unknownCount ? '已知热量 / 千卡' : '估算热量 / 千卡'}</span></div><div class="stat-cell"><strong>${summary.mealCount}<small> / 3</small></strong><span>已记录餐次</span></div><div class="stat-cell"><strong>${summary.workouts.length}</strong><span>训练记录 / 条</span></div></div>${summary.unknownCount ? `<p class="form-note">当天另有 ${summary.unknownCount} 项食物热量未知，未计入总数。</p>` : ''}<div class="chart-card"><h3>这一周的饮食记录</h3><p>仅汇总已填写的估算热量，不包含运动消耗。</p><div class="chart">${dates.map(date => { const day = daySummary(state.data,date); return `<div class="chart-column ${date === state.date ? 'selected' : ''}"><span class="chart-number">${day.knownCount ? `${day.kcal}${day.unknownCount ? '*' : ''}` : '—'}</span><div class="chart-bar" data-chart-height="${Math.max(3, Math.round(day.kcal / max * 60))}"></div><small>${Number(date.slice(-2))}日</small></div>`; }).join('')}</div><p>* 表示部分食物热量未知。</p></div>${mealSection(summary)}${workoutSection(summary)}<p class="footnote">可以为所选日期补充记录。</p>`;
}
function settingsHeader(title, subtitle) {
  return `<header class="preferences-heading"><button class="preferences-back" data-action="settings-back" aria-label="返回我的">${icon('left')}<span>我的</span></button><h1>${title}</h1><p>${subtitle}</p></header>`;
}
function menuRow(view, symbol, title, detail = '', badge = '') {
  return `<button class="menu-row" data-action="${view === 'templates' ? 'open-templates' : `open-${view}`}"><span class="menu-icon">${icon(symbol)}</span><span class="menu-title">${title}</span>${badge ? `<span class="menu-badge">${badge}</span>` : `<span class="menu-meta">${detail}</span>`}${icon('arrow','chevron')}</button>`;
}
function recordStats() {
  const days = new Set([...state.data.meals,...state.data.workouts].map(record => record.date)).size;
  return `<div class="stats-row"><div class="stat-cell"><strong>${days}</strong><span>记录天数</span></div><div class="stat-cell"><strong>${state.data.meals.length}</strong><span>饮食记录</span></div><div class="stat-cell"><strong>${state.data.workouts.length}</strong><span>训练记录</span></div></div>`;
}
function renderSettings() {
  if (state.settingsView === 'ai') return renderAiSettings();
  if (state.settingsView === 'appearance') return renderAppearance();
  if (state.settingsView === 'general') return `${settingsHeader('设置', '管理你的记录与备份。')}${recordStats()}<section class="settings-card"><div class="card-title"><h2>数据与备份</h2><span class="status-pill">本地保存</span></div><button class="settings-action" data-action="export">${icon('download')}<span>导出记录与照片</span>${icon('arrow','chevron')}</button><button class="settings-action" data-action="import">${icon('upload')}<span>从备份恢复</span>${icon('arrow','chevron')}</button><p class="field-hint">备份不包含 API Key。卸载 APP 会清除本地记录，换手机前请先导出备份。</p></section><p class="preferences-note">热量为估算值，可以按实际份量修正。<br>训练只记录，不计算热量差。</p>`;
  if (state.settingsView === 'updates') return `${settingsHeader('检查更新', '每次打开 APP，会自动检查新版本。')}${updateSection()}<p class="preferences-note">可以稍后更新，再从这里继续安装。</p>`;
  const theme = themes.find(theme => theme.id === themeId(state.settings.theme));
  const updateLabel = updateState.status === 'checking' ? '检查中' : updateState.status === 'current' ? '已是最新' : updateState.status === 'error' ? '检查失败' : e(state.appVersion);
  return `${titleBar()}<header class="heading mine-heading"><h1>我的</h1><p>让记录更合你的习惯。</p></header><div class="mine-summary"><span class="mine-avatar">${icon('check')}</span><div><strong>沐沐健康</strong><p>每一餐，每一次行动。</p></div></div><section class="menu-section"><h2>偏好</h2><div class="menu-group">${menuRow('general','gear','设置','数据与备份')}${menuRow('appearance','palette','外观',theme.name)}${menuRow('ai','spark','AI 配置',state.settings.hasKey ? '已配置' : '待配置')}</div></section><section class="menu-section"><h2>记录与应用</h2><div class="menu-group">${menuRow('templates','dumbbell','训练模板',`${state.data.templates.length} 个模板`)}${menuRow('updates','download','检查更新',updateLabel,updateState.available ? '有新版本' : '')}</div></section><div class="settings-about">沐沐健康 · ${e(state.appVersion)}</div>`;
}
function renderAppearance() {
  const selected = themeId(state.settings.theme);
  return `${settingsHeader('外观', '选一种喜欢的颜色，让日常记录更舒心。')}<section class="appearance-section"><h2>主题配色</h2><div class="theme-grid">${themes.map(theme => `<button class="theme-option ${selected === theme.id ? 'selected' : ''}" data-action="choose-theme" data-theme-id="${theme.id}" aria-pressed="${selected === theme.id}" ${savingAppearance ? 'disabled' : ''}><span class="theme-preview" data-preview="${theme.id}" aria-hidden="true"><span class="preview-title"></span><span class="preview-card"><span class="preview-ring"></span><span class="preview-lines"></span></span><span class="preview-card"><span class="preview-ring"></span><span class="preview-lines"></span></span><span class="preview-tabs"><i></i><i></i><i></i></span></span><span class="theme-caption"><span><strong>${theme.name}</strong><small>${theme.caption}</small></span><span class="theme-check">${icon('check')}</span></span></button>`).join('')}</div></section><p class="preferences-note">点选即生效，下次打开继续使用。<br>首页、历史和记录表单都会使用这套配色。</p>`;
}
function applyTheme() { document.documentElement.dataset.theme = themeId(state.settings.theme); }
async function saveAppearance(value) {
  if (savingAppearance || themeId(state.settings.theme) === value) return;
  const previous = state.settings.theme;
  savingAppearance = true; state.settings.theme = value; applyTheme(); render();
  try { state.settings = await call('appearance', { theme: value }); }
  catch (error) { state.settings.theme = previous; toast(error.message); }
  finally { savingAppearance = false; applyTheme(); if (state.page === 'settings' && ['root','appearance'].includes(state.settingsView)) render(); }
}
function refreshUpdateUi() {
  if (state.page === 'settings' && ['root','updates'].includes(state.settingsView)) render();
}

function renderAiSettings() {
  const settings = state.settings;
  return `${settingsHeader('AI 配置', '配置饮食估算使用的服务与模型。')}${state.native ? '' : '<p class="preview-notice">浏览器仅用于界面预览，真实 AI 请在安卓 APP 中配置。</p>'}<section class="settings-card"><div class="card-title"><h2>AI 饮食助手</h2><span class="status-pill ${settings.hasKey ? '' : 'off'}">${settings.hasKey ? '已填写密钥' : '待配置'}</span></div><label class="field"><span class="field-label">服务地址</span><input id="base-url" type="url" inputmode="url" spellcheck="false" autocapitalize="off" value="${e(settings.baseUrl)}" placeholder="https://…/v1"><span class="field-hint">支持 Chat Completions 格式的 HTTPS 接口。百炼也可填写你所在业务空间的专属地址。</span></label><label class="field"><span class="field-label">API Key</span><span class="key-row"><input id="api-key" type="password" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="${settings.hasKey ? '已安全保存，留空保持原密钥' : '填写你自己的密钥'}"><button data-action="toggle-key" aria-label="显示或隐藏新输入的密钥">${icon('eye')}</button></span><span class="field-hint">在手机上加密保存；更换服务时，请同时填写对应的新密钥。</span></label><div class="field-row"><label class="field"><span class="field-label">文字模型</span><input id="text-model" value="${e(settings.textModel)}" spellcheck="false" autocapitalize="off"></label><label class="field"><span class="field-label">图片模型</span><input id="vision-model" value="${e(settings.visionModel)}" spellcheck="false" autocapitalize="off"></label></div><p class="field-hint">图片模型需要支持识图。默认预填百炼模型，其他服务请修改名称。</p><div id="settings-error" class="error" role="alert"></div><div class="button-row"><button class="primary" data-action="save-settings">保存设置</button><button class="secondary" data-action="test-ai">测试文字连接</button></div><p class="privacy-line">${icon('shield')}保存文字或照片后，会将本次内容发送给你配置的 AI 服务进行估算。手动填写热量时不会发送。请求会消耗该服务的额度。</p><div class="button-row"><button class="text-button" data-action="help">百炼密钥说明 ↗</button>${settings.hasKey ? '<button class="danger-text" data-action="clear-key">清除已保存的密钥</button>' : ''}</div></section>`;
}
function updateSection() {
  const status = updateState.available ? `发现新版本 · ${e(updateState.versionName)}` :
    updateState.status === 'checking' ? '正在检查…' : updateState.status === 'current' ? '已是最新版本' :
    updateState.status === 'unpublished' ? '暂未发布安装包' : updateState.status === 'preview' ? '仅安卓 APP 可检查' :
    updateState.status === 'error' ? '检查失败，点此重试' : '点击检查更新';
  return `<section class="settings-card"><div class="card-title"><h2>软件更新</h2><span class="status-pill ${updateState.available ? '' : 'off'}">${updateState.available ? '有更新' : e(state.appVersion)}</span></div><button class="settings-action" data-action="check-update">${icon('download')}<span>检查更新<small class="field-hint">${status}</small></span>${icon('arrow','chevron')}</button>${updateState.available ? `<button class="primary update-button" data-action="install-update" ${installingUpdate ? 'disabled' : ''}>${installingUpdate ? '正在下载安装包…' : '立即更新'}</button>` : ''}</section>`;
}
async function checkUpdate(manual = false) {
  if (updateState.status === 'checking') return;
  updateState = { status: 'checking', available: false }; refreshUpdateUi();
  try {
    updateState = await call('checkUpdate'); refreshUpdateUi();
    if (updateState.available && (manual || dismissedUpdate !== updateState.versionCode)) {
      if (overlay.childElementCount) return;
      const yes = await confirmDialog('发现新版本', `${updateState.versionName} 已发布。现在下载安装吗？`, false, '稍后再说', '立即更新');
      if (yes) await installUpdate(); else dismissedUpdate = updateState.versionCode;
    } else if (manual && !updateState.available) toast(updateState.status === 'current' ? '当前已是最新版本。' : updateState.status === 'preview' ? '请在安卓 APP 中检查更新。' : '暂时没有已发布的新版本。');
  } catch (error) { updateState = { status: 'error', available: false }; refreshUpdateUi(); if (manual) toast(error.message); }
}
async function installUpdate() {
  if (installingUpdate) return;
  installingUpdate = true; refreshUpdateUi();
  toast('正在下载并校验安装包，请稍候…');
  try {
    const result = await call('installUpdate');
    if (result.status === 'permission') toast('请允许安装此来源应用，返回后再次点击“立即更新”。');
  } catch (error) { toast(error.message); }
  finally { installingUpdate = false; refreshUpdateUi(); }
}
function render() {
  applyTheme();
  main.innerHTML = state.page === 'today' ? renderToday() : state.page === 'history' ? renderHistory() : renderSettings();
  document.querySelector('#navigation').innerHTML = [['today','home','今天'],['history','calendar','历史'],['settings','settings','我的']].map(([page,name,label]) => `<button class="nav-button ${state.page === page ? 'active' : ''}" data-action="navigate" data-page="${page}" ${state.page === page ? 'aria-current="page"' : ''}>${icon(name)}${label}</button>`).join('');
  // Applied by trusted code because inline styles are prohibited by the CSP.
  document.querySelectorAll('[data-chart-height]').forEach(node => { node.style.height = `${node.dataset.chartHeight}px`; });
}
function showSheet(html) { overlay.innerHTML = `<div class="overlay"><section class="sheet" role="dialog" aria-modal="true" aria-labelledby="editor-title">${html}</section></div>`; document.body.classList.add('modal-open'); }
function closeSheet() {
  if (busy) { toast('正在处理，请稍候。'); return; }
  if (!confirmResolve && editor?.kind === 'template') { showTemplateManager(); return; }
  if (confirmResolve) { const resolve = confirmResolve; confirmResolve = null; resolve(false); }
  if (editor?.kind === 'meal') { collectMeal(); saveDraft(); }
  editor = null; overlay.innerHTML = ''; document.body.classList.remove('modal-open'); render();
}
function confirmDialog(title, text, danger = false, noLabel = '取消', yesLabel = danger ? '确认' : '继续') {
  return new Promise(resolve => {
    confirmResolve = resolve;
    overlay.innerHTML = `<div class="overlay dialog-overlay"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><h2 id="confirm-title">${e(title)}</h2><p>${e(text)}</p><div class="button-row"><button class="secondary" data-action="confirm-no">${e(noLabel)}</button><button class="primary ${danger ? 'danger' : ''}" data-action="confirm-yes">${e(yesLabel)}</button></div></section></div>`;
    document.body.classList.add('modal-open');
  });
}
function finishConfirm(answer) { const resolve = confirmResolve; confirmResolve = null; overlay.innerHTML = ''; document.body.classList.remove('modal-open'); resolve?.(answer); }
function foodItem(food,index) { return `<div class="food-item" data-food-index="${index}"><div class="food-top"><input data-food="name" value="${e(food.name)}" maxlength="100" placeholder="食物名称，如：鸡蛋" aria-label="食物 ${index + 1} 名称"><button data-action="remove-food" data-index="${index}" aria-label="删除食物 ${index + 1}">${icon('close')}</button></div><div class="food-bottom"><input class="portion" data-food="portion" value="${e(food.portion)}" maxlength="100" placeholder="份量，如：2 个" aria-label="食物 ${index + 1} 份量"><input class="kcal" data-food="kcal" type="number" inputmode="decimal" min="0" max="20000" value="${food.kcal === null ? '' : e(food.kcal)}" placeholder="可留空" aria-label="食物 ${index + 1} 热量"><span>千卡</span></div></div>`; }
function openMealDetail(record) { editor = { kind: 'meal-detail', record }; showMealDetail(); }
function showMealDetail() {
  const record = editor.record, energy = mealEnergy(record);
  const status = record.analysisStatus === 'pending' ? '<p class="detail-status pending">AI 正在后台估算，完成后会自动更新。</p>'
    : record.analysisStatus === 'failed' ? `<p class="detail-status failed">${e(record.analysisError || '分析未完成，可以重新分析或手动填写。')}</p>` : '';
  const foods = record.foods.length ? `<div class="detail-foods"><h3>热量明细</h3>${record.foods.map(food => `<div class="detail-food"><span><strong>${e(food.name)}</strong>${food.portion ? `<small>${e(food.portion)}</small>` : ''}</span><span>${food.kcal === null ? '未知' : `约 ${Number(food.kcal).toLocaleString()} 千卡`}</span></div>`).join('')}</div>` : '';
  showSheet(`<header class="sheet-header"><div><h2 id="editor-title">${e(mealTitle(record))}</h2><p>${e(MEALS[record.meal]?.label || '饮食')} · ${e(displayDate(record.date))}</p></div><button class="sheet-close" data-action="close-sheet" aria-label="关闭饮食详情">${icon('close')}</button></header><div class="sheet-body detail-body">${record.photo ? `<img class="detail-photo" src="${e(photoUrl(record.photo))}" alt="餐食照片">` : ''}<div class="detail-energy"><span>这一餐约</span><strong>${record.analysisStatus === 'pending' ? '分析中' : energy.known ? energy.kcal.toLocaleString() : '—'}<small>${energy.known && record.analysisStatus !== 'pending' ? '千卡' : ''}</small></strong></div>${status}${record.description ? `<div class="detail-block"><h3>我的记录</h3><p>${e(record.description)}</p></div>` : ''}${foods}${record.assumptions ? `<div class="detail-block"><h3>估算说明</h3><p>${e(record.assumptions)}</p></div>` : ''}${record.note ? `<div class="detail-block"><h3>备注</h3><p>${e(record.note)}</p></div>` : ''}<div class="detail-actions">${record.description || record.photo ? `<button class="secondary" data-action="retry-meal" ${record.analysisStatus === 'pending' ? 'disabled' : ''}>${icon('spark','icon-sm')} 重新分析</button>` : ''}<button class="secondary" data-action="edit-meal" data-id="${e(record.id)}">编辑记录</button></div><div id="editor-error" class="error" role="alert"></div></div>`);
}
function openMeal(meal = 'breakfast', existing = null, restored = null) {
  const record = JSON.parse(JSON.stringify(restored || existing || { date: state.date, meal, description: '', foods: [], photo: '', note: '', source: 'manual', assumptions: '' }));
  editor = { kind: 'meal', record, original: existing ? JSON.parse(JSON.stringify(existing)) : null };
  renderMealEditor();
}
function renderMealEditor() {
  const record = editor.record;
  showSheet(`<header class="sheet-header"><div><h2 id="editor-title">${record.id ? '编辑饮食' : '记下一餐'}</h2><p>写下食物或拍照，保存后自动估算。</p></div><button class="sheet-close" data-action="close-sheet" aria-label="关闭饮食编辑">${icon('close')}</button></header><div class="sheet-body"><div class="meal-selector">${Object.entries(MEALS).map(([key,meal]) => `<button class="chip ${key === record.meal ? 'active' : ''}" data-action="meal-type" data-meal="${key}">${icon(meal.icon)}${meal.label}</button>`).join('')}</div><label class="field"><span class="field-label">记录日期</span><input id="meal-date" type="date" value="${e(record.date)}"></label><label class="field"><span class="field-label">这一餐吃了什么？</span><textarea id="meal-description" maxlength="3000" placeholder="例如：一碗泡面；或两个鸡蛋、一碗小米粥。">${e(record.description)}</textarea></label><div class="photo-actions"><button class="secondary" data-action="camera">${icon('camera','icon-sm')} 拍一张</button><button class="secondary" data-action="gallery">${icon('image','icon-sm')} 从相册选择</button></div>${record.photo ? `<div class="photo-preview"><img src="${e(photoUrl(record.photo))}" alt="本次餐食照片"><button data-action="remove-photo" aria-label="移除餐食照片">${icon('close')}</button></div>` : ''}<p class="form-note">有文字或照片就可以直接保存，AI 会在后台估算并更新热量。也可在下面手动填写，不走 AI。</p><div class="form-divider"></div><div class="foods-title"><h3>热量明细 <span class="sheet-sublabel">可选</span></h3><button data-action="add-food">${icon('plus','icon-sm')} 手动添加</button></div><div id="food-list">${record.foods.map(foodItem).join('')}</div>${record.assumptions ? `<p class="estimate-note">${e(record.assumptions)}</p>` : ''}<div id="review-total" class="review-total"></div><label class="field"><span class="field-label">备注 <span class="sheet-sublabel">可选</span></span><textarea id="meal-note" maxlength="2000" placeholder="口味、饱腹感，或想留给自己的话…">${e(record.note)}</textarea></label><div id="editor-error" class="error" role="alert"></div>${record.id ? '<button class="delete-record" data-action="delete-record">删除这条饮食记录</button>' : ''}</div><footer class="sheet-footer"><button class="primary" data-action="save-meal">${icon('check','icon-sm')} ${record.id ? '保存修改' : '保存这一餐'}</button></footer>`);
  updateReviewTotal();
}
function collectMeal() {
  if (!editor || editor.kind !== 'meal' || !document.querySelector('#meal-description')) return;
  const record = editor.record;
  record.date = document.querySelector('#meal-date').value;
  record.description = document.querySelector('#meal-description').value;
  record.note = document.querySelector('#meal-note').value;
  record.foods = [...document.querySelectorAll('.food-item')].map(node => ({ name: node.querySelector('[data-food=name]').value.trim(), portion: node.querySelector('[data-food=portion]').value.trim(), kcal: node.querySelector('[data-food=kcal]').value === '' ? null : Number(node.querySelector('[data-food=kcal]').value) }));
}
function updateReviewTotal() { const node = document.querySelector('#review-total'); if (!node || !editor) return; const energy = mealEnergy(editor.record); node.innerHTML = `<span>${energy.unknown ? '已填写的热量合计' : '这一餐的估算热量'}</span><strong>${energy.known ? energy.kcal.toLocaleString() : '—'}<small>千卡</small></strong>`; }
function saveDraft() { if (!editor || editor.kind !== 'meal') return; try { if (editor.record.description.trim() || editor.record.photo || editor.record.foods.length || editor.record.note.trim()) localStorage.setItem('mumu.draft', JSON.stringify(editor.record)); } catch { /* Record saving remains available if the draft cache is full. */ } }
function openWorkout(existing = null, type = 'cardio') {
  const record = JSON.parse(JSON.stringify(existing || emptyWorkout(type)));
  editor = { kind: 'workout', date: existing?.date || state.date, records: [record] };
  renderWorkoutEditor();
}
function emptyWorkout(type = 'cardio') { return { type, name: '', minutes: '', sets: '', reps: '', weight: null, note: '' }; }
function workoutTemplateChoices() {
  const templates = state.data.templates || [];
  return templates.length ? `<div class="template-intro"><h3>力量训练模板</h3><div class="template-choices">${templates.map(template => `<button class="template-choice" data-action="apply-template" data-id="${e(template.id)}">${icon('dumbbell')} ${e(template.name)}</button>`).join('')}</div><p>点选模板带入动作，本次的组数和重量仍可调整。</p></div>` : '';
}
function workoutEntry(record, index) {
  const strength = record.type === 'strength', suffix = index ? `-${index}` : '', entryLabel = editor.kind === 'template' ? '动作' : '运动';
  const fieldId = field => `workout-${field}${suffix}`;
  return `<article class="workout-entry" data-workout-index="${index}">
    <div class="workout-entry-head"><h3>${entryLabel} ${index + 1}</h3>${editor.records.length > 1 && !record.id ? `<button data-action="${editor.kind === 'template' ? 'remove-template-exercise' : 'remove-workout-entry'}" data-index="${index}" aria-label="移除${entryLabel} ${index + 1}">${icon('close','icon-sm')} 移除</button>` : ''}</div>
    ${editor.kind === 'template' ? '' : `<div class="type-selector"><button class="chip ${!strength ? 'active' : ''}" data-action="workout-type" data-index="${index}" data-type="cardio">${icon('run')} 有氧训练</button><button class="chip ${strength ? 'active' : ''}" data-action="workout-type" data-index="${index}" data-type="strength">${icon('dumbbell')} 力量训练</button></div>`}
    <label class="field"><span class="field-label">${strength ? '训练动作' : '运动名称'}</span><input id="${fieldId('name')}" data-workout-field="name" maxlength="100" value="${e(record.name)}" placeholder="${strength ? '例如：哑铃卧推' : '例如：跑步'}" aria-label="${entryLabel} ${index + 1} 名称"></label>
    <div class="quick-choices">${(strength ? ['深蹲','卧推','硬拉','引体向上','哑铃划船','推肩'] : ['跑步','快走','骑行','游泳','跳绳','椭圆机']).map(name => `<button class="quick-choice" data-action="workout-name" data-name="${name}">${name}</button>`).join('')}</div>
    ${strength ? `<div class="field-row"><label class="field"><span class="field-label">组数</span><input id="${fieldId('sets')}" data-workout-field="sets" type="number" inputmode="numeric" min="1" max="100" value="${e(record.sets)}" placeholder="例如：4" aria-label="${entryLabel} ${index + 1} 组数"></label><label class="field"><span class="field-label">每组次数</span><input id="${fieldId('reps')}" data-workout-field="reps" type="number" inputmode="numeric" min="1" max="1000" value="${e(record.reps)}" placeholder="例如：12" aria-label="${entryLabel} ${index + 1} 每组次数"></label></div><label class="field"><span class="field-label">重量 <span class="sheet-sublabel">kg · 可选</span></span><input id="${fieldId('weight')}" data-workout-field="weight" type="number" inputmode="decimal" min="0" max="2000" step="0.5" value="${record.weight === null ? '' : e(record.weight)}" placeholder="自重训练可留空" aria-label="${entryLabel} ${index + 1} 重量"><span class="field-hint">按你习惯的口径填写，例如单只哑铃重量。</span></label>` : `<label class="field"><span class="field-label">训练时长 <span class="sheet-sublabel">分钟</span></span><input id="${fieldId('minutes')}" data-workout-field="minutes" type="number" inputmode="decimal" min="1" max="1440" value="${e(record.minutes)}" placeholder="例如：30" aria-label="${entryLabel} ${index + 1} 时长"></label>`}
    <label class="field"><span class="field-label">备注 <span class="sheet-sublabel">可选</span></span><textarea id="${fieldId('note')}" data-workout-field="note" maxlength="2000" placeholder="距离、配速、每组变化，或今天的感受…" aria-label="${entryLabel} ${index + 1} 备注">${e(record.note)}</textarea></label>
  </article>`;
}
function renderWorkoutEditor() {
  const existing = Boolean(editor.records[0].id);
  showSheet(`<header class="sheet-header"><div><h2 id="editor-title">${existing ? '编辑训练' : '记下一次训练'}</h2><p>可以添加多个运动，只记录行动，不计算热量差。</p></div><button class="sheet-close" data-action="close-sheet" aria-label="关闭训练编辑">${icon('close')}</button></header><div class="sheet-body"><label class="field"><span class="field-label">记录日期</span><input id="workout-date" type="date" value="${e(editor.date)}"></label>${workoutTemplateChoices()}<div class="workout-entries">${editor.records.map(workoutEntry).join('')}</div><button class="secondary add-workout-entry" data-action="add-workout-entry">${icon('plus','icon-sm')} 添加运动</button><p class="form-note workout-save-note">共 ${editor.records.length} 项运动，保存后按原来的样式逐条显示。</p><div id="editor-error" class="error" role="alert"></div>${existing ? '<button class="delete-record" data-action="delete-record">删除这条训练记录</button>' : ''}</div><footer class="sheet-footer"><button class="primary" data-action="save-workout">${icon('check','icon-sm')} ${editor.records.length > 1 ? `保存 ${editor.records.length} 项运动` : '保存训练记录'}</button></footer>`);
}
function collectWorkout() {
  if (!editor || editor.kind !== 'workout' || !document.querySelector('#workout-date')) return;
  editor.date = document.querySelector('#workout-date').value;
  collectExerciseValues();
  editor.records.forEach(record => { record.date = editor.date; });
}
function collectExerciseValues() {
  document.querySelectorAll('.workout-entry').forEach(node => {
    const record = editor.records[Number(node.dataset.workoutIndex)];
    const value = field => node.querySelector(`[data-workout-field="${field}"]`).value;
    record.name = value('name').trim(); record.note = value('note');
    if (record.type === 'cardio') record.minutes = Number(value('minutes'));
    else { record.sets = Number(value('sets')); record.reps = Number(value('reps')); const weight = value('weight'); record.weight = weight === '' ? null : Number(weight); }
  });
}
function showTemplateManager() {
  editor = { kind: 'template-manager' };
  const templates = state.data.templates || [];
  showSheet(`<header class="sheet-header"><div><h2 id="editor-title">力量训练模板</h2><p>把常用的动作与重量，留给下一次训练。</p></div><button class="sheet-close" data-action="close-sheet" aria-label="关闭模板列表">${icon('close')}</button></header><div class="sheet-body"><div class="template-intro"><h3>按部位，整理你的训练</h3><p>模板可修改动作、组数、次数与重量。保存后，在记录训练时点选即可带入。预设重量留空，请按自己的习惯填写。</p></div>${templates.length ? `<div class="template-list">${templates.map(template => `<button class="settings-action" data-action="edit-template" data-id="${e(template.id)}">${icon('dumbbell')}<span class="template-body">${e(template.name)}<small>${template.exercises.length} 个动作 · ${e(template.exercises.map(exercise => exercise.name).join('、'))}</small></span>${icon('arrow','chevron')}</button>`).join('')}</div>` : '<p class="template-empty">还没有模板。可以先添加一个“练腿”或“练背”模板。</p>'}<button class="secondary add-workout-entry" data-action="add-template">${icon('plus','icon-sm')} 添加模板</button></div>`);
}
function openTemplate(existing = null) {
  const template = JSON.parse(JSON.stringify(existing || { name:'', exercises:[emptyWorkout('strength')] }));
  editor = { kind:'template', template, records:template.exercises };
  renderTemplateEditor();
}
function renderTemplateEditor() {
  const template = editor.template;
  showSheet(`<header class="sheet-header"><div><h2 id="editor-title">${template.id ? '编辑模板' : '新建模板'}</h2><p>设置你的常用力量训练动作。</p></div><button class="sheet-close" data-action="open-templates" aria-label="返回模板列表">${icon('left')}</button></header><div class="sheet-body"><label class="field"><span class="field-label">模板名称</span><input id="template-name" maxlength="100" value="${e(template.name)}" placeholder="例如：练腿、练背、上肢训练"></label><div class="workout-entries">${editor.records.map(workoutEntry).join('')}</div><button class="secondary add-workout-entry" data-action="add-template-exercise">${icon('plus','icon-sm')} 添加动作</button><p class="form-note workout-save-note">修改模板不会改变已经保存的训练记录。</p><div id="editor-error" class="error" role="alert"></div>${template.id ? '<button class="delete-record" data-action="delete-template">删除这个模板</button>' : ''}</div><footer class="sheet-footer"><button class="primary" data-action="save-template">${icon('check','icon-sm')} 保存模板</button></footer>`);
}
function collectTemplate() {
  if (editor?.kind !== 'template' || !document.querySelector('#template-name')) return;
  editor.template.name = document.querySelector('#template-name').value.trim();
  collectExerciseValues();
  editor.template.exercises = editor.records;
}
async function saveTemplate() {
  collectTemplate(); const error = validateTemplate(editor.template);
  if (error) return showError(error);
  lock(true); showError('');
  try { const template = await call('saveTemplate',editor.template); putRecord('templates',template); lock(false); showTemplateManager(); toast('模板已保存，可在记录训练时使用。'); }
  catch (error) { lock(false); showError(error.message); }
}
async function deleteTemplate() {
  collectTemplate(); const savedEditor = editor, id = editor.template.id;
  if (!await confirmDialog('删除这个模板？','只删除模板，已经保存的训练记录会保留。',true)) { editor = savedEditor; renderTemplateEditor(); return; }
  busy = true;
  try { await call('delete',{kind:'templates',id}); state.data.templates = state.data.templates.filter(template => template.id !== id); busy = false; showTemplateManager(); toast('模板已删除。'); }
  catch (error) { busy = false; editor = savedEditor; renderTemplateEditor(); showError(error.message); }
}
function applyWorkoutTemplate(id) {
  collectWorkout();
  const template = state.data.templates.find(item => item.id === id);
  if (!template) return showError('未找到模板，请重新打开训练记录。');
  const existing = editor.records.filter(record => record.id || record.name || record.note || record.minutes || record.sets || record.reps || record.weight !== null);
  if (existing.length + template.exercises.length > 30) return showError('一次最多添加 30 项运动，请先移除不需要的项。');
  editor.records = [...existing,...JSON.parse(JSON.stringify(template.exercises))];
  renderWorkoutEditor();
  document.querySelector(`[data-workout-index="${existing.length}"]`).scrollIntoView({block:'start'});
  toast(`已带入「${template.name}」的 ${template.exercises.length} 个动作。`);
}
function showError(message, settings = false) { const node = document.querySelector(settings ? '#settings-error' : '#editor-error'); if (node) { node.textContent = message; if (message) node.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } else toast(message); }
function lock(value) { busy = value; document.querySelectorAll(overlay.childElementCount ? '#overlay button, #overlay input, #overlay textarea' : '.settings-card button').forEach(node => { node.disabled = value; }); }
function putRecord(kind, record) {
  const index = state.data[kind].findIndex(item => item.id === record.id);
  if (index === -1) state.data[kind].push(record);
  else {
    const current = state.data[kind][index];
    if (kind === 'meals' && current.analysisToken === record.analysisToken &&
        ['done', 'failed'].includes(current.analysisStatus) && record.analysisStatus === 'pending') return;
    state.data[kind].splice(index, 1, record);
  }
}
function prepareMealForSave(record, original) {
  const changedInput = original && (record.description !== original.description || record.photo !== original.photo);
  const changedFoods = original && JSON.stringify(record.foods) !== JSON.stringify(original.foods);
  const shouldAnalyze = (record.description.trim() || record.photo) &&
    (!original && record.foods.length === 0 || changedInput && !changedFoods && (original.source === 'ai' || !original.foods.length));
  if (shouldAnalyze) {
    record.foods = []; record.assumptions = ''; record.analysisError = '';
    if (changedInput) record.title = '';
    record.analysisStatus = 'pending'; record.analysisToken = newToken();
  } else if (changedFoods || !original && record.foods.length) {
    record.analysisStatus = 'none'; record.analysisToken = ''; record.analysisError = '';
    record.source = 'manual';
  }
  return shouldAnalyze;
}
async function saveMeal() {
  collectMeal(); const error = validateMeal(editor.record);
  if (error || !editor.record.date) return showError(error || '请选择日期。');
  const latest = state.data.meals.find(item => item.id === editor.record.id);
  if (latest && editor.original && latest.analysisToken === editor.original.analysisToken &&
      latest.analysisStatus !== editor.original.analysisStatus &&
      JSON.stringify(editor.record.foods) === JSON.stringify(editor.original.foods)) {
    Object.assign(editor.record, { foods: latest.foods, title: latest.title, assumptions: latest.assumptions,
      source: latest.source, analysisStatus: latest.analysisStatus, analysisError: latest.analysisError });
    editor.original = latest;
  }
  const autoAnalyze = prepareMealForSave(editor.record, editor.original);
  lock(true); showError('');
  try { const record = await call('saveMeal',editor.record); putRecord('meals',record); localStorage.removeItem('mumu.draft'); editor = null; lock(false); closeSheet(); toast(autoAnalyze ? '已保存，AI 正在后台估算。' : '这一餐已保存。'); }
  catch (error) { showError(error.message); lock(false); }
}
async function retryMeal() {
  const record = JSON.parse(JSON.stringify(editor.record));
  if (!record.description.trim() && !record.photo) return showError('先补充文字或照片，才能重新分析。');
  record.foods = []; record.assumptions = ''; record.analysisStatus = 'pending';
  record.analysisToken = newToken(); record.analysisError = '';
  lock(true); showError('');
  try { const saved = await call('saveMeal', record); putRecord('meals', saved); editor.record = saved; lock(false); showMealDetail(); render(); toast('已开始重新分析。'); }
  catch (error) { lock(false); showError(error.message); }
}
async function saveWorkout() {
  collectWorkout();
  if (!editor.date) return showError('请选择日期。');
  for (let index = 0; index < editor.records.length; index++) {
    const error = validateWorkout(editor.records[index]);
    if (error) return showError(`运动 ${index + 1}：${error}`);
  }
  lock(true); showError('');
  try { const records = await call('saveWorkouts',{ records: editor.records }); records.forEach(record => putRecord('workouts',record)); editor = null; lock(false); closeSheet(); toast(records.length > 1 ? `${records.length} 项运动已保存。` : '训练记录已保存。'); }
  catch (error) { showError(error.message); lock(false); }
}
async function pickPhoto(camera) { collectMeal(); lock(true); showError(''); try { const result = await call('photo',{ camera }); if (result) { editor.record.photo = result.name; saveDraft(); } lock(false); renderMealEditor(); } catch (error) { lock(false); showError(error.message); } }
function settingsInput() { return { baseUrl: document.querySelector('#base-url').value.trim(), apiKey: document.querySelector('#api-key').value.trim(), textModel: document.querySelector('#text-model').value.trim(), visionModel: document.querySelector('#vision-model').value.trim() }; }
async function saveSettings(test = false) {
  const input = settingsInput();
  try { const uri = new URL(input.baseUrl); if (uri.protocol !== 'https:' || uri.username || uri.password || uri.hash || uri.search) throw new Error(); } catch { return showError('请填写不含密钥、参数的 HTTPS 服务地址。',true); }
  if (!input.textModel || !input.visionModel) return showError('请填写文字与图片模型名称。',true);
  if (state.settings.hasKey && input.baseUrl.replace(/\/+$/,'') !== state.settings.baseUrl.replace(/\/+$/,'') && !input.apiKey) return showError('更换服务地址时，请同时填写对应的新密钥。',true);
  lock(true); showError('',true);
  try { state.settings = await call('settings',input); document.querySelector('#api-key').value = ''; if (test) { const result = await call('testAi'); toast(result.message); } else toast(state.native ? 'AI 设置已保存。' : '预览设置已更新；真实 AI 请在安卓 APP 中配置。'); lock(false); render(); }
  catch (error) { lock(false); showError(error.message,true); }
}
async function deleteRecord() {
  const savedEditor = editor; if (editor.kind === 'meal') collectMeal(); else collectWorkout();
  const kind = editor.kind === 'meal' ? 'meals' : 'workouts';
  const id = kind === 'meals' ? savedEditor.record.id : savedEditor.records[0].id;
  if (!await confirmDialog('删除这条记录？','删除后无法在 APP 中撤销。',true)) { editor = savedEditor; editor.kind === 'meal' ? renderMealEditor() : renderWorkoutEditor(); return; }
  busy = true;
  try { await call('delete',{ kind,id }); state.data[kind] = state.data[kind].filter(record => record.id !== id); if (kind === 'meals') localStorage.removeItem('mumu.draft'); editor = null; busy = false; render(); toast('记录已删除。'); }
  catch (error) { busy = false; editor = savedEditor; editor.kind === 'meal' ? renderMealEditor() : renderWorkoutEditor(); showError(error.message); }
}
async function importBackup() {
  busy = true;
  try { const info = await call('import'); busy = false; if (!info) return; const answer = await confirmDialog('恢复这份备份？',`备份包含 ${info.meals} 条饮食、${info.workouts} 条训练记录。\n恢复会替换当前记录，建议先导出当前数据。API Key 保持原样。`,true); if (!answer) return; busy = true; state.data = await call('restore'); localStorage.removeItem('mumu.draft'); busy = false; render(); toast('备份已恢复。'); }
  catch (error) { busy = false; toast(error.message); }
}
async function action(name, node) {
  if (busy) return;
  switch (name) {
    case 'navigate': state.page = node.dataset.page; state.settingsView = 'root'; if (state.page === 'history') state.date = localDate(); render(); window.scrollTo(0,0); break;
    case 'open-general': case 'open-appearance': case 'open-ai': case 'open-updates':
      state.settingsView = name.slice(5); render(); window.scrollTo(0,0); break;
    case 'settings-back': state.settingsView = 'root'; render(); window.scrollTo(0,0); break;
    case 'choose-theme': await saveAppearance(node.dataset.themeId); break;
    case 'add-meal': openMeal(node.dataset.meal); break;
    case 'view-meal': openMealDetail(state.data.meals.find(record => record.id === node.dataset.id)); break;
    case 'edit-meal': openMeal('',state.data.meals.find(record => record.id === node.dataset.id)); break;
    case 'retry-meal': await retryMeal(); break;
    case 'resume-draft': { try { const draft = JSON.parse(localStorage.getItem('mumu.draft')); if (draft) openMeal(draft.meal,null,draft); } catch { localStorage.removeItem('mumu.draft'); render(); toast('草稿无法读取，请重新添加。'); } break; }
    case 'close-sheet': closeSheet(); break;
    case 'meal-type': collectMeal(); editor.record.meal = node.dataset.meal; saveDraft(); renderMealEditor(); break;
    case 'add-food': collectMeal(); if (editor.record.foods.length >= 30) return showError('最多添加 30 种食物。'); editor.record.foods.push({ name:'',portion:'',kcal:null }); renderMealEditor(); document.querySelector('.food-item:last-child input').focus(); break;
    case 'remove-food': collectMeal(); editor.record.foods.splice(Number(node.dataset.index),1); saveDraft(); renderMealEditor(); break;
    case 'camera': await pickPhoto(true); break;
    case 'gallery': await pickPhoto(false); break;
    case 'remove-photo': collectMeal(); editor.record.photo = ''; saveDraft(); renderMealEditor(); break;
    case 'save-meal': await saveMeal(); break;
    case 'add-workout': openWorkout(); break;
    case 'edit-workout': openWorkout(state.data.workouts.find(record => record.id === node.dataset.id)); break;
    case 'workout-type': {
      collectWorkout(); const index = Number(node.dataset.index), record = editor.records[index]; record.type = node.dataset.type; renderWorkoutEditor(); document.querySelector(`[data-workout-index="${index}"]`).scrollIntoView({ block:'start' }); break;
    }
    case 'workout-name': node.closest('.workout-entry').querySelector('[data-workout-field="name"]').value = node.dataset.name; break;
    case 'add-workout-entry': {
      collectWorkout(); if (editor.records.length >= 30) return showError('一次最多添加 30 项运动。'); editor.records.push(emptyWorkout(editor.records[editor.records.length - 1].type)); renderWorkoutEditor(); document.querySelector('.workout-entry:last-child').scrollIntoView({ block:'start' }); break;
    }
    case 'remove-workout-entry': collectWorkout(); editor.records.splice(Number(node.dataset.index),1); renderWorkoutEditor(); break;
    case 'save-workout': await saveWorkout(); break;
    case 'open-templates': showTemplateManager(); break;
    case 'edit-template': openTemplate(state.data.templates.find(template => template.id === node.dataset.id)); break;
    case 'add-template': openTemplate(); break;
    case 'add-template-exercise': collectTemplate(); if (editor.records.length >= 30) return showError('每个模板最多添加 30 个动作。'); editor.records.push(emptyWorkout('strength')); renderTemplateEditor(); document.querySelector('.workout-entry:last-child').scrollIntoView({block:'start'}); break;
    case 'remove-template-exercise': collectTemplate(); editor.records.splice(Number(node.dataset.index),1); renderTemplateEditor(); break;
    case 'save-template': await saveTemplate(); break;
    case 'delete-template': await deleteTemplate(); break;
    case 'apply-template': applyWorkoutTemplate(node.dataset.id); break;
    case 'delete-record': await deleteRecord(); break;
    case 'confirm-yes': finishConfirm(true); break;
    case 'confirm-no': finishConfirm(false); break;
    case 'shift-week': state.date = shiftDate(state.date,Number(node.dataset.offset) * 7); render(); break;
    case 'choose-date': state.date = node.dataset.date; render(); break;
    case 'toggle-key': { const key = document.querySelector('#api-key'); key.type = key.type === 'password' ? 'text' : 'password'; break; }
    case 'save-settings': await saveSettings(); break;
    case 'test-ai': await saveSettings(true); break;
    case 'clear-key': if (await confirmDialog('清除已保存的密钥？','清除后可以继续手动记录，AI 估算需要重新填写密钥。',true)) { try { state.settings = await call('settings',{ ...state.settings,clearKey:true }); render(); toast('密钥已清除。'); } catch (error) { toast(error.message); } } break;
    case 'export': { busy = true; try { const result = await call('export'); if (result) toast('备份已导出，包含记录与照片。'); } catch (error) { toast(error.message); } finally { busy = false; } break; }
    case 'import': await importBackup(); break;
    case 'help': try { await call('openHelp'); } catch (error) { toast(error.message); } break;
    case 'check-update': await checkUpdate(true); break;
    case 'install-update': await installUpdate(); break;
  }
}
document.addEventListener('click', event => { const node = event.target.closest('[data-action]'); if (node) { event.preventDefault(); action(node.dataset.action,node).catch(error => { busy = false; toast(error.message || '操作失败，请重试。'); }); } else if (event.target.classList.contains('overlay') && !confirmResolve) closeSheet(); });
document.addEventListener('input', event => { if (editor?.kind === 'meal') { collectMeal(); updateReviewTotal(); saveDraft(); } });
document.addEventListener('change', event => { if (event.target.id === 'history-date' && event.target.value) { state.date = event.target.value; render(); } });
window.handleBack = () => { if (busy) { toast('正在处理，请稍候。'); return true; } if (overlay.childElementCount) { closeSheet(); return true; } if (state.page === 'settings' && state.settingsView !== 'root') { state.settingsView = 'root'; render(); window.scrollTo(0,0); return true; } if (state.page !== 'today') { state.page = 'today'; render(); return true; } return false; };
(async function init() {
  try { const initial = await call('init'); Object.assign(state,initial); render(); if (state.native) checkUpdate(); }
  catch (error) { main.innerHTML = `<div class="fatal"><h2>暂时无法读取记录</h2><p>${e(error.message)}<br>请关闭后重新打开 APP。已有文件不会被自动清空。</p></div>`; }
})();
