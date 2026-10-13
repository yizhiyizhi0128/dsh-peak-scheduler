/**
 * dsh-peak-scheduler — 浏览器半边（源码，经 esbuild 打包成 lib/client.js）。
 *
 * 两处 UI：
 *   1. `conversation.input.right` —— 「峰谷调度」按钮（紧邻发送区）。
 *      输入框里有提示词时点它弹窗：立即执行 / 推迟到谷价。
 *   2. `sidebar.footer.action` —— 侧边栏「等待任务」入口，带数量角标。
 *      点开列出等待中的任务，每条可「立即开始」。
 *
 * 峰谷判定与任务创建都在宿主半边（lib/peak.js + official schedule），
 * 这里只负责展示与发起请求，不自己算价格。
 *
 * 注意：客户端半边**不能声明 exports.inject**（会被启动校验当服务名 ctx.get，
 * 条目 pending 并让 web boot 失败）。服务一律运行时 ctx.get。
 */
import React from 'react'

const API = '/dsh-peak-scheduler'
const LABEL = '峰谷调度'
/** 侧边栏角标轮询间隔。 */
const POLL_MS = 20000

const S = {
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    flex: 'none',
    height: 28,
    padding: '0 10px',
    border: '1px solid var(--dsw-alias-border-l1)',
    borderRadius: 8,
    background: 'transparent',
    color: 'var(--dsw-alias-label-secondary)',
    fontSize: 12,
    lineHeight: '18px',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    transition: 'background-color .18s ease, color .18s ease',
  },
  disabled: { color: 'var(--dsw-alias-label-dimmed)', cursor: 'default' },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    height: 16,
    padding: '0 5px',
    borderRadius: 999,
    fontSize: 10,
    lineHeight: '16px',
    fontWeight: 600,
    background: 'var(--dsw-alias-state-warn-primary)',
    color: 'var(--dsw-alias-bg-base)',
  },
  mask: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1200,
    padding: 20,
  },
  modal: {
    background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l1)',
    borderRadius: 12,
    padding: 16,
    width: 460,
    maxWidth: '100%',
    maxHeight: '82vh',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    boxShadow: '0 10px 36px rgba(0,0,0,.35)',
    color: 'var(--dsw-alias-label-primary)',
  },
  title: { margin: 0, fontSize: 14, fontWeight: 600 },
  hint: { fontSize: 11, lineHeight: '17px', color: 'var(--dsw-alias-label-secondary)' },
  caption: { fontSize: 11, lineHeight: '16px', color: 'var(--dsw-alias-label-caption)' },
  row: { display: 'flex', alignItems: 'center', gap: 8 },
  statusBox: {
    border: '1px solid var(--dsw-alias-border-l1)',
    borderRadius: 8,
    padding: '8px 10px',
    background: 'var(--dsw-alias-bg-layer-2)',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  option: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 2,
    width: '100%',
    textAlign: 'left',
    padding: '9px 11px',
    border: '1px solid var(--dsw-alias-border-l1)',
    borderRadius: 8,
    background: 'var(--dsw-alias-bg-layer-2)',
    color: 'var(--dsw-alias-label-primary)',
    fontFamily: 'inherit',
    fontSize: 13,
    cursor: 'pointer',
  },
  optionPrimary: {
    border: '1px solid var(--dsw-alias-brand-primary)',
    background: 'var(--dsw-alias-bg-layer-1)',
  },
  optionTitle: { fontSize: 13, fontWeight: 600, lineHeight: '19px' },
  optionDesc: { fontSize: 11, lineHeight: '16px', color: 'var(--dsw-alias-label-secondary)' },
  btn: { borderRadius: 8, padding: '5px 12px', fontSize: 13, cursor: 'pointer' },
  plain: {
    background: 'var(--dsw-alias-bg-layer-2)',
    color: 'var(--dsw-alias-label-primary)',
    border: '1px solid var(--dsw-alias-border-l1)',
  },
  notice: { fontSize: 12, lineHeight: '18px', wordBreak: 'break-word' },
  list: { display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', minHeight: 40 },
  card: {
    border: '1px solid var(--dsw-alias-border-l1)',
    borderRadius: 8,
    padding: '8px 10px',
    background: 'var(--dsw-alias-bg-layer-2)',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  pre: {
    margin: 0,
    fontSize: 11,
    lineHeight: '16px',
    color: 'var(--dsw-alias-label-secondary)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: 60,
    overflow: 'hidden',
  },
}

// ─────────────────────────────────────────────────────────────────────────
// 图标
// ─────────────────────────────────────────────────────────────────────────

function ClockIcon({ size = 15 }) {
  return React.createElement(
    'svg',
    { viewBox: '0 0 24 24', width: size, height: size, style: { display: 'block', flex: 'none' } },
    React.createElement('circle', { cx: 12, cy: 12, r: 9, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7 }),
    React.createElement('path', {
      d: 'M12 7.4v5l3.2 1.9',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.7,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  )
}

function MoonIcon({ size = 15 }) {
  return React.createElement(
    'svg',
    { viewBox: '0 0 24 24', width: size, height: size, style: { display: 'block', flex: 'none' } },
    React.createElement('path', {
      d: 'M20 14.2A8.4 8.4 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.7,
      strokeLinejoin: 'round',
    }),
  )
}

function BoltIcon({ size = 15 }) {
  return React.createElement(
    'svg',
    { viewBox: '0 0 24 24', width: size, height: size, style: { display: 'block', flex: 'none' } },
    React.createElement('path', {
      d: 'M13.2 2.5 5 13.4h5.1L9.9 21.5 18 10.6h-5.1l.3-8.1Z',
      fill: 'currentColor',
    }),
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 请求
// ─────────────────────────────────────────────────────────────────────────

async function call(path, options) {
  const response = await fetch(API + path, options)
  const data = await response.json().catch(() => null)
  if (!response.ok || !data || data.ok !== true) {
    const reason = (data && data.error) || ('HTTP ' + response.status)
    const error = new Error(reason)
    error.hint = data && data.hint
    throw error
  }
  return data
}

const postJson = (path, body) =>
  call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

// ─────────────────────────────────────────────────────────────────────────
// 峰谷状态展示（弹窗与侧栏共用）
// ─────────────────────────────────────────────────────────────────────────

function StatusBox({ status }) {
  if (!status) return React.createElement('div', { style: S.statusBox }, React.createElement('div', { style: S.hint }, '正在读取峰谷价格时段…'))
  const peak = status.isPeak
  return React.createElement(
    'div',
    { style: S.statusBox },
    React.createElement(
      'div',
      { style: { ...S.row, fontWeight: 600 } },
      peak ? React.createElement(BoltIcon, { size: 14 }) : React.createElement(MoonIcon, { size: 14 }),
      React.createElement('span', null, peak ? '当前：峰价时段' + (status.window ? '（' + status.window + '）' : '') : '当前：谷价时段'),
      React.createElement('span', { style: { flex: 1 } }),
      React.createElement('span', { style: S.caption }, status.nowLabel || ''),
    ),
    React.createElement('div', { style: S.hint }, status.discountLabel || ''),
    status.next
      ? React.createElement('div', { style: S.hint }, (peak ? '距转为谷价还有 ' : '距转为峰价还有 ') + status.next.inLabel + '（' + status.next.atLabel + '）')
      : null,
    React.createElement('div', { style: S.caption }, '判定依据：' + ((status.rule && status.rule.text) || '') ),
    React.createElement(
      'div',
      { style: { ...S.caption, color: status.calendar && status.calendar.available ? S.caption.color : 'var(--dsw-alias-state-warn-primary)' } },
      (status.calendar && status.calendar.note) || '',
    ),
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 输入框按钮 + 弹窗
// ─────────────────────────────────────────────────────────────────────────

function PeakComposerButton(props) {
  const actions = props.inputActions
  const useLiveInput = typeof props.useInput === 'function' ? props.useInput : () => null
  const inputState = useLiveInput((s) => s)
  const draft = inputState && typeof inputState.draft === 'string' ? inputState.draft : ''

  const [open, setOpen] = React.useState(false)
  const [status, setStatus] = React.useState(null)
  const [statusError, setStatusError] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [notice, setNotice] = React.useState(null)
  const [hover, setHover] = React.useState(false)
  const alive = React.useRef(true)

  React.useEffect(() => () => {
    alive.current = false
  }, [])

  const hasDraft = draft.trim().length > 0

  const loadStatus = React.useCallback(async () => {
    setStatusError('')
    try {
      const data = await call('/status')
      if (alive.current) setStatus(data)
    } catch (error) {
      if (alive.current) setStatusError((error && error.message) || String(error))
    }
  }, [])

  const openDialog = () => {
    setNotice(null)
    setOpen(true)
    void loadStatus()
  }

  const runNow = () => {
    if (typeof actions.submit !== 'function') {
      setNotice({ bad: true, text: '这个 DSH 版本的输入框不支持程序化提交，请直接按 Enter 发送。' })
      return
    }
    actions.submit()
    setOpen(false)
    setNotice({ text: '已按当前发送方式立即提交。' })
  }

  const deferToValley = async () => {
    if (busy) return
    if (!hasDraft) {
      setNotice({ bad: true, text: '输入框是空的，没有可推迟的内容。' })
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      const data = await postJson('/defer', { sessionId: props.sessionId, prompt: draft })
      // 只有确认建好等待任务后才清空草稿，避免"没存下来还把输入清了"
      if (typeof actions.setDraft === 'function') actions.setDraft('')
      if (!alive.current) return
      setOpen(false)
      const already = Boolean(status && status.nextOffPeak && status.nextOffPeak.alreadyOffPeak)
      const when = data.target ? data.target.atLabel : '谷价时段'
      setNotice({
        text: already
          ? '当前已是谷价，任务已登记，约几秒后自动执行（' + when + '）。侧边栏可取消或立即开始。'
          : '已创建等待任务，将在 ' + when + ' 自动执行。侧边栏可随时改为立即开始。',
      })
    } catch (error) {
      if (alive.current) {
        setNotice({ bad: true, text: '创建等待任务失败：' + ((error && error.message) || String(error)) })
      }
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  const canOpen = typeof props.sessionId === 'string' && props.sessionId !== ''
  const label = status && status.isPeak === false ? '谷价中' : LABEL
  /** 当前是否已在谷价。已在谷价时"推迟"其实等于"马上跑"，文案必须跟着变。 */
  const alreadyOffPeak = Boolean(status && status.nextOffPeak && status.nextOffPeak.alreadyOffPeak)

  const button = React.createElement(
    'button',
    {
      type: 'button',
      className: 'dsh-peak-scheduler-trigger',
      'data-peak-scheduler': status ? status.tier : 'unknown',
      title: canOpen
        ? LABEL + '：查看当前峰谷时段，选择立即执行或' + (alreadyOffPeak ? '登记为自动执行' : '推迟到谷价')
        : LABEL + '（当前没有会话）',
      'aria-label': LABEL,
      'aria-disabled': !canOpen,
      onMouseDown: (e) => e.preventDefault(),
      onMouseEnter: () => setHover(true),
      onMouseLeave: () => setHover(false),
      onClick: (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (canOpen) openDialog()
      },
      style: {
        ...S.button,
        ...(canOpen ? null : S.disabled),
        ...(canOpen && hover ? { background: 'var(--dsw-alias-interactive-bg-hover)' } : null),
      },
    },
    React.createElement(ClockIcon),
    label,
  )

  const dialog = !open
    ? null
    : React.createElement(
        'div',
        { style: S.mask, onClick: () => !busy && setOpen(false) },
        React.createElement(
          'div',
          { style: S.modal, onClick: (e) => e.stopPropagation() },
          React.createElement('h3', { style: S.title }, '峰谷调度'),
          statusError
            ? React.createElement('div', { style: { ...S.notice, color: 'var(--dsw-alias-state-error-primary)' } }, '读取峰谷状态失败：' + statusError)
            : React.createElement(StatusBox, { status }),
          React.createElement('div', { style: S.hint }, hasDraft ? '输入框内容（将被调度的提示词）：' : '输入框当前为空'),
          hasDraft
            ? React.createElement('div', { style: S.pre }, draft.length > 300 ? draft.slice(0, 300) + '…' : draft)
            : null,
          React.createElement(
            'button',
            {
              type: 'button',
              disabled: !hasDraft,
              onClick: runNow,
              style: { ...S.option, ...(hasDraft ? S.optionPrimary : S.disabled) },
            },
            React.createElement('span', { style: S.optionTitle }, '立即执行'),
            React.createElement('span', { style: S.optionDesc }, '按当前发送方式马上提交这段提示词。'),
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              disabled: busy || !hasDraft,
              onClick: () => void deferToValley(),
              style: { ...S.option, ...(busy || !hasDraft ? S.disabled : null) },
            },
            React.createElement(
              'span',
              { style: S.optionTitle },
              busy ? '正在创建等待任务…' : alreadyOffPeak ? '立即执行（已是谷价，无需等待）' : '推迟到谷价时段自动执行',
            ),
            React.createElement(
              'span',
              { style: S.optionDesc },
              // 已经是谷价时不能再叫"推迟"——没有可推迟的东西。
              // 这里如实说清：会被登记成一个马上就触发的等待任务，而不是"等更便宜的时段"。
              status && status.nextOffPeak
                ? status.nextOffPeak.alreadyOffPeak
                  ? '当前已经是谷价，再等也不会更便宜。选择它会把这段提示词登记成一个等待任务，约几秒后自动执行（你仍可在侧边栏取消）。'
                  : '将在 ' + status.nextOffPeak.atLabel + '（约 ' + status.nextOffPeak.inLabel + '后）自动执行。'
                : '将在下一个谷价时段自动执行。',
            ),
          ),
          notice
            ? React.createElement(
                'div',
                { role: 'status', style: { ...S.notice, color: notice.bad ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-label-secondary)' } },
                notice.text,
              )
            : null,
          React.createElement(
            'div',
            { style: S.row },
            React.createElement('span', { style: { flex: 1 } }),
            React.createElement('button', { type: 'button', disabled: busy, onClick: () => setOpen(false), style: { ...S.btn, ...S.plain } }, '取消'),
          ),
        ),
      )

  if (!notice || open) return React.createElement(React.Fragment, null, button, dialog)
  return React.createElement(
    React.Fragment,
    null,
    button,
    React.createElement(
      'span',
      { role: 'status', style: { ...S.notice, color: notice.bad ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-label-caption)', maxWidth: 320 } },
      notice.text,
    ),
    dialog,
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 侧边栏：等待任务入口 + 列表
// ─────────────────────────────────────────────────────────────────────────

function WaitingPanel({ onClose }) {
  const [tasks, setTasks] = React.useState(null)
  const [notice, setNotice] = React.useState(null)
  const [busyId, setBusyId] = React.useState(null)
  const [status, setStatus] = React.useState(null)
  const alive = React.useRef(true)

  React.useEffect(() => () => {
    alive.current = false
  }, [])

  const refresh = React.useCallback(async () => {
    try {
      const data = await call('/tasks')
      // 服务端可能返回缺字段的响应；这里只接受真正的数组，避免 tasks.map 直接崩。
      if (alive.current) setTasks(Array.isArray(data.tasks) ? data.tasks : [])
    } catch (error) {
      if (alive.current) {
        setTasks([])
        setNotice({ bad: true, text: '读取等待任务失败：' + ((error && error.message) || String(error)) })
      }
    }
  }, [])

  React.useEffect(() => {
    void refresh()
    void call('/status').then((data) => {
      if (alive.current) setStatus(data)
    }).catch(() => {})
  }, [refresh])

  const runNow = async (task) => {
    setBusyId(task.id)
    setNotice(null)
    try {
      const data = await postJson('/run-now', { sessionId: task.sessionId, id: task.id })
      if (!alive.current) return
      setNotice({
        text: data.warning ? data.warning : '已立即执行，提示词已投递到该会话。',
        bad: Boolean(data.warning),
      })
      await refresh()
    } catch (error) {
      if (alive.current) setNotice({ bad: true, text: '立即执行失败：' + ((error && error.message) || String(error)) })
    } finally {
      if (alive.current) setBusyId(null)
    }
  }

  const remove = async (task) => {
    setBusyId(task.id)
    setNotice(null)
    try {
      await postJson('/delete', { sessionId: task.sessionId, id: task.id })
      await refresh()
      if (alive.current) setNotice({ text: '已取消该等待任务。' })
    } catch (error) {
      if (alive.current) setNotice({ bad: true, text: '取消失败：' + ((error && error.message) || String(error)) })
    } finally {
      if (alive.current) setBusyId(null)
    }
  }

  const h = React.createElement
  const rows = tasks === null
    ? h('div', { style: S.hint }, '正在读取…')
    : tasks.length === 0
      ? h('div', { style: S.hint }, '暂无等待中的任务。在输入框点「峰谷调度」即可把提示词推迟到谷价时段。')
      : tasks.map((task) =>
          h(
            'div',
            { key: task.id, style: S.card },
            h('div', { style: { ...S.optionTitle, fontSize: 12 } }, task.title || '(无标题)'),
            h('div', { style: S.caption }, '计划执行：' + (task.targetLabel || task.scheduledAt || '未知')),
            task.promptPreview ? h('pre', { style: S.pre }, task.promptPreview) : null,
            task.calendarAvailable === false
              ? h('div', { style: { ...S.caption, color: 'var(--dsw-alias-state-warn-primary)' } }, '创建时未取得节假日日历，该时点可能不是真正的谷价。')
              : null,
            h(
              'div',
              { style: S.row },
              h(
                'button',
                {
                  type: 'button',
                  disabled: busyId === task.id,
                  onClick: () => void runNow(task),
                  style: { ...S.btn, ...S.optionPrimary, padding: '3px 10px', fontSize: 12 },
                },
                busyId === task.id ? '处理中…' : '立即开始',
              ),
              h(
                'button',
                {
                  type: 'button',
                  disabled: busyId === task.id,
                  onClick: () => void remove(task),
                  style: { ...S.btn, ...S.plain, padding: '3px 10px', fontSize: 12 },
                },
                '取消',
              ),
              h('span', { style: { flex: 1 } }),
              h('span', { style: S.caption }, task.sessionId ? '会话 ' + String(task.sessionId).slice(0, 18) : ''),
            ),
          ),
        )

  return h(
    'div',
    { style: S.mask, onClick: () => onClose() },
    h(
      'div',
      { style: S.modal, onClick: (e) => e.stopPropagation() },
      h('h3', { style: S.title }, '等待任务' + (tasks === null ? '' : ' · ' + tasks.length + ' 个')),
      h(StatusBox, { status }),
      notice
        ? h('div', { role: 'status', style: { ...S.notice, color: notice.bad ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-label-secondary)' } }, notice.text)
        : null,
      h('div', { style: S.list }, rows),
      h(
        'div',
        { style: S.row },
        h('button', { type: 'button', onClick: () => void refresh(), style: { ...S.btn, ...S.plain } }, '刷新'),
        h('span', { style: { flex: 1 } }),
        h('button', { type: 'button', onClick: () => onClose(), style: { ...S.btn, ...S.plain } }, '关闭'),
      ),
    ),
  )
}

function SidebarWaitingEntry(props) {
  const [count, setCount] = React.useState(0)
  const [open, setOpen] = React.useState(false)
  const [hover, setHover] = React.useState(false)
  const alive = React.useRef(true)

  React.useEffect(() => () => {
    alive.current = false
  }, [])

  React.useEffect(() => {
    let timer
    const poll = async () => {
      try {
        const data = await call('/tasks')
        if (alive.current) setCount(Array.isArray(data.tasks) ? data.tasks.length : 0)
      } catch {
        /* 轮询失败静默；不是关键路径 */
      }
      if (alive.current) timer = setTimeout(poll, POLL_MS)
    }
    void poll()
    return () => {
      alive.current = false
      if (timer) clearTimeout(timer)
    }
  }, [])

  const wide = props.wide !== false
  const h = React.createElement
  return h(
    React.Fragment,
    null,
    h(
      'button',
      {
        type: 'button',
        className: 'dsh-peak-scheduler-waiting',
        'data-waiting-count': count,
        title: count > 0 ? '有 ' + count + ' 个等待中的峰谷任务' : '峰谷等待任务',
        'aria-label': '等待任务' + (count > 0 ? '（' + count + ' 个）' : ''),
        onMouseEnter: () => setHover(true),
        onMouseLeave: () => setHover(false),
        onClick: () => setOpen(true),
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: wide ? '7px 8px' : '7px 0',
          margin: '0 0 4px',
          justifyContent: wide ? 'flex-start' : 'center',
          border: 'none',
          borderRadius: 8,
          background: hover ? 'var(--dsw-alias-interactive-bg-hover)' : 'transparent',
          color: 'var(--dsw-alias-label-secondary)',
          fontSize: 13,
          lineHeight: '20px',
          fontFamily: 'inherit',
          cursor: 'pointer',
          textAlign: 'left',
        },
      },
      h(ClockIcon, { size: 16 }),
      wide ? h('span', null, '等待任务') : null,
      count > 0 ? h('span', { style: S.pill }, String(count)) : null,
    ),
    open ? h(WaitingPanel, { onClose: () => setOpen(false) }) : null,
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 注册
// ─────────────────────────────────────────────────────────────────────────

export function apply(ctx) {
  // 两处注册各自退避重试；拿不到 slots 就静默放弃，绝不影响启动。
  const registerInto = (slotName, id, order, label, factory) => {
    let tries = 0
    const attempt = () => {
      const slots = ctx.get('slots')
      if (!slots || typeof slots.register !== 'function') {
        if (tries < 40) {
          tries += 1
          setTimeout(attempt, 250)
        }
        return
      }
      try {
        slots.inject(slotName, () => slots.register({ name: slotName, id, order, label }, factory))
      } catch {
        if (tries < 40) {
          tries += 1
          setTimeout(attempt, 250)
        }
      }
    }
    attempt()
  }

  // 输入框工具行：排在 send-mode(order 10) 右侧、模型键之前
  registerInto('conversation.input.right', 'peak-scheduler', 20, LABEL, (props) =>
    React.createElement(PeakComposerButton, props || {}),
  )

  // 侧边栏脚部：等待任务入口（带数量角标）
  registerInto('sidebar.footer.action', 'peak-scheduler-waiting', 10, '等待任务', (props) =>
    React.createElement(SidebarWaitingEntry, props || {}),
  )
}

export const name = 'peak-scheduler'

/** 测试专用：无（保留导出形态一致性）。 */
export function __resetForTest() {}
