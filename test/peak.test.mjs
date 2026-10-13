/**
 * 峰谷判定单测。
 *
 * 规则来自官方文档（中英两版互相校验过）：
 *   北京时间 周一至周五（不含中国法定节假日）09:00–12:00、14:00–18:00 为峰价；
 *   其余（含周末与法定节假日全天）为谷价；谷价 = 峰价一半。
 *
 * 这里把所有边界都钉住：09:00 整进入峰、12:00 整退出、14:00 进、18:00 出，
 * 以及周末、节假日、跨日、跨周末的下一谷价起点。
 *
 * 运行：node test/peak.test.mjs
 */
import {
  peakStatus,
  nextTransition,
  nextOffPeakStart,
  beijingParts,
  beijingDateKey,
  beijingToEpoch,
  classifyDay,
  humanizeDuration,
  formatBeijing,
} from '../lib/peak.js'

let failures = 0
let checks = 0
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

/** 造一个"北京时间某日某时刻"的绝对毫秒。 */
const bj = (year, month, day, hour, minute = 0) =>
  beijingToEpoch(year, month, day, hour * 60 + minute)

// 2026-10-05 是周一（用已知日期校验一下换算本身）
console.log('\n[0] 北京时间换算自检')
{
  const parts = beijingParts(bj(2026, 10, 5, 12, 0))
  equal(parts.year, 2026, '年')
  equal(parts.month, 10, '月')
  equal(parts.day, 5, '日')
  equal(parts.weekday, 1, '2026-10-05 是周一')
  equal(parts.minuteOfDay, 12 * 60, '当日分钟数 = 720')
  equal(beijingDateKey(bj(2026, 10, 5, 0, 30)), '2026-10-05', 'dateKey 按北京时间切日')
  equal(beijingDateKey(bj(2026, 10, 4, 23, 30)), '2026-10-04', '前一日 23:30 仍属前一日')
  // 与英文文档的 UTC 口径对照：09:00 +0800 == 01:00 UTC
  equal(new Date(bj(2026, 10, 5, 9, 0)).getUTCHours(), 1, '北京 09:00 = UTC 01:00（与英文文档一致）')
  equal(new Date(bj(2026, 10, 5, 18, 0)).getUTCHours(), 10, '北京 18:00 = UTC 10:00（与英文文档一致）')
}

console.log('\n[1] 工作日 09:00–12:00 / 14:00–18:00 为峰价（逐分钟边界）')
{
  const mon = (hour, minute = 0) => bj(2026, 10, 5, hour, minute)
  const cases = [
    [8, 59, false, '08:59 谷'],
    [9, 0, true, '09:00 峰（左闭）'],
    [9, 1, true, '09:01 峰'],
    [11, 59, true, '11:59 峰'],
    [12, 0, false, '12:00 谷（右开）'],
    [12, 30, false, '12:30 谷（午休）'],
    [13, 59, false, '13:59 谷'],
    [14, 0, true, '14:00 峰（左闭）'],
    [17, 59, true, '17:59 峰'],
    [18, 0, false, '18:00 谷（右开）'],
    [23, 59, false, '23:59 谷'],
    [0, 0, false, '00:00 谷'],
  ]
  for (const [hour, minute, expected, label] of cases) {
    const status = peakStatus(mon(hour, minute), undefined)
    equal(status.isPeak, expected, label)
  }
}

console.log('\n[2] 谷价倍率：谷 = 峰的一半')
{
  const peak = peakStatus(bj(2026, 10, 5, 10, 0), undefined)
  const off = peakStatus(bj(2026, 10, 5, 20, 0), undefined)
  equal(peak.tier, 'peak', '10:00 是峰')
  equal(off.tier, 'off-peak', '20:00 是谷')
  equal(peak.discountMultiplier, 1, '峰价倍率 1')
  equal(off.discountMultiplier, 0.5, '谷价倍率 0.5')
}

console.log('\n[3] 周末全天谷价')
{
  for (const [year, month, day, name] of [
    [2026, 10, 3, '周六'],
    [2026, 10, 4, '周日'],
  ]) {
    for (const hour of [9, 10, 11, 14, 15, 17]) {
      const status = peakStatus(bj(year, month, day, hour, 0), undefined)
      equal(status.isPeak, false, name + ' ' + hour + ':00 谷价')
      equal(status.dayReason, 'weekend', name + ' 判定原因 = weekend')
    }
  }
}

console.log('\n[4] 法定节假日全天谷价')
{
  const holidays = new Set(['2026-10-01', '2026-10-02', '2026-10-06'])
  // 2026-10-06 是周二，本来该是工作日
  equal(beijingParts(bj(2026, 10, 6, 10, 0)).weekday, 2, '2026-10-06 是周二')
  const status = peakStatus(bj(2026, 10, 6, 10, 0), holidays)
  equal(status.isPeak, false, '节假日 10:00 也是谷价')
  equal(status.dayReason, 'holiday', '判定原因 = holiday')
  equal(status.calendarAvailable, true, '日历可用时 calendarAvailable = true')

  // 日历不可用时按工作日规则判定，并标出来
  const noCalendar = peakStatus(bj(2026, 10, 6, 10, 0), undefined)
  equal(noCalendar.isPeak, true, '日历不可用时 10:00 按工作日判成峰价')
  equal(noCalendar.calendarAvailable, false, '同时标出 calendarAvailable = false（界面据此提示）')
}

