# dsh-peak-scheduler（峰谷价格自动调度）

自动判定 DeepSeek 模型的**峰价 / 谷价时段**，并把「要不要等到谷价再跑」这件事做成一键选择：

1. **自动查询峰谷时段** —— 规则取自官方文档，节假日日历联网获取（带本地缓存与降级）；
2. 输入框加一个 **「峰谷调度」** 按钮，点开弹窗让你选 **立即执行** 或 **推迟到谷价**；
3. 选推迟的提示词不会立刻跑，而是建成一个**等待任务**（耐久存储、到点自动投递回本会话），
   左侧侧边栏出现带数量的 **「等待任务」** 入口；
4. 等待中的任务随时可以 **立即开始**（或取消）。

## 安装

需要可用的 [DSH（DeepSeek Harness）](https://github.com/deepseek-ai/deepseek-harness) 环境。

```bash
dsh plugin add github:yizhiyizhi0128/dsh-peak-scheduler --profile <你的 profile 名>
```

再把 `dsh-peak-scheduler` 加进该 profile 的 `dsh.profile.bundles` 列表：

```jsonc
// ~/.dsh/profiles/<你的 profile 名>/package.json
"dsh": {
  "profile": {
    "bundles": [
      "dsh-peak-scheduler"                          // ← 新增
    ]
  }
}
```

然后安装依赖并**重启 DSH**（新 bundle 要在启动时进 boot graph）：

```bash
dsh plugin --profile <你的 profile 名> install
```

> ⚠️ 本插件的「等待任务」落在**官方 `schedule` 服务**里，所以 profile 的 bundles
> 必须同时包含 `@deepseek-ai/dsh-experimental-schedule-bundle`（它只能在 bundles 里按名插入，
> **不要**写进 `dependencies`）。详见下文「启用官方 schedule bundle」一节。

**离线安装 / 自行构建**：见文末「如何启用」。

## 峰谷规则（唯一的判定依据）

来源：DeepSeek 官方 API 文档「模型 & 价格」（中英两版互校，两版说的是同一件事）。

> 北京时间周一至周五（不含中国法定节假日）**09:00–12:00、14:00–18:00** 为**高峰时段**；
> 其余时段，包括周末及中国法定节假日全天，均为**空闲时段**。
> 空闲时段价格为高峰时段价格的**一半**。
> （官方补充公告：**调休上班的周末**、中国法定节假日全天均按空闲时段计费。）

英文版对照（同一口径，可自校验）：

> Peak hours are **01:00 - 04:00 and 06:00 - 10:00 UTC**, Monday through Friday,
> excluding Chinese public holidays. All other hours are off-peak…
> Off-peak rates are **half** of the peak rates.

09:00 +0800 = 01:00 UTC、18:00 +0800 = 10:00 UTC，两版完全对得上。

| | 峰价 | 谷价 |
| --- | --- | --- |
| 时段（北京时间） | 周一至周五 09:00–12:00、14:00–18:00 | 其余全部 |
| 区间语义 | `[09:00, 12:00)`、`[14:00, 18:00)` —— **左闭右开** | — |
| 周末 | 不算峰价 | ✅ 全天谷价 |
| 法定节假日 | 不算峰价 | ✅ 全天谷价 |
| **调休补班的周末** | **不算峰价** | ✅ 仍然全天谷价 |
| 价格 | 标准价 | 峰价的 50% |

### 关于「调休补班日」——查证过程与结论

2026 年有 6 个调休补班日（如 10-10 周六上班、09-20 周日上班）。官方文档只说
"excluding Chinese public holidays"，**没有提补班日算不算峰价**，所以这是一个真实的歧义点，
不能靠猜。查证结果：

- 国务院 2026 年放假安排：国庆 10-01 至 10-07 放假调休，**09-20（周日）、10-10（周六）上班**；
- DeepSeek 同日发布的 API 峰谷时间说明：**「调休上班的周末、中国法定节假日全天均按空闲时段计费」**。

**结论：周末无论是否调休都是谷价，补班不改变这一点。**
所以本插件只需要「放假日」集合（`isOffDay: true`），**刻意不把补班日当峰价日** ——
`lib/holidays.js` 的注释里写明了这个判断依据，测试里也专门钉了这条
（`test/holidays.test.mjs` 断言 2026-10-10 / 09-20 / 02-28 不在放假日集合内，且它们确实是周末）。

## 按钮与入口位置

| 位置 | 槽位 | 说明 |
| --- | --- | --- |
| 输入框工具行 **「峰谷调度」** | `conversation.input.right`（`order: 20`） | 紧邻发送区；`dsh-send-mode` 是 10，本插件排其后 |
| 侧边栏 **「等待任务」**（带数量角标） | `sidebar.footer.action`（`order: 10`） | 落在设置/账号行上方，与「本地记忆」同一区域 |

侧边栏入口每 20 秒轮询一次 `/tasks`；点开是**自带的等待任务面板**（列表 + 立即开始 + 取消），
与官方 `ui-schedule` 的「自动化任务」页各管各的展示，但**共用同一批任务数据**
（都是 `schedule` 服务里的记录，不存在两份真相）。

## 一个已修的真实故障：`The scheduled time must be strictly in the future.`

**触发条件**：当前**已经处于谷价**时点「推迟到谷价」。

**根因**：官方 schedule 对绝对时点 `at` 的要求是「**严格**未来的绝对时点」，
而"当前已是谷价"时 `nextOffPeak.at` 就等于**此刻**。把它当 `at` 交过去必然被
`not_future` 拒绝 —— 首版就是这么写的。

**修法**：改用 `after_seconds`（官方定义：**正安全整数秒数的延迟**）。
延迟语义天然相对现在、必然在未来，不受"采样时刻 vs 排队时刻"的竞态影响，
也省掉了自己拼本地日期时间对象那一层时区换算。另加两道保险：

- `deferDelaySeconds()` 保证返回值**恒 ≥ 2 秒**（`MIN_LEAD_SECONDS`）；
- 创建成功后核对返回的 `scheduledAt` 是否真在未来，**不是就撤销该任务并如实报错**，
  绝不留一个永远不会触发的任务。

**顺带修了文案**：已在谷价时"推迟"没有意义（再等也不会更便宜），
该选项改为 **「立即执行（已是谷价，无需等待）」**，说明写清"约几秒后自动执行、
仍可在侧边栏取消"。

**回归测试**：`test/host.test.mjs` 第 8 节把"延迟恒为正、目标严格在未来"钉死
（含"目标=此刻"、"目标已过去"、"只差 1 毫秒"、"算不出目标"等 case）；
`test/client.test.mjs` 第 12 节覆盖谷价态下的文案与创建流程。

**注意：修完必须重启宿主才生效。** 插件模块被宿主进程缓存，
重启前仍在跑修前的代码（实测：改完文件、路由已活，`/defer` 依旧报同一个错）。
重启后用这条命令复验当前这个"已在谷价"的场景：

```powershell
$body = @{ sessionId = "<本会话 id>"; prompt = "自检" } | ConvertTo-Json -Compress
Invoke-RestMethod http://127.0.0.1:19387/dsh-peak-scheduler/defer -Method Post `
  -ContentType "application/json; charset=utf-8" `
  -Body ([Text.Encoding]::UTF8.GetBytes($body))
# → { ok: true, task: { ..., afterSeconds: 2 }, target: { alreadyOffPeak: true, ... } }
```

## 第二个已修的真实故障：跑完的任务一直挂在「等待中」

**现象**：任务已经到点、提示词也投递进会话了，但侧边栏角标永远显示 1，点开是个已完成的任务。

**根因**：官方 schedule 的**一次性任务在投递完成后会保留为 `inactive`**（设计如此，
文档原文："一次性任务在持久收件箱投递后仍以未运行状态保存"）。
我的筛选只判断了「这条任务是不是本插件建的」，没判断「它是否还在等待」，
于是已投递的任务被一直算作等待中。

**修法**：

- `partitionTasks()` 把目录条目分成 **等待中**（`isPeakTask && status !== 'inactive'`）与
  **已投递**（`isPeakTask && status === 'inactive'`）两组，只把前者算进角标；
  官方自建提醒单独归入 `otherTasks`，不伪装成峰谷任务；
- `/tasks` 支持 `sessionId` 过滤（侧边栏是全局视角，不传）；
- `/run-now` 改用 `catalog` 查任务 —— 官方 `list` **只返回活动任务**，
  用 `list` 查已投递的任务会报"找不到"；现在对已投递的任务返回 **409 + 明确说明**
  （"该任务已经执行过了，未重复发送"），不会重复投递；
- 已投递/已消失任务的本地元数据会被清理，`meta.json` 不会无限增长。

**回归测试**：`test/host.test.mjs` 第 9 节，覆盖全局/限定会话/未知会话/无元数据/空目录
等情形，并断言"等待中的每一行都同时满足「是本插件建的」+「status !== inactive」"。

## 交互流程

```
输入框里写好提示词
   └─ 点「峰谷调度」
        ├─ 弹窗显示：当前是峰/谷、当前时段、距下次切换多久、判定依据、日历可用性
        ├─ [立即执行]          → 调用 DSH 自己的 inputActions.submit()（不绕开发送通道）
        └─ [推迟到谷价时段自动执行]（已在谷价时显示为「立即执行（已是谷价，无需等待）」）
             ├─ POST /dsh-peak-scheduler/defer { sessionId, prompt }
             ├─ 宿主算出到谷价的秒数（恒 ≥ 2），用 schedule.create(after_seconds) 建一次性任务
             ├─ 成功后才清空输入框（失败保留草稿并报错）
             └─ 侧边栏「等待任务」角标 +1
                   └─ 可随时「立即开始」→ POST /run-now
                        ├─ sessionController.prompt() 把提示词投递进原会话
                        └─ 投递成功后再删等待任务（避免"没执行又被删了"）
```

到谷价时点时，由**官方 schedule 服务**自动把提示词作为后续消息投递回原会话
（宿主重启后任务仍在；冷会话会被唤醒）。

## 文件

| 文件 | 作用 |
| --- | --- |
| `package.json` | 包声明（`dsh.bundle.patch` + `dsh.client`） |
| `cordis.patch.yml` | bundle 层，插入 loader 条目 `id: peak-scheduler` |
| `index.js` | 宿主半边：HTTP 路由 + 调 schedule/sessionController |
| `lib/peak.js` | **峰谷判定纯逻辑**（无 IO、可单测：边界、跨日、跨周末、跨年） |
| `lib/holidays.js` | 节假日日历：联网获取 + 本地缓存 + 降级 |
| `src/client.js` | 浏览器半边（输入框按钮 + 弹窗 + 侧边栏入口与面板） |
| `lib/client.js` | esbuild 构建产物 |
| `build.mjs` | 构建脚本 |
| `test/peak.test.mjs` | 峰谷判定 85 项 |
| `test/holidays.test.mjs` | 真实联网校验日历 30 项 |
| `test/host.test.mjs` | 宿主响应组装与元数据 47 项 |
| `test/client.test.mjs` | 客户端交互 55 项 |
| `test/bundle.check.mjs` | 产物 + 安装态自检 |

## 依赖：官方 schedule bundle（已启用）

等待任务的**耐久存储与到点投递**没有自己重写，而是复用官方能力：

> `@deepseek-ai/dsh-experimental-schedule-bundle` —— 官方可选实验 bundle，
> 提供 `Schedule` 服务、自动化任务页、以及投递所需的 Session controller 挂载。
> 它默认**不在**随发行版的 Web 组合里，需要在 profile 启用。

本机已在 `profiles/desktop/package.json` 的两处登记：

```jsonc
"dsh": { "profile": { "bundles": [
  "dsh-peak-scheduler",
  "@deepseek-ai/dsh-experimental-schedule-bundle"   // ← 新增
] } }
```

> **踩过的坑**：不要把它写进 `dependencies`。它不是 npm 上发布的包，
> 写进 dependencies 会让 `pnpm install` 去 registry 拉取并失败
> （`Failed to fetch metadata from https://registry.npmjs.org/...`）。
> 它只能通过 profile 的 `dsh.profile.bundles` 按 bundle 名插入。

## 如何启用

```powershell
# 在仓库根目录执行；Node 用任意 >= 22 的版本即可
cd <本仓库目录>

npm install --save-dev esbuild   # 仅构建需要（build.mjs 会从本地 node_modules 解析）
node build.mjs                   # 产出 lib/client.js

# 测试（全部离线，holidays 那条会联网取日历）
node test/peak.test.mjs          # 85 checks
node test/holidays.test.mjs      # 30 checks（需联网）
node test/host.test.mjs          # 81 checks
node test/client.test.mjs        # 65 checks
node test/bundle.check.mjs       # 构建产物 + 安装态自检
                                 #   （未装 DSH 时第 4、5 节会显示 SKIP，不是失败）

npm pack                         # 产出 dsh-peak-scheduler-<版本>.tgz
Copy-Item dsh-peak-scheduler-*.tgz "$env:USERPROFILE\.dsh\vendor\" -Force

# profile 登记（见上一节两处）+ 安装依赖
cd "$env:USERPROFILE\.dsh\profiles\desktop"   # profile 名按你的实际情况改
pnpm install
```

> 测试脚本通过 `DSH_HOME` / `DSH_PROFILE` 环境变量定位 DSH 安装位置，
> 默认 `~/.dsh` + `desktop`，不写死任何人的机器路径。

然后**重启承载 GUI 的进程**（新增插件条目要在 boot 时进 boot graph）并硬刷新页面。

## 如何验证

**A. 宿主路由（重启后可用）**

```powershell
Invoke-RestMethod http://127.0.0.1:19387/dsh-peak-scheduler/health
# → { ok: true, schedule: true, sessionController: true }

Invoke-RestMethod http://127.0.0.1:19387/dsh-peak-scheduler/status
# → { tier, isPeak, nowLabel, window, next, nextOffPeak, calendar, rule, ... }
```

**B. 界面**

1. 输入框工具行出现 **「峰谷调度」**；写一句话点开弹窗，应看到当前时段、
   距切换的倒计时、以及「判定依据」一行；
2. 选 **立即执行** → 等同按 Enter 发送；
3. 选 **推迟到谷价** → 输入框被清空，侧边栏「等待任务」出现角标；
4. 点侧边栏入口 → 面板列出该任务与计划执行时间 → 点 **立即开始** →
   提示词立刻投递到本会话，任务从列表消失；
5. 交叉验证：**设置 → 自动化任务**（官方页面）里应能看到同一条任务 ——
   证明等待任务确实落在官方 schedule 里，不是插件私有的假队列。

## 边界与降级

| 情况 | 行为 |
| --- | --- |
| 取不到节假日日历 | **不猜**。退回"仅工作日规则"判定，并在 `calendar.available=false` ＋ 界面提示"法定节假日可能被误判为峰价" |
| 主数据源失败 | 自动切备用源（实测过一次：holiday-cn 超时后 timor.tech 接上） |
| 全部源失败但有旧缓存 | 用过期缓存并在响应里标 `stale: true` |
| 输入框为空 | 弹窗里两个选项都禁用，并提示"输入框是空的" |
| 创建等待任务失败 | **不清空草稿**，把宿主的原因显示出来 |
| 投递成功但删除任务失败 | 如实返回 `warning`（提示词已投递、可能重复），不假装成功 |
| 跨年（次年日历未发布） | 已发布年份正常判定；未发布年份按工作日规则，并受上面的降级提示约束 |

## 范围声明

只新增本插件与启用官方 schedule bundle 这两件事，
未改动任何现有插件、DSH 本体代码或无关 profile 配置。
