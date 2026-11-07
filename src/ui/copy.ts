/**
 * Every player-facing string lives here: one place to review tone, one place to translate later.
 * Tone: dry, deadpan, short. Nature is a debt collector; humans keep finding loopholes.
 */
import type { ActiveId, EraId } from '../core/index.ts';

export const COPY = {
  title: '人类账单支付',
  perSecond: '/秒',

  tabs: { creatures: '生物', skills: '技能', meta: '天赋' },
  buyAmounts: { 1: '×1', 10: '×10', 100: '×100', max: '最大' } as Record<string, string>,

  run: {
    bill: '账单',
    research: '人类研究',
    taming: '驯化',
  },

  creatures: {
    defected: (to: string) => `已跳反成${to}`,
    stamp: '跳反',
    owned: '数量',
    output: '每秒',
    milestone: '下一档',
  },

  skills: {
    boosts: '强化',
    or: '或',
    forkLocked: '需天赋',
    empty: '暂时没货。人类也在想办法。',
    need: {
      era: (era: string) => `到${era}`,
      owned: (name: string, n: number) => `${n} 只${name}`,
      skill: (name: string) => `先学${name}`,
      fork: '先选分叉',
      earned: '再多拆点',
    },
  },

  actives: {
    surge: '大潮',
    rescue: '解救',
    rampage: '暴走',
    sabotage: '捣毁实验室',
  } satisfies Record<ActiveId, string>,

  breeding: { name: '繁殖巢', bred: '繁殖' },

  tide: { name: '潮汐' },

  meta: {
    points: '基因点',
    routes: '开局路线',
    forks: '分支',
    perks: '天性',
    level: (n: number, max: number) => `${n}/${max}`,
  },

  setup: {
    title: '新的一局',
    route: '路线',
    difficulty: '难度',
    start: '开局',
    locked: '未解锁',
    balanced: '均衡',
    needWin: (d: string) => `先赢下${d}`,
    abandon: '这局不打了？进度会作废。',
    abandonYes: '重新开局',
  },

  result: {
    won: '账单已结清',
    lost: '《生态修复法案》通过',
    wonBody: '人类付清了欠大自然的账。城市长回了森林，鸽子拿到了雕像的产权。',
    lostBody: '人类宣布环境问题已经解决，并为此开了一场庆功宴。下次早点动手。',
    time: '用时',
    earned: '本局催收',
    points: '基因点',
    again: '再来一局',
  },

  leaderboard: {
    title: '催收排行榜',
    lifetime: '累计',
    best: '单局',
    fastest: '速通',
    nickname: '昵称',
    save: '保存',
    offline: '排行榜暂时联系不上。成绩先记在小本本上。',
    empty: '还没有人上榜。第一名虚位以待。',
    loading: '正在点名…',
  },

  settings: {
    title: '设置',
    sound: '音效',
    quality: '画质',
    qualityHigh: '高',
    qualityLow: '省电',
    on: '开',
    off: '关',
    save: '存档',
    export: '导出',
    import: '导入',
    importPlaceholder: '把存档码粘贴到这里',
    importConfirm: '载入',
    newRun: '重新开局',
    reset: '清空存档',
    resetConfirm: '真的要让人类逃过这一劫？',
    resetYes: '清空',
    cancel: '算了',
    credits: '制作人员',
    creditsModels: '3D 模型',
    creditsModelsNote: '已压缩；部分模型重新上色并加了牙、角等部件',
    creditsOther: '字体、配色与代码库',
  },

  toast: {
    era: {
      2: { title: '古代', body: '人类学会了筑城。也学会了养猫。' },
      3: { title: '工业时代', body: '蒸汽机响了，杀虫剂也快了' },
      4: { title: '现代', body: '人类开始用无人机找你' },
    } as Record<number, { title: string; body: string }>,
    countermeasure: (name: string, cls: string) => ({ title: name, body: `人类针对你的${cls}出手了` }),
    defected: (from: string, to: string) => ({ title: `${from}跳反了`, body: `它们现在是人类的${to}` }),
    taming: (name: string) => `${name}快被驯化了`,
    exported: '存档码已复制',
    importFailed: '这串存档码看不懂',
    nicknameSaved: '昵称已更新',
  },

  effects: {
    creatureMult: (name: string, x: number) => `${name} ×${x}`,
    classMult: (cls: string, x: number) => `${cls} ×${x}`,
    globalMult: (x: number) => `全体 ×${x}`,
    classResist: (cls: string, pct: number) => `${cls}抗性 ${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`,
    clickMult: (x: number) => `点击 ×${x}`,
    clickPct: (pct: number) => `点击 +${pct}% 秒伤`,
    researchMult: (pct: number) => `人类研究 ${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`,
    domesticationMult: (pct: number) => `驯化 −${pct}%`,
    unlockBreeding: '解锁繁殖',
    breedMult: (x: number) => `繁殖 ×${x}`,
    unlockTide: '解锁潮汐',
    tideAmp: (pct: number) => `潮汐振幅 +${pct}%`,
    surgeDuration: (s: number) => `大潮 +${s} 秒`,
    surgeCooldownMult: (pct: number) => `大潮冷却 −${pct}%`,
    unlockActive: (name: string) => `主动技能：${name}`,
    convert: (from: string, to: string) => `${from}全部变成${to}`,
    lairRegrowMult: (x: number) => `老窝重建 ×${x} 速`,
    lairLossMult: (pct: number) => `老窝被端损失 −${pct}%`,
    startMoney: (money: string) => `开局 ${money}`,
    unlockFork: '解锁分支 B',
    unlockRoute: (name: string) => `解锁路线：${name}`,
  },
} as const;

export function eraName(era: EraId): string {
  return ({ 1: '冰河', 2: '古代', 3: '工业', 4: '现代' } as const)[era];
}

/** Headlines that now and then pop up over the city, from the eras reached this run. */
export const NEWS: Record<EraId, string[]> = {
  1: [
    '部落长老：蚂蚁搬走了半个山洞',
    '猛犸象拒绝参加部落的烧烤活动',
    '剑齿虎在洞口排队，原因不明',
    '猎人发明了长矛，猛犸象发明了跑',
    '萨满预言：狼会成为人类最好的朋友。狼表示没听说',
    '篝火晚会因洞熊到场提前结束',
  ],
  2: [
    '城邦颁布法令：禁止蝗虫入城。蝗虫不识字',
    '粮仓管理员申请调岗',
    '护城河里的鳄鱼要求加薪',
    '野猪把城外的农田翻了一遍，农夫表示感谢但不想要',
    '老鼠在城里开了分店',
    '学者认为，猫才是这座城真正的主人',
  ],
  3: [
    '工厂主：蚊子不算工伤',
    '鸽子占领了钟楼，拒绝报时',
    '港口集团：集装箱被章鱼打开属于正常损耗',
    '铁路因野牛过境延误三小时',
    '冲浪比赛冠军由鲨鱼评委内定',
    '杀虫剂公司股价大涨，蚊子毫不在意',
  ],
  4: [
    '物业：白蚁正在评估本楼承重墙',
    '乌鸦学会了垃圾分类，比市民分得还对',
    '老虎入驻 CBD，任首席恐吓官',
    '犀牛清理违停车辆，效率创历史新高',
    '大象参观瓷器展，主办方连夜改为线上展',
    '科学家：再给我们一个季度',
  ],
};
