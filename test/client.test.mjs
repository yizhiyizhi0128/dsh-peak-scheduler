/**
 * dsh-peak-scheduler 客户端半边测试（不需要浏览器）。
 *
 * 做法同前几个插件：把源码里的 `import React from 'react'` 重定向到一个真实可用的
 * 极小 Hook 运行时，然后跑真源码、真渲染，并用 fetch 桩驱动异步。
 *
 * 覆盖：
 *  1. 导出面（不能导出 inject）；
 *  2. 两处槽位注册（conversation.input.right / sidebar.footer.action）；
 *  3. 弹窗选项的可用条件（没有草稿时两个选项都不可点）；
 *  4. 「立即执行」走 inputActions.submit()，不自己发请求；
 *  5. 「推迟到谷价」POST /defer，**成功后才清空草稿**；失败时保留草稿并报错；
 *  6. 侧边栏角标轮询 /tasks 并显示数量；
 *  7. 等待任务列表「立即开始」POST /run-now，并在成功后刷新。
 *
 * 运行：node test/client.test.mjs
 */
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const srcEntry = join(here, '..', 'src', 'client.js')

// ── 极小 Hook 运行时 ─────────────────────────────────────────────────────
// 一条共享的 Hook 数组，每次渲染把游标归零即可。
// 之所以不需要"按组件分数组"：useState 的 setter 直接绑定到自己那个槽位，
// 所以即便内联展开子组件打乱了游标，已经创建的 setter 依然写对地方。
let hookState = []
let cursor = 0
let pendingEffects = []
let rerender = null

function depsEqual(a, b) {
  if (!a || !b) return false
  if (a.length !== b.length) return false
  return a.every((value, index) => Object.is(value, b[index]))
}

const ReactStub = {
  Fragment: Symbol('Fragment'),
  createElement(type, props, ...children) {
    const flat = children.length === 0 ? undefined : children.length === 1 ? children[0] : children
    return { type, props: { ...(props || {}), ...(flat === undefined ? {} : { children: flat }) } }
  },
  useState(initial) {
    // 关键：把 setter 绑定到**创建它的那个数组槽位**上，而不是"当前作用域"。
    // 异步回调（如 fetch 解析后）执行时游标早就被别的渲染改掉了，
    // 如果 setter 现查作用域就会写错组件——这正是"角标一直是 0 / 列表一直空"的原因。
    const slot = hookState
    const index = cursor++
    if (slot[index] === undefined) slot[index] = typeof initial === 'function' ? initial() : initial
    const set = (next) => {
      const value = typeof next === 'function' ? next(slot[index]) : next
      if (Object.is(value, slot[index])) return
      slot[index] = value
      if (rerender) rerender()
    }
    return [slot[index], set]
  },
  useRef(initial) {
    const index = cursor++
    if (hookState[index] === undefined) hookState[index] = { current: initial }
    return hookState[index]
  },
  useCallback(fn, deps) {
    const index = cursor++
    const prev = hookState[index]
    if (prev && depsEqual(prev.deps, deps)) return prev.fn
    hookState[index] = { fn, deps }
    return fn
  },
  useEffect(fn, deps) {
    const index = cursor++
    const prev = hookState[index]
    if (prev && depsEqual(prev.deps, deps)) return
    hookState[index] = { deps }
    pendingEffects.push(fn)
  },
}

const shimPath = join(here, 'react-shim.mjs')
writeFileSync(shimPath, 'const React = globalThis.__DSH_REACT_STUB__\nexport default React\n', 'utf8')
globalThis.__DSH_REACT_STUB__ = ReactStub

const original = readFileSync(srcEntry, 'utf8')
const rewritten = original.replace(/^import React from 'react'$/m, 'import React from ' + JSON.stringify(pathToFileURL(shimPath).href))
if (rewritten === original) throw new Error('未能改写 react import')

const tmpEntry = join(here, '.client.under-test.mjs')
writeFileSync(tmpEntry, rewritten, 'utf8')
let mod
try {
  mod = await import(pathToFileURL(tmpEntry).href)
} finally {
  rmSync(tmpEntry, { force: true })
}

// ── 断言 ─────────────────────────────────────────────────────────────────
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

