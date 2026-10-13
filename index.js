/**
 * dsh-peak-scheduler — 宿主半边。
 *
 * 功能（只做这四件事，不动其它逻辑）：
 *   1. 自动查询模型峰谷价格时段 —— lib/peak.js 判定 + 官方文档口径 + 联网节假日日历；
 *   2. 支持"立即执行 / 推迟到谷价"两种选择（弹窗逻辑在客户端半边）；
 *   3. 推迟的任务落到**官方 schedule 服务**里（耐久存储、到点自动投递回本会话），
 *      并在本地留一条峰谷元数据用于侧边栏展示；
 *   4. 等待中的任务可随时"立即开始"：把提示词作为 prompt 投递进原会话，并删掉等待任务。
 *
 * ── 为什么叠加在官方 schedule 上，而不是自建等待队列 ──────────────────────
 * 官方 dsh-schedule 已经具备：耐久存储、宿主重启后仍可用、每个重复任务补发最近一次
 * 错过的时点、到点唤醒冷会话并把消息投递回原会话、`schedule/changed` 变更通知。
 * 自建一套只会与它在"谁负责投递"上打架，而且重复实现易错。所以这里只负责：
 * 峰谷判定、把"谷价时点"翻译成 schedule 的 `at` 语义、以及"立即开始"。
 *
 * ── 依赖 ────────────────────────────────────────────────────────────────
 * webServer（HTTP 路由）必备；schedule / sessionController 在路由调用时现取，
 * 取不到就返回可读错误，而不是让插件条目 pending 或启动失败。
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { loadHolidayWindow } from './lib/holidays.js'
import { nextOffPeakStart, peakStatus, formatBeijing, humanizeDuration } from './lib/peak.js'

export const name = 'dsh-peak-scheduler'
export const inject = ['webServer']

const ROUTE = '/dsh-peak-scheduler'
const MAX_BODY = 256 * 1024
const MAX_PROMPT = 20000
/**
 * 建等待任务时的最小提前秒数。
 *
 * 官方 schedule 对绝对时点 `at` 要求「**严格**未来」，对 `after_seconds` 要求正安全整数；
 * 而"当前已是谷价"时下一个谷价起点就是**此刻**，直接拿去当目标会被拒
 * （线上实测：`The scheduled time must be strictly in the future.`）。
 * 所以统一走 `after_seconds` 并至少留 2 秒，杜绝取整/采样把它压到 0 或负数。
 */
const MIN_LEAD_SECONDS = 2

const log = (message, error) => {
  console.log('[peak-scheduler] ' + message + (error ? '：' + (error && error.message ? error.message : String(error)) : ''))
}

// ─────────────────────────────────────────────────────────────────────────
// 本地元数据（峰谷侧栏展示用；权威任务数据仍在 schedule 服务里）
// ─────────────────────────────────────────────────────────────────────────

function dshHome() {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv.trim()
  return join(homedir(), '.dsh')
}

function metaFile() {
  return join(dshHome(), 'peak-scheduler', 'meta.json')
}

/**
 * 读元数据。结构：
 * { version: 1, tasks: { [scheduleId]: { sessionId, title, promptPreview, targetAt, targetLabel,
 *   createdAt, calendarAvailable, requestedFrom } } }
 */
function readMeta() {
  const file = metaFile()
  if (!existsSync(file)) return { version: 1, tasks: {} }
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'))
    if (!data || typeof data.tasks !== 'object' || data.tasks === null) return { version: 1, tasks: {} }
    return { version: 1, tasks: data.tasks }
  } catch {
    return { version: 1, tasks: {} }
  }
}

function writeMeta(data) {
  const file = metaFile()
  try {
    mkdirSync(join(dshHome(), 'peak-scheduler'), { recursive: true })
    writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
  } catch (error) {
    log('写元数据失败（不影响任务本身，只是侧栏少一条展示）', error)
  }
}

function setMetaTask(id, entry) {
  const data = readMeta()
  data.tasks[String(id)] = entry
  writeMeta(data)
}

