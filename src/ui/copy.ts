import type { BuildProblem, LevelId, Phase } from '../core/index.ts';

/** Every word the UI prints, in one place for review and translation. */
export const COPY = {
  title: '人类账单支付',
  essence: '生机',
  perSecond: '/秒',
  eras: ['冰河时代', '古代', '工业时代', '现代'],

  top: {
    stage: (n: number) => `第 ${n} 关`,
    camp: (n: number) => (n <= 1 ? '部落营地' : n <= 2 ? '村落' : n <= 3 ? '城镇' : n <= 5 ? '城市' : '大都会'),
    lodge: '人类主城',
    tools: (lv: number) => `人类工具 Lv${lv}`,
    nextTools: (s: number) => `${s} 秒后改良`,
    people: (n: number) => `${n} 人`,
    menu: '菜单',
    recenter: '回到母树',
    land: '领地',
    landSplit: (n: number, h: number) => `自然 ${n}% · 人类 ${h}%`,
  },

  flags: {
    title: '集结旗',
    count: (n: number, max: number) => `${n}/${max}`,
    hint: '右键地图插旗：兵往最近的旗子打，在旗子周围抢地。没有旗子时兵自己探索、往人类主城推进。',
    place: '插旗',
    placing: '左键点一块看得见的空地插旗（Esc 取消）',
    clear: '拔掉全部',
    placed: '集结旗插好了',
    removed: '拔掉了一面旗',
    bad: '旗子只能插在看得见、能走的地方',
  },

  minimap: { label: '小地图：点击移动镜头' },

  keys: '镜头：WASD／方向键／鼠标推屏边／拖拽，滚轮缩放 · 右键插旗 · 数字键选建筑 · 空格回到母树 · Esc 取消',

  chain: {
    title: '食物链',
    predators: '食肉',
    herbivores: '食草',
    plants: '植物',
    eats: (a: string, b: string) => `吃 ${a} / 产 ${b}`,
    meat: '肉',
    grass: '草',
    meadows: (n: number) => `草场 ×${n}`,
    hungry: '在挨饿',
    full: '满了',
    help: '食草动物吃草，活着就产肉；食肉动物吃肉。吃的不能超过产的：满了窝就先不出兵。想多养狼，先多养鹿。',
  },

  tabs: { build: '建造', evolve: '进化' },

  build: {
    pickPad: '先选一种建筑，再点自己领地上的空地；或者先点空地再选建筑',
    onCell: '盖在选中的那块地上',
    auto: '自动选位',
    cancel: '取消',
    placing: (name: string) => `点一块发光的空地来盖${name}（右键或 Esc 取消）`,
    noPad: '没有能盖的空地了：先多占一些地',
    makes: (unit: string) => `出${unit}`,
    every: (s: number) => `每 ${s} 秒`,
    eats: (food: string, n: string) => `吃${food} ${n}/秒`,
    feeds: (n: string) => `产肉 ${n}/秒`,
    grass: (n: string) => `产草 ${n}/秒`,
    groups: { chain: '食物链', herbivores: '食草动物', predators: '食肉动物', defense: '防御' },
    problem: {
      phase: '现在不能盖',
      cell: '这里不能盖（水、火山或还没开放）',
      taken: '离别的建筑或资源点太近：建筑之间要隔一格',
      ground: '这块地不归你：先把它占下来',
      money: '生机不够',
      kind: '不能盖这个',
    } satisfies Record<BuildProblem, string>,
  },

  evolve: {
    hint: '升级在物种上：所有同种的兵一起变强，建筑被拆了也不掉。',
    level: (n: number) => `Lv${n}`,
    up: '升级',
    names: {
      mothertree: '母树',
      meadow: '草场',
      ancient: '古树',
      ant: '蚂蚁',
      elk: '大角鹿',
      mammoth: '猛犸',
      wolf: '狼',
      sabertooth: '剑齿虎',
      bear: '洞熊',
    } satisfies Record<LevelId, string>,
    effect: {
      mothertree: (inc: string, hp: string) => `生机 +${inc}/秒 · 血量 ${hp}`,
      meadow: (g: string) => `每座草场产草 ${g}/秒`,
      ancient: (d: string) => `松果伤害 ${d}`,
      unit: (hp: string, atk: string) => `血量 ${hp} · 攻击 ${atk}`,
    },
  },

  building: {
    hp: '血量',
    building: '建造中',
    demolish: '拆除（退一半）',
    march: (flags: number) => (flags ? '出兵：去最近的集结旗' : '出兵：自己探索，往人类主城推进'),
    blocked: { grass: '缺草：多盖草场或升级草场', meat: '缺肉：多养食草动物', food: '缺食物' },
    humanSide: '人类的建筑',
    main: '主基地：被拆就输了',
    lodgeMain: '人类主城：拆掉就赢了这一关，地图向外开一圈',
  },

  unit: { hp: '血量', atk: '攻击', speed: '速度', eats: '吃' },

  pick: {
    title: (n: number) => `第 ${n} 关胜利！`,
    sub: '选一张强化，这一轮一直有效',
    reroll: (n: number) => `换一批（${n}）`,
    groups: { species: '物种', chain: '食物链', all: '全局' },
  },

  over: {
    fell: '母树倒下了',
    returned: '回归大地',
    reached: (n: number) => `打到第 ${n} 关`,
    cleared: (n: number) => `通关 ${n} 关`,
    genes: (n: number) => `基因 +${n}`,
    bank: (n: number) => `可用基因 ${n}`,
    talents: '天赋（永久）',
    again: '开始新一轮',
    max: '满级',
    stats: (k: number, l: number, r: number) => `击杀 ${k} · 战损 ${l} · 拆房 ${r}`,
  },

  menu: {
    help: '怎么玩',
    settings: '设置',
    leaderboard: '排行榜',
    giveUp: '回归大地',
    giveUpConfirm: (g: number) => `结束这一轮，带走 ${g} 基因？物种等级、建筑和强化都会清空。`,
    yes: '确定',
    no: '再想想',
  },

  help: {
    title: '怎么玩',
    lines: [
      '你是自然。人类占着地图中间的一大片，你只有母树和几块零散的小飞地。拆掉地图正中的人类主城就赢下这一关。',
      '地图盖着战争迷雾：没去过的地方是黑的。兵和建筑走到哪、看到哪，你自己的领地也一直看得见。',
      '在自己领地的空地上盖窝（建筑之间隔一格）。窝会自己出兵，兵自己探索、抢地、往人类主城推进；右键插集结旗，兵就往旗子那边打。',
      '每块地有控制值：兵站在上面就往自己这边推，越过一半换主人。有建筑的地要先把建筑拆掉才能翻。湖、海和火山谁也占不了。',
      '每过一关进入下一个时代，地图向外开一圈，人类的地面也跟着变样：平整土地 → 稻田和石板路 → 砖地和瓷砖 → 柏油路、草坪和花坛。',
      '食物链：草场产草，食草动物（蚂蚁、鹿、猛犸）吃草、产肉，食肉动物（狼、剑齿虎、熊）吃肉。养不起就不出兵。',
      '克制：火把手克蚂蚁，长矛手克猛兽，投矛手克大型动物。人类会看你出什么，盖克制它的营地，所以要搭配。',
      '每关打赢三选一。母树倒下这一轮就结束，带着基因买永久天赋，再来一轮。',
    ],
    ok: '开始',
  },

  settings: {
    title: '设置',
    sound: '音效',
    on: '开',
    off: '关',
    save: '存档',
    export: '导出',
    import: '导入',
    reset: '清空存档',
    resetConfirm: '清空所有进度（包括天赋）？',
    imported: '导入成功',
    importFailed: '存档无法读取',
    exportHint: '复制下面这串文字保存起来：',
    importHint: '把存档文字粘贴到这里：',
    credits: '制作人员',
    creditsBody: '像素画用 pixel-art-studio（MIT）在代码里逐像素绘制；调色板 Resurrect 64（Kerrie Lake）；字体 缝合像素字体（SIL OFL 1.1）。',
    close: '关闭',
  },

  board: {
    title: '排行榜',
    best: '最高通关',
    me: '我',
    offline: '排行榜离线',
    empty: '还没有人上榜',
    nickname: '昵称',
    save: '保存',
    stage: (n: number) => `第 ${n} 关`,
  },

  toast: {
    stage: (n: number, era: string, opened: boolean) => ({ title: `第 ${n} 关 · ${era}`, body: opened ? '地图向外开放了一圈' : '拆掉人类主城就能过关' }),
    research: (lv: number) => ({ title: `人类改良了工具（Lv${lv}）`, body: '拖得越久，人类越强' }),
    starving: (what: string) => ({ title: `${what}在挨饿`, body: '' }),
    lost: (name: string) => ({ title: `${name}被拆了`, body: '地还在，可以再盖' }),
    won: (n: number) => ({ title: `第 ${n} 关胜利！`, body: '' }),
    built: (name: string) => `${name}盖好了`,
  },

  phase: { battle: '战斗中', pick: '三选一', over: '一轮结束' } satisfies Record<Phase, string>,
} as const;

export const FOOD_NAME = { grass: '草', meat: '肉', food: '食物' } as const;
