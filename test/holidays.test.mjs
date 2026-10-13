/**
 * 节假日日历取用测试：真实联网拉一次，核对已知的 2026 年法定节假日与补班日。
 *
 * 关键断言（对应官方口径「调休上班的周末、中国法定节假日全天均按空闲时段计费」）：
 *   - 放假日集合**只含** isOffDay: true 的日期；
 *   - 调休补班日（2026-10-10 周六、2026-09-20 周日等）**不得**进入放假日集合，
 *     因为周末本来就是谷价，补班不该把它算成峰价；
 *   - 用真实日历跑峰谷判定，2026-10-06（周二、国庆假期内）必须是谷价。
 *
 * 联网失败时跳过（不判失败），但会打印原因。
 *
 * 运行：node test/holidays.test.mjs
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadHolidays, loadHolidayWindow } from '../lib/holidays.js'
import { peakStatus, beijingParts, beijingToEpoch } from '../lib/peak.js'

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

const home = mkdtempSync(join(tmpdir(), 'peak-holidays-'))
const bj = (y, m, d, h, mi = 0) => beijingToEpoch(y, m, d, h * 60 + mi)

try {
  console.log('\n[1] 拉取 2026 年放假日历')
  const entry = await loadHolidays(2026, { home })
  if (entry === undefined) {
    skipped.push('2026 年日历取不到（联网失败？）')
    console.log('  SKIP  取不到日历，跳过后续断言')
  } else {
    const offDays = entry.offDays
    ok(offDays.size >= 30, '放假日数量合理（' + offDays.size + ' 天）', '来源 ' + entry.source)
    equal(offDays instanceof Set, true, '返回 Set')

    console.log('\n[2] 已知放假日必须在内（依据国务院 2026 年放假安排）')
    for (const [date, name] of [
      ['2026-01-01', '元旦'],
      ['2026-02-17', '春节'],
      ['2026-04-05', '清明'],
      ['2026-05-01', '劳动节'],
      ['2026-06-20', '端午'],
      ['2026-09-26', '中秋'],
      ['2026-10-01', '国庆'],
      ['2026-10-07', '国庆末日'],
    ]) {
      ok(offDays.has(date), name + ' ' + date + ' 在放假日集合内')
    }

    console.log('\n[3] 调休补班日**不得**进入放假日集合')
    // 这些是周末上班日；按官方口径周末全天谷价，补班不改变这一点。
    for (const [date, why] of [
      ['2026-10-10', '国庆后补班（周六）'],
      ['2026-09-20', '国庆前补班（周日）'],
      ['2026-02-28', '春节后补班（周六）'],
    ]) {
      ok(!offDays.has(date), why + ' ' + date + ' 不在放假日集合内')
      const weekday = beijingParts(bj(...date.split('-').map(Number), 12, 0)).weekday
      ok(weekday === 0 || weekday === 6, why + ' 确实是周末（weekday=' + weekday + '）')
    }

    console.log('\n[4] 用真实日历跑峰谷判定')
    const tuesday = bj(2026, 10, 6, 10, 0)
    equal(beijingParts(tuesday).weekday, 2, '2026-10-06 是周二')
    const inHoliday = peakStatus(tuesday, offDays)
    equal(inHoliday.isPeak, false, '国庆假期内的周二 10:00 = 谷价')
    equal(inHoliday.dayReason, 'holiday', '判定原因 = holiday')
    equal(inHoliday.calendarAvailable, true, 'calendarAvailable = true')

    // 2026-10-12 是周一、非节假日 → 10:00 应为峰价
    const monday = bj(2026, 10, 12, 10, 0)
    equal(beijingParts(monday).weekday, 1, '2026-10-12 是周一')
    const workday = peakStatus(monday, offDays)
    equal(workday.isPeak, true, '节后正常工作日 10:00 = 峰价')

    console.log('\n[5] 同一时刻：有日历 vs 无日历的差异要能体现出来')
    const withoutCalendar = peakStatus(tuesday, undefined)
    equal(withoutCalendar.isPeak, true, '无日历时被误判成峰价（说明日历确实有用）')
    equal(withoutCalendar.calendarAvailable, false, '并且标出日历不可用')
  }

  console.log('\n[6] 磁盘缓存：第二次不再联网也能拿到')
  const cached = await loadHolidays(2026, { home })
  if (cached !== undefined) {
    equal(cached.fromCache, true, '第二次命中缓存')
    ok(cached.offDays.size >= 30, '缓存内容完整（' + cached.offDays.size + ' 天）')
  }

  console.log('\n[7] loadHolidayWindow 合并相邻年份')
  const window = await loadHolidayWindow(bj(2026, 10, 6, 10, 0), { home })
  if (window.calendarAvailable) {
    equal(window.calendarAvailable, true, 'calendarAvailable = true')
    ok(window.offDays.has('2026-10-01'), '窗口里含 2026 年节假日')
    ok(Array.isArray(window.sources) && window.sources.length > 0, '记录了数据源：' + window.sources.join(','))
  } else {
    skipped.push('loadHolidayWindow 未拿到日历')
  }

  console.log('\n[8] 取不到时如实降级（用不存在的年份 + 无缓存目录）')
  const emptyHome = mkdtempSync(join(tmpdir(), 'peak-empty-'))
  try {
    // 用一个几乎不可能有数据的年份，且禁用网络源不可能——这里只验证"返回 undefined 时不抛"
    const missing = await loadHolidays(1900, { home: emptyHome })
    ok(missing === undefined || (missing.offDays && missing.offDays.size >= 0), '异常年份不抛错，返回 undefined 或空集')
  } finally {
    rmSync(emptyHome, { recursive: true, force: true })
  }
} finally {
  rmSync(home, { recursive: true, force: true })
}

console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILED') + '  (' + checks + ' checks)')
if (skipped.length > 0) console.log('跳过：' + skipped.join('；'))
process.exit(failures === 0 ? 0 : 1)
