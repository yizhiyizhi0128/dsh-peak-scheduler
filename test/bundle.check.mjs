/**
 * 构建产物 + 安装态自检（不依赖浏览器）。
 * esbuild 把非 ASCII 输出成 \uXXXX，断言前先还原。
 *
 * 运行：node test/bundle.check.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
// DSH 安装位置不写死：可用 DSH_HOME / DSH_PROFILE 覆盖，默认 ~/.dsh + desktop。
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const PROFILE_NAME = process.env.DSH_PROFILE || 'desktop'
const PROFILE = join(DSH_HOME, 'profiles', PROFILE_NAME)
const INSTALLED = join(PROFILE, 'node_modules', 'dsh-peak-scheduler')

let bad = 0
function check(cond, label, detail = '') {
  if (!cond) bad += 1
  console.log((cond ? 'OK   ' : 'MISS ') + label + (detail ? '  — ' + detail : ''))
}
const unescape = (text) => text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))

console.log('=== 1. 客户端 bundle ===')
const raw = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
const s = unescape(raw)
for (const needle of [
  '__ModuleLoader__',
  'id: "dsh-peak-scheduler"',
  'conversation.input.right',
  'sidebar.footer.action',
  '/dsh-peak-scheduler',
  '峰谷调度',
  '等待任务',
  '立即开始',
  '推迟到谷价时段自动执行',
  'data-peak-scheduler',
  'data-waiting-count',
]) {
  check(s.includes(needle), needle)
}
check(!/function useState\(/.test(s) && s.includes('require("react")'), 'react 是外部依赖（未打包进 bundle）')

console.log('\n=== 2. 宿主半边 ===')
const host = readFileSync(join(root, 'index.js'), 'utf8')
for (const needle of [
  "inject = ['webServer']",
  'loadHolidayWindow',
  'sessionController',
  "ctx.get('schedule')",
  'peakStatus',
  'nextOffPeakStart',
  'isLocalRequest',
]) {
  check(host.includes(needle), needle)
}

console.log('\n=== 3. 纯逻辑模块 ===')
for (const rel of ['lib/peak.js', 'lib/holidays.js']) {
  check(existsSync(join(root, rel)), rel + ' 存在')
}
const peak = readFileSync(join(root, 'lib', 'peak.js'), 'utf8')
check(peak.includes('9 * 60') && peak.includes('12 * 60'), '峰段 09:00–12:00 写死为常量')
check(peak.includes('14 * 60') && peak.includes('18 * 60'), '峰段 14:00–18:00 写死为常量')
check(!/fetch\(|http/i.test(peak), 'peak.js 不联网（纯判定）')
const holidays = readFileSync(join(root, 'lib', 'holidays.js'), 'utf8')
check(holidays.includes('holiday-cn'), '节假日主数据源为 holiday-cn')
check(holidays.includes('timor.tech'), '有备用数据源')
check(holidays.includes('isOffDay'), '按 isOffDay 判定放假日（不含补班日）')

console.log('\n=== 4. profile 声明 ===')
const profileManifest = join(PROFILE, 'package.json')
if (!existsSync(profileManifest)) {
  console.log('SKIP 找不到 DSH profile：' + PROFILE)
  console.log('     本机未安装 DSH 时属正常；也可用 DSH_HOME / DSH_PROFILE 指定。')
  console.log('     第 4、5 节跳过 —— 注意这是「跳过」，不是「通过」。')
} else {
  const manifest = JSON.parse(readFileSync(profileManifest, 'utf8'))
  check(typeof manifest.dependencies['dsh-peak-scheduler'] === 'string', 'dependencies 里有 dsh-peak-scheduler')
  const bundles = manifest.dsh.profile.bundles
  check(bundles.includes('dsh-peak-scheduler'), 'bundles 里有 dsh-peak-scheduler')
  check(
    bundles.includes('@deepseek-ai/dsh-experimental-schedule-bundle'),
    'bundles 里有官方 schedule bundle（等待任务依赖它）',
  )
  check(
    manifest.dependencies['@deepseek-ai/dsh-experimental-schedule-bundle'] === undefined,
    'schedule bundle 不在 dependencies 里（它不是 npm 包，只能由 profile patch 插入）',
  )

  console.log('\n=== 5. 安装结果 ===')
  check(existsSync(INSTALLED), '已装进 node_modules')
  for (const rel of ['package.json', 'index.js', 'cordis.patch.yml', 'lib/client.js', 'lib/peak.js', 'lib/holidays.js']) {
    check(existsSync(join(INSTALLED, rel)), '  ' + rel + ' 存在')
  }
  const installedClient = readFileSync(join(INSTALLED, 'lib', 'client.js'))
  check(installedClient.equals(readFileSync(join(root, 'lib', 'client.js'))), 'client.js 与构建源逐字节一致')
  check(readFileSync(join(INSTALLED, 'index.js')).equals(readFileSync(join(root, 'index.js'))), 'index.js 一致')
  check(readFileSync(join(INSTALLED, 'lib', 'peak.js')).equals(readFileSync(join(root, 'lib', 'peak.js'))), 'peak.js 一致')
}

console.log('\nbytes(client)=' + Buffer.byteLength(raw, 'utf8') + '  bytes(host)=' + Buffer.byteLength(host, 'utf8'))
console.log(bad === 0 ? 'BUNDLE OK' : bad + ' MISSING')
process.exit(bad === 0 ? 0 : 1)