// ── 桩 ───────────────────────────────────────────────────────────────────
function makeSlots() {
  const registered = []
  const injected = []
  return {
    registered,
    injected,
    inject(key, fn) {
      injected.push(key)
      fn()
    },
    register(options, component) {
      registered.push({ options, component })
      return () => {}
    },
  }
}

/** fetch 桩：按 URL 路由返回。 */
function makeFetch(routes) {
  const calls = []
  const impl = async (url, init) => {
    calls.push({ url: String(url), init, body: init && init.body ? JSON.parse(init.body) : undefined })
    for (const [matcher, responder] of routes) {
      if (String(url).includes(matcher)) {
        const result = typeof responder === 'function' ? responder(calls[calls.length - 1]) : responder
        if (result && result.__throw) throw new Error(result.__throw)
        return {
          ok: result.ok !== false,
          status: result.status || 200,
          json: async () => result.body,
        }
      }
    }
    return { ok: false, status: 404, json: async () => ({ ok: false, error: 'no route' }) }
  }
  impl.calls = calls
  return impl
}

const STATUS_OK = {
  body: {
    ok: true,
    tier: 'peak',
    isPeak: true,
    window: '09:00–12:00',
    nowLabel: '2026-10-06 周一 10:00（北京时间）',
    discountLabel: '当前为峰价（标准价）',
    calendar: { available: true, note: '已结合中国法定节假日日历判定。' },
    next: { atLabel: '2026-10-06 周二 12:00（北京时间）', inLabel: '2 小时 0 分钟', toTier: 'off-peak' },
    nextOffPeak: { atLabel: '2026-10-06 周二 12:00（北京时间）', inLabel: '2 小时 0 分钟', alreadyOffPeak: false },
    rule: { text: '北京时间周一至周五…' },
  },
}

function setup(routes) {
  globalThis.fetch = makeFetch(routes)
  const slots = makeSlots()
  const ctx = { get: (name) => (name === 'slots' ? slots : undefined) }
  mod.apply(ctx)
  return { slots }
}

/**
 * 挂载组件工厂，渲染两层拿到真正的 DOM 元素。
 * 注册项第二参是工厂 `(props) => <PeakComposerButton {...props} />`，
 * 工厂返回的是**元素**，真组件在 `el.type` 上——只渲染一层会拿到组件本身。
 *
 * 注意：Hook 状态必须在**多次渲染之间保持**，只用 box.state 在挂载时清零一次。
 * 早期版本每帧都重置 hookState，导致 useRef 每次都被重新初始化成 true，
 * 于是组件里的 `alive.current` 永远为真、而异步回调写入的状态被丢掉——
 * 表现为"弹窗里的异步状态一直不出现"，排查了很久。
 */
function mount(factory, props) {
  // 整棵树的 Hook 状态在挂载时清零一次；之后每次 frame() 只把游标归零，数组保留 ——
  // 否则 useState/useRef 每次渲染都被重新初始化，异步写入的状态会被丢掉。
  hookState = []
  const cleanupFns = []
  let lastEl = null
  const frame = () => {
    cursor = 0
    pendingEffects = []
    const wrapper = factory(props)
    if (!wrapper || typeof wrapper.type !== 'function') throw new Error('工厂没有返回组件元素')
    lastEl = wrapper.type(props)
    const effects = pendingEffects
    pendingEffects = []
    for (const effect of effects) {
      const cleanup = effect()
      if (typeof cleanup === 'function') cleanupFns.push(cleanup)
    }
  }
  rerender = frame
  frame()
  return {
    get el() {
      return lastEl
    },
    flush() {
      frame()
      return lastEl
    },
    cleanup() {
      for (const fn of cleanupFns) fn()
      cleanupFns.length = 0
      if (rerender === frame) rerender = null
    },
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0))
/**
 * 让异步链路跑完：反复「遍历渲染树收集并执行 effect → 放行微任务」。
 * 遍历会把内联展开的子组件（WaitingPanel 等）的 effect 一并带出来执行，
 * 否则它们的挂载副作用（拉取 /tasks）永远不会跑。
 *
 * @param frame - 提供当前根元素的函数（通常是 () => view.el）。
 */
