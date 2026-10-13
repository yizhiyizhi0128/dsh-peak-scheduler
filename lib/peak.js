/**
 * 峰谷判定的纯逻辑（无 IO，可单测）。
 *
 * ── 规则来源（不靠记忆，逐条核对过官方两版文档）──────────────────────────
 * 中文文档：
 *   「北京时间周一至周五（不含中国法定节假日）9:00 - 12:00、14:00 - 18:00 为高峰时段；
 *     其余时段，包括周末及中国法定节假日全天均为空闲时段。」
 * 英文文档：
 *   "Peak hours are 01:00 - 04:00 and 06:00 - 10:00 UTC, Monday through Friday,
 *    excluding Chinese public holidays. All other hours are off-peak..."
 *   两者同一口径：09:00 +0800 = 01:00 UTC，12:00 +0800 = 04:00 UTC，
 *   14:00 +0800 = 06:00 UTC，18:00 +0800 = 10:00 UTC。✔ 自洽。
 *
 * 谷价 = 峰价的一半（两版文档一致）。
 *
 * ── 为什么统一换算到北京时间 ─────────────────────────────────────────────
 * 规则本身是以北京时间（UTC+8）定义的。用固定 +08:00 偏移换算，
 * 不依赖运行机器的本地时区，也不依赖 ICU —— 中国自 1991 年起全境单一时区、无夏令时，
 * 所以固定偏移就是精确的。
 */

/** 北京时间固定偏移（分钟）。 */
export const BEIJING_OFFSET_MINUTES = 8 * 60
/** 峰价时段（北京时间，[起, 止) 半开区间）。 */
export const PEAK_WINDOWS = [
  { start: 9 * 60, end: 12 * 60, label: '09:00–12:00' },
  { start: 14 * 60, end: 18 * 60, label: '14:00–18:00' },
]

const pad = (value) => String(value).padStart(2, '0')
/**
 * 把绝对时刻换算成"北京时间的日历刻度"。
 * @param date - 任意 Date 或毫秒时间戳。
 * @returns 北京时间的年、月、日、星期、当日分钟数。
 */
export function beijingParts(date) {
  const ms = date instanceof Date ? date.getTime() : Number(date)
  const shifted = new Date(ms + BEIJING_OFFSET_MINUTES * 60 * 1000)
  // 用 UTC getter 读"位移后的墙上时间"，等价于读北京时间的墙上时间。
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    /** 0 = 周日 … 6 = 周六 */
    weekday: shifted.getUTCDay(),
    minuteOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  }
}

/** 北京时间的 YYYY-MM-DD。 */
export function beijingDateKey(date) {
  const parts = beijingParts(date)
  return parts.year + '-' + pad(parts.month) + '-' + pad(parts.day)
}

/** 把"北京时间的某日某分钟"换算回绝对毫秒。 */
export function beijingToEpoch(year, month, day, minuteOfDay) {
  const utcMs = Date.UTC(year, month - 1, day, 0, minuteOfDay, 0, 0)
  return utcMs - BEIJING_OFFSET_MINUTES * 60 * 1000
}

/** 在某个北京日历日上加减天数，返回 {year, month, day, weekday}。 */
export function shiftBeijingDay(date, deltaDays) {
  const parts = beijingParts(date)
  const at = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + deltaDays))
  return {
    year: at.getUTCFullYear(),
    month: at.getUTCMonth() + 1,
    day: at.getUTCDate(),
    weekday: at.getUTCDay(),
  }
}

/**
 * 判断某个北京日历日是否峰价日：周一到周五，且不是中国法定节假日。
 * @param holidayDays - Set<'YYYY-MM-DD'>；为 undefined 时表示"日历不可用"。
 * @returns {isPeakDay, reason}
 */
export function classifyDay(date, holidayDays) {
  const parts = beijingParts(date)
  const key = beijingDateKey(date)
  const weekend = parts.weekday === 0 || parts.weekday === 6
  if (weekend) return { isPeakDay: false, reason: 'weekend', key }
  if (holidayDays instanceof Set && holidayDays.has(key)) return { isPeakDay: false, reason: 'holiday', key }
  return { isPeakDay: true, reason: 'workday', key }
}

/**
 * 当前处于峰价还是谷价。
 * @param now - 当前时刻。
 * @param holidayDays - 法定节假日集合；undefined 表示日历不可用（此时按工作日规则判定，
 *   并在返回值里标出 calendarAvailable=false，让界面能如实提示"可能偏保守"）。
 * @returns 状态对象。
 */