console.log('\n[5] 下一个切换点')
{
  // 工作日 10:00（峰中）→ 12:00 转谷
  const t1 = nextTransition(bj(2026, 10, 5, 10, 0), undefined)
  equal(t1.toTier, 'off-peak', '峰中转谷')
  equal(formatBeijing(t1.at).includes('12:00'), true, '切换点是 12:00：' + formatBeijing(t1.at))

  // 工作日 13:00（午休谷）→ 14:00 转峰
  const t2 = nextTransition(bj(2026, 10, 5, 13, 0), undefined)
  equal(t2.toTier, 'peak', '谷中转峰')
  equal(formatBeijing(t2.at).includes('14:00'), true, '切换点是 14:00：' + formatBeijing(t2.at))

  // 工作日 20:00（谷）→ 次日 09:00 转峰
  const t3 = nextTransition(bj(2026, 10, 5, 20, 0), undefined)
  equal(t3.toTier, 'peak', '晚间谷 → 转峰')
  equal(formatBeijing(t3.at).includes('2026-10-06'), true, '落在次日：' + formatBeijing(t3.at))
  equal(formatBeijing(t3.at).includes('09:00'), true, '次日 09:00：' + formatBeijing(t3.at))

  // 周五 20:00（谷）→ 跳过周末，落到周一 09:00
  const friday = bj(2026, 10, 9, 20, 0)
  equal(beijingParts(friday).weekday, 5, '2026-10-09 是周五')
  const t4 = nextTransition(friday, undefined)
  equal(formatBeijing(t4.at).includes('2026-10-12'), true, '跨周末落到周一：' + formatBeijing(t4.at))
  equal(formatBeijing(t4.at).includes('09:00'), true, '周一 09:00：' + formatBeijing(t4.at))

  // 周五 10:00（峰中）→ 同日 12:00 即转谷，不该跳到下周一
  const t5 = nextTransition(bj(2026, 10, 9, 10, 0), undefined)
  equal(formatBeijing(t5.at).includes('2026-10-09'), true, '周五峰中仍在同日转谷：' + formatBeijing(t5.at))
  equal(formatBeijing(t5.at).includes('12:00'), true, '同日 12:00：' + formatBeijing(t5.at))
}

console.log('\n[6] 下一个谷价起点')
{
  // 峰中 → 是当前窗口结束
  const p = nextOffPeakStart(bj(2026, 10, 5, 10, 0), undefined)
  equal(p.alreadyOffPeak, false, '峰中：不是已经谷价')
  equal(formatBeijing(p.at).includes('12:00'), true, '谷价从 12:00 开始：' + formatBeijing(p.at))

  // 下午峰中 → 18:00
  const p2 = nextOffPeakStart(bj(2026, 10, 5, 15, 0), undefined)
  equal(formatBeijing(p2.at).includes('18:00'), true, '下午峰 → 18:00：' + formatBeijing(p2.at))

  // 已经谷价 → 立刻就是
  const p3 = nextOffPeakStart(bj(2026, 10, 5, 20, 0), undefined)
  equal(p3.alreadyOffPeak, true, '晚间：已经是谷价')
  equal(p3.at, bj(2026, 10, 5, 20, 0), '返回当前时刻')
}

console.log('\n[7] 节假日与周末对"下一个谷价"的影响：已是谷价就不必推迟')
{
  const holidays = new Set(['2026-10-06'])
  const tuesday = bj(2026, 10, 6, 10, 0)
  const withCalendar = nextOffPeakStart(tuesday, holidays)
  equal(withCalendar.alreadyOffPeak, true, '节假日（周二）10:00 已经是谷价，无需推迟')
  const withoutCalendar = nextOffPeakStart(tuesday, undefined)
  equal(withoutCalendar.alreadyOffPeak, false, '日历不可用时按工作日判成峰价，会给出推迟时间')
}

console.log('\n[8] 跨月跨年')
{
  // 2026-12-31 是周四；20:00 后下一个峰价应是 2027-01-01（周五）09:00
  const nye = bj(2026, 12, 31, 20, 0)
  equal(beijingParts(nye).weekday, 4, '2026-12-31 是周四')
  const t = nextTransition(nye, undefined)
  equal(formatBeijing(t.at).includes('2027-01-01'), true, '跨年落到 2027-01-01：' + formatBeijing(t.at))

  // 若 2027-01-01 是节假日，则再往后
  const withHoliday = nextTransition(nye, new Set(['2027-01-01']))
  equal(formatBeijing(withHoliday.at).includes('2027-01-01'), false, '节假日被跳过：' + formatBeijing(withHoliday.at))
}

console.log('\n[9] 辅助函数')
{
  equal(humanizeDuration(90 * 1000), '1 分钟', '90 秒 → 1 分钟')
  equal(humanizeDuration(2 * 3600 * 1000 + 30 * 60 * 1000), '2 小时 30 分钟', '2h30m')
  equal(humanizeDuration(25 * 3600 * 1000), '1 天 1 小时 0 分钟', '25 小时')
  equal(humanizeDuration(-5), '已到', '负数视为已到')
  equal(humanizeDuration(null), '未知', 'null → 未知')
  equal(classifyDay(bj(2026, 10, 5, 12, 0), undefined).reason, 'workday', '工作日判定')
}

console.log('\n[10] 无需日历也不能崩：horizonDays 边界')
{
  const t = nextTransition(bj(2026, 10, 5, 10, 0), undefined, 0)
  ok(t !== null, 'horizon=0 时同日的峰结束仍能找到')
  const far = nextTransition(bj(2026, 10, 5, 10, 0), undefined, 1)
  ok(far !== null, 'horizon=1 正常')
}

console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILED') + '  (' + checks + ' checks)')
process.exit(failures === 0 ? 0 : 1)