function deleteMetaTask(id) {
  const data = readMeta()
  if (data.tasks[String(id)] === undefined) return
  delete data.tasks[String(id)]
  writeMeta(data)
}

// ─────────────────────────────────────────────────────────────────────────
// HTTP 工具
// ─────────────────────────────────────────────────────────────────────────

function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  })
  res.end(text)
}

function isLocalRequest(req) {
  const origin = req.headers.origin
  if (typeof origin === 'string' && origin !== '') {
    try {
      const host = new URL(origin).hostname
      if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') return false
    } catch {
      return false
    }
  }
  const remote = req.socket && req.socket.remoteAddress
  if (typeof remote === 'string' && remote !== '') {
    const normalized = remote.replace(/^::ffff:/, '')
    if (normalized !== '127.0.0.1' && normalized !== '::1' && normalized !== 'localhost') return false
  }
  return true
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('请求体过大'))
        try {
          req.destroy()
        } catch {
          /* 忽略 */
        }
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

// ─────────────────────────────────────────────────────────────────────────
// 业务
// ─────────────────────────────────────────────────────────────────────────

/** 组装峰谷状态的完整响应（含节假日日历的可用性，供界面如实提示）。 */
async function buildStatus(now) {
  let holidays
  try {
    holidays = await loadHolidayWindow(now)
  } catch (error) {
    log('取节假日日历失败', error)
    holidays = { offDays: undefined, calendarAvailable: false, sources: [], stale: false }
  }
  const status = peakStatus(now, holidays.offDays)
  const nextOffPeak = nextOffPeakStart(now, holidays.offDays)
  return {
    ok: true,
    now: status.observedAt,
    nowLabel: formatBeijing(status.observedAt),
    tier: status.tier,
    isPeak: status.isPeak,
    window: status.window,
    dayReason: status.dayReason,
    discountMultiplier: status.discountMultiplier,
    // 官方口径：谷价 = 峰价的一半
    discountLabel: status.isPeak ? '当前为峰价（标准价）' : '当前为谷价（约为峰价的一半）',
    calendar: {
      available: status.calendarAvailable,
      sources: holidays.sources || [],
      stale: holidays.stale === true,
      // 日历不可用时如实说明后果，而不是假装精确
      note: status.calendarAvailable
        ? holidays.stale === true
          ? '节假日日历来自过期缓存，法定节假日可能被误判为峰价。'
          : '已结合中国法定节假日日历判定。'
        : '未取得节假日日历，当前仅按「工作日 09:00–12:00 / 14:00–18:00」判定，法定节假日可能被误判为峰价。',
    },
    next: status.next === null ? null : {
      at: status.next.at,
      atLabel: formatBeijing(status.next.at),
      toTier: status.next.toTier,
      inMs: status.next.at - status.observedAt,
      inLabel: humanizeDuration(status.next.at - status.observedAt),
    },
    nextOffPeak: {
      at: nextOffPeak.at,
      atLabel: formatBeijing(nextOffPeak.at),
      alreadyOffPeak: nextOffPeak.alreadyOffPeak,
      inMs: nextOffPeak.at === null ? null : nextOffPeak.at - status.observedAt,
      inLabel: nextOffPeak.at === null ? '未知' : humanizeDuration(nextOffPeak.at - status.observedAt),
    },
    rule: {
      source: 'DeepSeek 官方 API 文档「模型 & 价格」',
      text: '北京时间周一至周五（不含中国法定节假日）09:00–12:00、14:00–18:00 为高峰时段；其余时段（含周末与法定节假日全天）为空闲时段。空闲时段价格为高峰时段价格的一半。调休上班的周末同样按空闲时段计费。',
    },
  }
}

/** 取 schedule 服务。 */
function scheduleService(ctx) {
  const service = ctx.get('schedule')
  if (!service || typeof service.create !== 'function') return undefined
  return service
}

/** 取 sessionController 服务。 */
function sessionControllerService(ctx) {
  const service = ctx.get('sessionController')
  if (!service || typeof service.prompt !== 'function') return undefined
  return service
}