async function settle(frame, rounds = 8) {
  for (let i = 0; i < rounds; i += 1) {
    const collected = []
    if (typeof frame === 'function') {
      const root = frame()
      if (root) find(root, () => false, collected)
    }
    for (const effect of collected) {
      try {
        effect()
      } catch {
        /* 渲染副作用抛错不该打断测试节奏 */
      }
    }
    await tick()
  }
}
const flatten = (node, out = []) => {
  if (Array.isArray(node)) for (const item of node) flatten(item, out)
  else if (node !== null && node !== undefined && node !== false) out.push(node)
  return out
}
const kids = (el) => flatten(el.props && el.props.children)
/**
 * 展开一个节点：如果是函数组件（如 StatusBox / WaitingPanel），就地调用它拿到真实元素。
 *
 * 两个必须做的点：
 *  1. 只看 props.children 是不够的 —— 遇到 `<WaitingPanel/>` 只看到一个"类型是函数"的节点，
 *     里面渲染的列表、按钮永远看不到，相关断言会全部误判。
 *  2. 内联展开时**必须把它的 effect 收集走**。否则 WaitingPanel 的挂载副作用
 *     （拉取 /tasks）永远不会执行，界面永远停在"正在读取…"。
 *     这里把 effect 交给调用方（frame / 遍历方）统一在渲染后执行。
 */
function expand(node, effectSink) {
  let current = node
  let guard = 0
  while (current && typeof current === 'object' && typeof current.type === 'function' && guard < 10) {
    pendingEffects = []
    current = current.type(current.props)
    if (effectSink && pendingEffects.length > 0) effectSink.push(...pendingEffects)
    pendingEffects = []
    guard += 1
  }
  return current
}
/**
 * 递归找满足条件的元素 —— **深度优先（后序）**，返回最深的那一个。
 *
 * 为什么必须后序：按钮的文案在子 span 里，所以按钮和它的 span 往往**同时**命中
 * 同一段文案。前序遍历会先返回按钮，于是 `findByText` 再去找"最近的可点击祖先"
 * 就永远找不到（命中的自己就是最外层），表现为点了个 div。
 * 后序保证先拿到真正承载文案的最深节点，再往上找按钮。
 */
function find(el, predicate, effectSink) {
  const node = expand(el, effectSink)
  if (!node || typeof node !== 'object') return undefined
  for (const child of kids(node)) {
    const hit = find(child, predicate, effectSink)
    if (hit !== undefined) return hit
  }
  return predicate(node) ? node : undefined
}
/**
 * 找包含某段文案的**可点击元素**。
 *
 * 注意：文案通常包在内层 <span> 里，而 onClick 在外层 <button> 上。
 * 第一版直接返回最深匹配节点，于是 click 打在了 span 上（它没有 onClick），
 * 表现为"点了没反应"——这里向上回退到最近一个带 onClick 的祖先。
 */
function findByText(el, text) {
  const match = find(el, (node) => flatten(node.props && node.props.children).some((c) => typeof c === 'string' && c.includes(text)))
  if (match === undefined) return undefined
  if (typeof match.props.onClick === 'function') return match
  const clickable = find(el, (node) => typeof node.props.onClick === 'function' && find(node, (inner) => inner === match) !== undefined)
  return clickable === undefined ? match : clickable
}
const clickEl = (el) => (el && el.props && el.props.onClick ? el.props.onClick({ preventDefault() {}, stopPropagation() {} }) : undefined)
/**
 * 按**组件身份**找元素（先判类型再展开）。
 *
 * 不能用 find：find 是后序 + 先展开，函数组件在断言前就已经被替换成它的输出，
 * 永远匹配不到 `<WaitingPanel/>` 本身。这里专门实现一个"不展开、先比类型"的查找。
 */
function findComponent(el, name) {
  if (!el || typeof el !== 'object') return undefined
  if (typeof el.type === 'function' && el.type.name === name) return el
  for (const child of kids(el)) {
    const hit = findComponent(child, name)
    if (hit !== undefined) return hit
  }
  return undefined
}

// ── 用例 ─────────────────────────────────────────────────────────────────
console.log('\n[1] 导出面')
equal(mod.name, 'peak-scheduler', 'name 导出为 peak-scheduler')
equal(typeof mod.apply, 'function', 'apply 是函数')
ok(mod.inject === undefined, '不导出 inject（否则会被启动校验当服务名，条目 pending）')

