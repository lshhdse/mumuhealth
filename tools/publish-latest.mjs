import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const run = Number(process.env.GITHUB_RUN_NUMBER);
if (repository !== 'lshhdse/mumuhealth' || !token || !Number.isSafeInteger(run) || run < 1) throw new Error('GitHub 发布环境无效。');
const code = 100000 + run;
const tag = `build-${code}`;
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const version = `${manifest.version}.${run}`;
const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const section = changelog.split(/^## /m).slice(1).find(section => section.split(/\r?\n/, 1)[0].trim() === manifest.version);
const notes = section?.slice(section.indexOf('\n') + 1).trim();
if (!notes || notes.length > 6000) throw new Error(`请在 CHANGELOG.md 中填写 ${manifest.version} 的更新说明（最多 6000 字）。`);
const filename = `mumu-health-${code}.apk`;
const apk = await readFile(new URL(`../build/${filename}`, import.meta.url));
const digest = createHash('sha256').update(apk).digest('hex');
const updateManifest = Buffer.from(JSON.stringify({
  format: 'mumu-update-v1', packageName: 'com.mumu.health', tag_name: tag, name: `沐沐健康 ${version}`, releaseNotes: notes,
  assets: [{ name: filename, browser_download_url: `https://github.com/${repository}/releases/download/${tag}/${filename}`, digest: `sha256:${digest}`, size: apk.length }],
}, null, 2));
const api = `https://api.github.com/repos/${repository}`;
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'mumu-health-release' };
const releaseBody = `${notes}\n\nAndroid 安装包\n\nSHA256: ${digest}`;

async function request(path, options = {}) {
  const response = await fetch(`${api}${path}`, { ...options, headers: { ...headers, ...options.headers } });
  if (response.status === 204) return null;
  const body = await response.text();
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${body.slice(0, 500)}`);
  return body ? JSON.parse(body) : null;
}

async function allReleases() {
  const result = [];
  for (let page = 1; ; page++) {
    const chunk = await request(`/releases?per_page=100&page=${page}`);
    result.push(...chunk);
    if (chunk.length < 100) return result;
  }
}

const existing = await allReleases();
if (existing.some(release => /^build-\d+$/.test(release.tag_name) && Number(release.tag_name.slice(6)) > code && !release.draft)) {
  throw new Error('仓库已有更新的安装包，拒绝将旧构建设为最新版。');
}
let draft = existing.find(release => release.tag_name === tag);
if (draft && !draft.draft) {
  console.log(`${tag} 已发布，继续检查旧版本清理。`);
} else {
  if (!draft) draft = await request('/releases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag_name: tag, target_commitish: process.env.GITHUB_SHA, name: `沐沐健康 ${version}`, body: releaseBody, draft: true, prerelease: false }) });
  for (const asset of draft.assets ?? []) await request(`/releases/assets/${asset.id}`, { method: 'DELETE' });
  for (const [name, bytes, type] of [[filename, apk, 'application/vnd.android.package-archive'], ['update.json', updateManifest, 'application/json']]) {
    const uploadUrl = draft.upload_url.split('{')[0] + `?name=${name}`;
    const upload = await fetch(uploadUrl, { method: 'POST', headers: { ...headers, 'Content-Type': type, 'Content-Length': String(bytes.length) }, body: bytes });
    if (!upload.ok) throw new Error(`上传 ${name.endsWith('.apk') ? 'APK' : '更新信息'} 失败：${upload.status} ${(await upload.text()).slice(0, 500)}`);
    const asset = await upload.json();
    const expectedDigest = createHash('sha256').update(bytes).digest('hex');
    if (asset.digest && asset.digest !== `sha256:${expectedDigest}`) throw new Error(`GitHub 返回的 ${name} 摘要与本地不一致。`);
  }
  await request(`/releases/${draft.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: false, prerelease: false, make_latest: 'true', body: releaseBody }) });
  console.log(`已发布 ${tag}，SHA256 ${digest}`);
}

for (const old of await allReleases()) {
  if (old.id === draft.id) continue;
  await request(`/releases/${old.id}`, { method: 'DELETE' });
  if (old.tag_name && old.tag_name !== tag) {
    try { await request(`/git/refs/tags/${encodeURIComponent(old.tag_name)}`, { method: 'DELETE' }); }
    catch (error) { console.warn(`已删除旧 Release，但未能删除标签 ${old.tag_name}: ${error.message}`); }
  }
  console.log(`已删除旧版本 ${old.tag_name}`);
}
