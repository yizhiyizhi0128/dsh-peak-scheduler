/**
 * 宿主半边测试：峰谷状态响应组装 + 等待任务元数据。
 *
 * 重点核对**对外响应里的每个字段**都能落到官方口径上：
 *   - tier 与 isPeak 一致；
 *   - 折扣口径写成"谷价 = 峰价一半"；
 *   - 日历可用性如实透出（不可用时必须带提示，不能假装精确）；
 *   - rule.text 必须与官方文档一致的关键要素（时间段、周末、节假日、调休）。
 *
 * 运行：node test/host.test.mjs
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { __internals } from '../index.js'

const { buildStatus, makeTitle, setMetaTask, deleteMetaTask, readMeta, metaFile, deferDelaySeconds, partitionTasks, MIN_LEAD_SECONDS } = __internals

let failures = 0
let checks = 0
const skipped = []
function ok(cond, label, detail = '') {
  checks += 1
  if (cond) console.log('  PASS  ' + label + (detail ? '  — ' + detail : ''))
  else {
    failures += 1
    console.error('  FAIL  ' + label + (detail ? '  — ' + detail : ''))
  }
}
function equal(actual, expected, label) {
  ok(Object.is(actual, expected), label + '  (got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected) + ')')
}

console.log('\n[1] buildStatus：结构完整（真实调用，会联网取日历）')
const status = await buildStatus(Date.now())
ok(status.ok === true, 'ok = true')
ok(status.tier === 'peak' || status.tier === 'off-peak', 'tier 合法：' + status.tier)
equal(status.isPeak, status.tier === 'peak', 'isPeak 与 tier 一致')
ok(typeof status.nowLabel === 'string' && status.nowLabel.includes('北京时间'), 'nowLabel 用北京时间标注', status.nowLabel)
equal(status.discountMultiplier, status.isPeak ? 1 : 0.5, '折扣倍率与时段对应')
ok(typeof status.discountLabel === 'string' && status.discountLabel.length > 0, 'discountLabel 非空')
ok(status.calendar !== undefined, '带 calendar 段')
ok(typeof status.calendar.available === 'boolean', 'calendar.available 是布尔值', String(status.calendar.available))
ok(typeof status.calendar.note === 'string' && status.calendar.note.length > 0, 'calendar.note 非空（不含糊）')

console.log('\n[2] 日历可用性必须如实透出')
if (status.calendar.available) {
  ok(status.calendar.note.includes('节假日') || status.calendar.note.includes('缓存'), '可用时说明已结合节假日日历')
  ok(Array.isArray(status.calendar.sources) && status.calendar.sources.length > 0, '记录了数据源：' + (status.calendar.sources || []).join(','))
} else {
  skipped.push('本次未取到节假日日历')
  ok(status.calendar.note.includes('未取得') || status.calendar.note.includes('可能被误判'), '不可用时明确说明后果')
}

console.log('\n[3] rule.text 必须包含官方口径的关键要素')
const rule = status.rule ? status.rule.text : ''
for (const [needle, why] of [
  ['09:00', '上午峰段起点'],
  ['12:00', '上午峰段终点'],
  ['14:00', '下午峰段起点'],
  ['18:00', '下午峰段终点'],
  ['周一至周五', '只看工作日'],
  ['法定节假日', '排除法定节假日'],
  ['周末', '周末属谷价'],
  ['一半', '谷价 = 峰价一半'],
  ['调休', '调休补班的周末仍按谷价'],
  ['北京时间', '时区口径'],
]) {
  ok(rule.includes(needle), 'rule.text 含「' + needle + '」（' + why + '）')
}
ok(typeof status.rule.source === 'string' && status.rule.source.includes('DeepSeek'), '标明了规则来源', status.rule.source)

console.log('\n[4] next / nextOffPeak 字段自洽')
if (status.next !== null) {
  ok(status.next.at > status.now, 'next.at 在未来')
  equal(status.next.inMs, status.next.at - status.now, 'inMs 与 at 自洽')
  ok(status.next.toTier === 'peak' || status.next.toTier === 'off-peak', 'toTier 合法')
  ok(status.next.toTier !== status.tier, 'toTier 与当前时段相反')
  ok(String(status.next.atLabel).includes('北京时间'), 'next.atLabel 带时区标注')
}
if (status.nextOffPeak.at !== null) {
  equal(status.nextOffPeak.inMs, status.nextOffPeak.at - status.now, 'nextOffPeak.inMs 自洽')
  ok(status.nextOffPeak.at >= status.now, 'nextOffPeak 不在过去')
  if (status.isPeak) {
    ok(!status.nextOffPeak.alreadyOffPeak, '峰价时 alreadyOffPeak = false')
    ok(status.nextOffPeak.at > status.now, '峰价时谷价起点在未来')
  } else {
    equal(status.nextOffPeak.alreadyOffPeak, true, '谷价时 alreadyOffPeak = true')
    equal(status.nextOffPeak.at, status.now, '谷价时返回当前时刻')
  }
}

console.log('\n[5] 任务标题')
equal(makeTitle('写一份周报'), '[峰谷] 写一份周报', '短标题原样保留')
const longTitle = makeTitle('甲'.repeat(80))
ok(longTitle.startsWith('[峰谷] '), '长标题带前缀')
ok(longTitle.endsWith('…'), '长标题被截断并加省略号')
ok(longTitle.length <= 40, '标题长度可控（' + longTitle.length + '）')
equal(makeTitle('  多   空格\n换行  '), '[峰谷] 多 空格 换行', '空白被折叠')

console.log('\n[6] 元数据读写（独立临时目录）')
{
  const home = mkdtempSync(join(tmpdir(), 'peak-meta-'))
  const savedHome = process.env.DSH_HOME
  try {
    process.env.DSH_HOME = home
    const initial = readMeta()
    equal(initial.version, 1, '初始结构带 version')
    equal(Object.keys(initial.tasks).length, 0, '初始没有任务')

    setMetaTask('sched-1', { sessionId: 's1', title: 'T', targetAt: 123, targetLabel: 'L' })
    ok(existsSync(metaFile()), '写入了 meta 文件')
    const after = readMeta()
    equal(after.tasks['sched-1'].title, 'T', '读回任务')
    equal(after.tasks['sched-1'].targetAt, 123, '读回目标时刻')

    setMetaTask('sched-2', { sessionId: 's1', title: 'T2' })
    equal(Object.keys(readMeta().tasks).length, 2, '两条任务')
    deleteMetaTask('sched-1')
    const remaining = readMeta().tasks
    equal(Object.keys(remaining).length, 1, '删除后剩一条')
    equal(remaining['sched-2'].title, 'T2', '删掉的是正确那条')
    deleteMetaTask('nonexistent')
    equal(Object.keys(readMeta().tasks).length, 1, '删除不存在的 id 不出错')
  } finally {
    if (savedHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = savedHome
    rmSync(home, { recursive: true, force: true })
  }
}

console.log('\n[7] 元数据损坏时不崩（回退为空）')
{
  const home = mkdtempSync(join(tmpdir(), 'peak-meta-bad-'))
  const savedHome = process.env.DSH_HOME
  try {
    process.env.DSH_HOME = home
    const { mkdirSync, writeFileSync } = await import('node:fs')
    mkdirSync(join(home, 'peak-scheduler'), { recursive: true })
    writeFileSync(metaFile(), 'this is not json', 'utf8')
    const recovered = readMeta()
    equal(recovered.version, 1, '损坏文件回退为初始结构')
    equal(Object.keys(recovered.tasks).length, 0, '不抛错、不返回垃圾')
  } finally {
    if (savedHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = savedHome
    rmSync(home, { recursive: true, force: true })
  }
}

console.log('\n[8] 回归：推迟用的延迟必须恒为正、且落在未来')
{
  // 线上故障：当前已是谷价时 nextOffPeak.at == 此刻，把这个时刻当 `at` 交给官方 schedule
  // 会被「The scheduled time must be strictly in the future.」拒绝。
  // 现在统一走 after_seconds，这里把"恒为正 / 结果在未来"钉死。
  ok(Number.isInteger(MIN_LEAD_SECONDS) && MIN_LEAD_SECONDS >= 1, '最小提前量是正整数：' + MIN_LEAD_SECONDS)

  const cases = [
    // 已经是谷价 → 目标就是此刻（这就是出事的那个 case）
    { name: '已在谷价（目标=此刻）', nextOffPeak: { at: 1_000_000 } , now: 1_000_000 },
    { name: '已在谷价且已过去', nextOffPeak: { at: 999_000 }, now: 1_000_000 },
    // 峰价中 → 目标在未来
    { name: '峰价中（2 小时后）', nextOffPeak: { at: 1_000_000 + 7200_000 }, now: 1_000_000 },
    // 目标刚好差 0.4 秒 → 向上取整后必须 ≥ 1
    { name: '目标仅差 0.4 秒', nextOffPeak: { at: 1_000_400 }, now: 1_000_000 },
    { name: '目标仅差 1 毫秒', nextOffPeak: { at: 1_000_001 }, now: 1_000_000 },
    { name: '算不出目标（null）', nextOffPeak: { at: null }, now: 1_000_000 },
    { name: 'nextOffPeak 整个缺失', nextOffPeak: undefined, now: 1_000_000 },
  ]
  for (const item of cases) {
    const seconds = deferDelaySeconds({ nextOffPeak: item.nextOffPeak }, item.now)
    ok(Number.isInteger(seconds) && seconds >= MIN_LEAD_SECONDS, item.name + '：延迟是 ≥' + MIN_LEAD_SECONDS + ' 的整数（' + seconds + '）')
    ok(item.now + seconds * 1000 > item.now, item.name + '：建成的时间点严格在未来')
  }

  // 真实状态也要满足
  for (const offsetMs of [0, 60_000, 3600_000, 12 * 3600_000, 26 * 3600_000]) {
    const probe = await buildStatus(Date.now() + offsetMs)
    const seconds = deferDelaySeconds(probe, probe.now)
    ok(
      Number.isInteger(seconds) && seconds >= MIN_LEAD_SECONDS,
      '+ ' + offsetMs / 60000 + ' 分钟时：延迟 ' + seconds + ' 秒（tier=' + probe.tier + '）',
    )
  }
}

console.log('\n[9] 回归：已投递的任务不能算作「等待中」')
{
  // 线上故障：一次性任务投递完成后官方会把它**保留为 inactive**（设计如此）。
  // 旧实现只按"是不是我建的任务"筛选，于是跑完的任务永远挂在侧边栏角标上，
  // 角标一直显示 1，点开却是个已经执行过的任务。
  const meta = {
    version: 1,
    tasks: {
      'sched-waiting': { sessionId: 's1', promptPreview: '还没到点', targetAt: 111, targetLabel: 'L1' },
      'sched-done': { sessionId: 's1', promptPreview: '已经跑完', targetAt: 222, targetLabel: 'L2' },
      'sched-other-session': { sessionId: 's2', promptPreview: '别的会话', targetAt: 333, targetLabel: 'L3' },
    },
  }
  const records = [
    { id: 'sched-waiting', sessionId: 's1', title: 'A', status: 'active', kind: 'after', scheduledAt: '2026-10-06T05:00:00.000Z' },
    { id: 'sched-done', sessionId: 's1', title: 'B', status: 'inactive', kind: 'after', scheduledAt: '2026-10-06T04:29:35.196Z' },
    { id: 'sched-other-session', sessionId: 's2', title: 'C', status: 'active', kind: 'after', scheduledAt: '2026-10-06T06:00:00.000Z' },
    // 官方自己建的提醒（没有我们的元数据）→ 不算峰谷任务
    { id: 'official-1', sessionId: 's1', title: '官方提醒', status: 'active', kind: 'daily', scheduledAt: '2026-10-07T01:00:00.000Z' },
  ]

  const global = partitionTasks(records, meta, '')
  equal(global.tasks.length, 2, '全局：等待中 2 个（active 的峰谷任务）')
  ok(global.tasks.every((row) => row.id !== 'sched-done'), '全局：已投递的不在等待中')
  equal(global.delivered.length, 1, '全局：已投递单列 1 个')
  equal(global.delivered[0].id, 'sched-done', '已投递的就是那条 inactive')
  equal(global.otherTasks.length, 1, '官方提醒归入 otherTasks（不伪装成峰谷任务）')
  equal(global.otherTasks[0].id, 'official-1', 'otherTasks 是官方那条')
  ok(
    global.tasks.every((row) => row.isPeakTask && row.waiting),
    '等待中的每一行都同时满足「是本插件建的」+「status !== inactive」',
  )

  const scoped = partitionTasks(records, meta, 's2')
  equal(scoped.tasks.length, 1, '限定会话后只剩该会话的等待中任务')
  equal(scoped.tasks[0].id, 'sched-other-session', '限定会话筛选正确')

  const emptySession = partitionTasks(records, meta, 's-unknown')
  equal(emptySession.tasks.length, 0, '不存在的会话 → 0 个等待中')
  equal(emptySession.otherTasks.length, 0, '不存在的会话 → otherTasks 也为空')

  const noMeta = partitionTasks(records, { version: 1, tasks: {} }, '')
  equal(noMeta.tasks.length, 0, '没有元数据时，任何任务都不算作峰谷任务')

  equal(partitionTasks([], meta, '').tasks.length, 0, '空目录不崩')
  equal(partitionTasks(undefined, meta, '').tasks.length, 0, 'undefined 目录不崩')
}

console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILED') + '  (' + checks + ' checks)')
if (skipped.length > 0) console.log('跳过：' + skipped.join('；'))
process.exit(failures === 0 ? 0 : 1)