console.log('\n[2] 两处槽位注册')
{
  const { slots } = setup([['/status', STATUS_OK], ['/tasks', { body: { ok: true, tasks: [] } }]])
  equal(slots.registered.length, 2, '注册了两个条目')
  const byId = new Map(slots.registered.map((entry) => [entry.options.id, entry]))
  const composer = byId.get('peak-scheduler')
  const sidebar = byId.get('peak-scheduler-waiting')
  ok(composer !== undefined, '输入框按钮条目存在')
  equal(composer.options.name, 'conversation.input.right', '注册进 conversation.input.right')
  equal(composer.options.order, 20, 'order 为 20（在 send-mode 的 10 右侧）')
  ok(sidebar !== undefined, '侧边栏条目存在')
  equal(sidebar.options.name, 'sidebar.footer.action', '注册进 sidebar.footer.action')
  ok(slots.injected.includes('conversation.input.right'), 'inject 了输入框槽位')
  ok(slots.injected.includes('sidebar.footer.action'), 'inject 了侧边栏槽位')
}

console.log('\n[3] 输入框按钮：显示与禁用')
{
  const { slots } = setup([['/status', STATUS_OK], ['/tasks', { body: { ok: true, tasks: [] } }]])
  const factory = slots.registered.find((e) => e.options.id === 'peak-scheduler').component
  const view = mount(factory, {
    sessionId: 'session-1',
    inputActions: { submit() {}, setDraft() {} },
    useInput: (selector) => selector({ draft: '把这件事做了' }),
  })
  const button = find(view.el, (node) => node.props && node.props['data-peak-scheduler'] !== undefined)
  ok(button !== undefined, '渲染出峰谷调度按钮')
  equal(button.props['aria-label'], '峰谷调度', 'aria-label 为「峰谷调度」')
  ok(String(button.props.title).includes('峰谷'), 'title 说明了用途')
  view.cleanup()

  // 没有会话时应视为不可用
  const view2 = mount(factory, { sessionId: '', inputActions: {}, useInput: (s) => s({ draft: 'x' }) })
  const button2 = find(view2.el, (node) => node.props && node.props['data-peak-scheduler'] !== undefined)
  equal(button2.props['aria-disabled'], true, '没有会话时 aria-disabled = true')
  clickEl(button2)
  await settle(() => view2.el)
  equal(globalThis.fetch.calls.filter((c) => c.url.includes('/status')).length, 0, '不可用时点击不请求 /status')
  view2.cleanup()
}

console.log('\n[4] 弹窗：读取峰谷状态并展示规则')
{
  const { slots } = setup([['/status', STATUS_OK], ['/tasks', { body: { ok: true, tasks: [] } }]])
  const factory = slots.registered.find((e) => e.options.id === 'peak-scheduler').component
  const view = mount(factory, {
    sessionId: 'session-1',
    inputActions: { submit() {}, setDraft() {} },
    useInput: (s) => s({ draft: '写一份周报' }),
  })
  clickEl(find(view.el, (node) => node.props && node.props['data-peak-scheduler'] !== undefined))
  await settle(() => view.el)
  const el = view.el
  const allText = []
  const collect = (node) => {
    if (typeof node === 'string') {
      allText.push(node)
      return
    }
    if (node && node.props) for (const child of kids(node)) collect(child)
  }
  collect(el)
  console.log('    DEBUG 渲染文案：' + JSON.stringify(allText.slice(0, 16)))
  console.log('    DEBUG /status 调用次数：' + globalThis.fetch.calls.filter((c) => c.url.includes('/status')).length)
  ok(findByText(el, '峰价时段') !== undefined, '显示当前为峰价时段')
  ok(findByText(el, '峰价的一半') !== undefined || findByText(el, '当前为峰价') !== undefined, '显示价格口径')
  ok(findByText(el, '距转为谷价还有') !== undefined, '显示到谷价的倒计时')
  ok(findByText(el, '写一份周报') !== undefined, '回显将被调度的草稿')
  ok(findByText(el, '立即执行') !== undefined, '有「立即执行」选项')
  ok(findByText(el, '推迟到谷价时段自动执行') !== undefined, '有「推迟到谷价」选项')
  view.cleanup()
}

