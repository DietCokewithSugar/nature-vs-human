# 人类账单支付

自然界联合起来，向人类城市催收生态欠款。增量养成 + Plague Inc. 式对抗。

一局 40 到 90 分钟，从冰河时代推进到现代：
- 你用破坏金额招募生物、学技能，目标是付清"人类账单"。
- 人类在研究反制手段：研究每过一道坎，就会针对你最强的兵种出手；研究满了你就输。
- 猎人会驯化你的狼、野猫、野猪。被抓走的物种会整批跳反，变成人类的狗、家猫、家猪，反过来对付你。
- 每局结算局外点数，用来解锁新开局路线、技能树的分叉 B 和永久天性。难度分普通、困难、残酷。

规则详见 [docs/design.md](docs/design.md)，数值验证见 [docs/balance.md](docs/balance.md)。没有离线收益：页面开着就算在线，关掉不累计。

## 本地运行

需要 Node 22.12 或更高版本。

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 逻辑核心 + 排行榜 SQL 测试
npm run report       # 让机器人打完整局，重新生成 docs/balance.md
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

`npm run report` 让三种机器人玩家在三个难度下用真实的逻辑核心打完整局，生成 [docs/balance.md](docs/balance.md) 和曲线图。改完数值重跑一次，确认单局时长和胜负还在目标区间。

## 排行榜（Supabase）

1. 在 Supabase 新建项目，或者用已有项目。
2. **Authentication → Sign In / Providers**，打开 **Allow anonymous sign-ins**。玩家不用注册，每个浏览器自动获得一个匿名身份。
3. 建表和函数，二选一：
   - 用 CLI：`supabase link --project-ref <项目 ref>`，然后 `supabase db push`
   - 或者把 `supabase/migrations/20261106000000_leaderboard.sql` 粘到 SQL Editor 执行
4. 在 **Project Settings → API** 复制 Project URL 和 anon key（或 publishable key），填到下面 Render 的环境变量里。本地开发时填到 `.env.local`，格式参考 `.env.example`。

排行榜有三个：累计破坏、单局最高、各难度最快胜利。表本身不对客户端开放，只能通过几个 `security definer` 函数读写。服务端会做轻量校验：可信的游戏时长不能比真实时间涨得快，破坏额要落在按时长计算的合理曲线以内，胜利至少要 20 分钟，每人每 15 秒最多更新一次。存档在本地，所以这些校验只能拦住明显改过数值的情况，防不住所有作弊。

## 部署（Render）

1. Render → **New → Blueprint**，选这个仓库，会读取 `render.yaml` 建一个静态站点。
2. 填 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。
3. 部署。Vite 在构建时写入这两个变量，修改后要重新部署才会生效。

模型文件通过 Render 的 CDN 分发，带缓存头。

## 素材

3D 模型来自 [Polyfork](https://polyfork.dev)，按 CC BY 4.0 授权使用，完整署名见 [CREDITS.md](CREDITS.md)，游戏内的"设置 → 制作人员"也能看到。

免费素材里没有猛犸、剑齿虎、犀牛、老虎、野猪、蚊子这些，所以在 Polyfork 的动画模型上做了改装（`src/scene/kitbash.ts`）：用 Radix 配色重新上色，再把程序生成的象牙、獠牙、角、口器挂到头部骨骼上，跟着动画动。人物模型没有自带动画，走路动作由 `src/scene/humanRig.ts` 驱动。冰河时代的帐篷由代码生成。

- `npm run assets`：按 `scripts/assets.manifest.json` 下载模型并用 meshopt 压缩（约 4.4 MB），同时重新生成署名文件。
- 开发服务器上打开 `/lab.html`：模型陈列页，逐个检查改装效果（不会打进生产包）。
- 生物图标由 three.js 在运行时从模型渲染；音效用 Web Audio 合成，没有音频文件。

## 后续

- 下一步：更多开局路线和分叉、兽群分派（把单位派到不同城区）、成就
- Steam：用 Electron 或 Tauri 套壳，接 Steamworks 成就和云存档
- 手机：用 Capacitor 套壳，界面已经适配竖屏