/** 造一个给别人看也说得清的任务标题。 */
function makeTitle(prompt) {
  const flat = String(prompt).replace(/\s+/g, ' ').trim()
  const head = flat.length > 34 ? flat.slice(0, 34) + '…' : flat
  return '[峰谷] ' + head
}

/** 把提示词作为 prompt 投递进会话。 */
async function deliverPrompt(ctx, sessionId, prompt, mode = 'queue') {
  const controller = sessionControllerService(ctx)
  if (controller === undefined) throw new Error('宿主没有可用的 sessionController 服务，无法投递提示词')
  const result = await controller.prompt(
    {
      requestId: randomUUID(),
      sessionId,
      mode,
      content: [{ type: 'text', text: prompt }],
      clientTimeZone: resolveClientTimeZone(),
    },
    new AbortController().signal,
  )
  if (result && result.accepted !== true) throw new Error('宿主未接受该提示词')
  return result
}

/** 取本机时区（与浏览器端 resolveClientTimeZone 的意图一致：交给系统）。 */
function resolveClientTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return undefined
  }
}

/**
 * 算「推迟」该用多少秒的延迟。
 *
 * 抽成纯函数是为了能直接单测：官方对绝对时点要求**严格未来**，
 * 而"当前已是谷价"时 nextOffPeak.at 就等于此刻 —— 这个 case 曾经让建任务直接失败。
 * 这里保证返回值恒 ≥ MIN_LEAD_SECONDS，从而建成的时间点恒在未来。
 *
 * @param status - buildStatus 的返回（取 nextOffPeak）。
 * @param now - 计算用的当前时刻。
 * @returns 正整数秒。
 */
export function deferDelaySeconds(status, now) {
  const target = status && status.nextOffPeak ? status.nextOffPeak.at : null
  if (target === null || target === undefined || !Number.isFinite(target)) {
    // 算不出谷价时点：仍给一个最小延迟，让任务至少是"未来"的，由调用方决定是否报错
    return MIN_LEAD_SECONDS
  }
  return Math.max(MIN_LEAD_SECONDS, Math.ceil((target - now) / 1000))
}

// ─────────────────────────────────────────────────────────────────────────
// 路由处理
// ─────────────────────────────────────────────────────────────────────────

async function handleStatus(ctx, res) {
  sendJson(res, 200, await buildStatus(Date.now()))
}