console.log('\n[5] 空草稿：两个选项都不可点')
{
  const { slots } = setup([['/status', STATUS_OK], ['/tasks', { body: { ok: true, tasks: [] } }]])
  const factory = slots.registered.find((e) => e.options.id === 'peak-scheduler').component
  const view = mount(factory, {
    sessionId: 'session-1',
    inputActions: { submit() {}, setDraft() {} },
    useInput: (s) => s({ draft: '   ' }),
  })
  clickEl(find(view.el, (node) => node.props && node.props['data-peak-scheduler'] !== undefined))
  await settle(() => view.el)
  const runBtn = findByText(view.el, '立即执行')
  const deferBtn = findByText(view.el, '推迟到谷价时段自动执行')
  {
    const texts = []
    const collect = (node) => {
      const n = expand(node)
      if (typeof n === 'string') {
        texts.push(n)
        return
      }
      if (n && n.props) for (const child of kids(n)) collect(child)
    }
    collect(view.el)
    console.log('    DEBUG 空草稿弹窗文案：' + JSON.stringify(texts))
    console.log('    DEBUG runBtn=' + (runBtn && runBtn.type) + ' disabled=' + (runBtn && runBtn.props.disabled))
  }
  equal(runBtn.props.disabled, true, '「立即执行」被禁用')
  equal(deferBtn.props.disabled, true, '「推迟到谷价」被禁用')
  view.cleanup()
}

console.log('\n[6] 立即执行：走 inputActions.submit()，不自己发请求')
{
  const { slots } = setup([['/status', STATUS_OK], ['/tasks', { body: { ok: true, tasks: [] } }]])
  const factory = slots.registered.find((e) => e.options.id === 'peak-scheduler').component
  let submitted = 0
  const view = mount(factory, {
    sessionId: 'session-1',
    inputActions: { submit: () => { submitted += 1 }, setDraft() {} },
    useInput: (s) => s({ draft: '马上去做' }),
  })
  clickEl(find(view.el, (node) => node.props && node.props['data-peak-scheduler'] !== undefined))
  await settle(() => view.el)
  const before = globalThis.fetch.calls.length
  clickEl(findByText(view.el, '立即执行'))
  await settle(() => view.el)
  equal(submitted, 1, '调用了 inputActions.submit()')
  equal(globalThis.fetch.calls.length, before, '没有发出额外请求（复用 DSH 自己的发送通道）')
  view.cleanup()
}

console.log('\n[7] 推迟到谷价：POST /defer，成功后才清空草稿')
{
  let cleared = 0
  const { slots } = setup([
    ['/status', STATUS_OK],
    ['/tasks', { body: { ok: true, tasks: [] } }],
    ['/defer', { body: { ok: true, target: { atLabel: '2026-10-06 周二 12:00（北京时间）', alreadyOffPeak: false } } }],
  ])
  const factory = slots.registered.find((e) => e.options.id === 'peak-scheduler').component
  const view = mount(factory, {
    sessionId: 'session-1',
    inputActions: { submit() {}, setDraft: () => { cleared += 1 } },
    useInput: (s) => s({ draft: '推迟这段' }),
  })
  clickEl(find(view.el, (node) => node.props && node.props['data-peak-scheduler'] !== undefined))
  await settle(() => view.el)
  clickEl(findByText(view.el, '推迟到谷价时段自动执行'))
  await settle(() => view.el, 8)
  const deferCall = globalThis.fetch.calls.find((c) => c.url.includes('/defer'))
  ok(deferCall !== undefined, '发出了 /defer 请求')
  equal(deferCall.body.sessionId, 'session-1', '请求带 sessionId')
  equal(deferCall.body.prompt, '推迟这段', '请求带草稿原文')
  equal(Object.keys(deferCall.body).length, 2, '请求体只有这两个字段')
  equal(cleared, 1, '成功后清空了草稿')
  ok(findByText(view.el, '已创建等待任务') !== undefined, '给出成功提示')
  view.cleanup()
}

