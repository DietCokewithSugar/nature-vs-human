# 手绘 / 外部素材覆盖

把 PNG 放进 `art/sprites/<精灵 key>/<动画><序号>.png`，再跑 `npm run sprites`，它就会替换掉烘焙出来的那一份。

- key 和图集里的一致：`unit/wolf`、`building/tent`、`decor/tree-oak`、`volcano/0`、`flag`
- 动画：`move0.png … move3.png`（走路，循环）、`rest0.png`（站着）。只有一张就叫 `move0.png`
- 朝右画；朝左时游戏会自动镜像
- 脚（或建筑的地基中心）放在图片底边正中
- 不用管配色和描边：烘焙时会自动吸附到 Resurrect 64 调色板；没有深色描边的会自动加 1 像素描边
- 尺寸照 docs/art-style.md 的尺寸档位（一格 16 像素）

完整规范见 [docs/art-style.md](../../docs/art-style.md)。
