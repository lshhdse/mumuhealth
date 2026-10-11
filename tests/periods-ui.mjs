import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { localDate, shiftDate } from '../app/src/main/assets/web/domain.mjs';

export async function checkPeriodsUi(browser,errors) {
  const context=await browser.newContext({viewport:{width:393,height:852},locale:'zh-CN',timezoneId:'Asia/Shanghai',reducedMotion:'reduce'});
  await context.addInitScript(()=>{if(!localStorage.getItem('mumu.preview.records.v1')) localStorage.setItem('mumu.preview.records.v1',JSON.stringify({version:1,meals:[{id:'legacy-meal',date:'2024-03-01',meal:'breakfast',description:'鸡蛋',foods:[{name:'鸡蛋',portion:'1 个',kcal:75}],note:'',photo:''}],workouts:[]}));});
  const page=await context.newPage(); page.on('pageerror',error=>errors.push(error.message));
  const data=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('mumu.preview.records.v1')));
  const general=async()=>{await page.getByRole('button',{name:'我的',exact:true}).click();await page.locator('[data-action="open-general"]').click();};
  const month=async(value)=>{
    await page.getByRole('button',{name:'日历',exact:true}).click();await page.getByRole('button',{name:'月统计',exact:true}).click();
    await page.locator('#statistics-month').fill(value);await page.locator('#statistics-month').dispatchEvent('change');
  };
  const save=async()=>{await page.locator('[data-action="save-period"]').click();await page.locator('#overlay [role="dialog"]').waitFor({state:'detached'});};
  const fill=async(start,end,note='')=>{
    await page.locator('#period-start').fill(start);await page.locator('#period-end').fill(end);await page.locator('#period-note').fill(note);
  };
  try {
    await page.goto('http://127.0.0.1:4173');await general();
    assert.equal(await page.locator('[data-gender=""]').getAttribute('aria-pressed'),'true');
    await month('2024-02');assert.equal(await page.locator('.period-card, .period-legend').count(),0);
    await general();await page.getByRole('button',{name:'女性',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[data-gender="female"]')?.getAttribute('aria-pressed')==='true' && !document.querySelector('.gender-options button:disabled'));
    await page.screenshot({path:'build/screenshots/profile-gender.png',fullPage:true});
    await page.reload();await general();assert.equal(await page.locator('[data-gender="female"]').getAttribute('aria-pressed'),'true');
    await month('2024-02');await page.getByRole('button',{name:'记录经期',exact:true}).click();
    await fill('2024-02-27','2024-03-02','<img src=x onerror="window.badPeriod=true">');await save();
    assert.equal(await page.locator('.period-card .period-summary strong').innerText(),'3');
    assert.equal(await page.locator('.month-day.has-period').count(),3);assert.equal((await page.locator('.record-ring strong').innerText()).replace(/\s/g,''),'3天');
    assert.equal(await page.locator('.month-empty').count(),0);assert.match(await page.locator('.period-record').innerText(),/5 天/);
    assert.equal(await page.evaluate(()=>window.badPeriod),undefined);
    const id=(await data()).periods[0].id;
    await page.getByRole('button',{name:'下一月',exact:true}).click();
    assert.equal(await page.locator('.period-summary strong').innerText(),'2');assert.equal(await page.locator('.month-day.has-period').count(),2);
    assert.match(await page.locator('[data-date="2024-03-01"]').getAttribute('aria-label'),/已记录经期/);
    assert.equal(await page.locator('.month-day[data-date="2024-03-01"] .day-food').count(),1);
    assert.equal(await page.locator('.month-metric').filter({has:page.getByText('已知热量合计',{exact:true})}).locator('strong').innerText(),'75千卡');
    await page.locator('.period-record').click();await page.locator('#period-end').fill('2024-02-26');
    await page.locator('[data-action="save-period"]').click();await page.getByText('结束日期不能早于开始日期。',{exact:true}).waitFor();
    assert.equal((await data()).periods[0].endDate,'2024-03-02');
    await page.locator('#period-end').fill('2024-03-03');await page.locator('#period-note').fill('跨月记录');await save();
    assert.equal(await page.locator('.period-summary strong').innerText(),'3');assert.equal((await data()).periods[0].id,id);
    await page.getByRole('button',{name:'记录经期',exact:true}).click();await fill('2024-03-02','2024-03-04');
    await page.locator('[data-action="save-period"]').click();await page.getByText('日期与已有经期记录重叠，请先调整原记录。',{exact:true}).waitFor();
    assert.equal((await data()).periods.length,1);await fill('2024-03-04','2024-03-04');await save();
    assert.equal(await page.locator('.period-summary strong').innerText(),'4');
    await page.locator('.period-record').filter({hasText:'3 月 4 日'}).click();await page.locator('[data-action="delete-period"]').click();
    await page.locator('[data-action="confirm-no"]').click();assert.equal(await page.locator('#period-start').inputValue(),'2024-03-04');
    await page.locator('[data-action="delete-period"]').click();await page.locator('[data-action="confirm-yes"]').click();
    await page.locator('.period-record').waitFor();assert.equal((await data()).periods.length,1);
    const today=localDate(), start=shiftDate(today,-2);
    await month(today.slice(0,7));await page.getByRole('button',{name:'记录经期',exact:true}).click();await fill(start,'','本次记录');await save();
    const expected=Math.min(3,Number(today.slice(-2)));
    assert.equal(await page.locator('.period-summary strong').innerText(),String(expected));
    await page.locator('.period-record').filter({hasText:'进行中'}).waitFor();
    assert.equal(await page.locator(`.month-day[data-date="${shiftDate(today,1)}"].has-period`).count(),0);
    await page.getByRole('button',{name:'记录经期',exact:true}).click();await fill(today,'');
    await page.locator('[data-action="save-period"]').click();await page.getByText('日期与已有经期记录重叠，请先调整原记录。',{exact:true}).waitFor();
    await page.locator('[data-action="close-sheet"]').click();await page.locator('.period-end').click();assert.equal(await page.locator('#period-end').inputValue(),today);
    await page.screenshot({path:'build/screenshots/period-editor.png'});await save();
    assert.equal(await page.locator('.period-end').count(),0);
    assert.equal((await data()).periods.find(record=>record.startDate===start).endDate,today);
    const beforeGender=(await data()).periods;
    await general();await page.getByRole('button',{name:'男性',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.gender-options button:disabled'));
    await month(today.slice(0,7));assert.equal(await page.locator('.period-card, .has-period, .period-legend').count(),0);
    assert.deepEqual((await data()).periods,beforeGender);
    await general();await page.getByRole('button',{name:'女性',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.gender-options button:disabled'));
    await page.locator('[data-action="settings-back"]').click();await page.locator('[data-action="open-appearance"]').click();
    await page.locator('[data-theme-id="plum"]').click();await page.waitForFunction(()=>!document.querySelector('.theme-option:disabled'));
    await page.locator('[data-action="settings-back"]').click();await page.locator('[data-action="open-ai"]').click();
    await page.locator('[data-action="save-settings"]').click();await page.waitForFunction(()=>!document.querySelector('[data-action="save-settings"]:disabled'));
    await general();assert.equal(await page.locator('[data-gender="female"]').getAttribute('aria-pressed'),'true');
    const downloadEvent=page.waitForEvent('download');await page.locator('[data-action="export"]').click();
    const download=await downloadEvent;const backup=JSON.parse(await readFile(await download.path(),'utf8'));
    assert.deepEqual(backup.periods,beforeGender);assert.equal(backup.meals[0].id,'legacy-meal');
    await page.reload();await month(today.slice(0,7));assert.equal(await page.locator('.period-record').count(),1);
    await page.screenshot({path:'build/screenshots/period-month.png',fullPage:true});
    for(const width of [320,360,393,430]) {
      await page.setViewportSize({width,height:852});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`经期月历在 ${width}px 不应横向溢出`);
    }
    assert.equal((await data()).periods.length,2);assert.equal((await data()).meals.length,1);
    console.log('PASS: 性别持久化、女性月统计入口、经期增改删与结束、跨月闰日天数、重叠校验、切换性别保留记录、主题/AI 设置隔离、备份导出和四种手机宽度。');
  } catch(error) {await page.screenshot({path:'build/screenshots/period-failure.png',fullPage:true}).catch(()=>{});throw error;}
  finally {await context.close();}
  await checkPeriodFailure(browser,errors);
}

async function checkPeriodFailure(browser,errors) {
  const context=await browser.newContext({viewport:{width:393,height:852},locale:'zh-CN',timezoneId:'Asia/Shanghai',reducedMotion:'reduce'});
  await context.addInitScript(()=>{
    window.NativeBridge={call(method,payload,id){
      const result=method==='init'?{data:{version:1,meals:[],workouts:[],templates:[]},settings:{gender:'female',theme:'blue',hasKey:true},native:true}:{status:'current',available:false};
      const error=method==='profile'?'性别保存失败测试':method==='savePeriod'?'经期保存失败测试':null;
      setTimeout(()=>window.nativeResult(JSON.stringify({id,result,error})),15);
    }};
  });
  try {
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:4173');
    await page.getByRole('button',{name:'我的',exact:true}).click();await page.locator('[data-action="open-general"]').click();
    await page.getByRole('button',{name:'男性',exact:true}).click();await page.getByText('性别保存失败测试',{exact:true}).waitFor();
    assert.equal(await page.locator('[data-gender="female"]').getAttribute('aria-pressed'),'true');
    await page.getByRole('button',{name:'日历',exact:true}).click();await page.getByRole('button',{name:'月统计',exact:true}).click();
    await page.getByRole('button',{name:'记录经期',exact:true}).click();await page.locator('#period-note').fill('保存失败仍保留输入');
    await page.locator('[data-action="save-period"]').click();await page.getByText('经期保存失败测试',{exact:true}).waitFor();
    assert.equal(await page.locator('#period-note').inputValue(),'保存失败仍保留输入');
    assert.equal(await page.locator('[data-action="save-period"]').isEnabled(),true);assert.equal(await page.locator('.period-record').count(),0);
    console.log('PASS: 模拟原生保存失败时保留性别、经期输入与原记录，不显示虚假的成功状态。');
  } finally {await context.close();}
}