async function handleDefer(ctx, res, payload) {
  const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId.trim() : ''
  const prompt = typeof payload.prompt === 'string' ? payload.prompt : ''
  if (sessionId === '') {
    sendJson(res, 400, { ok: false, error: '缺少 sessionId' })
    return
  }
  if (prompt.trim() === '') {
    sendJson(res, 400, { ok: false, error: '提示词为空，没有什么可以推迟执行' })
    return
  }
  if (prompt.length > MAX_PROMPT) {
    sendJson(res, 400, { ok: false, error: '提示词过长（上限 ' + MAX_PROMPT + ' 字）' })
    return
  }

  const schedule = scheduleService(ctx)
  if (schedule === undefined) {
    sendJson(res, 503, {
      ok: false,
      error: '宿主没有启用 schedule 服务，无法创建等待任务。请在 profile 的插件列表里启用官方 bundle `@deepseek-ai/dsh-experimental-schedule-bundle`。',
      hint: 'schedule-unavailable',
    })
    return
  }

  const now = Date.now()
  const status = await buildStatus(now)
  const target = status.nextOffPeak

  if (target.at === null) {
    sendJson(res, 500, { ok: false, error: '无法计算出下一个谷价时点' })
    return
  }

  // ── 为什么用 after_seconds 而不是 at ────────────────────────────────────
  // 官方对 `at` 的要求是「**严格**未来的绝对时点」（not_future 会直接拒绝）。
  // 而"当前已经是谷价"时，nextOffPeak.at 就等于**此刻**，拿去当 `at` 必然被拒
  // ——这正是线上报的 `The scheduled time must be strictly in the future.`。
  //
  // `after_seconds` 是「正安全整数秒数的延迟」，语义上天然是相对现在、必然在未来，
  // 不受"采样时刻 vs 排队时刻"的竞态影响，也不需要自己拼本地日期时间对象
  // （少一层时区换算就少一处出错的地方）。到点时间仍可从返回记录的
  // `scheduledAt` 读出来展示。
  const afterSeconds = deferDelaySeconds(status, Date.now())
  const plannedAt = Date.now() + afterSeconds * 1000

  let record
  try {
    record = await schedule.create(sessionId, {
      title: makeTitle(prompt),
      prompt,
      after_seconds: afterSeconds,
    })
  } catch (error) {
    log('创建等待任务失败', error)
    sendJson(res, 500, { ok: false, error: '创建等待任务失败：' + String((error && error.message) || error) })
    return
  }

  // 创建成功后核对一次：返回的 scheduledAt 必须真的在未来。
  // 不满足就说明我们对时间语义的理解仍有偏差，此时如实报错，而不是留下一个不会触发的任务。
  const scheduledAtMs = typeof record.scheduledAt === 'string' ? Date.parse(record.scheduledAt) : Number.NaN
  if (Number.isFinite(scheduledAtMs) && scheduledAtMs <= Date.now()) {
    log('等待任务的目标时刻不在未来，已撤销：' + record.scheduledAt)
    try {
      await schedule.delete({ sessionId, id: record.id })
    } catch {
      /* 撤销失败也照样如实报错 */
    }
    sendJson(res, 500, {
      ok: false,
      error: '创建出的等待任务目标时刻不在未来（' + record.scheduledAt + '），已撤销。请重试。',
    })
    return
  }

  setMetaTask(record.id, {
    sessionId,
    title: record.title,
    promptPreview: prompt.slice(0, 160),
    targetAt: Number.isFinite(scheduledAtMs) ? scheduledAtMs : plannedAt,
    targetLabel: Number.isFinite(scheduledAtMs) ? formatBeijing(scheduledAtMs) : formatBeijing(plannedAt),
    alreadyOffPeak: target.alreadyOffPeak,
    afterSeconds,
    createdAt: now,
    calendarAvailable: status.calendar.available,
    tierAtCreation: status.tier,
  })

  log('已创建等待任务 ' + record.id + ' → ' + (record.scheduledAt || formatBeijing(plannedAt)) + '（' + afterSeconds + ' 秒后）')
  sendJson(res, 200, {
    ok: true,
    task: {
      id: record.id,
      title: record.title,
      scheduledAt: record.scheduledAt,
      kind: record.kind,
      afterSeconds,
    },
    target: {
      at: Number.isFinite(scheduledAtMs) ? scheduledAtMs : plannedAt,
      atLabel: Number.isFinite(scheduledAtMs) ? formatBeijing(scheduledAtMs) : formatBeijing(plannedAt),
      alreadyOffPeak: target.alreadyOffPeak,
    },
    status,
  })
}