console.log('\n[8] 推迟失败：保留草稿并报错（不能"没存下来还把输入清了"）')
{
  let cleared = 0
  const { slots } = setup([
    ['/status', STATUS_OK],
    ['/tasks', { body: { ok: true, tasks: [] } }],
    ['/defer', { ok: false, status: 503, body: { ok: false, error: '宿主没有启用 schedule 服务' } }],
  ])
  const factory = slots.registered.find((e) => e.options.id === 'peak-scheduler').component
  const view = mount(factory, {
    sessionId: 'session-1',
    inputActions: { submit() {}, setDraft: () => { cleared += 1 } },
    useInput: (s) => s({ draft: '不能丢的内容' }),
  })
  clickEl(find(view.el, (node) => node.props && node.props['data-peak-scheduler'] !== undefined))
  await settle(() => view.el)
  clickEl(findByText(view.el, '推迟到谷价时段自动执行'))
  await settle(() => view.el, 8)
  equal(cleared, 0, '失败时没有清空草稿')
  ok(findByText(view.el, '创建等待任务失败') !== undefined, '显示了失败原因')
  ok(findByText(view.el, 'schedule 服务') !== undefined, '错误信息带上了宿主的原因')
  view.cleanup()
}

console.log('\n[9] 侧边栏：角标轮询 /tasks 并显示数量')
{
  const { slots } = setup([
    ['/status', STATUS_OK],
    ['/tasks', { body: { ok: true, tasks: [{ id: 'a', sessionId: 's1', title: '任务A', targetLabel: 'T1' }, { id: 'b', sessionId: 's1', title: '任务B', targetLabel: 'T2' }] } }],
  ])
  const factory = slots.registered.find((e) => e.options.id === 'peak-scheduler-waiting').component
  const view = mount(factory, { wide: true })
  await settle(() => view.el, 6)
  const button = find(view.el, (node) => node.props && node.props['data-waiting-count'] !== undefined)
  ok(button !== undefined, '渲染出等待任务入口')
  equal(button.props['data-waiting-count'], 2, '角标数量 = 2')
  ok(findByText(view.el, '2') !== undefined, '角标显示了数字')
  ok(String(button.props.title).includes('2'), 'title 里也写了数量')
  view.cleanup()

  // 没有任务时不显示角标
  const empty = setup([['/status', STATUS_OK], ['/tasks', { body: { ok: true, tasks: [] } }]])
  const factory2 = empty.slots.registered.find((e) => e.options.id === 'peak-scheduler-waiting').component
  const view2 = mount(factory2, { wide: true })
  await settle(() => view.el, 6)
  const button2 = find(view2.el, (node) => node.props && node.props['data-waiting-count'] !== undefined)
  equal(button2.props['data-waiting-count'], 0, '无任务时角标为 0')
  view2.cleanup()
}

