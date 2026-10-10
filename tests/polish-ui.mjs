import assert from 'node:assert/strict';

export async function checkPolishedUi(browser, errors) {
  const root = 'http://127.0.0.1:4173';
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: 'zh-CN' });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const action = name => page.locator(`[data-action="${name}"]`).first().click();
  const settle = () => page.evaluate(async () => { await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))); });
  try {
    await page.goto(root);
    await page.getByRole('heading', { name: '今天', exact: true }).waitFor();
    for (const tab of ['history', 'settings', 'today']) {
      const animated = await page.evaluate(tab => {
        document.querySelector(`[data-action="navigate"][data-page="${tab}"]`).click();
        return document.querySelector('#main').getAnimations().length > 0;
      }, tab);
      assert.equal(animated, true, '页面切换应有有限时长的转场');
      await settle();
      assert.equal(await page.getByText('沐沐健康', { exact: true }).count(), 1, '每页只保留统一的品牌标题');
      assert.equal(await page.getByText('每一餐，每一次行动。', { exact: true }).count(), 1);
    }
    await page.locator('[data-page="settings"]').click();
    assert.equal(await page.locator('.mine-summary').count(), 0);
    for (const menu of ['general','appearance','ai','updates']) {
      await action(`open-${menu}`); await settle();
      assert.equal(await page.locator('#app-header .brand-copy strong').innerText(),'沐沐健康');
      await action('settings-back');
    }
    await action('open-templates'); await settle();
    await page.locator('[data-action="edit-template"]').first().click(); await settle();
    await action('delete-template'); await settle();
    assert.equal(await page.evaluate(() => document.querySelector('.dialog').contains(document.activeElement)), true, '弹窗应接管焦点');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'confirm-yes', '焦点不能离开弹窗');
    await page.keyboard.press('Escape');
    await page.locator('#template-name').waitFor();
    await page.getByRole('button',{name:'返回模板列表',exact:true}).click(); await page.locator('.template-list').waitFor();
    await action('close-sheet'); await page.locator('.sheet').waitFor({state:'detached'});
    await page.locator('[data-page="today"]').click();
    await action('add-workout'); await settle();
    // A repeated render of this editor must not replay the opening animation.
    await page.getByLabel('运动 1 名称').fill('慢跑');
    await page.getByLabel('运动 1 时长').fill('20');
    const rerenderAnimated = await page.evaluate(() => {
      document.querySelector('[data-action="add-workout-entry"]').click();
      return document.querySelector('.sheet').getAnimations().length > 0;
    });
    assert.equal(rerenderAnimated, false);
    assert.equal(await page.getByLabel('运动 1 名称').inputValue(), '慢跑');
    await page.getByLabel('运动 2 名称').fill('骑行');
    await page.getByLabel('运动 2 时长').fill('15');
    await action('save-workout'); await page.locator('.sheet').waitFor({state:'detached'});
    await page.locator('.workout-row').first().click(); await action('delete-record');
    await action('confirm-yes'); await page.getByText('记录已删除。',{exact:true}).waitFor();
    await action('add-workout'); await settle();
    const bounds = await page.evaluate(() => {
      const toast = document.querySelector('#toast').getBoundingClientRect();
      const header = document.querySelector('.sheet-header').getBoundingClientRect();
      const footer = document.querySelector('.sheet-footer').getBoundingClientRect();
      return { toastBottom:toast.bottom, headerTop:header.top, footerTop:footer.top, footerBottom:footer.bottom, height:innerHeight };
    });
    assert.ok(bounds.toastBottom <= bounds.headerTop, '删除提示不能遮挡窗口标题或表单');
    assert.ok(bounds.toastBottom < bounds.footerTop && bounds.footerBottom <= bounds.height, '保存按钮保持可见');
    await page.screenshot({path:'build/screenshots/toast-above-editor.png'});
    // Rapid repeated back requests cannot dismiss a subsequent window.
    assert.equal(await page.evaluate(() => { window.handleBack(); return window.handleBack(); }),true);
    await page.locator('.sheet').waitFor({state:'detached'});
    await action('add-workout'); await settle();
    assert.equal(await page.locator('.sheet').count(),1);
    await action('close-sheet'); await page.locator('.sheet').waitFor({state:'detached'});
    for (const width of [320,393,430]) {
      await page.setViewportSize({width,height:852});
      for (const tab of ['today','history','settings']) {
        await page.locator(`[data-page="${tab}"]`).click(); await settle();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),`${tab} 在 ${width}px 不应横向溢出`);
      }
      await action('open-appearance');
      for (const theme of ['blue','sage','plum','rose','amber']) {
        await page.locator(`[data-theme-id="${theme}"]`).click();
        await page.waitForFunction(() => !document.querySelector('.theme-option:disabled'));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
      await action('settings-back');
    }
    await settle(); await page.screenshot({path:'build/screenshots/polished-mine.png'});
  } finally { await context.close(); }
  const quiet = await browser.newContext({ viewport:{width:393,height:852}, reducedMotion:'reduce' });
  try {
    const page = await quiet.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(root); await page.getByRole('heading',{name:'今天',exact:true}).waitFor();
    assert.equal(await page.evaluate(() => {
      document.querySelector('[data-page="history"]').click();
      document.querySelector('[data-action="add-workout"]').click();
      return document.getAnimations().length;
    }),0,'减少动态效果模式下，页面与窗口即时显示');
    await page.locator('[data-action="close-sheet"]').click();
    await page.locator('.sheet').waitFor({state:'detached'});
  } finally { await quiet.close(); }
  console.log('PASS: 品牌去重、各级界面转场、窗口开合、焦点与返回、输入保持、删除提示不遮挡、五主题/手机宽度、减少动态效果。');
}
