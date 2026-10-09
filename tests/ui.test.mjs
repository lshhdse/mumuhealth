import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const root = 'http://127.0.0.1:4173';
await mkdir('build/screenshots',{recursive:true});
const browser = await chromium.launch({ channel:'chrome',headless:true });
const errors = [];
const context = await browser.newContext({ viewport:{width:393,height:852},deviceScaleFactor:2,locale:'zh-CN',timezoneId:'Asia/Shanghai' });
const page = await context.newPage();
async function screenshot(file, target = page) {
  await target.evaluate(async () => { await Promise.all(document.getAnimations().map(animation => animation.finished.catch(()=>{}))); document.querySelector('#toast')?.classList.remove('show'); });
  await target.screenshot({path:file});
}
page.on('pageerror',error=>errors.push(error.message));
const click = async action => {
  const dialogAction = page.locator(`#overlay [data-action="${action}"]`);
  return (await dialogAction.count() ? dialogAction : page.locator(`[data-action="${action}"]`)).first().click();
};
async function visible(text) { await page.getByText(text,{exact:false}).first().waitFor(); }
try {
  await page.goto(root);
  await page.getByRole('heading',{name:'今天',exact:true}).waitFor();
  await page.getByRole('button',{name:'添加早餐',exact:true}).click();
  await click('save-meal'); await visible('请描述吃了什么、添加照片，或手动添加食物。');
  await page.locator('#meal-description').fill('两个鸡蛋、一碗粥');
  await click('add-food'); await page.getByLabel('食物 1 名称').fill('鸡蛋'); await page.getByLabel('食物 1 份量').fill('2 个'); await page.getByLabel('食物 1 热量').fill('150');
  await click('add-food'); await page.getByLabel('食物 2 名称').fill('粥'); await page.getByLabel('食物 2 份量').fill('1 碗');
  await screenshot('build/screenshots/meal-editor.png');
  await click('save-meal'); await page.locator('.meal-record').waitFor();
  assert.match(await page.locator('.summary-card').innerText(),/150/);
  assert.match(await page.locator('.summary-card').innerText(),/1 项食物未填写热量/);
  await page.reload(); await page.locator('.meal-record').waitFor();
  assert.match(await page.locator('.meal-record').innerText(),/鸡蛋.*粥/s);
  await click('view-meal'); await visible('热量明细'); await click('edit-meal'); await page.getByLabel('食物 2 热量').fill('120'); await click('save-meal');
  assert.match(await page.locator('.summary-card').innerText(),/270/);
  await click('add-workout'); await page.locator('#workout-name').fill('跑步'); await page.locator('#workout-minutes').fill('30'); await click('save-workout'); await visible('有氧 · 30 分钟');
  await click('add-workout'); await page.locator('[data-type="strength"]').click(); await page.locator('#workout-name').fill('哑铃卧推'); await page.locator('#workout-sets').fill('4'); await page.locator('#workout-reps').fill('12'); await page.locator('#workout-weight').fill('10'); await screenshot('build/screenshots/workout-editor.png'); await click('save-workout'); await visible('力量 · 4 组 × 12 次 · 10 kg');
  const stored = () => page.evaluate(()=>JSON.parse(localStorage.getItem('mumu.preview.records.v1')));
  await click('add-workout'); await page.getByLabel('运动 1 名称').fill('骑行'); await page.getByLabel('运动 1 时长').fill('40'); await page.getByLabel('运动 1 备注').fill('室外'); await click('add-workout-entry');
  const second = page.locator('[data-workout-index="1"]'); await second.locator('[data-type="strength"]').click(); await page.getByLabel('运动 2 名称').fill('深蹲'); await page.getByLabel('运动 2 组数').fill('3'); await page.getByLabel('运动 2 每组次数').fill('10'); await page.getByLabel('运动 2 重量').fill('20');
  assert.equal(await page.getByLabel('运动 1 名称').inputValue(),'骑行'); assert.equal(await page.getByLabel('运动 1 时长').inputValue(),'40');
  await click('add-workout-entry'); await click('save-workout'); await visible('运动 3：请填写运动名称'); assert.equal((await stored()).workouts.length,2);
  await page.locator('[data-action="remove-workout-entry"][data-index="2"]').click(); await screenshot('build/screenshots/multi-workout.png'); await click('save-workout'); await visible('有氧 · 40 分钟'); await visible('力量 · 3 组 × 10 次 · 20 kg'); assert.equal((await stored()).workouts.length,4);
  await page.locator('.workout-row').filter({hasText:'骑行'}).click(); await page.getByLabel('运动 1 时长').fill('45'); await click('save-workout'); await visible('有氧 · 45 分钟'); assert.equal((await stored()).workouts.length,4);
  await page.locator('.workout-row').filter({hasText:'骑行'}).click(); await click('delete-record'); await click('confirm-no'); await page.getByLabel('运动 1 时长').waitFor(); await click('delete-record'); await click('confirm-yes'); await page.waitForFunction(()=>!document.querySelector('.dialog')); await page.waitForFunction(()=>document.querySelectorAll('.workout-row').length===3);
  await page.locator('[data-action="navigate"][data-page="history"]').click();
  await page.locator('#history-date').fill('2026-10-07'); await page.locator('#history-date').dispatchEvent('change');
  const weekBefore = await page.locator('.week-day').evaluateAll(nodes=>nodes.map(node=>node.dataset.date));
  assert.deepEqual(weekBefore,['2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-10','2026-10-11']);
  await page.locator('[data-action="choose-date"][data-date="2026-10-09"]').click(); assert.deepEqual(await page.locator('.week-day').evaluateAll(nodes=>nodes.map(node=>node.dataset.date)),weekBefore); assert.equal(await page.locator('.week-day.selected').getAttribute('data-date'),'2026-10-09');
  await page.getByRole('button',{name:'下一周',exact:true}).click(); assert.equal(await page.locator('.week-day').first().getAttribute('data-date'),'2026-10-12'); assert.equal(await page.locator('#history-date').inputValue(),'2026-10-16');
  await page.getByRole('button',{name:'上一周',exact:true}).click(); await page.locator('[data-action="choose-date"][data-date="2026-10-07"]').click();
  assert.equal(await page.locator('.meal-record').count(),0);
  await page.getByRole('button',{name:'添加午餐',exact:true}).click(); await click('add-food'); await page.getByLabel('食物 1 名称').fill('米饭'); await page.getByLabel('食物 1 热量').fill('230'); await click('save-meal');
  await page.reload(); await page.locator('[data-action="navigate"][data-page="history"]').click(); await page.locator('#history-date').fill('2026-10-07'); await page.locator('#history-date').dispatchEvent('change'); await visible('米饭');
  await screenshot('build/screenshots/history.png');
  await click('view-meal'); await click('edit-meal'); await click('delete-record'); await click('confirm-no'); await page.getByLabel('食物 1 名称').waitFor(); await click('delete-record'); await click('confirm-yes'); await page.waitForFunction(()=>!document.querySelector('.dialog')); await page.waitForFunction(()=>!document.querySelector('.meal-record'));
  await page.locator('[data-action="navigate"][data-page="settings"]').click(); await visible('AI 饮食助手'); await page.locator('#base-url').fill('http://example.com/v1'); await click('save-settings'); await visible('请填写不含密钥、参数的 HTTPS');
  await page.locator('#base-url').fill('https://dashscope.aliyuncs.com/compatible-mode/v1'); await click('save-settings'); await screenshot('build/screenshots/settings.png');
  await click('open-templates'); await page.locator('[data-action="edit-template"][data-id="default-back"]').click(); await page.locator('#template-name').fill('练背 A'); await page.getByLabel('动作 1 组数').fill('4'); await page.getByLabel('动作 1 每组次数').fill('10'); await page.getByLabel('动作 1 重量').fill('25');
  await page.locator('[data-action="remove-template-exercise"][data-index="1"]').click(); await click('add-template-exercise'); await page.getByLabel('动作 3 名称').fill('硬拉'); await page.getByLabel('动作 3 组数').fill('3'); await page.getByLabel('动作 3 每组次数').fill('8'); await page.getByLabel('动作 3 重量').fill('50'); await screenshot('build/screenshots/template-editor.png'); await click('save-template'); await page.locator('[data-action="edit-template"][data-id="default-back"]').waitFor();
  assert.equal((await stored()).templates.find(template=>template.id==='default-back').exercises[0].weight,25);
  await page.reload(); await page.locator('[data-action="navigate"][data-page="settings"]').click(); await click('open-templates'); await screenshot('build/screenshots/templates.png'); await page.locator('[data-action="edit-template"][data-id="default-back"]').click(); assert.equal(await page.getByLabel('动作 1 重量').inputValue(),'25'); await click('open-templates');
  await click('add-template'); await page.locator('#template-name').fill('自重上肢'); await page.getByLabel('动作 1 名称').fill('俯卧撑'); await click('save-template'); await visible('动作 1：组数'); assert.equal((await stored()).templates.length,4); await page.getByLabel('动作 1 组数').fill('3'); await page.getByLabel('动作 1 每组次数').fill('15'); await click('save-template');
  await page.locator('[data-action="edit-template"]').filter({hasText:'自重上肢'}).click(); await click('delete-template'); await click('confirm-no'); await page.locator('#template-name').waitFor(); await click('delete-template'); await click('confirm-yes'); await page.getByText('按部位，整理你的训练').waitFor(); assert.equal((await stored()).templates.length,4); await click('close-sheet');
  await page.locator('[data-action="navigate"][data-page="today"]').click(); await click('add-workout'); await page.locator('[data-action="apply-template"][data-id="default-back"]').click(); assert.equal(await page.locator('.workout-entry').count(),3); assert.equal(await page.getByLabel('运动 1 重量').inputValue(),'25'); await page.getByLabel('运动 1 重量').fill('30'); await click('save-workout'); await visible('力量 · 4 组 × 10 次 · 30 kg'); assert.equal((await stored()).templates.find(template=>template.id==='default-back').exercises[0].weight,25);
  await page.locator('[data-action="navigate"][data-page="settings"]').click(); await click('open-templates'); await page.locator('[data-action="edit-template"][data-id="default-back"]').click(); await page.getByLabel('动作 1 重量').fill('35'); await click('save-template'); assert.equal((await stored()).workouts.find(record=>record.name==='高位下拉').weight,30); await click('close-sheet');
  await page.locator('[data-action="navigate"][data-page="today"]').click();
  await page.getByRole('button',{name:'添加晚餐',exact:true}).click(); await page.locator('#meal-description').fill('一碗面，明天再补份量'); await click('close-sheet'); await click('resume-draft'); assert.equal(await page.locator('#meal-description').inputValue(),'一碗面，明天再补份量'); await click('close-sheet');
  for (const width of [320,360,393,430]) { await page.setViewportSize({width,height:852}); await page.locator('[data-action="navigate"][data-page="history"]').click(); assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth),`历史页面在 ${width}px 下不应横向溢出`); await click('add-workout'); await page.locator('[data-action="apply-template"][data-id="default-back"]').click(); assert.ok(await page.evaluate(()=>document.querySelector('.sheet').scrollWidth <= window.innerWidth),`训练模板在 ${width}px 下不应横向溢出`); await click('close-sheet'); await page.locator('[data-action="navigate"][data-page="today"]').click(); await page.getByRole('button',{name:'添加早餐',exact:true}).click(); assert.ok(await page.evaluate(()=>document.querySelector('.sheet').scrollWidth <= window.innerWidth),`表单在 ${width}px 下不应横向溢出`); await click('close-sheet'); }
  console.log('PASS: 手动饮食、未知热量、修改、持久化、有氧/力量、历史补录、删除确认、设置校验、草稿恢复、4种屏幕宽度。');
  console.log('PASS: 固定周日期选择与整周跳转、多运动混合记录、整体校验、独立编辑/删除、模板管理/持久化/带入，以及模板与训练副本互不影响。');

  // AI success and error fixtures exercise only the UI; they do not claim a real provider call.
  const nativeContext = await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,locale:'zh-CN',timezoneId:'Asia/Shanghai'});
  await nativeContext.addInitScript(()=>{
    const key='mumu.test.native'; let data=JSON.parse(localStorage.getItem(key)||'{"version":1,"meals":[],"workouts":[]}');
    const config={baseUrl:'https://example.test/v1',textModel:'test-text',visionModel:'test-vision',hasKey:true};
    window.fixtureRequests=[];
    window.NativeBridge={call(method,payload,id){ const input=JSON.parse(payload); window.fixtureRequests.push({method,input}); setTimeout(()=>{let result=true,error=null;
      if(method==='init') result={data,settings:config,native:true};
      if(method==='photo') result={name:'test-photo.jpg',url:'https://app.mumu.local/photos/test-photo.jpg'};
      if(method==='saveMeal'){
        result={...input,id:'test-meal',updatedAt:Date.now()}; data.meals=[result]; localStorage.setItem(key,JSON.stringify(data));
        if(result.analysisStatus==='pending') setTimeout(()=>{
          const current=data.meals[0]; if(current.analysisToken!==result.analysisToken || current.analysisStatus!=='pending') return;
          const analyzed={...current,title:'鸡蛋和小米粥',foods:[{name:'鸡蛋',portion:'2 个',kcal:150},{name:'小米粥',portion:'1 碗',kcal:100}],assumptions:'测试夹具：按常见一人份估算。',analysisStatus:'done',source:'ai',updatedAt:Date.now()};
          data.meals=[analyzed]; localStorage.setItem(key,JSON.stringify(data)); window.mealAnalysisUpdated(JSON.stringify(analyzed));
        },350);
      }
      window.nativeResult(JSON.stringify({id,result,error})); },15); }};
  });
  const nativePage = await nativeContext.newPage(); nativePage.on('pageerror',error=>errors.push(error.message)); await nativePage.goto(root); await nativePage.getByRole('heading',{name:'今天',exact:true}).waitFor();
  await screenshot('build/screenshots/home.png', nativePage);
  await nativePage.getByRole('button',{name:'添加早餐',exact:true}).click(); await nativePage.locator('#meal-description').fill('两个鸡蛋、一碗小米粥'); await nativePage.locator('[data-action="gallery"]').click(); await nativePage.locator('.photo-preview').waitFor();
  await nativePage.locator('[data-action="save-meal"]').click(); await nativePage.locator('.meal-record').waitFor();
  assert.match(await nativePage.locator('.meal-record').innerText(),/分析中/);
  assert.equal(await nativePage.evaluate(()=>window.fixtureRequests.find(request=>request.method==='saveMeal').input.photo),'test-photo.jpg');
  await nativePage.getByText('鸡蛋和小米粥',{exact:true}).waitFor(); assert.match(await nativePage.locator('.meal-record').innerText(),/约 250/);
  await nativePage.locator('[data-action="view-meal"]').click(); await nativePage.getByText('热量明细').waitFor(); await screenshot('build/screenshots/meal-detail.png', nativePage); await nativePage.locator('[data-action="edit-meal"]').click();
  await nativePage.getByLabel('食物 2 热量').fill('120'); await nativePage.locator('[data-action="save-meal"]').click(); await nativePage.waitForFunction(()=>document.querySelector('.summary-card')?.textContent.includes('270')); assert.match(await nativePage.locator('.summary-card').innerText(),/270/);
  assert.equal(await nativePage.evaluate(()=>window.fixtureRequests.filter(request=>request.method==='saveMeal').length),2);
  console.log('PASS: 文字照片先保存、后台更新摘要与明细、手动修正热量；未调用真实 AI 服务。');
  const updateContext = await browser.newContext({viewport:{width:393,height:852},locale:'zh-CN',timezoneId:'Asia/Shanghai'});
  await updateContext.addInitScript(()=>{
    window.fixtureUpdates=[];
    window.NativeBridge={call(method,payload,id){
      window.fixtureUpdates.push(method);
      const result = method==='init' ? {data:{version:1,meals:[],workouts:[],templates:[]},settings:{baseUrl:'https://example.test/v1',textModel:'text',visionModel:'vision',hasKey:false},native:true,appVersion:'1.0.4'} :
        method==='checkUpdate' ? {status:'available',available:true,versionCode:100002,versionName:'沐沐健康 1.0.4.2'} :
        method==='installUpdate' ? {status:'permission'} : true;
      setTimeout(()=>window.nativeResult(JSON.stringify({id,result,error:null})),10);
    }};
  });
  const updatePage = await updateContext.newPage(); updatePage.on('pageerror',error=>errors.push(error.message)); await updatePage.goto(root);
  await updatePage.getByRole('heading',{name:'发现新版本'}).waitFor();
  await updatePage.locator('[data-action="confirm-no"]').click();
  await updatePage.locator('[data-action="navigate"][data-page="settings"]').click();
  await updatePage.getByText('发现新版本 · 沐沐健康 1.0.4.2').waitFor();
  await updatePage.locator('[data-action="check-update"]').click();
  await updatePage.getByRole('heading',{name:'发现新版本'}).waitFor();
  await updatePage.locator('[data-action="confirm-yes"]').click();
  await updatePage.waitForFunction(()=>window.fixtureUpdates.includes('installUpdate'));
  assert.equal(await updatePage.evaluate(()=>window.fixtureUpdates.filter(method=>method==='checkUpdate').length),2);
  await updateContext.close();
  console.log('PASS: 启动发现更新、稍后再说、我的内再次检查和立即更新。');
  const previewContext = await browser.newContext({viewport:{width:393,height:852},locale:'zh-CN',timezoneId:'Asia/Shanghai'});
  const previewPage = await previewContext.newPage(); previewPage.on('pageerror',error=>errors.push(error.message)); await previewPage.goto(root);
  await previewPage.getByRole('button',{name:'添加早餐',exact:true}).click(); await previewPage.locator('#meal-description').fill('一碗泡面'); await previewPage.locator('[data-action="save-meal"]').click();
  await previewPage.locator('.meal-record').waitFor(); await previewPage.getByText('分析未完成',{exact:false}).first().waitFor();
  await previewPage.locator('[data-action="view-meal"]').click(); await previewPage.getByText('浏览器预览未连接 AI',{exact:false}).first().waitFor();
  await previewPage.locator('[data-action="retry-meal"]').click(); await previewPage.getByText('AI 正在后台估算',{exact:false}).first().waitFor();
  await previewPage.getByText('浏览器预览未连接 AI',{exact:false}).first().waitFor();
  await previewPage.locator('#overlay [data-action="edit-meal"]').click(); await previewPage.locator('[data-action="add-food"]').click();
  await previewPage.getByLabel('食物 1 名称').fill('泡面'); await previewPage.getByLabel('食物 1 热量').fill('430'); await previewPage.locator('[data-action="save-meal"]').click();
  await previewPage.waitForFunction(()=>document.querySelector('.meal-record')?.textContent.includes('430'));
  console.log('PASS: 纯文字即时保存、分析失败保留记录、重试与手动补充热量。');
  assert.deepEqual(errors,[],'不应出现页面脚本错误');
} finally { await browser.close(); }