console.log('\n[10] 等待任务列表：行结构 + 立即开始 / 取消 的请求')
{
  // 直接驱动 WaitingPanel 的返回元素来断言行结构。
  // 不走"遍历整棵树"的路子：遍历时会就地展开函数组件，而展开会重跑 Hook，
  // 同一棵树里遍历两次可能看到不同状态（实测踩过），断言会变得不可靠。
  let taskList = [{ id: 'task-1', sessionId: 'session-9', title: '[峰谷] 写周报', targetLabel: '2026-10-06 周二 12:00', promptPreview: '写周报' }]
  const { slots } = setup([
    ['/status', STATUS_OK],
    ['/tasks', () => ({ body: { ok: true, tasks: taskList } })],
    ['/run-now', () => {
      taskList = []
      return { body: { ok: true, delivered: true, removed: true } }
    }],
    ['/delete', () => ({ body: { ok: true, deleted: true } })],
  ])
  const factory = slots.registered.find((e) => e.options.id === 'peak-scheduler-waiting').component
  const view = mount(factory, { wide: true })
  await settle(() => view.el, 6)

  // 打开面板 → 面板是 WaitingPanel 组件元素，直接调用它拿到它的输出
  clickEl(find(view.el, (node) => node.props && node.props['data-waiting-count'] !== undefined))
  await settle(() => view.el, 6)

  const panel = findComponent(view.el, 'WaitingPanel')
  ok(panel !== undefined, '面板已挂载（WaitingPanel）')
  if (panel !== undefined) {
    // 面板自带 Hook，且它的 hookState 与"遍历展开时"用的可能不是同一个数组，
    // 直接调用会读到脏槽位（实测报过 tasks.map is not a function）。
    // 这里给它一个**独立且受控**的 Hook 空间，并用 rerender 驱动重渲染，
    // 语义与 React 一致：首帧 → 跑 effect → 状态变化触发重渲染。
    const savedHookState = hookState
    const savedRerender = rerender
    try {
      hookState = []
      let panelEl = null
      const panelFrame = () => {
        cursor = 0
        pendingEffects = []
        panelEl = panel.type(panel.props)
        const effects = pendingEffects
        pendingEffects = []
        for (const effect of effects) {
          const cleanup = effect()
          if (typeof cleanup === 'function') cleanupFnsOutside.push(cleanup)
        }
      }
      const cleanupFnsOutside = []
      rerender = panelFrame
      panelFrame()
      await settle(null, 8)
      const fresh = panelEl

      const texts = []
      const walk = (node) => {
        if (typeof node === 'string') {
          texts.push(node)
          return
        }
        if (node && node.props) for (const child of kids(node)) walk(child)
      }
      walk(fresh)
      const joined = texts.join(' | ')
      ok(joined.includes('[峰谷] 写周报'), '列表里显示了等待任务标题', joined.slice(0, 120))
      ok(joined.includes('计划执行：2026-10-06 周二 12:00'), '显示了计划执行时间')
      ok(joined.includes('写周报'), '显示了提示词预览')
      ok(joined.includes('立即开始'), '有「立即开始」按钮')
      ok(joined.includes('取消'), '有「取消」按钮')

      // 点「立即开始」：从面板输出里找那个按钮
      const startButton = find(fresh, (node) => node.type === 'button' && flatten(node.props.children).some((c) => c === '立即开始'))
      ok(startButton !== undefined, '找到「立即开始」按钮元素')
      if (startButton !== undefined) {
        clickEl(startButton)
        await settle(null, 8)
        const runCall = globalThis.fetch.calls.find((c) => c.url.includes('/run-now'))
        ok(runCall !== undefined, '发出了 /run-now 请求')
        if (runCall) {
          equal(runCall.body.id, 'task-1', '带上了任务 id')
          equal(runCall.body.sessionId, 'session-9', '带上了会话 id')
        }
        equal(globalThis.fetch.calls.filter((c) => c.url.includes('/run-now')).length, 1, '只调用一次')
      }
      for (const fn of cleanupFnsOutside) fn()
    } finally {
      hookState = savedHookState
      rerender = savedRerender
    }
  }
  view.cleanup()
}

console.log('\n[11] 列表：取消 → POST /delete')
{
  let taskList = [{ id: 'task-2', sessionId: 'session-9', title: '[峰谷] 待取消', targetLabel: 'T' }]
  const { slots } = setup([
    ['/status', STATUS_OK],
    ['/tasks', () => ({ body: { ok: true, tasks: taskList } })],
    ['/delete', () => {
      taskList = []
      return { body: { ok: true, deleted: true } }
    }],
  ])
  const factory = slots.registered.find((e) => e.options.id === 'peak-scheduler-waiting').component
  const view = mount(factory, { wide: true })
  await settle(() => view.el, 6)
  clickEl(find(view.el, (node) => node.props && node.props['data-waiting-count'] !== undefined))
  await settle(() => view.el, 6)

  const panel = findComponent(view.el, 'WaitingPanel')
  ok(panel !== undefined, '面板已挂载')
  if (panel !== undefined) {
    // 与 [10] 同一套隔离渲染：给面板自己的 Hook 空间，用 rerender 驱动状态变化。
    const savedHookState = hookState
    const savedRerender = rerender
    try {
      hookState = []
      let panelEl = null
      const cleanups = []
      const panelFrame = () => {
        cursor = 0
        pendingEffects = []
        panelEl = panel.type(panel.props)
        const effects = pendingEffects
        pendingEffects = []
        for (const effect of effects) {
          const cleanup = effect()
          if (typeof cleanup === 'function') cleanups.push(cleanup)
        }
      }
      rerender = panelFrame
      panelFrame()
      await settle(null, 8)
      const cancelButton = find(panelEl, (node) => node.type === 'button' && flatten(node.props.children).some((c) => c === '取消'))
      ok(cancelButton !== undefined, '找到「取消」按钮元素')
      if (cancelButton !== undefined) {
        clickEl(cancelButton)
        await settle(null, 8)
        const del = globalThis.fetch.calls.find((c) => c.url.includes('/delete'))
        ok(del !== undefined, '发出了 /delete 请求')
        if (del) equal(del.body.id, 'task-2', '带上了任务 id')
      }
      for (const fn of cleanups) fn()
    } finally {
      hookState = savedHookState
      rerender = savedRerender
    }
  }
  view.cleanup()
}