export function peakStatus(now, holidayDays) {
  const at = now instanceof Date ? now : new Date(Number(now))
  const parts = beijingParts(at)
  const day = classifyDay(at, holidayDays)
  const calendarAvailable = holidayDays instanceof Set

  let window = null
  if (day.isPeakDay) {
    for (const candidate of PEAK_WINDOWS) {
      if (parts.minuteOfDay >= candidate.start && parts.minuteOfDay < candidate.end) {
        window = candidate
        break
      }
    }
  }

  const isPeak = window !== null
  return {
    isPeak,
    /** 'peak' | 'off-peak' */
    tier: isPeak ? 'peak' : 'off-peak',
    /** 谷价相对峰价的倍率（官方：谷价 = 峰价一半）。 */
    discountMultiplier: isPeak ? 1 : 0.5,
    dateKey: day.key,
    weekday: parts.weekday,
    minuteOfDay: parts.minuteOfDay,
    dayReason: day.reason,
    window: window === null ? null : window.label,
    calendarAvailable,
    observedAt: at.getTime(),
    next: nextTransition(at, holidayDays),
  }
}

/**
 * 下一个峰↔谷切换的时刻。
 *
 * 不用"逐边界试探"那种绕法：切换点只有两类——
 *   · 处于峰价 → 切换点就是**当前窗口的结束时刻**（12:00 或 18:00）；
 *   · 处于谷价 → 切换点是**下一个峰价窗口的开始时刻**（同日的 09:00 / 14:00，
 *     或未来某个工作日的 09:00；周末与节假日全天谷，直接跳过）。
 * 这样每次最多往后找 horizonDays 天，且天然跨月跨年正确。
 *
 * @returns {at, toTier, reason} 或 null（超出视野）。
 */
export function nextTransition(now, holidayDays, horizonDays = 21) {
  const at = now instanceof Date ? now : new Date(Number(now))
  const ms = at.getTime()
  const parts = beijingParts(at)
  const day = classifyDay(at, holidayDays)
  const window = day.isPeakDay
    ? PEAK_WINDOWS.find((candidate) => parts.minuteOfDay >= candidate.start && parts.minuteOfDay < candidate.end)
    : undefined

  // 情形一：正在峰价窗口内 → 结束即转谷
  if (window !== undefined) {
    return { at: beijingToEpoch(parts.year, parts.month, parts.day, window.end), toTier: 'off-peak', reason: 'window-end' }
  }

  // 情形二：在谷价 → 找下一个峰价窗口起点
  for (let delta = 0; delta <= horizonDays; delta += 1) {
    const dayInfo = shiftBeijingDay(at, delta)
    const key = dayInfo.year + '-' + pad(dayInfo.month) + '-' + pad(dayInfo.day)
    const weekend = dayInfo.weekday === 0 || dayInfo.weekday === 6
    const holiday = holidayDays instanceof Set && holidayDays.has(key)
    if (weekend || holiday) continue // 全天谷价，不是切换点
    for (const candidate of PEAK_WINDOWS) {
      const epoch = beijingToEpoch(dayInfo.year, dayInfo.month, dayInfo.day, candidate.start)
      if (epoch > ms) {
        return {
          at: epoch,
          toTier: 'peak',
          reason: holiday ? 'holiday-end' : weekend ? 'weekend-end' : 'window-start',
        }
      }
    }
  }
  return null
}

/**
 * 下一个谷价时段的起点。
 * 已经处于谷价时返回当前时刻（alreadyOffPeak = true）——
 * 界面上"现在就已是谷价"和"还要等到 X"是两种不同的话术，必须区分。
 *
 * @returns {at, alreadyOffPeak, endsAt} — endsAt 是当前谷价时段的结束（下一个峰价起点）。
 */
export function nextOffPeakStart(now, holidayDays) {
  const at = now instanceof Date ? now : new Date(Number(now))
  const status = peakStatus(at, holidayDays)
  if (!status.isPeak) {
    return {
      at: at.getTime(),
      alreadyOffPeak: true,
      endsAt: status.next === null ? null : status.next.at,
    }
  }
  // 峰价中：谷价从当前窗口结束开始
  const transition = nextTransition(at, holidayDays)
  return {
    at: transition === null ? null : transition.at,
    alreadyOffPeak: false,
    endsAt: null,
  }
}

/** 人可读的"距离 X 还有多久"。 */
export function humanizeDuration(ms) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '未知'
  if (ms <= 0) return '已到'
  const totalMinutes = Math.floor(ms / 60000)
  const days = Math.floor(totalMinutes / (24 * 60))
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
  const minutes = totalMinutes % 60
  const parts = []
  if (days > 0) parts.push(days + ' 天')
  if (hours > 0) parts.push(hours + ' 小时')
  parts.push(minutes + ' 分钟')
  return parts.join(' ')
}

/** 把绝对时刻格式化成北京时间字符串。 */
export function formatBeijing(epoch) {
  if (epoch === null || epoch === undefined) return '未知'
  const parts = beijingParts(epoch)
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return (
    parts.year + '-' + pad(parts.month) + '-' + pad(parts.day) + ' ' +
    weekdays[parts.weekday] + ' ' +
    pad(Math.floor(parts.minuteOfDay / 60)) + ':' + pad(parts.minuteOfDay % 60) +
    '（北京时间）'
  )
}
