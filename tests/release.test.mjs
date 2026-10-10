import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const fixture = Buffer.from('release test fixture');
const sha = createHash('sha256').update(fixture).digest('hex');
const tag = 'build-100987';
const old = { id: 7, tag_name: 'build-100986', draft: false, assets: [] };
const current = { id: 8, tag_name: tag, draft: false, assets: [] };
let sequence = 0;

async function scenario(kind, verify) {
  const path = new URL('../build/mumu-health-100987.apk', import.meta.url);
  await mkdir(new URL('../build/', import.meta.url), { recursive: true });
  await writeFile(path, fixture);
  const savedFetch = globalThis.fetch;
  const keys = ['GITHUB_REPOSITORY', 'GITHUB_TOKEN', 'GITHUB_RUN_NUMBER', 'GITHUB_SHA'];
  const savedEnvironment = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { GITHUB_REPOSITORY: 'lshhdse/mumuhealth', GITHUB_TOKEN: 'fixture-only', GITHUB_RUN_NUMBER: '987', GITHUB_SHA: 'fixture-commit' });
  const calls = []; let lists = 0;
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url), method = options.method || 'GET';
    calls.push({ path: parsed.pathname, method });
    let body = {}, status = 200;
    if (parsed.pathname.endsWith('/releases') && method === 'GET') {
      lists++;
      body = kind === 'newer' ? [{ ...current, tag_name: 'build-100988' }] :
        kind === 'retry' || lists > 1 ? [old, current] : [old];
    } else if (parsed.hostname === 'uploads.github.com') {
      if (kind === 'upload-fails') { status = 500; body = { message: 'fixture upload failure' }; }
      else body = { digest: `sha256:${sha}` };
    } else if (method === 'POST') {
      body = { ...current, draft: true, upload_url: 'https://uploads.github.com/repos/lshhdse/mumuhealth/releases/8/assets{?name,label}' };
    } else if (method === 'DELETE') status = 204;
    return { status, ok: status < 400, text: async () => JSON.stringify(body), json: async () => body };
  };
  try {
    const publish = import(`../tools/publish-latest.mjs?fixture=${++sequence}`);
    await verify(publish, calls);
  } finally {
    globalThis.fetch = savedFetch;
    for (const key of keys) savedEnvironment[key] === undefined ? delete process.env[key] : process.env[key] = savedEnvironment[key];
    await unlink(path);
  }
}

test('上传失败时保留旧 Release，不执行删除', () => scenario('upload-fails', async (publish, calls) => {
  await assert.rejects(publish, /上传 APK 失败/);
  assert.equal(calls.some(call => call.method === 'DELETE'), false);
}));
test('新版本发布成功后删除旧 Release 和标签，保留当前版本', () => scenario('success', async (publish, calls) => {
  await publish;
  const published = calls.findIndex(call => call.method === 'PATCH');
  const deleted = calls.findIndex(call => call.method === 'DELETE');
  assert.ok(published >= 0 && deleted > published);
  assert.deepEqual(calls.filter(call => call.method === 'DELETE').map(call => call.path), [
    '/repos/lshhdse/mumuhealth/releases/7', '/repos/lshhdse/mumuhealth/git/refs/tags/build-100986',
  ]);
}));
test('重复运行已发布版本时继续清理旧版本', () => scenario('retry', async (publish, calls) => {
  await publish;
  assert.equal(calls.some(call => call.method === 'POST'), false);
  assert.equal(calls.filter(call => call.method === 'DELETE').length, 2);
}));
test('重新运行旧构建不能删除或覆盖更新的 Release', () => scenario('newer', async (publish, calls) => {
  await assert.rejects(publish, /仓库已有更新的安装包/);
  assert.equal(calls.some(call => call.method !== 'GET'), false);
}));
