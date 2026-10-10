import assert from 'node:assert/strict';

export async function checkMonthlyCalendar(browser, errors) {
  const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,locale:'zh-CN',timezoneId:'Asia/Shanghai'});
  const page=await context.newPage(); page.on('pageerror',error=>errors.push(error.message));
  const root='http://127.0.0.1:4173';
  const meal=(id,date,slot,kcal)=>({id,date,meal:slot,foods:[{name:'食物',portion:'1 份',kcal}],description:'',note:''});
  const data={version:1,meals:[meal('m1','2026-10-01','breakfast',100),meal('m2','2026-10-01','breakfast',50),meal('m3','2026-10-01','lunch',null),meal('m4','2026-10-03','dinner',300),{...meal('m5','2026-10-04','lunch',null),foods:[],analysisStatus:'failed',analysisError:'等待补充'},meal('old','2026-09-30','dinner',900)],
    workouts:[{id:'s1',date:'2026-10-01',type:'strength',name:'反手高位下拉',sets:5,reps:12,weight:25,note:''},{id:'s2',date:'2026-10-01',type:'strength',name:'坐姿绳索划船',sets:5,reps:12,weight:25,note:''},{id:'c1',date:'2026-10-02',type:'cardio',name:'跑步',minutes:30,note:''}]};
  const metric=label=>page.locator('.month-metric').filter({has:page.getByText(label,{exact:true})}).locator('strong');
  const openMonth=async month=>{
    await page.getByRole('button',{name:'日历',exact:true}).click();
    await page.getByRole('button',{name:'月统计',exact:true}).click();
    await page.locator('#statistics-month').fill(month); await page.locator('#statistics-month').dispatchEvent('change');
  };
  try {
    await page.goto(root); await page.getByRole('heading',{name:'今天',exact:true}).waitFor();
    await page.evaluate(value=>localStorage.setItem('mumu.preview.records.v1',JSON.stringify(value)),data); await page.reload();
    await page.getByRole('button',{name:'日历',exact:true}).click(); await page.getByRole('heading',{name:'日历',exact:true}).waitFor();
    assert.equal(await page.getByText('历史记录',{exact:true}).count(),0); assert.equal(await page.locator('.week-day').count(),7);
    await page.locator('#history-date').fill('2026-10-03'); await page.locator('#history-date').dispatchEvent('change');
    await page.getByRole('button',{name:'月统计',exact:true}).click(); await page.locator('#month-statistics').waitFor();
    assert.equal(await page.locator('#statistics-month').inputValue(),'2026-10');
    assert.equal(await metric('饮食记录').innerText(),'3天'); assert.equal(await metric('训练记录').innerText(),'2天');
    assert.equal(await metric('记录日均热量').innerText(),'225千卡'); assert.equal(await metric('已知热量合计').innerText(),'450千卡');
    assert.equal(await metric('有氧时长').innerText(),'30分钟'); assert.equal(await metric('力量组数').innerText(),'10组');
    assert.equal(await page.locator('.month-day:not(.outside-month)').count(),31);
    assert.equal(await page.locator('.month-day[data-date="2026-10-01"] .month-day-icons .icon').count(),2);
    assert.equal(await page.locator('.month-day[data-date="2026-10-04"] .month-day-energy').innerText(),'待补充');
    await page.getByRole('button',{name:'力量组数',exact:true}).click(); assert.equal(await page.locator('.month-trend-bar:not(.missing)').count(),1);
    await page.getByRole('button',{name:'有氧时长',exact:true}).click(); assert.equal(await page.locator('.month-trend-bar:not(.missing)').count(),1);
    await page.getByRole('button',{name:'饮食热量',exact:true}).click(); assert.equal(await page.locator('.month-trend-bar:not(.missing)').count(),2);
    await page.evaluate(()=>window.scrollTo(0,0)); await page.screenshot({path:'build/screenshots/month-statistics.png',fullPage:true});
    await page.locator('[data-action="choose-month-date"][data-date="2026-10-01"]').click();
    assert.equal(await page.locator('#history-date').inputValue(),'2026-10-01'); assert.equal(await page.locator('.week-day.selected').getAttribute('data-date'),'2026-10-01');
    assert.equal(await page.locator('.workout-row').count(),2); assert.equal(await page.locator('.meal-record').count(),3);
    await page.getByRole('button',{name:'月统计',exact:true}).click(); await page.getByRole('button',{name:'上一月',exact:true}).click();
    assert.equal(await page.locator('#statistics-month').inputValue(),'2026-09'); assert.equal(await metric('已知热量合计').innerText(),'900千卡');
    await page.getByRole('button',{name:'下一月',exact:true}).click(); assert.equal(await metric('已知热量合计').innerText(),'450千卡');
    await page.locator('#statistics-month').fill('2026-12'); await page.locator('#statistics-month').dispatchEvent('change');
    await page.getByRole('button',{name:'下一月',exact:true}).click(); assert.equal(await page.locator('#statistics-month').inputValue(),'2027-01');
    await page.getByText('这个月还没有记录',{exact:true}).waitFor(); assert.equal(await metric('记录日均热量').innerText(),'—千卡');
    assert.equal(await page.evaluate(()=>window.handleBack()),true); assert.equal(await page.locator('#history-date').inputValue(),'2027-01-01');
    await openMonth('2024-02'); assert.equal(await page.locator('.month-day:not(.outside-month)').count(),29);
    await page.locator('[data-action="choose-month-date"][data-date="2024-02-29"]').click(); assert.equal(await page.locator('#history-date').inputValue(),'2024-02-29');
    await page.getByRole('button',{name:'添加早餐',exact:true}).click(); assert.equal(await page.locator('#meal-date').inputValue(),'2024-02-29');
    await page.locator('#meal-description').fill('补录早餐'); await page.locator('[data-action="add-food"]').click();
    await page.getByLabel('食物 1 名称').fill('鸡蛋'); await page.getByLabel('食物 1 热量').fill('80'); await page.locator('[data-action="save-meal"]').click();
    await page.getByRole('button',{name:'月统计',exact:true}).click(); assert.equal(await metric('已知热量合计').innerText(),'80千卡');
    await page.getByRole('button',{name:'回到本月',exact:true}).click(); assert.equal(await page.locator('#statistics-month').inputValue(),await page.evaluate(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}));
    for (const width of [320,360,393,430]) {
      await page.setViewportSize({width,height:852});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`月统计在 ${width}px 下不应横向溢出`);
      assert.ok(await page.locator('.month-day').first().evaluate(node=>node.getBoundingClientRect().height>=44));
    }
    await page.setViewportSize({width:393,height:852}); await page.getByRole('button',{name:'我的',exact:true}).click();
    await page.locator('[data-action="open-appearance"]').click(); await page.locator('[data-theme-id="plum"]').click();
    await page.waitForFunction(()=>!document.querySelector('.theme-option:disabled')); await openMonth('2026-10');
    assert.equal(await page.locator('.month-heading-icon').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(121, 85, 166)');
    assert.equal(await page.locator('.month-trend-bar:not(.missing)').first().evaluate(node=>getComputedStyle(node).fill),'rgb(121, 85, 166)');
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('mumu.preview.records.v1')));
    assert.deepEqual(saved.workouts,data.workouts); assert.deepEqual(saved.meals.slice(0,data.meals.length),data.meals);
    await checkMonthlyAnalysis(browser,errors);
    console.log('PASS: 日历改名、周视图保留、月图标日历、统计去重与未知热量、三类趋势、跨年闰月切换、点日补录、原生返回、主题同步和四种手机宽度。');
  } finally { await context.close(); }
}

