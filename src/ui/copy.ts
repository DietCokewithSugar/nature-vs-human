/**
 * Every player-facing string lives here: one place to review tone, one place to translate later.
 * Tone: dry, deadpan, short. The joke is that nature is a debt collector and humans owe a lot.
 */
import type { EraId } from '../core/index.ts';

export const COPY = {
  title: '人类账单支付',
  perSecond: '/秒',

  tabs: { creatures: '生物', upgrades: '升级', evolve: '进化' },
  buyAmounts: { 1: '×1', 10: '×10', 100: '×100', max: '最大' } as Record<string, string>,

  creatures: {
    nextEra: '下一站',
    finalBill: '最后一张账单',
  },

  upgrades: {
    empty: '暂时没货。人类也在想办法。',
  },

  breeding: {
    name: '蚁后',
    crown: '加冕',
    bred: '繁殖',
  },

  tide: {
    name: '潮汐',
    surge: '大潮',
    surging: '大潮中',
    rising: '涨潮',
    falling: '退潮',
    auto: '自动',
  },

  evolve: {
    genes: '基因',
    bonus: '产出',
    action: '进化',
    confirm: '再点一次确认',
    needMore: '还差',
    shop: '天赋',
    maxed: '满级',
    level: (n: number, max: number) => `${n}/${max}`,
  },

  leaderboard: {
    title: '催收排行榜',
    lifetime: '总榜',
    speedrun: '速通榜',
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
    reset: '清空存档',
    resetConfirm: '真的要让人类逃过这一劫？',
    resetYes: '清空',
    cancel: '算了',
    credits: '制作人员',
    creditsModels: '3D 模型',
    creditsOther: '字体、配色与代码库',
  },

  toast: {
    era: {
      2: { title: '海啸时代', body: '金沙湾港的游客请注意' },
      3: { title: '兽群时代', body: '动物园的门是从里面打开的' },
      4: { title: '远古时代', body: '琥珀解冻，CBD 迎来新租户' },
    } as Record<number, { title: string; body: string }>,
    evolved: (n: string) => `进化完成 · +${n} 基因`,
    exported: '存档码已复制',
    importFailed: '这串存档码看不懂',
    nicknameSaved: '昵称已更新',
    rebuilt: '人类连夜重建了城市。催收继续。',
  },

  ending: {
    title: '账单已结清',
    body: '人类终于付清了欠大自然的账。城市长回了森林，鸽子拿到了雕像的产权。',
    time: '用时',
    lifetime: '累计催收',
    evolutions: '进化次数',
    continue: '继续催收',
  },

  effects: {
    creatureMult: (name: string, x: number) => `${name} ×${x}`,
    eraMult: (era: string, x: number) => `${era}全体 ×${x}`,
    globalMult: (x: number) => `全体 ×${x}`,
    clickMult: (x: number) => `点击 ×${x}`,
    clickPct: (pct: number) => `点击 +${pct}% 秒伤`,
    unlockBreeding: '解锁繁殖',
    breedMult: (x: number) => `繁殖 ×${x}`,
    unlockTide: '解锁潮汐',
    tideAmp: (pct: number) => `潮汐振幅 +${pct}%`,
    surgeDuration: (s: number) => `大潮 +${s} 秒`,
    surgeCooldownMult: (pct: number) => `大潮冷却 −${pct}%`,
    startMoney: (money: string) => `开局 ${money}`,
    autobuy: (era: string) => `自动招募${era}`,
    startQueens: (n: number) => `开局 ${n} 只蚁后`,
    autoSurge: '自动大潮',
    ticketDiscount: (pct: number) => `门票 −${pct}%`,
    genePower: (pct: number) => `每个基因 +${pct}%`,
    startEra: (era: string) => `开局直达${era}`,
  },
} as const;

export function eraName(era: EraId): string {
  return ({ 1: '虫潮', 2: '海啸', 3: '兽群', 4: '远古' } as const)[era];
}

/** News ticker. Shown one at a time, picked from the eras the player has reached. */
export const NEWS: Record<EraId, string[]> = {
  1: [
    '本市蚂蚁宣布成立工会，要求每天工作二十四小时',
    '物业回应草坪消失：正在研究，请勿催促',
    '专家建议野餐时携带两份三明治，一份上交胡蜂',
    '螳螂在十字路口举臂示意，车辆一律礼让',
    '居民反映家具"越用越轻"，锹甲拒绝回应',
    '蚱蜢团购了整片草坪，评价：口感一般',
    '小区业主群：谁家的蚂蚁把物业费交了？',
  ],
  2: [
    '港口集团：集装箱被章鱼打开属于正常损耗',
    '海滩正式更名为"水母自助区"',
    '螃蟹横穿码头，交警表示：它一直是这么走的',
    '网速变慢，海鳗承认光缆"有点嚼劲"',
    '冲浪比赛冠军由鲨鱼评委内定',
    '天文台：今天的月亮好像收了钱',
  ],
  3: [
    '全市鸽子拒绝承认雕像属于公共财产',
    '熊在便利店办理会员卡，享受九五折',
    '大象参观瓷器展，主办方连夜改为线上展',
    '狐狸当选年度垃圾分类标兵',
    '老鼠评测本市电线：铜芯的更香',
    '市政：下水道堵车属于新现象',
  ],
  4: [
    '迅猛龙学会使用旋转门，物业表示很欣慰',
    '霸王龙入职 CBD，任首席灭绝官',
    '保险公司修订条款："恐龙"不属于不可抗力',
    '腕龙在三十层窗外观看董事会，全程无表情',
    '翼龙申请航线编号，空管：先排队',
    '三角龙清理违停车辆，效率创历史新高',
  ],
};

export const NEWS_EVOLVED = [
  '生物学家：这次进化有点快',
  '人类发现昨天的教科书已经过时',
  '自然界召开年会，主题是"再来一轮"',
];
