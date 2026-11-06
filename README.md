# 人类账单支付

自然界联合起来，向人类城市催收生态欠款的放置增量游戏。

从一只蚂蚁开始，一路招募海洋生物、城市野兽，最后请出恐龙，把城市拆到结清账单。主数值是人类被破坏的金额，排行榜比的也是它。

- 四个时代：虫潮 → 海啸 → 兽群 → 远古，共 20 种生物
- 虫潮有繁殖（导数式增长），海啸有潮汐和大潮（节奏型主动操作）
- 一层转生"进化"，基因永久加成，有自动化天赋
- 首次通关 12 到 20 小时，结局后进入无尽模式
- 没有离线收益：页面开着就算在线，后台标签页回来会补算，关掉页面不累计
- 排行榜：总榜（累计破坏额）和速通榜（到达远古的用时）

## 本地运行

需要 Node 22.12 或更高版本。

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 逻辑核心 + 排行榜 SQL 测试
npm run build        # 类型检查 + 打包到 dist/
```

没有配置 Supabase 也能玩，排行榜会显示离线。

## 架构

按增量游戏通用分层组织，逻辑核心不依赖引擎和平台：

| 层 | 目录 | 内容 |
|---|---|---|
| 外壳 | `src/shell/` | 启动、20 Hz 固定步长循环、自动存档。以后加 Steam（Electron/Tauri）和手机（Capacitor）外壳，只换这一层 |
| 表现层 | `src/scene/`、`src/ui/`、`src/styles/` | three.js 城市场景和 Preact 界面。只读状态、发指令 |
| 逻辑核心 | `src/core/` | Tick、经济公式、进度规则、转生。纯 TypeScript，可以在 Node 里直接跑 |
| 数据 | `src/core/config/`、`src/data/`、`supabase/` | 配置表、大数（break_infinity.js）、本地存档与迁移、排行榜 |

几个约定：

- 所有数值在 `src/core/config/`，调数值不用改公式。
- 所有界面文案在 `src/ui/copy.ts`，方便统一审稿和以后翻译。
- 所有颜色来自 [Radix Colors](https://www.radix-ui.com/colors)（只用浅色主题），语义变量在 `src/styles/tokens.css`，场景颜色在 `src/scene/palette.ts`。
- 嵌套圆角按"外圆角 − 内边距 = 内圆角"计算，变量也在 `tokens.css`。

## 数值

`npm run report` 会让三种机器人玩家用真实的逻辑核心从零玩到结局，生成 [docs/balance.md](docs/balance.md) 和曲线图。改完数值重跑一次，确认节奏还在目标区间。

## 排行榜（Supabase）

1. 在 Supabase 新建项目，或者用已有项目。
2. **Authentication → Sign In / Providers**，打开 **Allow anonymous sign-ins**。玩家不用注册，每个浏览器自动获得一个匿名身份。
3. 建表和函数，二选一：
   - 用 CLI：`supabase link --project-ref <项目 ref>`，然后 `supabase db push`
   - 或者把 `supabase/migrations/20261106000000_leaderboard.sql` 粘到 SQL Editor 执行
4. 在 **Project Settings → API** 复制 Project URL 和 anon key（或 publishable key），填到下面 Render 的环境变量里。本地开发时填到 `.env.local`，格式参考 `.env.example`。

表本身不对客户端开放，只能通过几个 `security definer` 函数读写。服务端会做轻量校验：可信的游戏时长不能比真实时间涨得快，累计破坏额要落在按时长计算的合理曲线以内，到达远古至少要 30 分钟，每人每 15 秒最多更新一次。存档在本地，所以这些校验只能拦住明显改过数值的情况，防不住所有作弊。

## 部署（Render）

1. Render → **New → Blueprint**，选这个仓库，会读取 `render.yaml` 建一个静态站点。
2. 填 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。
3. 部署。Vite 在构建时写入这两个变量，修改后要重新部署才会生效。

模型文件通过 Render 的 CDN 分发，带缓存头。

## 素材

3D 模型来自 [Polyfork](https://polyfork.dev)，按 CC BY 4.0 授权使用，完整署名见 [CREDITS.md](CREDITS.md)，游戏内的"设置 → 制作人员"也能看到。

`npm run assets` 会按 `scripts/assets.manifest.json` 下载模型，用 meshopt 压缩（59 MB 压到约 4.4 MB），并重新生成署名文件。生物图标由 three.js 在运行时从模型渲染。音效用 Web Audio 合成，没有音频文件。

## 后续

- 第二版：兽群和远古的专属机制（兽群分派、暴走）、成就
- Steam：用 Electron 或 Tauri 套壳，接 Steamworks 成就和云存档
- 手机：用 Capacitor 套壳，界面已经适配竖屏