async function handleRunNow(ctx, res, payload) {
  const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId.trim() : ''
  const id = typeof payload.id === 'string' ? payload.id.trim() : ''
  if (sessionId === '' || id === '') {
    sendJson(res, 400, { ok: false, error: '缺少 sessionId 或等待任务 id' })
    return
  }
  const schedule = scheduleService(ctx)
  if (schedule === undefined) {
    sendJson(res, 503, { ok: false, error: '宿主没有启用 schedule 服务', hint: 'schedule-unavailable' })
    return
  }

  // 任务正文以 schedule 服务里的记录为准（它才是权威数据）。
  // 这里必须用 catalog 而不是 list：官方 list 只返回**活动**任务，
  // 而"已投递但保留为 inactive"的任务也要能被找到（否则报"找不到"、界面状态与实际不符）。
  let record
  try {
    const raw = typeof schedule.catalog === 'function'
      ? await schedule.catalog()
      : await schedule.list({ sessionId })
    const found = (Array.isArray(raw) ? raw : []).find(
      (item) => String(item.id) === id && (item.sessionId === undefined || item.sessionId === sessionId),
    )
    record = found
  } catch (error) {
    log('读取等待任务失败', error)
  }
  if (record === undefined) {
    sendJson(res, 404, { ok: false, error: '找不到该等待任务（可能已被执行或删除）' })
    return
  }
  if (record.status === 'inactive') {
    // 已经投递过了。如实说明并清掉本地元数据，不重复投递。
    deleteMetaTask(record.id)
    sendJson(res, 409, {
      ok: false,
      error: '该任务已经执行过了（已投递，未重复发送）。',
      alreadyDelivered: true,
    })
    return
  }

  try {
    await deliverPrompt(ctx, sessionId, record.prompt, 'queue')
  } catch (error) {
    log('立即执行投递失败', error)
    sendJson(res, 500, { ok: false, error: '投递失败：' + String((error && error.message) || error) })
    return
  }

  // 投递成功后再删等待任务，避免"没执行又被删了"。
  try {
    await schedule.delete({ sessionId, id: record.id })
    deleteMetaTask(record.id)
  } catch (error) {
    // 投递已经完成，删除失败只是会重复投递一次；如实告知，不假装成功。
    log('删除等待任务失败（提示词已投递，可能重复）', error)
    sendJson(res, 200, {
      ok: true,
      delivered: true,
      removed: false,
      warning: '提示词已投递，但等待任务删除失败，可能会再投递一次：' + String((error && error.message) || error),
    })
    return
  }

  log('等待任务 ' + id + ' 已立即执行')
  sendJson(res, 200, { ok: true, delivered: true, removed: true })
}

/**
 * 把 schedule 的目录/列表条目整理成「等待中 / 已投递 / 其它」三组。
 *
 * 抽成纯函数是为了能单测这条关键语义：
 * **一次性任务投递完成后会保留为 `inactive`**（官方设计），
 * 所以"等待中"必须同时满足「是本插件建的」+「status !== 'inactive'」。
 * 只看前者会让跑完的任务永远挂在侧边栏角标上（线上实测过）。
 *
 * @param records - schedule.catalog() 或 list() 的返回。
 * @param meta - readMeta() 的返回。
 * @param sessionId - 传了就只算该会话；空串表示全局（侧边栏视角）。
 */
export function partitionTasks(records, meta, sessionId = '') {
  const all = (Array.isArray(records) ? records : []).map((record) => {
    const extra = (meta && meta.tasks ? meta.tasks[String(record.id)] : undefined) || {}
    return {
      id: record.id,
      sessionId: record.sessionId || extra.sessionId,
      title: record.title,
      scheduledAt: record.scheduledAt,
      kind: record.kind,
      status: record.status,
      promptPreview: extra.promptPreview || '',
      targetAt: extra.targetAt,
      targetLabel: extra.targetLabel || (record.scheduledAt ? formatBeijing(Date.parse(record.scheduledAt)) : ''),
      isPeakTask: extra.targetAt !== undefined,
      waiting: record.status !== 'inactive',
      calendarAvailable: extra.calendarAvailable !== false,
    }
  })
  const scoped = sessionId === '' ? all : all.filter((row) => row.sessionId === sessionId)
  return {
    all,
    tasks: scoped.filter((row) => row.isPeakTask && row.waiting),
    delivered: scoped.filter((row) => row.isPeakTask && !row.waiting),
    otherTasks: scoped.filter((row) => !row.isPeakTask),
  }
}

