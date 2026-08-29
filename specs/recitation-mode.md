# 背谱模式（棋谱背诵・Recitation Mode）功能计划书

本文档为 ShogiHome 新增「背谱模式」功能的计划书（设计规格书）。
该功能类似 [Shogi Log](https://play.google.com/store/apps/details?id=com.the.shogi_notebook)（将棋棋谱背诵/暗记应用）的背谱练习：用户凭记忆在棋盘上重现一份棋谱，系统逐手校验走法是否与棋谱一致。

> 参考约定：本文件放置于 `specs/` 目录，写法与 [next-move-problem.md](./next-move-problem.md) 保持一致。

## 1. 功能概要

在已打开的棋谱（KIF / KI2 / CSA / JKF / USEN 等任意格式）基础上，进入「背谱模式」：

1. 棋盘回到棋谱的**初始局面**，棋谱本身被隐藏（不显示手数列表、注释、变化手顺）。
2. 用户凭记忆在棋盘上走一步（合法手）。
3. 系统将该手与棋谱**本谱（主线）对应手数**的走法比较：
   - **一致（正解）**：提示正确，推进到下一步，直到棋谱完成。
   - **不一致（错误）**：提示错误，**该手不被记入棋谱、局面保持在原位置**（即"回退"到错误前的状态），用户重新尝试，直到下出正确的一手为止。
4. 全部手数完成（或到达投了等特殊手）后，显示成绩总结（用时、错误次数），退出背谱模式。

核心体验一句话：**走一步 → 判定 → 对则前进 / 错则重来 → 直至背完。**

## 2. 对应平台

- **Electron 版（桌面）**：支持。使用桌面版对话框。
- **Web 版**：支持。本功能为纯前端功能，不依赖本地文件系统或 USI 引擎。
- **移动版 Web 应用**：支持。使用移动端全屏对话框（与「次の一手」出题一致的移动端策略）。

## 3. 用户操作流程

### 3.1 开始

- 前置条件：已打开一份包含至少 1 手棋的棋谱，且应用处于 `AppState.NORMAL`。
- 入口（推荐同时提供）：
  1. 菜单 → 「棋谱」/「文件」菜单新增「背谱模式」按钮（与「次の一手問題集」并列）。
  2. （可选）棋谱面板（RecordPane）顶部工具条新增「背谱」按钮。
- 点击后进入背谱模式：
  - 保存当前棋谱的查看位置（当前节点）与分支选择，用于退出时恢复。
  - `record.resetAllBranchSelection()` 将活动分支重置为本谱（主线）。
  - `record.goto(0)` 回到初始局面。
  - 打开背谱对话框，显示棋盘与进度信息。
- 若当前棋谱没有可背诵的手（`record.current.next === null`），提示错误并不进入模式。

### 3.2 进行中（核心循环）

```
[局面 S（第 n 手前，手番 T）]
        │  用户在棋盘上走一手 M（合法手）
        ▼
   M 与 棋谱主线第 n 手一致？
   ├── 是（正解）──► 提示"正确"；棋谱推进到第 n 手（`gotoNode`）
   │                  （n = n + 1，手番交替）
   │                  ├── 还有下一手？──► 回到 [局面 S']
   │                  └── 没有下一手 ──► 完成 → 显示成绩总结
   └── 否（错误）──► 提示"错误，请重试"；错误次数 +1
                       M 不记入棋谱，局面保持在第 n 手之前
                       └── 回到 [局面 S]，等待用户重新走子
```

- 正解时的推进与"错误时回退"都是**天然成立**的：
  - 正解手通过 `record.gotoNode(正解ノード)` 推进时，会移动到活动路径上对应的既有节点，**不会创建新节点**（详见 [4.2](#42-正解推进的机制)）。
  - 错误手**完全不调用 append**，棋谱结构、局面均不发生变化，即满足"回退上一步，直到下出正确的一手"。

### 3.3 完成

- 完成条件：`record.current.next === null`，或 `record.current.next.move` 为特殊手（投了 / 中断 / 千日手 / 宣言胜等）。
  - 说明：背诵对象仅为普通指し手（`Move`）。棋谱末尾的投了等特殊手不属于背诵内容，到达该处即视为"背完"。
- 完成时显示成绩总结对话框：
  - 总手数、用时（进入模式到完成）、错误次数。
- 用户确认后退出背谱模式，棋谱恢复为进入前的查看位置（见 4.5）。

### 3.4 中断退出

- 任何时候点击「退出」：
  - 显示确认（若已走若干手）：「退出后进度将丢失，确定退出吗？」
  - 退出后棋谱恢复为进入前的查看位置与分支选择；不保留进度（进度保存为将来扩展，见 §8）。
- 对话框关闭即结束背谱；**不提供**「暂停/恢复」能力（v1 从简）。

### 3.5 提示（HINT）、前一手与重新开始

- 「提示」按钮：**自动下出当前的正解手**（计入 1 次错误，可被「前一手」退回）；同时弹出显示正解手文本的消息窗口（自动关闭）。
- 「前一手」按钮：**回到上一步**（正解/提示前的手番局面），方便查看复盘；退回后可重新作答。误り回数は維持される。
- 「重新开始」按钮：确认后 `record.goto(0)`，错误次数与用时清零，从头开始。

## 4. 判定逻辑与实现机制（基于 tsshogi）

### 4.1 正解判定

- 期望手：**活动路径（アクティブな経路）**上的下一手节点。活动路径即主页面当前选择中的本谱 / 变化手顺（各手数上 `activeBranch === true` 的节点连线）。
  - 在 tsshogi 中，`Node.next` 返回**第一个兄弟节点**（branchIndex = 0），`Node.branch` 返回下一个兄弟节点；沿 `next` 并在 `activeBranch === false` 时转向 `branch`，即可遍历活动路径。背谱**不重置分支选择**，因此与主页面显示的分支保持一致。
- 用户走子 M 与期望手比较：`M.usi === expectedMove.usi`（等价于 tsshogi 内部 `areSameMoves`）。USI 字符串比较已足以覆盖升变/非升变、打入、同手不同表记等差异。
- 若活动路径上没有下一手或下一手是 `SpecialMove` → 已完成（见 3.3）。

### 4.2 正解推进的机制

调用 `record.gotoNode(正解ノード)`：

- 正解手是活动路径上已存在的节点，`gotoNode` 沿活动路径移动到该节点，**不会新建节点**，棋谱结构保持不变。
- 因此背谱过程对棋谱是**只读式的游标移动**（不改变分支选择），无需深拷贝棋谱，也不产生脏数据。
- 推进后触发 `changePosition` 事件，棋盘与进度 UI 随之更新（复用现有响应式链路）。

### 4.3 错误处理

- 错误手**不调用 append**：局面保持、棋谱不变、错误次数 +1，显示提示（消息窗口，自动关闭），等待重试。
- 由于错误手不进入棋谱，不存在"错误分支污染棋谱"的问题，也不需要额外回退操作。

### 4.4 特殊情况处理

| 情况                                          | 处理                                                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 棋谱含分支（变化手顺）                        | 背诵**主页面当前选中的活动路径**（本谱或变化手顺）。不重置分支选择，退出时恢复进入前的节点与分支选择。                                |
| 初始局面非平手（駒落ち、编辑局面、SFEN 开局） | `goto(0)` 即恢复棋谱的初始局面（`initialPosition`），正常背诵。                                                                       |
| 末尾为投了等特殊手                            | 到达该节点前视为"全部背完"（见 3.3），不要求用户"走出"特殊手。                                                                        |
| 千日手 / 反覆局面                             | 与普通手无异；若棋谱因千日手结束，正常推进至最后一手。                                                                                |
| 用户在背谱中操作棋谱面板 / 菜单               | 背谱模式处于新 `AppState.RECITATION`，既有逻辑（`appState !== AppState.NORMAL` 即禁用编辑/导航/菜单操作）自动生效；棋谱面板不可操作。 |

### 4.5 退出恢复

- 进入背谱时保存 `record.current`（节点引用）。
- 退出（完成或中断）时调用 `record.gotoNode(savedNode)` 恢复进入前的查看位置与沿途分支选择（tsshogi 的 `gotoNode` 会沿保存路径重建活动分支）。
- 若背谱过程中用户从「重新开始」多次回到 0 手，退出仍恢复到最初进入时的节点。

## 5. 状态管理

### 5.1 AppState 扩展

`src/common/control/state.ts` 的 `AppState` 新增：

```ts
RECITATION = "recitation",
```

- `destroyModalDialog()` / `closeModalDialog()`：`RECITATION` **不在**关闭列表内（背谱对话框由专用 close 事件关闭，参照「次の一手」出题对话框，不通过 `AppState` 切换）。
- 主棋盘 `BoardPane` 的 `onMove`：`RECITATION` 状态下 `store.doMove` 因 `appState !== NORMAL` 直接 return，主棋盘不可操作（被对话框遮罩覆盖），无副作用。
- `isMovableByUser`：`RECITATION` 返回 `false`（主棋盘不需走子；对话框内棋盘用自身 `allow-move` 绑定，参照 `NextMoveQuizDialog` 的 `:allow-move="!quiz.done && !quiz.playedMove"`）。

### 5.2 RecitationState（核心类）

新建 `src/common/recitation/recitation.ts`（纯逻辑，无 Vue 依赖，便于测试），仿照 `NextMoveQuizState`（`src/renderer/store/nextmove.ts`）：

```ts
export type RecitationJudgement = "correct" | "wrong";

export type RecitationResult = {
  totalPly: number; // 完成手数
  mistakeCount: number; // 错误次数（含提示）
  elapsedMs: number; // 用时
};

export class RecitationState {
  // 构造：持有 Record 实例（共享 store 的同一棋谱对象）
  constructor(record: Record, options?: RecitationOptions);

  // getters
  get isActive(): boolean;
  get currentPly(): number; // 已正确背出的手数（record.current.ply）
  get totalPly(): number; // 背诵总手数（主线 Move 节点数）
  get remainingPly(): number;
  get mistakeCount(): number;
  get elapsedMs(): number;
  get isComplete(): boolean; // current.next 为空或为特殊手
  get expectedMove(): Move | undefined; // 当前正解（供"提示"使用）

  // 方法
  answer(move: Move): RecitationJudgement | undefined;
  //   - 已完成/非法手 → undefined（不处理）
  //   - 正确 → 内部 record.append(move)，返回 "correct"
  //   - 错误 → 不修改 record，mistakeCount++，返回 "wrong"
  hint(): void; // 显示正解（mistakeCount++，局面不变）
  restart(): void; // record.goto(0)，清空计数/计时
  finish(): RecitationResult; // 返回成绩（供总结对话框）
  dispose(): void; // 恢复进入前节点（gotoNode(savedNode)）
}
```

- `totalPly` 的计算：进入时遍历主线（从 `first.next` 沿 `next`/`activeBranch` 行走），统计 `Move` 节点数（不含特殊手）。主线长度也可在构造时一次性计算并缓存。
- 计时：进入时 `Date.now()`，`elapsedMs` 为当前时刻差值（暂停/恢复 v1 不实现）。

### 5.3 Store 集成（`src/renderer/store/index.ts`）

- 新增 `private recitationState?: RecitationState;`（非响应式单例，参照 `analysisManager` 等管理器的持有方式）。
- 方法：
  - `startRecitation(): void` — 校验 `appState === NORMAL`、`record.current.next` 存在；创建 `RecitationState(record)` 并执行初始化（保存当前节点、`resetAllBranchSelection()`、`goto(0)`）；`_appState = AppState.RECITATION`。
  - `stopRecitation(): void` — `recitationState.dispose()`（恢复节点）、置 `undefined`、`_appState = AppState.NORMAL`。
  - `get isRecitationActive(): boolean`。
- 菜单 `states`（`FileMenu.vue`）新增：
  ```ts
  recitation: store.appState === AppState.NORMAL && store.record.length > 0,
  ```

## 6. UI 设计

### 6.1 桌面版对话框 `RecitationDialog.vue`

仿照 `NextMoveQuizDialog.vue` + `next_move_quiz.ts` 的控制器模式：

```
┌────────────────────────────────────────────┐
│ 第 n 手 / 共 m 手   先手/后手   错误: k 次   用时 xx:xx │
│ ┌──────────────────────────────────────┐  │
│ │              棋盘（BoardView）         │  │
│ │  （自动翻转：当前手番在下方）            │  │
│ └──────────────────────────────────────┘  │
│  [退出]  [提示]  [重新开始]                 │
└────────────────────────────────────────────┘
```

- 头部：进度 `第 n 手 / 共 m 手`、当前手番（先手/后手）、错误次数、用时（每秒刷新）。
- 棋盘：`BoardView`，`position = record.position`，`last-move` 显示最后正确走出的手；`allow-move` 恒为 `true`（未完成时）。
- 自动翻转：当前手番为后手时自动 `flip`（参照 `next_move_quiz.ts` 的 `updateFlip`），可手动切换。
- 消息反馈（**消息窗口，弹出后自动关闭，无需点击确定**）：
  - 正解：弹出「正解」窗口，约 1 秒后自动关闭（最后一手时由成绩对话框代替）。
  - 错误：弹出「不正解 - 请重试」窗口，约 1.5 秒后自动关闭；**不自动显示正解**。
  - 提示：弹出「提示: 〇〇（正解手）」窗口，约 1.5 秒后自动关闭，同时正解手自动下出。
- 完成：弹出成绩总结（`RecitationResult`），确认后 `store.stopRecitation()`。
- 注册：`App.vue` 中 `v-if="recitation.visible"`（visible 由 Store 的 `isRecitationActive` 派生，或对话框组件直接 `v-if="store.appState === AppState.RECITATION"`）。

### 6.2 移动版对话框 `MobileRecitationDialog.vue`

- 全屏对话框，与桌面版共用控制器（`recitation_controller.ts`），显示内容与操作一致；棋盘随屏幕尺寸使用竖排/紧凑布局（参照 `MobileNextMoveQuizDialog.vue`）。

### 6.3 菜单入口

- `FileMenu.vue`：「次の一手問題集」按钮旁新增「背谱模式」按钮（图标可复用 `IconType.QUIZ` 或新增 `IconType.MEMORY`/`BOOK` 图标资源）。
- （可选）`RecordPane.vue` 顶部增加「背谱」快捷按钮，进入条件同上。

## 7. 设置项目（v1 精简）

v1 **不新增持久化设置**，以下能力以对话框内按钮/固定行为提供：

| 项目             | 行为                                   |
| ---------------- | -------------------------------------- |
| 提示（显示正解） | 对话框按钮，每次计 1 次错误            |
| 重新开始         | 对话框按钮，确认后从头开始             |
| 自动翻转棋盘     | 固定开启（当前手番在下方），可手动切换 |

将来如需设置化（见 §8），按 `common/settings/` 现有模式（default / normalize / validate）新增 `RecitationSettings`。

## 8. 文件构成与实现计划

### 新增文件

| 文件                                                  | 内容                                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `specs/recitation-mode.md`                            | 本文档                                                                                                  |
| `src/common/recitation/recitation.ts`                 | `RecitationState` 核心类（纯逻辑）                                                                      |
| `src/renderer/store/recitation.ts`                    | Vue 响应式封装（`createRecitationStore` / `useRecitationStore`，参照 `nextmove.ts` 的 quiz store 部分） |
| `src/renderer/view/dialog/RecitationDialog.vue`       | 桌面版对话框                                                                                            |
| `src/renderer/view/dialog/MobileRecitationDialog.vue` | 移动版对话框                                                                                            |
| `src/renderer/view/dialog/recitation_controller.ts`   | 桌面/移动共享控制器（参照 `next_move_quiz.ts`）                                                         |
| `src/tests/common/recitation/recitation.test.ts`      | 核心逻辑单元测试                                                                                        |

### 修改文件

| 文件                                            | 修改内容                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/common/control/state.ts`                   | `AppState` 新增 `RECITATION`                                                                     |
| `src/renderer/store/index.ts`                   | `startRecitation` / `stopRecitation` / `isRecitationActive`；`isMovableByUser` 处理 `RECITATION` |
| `src/renderer/view/App.vue`                     | 挂载 `RecitationDialog` / `MobileRecitationDialog`                                               |
| `src/renderer/view/menu/FileMenu.vue`           | 新增菜单按钮与 `states.recitation`                                                               |
| `src/renderer/assets/icons.ts`（及图标资源）    | （可选）新增背谱图标                                                                             |
| `src/common/i18n/locales/{ja,en,vi,zh_tw}.ts`   | 新增文案键（见下）                                                                               |
| `docs-templates/` + `docs/how-to-use`（生成物） | 使用说明补充背谱模式                                                                             |

### i18n 新增键（示例，4 语言）

```
recitationMode       背谱模式
startRecitation      开始背谱
stopRecitation       退出背谱
plyNofM              第 n 手 / 共 m 手
mistakeCount         错误次数
correct              正确
incorrect            错误
pleaseTryAgain       请重试
showHint             提示
restart              重新开始
recitationCompleted  背谱完成
recitationResult     总手数 / 用时 / 错误次数
```

### 实施步骤（里程碑）

1. **M1 核心逻辑**：`RecitationState` + 单元测试（可先行完成，逻辑与 UI 解耦）。
2. **M2 状态接入**：`AppState.RECITATION` + Store 集成 + `isMovableByUser`/菜单状态。
3. **M3 桌面 UI**：`RecitationDialog.vue` + 控制器 + `App.vue` 挂载 + `FileMenu` 入口 + i18n（ja/en 先行，vi/zh_tw 补全）。
4. **M4 移动端**：`MobileRecitationDialog.vue`。
5. **M5 收尾**：lint / `vue-tsc` / vitest 全量通过、文档更新、手动验收（Electron + Web + 移动 Web）。

## 9. 测试计划

单元测试（vitest，`src/tests/common/recitation/`）：

| 用例                             | 期望                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------- |
| 从平手开局棋谱开始背谱，正确走子 | 返回 `correct`，`currentPly` 递增，棋谱不新增节点                            |
| 错误走子（合法但非正解）         | 返回 `wrong`，`mistakeCount` +1，`currentPly` 不变，棋谱结构不变（无新分支） |
| 连续错误后下出正解               | 错误多次后正确手仍能推进                                                     |
| 最后一手正确后                   | `isComplete === true`，`finish()` 返回正确统计                               |
| 以投了结束的棋谱                 | 所有 Move 走完后 `isComplete === true`，不要求走出特殊手                     |
| 含分支的棋谱                     | 只按主线判定；错误手不创建分支                                               |
| 非平手初始局面（SFEN 駒落ち）    | 从棋谱初始局面开始                                                           |
| `hint()`                         | 计入错误次数，局面不变，后续走子仍按原逻辑判定                               |
| `restart()`                      | 回到 0 手，计数清零                                                          |
| `dispose()`                      | 恢复进入前的节点与分支选择                                                   |
| 空棋谱 / 无下一手                | `start` 阶段被拒绝（Store 层校验）                                           |

集成/手工验收：

- Electron 版与 Web 版：打开 KIF → 背谱 → 正确/错误/提示/重开/退出全流程。
- 移动 Web：全屏对话框布局与翻转。
- 背谱中菜单、棋谱面板、快捷键（前进/后退等）均不可操作。
- 退出后原棋谱查看位置恢复、无脏数据（导出的 KIF 与进入前一致）。

## 10. 实现备忘

- **错误手绝不要调用 `record.append`**：`append` 对不存在的手会创建分支节点，污染棋谱（违背"错误回退"语义）。正解手才 `append`，且因节点已存在而只做游标移动。
- 正确手的判定用 USI 字符串比较（`move.usi`）即可，无需引入棋盘状态求值。
- 背谱期间不要触发 `saveRecordForWebApp` 等持久化副作用？——`record.append` 会触发 `changePosition` 事件（Store 中已绑定 `saveRecordForWebApp`）。因正确手仅移动游标、不改变结构，Web 版本地保存的棋谱内容不变，无副作用；但实现时仍应确认。
- 计时显示每秒刷新一次即可（`setInterval`，组件卸载时清理）。
- 与「次の一手」出题的差异：背谱**不显示候选手/评分/棋谱内容**，判定只与本谱比较。

## 11. 将来扩展（v1 范围外）

- 成绩持久化与按棋谱的背诵历史（间隔重复复习，类似 ANKIF / Shogi Log 的进度跟踪）。
- 背诵范围设置（只背某手数区间，如定迹片段）、指定先手/后手只看一方。
- 错误后自动显示正解的教学模式（可选开关）。
- 棋盘手数标注（走完的手显示手数数字）增强记忆效果。
- 与「次の一手」问题集联动（从问题集跳转至对应棋谱的背谱）。
