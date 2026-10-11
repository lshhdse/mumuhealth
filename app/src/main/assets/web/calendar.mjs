import { monthGrid, monthSummary, escapeHtml as e } from './domain.mjs';
import { periodSummary } from './periods.mjs';
import { renderPeriodCard } from './periods-ui.mjs';

const number = value => value === null ? '—' : value.toLocaleString('zh-CN');
const dayNumber = date => Number(date.slice(-2));
const iconsForDay = (day, icon) => `<span class="month-day-icons" aria-hidden="true">${day.meals.length ? `<span class="day-food">${icon('meal')}</span>` : ''}${day.cardioCount ? `<span class="day-cardio">${icon('run')}</span>` : ''}${day.strengthCount ? icon('dumbbell') : ''}</span>`;
function dayLabel(day, period = false) {
  const details = [];
  if (day.meals.length) details.push(`饮食 ${day.mealCount} 餐`);
  if (day.knownCount) details.push(`已知热量 ${day.kcal} 千卡`);
  if (day.pendingCount) details.push(`${day.pendingCount} 餐分析中`);
  if (day.incompleteMealCount) details.push('部分热量待补充');
  if (day.cardioCount) details.push(`有氧 ${day.cardioMinutes} 分钟`);
  if (day.strengthCount) details.push(`力量 ${day.strengthSets} 组`);
  if (period) details.push('已记录经期');
  return `${day.date}，${details.join('，') || '暂无记录'}，查看当天记录`;
}
export function renderMonthStatistics(data, month, today, metric, icon, female = false) {
  const summary = monthSummary(data, month), days = new Map(summary.days.map(day => [day.date, day]));
  const periodDays = new Set(female ? periodSummary(data.periods || [],month,today).days : []);
  const recordedDays = summary.days.filter(day => day.meals.length || day.workouts.length || periodDays.has(day.date)).length;
  const [year, monthNumber] = month.split('-');
  // Adjacent-month dates are visible and lead to their own daily record view.
  const grid = monthGrid(month);
  const ringLength = 2 * Math.PI * 24, ringProgress = ringLength * recordedDays / summary.dayCount;
  const tiles = [
    ['meal','饮食记录',summary.mealDays,'天',`${summary.mealCount} 个餐次`],
    ['dumbbell','训练记录',summary.trainingDays,'天',`${summary.workoutCount} 项运动`],
    ['spark','记录日均热量',summary.averageKcal,'千卡',`${summary.energyDays} 天有已知热量`],
    ['sun','已知热量合计',summary.energyDays ? summary.totalKcal : null,'千卡','汇总已填写的饮食热量'],
    ['run','有氧时长',summary.cardioMinutes,'分钟','按实际记录累计'],
    ['layers','力量组数',summary.strengthSets,'组','按全部力量动作累计']
  ];
  const empty = recordedDays ? '' : `<div class="month-empty">${icon('calendar')}<strong>这个月还没有记录</strong><p>点选下方日期，记下一餐或一次训练。</p></div>`;
  return `<section id="month-statistics" class="month-statistics" aria-label="月统计">
    <div class="month-heading"><span class="month-heading-icon">${icon('calendar')}</span><div><h2>${year} 年 ${Number(monthNumber)} 月</h2><p>这个月的饮食与行动</p></div><label class="month-picker" aria-label="选择统计月份">${icon('calendar')}<input id="statistics-month" type="month" value="${month}" aria-label="选择统计月份"></label></div>
    <div class="month-pager"><button data-action="shift-month" data-offset="-1" aria-label="上一月">${icon('left')}</button><button data-action="current-month">回到本月</button><button data-action="shift-month" data-offset="1" aria-label="下一月">${icon('arrow')}</button></div>
    <section class="month-footprint"><div class="record-ring"><svg viewBox="0 0 64 64" aria-hidden="true"><circle class="ring-track" cx="32" cy="32" r="24"/><circle class="ring-progress" cx="32" cy="32" r="24" stroke-dasharray="${ringProgress} ${ringLength}"/></svg><strong>${recordedDays}<small>天</small></strong></div><div><p class="eyebrow">本月记录足迹</p><h3>${recordedDays ? '把日常，慢慢积累起来' : '从一次小小的记录开始'}</h3><p>已记录 ${recordedDays} / ${summary.dayCount} 天</p></div></section>
    ${female ? renderPeriodCard(data.periods || [],month,today,icon) : ''}
    <section class="month-calendar-card"><div class="month-section-title"><h3>整月一览</h3><span>点击日期查看记录</span></div><div class="month-legend"><span class="day-food">${icon('meal')} 饮食</span><span class="day-cardio">${icon('run')} 有氧</span><span>${icon('dumbbell')} 力量</span>${female ? `<span class="period-legend">${icon('droplet')} 经期</span>` : ''}</div>${empty}<div class="month-weekdays" aria-hidden="true">${['一','二','三','四','五','六','日'].map(day => `<span>${day}</span>`).join('')}</div><div class="month-grid">${grid.map(date => {
      const day = days.get(date), inMonth = !!day, hasRecord = day && (day.meals.length || day.workouts.length);
      const badge = day?.knownCount ? number(day.kcal) : day?.meals.length ? day.pendingCount ? '分析中' : '待补充' : '';
      return `<button class="month-day ${inMonth ? '' : 'outside-month'} ${hasRecord ? 'recorded' : ''} ${periodDays.has(date) ? 'has-period' : ''} ${date === today ? 'is-today' : ''}" data-action="choose-month-date" data-date="${date}" aria-label="${e(day ? dayLabel(day,periodDays.has(date)) : `${date}，查看当天记录`)}" ${date === today ? 'aria-current="date"' : ''}><span class="month-day-number">${dayNumber(date)}</span>${day ? iconsForDay(day,icon) : '<span class="month-day-icons"></span>'}<small class="month-day-energy ${day?.pendingCount || day?.incompleteMealCount ? 'incomplete' : ''}">${badge}</small></button>`;
    }).join('')}</div><p class="month-calendar-note">数字为已知饮食热量（千卡）；虚线标记表示热量尚未完整。</p></section>
    <div class="month-section-title month-summary-title"><h3>本月汇总</h3><span>按实际记录累计</span></div><div class="month-metrics">${tiles.map(([symbol,title,value,unit,detail]) => `<article class="month-metric"><span class="month-metric-label">${icon(symbol)}${title}</span><strong>${number(value)}<small>${unit}</small></strong><p>${detail}</p></article>`).join('')}</div>
    ${renderMonthChart(summary, metric)}
    <p class="month-data-note">记录日均热量按 ${summary.energyDays} 个有已知热量的日期计算。${summary.incompleteMealCount ? `另有 ${summary.incompleteMealCount} 条饮食记录热量待补充。` : ''}${summary.pendingCount ? `${summary.pendingCount} 条记录分析中，完成后自动更新。` : ''}未记录的日期不计入均值。</p>
  </section>`;
}
function renderMonthChart(summary, metric) {
  const types = { energy:{label:'饮食热量',unit:'千卡',value:day => day.knownCount ? day.kcal : null}, cardio:{label:'有氧时长',unit:'分钟',value:day => day.cardioCount ? day.cardioMinutes : null}, strength:{label:'力量组数',unit:'组',value:day => day.strengthCount ? day.strengthSets : null} };
  const type = types[metric] || types.energy, values = summary.days.map(type.value), maximum = Math.max(1,...values.filter(value => value !== null));
  const width = 280 / values.length;
  const bars = values.map((value,index) => {
    const height = value === null ? 1 : Math.max(2, value / maximum * 85);
    return `<rect class="month-trend-bar ${value === null ? 'missing' : ''}" x="${15 + index * width + 1}" y="${100-height}" width="${Math.max(2,width-3)}" height="${height}" rx="2"><title>${summary.days[index].date}：${value === null ? '未记录' : `${number(value)} ${type.unit}`}</title></rect>`;
  }).join('');
  const ticks = [1,8,15,22,summary.dayCount];
  return `<section class="month-trend-card"><div class="month-section-title"><h3>本月趋势</h3><span>${type.unit}</span></div><div class="month-chart-tabs" role="group" aria-label="趋势指标">${Object.entries(types).map(([key,option])=>`<button data-action="month-metric" data-metric="${key}" aria-pressed="${metric === key}">${option.label}</button>`).join('')}</div><div class="month-chart-caption"><span>每日 ${type.label}</span><span>最高 ${values.some(value=>value!==null) ? number(Math.max(...values.filter(value=>value!==null))) : '—'} ${type.unit}</span></div><svg class="month-trend" viewBox="0 0 310 125" role="img" aria-label="${e(`${summary.month} ${type.label}趋势图，${values.some(value=>value!==null) ? '按每天的已记录数值绘制' : '暂无记录'}`)}"><path class="month-chart-grid" d="M15 15H295M15 57H295M15 100H295"/>${bars}${ticks.map(day=>`<text x="${15+(day-.5)*width}" y="119" text-anchor="middle">${day}</text>`).join('')}</svg><p class="month-chart-note">图表展示已记录的数值，空缺日期显示为灰色短线。</p></section>`;
}