async function handleList(ctx, res, url) {
  const sessionId = url.searchParams.get('sessionId') || ''
  const schedule = scheduleService(ctx)
  if (schedule === undefined) {
    sendJson(res, 200, { ok: true, tasks: [], scheduleAvailable: false, error: 'schedule 服务未启用' })
    return
  }
  const meta = readMeta()
  try {
    // 用 catalog 拿到「状态」：官方说明 list 只返回**活动**任务，
    // 而 catalog 同时给出 active 与 inactive，并且 catalog 的条目带 sessionId。
    // 判断"还在等待"必须看 status —— 一次性任务投递完会**保留为 inactive**
    // （官方设计：一次性任务在投递后仍以未运行状态保存），
    // 如果只按"是不是我建的任务"筛选，跑完的任务会永远挂在侧边栏角标上。
    const raw = typeof schedule.catalog === 'function' ? await schedule.catalog() : await schedule.list({ sessionId })
    const { all, tasks, delivered, otherTasks } = partitionTasks(raw, meta, sessionId)

    // 顺手清理：已投递 / 已不在目录里的峰谷元数据不再保留，避免 meta.json 无限增长。
    const present = new Set(all.map((row) => String(row.id)))
    for (const [id, entry] of Object.entries(meta.tasks)) {
      void entry
      if (!present.has(id)) {
        deleteMetaTask(id)
        continue
      }
      const row = all.find((item) => String(item.id) === id)
      if (row && row.status === 'inactive') deleteMetaTask(id)
    }

    sendJson(res, 200, {
      ok: true,
      scheduleAvailable: true,
      tasks,
      delivered,
      // 其余官方提醒（非本插件建的）也带着，但不伪装成峰谷任务
      otherTasks,
      now: Date.now(),
    })
  } catch (error) {
    log('列出等待任务失败', error)
    sendJson(res, 500, { ok: false, error: '列出等待任务失败：' + String((error && error.message) || error) })
  }
}

async function handleDelete(ctx, res, payload) {
  const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId.trim() : ''
  const id = typeof payload.id === 'string' ? payload.id.trim() : ''
  if (sessionId === '' || id === '') {
    sendJson(res, 400, { ok: false, error: '缺少 sessionId 或 id' })
    return
  }
  const schedule = scheduleService(ctx)
  if (schedule === undefined) {
    sendJson(res, 503, { ok: false, error: '宿主没有启用 schedule 服务' })
    return
  }
  try {
    const result = await schedule.delete({ sessionId, id })
    if (result && result.deleted === true) deleteMetaTask(id)
    sendJson(res, 200, { ok: true, deleted: Boolean(result && result.deleted === true) })
  } catch (error) {
    sendJson(res, 500, { ok: false, error: '删除失败：' + String((error && error.message) || error) })
  }
}

export function apply(ctx) {
  const webServer = ctx.webServer ?? ctx.get('webServer')
  if (!webServer) {
    log('没有 webServer 服务，插件不可用')
    return
  }

  const handler = async (req, res) => {
    if (!isLocalRequest(req)) {
      sendJson(res, 403, { ok: false, error: '只接受本机请求' })
      return
    }
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const path = url.pathname

    try {
      if (req.method === 'GET' && path === ROUTE + '/health') {
        sendJson(res, 200, {
          ok: true,
          schedule: scheduleService(ctx) !== undefined,
          sessionController: sessionControllerService(ctx) !== undefined,
        })
        return
      }
      if (req.method === 'GET' && path === ROUTE + '/status') {
        await handleStatus(ctx, res)
        return
      }
      if (req.method === 'GET' && path === ROUTE + '/tasks') {
        await handleList(ctx, res, url)
        return
      }
      if (req.method === 'POST' && path === ROUTE + '/defer') {
        await handleDefer(ctx, res, JSON.parse(await readBody(req)))
        return
      }
      if (req.method === 'POST' && path === ROUTE + '/run-now') {
        await handleRunNow(ctx, res, JSON.parse(await readBody(req)))
        return
      }
      if (req.method === 'POST' && path === ROUTE + '/delete') {
        await handleDelete(ctx, res, JSON.parse(await readBody(req)))
        return
      }
      sendJson(res, 404, { ok: false, error: '未知端点：' + req.method + ' ' + path })
    } catch (error) {
      log('路由处理异常 ' + path, error)
      sendJson(res, 500, { ok: false, error: String((error && error.message) || error) })
    }
  }

  ctx.effect(
    () => webServer.register({ kind: 'prefix', path: ROUTE, handler }),
    'dsh-peak-scheduler: HTTP route',
  )
  log('路由已注册 ' + ROUTE)
}

// 供测试使用
export const __internals = { buildStatus, makeTitle, readMeta, writeMeta, setMetaTask, deleteMetaTask, metaFile, dshHome, deliverPrompt, deferDelaySeconds, partitionTasks, MIN_LEAD_SECONDS }
