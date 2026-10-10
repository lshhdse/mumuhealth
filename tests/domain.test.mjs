import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { daySummary, mealEnergy, validateMeal, validateWorkout, validateTemplate, upgradeTemplateDefaults, shiftDate, weekDates, localDate, escapeHtml } from '../app/src/main/assets/web/domain.mjs';
const defaults = JSON.parse(readFileSync(new URL('../app/src/main/assets/web/workout-templates.json',import.meta.url),'utf8'));
const legacy = JSON.parse(readFileSync(new URL('../app/src/main/assets/web/workout-templates-legacy.json',import.meta.url),'utf8'));
const meal = { date:'2026-10-08', meal:'breakfast', foods:[{name:'鸡蛋',portion:'2 个',kcal:150},{name:'粥',portion:'1 碗',kcal:null}], description:'', note:'' };
test('未知热量不记作零，也不丢失已知热量',()=>{ const summary=daySummary({meals:[meal],workouts:[]},meal.date); assert.equal(summary.kcal,150); assert.equal(summary.unknownCount,1); assert.equal(summary.knownCount,1); assert.deepEqual(mealEnergy(meal),{kcal:150,unknown:true,known:true}); });
test('多条早餐仅计为一个餐次；不同日期互不影响',()=>{ const data={meals:[meal,{...meal,id:'second'},{...meal,date:'2026-10-07',meal:'dinner'}],workouts:[{date:meal.date,type:'cardio',minutes:30}]}; const summary=daySummary(data,meal.date); assert.equal(summary.mealCount,1); assert.equal(summary.kcal,300); assert.equal(summary.cardioMinutes,30); });
test('明确填写的0与完全未知有区别',()=>{ assert.equal(mealEnergy({...meal,foods:[{name:'水',kcal:0}]}).known,true); assert.equal(mealEnergy({...meal,foods:[{name:'食物',kcal:null}]}).known,false); });
test('饮食拒绝空名称、负热量与无限数，允许未知热量',()=>{ assert.equal(validateMeal(meal),''); assert.ok(validateMeal({...meal,foods:[{name:'',portion:'',kcal:1}]})); assert.ok(validateMeal({...meal,foods:[{name:'鸡蛋',portion:'',kcal:-1}]})); assert.ok(validateMeal({...meal,foods:[{name:'鸡蛋',portion:'',kcal:Infinity}]})); });
test('只有文字或照片也能立即保存，等待后台估算',()=>{ assert.equal(validateMeal({...meal,foods:[],description:'一碗泡面'}),''); assert.equal(validateMeal({...meal,foods:[],photo:'photo.jpg'}),''); assert.ok(validateMeal({...meal,foods:[],description:'',photo:''})); assert.equal(daySummary({meals:[{...meal,foods:[],analysisStatus:'pending'}],workouts:[]},meal.date).pendingCount,1); });
test('训练要求有效时长和整数次数，自重可不填重量',()=>{ assert.equal(validateWorkout({type:'strength',name:'深蹲',sets:4,reps:12,weight:null,note:''}),''); assert.ok(validateWorkout({type:'strength',name:'深蹲',sets:1.5,reps:12,weight:0,note:''})); assert.ok(validateWorkout({type:'cardio',name:'跑步',minutes:0,note:''})); assert.equal(validateWorkout({type:'cardio',name:'跑步',minutes:30,note:''}),''); });
test('日期在跨月和跨年时正确前后移动',()=>{ assert.equal(shiftDate('2026-01-01',-1),'2025-12-31'); assert.equal(shiftDate('2024-02-28',1),'2024-02-29'); assert.equal(localDate(new Date(2026,9,8)),'2026-10-08'); });
test('历史按周一至周日显示，同周选择日期不改变日期栏',()=>{ const expected=['2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-10','2026-10-11']; for (const date of expected) assert.deepEqual(weekDates(date),expected); });
test('整周切换跨年仍保留所选星期',()=>{ assert.deepEqual(weekDates('2027-01-01'),['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']); assert.equal(shiftDate('2026-12-25',7),'2027-01-01'); assert.equal(weekDates(shiftDate('2026-12-25',7))[4],'2027-01-01'); });
test('用户文字以纯文本显示',()=>{ assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'); });
test('五个默认部位及动作按用户指定顺序排列，重量留空',()=>{
  assert.deepEqual(defaults.map(template=>[template.name,...template.exercises.map(exercise=>exercise.name)]),[
    ['背','反手高位下拉','坐姿绳索划船','中距离对握高位下拉','中距离对握开肘划船'],
    ['胸','飞鸟机夹下胸','史密斯上斜推胸','坐姿夹胸','哑铃推胸'],
    ['肩','坐姿史密斯推肩','侧平举','绳索面拉','哑铃前平举'],
    ['臀','保加利亚蹲','罗马尼亚硬拉','龙门架旋转','髋外展髋内收'],
    ['腿','保加利亚蹲','罗马尼亚硬拉','坐姿腿屈伸','单腿哈克深蹲']
  ]);
  for (const template of defaults) { assert.equal(validateTemplate(template),''); assert.ok(template.exercises.every(exercise=>exercise.weight===null && exercise.sets===5 && exercise.reps===12)); }
});
test('模板拒绝空名称、没有动作与无效组数',()=>{ const valid={name:'练背',exercises:[{type:'strength',name:'划船',sets:4,reps:10,weight:12.5,note:''}]}; assert.equal(validateTemplate(valid),''); assert.ok(validateTemplate({...valid,name:''})); assert.ok(validateTemplate({...valid,exercises:[]})); assert.match(validateTemplate({...valid,exercises:[{...valid.exercises[0],sets:1.5}]}),/^动作 1/); });
test('首次加载播种五组且不修改传入的记录',()=>{
  const source={version:1,meals:[meal],workouts:[{id:'saved-workout',name:'深蹲'}]};
  const upgraded=upgradeTemplateDefaults(source,defaults,legacy,()=>assert.fail('无需生成新编号'));
  assert.deepEqual(upgraded.templates,defaults); assert.equal(upgraded.templateDefaultsVersion,2);
  assert.deepEqual(upgraded.meals,source.meals); assert.deepEqual(upgraded.workouts,source.workouts); assert.equal(source.templates,undefined);
  upgraded.templates[0].exercises[0].weight=20; assert.equal(defaults[0].exercises[0].weight,null);
});
test('未编辑的旧默认模板被替换，保存时间和字段顺序不产生副本',()=>{
  const source={version:1,meals:[],workouts:[],templates:structuredClone(legacy)};
  for (const template of source.templates) { template.updatedAt=123; for (const exercise of template.exercises) { delete exercise.weight; delete exercise.note; } }
  const upgraded=upgradeTemplateDefaults(source,defaults,legacy,()=>assert.fail('未编辑模板不应生成新编号'));
  assert.deepEqual(upgraded.templates,defaults); assert.equal(source.templates[0].name,'练腿');
});
test('旧默认模板的动作、重量、组数或备注编辑保留为独立模板，自建模板保留原编号',()=>{
  for (const [field,value] of [['name','新动作'],['sets',4],['reps',10],['weight',25],['note','固定握距']]) {
    const previous=structuredClone(legacy); const edited=previous.find(template=>template.id==='default-back'); edited.exercises[0][field]=value;
    const custom={...structuredClone(legacy[0]),id:'my-template',name:'我的腿部'};
    const source={version:1,meals:[meal],workouts:[{id:'history',name:'高位下拉',weight:30}],templates:[...previous,custom]};
    const upgraded=upgradeTemplateDefaults(source,defaults,legacy,()=> 'preserved-back');
    assert.equal(upgraded.templates.length,7); assert.deepEqual(upgraded.templates.slice(0,5),defaults);
    assert.deepEqual(upgraded.templates[5],{...edited,id:'preserved-back'}); assert.deepEqual(upgraded.templates[6],custom);
    assert.deepEqual(upgraded.workouts,source.workouts); assert.deepEqual(upgraded.meals,source.meals);
  }
});
test('已经使用新版动作但缺少升级标记时不重复添加',()=>{
  const source={version:1,meals:[],workouts:[],templates:structuredClone(defaults)};
  assert.deepEqual(upgradeTemplateDefaults(source,defaults,legacy,()=>assert.fail('不应生成副本')).templates,defaults);
});
test('升级仅执行一次，之后编辑和删除默认模板、恢复新版备份都保持原样',()=>{
  const source={version:1,meals:[],workouts:[],templates:structuredClone(legacy)};
  source.templates[1].name='练背 A';
  const upgraded=upgradeTemplateDefaults(source,defaults,legacy,()=> 'preserved-back');
  upgraded.templates[0].exercises[0].weight=35; upgraded.templates.splice(3,1);
  const backup=JSON.parse(JSON.stringify(upgraded));
  assert.strictEqual(upgradeTemplateDefaults(backup,defaults,legacy,()=>assert.fail('不能重复升级')),backup);
  assert.equal(backup.templates.length,5); assert.equal(backup.templates[0].exercises[0].weight,35);
  assert.equal(backup.templates.filter(template=>template.id==='preserved-back').length,1);
  assert.equal(backup.templates.some(template=>template.id==='default-glutes'),false);
});
