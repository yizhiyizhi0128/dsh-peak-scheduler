window.__ModuleLoader__.load({
  id: "dsh-peak-scheduler",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.js
var client_exports = {};
__export(client_exports, {
  __resetForTest: () => __resetForTest,
  apply: () => apply,
  name: () => name
});
module.exports = __toCommonJS(client_exports);
var import_react = __toESM(require("react"), 1);
var API = "/dsh-peak-scheduler";
var LABEL = "\u5CF0\u8C37\u8C03\u5EA6";
var POLL_MS = 2e4;
var S = {
  button: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    flex: "none",
    height: 28,
    padding: "0 10px",
    border: "1px solid var(--dsw-alias-border-l1)",
    borderRadius: 8,
    background: "transparent",
    color: "var(--dsw-alias-label-secondary)",
    fontSize: 12,
    lineHeight: "18px",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
    cursor: "pointer",
    transition: "background-color .18s ease, color .18s ease"
  },
  disabled: { color: "var(--dsw-alias-label-dimmed)", cursor: "default" },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    height: 16,
    padding: "0 5px",
    borderRadius: 999,
    fontSize: 10,
    lineHeight: "16px",
    fontWeight: 600,
    background: "var(--dsw-alias-state-warn-primary)",
    color: "var(--dsw-alias-bg-base)"
  },
  mask: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1200,
    padding: 20
  },
  modal: {
    background: "var(--dsw-alias-bg-layer-1)",
    border: "1px solid var(--dsw-alias-border-l1)",
    borderRadius: 12,
    padding: 16,
    width: 460,
    maxWidth: "100%",
    maxHeight: "82vh",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    boxShadow: "0 10px 36px rgba(0,0,0,.35)",
    color: "var(--dsw-alias-label-primary)"
  },
  title: { margin: 0, fontSize: 14, fontWeight: 600 },
  hint: { fontSize: 11, lineHeight: "17px", color: "var(--dsw-alias-label-secondary)" },
  caption: { fontSize: 11, lineHeight: "16px", color: "var(--dsw-alias-label-caption)" },
  row: { display: "flex", alignItems: "center", gap: 8 },
  statusBox: {
    border: "1px solid var(--dsw-alias-border-l1)",
    borderRadius: 8,
    padding: "8px 10px",
    background: "var(--dsw-alias-bg-layer-2)",
    display: "flex",
    flexDirection: "column",
    gap: 4
  },
  option: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 2,
    width: "100%",
    textAlign: "left",
    padding: "9px 11px",
    border: "1px solid var(--dsw-alias-border-l1)",
    borderRadius: 8,
    background: "var(--dsw-alias-bg-layer-2)",
    color: "var(--dsw-alias-label-primary)",
    fontFamily: "inherit",
    fontSize: 13,
    cursor: "pointer"
  },
  optionPrimary: {
    border: "1px solid var(--dsw-alias-brand-primary)",
    background: "var(--dsw-alias-bg-layer-1)"
  },
  optionTitle: { fontSize: 13, fontWeight: 600, lineHeight: "19px" },
  optionDesc: { fontSize: 11, lineHeight: "16px", color: "var(--dsw-alias-label-secondary)" },
  btn: { borderRadius: 8, padding: "5px 12px", fontSize: 13, cursor: "pointer" },
  plain: {
    background: "var(--dsw-alias-bg-layer-2)",
    color: "var(--dsw-alias-label-primary)",
    border: "1px solid var(--dsw-alias-border-l1)"
  },
  notice: { fontSize: 12, lineHeight: "18px", wordBreak: "break-word" },
  list: { display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", minHeight: 40 },
  card: {
    border: "1px solid var(--dsw-alias-border-l1)",
    borderRadius: 8,
    padding: "8px 10px",
    background: "var(--dsw-alias-bg-layer-2)",
    display: "flex",
    flexDirection: "column",
    gap: 4
  },
  pre: {
    margin: 0,
    fontSize: 11,
    lineHeight: "16px",
    color: "var(--dsw-alias-label-secondary)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    maxHeight: 60,
    overflow: "hidden"
  }
};
function ClockIcon({ size = 15 }) {
  return import_react.default.createElement(
    "svg",
    { viewBox: "0 0 24 24", width: size, height: size, style: { display: "block", flex: "none" } },
    import_react.default.createElement("circle", { cx: 12, cy: 12, r: 9, fill: "none", stroke: "currentColor", strokeWidth: 1.7 }),
    import_react.default.createElement("path", {
      d: "M12 7.4v5l3.2 1.9",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.7,
      strokeLinecap: "round",
      strokeLinejoin: "round"
    })
  );
}
function MoonIcon({ size = 15 }) {
  return import_react.default.createElement(
    "svg",
    { viewBox: "0 0 24 24", width: size, height: size, style: { display: "block", flex: "none" } },
    import_react.default.createElement("path", {
      d: "M20 14.2A8.4 8.4 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.7,
      strokeLinejoin: "round"
    })
  );
}
function BoltIcon({ size = 15 }) {
  return import_react.default.createElement(
    "svg",
    { viewBox: "0 0 24 24", width: size, height: size, style: { display: "block", flex: "none" } },
    import_react.default.createElement("path", {
      d: "M13.2 2.5 5 13.4h5.1L9.9 21.5 18 10.6h-5.1l.3-8.1Z",
      fill: "currentColor"
    })
  );
}
async function call(path, options) {
  const response = await fetch(API + path, options);
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.ok !== true) {
    const reason = data && data.error || "HTTP " + response.status;
    const error = new Error(reason);
    error.hint = data && data.hint;
    throw error;
  }
  return data;
}
var postJson = (path, body) => call(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
function StatusBox({ status }) {
  if (!status) return import_react.default.createElement("div", { style: S.statusBox }, import_react.default.createElement("div", { style: S.hint }, "\u6B63\u5728\u8BFB\u53D6\u5CF0\u8C37\u4EF7\u683C\u65F6\u6BB5\u2026"));
  const peak = status.isPeak;
  return import_react.default.createElement(
    "div",
    { style: S.statusBox },
    import_react.default.createElement(
      "div",
      { style: { ...S.row, fontWeight: 600 } },
      peak ? import_react.default.createElement(BoltIcon, { size: 14 }) : import_react.default.createElement(MoonIcon, { size: 14 }),
      import_react.default.createElement("span", null, peak ? "\u5F53\u524D\uFF1A\u5CF0\u4EF7\u65F6\u6BB5" + (status.window ? "\uFF08" + status.window + "\uFF09" : "") : "\u5F53\u524D\uFF1A\u8C37\u4EF7\u65F6\u6BB5"),
      import_react.default.createElement("span", { style: { flex: 1 } }),
      import_react.default.createElement("span", { style: S.caption }, status.nowLabel || "")
    ),
    import_react.default.createElement("div", { style: S.hint }, status.discountLabel || ""),
    status.next ? import_react.default.createElement("div", { style: S.hint }, (peak ? "\u8DDD\u8F6C\u4E3A\u8C37\u4EF7\u8FD8\u6709 " : "\u8DDD\u8F6C\u4E3A\u5CF0\u4EF7\u8FD8\u6709 ") + status.next.inLabel + "\uFF08" + status.next.atLabel + "\uFF09") : null,
    import_react.default.createElement("div", { style: S.caption }, "\u5224\u5B9A\u4F9D\u636E\uFF1A" + (status.rule && status.rule.text || "")),
    import_react.default.createElement(
      "div",
      { style: { ...S.caption, color: status.calendar && status.calendar.available ? S.caption.color : "var(--dsw-alias-state-warn-primary)" } },
      status.calendar && status.calendar.note || ""
    )
  );
}
function PeakComposerButton(props) {
  const actions = props.inputActions;
  const useLiveInput = typeof props.useInput === "function" ? props.useInput : () => null;
  const inputState = useLiveInput((s) => s);
  const draft = inputState && typeof inputState.draft === "string" ? inputState.draft : "";
  const [open, setOpen] = import_react.default.useState(false);
  const [status, setStatus] = import_react.default.useState(null);
  const [statusError, setStatusError] = import_react.default.useState("");
  const [busy, setBusy] = import_react.default.useState(false);
  const [notice, setNotice] = import_react.default.useState(null);
  const [hover, setHover] = import_react.default.useState(false);
  const alive = import_react.default.useRef(true);
  import_react.default.useEffect(() => () => {
    alive.current = false;
  }, []);
  const hasDraft = draft.trim().length > 0;
  const loadStatus = import_react.default.useCallback(async () => {
    setStatusError("");
    try {
      const data = await call("/status");
      if (alive.current) setStatus(data);
    } catch (error) {
      if (alive.current) setStatusError(error && error.message || String(error));
    }
  }, []);
  const openDialog = () => {
    setNotice(null);
    setOpen(true);
    void loadStatus();
  };
  const runNow = () => {
    if (typeof actions.submit !== "function") {
      setNotice({ bad: true, text: "\u8FD9\u4E2A DSH \u7248\u672C\u7684\u8F93\u5165\u6846\u4E0D\u652F\u6301\u7A0B\u5E8F\u5316\u63D0\u4EA4\uFF0C\u8BF7\u76F4\u63A5\u6309 Enter \u53D1\u9001\u3002" });
      return;
    }
    actions.submit();
    setOpen(false);
    setNotice({ text: "\u5DF2\u6309\u5F53\u524D\u53D1\u9001\u65B9\u5F0F\u7ACB\u5373\u63D0\u4EA4\u3002" });
  };
  const deferToValley = async () => {
    if (busy) return;
    if (!hasDraft) {
      setNotice({ bad: true, text: "\u8F93\u5165\u6846\u662F\u7A7A\u7684\uFF0C\u6CA1\u6709\u53EF\u63A8\u8FDF\u7684\u5185\u5BB9\u3002" });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const data = await postJson("/defer", { sessionId: props.sessionId, prompt: draft });
      if (typeof actions.setDraft === "function") actions.setDraft("");
      if (!alive.current) return;
      setOpen(false);
      const already = Boolean(status && status.nextOffPeak && status.nextOffPeak.alreadyOffPeak);
      const when = data.target ? data.target.atLabel : "\u8C37\u4EF7\u65F6\u6BB5";
      setNotice({
        text: already ? "\u5F53\u524D\u5DF2\u662F\u8C37\u4EF7\uFF0C\u4EFB\u52A1\u5DF2\u767B\u8BB0\uFF0C\u7EA6\u51E0\u79D2\u540E\u81EA\u52A8\u6267\u884C\uFF08" + when + "\uFF09\u3002\u4FA7\u8FB9\u680F\u53EF\u53D6\u6D88\u6216\u7ACB\u5373\u5F00\u59CB\u3002" : "\u5DF2\u521B\u5EFA\u7B49\u5F85\u4EFB\u52A1\uFF0C\u5C06\u5728 " + when + " \u81EA\u52A8\u6267\u884C\u3002\u4FA7\u8FB9\u680F\u53EF\u968F\u65F6\u6539\u4E3A\u7ACB\u5373\u5F00\u59CB\u3002"
      });
    } catch (error) {
      if (alive.current) {
        setNotice({ bad: true, text: "\u521B\u5EFA\u7B49\u5F85\u4EFB\u52A1\u5931\u8D25\uFF1A" + (error && error.message || String(error)) });
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const canOpen = typeof props.sessionId === "string" && props.sessionId !== "";
  const label = status && status.isPeak === false ? "\u8C37\u4EF7\u4E2D" : LABEL;
  const alreadyOffPeak = Boolean(status && status.nextOffPeak && status.nextOffPeak.alreadyOffPeak);
  const button = import_react.default.createElement(
    "button",
    {
      type: "button",
      className: "dsh-peak-scheduler-trigger",
      "data-peak-scheduler": status ? status.tier : "unknown",
      title: canOpen ? LABEL + "\uFF1A\u67E5\u770B\u5F53\u524D\u5CF0\u8C37\u65F6\u6BB5\uFF0C\u9009\u62E9\u7ACB\u5373\u6267\u884C\u6216" + (alreadyOffPeak ? "\u767B\u8BB0\u4E3A\u81EA\u52A8\u6267\u884C" : "\u63A8\u8FDF\u5230\u8C37\u4EF7") : LABEL + "\uFF08\u5F53\u524D\u6CA1\u6709\u4F1A\u8BDD\uFF09",
      "aria-label": LABEL,
      "aria-disabled": !canOpen,
      onMouseDown: (e) => e.preventDefault(),
      onMouseEnter: () => setHover(true),
      onMouseLeave: () => setHover(false),
      onClick: (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (canOpen) openDialog();
      },
      style: {
        ...S.button,
        ...canOpen ? null : S.disabled,
        ...canOpen && hover ? { background: "var(--dsw-alias-interactive-bg-hover)" } : null
      }
    },
    import_react.default.createElement(ClockIcon),
    label
  );
  const dialog = !open ? null : import_react.default.createElement(
    "div",
    { style: S.mask, onClick: () => !busy && setOpen(false) },
    import_react.default.createElement(
      "div",
      { style: S.modal, onClick: (e) => e.stopPropagation() },
      import_react.default.createElement("h3", { style: S.title }, "\u5CF0\u8C37\u8C03\u5EA6"),
      statusError ? import_react.default.createElement("div", { style: { ...S.notice, color: "var(--dsw-alias-state-error-primary)" } }, "\u8BFB\u53D6\u5CF0\u8C37\u72B6\u6001\u5931\u8D25\uFF1A" + statusError) : import_react.default.createElement(StatusBox, { status }),
      import_react.default.createElement("div", { style: S.hint }, hasDraft ? "\u8F93\u5165\u6846\u5185\u5BB9\uFF08\u5C06\u88AB\u8C03\u5EA6\u7684\u63D0\u793A\u8BCD\uFF09\uFF1A" : "\u8F93\u5165\u6846\u5F53\u524D\u4E3A\u7A7A"),
      hasDraft ? import_react.default.createElement("div", { style: S.pre }, draft.length > 300 ? draft.slice(0, 300) + "\u2026" : draft) : null,
      import_react.default.createElement(
        "button",
        {
          type: "button",
          disabled: !hasDraft,
          onClick: runNow,
          style: { ...S.option, ...hasDraft ? S.optionPrimary : S.disabled }
        },
        import_react.default.createElement("span", { style: S.optionTitle }, "\u7ACB\u5373\u6267\u884C"),
        import_react.default.createElement("span", { style: S.optionDesc }, "\u6309\u5F53\u524D\u53D1\u9001\u65B9\u5F0F\u9A6C\u4E0A\u63D0\u4EA4\u8FD9\u6BB5\u63D0\u793A\u8BCD\u3002")
      ),
      import_react.default.createElement(
        "button",
        {
          type: "button",
          disabled: busy || !hasDraft,
          onClick: () => void deferToValley(),
          style: { ...S.option, ...busy || !hasDraft ? S.disabled : null }
        },
        import_react.default.createElement(
          "span",
          { style: S.optionTitle },
          busy ? "\u6B63\u5728\u521B\u5EFA\u7B49\u5F85\u4EFB\u52A1\u2026" : alreadyOffPeak ? "\u7ACB\u5373\u6267\u884C\uFF08\u5DF2\u662F\u8C37\u4EF7\uFF0C\u65E0\u9700\u7B49\u5F85\uFF09" : "\u63A8\u8FDF\u5230\u8C37\u4EF7\u65F6\u6BB5\u81EA\u52A8\u6267\u884C"
        ),
        import_react.default.createElement(
          "span",
          { style: S.optionDesc },
          // 已经是谷价时不能再叫"推迟"——没有可推迟的东西。
          // 这里如实说清：会被登记成一个马上就触发的等待任务，而不是"等更便宜的时段"。
          status && status.nextOffPeak ? status.nextOffPeak.alreadyOffPeak ? "\u5F53\u524D\u5DF2\u7ECF\u662F\u8C37\u4EF7\uFF0C\u518D\u7B49\u4E5F\u4E0D\u4F1A\u66F4\u4FBF\u5B9C\u3002\u9009\u62E9\u5B83\u4F1A\u628A\u8FD9\u6BB5\u63D0\u793A\u8BCD\u767B\u8BB0\u6210\u4E00\u4E2A\u7B49\u5F85\u4EFB\u52A1\uFF0C\u7EA6\u51E0\u79D2\u540E\u81EA\u52A8\u6267\u884C\uFF08\u4F60\u4ECD\u53EF\u5728\u4FA7\u8FB9\u680F\u53D6\u6D88\uFF09\u3002" : "\u5C06\u5728 " + status.nextOffPeak.atLabel + "\uFF08\u7EA6 " + status.nextOffPeak.inLabel + "\u540E\uFF09\u81EA\u52A8\u6267\u884C\u3002" : "\u5C06\u5728\u4E0B\u4E00\u4E2A\u8C37\u4EF7\u65F6\u6BB5\u81EA\u52A8\u6267\u884C\u3002"
        )
      ),
      notice ? import_react.default.createElement(
        "div",
        { role: "status", style: { ...S.notice, color: notice.bad ? "var(--dsw-alias-state-error-primary)" : "var(--dsw-alias-label-secondary)" } },
        notice.text
      ) : null,
      import_react.default.createElement(
        "div",
        { style: S.row },
        import_react.default.createElement("span", { style: { flex: 1 } }),
        import_react.default.createElement("button", { type: "button", disabled: busy, onClick: () => setOpen(false), style: { ...S.btn, ...S.plain } }, "\u53D6\u6D88")
      )
    )
  );
  if (!notice || open) return import_react.default.createElement(import_react.default.Fragment, null, button, dialog);
  return import_react.default.createElement(
    import_react.default.Fragment,
    null,
    button,
    import_react.default.createElement(
      "span",
      { role: "status", style: { ...S.notice, color: notice.bad ? "var(--dsw-alias-state-error-primary)" : "var(--dsw-alias-label-caption)", maxWidth: 320 } },
      notice.text
    ),
    dialog
  );
}
function WaitingPanel({ onClose }) {
  const [tasks, setTasks] = import_react.default.useState(null);
  const [notice, setNotice] = import_react.default.useState(null);
  const [busyId, setBusyId] = import_react.default.useState(null);
  const [status, setStatus] = import_react.default.useState(null);
  const alive = import_react.default.useRef(true);
  import_react.default.useEffect(() => () => {
    alive.current = false;
  }, []);
  const refresh = import_react.default.useCallback(async () => {
    try {
      const data = await call("/tasks");
      if (alive.current) setTasks(Array.isArray(data.tasks) ? data.tasks : []);
    } catch (error) {
      if (alive.current) {
        setTasks([]);
        setNotice({ bad: true, text: "\u8BFB\u53D6\u7B49\u5F85\u4EFB\u52A1\u5931\u8D25\uFF1A" + (error && error.message || String(error)) });
      }
    }
  }, []);
  import_react.default.useEffect(() => {
    void refresh();
    void call("/status").then((data) => {
      if (alive.current) setStatus(data);
    }).catch(() => {
    });
  }, [refresh]);
  const runNow = async (task) => {
    setBusyId(task.id);
    setNotice(null);
    try {
      const data = await postJson("/run-now", { sessionId: task.sessionId, id: task.id });
      if (!alive.current) return;
      setNotice({
        text: data.warning ? data.warning : "\u5DF2\u7ACB\u5373\u6267\u884C\uFF0C\u63D0\u793A\u8BCD\u5DF2\u6295\u9012\u5230\u8BE5\u4F1A\u8BDD\u3002",
        bad: Boolean(data.warning)
      });
      await refresh();
    } catch (error) {
      if (alive.current) setNotice({ bad: true, text: "\u7ACB\u5373\u6267\u884C\u5931\u8D25\uFF1A" + (error && error.message || String(error)) });
    } finally {
      if (alive.current) setBusyId(null);
    }
  };
  const remove = async (task) => {
    setBusyId(task.id);
    setNotice(null);
    try {
      await postJson("/delete", { sessionId: task.sessionId, id: task.id });
      await refresh();
      if (alive.current) setNotice({ text: "\u5DF2\u53D6\u6D88\u8BE5\u7B49\u5F85\u4EFB\u52A1\u3002" });
    } catch (error) {
      if (alive.current) setNotice({ bad: true, text: "\u53D6\u6D88\u5931\u8D25\uFF1A" + (error && error.message || String(error)) });
    } finally {
      if (alive.current) setBusyId(null);
    }
  };
  const h = import_react.default.createElement;
  const rows = tasks === null ? h("div", { style: S.hint }, "\u6B63\u5728\u8BFB\u53D6\u2026") : tasks.length === 0 ? h("div", { style: S.hint }, "\u6682\u65E0\u7B49\u5F85\u4E2D\u7684\u4EFB\u52A1\u3002\u5728\u8F93\u5165\u6846\u70B9\u300C\u5CF0\u8C37\u8C03\u5EA6\u300D\u5373\u53EF\u628A\u63D0\u793A\u8BCD\u63A8\u8FDF\u5230\u8C37\u4EF7\u65F6\u6BB5\u3002") : tasks.map(
    (task) => h(
      "div",
      { key: task.id, style: S.card },
      h("div", { style: { ...S.optionTitle, fontSize: 12 } }, task.title || "(\u65E0\u6807\u9898)"),
      h("div", { style: S.caption }, "\u8BA1\u5212\u6267\u884C\uFF1A" + (task.targetLabel || task.scheduledAt || "\u672A\u77E5")),
      task.promptPreview ? h("pre", { style: S.pre }, task.promptPreview) : null,
      task.calendarAvailable === false ? h("div", { style: { ...S.caption, color: "var(--dsw-alias-state-warn-primary)" } }, "\u521B\u5EFA\u65F6\u672A\u53D6\u5F97\u8282\u5047\u65E5\u65E5\u5386\uFF0C\u8BE5\u65F6\u70B9\u53EF\u80FD\u4E0D\u662F\u771F\u6B63\u7684\u8C37\u4EF7\u3002") : null,
      h(
        "div",
        { style: S.row },
        h(
          "button",
          {
            type: "button",
            disabled: busyId === task.id,
            onClick: () => void runNow(task),
            style: { ...S.btn, ...S.optionPrimary, padding: "3px 10px", fontSize: 12 }
          },
          busyId === task.id ? "\u5904\u7406\u4E2D\u2026" : "\u7ACB\u5373\u5F00\u59CB"
        ),
        h(
          "button",
          {
            type: "button",
            disabled: busyId === task.id,
            onClick: () => void remove(task),
            style: { ...S.btn, ...S.plain, padding: "3px 10px", fontSize: 12 }
          },
          "\u53D6\u6D88"
        ),
        h("span", { style: { flex: 1 } }),
        h("span", { style: S.caption }, task.sessionId ? "\u4F1A\u8BDD " + String(task.sessionId).slice(0, 18) : "")
      )
    )
  );
  return h(
    "div",
    { style: S.mask, onClick: () => onClose() },
    h(
      "div",
      { style: S.modal, onClick: (e) => e.stopPropagation() },
      h("h3", { style: S.title }, "\u7B49\u5F85\u4EFB\u52A1" + (tasks === null ? "" : " \xB7 " + tasks.length + " \u4E2A")),
      h(StatusBox, { status }),
      notice ? h("div", { role: "status", style: { ...S.notice, color: notice.bad ? "var(--dsw-alias-state-error-primary)" : "var(--dsw-alias-label-secondary)" } }, notice.text) : null,
      h("div", { style: S.list }, rows),
      h(
        "div",
        { style: S.row },
        h("button", { type: "button", onClick: () => void refresh(), style: { ...S.btn, ...S.plain } }, "\u5237\u65B0"),
        h("span", { style: { flex: 1 } }),
        h("button", { type: "button", onClick: () => onClose(), style: { ...S.btn, ...S.plain } }, "\u5173\u95ED")
      )
    )
  );
}
function SidebarWaitingEntry(props) {
  const [count, setCount] = import_react.default.useState(0);
  const [open, setOpen] = import_react.default.useState(false);
  const [hover, setHover] = import_react.default.useState(false);
  const alive = import_react.default.useRef(true);
  import_react.default.useEffect(() => () => {
    alive.current = false;
  }, []);
  import_react.default.useEffect(() => {
    let timer;
    const poll = async () => {
      try {
        const data = await call("/tasks");
        if (alive.current) setCount(Array.isArray(data.tasks) ? data.tasks.length : 0);
      } catch {
      }
      if (alive.current) timer = setTimeout(poll, POLL_MS);
    };
    void poll();
    return () => {
      alive.current = false;
      if (timer) clearTimeout(timer);
    };
  }, []);
  const wide = props.wide !== false;
  const h = import_react.default.createElement;
  return h(
    import_react.default.Fragment,
    null,
    h(
      "button",
      {
        type: "button",
        className: "dsh-peak-scheduler-waiting",
        "data-waiting-count": count,
        title: count > 0 ? "\u6709 " + count + " \u4E2A\u7B49\u5F85\u4E2D\u7684\u5CF0\u8C37\u4EFB\u52A1" : "\u5CF0\u8C37\u7B49\u5F85\u4EFB\u52A1",
        "aria-label": "\u7B49\u5F85\u4EFB\u52A1" + (count > 0 ? "\uFF08" + count + " \u4E2A\uFF09" : ""),
        onMouseEnter: () => setHover(true),
        onMouseLeave: () => setHover(false),
        onClick: () => setOpen(true),
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: wide ? "7px 8px" : "7px 0",
          margin: "0 0 4px",
          justifyContent: wide ? "flex-start" : "center",
          border: "none",
          borderRadius: 8,
          background: hover ? "var(--dsw-alias-interactive-bg-hover)" : "transparent",
          color: "var(--dsw-alias-label-secondary)",
          fontSize: 13,
          lineHeight: "20px",
          fontFamily: "inherit",
          cursor: "pointer",
          textAlign: "left"
        }
      },
      h(ClockIcon, { size: 16 }),
      wide ? h("span", null, "\u7B49\u5F85\u4EFB\u52A1") : null,
      count > 0 ? h("span", { style: S.pill }, String(count)) : null
    ),
    open ? h(WaitingPanel, { onClose: () => setOpen(false) }) : null
  );
}
function apply(ctx) {
  const registerInto = (slotName, id, order, label, factory) => {
    let tries = 0;
    const attempt = () => {
      const slots = ctx.get("slots");
      if (!slots || typeof slots.register !== "function") {
        if (tries < 40) {
          tries += 1;
          setTimeout(attempt, 250);
        }
        return;
      }
      try {
        slots.inject(slotName, () => slots.register({ name: slotName, id, order, label }, factory));
      } catch {
        if (tries < 40) {
          tries += 1;
          setTimeout(attempt, 250);
        }
      }
    };
    attempt();
  };
  registerInto(
    "conversation.input.right",
    "peak-scheduler",
    20,
    LABEL,
    (props) => import_react.default.createElement(PeakComposerButton, props || {})
  );
  registerInto(
    "sidebar.footer.action",
    "peak-scheduler-waiting",
    10,
    "\u7B49\u5F85\u4EFB\u52A1",
    (props) => import_react.default.createElement(SidebarWaitingEntry, props || {})
  );
}
var name = "peak-scheduler";
function __resetForTest() {
}
    return module.exports;
  }
});