async function checkMonthlyAnalysis(browser,errors) {
  const context=await browser.newContext({viewport:{width:393,height:852},locale:'zh-CN',timezoneId:'Asia/Shanghai'});
  await context.addInitScript(()=>{
    const record={id:'pending-entry',date:'2026-10-04',meal:'lunch',foods:[],description:'一碗面',note:'',analysisStatus:'pending',analysisToken:'token-1',updatedAt:1};
    const data={version:1,meals:[record],workouts:[],templates:[]};
    window.NativeBridge={call(method,payload,id){setTimeout(()=>window.nativeResult(JSON.stringify({id,result:method==='init'?{data,native:true,settings:{theme:'blue',hasKey:true}}:{status:'current',available:false},error:null})),10);}};
    window.finishMonthlyAnalysis=()=>{Object.assign(record,{foods:[{name:'面',portion:'一碗',kcal:400},{name:'鸡蛋',portion:'一个',kcal:80}],analysisStatus:'done',title:'一碗面',updatedAt:2});window.mealAnalysisUpdated(JSON.stringify(record));};
  });
  try {
    const page=await context.newPage(); page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:4173'); await page.getByRole('button',{name:'日历',exact:true}).click();
    await page.locator('#history-date').fill('2026-10-04'); await page.locator('#history-date').dispatchEvent('change');
    await page.getByRole('button',{name:'月统计',exact:true}).click();
    assert.equal(await page.locator('.month-day[data-date="2026-10-04"] .month-day-energy').innerText(),'分析中');
    const average=()=>page.locator('.month-metric').filter({has:page.getByText('记录日均热量',{exact:true})}).locator('strong');
    assert.equal(await average().innerText(),'—千卡');
    await page.evaluate(()=>window.finishMonthlyAnalysis());
    assert.equal(await average().innerText(),'480千卡');
    assert.equal(await page.locator('.month-day[data-date="2026-10-04"] .month-day-energy').innerText(),'480');
    assert.equal(await page.locator('.month-day-energy.incomplete').count(),0);
    console.log('PASS: 模拟安卓后台 AI 回填，月统计保持当前视图并更新均值、日历热量和待分析提示；未调用真实 AI。');
  } finally {await context.close();}
}
