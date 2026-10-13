/**
 * 中国法定节假日日历：联网获取 + 本地缓存 + 拿不到就如实降级。
 *
 * ── 数据源 ──────────────────────────────────────────────────────────────
 * NateScarlet/holiday-cn：把《国务院办公厅关于部分节假日安排的通知》整理成 JSON，
 * 每条带 `isOffDay`。实测能取到 2026 年数据，且 `papers` 字段直接给出 gov.cn 通知原文链接。
 * 备用源：timor.tech 的 `holiday/year/<year>/`。
 *
 * ── 只取 isOffDay: true 的日期，为什么 ──────────────────────────────────
 * 这个数据集同时含两类：
 *   · isOffDay: true  → 法定放假日（如 2026-10-01 国庆）
 *   · isOffDay: false → 调休补班日（如 2026-10-10 周六上班）
 * 而 DeepSeek 官方对补班的说明是：
 *   「调休上班的周末、中国法定节假日全天均按空闲时段计费」
 * 也就是**周末无论是否调休都算谷价**，补班日不改变周末的谷价属性。
 * 所以峰谷判定只需要"放假日"集合：周末本身已在规则里判为谷价，
 * 补班日不需要（也不应该）被算成峰价。
 *
 * ── 降级 ────────────────────────────────────────────────────────────────
 * 取不到日历**不猜**：返回 undefined，峰谷模块退化为"仅按工作日规则"判定，
 * 并在响应里带 `calendarAvailable: false`，界面据此如实提示结果可能偏保守。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** 缓存有效期：节假日安排变动极少，一天一次足够。 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
/** 单次请求超时。 */
const FETCH_TIMEOUT_MS = 12000

const SOURCES = [
  {
    id: 'holiday-cn',
    url: (year) => 'https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/' + year + '.json',
    parse: (text) => {
      const data = JSON.parse(text)
      if (!Array.isArray(data.days)) throw new Error('holiday-cn: 缺少 days 数组')
      const offDays = new Set()
      for (const day of data.days) {
        if (day && day.isOffDay === true && typeof day.date === 'string') offDays.add(day.date)
      }
      return { offDays, papers: Array.isArray(data.papers) ? data.papers : [] }
    },
  },
  {
    id: 'timor.tech',
    url: (year) => 'https://timor.tech/api/holiday/year/' + year + '/',
    parse: (text) => {
      const data = JSON.parse(text)
      if (!data || typeof data.holiday !== 'object' || data.holiday === null) throw new Error('timor: 缺少 holiday 对象')
      const offDays = new Set()
      for (const value of Object.values(data.holiday)) {
        // timor 用 holiday: true 表示放假；补班条目是 false，按上面的理由不收。
        if (value && value.holiday === true && typeof value.date === 'string') offDays.add(value.date)
      }
      return { offDays, papers: [] }
    },
  },
]

/**
 * 节假日日历缓存（按年）。
 * 结构：Map<year, {offDays: Set, fetchedAt: number, source: string, papers: string[], stale?: true}>
 */
const calendarCache = new Map()

const log = (message, error) => {
  console.log('[peak-scheduler] ' + message + (error ? '：' + (error && error.message ? error.message : String(error)) : ''))
}

/** 缓存文件路径（存在 DSH_HOME/peak-scheduler/ 下，只存本机）。 */
function cacheFile(home) {
  return join(home, 'peak-scheduler', 'holidays.json')
}

/** 读内存缓存；过期返回 undefined。 */
function readMemory(year) {
  const entry = calendarCache.get(year)
  if (entry === undefined) return undefined
  if (entry.offDays instanceof Set && Date.now() - entry.fetchedAt < CACHE_TTL_MS) return entry
  return undefined
}

/** 从磁盘缓存读（跨进程重启复用）。 */
function readDisk(home, year) {
  const file = cacheFile(home)
  if (!existsSync(file)) return undefined
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'))
    const entry = data && data.years ? data.years[String(year)] : undefined
    if (!entry || !Array.isArray(entry.offDays)) return undefined
    return {
      offDays: new Set(entry.offDays),
      fetchedAt: Number(entry.fetchedAt) || 0,
      source: String(entry.source || 'disk'),
      papers: Array.isArray(entry.papers) ? entry.papers : [],
    }
  } catch {
    return undefined
  }
}

