import test from 'node:test';
import assert from 'node:assert/strict';
import { colorModeId, resolvedColorMode } from '../app/src/main/assets/web/appearance.mjs';
test('旧外观设置默认跟随系统，非法模式安全回退', () => {
  for (const value of [undefined,null,'invalid','']) {
    assert.equal(colorModeId(value),'system');
    assert.equal(resolvedColorMode(value,true),'dark');
    assert.equal(resolvedColorMode(value,false),'light');
  }
});
test('手动明暗模式优先于系统状态', () => {
  for (const dark of [false,true]) {
    assert.equal(resolvedColorMode('dark',dark),'dark');
    assert.equal(resolvedColorMode('light',dark),'light');
  }
  assert.equal(resolvedColorMode('system',true),'dark');
  assert.equal(resolvedColorMode('system',false),'light');
});
