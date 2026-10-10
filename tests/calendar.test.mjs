import test from 'node:test';
import assert from 'node:assert/strict';
import { monthDates, monthGrid, shiftMonth, monthSummary } from '../app/src/main/assets/web/domain.mjs';
import { renderMonthStatistics } from '../app/src/main/assets/web/calendar.mjs';

const meal=(date,slot,kcal)=>({date,meal:slot,foods:[{name:'食物',kcal}],description:'',note:''});
test('月份切换以月份为单位，跨年和二月不跳月',()=>{
  assert.equal(shiftMonth('2026-12',1),'2027-01'); assert.equal(shiftMonth('2027-01',-1),'2026-12');
  assert.equal(shiftMonth('2024-01',1),'2024-02'); assert.equal(shiftMonth('2024-02',1),'2024-03');
});
test('每个月生成真实天数，正确处理闰年',()=>{
  assert.equal(monthDates('2024-02').length,29); assert.equal(monthDates('2025-02').length,28);
  assert.equal(monthDates('2026-04').length,30); assert.equal(monthDates('2026-10').length,31);
  assert.equal(monthDates('2024-02').at(-1),'2024-02-29');
});
test('月历按周一开头、周日结尾，覆盖跨年和六行月份',()=>{
  for (const month of ['2026-10','2027-01','2024-02','2026-03']) {
    const grid=monthGrid(month); assert.equal(new Date(grid[0]+'T12:00:00').getDay(),1);
    assert.equal(new Date(grid.at(-1)+'T12:00:00').getDay(),0); assert.equal(grid.length%7,0);
    assert.deepEqual(grid.filter(date=>date.startsWith(month)),monthDates(month));
  }
  assert.equal(monthGrid('2026-03').length,42); assert.equal(monthGrid('2027-01')[0],'2026-12-28');
});
test('月统计按天和餐次去重，力量按动作累加组数，排除其他月份',()=>{
  const data={meals:[meal('2026-10-01','breakfast',100),meal('2026-10-01','breakfast',50),meal('2026-10-01','lunch',null),meal('2026-10-03','dinner',300),meal('2026-09-30','dinner',999)],
    workouts:[{date:'2026-10-01',type:'strength',sets:5},{date:'2026-10-01',type:'strength',sets:5},{date:'2026-10-02',type:'cardio',minutes:30},{date:'2026-10-02',type:'cardio',minutes:12.5},{date:'2026-11-01',type:'strength',sets:100}]};
  const summary=monthSummary(data,'2026-10');
  assert.equal(summary.recordedDays,3); assert.equal(summary.mealDays,2); assert.equal(summary.trainingDays,2);
  assert.equal(summary.mealCount,3); assert.equal(summary.mealRecordCount,4); assert.equal(summary.workoutCount,4);
  assert.equal(summary.totalKcal,450); assert.equal(summary.energyDays,2); assert.equal(summary.averageKcal,225);
  assert.equal(summary.cardioMinutes,42.5); assert.equal(summary.strengthSets,10);
  assert.equal(summary.unknownCount,1); assert.equal(summary.incompleteMealCount,1);
  assert.equal(summary.days[0].strengthCount,2); assert.equal(summary.days[1].cardioCount,2);
});
test('未记录和待分析日不拉低均值，明确的零热量纳入均值',()=>{
  const pending={...meal('2026-10-04','lunch',null),foods:[],analysisStatus:'pending'};
  const data={meals:[meal('2026-10-01','breakfast',400),meal('2026-10-02','lunch',0),meal('2026-10-03','dinner',null),pending],workouts:[]};
  const before=JSON.stringify(data), summary=monthSummary(data,'2026-10');
  assert.equal(summary.mealDays,4); assert.equal(summary.energyDays,2); assert.equal(summary.averageKcal,200);
  assert.equal(summary.incompleteMealCount,2); assert.equal(summary.pendingCount,1); assert.equal(JSON.stringify(data),before);
});
test('后台分析完成后重新汇总，月统计自动纳入新热量',()=>{
  const data={meals:[{...meal('2026-10-04','lunch',null),foods:[],analysisStatus:'pending'}],workouts:[]};
  assert.equal(monthSummary(data,'2026-10').averageKcal,null);
  data.meals[0].foods=[{name:'面',kcal:400},{name:'鸡蛋',kcal:80}]; data.meals[0].analysisStatus='done';
  const after=monthSummary(data,'2026-10'); assert.equal(after.averageKcal,480); assert.equal(after.pendingCount,0); assert.equal(after.incompleteMealCount,0);
});
test('空月份没有虚构热量、训练数据或状态分数',()=>{
  const summary=monthSummary({meals:[],workouts:[]},'2026-10');
  assert.equal(summary.averageKcal,null); assert.equal(summary.recordedDays,0); assert.equal(summary.totalKcal,0);
  assert.equal(summary.strengthSets,0); assert.equal(summary.cardioMinutes,0);
  const html=renderMonthStatistics({meals:[],workouts:[]},'2026-10','2026-10-10','energy',()=> '');
  assert.match(html,/这个月还没有记录/); assert.match(html,/暂无记录/); assert.match(html,/未记录的日期不计入均值/);
  assert.doesNotMatch(html,/准备度|CTL|ATL|TSS|热量差/);
});
