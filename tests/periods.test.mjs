import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePeriod, periodSummary, periodDayCount } from '../app/src/main/assets/web/periods.mjs';
import { monthSummary } from '../app/src/main/assets/web/domain.mjs';
const today = '2026-10-11';
const period = {id:'first',startDate:'2026-09-29',endDate:'2026-10-03',note:''};
test('经期按包含首尾的实际日期计算，跨月只计当月日期',()=>{
  assert.equal(periodDayCount(period,today),5);
  assert.deepEqual(periodSummary([period],'2026-09',today).days,['2026-09-29','2026-09-30']);
  assert.equal(periodSummary([period],'2026-10',today).dayCount,3);
  assert.equal(periodSummary([period],'2026-11',today).records.length,0);
});
test('进行中的经期截至今天，未来月份不生成日期',()=>{
  const ongoing={...period,startDate:'2026-10-09',endDate:''};
  assert.equal(periodDayCount(ongoing,today),3);
  assert.deepEqual(periodSummary([ongoing],'2026-10',today).days,['2026-10-09','2026-10-10','2026-10-11']);
  assert.equal(periodSummary([ongoing],'2026-11',today).dayCount,0);
});
test('跨年、闰日及单日经期正确计数',()=>{
  assert.equal(periodDayCount({...period,startDate:'2024-02-28',endDate:'2024-03-01'},today),3);
  assert.equal(periodSummary([{...period,startDate:'2025-12-30',endDate:'2026-01-02'}],'2026-01',today).dayCount,2);
  assert.equal(periodDayCount({...period,startDate:today,endDate:today},today),1);
});
test('拒绝不存在的日期、倒序、未来日期与过长备注',()=>{
  for(const changed of [{startDate:''},{startDate:'2026-02-30'},{startDate:'2026-10-12'},{endDate:'2026-09-28'},{endDate:'2026-10-12'},{endDate:'2026-09-31'},{note:'a'.repeat(2001)}])
    assert.ok(validatePeriod({...period,...changed},[],today));
  assert.equal(validatePeriod({...period,endDate:''},[],today),'');
});
test('重叠及第二条未结束经期被拒绝；自身编辑与相邻记录允许',()=>{
  assert.ok(validatePeriod({...period,id:'second',startDate:'2026-10-03',endDate:'2026-10-04'},[period],today));
  assert.ok(validatePeriod({startDate:'2026-10-02',endDate:'2026-10-04',note:''},[{...period,id:undefined}],today));
  assert.equal(validatePeriod({...period,endDate:'2026-10-04'},[period],today),'');
  assert.equal(validatePeriod({...period,id:'second',startDate:'2026-10-04',endDate:'2026-10-04'},[period],today),'');
  assert.ok(validatePeriod({...period,id:'second',startDate:'2026-10-09',endDate:''},[{...period,endDate:''}],today));
});
test('按日期去重，经期记录不改变饮食与训练统计',()=>{
  const records=[period,{...period,id:'second',startDate:'2026-10-02',endDate:'2026-10-03'}];
  assert.equal(periodSummary(records,'2026-10',today).dayCount,3);
  const data={meals:[],workouts:[]};
  assert.deepEqual(monthSummary({...data,periods:records},'2026-10'),monthSummary(data,'2026-10'));
  assert.equal(periodSummary(undefined,'2026-10',today).dayCount,0);
});