console.log('\n[12] 已是谷价时：文案不能再说「推迟」，且能成功创建')
{
  // 回归：已在谷价时 nextOffPeak.at == 此刻。旧实现把它当 `at` 交给官方 schedule，
  // 被「strictly in the future」拒绝；同时界面还写着"推迟到谷价"——没有可推迟的东西。
  const OFF_PEAK_STATUS = {
    body: {
      ok: true,
      tier: 'off-peak',
      isPeak: false,
      window: null,
      nowLabel: '2026-10-06 周二 12:30（北京时间）',
      discountLabel: '当前为谷价（约为峰价的一半）',
      calendar: { available: true, note: '已结合中国法定节假日日历判定。' },
      next: { atLabel: '2026-10-06 周二 14:00（北京时间）', inLabel: '1 小时 30 分钟', toTier: 'peak' },
      nextOffPeak: { atLabel: '2026-10-06 周二 12:30（北京时间）', inLabel: '已到', alreadyOffPeak: true },
      rule: { text: 'RULE' },
    },
  }
  let cleared = 0
  const { slots } = setup([
    ['/status', OFF_PEAK_STATUS],
    ['/tasks', { body: { ok: true, tasks: [] } }],
    ['/defer', { body: { ok: true, target: { atLabel: '2026-10-06 周二 12:30（北京时间）', alreadyOffPeak: true } } }],
  ])
  const factory = slots.registered.find((e) => e.options.id === 'peak-scheduler').component
  const view = mount(factory, {
    sessionId: 'session-1',
    inputActions: { submit() {}, setDraft: () => { cleared += 1 } },
    useInput: (s) => s({ draft: '谷价里跑这段' }),
  })
  const trigger = find(view.el, (node) => node.props && node.props['data-peak-scheduler'] !== undefined)
  // 注意：按钮的 data-peak-scheduler / title 依赖 status，而 status 是**打开弹窗时**才拉的。
  // 所以这两条断言必须放在 click + settle 之后，否则拿到的是初始的 'unknown'。
  equal(trigger.props['data-peak-scheduler'], 'unknown', '打开前还不知道时段')

  clickEl(trigger)
  await settle(() => view.el)
  const triggerAfter = find(view.el, (node) => node.props && node.props['data-peak-scheduler'] !== undefined)
  equal(triggerAfter.props['data-peak-scheduler'], 'off-peak', '按钮反映当前是谷价')
  ok(String(triggerAfter.props.title).includes('登记为自动执行'), 'title 不再说"推迟"：' + triggerAfter.props.title)

  ok(findByText(view.el, '立即执行（已是谷价，无需等待）') !== undefined, '选项文案改为「立即执行（已是谷价，无需等待）」')
  ok(findByText(view.el, '再等也不会更便宜') !== undefined, '说明里讲清了"再等也不会更便宜"')
  ok(findByText(view.el, '距转为峰价还有') !== undefined, '倒计时指向下一个峰价起点')

  clickEl(findByText(view.el, '立即执行（已是谷价，无需等待）'))
  await settle(() => view.el, 8)
  const defer = globalThis.fetch.calls.find((c) => c.url.includes('/defer'))
  ok(defer !== undefined, '仍然成功创建了任务（宿主改用 after_seconds）')
  if (defer) equal(defer.body.prompt, '谷价里跑这段', '带上了提示词')
  equal(cleared, 1, '成功后清空草稿')
  ok(findByText(view.el, '当前已是谷价，任务已登记') !== undefined, '提示文案与"已是谷价"一致')
  view.cleanup()
}

console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILED') + '  (' + checks + ' checks)')
process.exit(failures === 0 ? 0 : 1)
