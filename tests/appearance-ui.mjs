import assert from 'node:assert/strict';
import { localDate, shiftDate } from '../app/src/main/assets/web/domain.mjs';

// Audit actual rendered text (including input placeholders and chart labels),
// compositing translucent ancestor backgrounds instead of just comparing tokens.
async function contrastIssues(page) {
  return page.evaluate(() => {
    const rgba = value => (value.match(/[\d.]+/g) || []).map(Number);
    const over = (front,back) => front.slice(0,3).map((v,i) => v * (front[3] ?? 1) + back[i] * (1-(front[3] ?? 1))).concat(1);
    const luminance = color => color.slice(0,3).map(v => v/255).map(v => v<=.04045 ? v/12.92 : ((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    const ratio = (a,b) => {const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
    const background = node => {
      const ancestors=[]; for(let parent=node;parent;parent=parent.parentElement) ancestors.push(parent);
      return ancestors.reverse().reduce((color,parent)=>over(rgba(getComputedStyle(parent).backgroundColor),color),[255,255,255,1]);
    };
    const visible = node => { if(!node.getClientRects().length || node.closest('[aria-hidden="true"], [disabled]')) return false; for(let parent=node;parent;parent=parent.parentElement) {const css=getComputedStyle(parent);if(css.visibility==='hidden' || Number(css.opacity)===0 || css.display==='none')return false;}return true;};
    const problems=[];
    function inspect(node,text,pseudo) {
      const css=getComputedStyle(node,pseudo),bg=background(node),isSvg=node instanceof SVGElement;
      const fg=over(rgba(isSvg ? css.fill : css.color),bg);
      const size=parseFloat(css.fontSize),weight=parseInt(css.fontWeight),large=size>=24 || (size>=18.66 && weight>=700);
      const value=ratio(fg,bg),target=large?3:4.5;
      if(value+0.03<target) problems.push({text:text.slice(0,55),node:node.className?.baseVal || node.className || node.tagName,pseudo,ratio:Number(value.toFixed(2)),target,foreground:css.color,background:bg.slice(0,3).map(Math.round)});
    }
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()) {const text=walker.currentNode.textContent.trim(),node=walker.currentNode.parentElement;if(!text || ['SCRIPT','STYLE'].includes(node.tagName) || !visible(node))continue;inspect(node,text);}
    for(const node of document.querySelectorAll('input,textarea,select')) if(visible(node)) {
      if(node.value && !['date','month'].includes(node.type)) inspect(node,node.value);
      else if(node.placeholder) inspect(node,node.placeholder,'::placeholder');
    }
    return problems;
  });
}

export async function checkAppearanceUi(browser,errors) {
  const today=localDate(),earlier=shiftDate(today,-3);
  const data={version:1,meals:[
    {id:'audit-food',date:today,meal:'lunch',description:'牛肉面',note:'一碗面，少油',photo:'',foods:[{name:'面条',portion:'一碗',kcal:350},{name:'牛肉',portion:'100 克',kcal:200}]},
    {id:'audit-failed',date:today,meal:'dinner',description:'蔬菜汤',note:'',photo:'',foods:[],analysisStatus:'failed',analysisError:'分析未完成，请稍后重试。'}
  ],workouts:[{id:'audit-training',date:today,type:'strength',name:'坐姿绳索划船',sets:5,reps:12,weight:25,minutes:null,note:'动作放慢'}],periods:[{id:'audit-period',startDate:earlier,endDate:today,note:'今天状态不错'}]};
  const context=await browser.newContext({viewport:{width:393,height:852},locale:'zh-CN',timezoneId:'Asia/Shanghai',reducedMotion:'reduce',colorScheme:'light'});
  await context.addInitScript(data=>{if(!localStorage.getItem('mumu.preview.records.v1')) {localStorage.setItem('mumu.preview.records.v1',JSON.stringify(data));localStorage.setItem('mumu.preview.gender','female');}},data);
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
  let screens=0; const failures=[];
  const click=async name=>{const modal=page.locator(`#overlay [data-action="${name}"]`);await (await modal.count()?modal:page.locator(`[data-action="${name}"]`)).first().click();};
  const nav=async name=>{await page.locator(`[data-page="${name}"]`).click();};
  const audit=async label=>{
    await page.evaluate(async()=>{await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));});
    const issues=await contrastIssues(page);screens++;
    if(issues.length)failures.push({label,issues});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${label} 不应横向溢出`);
  };
  try {
    await page.goto('http://127.0.0.1:4173');await page.getByRole('heading',{name:'今天',exact:true}).waitFor();
    for(const mode of ['light','dark']) for(const theme of ['blue','sage','plum','rose','amber']) {
      await nav('settings');await click('open-appearance');
      await page.locator(`[data-color-mode="${mode}"][data-action]`).click();
      await page.waitForFunction(()=>!document.querySelector('.color-mode-options button:disabled'));
      await page.locator(`[data-theme-id="${theme}"]`).click();
      await page.waitForFunction(()=>!document.querySelector('.theme-option:disabled'));
      assert.equal(await page.locator('html').getAttribute('data-color-mode'),mode);
      await audit(`${mode}/${theme}/外观`);
      if(mode==='dark' && theme==='blue')await page.screenshot({path:'build/screenshots/dark-appearance.png',fullPage:true});
      await click('settings-back');await audit(`${mode}/${theme}/我的`);
      for(const section of ['general','ai','updates']) {await click(`open-${section}`);await audit(`${mode}/${theme}/${section}`);await click('settings-back');}
      await click('open-templates');await audit(`${mode}/${theme}/模板列表`);
      await page.locator('[data-action="edit-template"]').first().click();await audit(`${mode}/${theme}/模板编辑`);
      await click('delete-template');await audit(`${mode}/${theme}/删除确认`);await click('confirm-no');
      await click('open-templates');await click('close-sheet');
      await nav('today');await audit(`${mode}/${theme}/今天`);
      if(mode==='dark' && theme==='blue')await page.screenshot({path:'build/screenshots/dark-today.png'});
      await page.locator('[data-action="view-meal"][data-id="audit-food"]').click();await audit(`${mode}/${theme}/热量详情`);
      await click('edit-meal');await audit(`${mode}/${theme}/饮食编辑`);await click('close-sheet');
      await page.locator('[data-action="view-meal"][data-id="audit-failed"]').click();await audit(`${mode}/${theme}/分析失败详情`);await click('close-sheet');
      await click('add-workout');await page.locator('[data-action="workout-type"][data-type="strength"]').first().click();
      await audit(`${mode}/${theme}/力量表单`);await click('add-workout-entry');await audit(`${mode}/${theme}/多运动表单`);
      await click('save-workout');await page.locator('#editor-error:not(:empty)').waitFor();await audit(`${mode}/${theme}/校验错误`);
      if(mode==='dark' && theme==='blue')await page.screenshot({path:'build/screenshots/dark-training.png'});
      await click('close-sheet');await nav('history');await audit(`${mode}/${theme}/周日历`);
      await page.getByRole('button',{name:'月统计',exact:true}).click();await audit(`${mode}/${theme}/月统计`);
      if(mode==='dark' && theme==='blue')await page.screenshot({path:'build/screenshots/dark-month.png',fullPage:true});
      await click('add-period');await audit(`${mode}/${theme}/经期表单`);await click('close-sheet');
      console.log(`CHECK: ${mode}/${theme} 全界面文字、占位符、图表与布局。`);
    }
    await nav('settings');await click('open-appearance');
    await page.locator('[data-action="choose-color-mode"][data-color-mode="system"]').click();
    await page.waitForFunction(()=>!document.querySelector('.color-mode-options button:disabled'));
    await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.colorMode==='dark');
    await nav('today');await click('add-meal');await page.locator('#meal-description').fill('系统切换时保留输入');
    await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.documentElement.dataset.colorMode==='light');
    assert.equal(await page.locator('#meal-description').inputValue(),'系统切换时保留输入');await click('close-sheet');
    await nav('settings');await click('open-appearance');
    await page.locator('[data-action="choose-color-mode"][data-color-mode="dark"]').click();await page.waitForFunction(()=>!document.querySelector('.color-mode-options button:disabled'));
    await page.reload();assert.equal(await page.locator('html').getAttribute('data-color-mode'),'dark');
    await page.emulateMedia({colorScheme:'light'});assert.equal(await page.locator('html').getAttribute('data-color-mode'),'dark');
    for(const width of [320,430]) {await page.setViewportSize({width,height:852});for(const view of ['today','history','settings']) {await nav(view);await audit(`dark/${width}px/${view}`);}}
    const persisted=await page.evaluate(()=>JSON.parse(localStorage.getItem('mumu.preview.records.v1')));
    assert.deepEqual(persisted.meals,data.meals);assert.deepEqual(persisted.workouts,data.workouts);assert.deepEqual(persisted.periods,data.periods);
    assert.equal(failures.length,0,`对比度异常 ${failures.length} 处界面，见 build/appearance-contrast.json；首项：${JSON.stringify(failures[0])}`);
    console.log(`PASS: ${screens} 个界面/主题组合对比度、三种显示模式、系统实时切换不丢输入、持久化、手机宽度及记录保持。`);
  } finally {await import('node:fs/promises').then(fs=>fs.writeFile('build/appearance-contrast.json',JSON.stringify({screens,failures},null,2)));await context.close();}

  // Android system state comes from the bridge, even if WebView's media query disagrees.
  const native=await browser.newContext({viewport:{width:393,height:852},colorScheme:'light'});
  await native.addInitScript(data=>{
    const save=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){if(key==='mumu.appearance')throw new DOMException('Cache is full','QuotaExceededError');return save.call(this,key,value);};
    window.NativeBridge={call(method,payload,id){let result={},error=null;if(method==='init')result={data:{...data,templates:[]},native:true,systemDark:true,settings:{theme:'blue',colorMode:'system',gender:'female'},appVersion:'1.0.12'};else if(method==='checkUpdate')result={status:'current',available:false};else if(method==='appearance'){if(window.failAppearance)error='外观保存失败。';else result={...JSON.parse(payload),gender:'female'};}queueMicrotask(()=>window.nativeResult(JSON.stringify({id,result,error})));}};
  },data);
  try {
    const page=await native.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:4173');await page.waitForFunction(()=>document.documentElement.dataset.colorMode==='dark');
    await page.evaluate(()=>window.systemAppearanceChanged(false));assert.equal(await page.locator('html').getAttribute('data-color-mode'),'light');
    await page.getByRole('button',{name:'我的',exact:true}).click();await page.locator('[data-action="open-appearance"]').click();await page.locator('[data-action="choose-color-mode"][data-color-mode="dark"]').click();await page.waitForFunction(()=>!document.querySelector('.color-mode-options button:disabled'));
    await page.evaluate(()=>window.systemAppearanceChanged(false));assert.equal(await page.locator('html').getAttribute('data-color-mode'),'dark');
    await page.evaluate(()=>window.failAppearance=true);await page.locator('[data-action="choose-color-mode"][data-color-mode="light"]').click();await page.waitForFunction(()=>!document.querySelector('.color-mode-options button:disabled'));
    assert.equal(await page.locator('html').getAttribute('data-color-mode'),'dark');assert.equal(await page.locator('[data-action="choose-color-mode"][data-color-mode="dark"]').getAttribute('aria-pressed'),'true');
    console.log('PASS: 原生系统明暗通知、手动模式优先、缓存空间不足不影响原生保存、保存失败正确回退。');
  } finally {await native.close();}
}