/** 写磁盘缓存（保留其它年份）。 */
function writeDisk(home, year, entry) {
  const file = cacheFile(home)
  try {
    let data = { years: {} }
    if (existsSync(file)) {
      try {
        data = JSON.parse(readFileSync(file, 'utf8'))
        if (!data || typeof data.years !== 'object' || data.years === null) data = { years: {} }
      } catch {
        data = { years: {} }
      }
    }
    data.years[String(year)] = {
      offDays: [...entry.offDays].sort(),
      fetchedAt: entry.fetchedAt,
      source: entry.source,
      papers: entry.papers,
    }
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
  } catch (error) {
    log('写磁盘缓存失败（不影响本次判定）', error)
  }
}

/** 带超时的 fetch。 */
async function fetchText(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' })
    if (!response.ok) throw new Error('HTTP ' + response.status)
    return await response.text()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 取某一年的放假日集合。
 * @param year - 四位年份。
 * @param options - { home, force } — home 用于磁盘缓存位置，force 跳过内存/磁盘新鲜度检查。
 * @returns {offDays, source, papers, fetchedAt, fromCache} 或 undefined（取不到）。
 */
export async function loadHolidays(year, options = {}) {
  const home = options.home
  if (!options.force) {
    const memory = readMemory(year)
    if (memory !== undefined) return { ...memory, fromCache: true }
    if (home !== undefined) {
      const disk = readDisk(home, year)
      if (disk !== undefined && Date.now() - disk.fetchedAt < CACHE_TTL_MS) {
        calendarCache.set(year, disk)
        return { ...disk, fromCache: true }
      }
    }
  }

  for (const source of SOURCES) {
    const url = source.url(year)
    try {
      const text = await fetchText(url)
      const parsed = source.parse(text)
      if (parsed.offDays.size === 0) throw new Error('解析结果为空')
      const entry = {
        offDays: parsed.offDays,
        fetchedAt: Date.now(),
        source: source.id,
        papers: parsed.papers,
      }
      calendarCache.set(year, entry)
      if (home !== undefined) writeDisk(home, year, entry)
      log('已获取 ' + year + ' 年节假日日历：' + entry.offDays.size + ' 天（来源 ' + source.id + '）')
      return { ...entry, fromCache: false }
    } catch (error) {
      log('数据源 ' + source.id + ' 获取 ' + year + ' 年日历失败', error)
    }
  }

  // 全都失败：退回"过期的磁盘缓存"也比没有好，但要标明是过期的。
  if (home !== undefined) {
    const stale = readDisk(home, year)
    if (stale !== undefined) {
      log('所有数据源都失败，改用过期的磁盘缓存（' + new Date(stale.fetchedAt).toISOString() + '）')
      return { ...stale, fromCache: true, stale: true }
    }
  }
  log('所有数据源都失败，且无缓存 → 日历不可用，判定将退化为仅工作日规则')
  return undefined
}

/**
 * 取覆盖某个时刻所需的放假日集合（可能跨年，取相邻两年合并）。
 * @returns {offDays: Set|undefined, calendarAvailable: boolean, sources: string[], stale: boolean}
 */
export async function loadHolidayWindow(now, options = {}) {
  const year = new Date(now).getUTCFullYear()
  // 用北京时间的年份判断更准；这里容错取当年与次年，任一成功即可用。
  const results = []
  for (const candidate of [year, year + 1]) {
    results.push(await loadHolidays(candidate, options))
  }
  const usable = results.filter((entry) => entry !== undefined)
  if (usable.length === 0) {
    return { offDays: undefined, calendarAvailable: false, sources: [], stale: false }
  }
  const offDays = new Set()
  for (const entry of usable) for (const day of entry.offDays) offDays.add(day)
  return {
    offDays,
    calendarAvailable: true,
    sources: [...new Set(usable.map((entry) => entry.source))],
    stale: usable.some((entry) => entry.stale === true),
    fetchedAt: Math.max(...usable.map((entry) => entry.fetchedAt || 0)),
  }
}

/** 测试用：清空内存缓存。 */
export function __clearCache() {
  calendarCache.clear()
}
