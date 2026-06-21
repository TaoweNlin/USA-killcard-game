import { gameCardArt } from "./assets";
import type { CardBlueprint, CardId, GameCardDefinition, Rank, Suit } from "./types";

type OriginalCardName =
  | "杀"
  | "闪"
  | "桃"
  | "过河拆桥"
  | "顺手牵羊"
  | "无中生有"
  | "无懈可击"
  | "南蛮入侵"
  | "万箭齐发"
  | "决斗"
  | "借刀杀人"
  | "五谷丰登"
  | "桃园结义"
  | "乐不思蜀"
  | "闪电"
  | "诸葛连弩"
  | "雌雄双股剑"
  | "青釭剑"
  | "丈八蛇矛"
  | "青龙偃月刀"
  | "贯石斧"
  | "方天画戟"
  | "麒麟弓"
  | "寒冰剑"
  | "八卦阵"
  | "仁王盾"
  | "绝影"
  | "的卢"
  | "爪黄飞电"
  | "大宛"
  | "赤兔"
  | "紫骍";

const DEF_BY_ORIGINAL: Record<OriginalCardName, CardId> = {
  杀: "spray",
  闪: "wash",
  桃: "vote",
  过河拆桥: "expose",
  顺手牵羊: "poach",
  无中生有: "trendBoost",
  无懈可击: "factCheck",
  南蛮入侵: "pileOn",
  万箭齐发: "mockingLive",
  决斗: "debate",
  借刀杀人: "borrowAccount",
  五谷丰登: "fundraiser",
  桃园结义: "nationalUnity",
  乐不思蜀: "investigation",
  闪电: "blackSwan",
  诸葛连弩: "repeatMic",
  雌雄双股剑: "twoTrackMessage",
  青釭剑: "gotchaQuestion",
  丈八蛇矛: "draftScramble",
  青龙偃月刀: "followUpMic",
  贯石斧: "moneyPush",
  方天画戟: "tripleBroadcast",
  麒麟弓: "cutTour",
  寒冰剑: "coldTreatment",
  八卦阵: "prTeam",
  仁王盾: "safeState",
  绝影: "securityMotorcade",
  的卢: "securityMotorcade",
  爪黄飞电: "securityMotorcade",
  大宛: "campaignJet",
  赤兔: "campaignJet",
  紫骍: "campaignJet",
};

export const CARD_DEFS: Record<CardId, GameCardDefinition> = {
  spray: {
    id: "spray",
    originalName: "杀",
    name: "喷",
    category: "basic",
    shortText: "对方不【洗】就掉1点支持率。",
    detailText: "出牌阶段对攻击范围内一名其他角色使用。目标需打出【洗】，否则受到1点舆论伤害。",
    targetMode: "singleOther",
    art: gameCardArt("spray", "喷"),
  },
  wash: {
    id: "wash",
    originalName: "闪",
    name: "洗",
    category: "basic",
    shortText: "挡掉一次被【喷】。",
    detailText: "当你成为【喷】的目标时打出，抵消这次【喷】。",
    targetMode: "none",
    art: gameCardArt("wash", "洗"),
  },
  vote: {
    id: "vote",
    originalName: "桃",
    name: "票",
    category: "basic",
    shortText: "自己受伤时回1点支持率；濒死时可救人。",
    detailText: "出牌阶段只能对自己使用，使自己回复1点支持率；角色濒死时可打出，使其回复1点支持率。",
    targetMode: "self",
    art: gameCardArt("vote", "票"),
  },
  expose: {
    id: "expose",
    originalName: "过河拆桥",
    name: "撕毁条约",
    category: "trick",
    shortText: "单方面毁约，弃掉目标一张牌。",
    detailText: "弃置一名角色区域内的一张牌，像撕毁条约一样让对方资源作废。",
    targetMode: "single",
    art: gameCardArt("expose", "撕毁条约"),
  },
  poach: {
    id: "poach",
    originalName: "顺手牵羊",
    name: "强行收购",
    category: "trick",
    shortText: "距离1以内并走目标一张牌。",
    detailText: "获得距离1以内一名角色区域内的一张牌，资本外衣下直接吞并对方资源。",
    targetMode: "singleOther",
    art: gameCardArt("poach", "强行收购"),
  },
  trendBoost: {
    id: "trendBoost",
    originalName: "无中生有",
    name: "操纵股市",
    category: "trick",
    shortText: "凭空造势，摸2张牌。",
    detailText: "你摸两张牌，像后台拉高行情一样凭空做出资源。",
    targetMode: "self",
    art: gameCardArt("trendBoost", "操纵股市"),
  },
  factCheck: {
    id: "factCheck",
    originalName: "无懈可击",
    name: "政治正确",
    category: "trick",
    shortText: "举起护盾，抵消一次锦囊效果。",
    detailText: "在锦囊结算前打出，抵消或反抵消一次锦囊效果，像万能舆论护盾一样挡下政治操作。",
    targetMode: "none",
    art: gameCardArt("factCheck", "政治正确"),
  },
  pileOn: {
    id: "pileOn",
    originalName: "南蛮入侵",
    name: "提高关税",
    category: "trick",
    shortText: "全场承压，其他人需出【喷】。",
    detailText: "除你以外的所有角色依次需打出【喷】，否则受到1点伤害，像关税冲击一样让全场被迫反击。",
    targetMode: "allOthers",
    art: gameCardArt("pileOn", "提高关税"),
  },
  mockingLive: {
    id: "mockingLive",
    originalName: "万箭齐发",
    name: "公开丑闻",
    category: "trick",
    shortText: "丑闻炸开，其他人需出【洗】。",
    detailText: "除你以外的所有角色依次需打出【洗】，否则受到1点伤害，像丑闻曝光后全员紧急洗地。",
    targetMode: "allOthers",
    art: gameCardArt("mockingLive", "公开丑闻"),
  },
  debate: {
    id: "debate",
    originalName: "决斗",
    name: "电视辩论",
    category: "trick",
    shortText: "上台对喷，双方轮流出【喷】。",
    detailText: "你与目标轮流打出【喷】，先不出的一方受到1点伤害，把政策讨论打成喷火比赛。",
    targetMode: "singleOther",
    art: gameCardArt("debate", "电视辩论"),
  },
  borrowAccount: {
    id: "borrowAccount",
    originalName: "借刀杀人",
    name: "代理战争",
    category: "trick",
    shortText: "逼有武器的人去【喷】别人。",
    detailText: "令一名装备武器的角色对另一名角色使用【喷】，否则交出武器；自己不动手，让代理人背锅。",
    targetMode: "weaponHolder",
    art: gameCardArt("borrowAccount", "代理战争"),
  },
  fundraiser: {
    id: "fundraiser",
    originalName: "五谷丰登",
    name: "人道救援",
    category: "trick",
    shortText: "亮出物资，大家依次拿一张。",
    detailText: "亮出等同存活人数的牌，从你开始每名角色依次获得其中一张，救援物资也要按桌上秩序分配。",
    targetMode: "none",
    art: gameCardArt("fundraiser", "人道救援"),
  },
  nationalUnity: {
    id: "nationalUnity",
    originalName: "桃园结义",
    name: "美联储降息",
    category: "trick",
    shortText: "系统性放水，所有人回血。",
    detailText: "所有已受伤角色各回复1点支持率，像利率按钮一按，全场暂时续命。",
    targetMode: "none",
    art: gameCardArt("nationalUnity", "美联储降息"),
  },
  investigation: {
    id: "investigation",
    originalName: "乐不思蜀",
    name: "政府停摆",
    category: "delayed",
    shortText: "判定失败，跳过出牌阶段。",
    detailText: "放入一名其他角色判定区。判定不为红桃时，其跳过出牌阶段，像权力机器原地宕机。",
    targetMode: "singleOther",
    art: gameCardArt("investigation", "政府停摆"),
  },
  blackSwan: {
    id: "blackSwan",
    originalName: "闪电",
    name: "导弹危机",
    category: "delayed",
    shortText: "判定命中吃3点伤害，否则传给下家。",
    detailText: "放入你的判定区。判定为黑桃2-9时受到3点伤害，否则传给下家，像危机轮盘一样传导风险。",
    targetMode: "self",
    art: gameCardArt("blackSwan", "导弹危机"),
  },
  repeatMic: {
    id: "repeatMic",
    originalName: "诸葛连弩",
    name: "白宫发布厅",
    category: "weapon",
    shortText: "发布会不停开，【喷】没有次数限制。",
    detailText: "攻击范围1。出牌阶段你使用【喷】无次数限制，像白宫发布厅连续开麦一样反复输出。",
    targetMode: "self",
    equipment: { slot: "weapon", range: 1 },
    art: gameCardArt("repeatMic", "白宫发布厅"),
  },
  twoTrackMessage: {
    id: "twoTrackMessage",
    originalName: "雌雄双股剑",
    name: "游行旗帜",
    category: "weapon",
    shortText: "动员声量，逼目标弃牌或让你摸牌。",
    detailText: "攻击范围2。你用【喷】指定异性目标后，对方弃一张牌，否则你摸一张，像游行旗帜把现场声量压到对方面前。",
    targetMode: "self",
    equipment: { slot: "weapon", range: 2 },
    art: gameCardArt("twoTrackMessage", "游行旗帜"),
  },
  gotchaQuestion: {
    id: "gotchaQuestion",
    originalName: "青釭剑",
    name: "丑闻录音带",
    category: "weapon",
    shortText: "录音一放，目标防具失效。",
    detailText: "攻击范围2。你用【喷】时目标防具无效，丑闻录音带直接穿透公关防线。",
    targetMode: "self",
    equipment: { slot: "weapon", range: 2 },
    art: gameCardArt("gotchaQuestion", "丑闻录音带"),
  },
  draftScramble: {
    id: "draftScramble",
    originalName: "丈八蛇矛",
    name: "提词器救场",
    category: "weapon",
    shortText: "两张手牌可临时拼成【喷】。",
    detailText: "攻击范围3。你可将两张手牌当【喷】使用或打出，靠提词器把零散材料临场拼成一次发言。",
    targetMode: "self",
    equipment: { slot: "weapon", range: 3 },
    art: gameCardArt("draftScramble", "提词器救场"),
  },
  followUpMic: {
    id: "followUpMic",
    originalName: "青龙偃月刀",
    name: "国会听证会",
    category: "weapon",
    shortText: "对方洗了也能继续追问。",
    detailText: "攻击范围5。你的【喷】被【洗】抵消后，可继续对同一目标使用【喷】，像国会听证会一样追问到底。",
    targetMode: "self",
    equipment: { slot: "weapon", range: 5 },
    art: gameCardArt("followUpMic", "国会听证会"),
  },
  moneyPush: {
    id: "moneyPush",
    originalName: "贯石斧",
    name: "美军",
    category: "weapon",
    shortText: "弃2牌，硬实力强行命中。",
    detailText: "攻击范围3。【喷】被【洗】后，可弃两张牌令其仍造成伤害，像直接搬出硬实力压过去。",
    targetMode: "self",
    equipment: { slot: "weapon", range: 3 },
    art: gameCardArt("moneyPush", "美军"),
  },
  tripleBroadcast: {
    id: "tripleBroadcast",
    originalName: "方天画戟",
    name: "全频道插播",
    category: "weapon",
    shortText: "最后一张【喷】可打多目标。",
    detailText: "攻击范围4。若你使用的【喷】是最后一张手牌，可额外指定至多两个目标，像全频道插播一样同时轰到多个阵营。",
    targetMode: "self",
    equipment: { slot: "weapon", range: 4 },
    art: gameCardArt("tripleBroadcast", "全频道插播"),
  },
  cutTour: {
    id: "cutTour",
    originalName: "麒麟弓",
    name: "电子脚镣",
    category: "weapon",
    shortText: "命中后限制目标行动资源。",
    detailText: "攻击范围5。【喷】命中目标后，可弃置其装备区一张坐骑，像电子脚镣一样限制对方行动半径。",
    targetMode: "self",
    equipment: { slot: "weapon", range: 5 },
    art: gameCardArt("cutTour", "电子脚镣"),
  },
  coldTreatment: {
    id: "coldTreatment",
    originalName: "寒冰剑",
    name: "FBI",
    category: "weapon",
    shortText: "命中后可改为查走目标2牌。",
    detailText: "攻击范围2。【喷】命中时可防止伤害，改为弃置目标两张牌，像FBI搜证一样把资源带走。",
    targetMode: "self",
    equipment: { slot: "weapon", range: 2 },
    art: gameCardArt("coldTreatment", "FBI"),
  },
  prTeam: {
    id: "prTeam",
    originalName: "八卦阵",
    name: "公关部",
    category: "armor",
    shortText: "需要【洗】时，红色判定自动洗地。",
    detailText: "当你需要打出【洗】时，可判定；若为红色，视为打出【洗】，由公关部替你把舆论火线压下去。",
    targetMode: "self",
    equipment: { slot: "armor" },
    art: gameCardArt("prTeam", "公关部"),
  },
  safeState: {
    id: "safeState",
    originalName: "仁王盾",
    name: "防弹衣",
    category: "armor",
    shortText: "黑色【喷】打不穿。",
    detailText: "黑色【喷】对你无效，像防弹衣一样挡住阴影里的冷枪。",
    targetMode: "self",
    equipment: { slot: "armor" },
    art: gameCardArt("safeState", "防弹衣"),
  },
  securityMotorcade: {
    id: "securityMotorcade",
    originalName: "+1马",
    name: "特勤局车队",
    category: "mount",
    shortText: "别人更难接近你。",
    detailText: "其他角色计算与你的距离时+1，特勤局车队把你和攻击者隔开。",
    targetMode: "self",
    equipment: { slot: "plusMount", distanceDelta: 1 },
    art: gameCardArt("securityMotorcade", "特勤局车队"),
  },
  campaignJet: {
    id: "campaignJet",
    originalName: "-1马",
    name: "空军一号",
    category: "mount",
    shortText: "你更容易抵达别人。",
    detailText: "你计算与其他角色的距离时-1，空军一号让你的政治行程直接压到对方面前。",
    targetMode: "self",
    equipment: { slot: "minusMount", distanceDelta: -1 },
    art: gameCardArt("campaignJet", "空军一号"),
  },
};

const RAW_DECK: Array<[Suit, Rank, [OriginalCardName, OriginalCardName], OriginalCardName?]> = [
  ["spade", "A", ["闪电", "决斗"]],
  ["spade", "2", ["八卦阵", "雌雄双股剑"], "寒冰剑"],
  ["spade", "3", ["过河拆桥", "顺手牵羊"]],
  ["spade", "4", ["过河拆桥", "顺手牵羊"]],
  ["spade", "5", ["青龙偃月刀", "绝影"]],
  ["spade", "6", ["乐不思蜀", "青釭剑"]],
  ["spade", "7", ["南蛮入侵", "杀"]],
  ["spade", "8", ["杀", "杀"]],
  ["spade", "9", ["杀", "杀"]],
  ["spade", "10", ["杀", "杀"]],
  ["spade", "J", ["无懈可击", "顺手牵羊"]],
  ["spade", "Q", ["丈八蛇矛", "过河拆桥"]],
  ["spade", "K", ["大宛", "南蛮入侵"]],
  ["club", "A", ["诸葛连弩", "决斗"]],
  ["club", "2", ["八卦阵", "杀"], "仁王盾"],
  ["club", "3", ["过河拆桥", "杀"]],
  ["club", "4", ["过河拆桥", "杀"]],
  ["club", "5", ["的卢", "杀"]],
  ["club", "6", ["乐不思蜀", "杀"]],
  ["club", "7", ["南蛮入侵", "杀"]],
  ["club", "8", ["杀", "杀"]],
  ["club", "9", ["杀", "杀"]],
  ["club", "10", ["杀", "杀"]],
  ["club", "J", ["杀", "杀"]],
  ["club", "Q", ["借刀杀人", "无懈可击"]],
  ["club", "K", ["借刀杀人", "无懈可击"]],
  ["heart", "A", ["桃园结义", "万箭齐发"]],
  ["heart", "2", ["闪", "闪"]],
  ["heart", "3", ["桃", "五谷丰登"]],
  ["heart", "4", ["桃", "五谷丰登"]],
  ["heart", "5", ["麒麟弓", "赤兔"]],
  ["heart", "6", ["桃", "乐不思蜀"]],
  ["heart", "7", ["桃", "无中生有"]],
  ["heart", "8", ["桃", "无中生有"]],
  ["heart", "9", ["桃", "无中生有"]],
  ["heart", "10", ["杀", "杀"]],
  ["heart", "J", ["杀", "无中生有"]],
  ["heart", "Q", ["桃", "过河拆桥"], "闪电"],
  ["heart", "K", ["爪黄飞电", "闪"]],
  ["diamond", "A", ["诸葛连弩", "决斗"]],
  ["diamond", "2", ["闪", "闪"]],
  ["diamond", "3", ["闪", "顺手牵羊"]],
  ["diamond", "4", ["闪", "顺手牵羊"]],
  ["diamond", "5", ["闪", "贯石斧"]],
  ["diamond", "6", ["闪", "杀"]],
  ["diamond", "7", ["闪", "杀"]],
  ["diamond", "8", ["闪", "杀"]],
  ["diamond", "9", ["闪", "杀"]],
  ["diamond", "10", ["闪", "杀"]],
  ["diamond", "J", ["闪", "闪"]],
  ["diamond", "Q", ["桃", "方天画戟"], "无懈可击"],
  ["diamond", "K", ["杀", "紫骍"]],
];

function cardBlueprint(suit: Suit, rank: Rank, originalName: OriginalCardName, index: number, ex = false): CardBlueprint {
  const defId = DEF_BY_ORIGINAL[originalName];
  const def = CARD_DEFS[defId];
  const suffix = ex ? "ex" : String(index);
  return {
    id: `${suit}-${rank}-${defId}-${suffix}`,
    defId,
    suit,
    rank,
    ex,
    source: ex ? "ex" : "standard",
    art: def.art,
  };
}

export const CARD_BLUEPRINTS: CardBlueprint[] = RAW_DECK.flatMap(([suit, rank, names, exName]) => {
  const base = names.map((name, index) => cardBlueprint(suit, rank, name, index + 1));
  return exName ? [...base, cardBlueprint(suit, rank, exName, 3, true)] : base;
});

export function createDeck(seed = Date.now()): import("./types").CardInstance[] {
  const rng = mulberry32(seed);
  const deck = CARD_BLUEPRINTS.map((card, index) => ({
    ...card,
    uid: `${card.id}-${seed}-${index}`,
  }));
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function getCardDef(cardOrId: CardBlueprint | CardId): GameCardDefinition {
  return CARD_DEFS[typeof cardOrId === "string" ? cardOrId : cardOrId.defId];
}

export function isRedSuit(suit: Suit): boolean {
  return suit === "heart" || suit === "diamond";
}

export function suitLabel(suit: Suit): string {
  return { spade: "♠", heart: "♥", club: "♣", diamond: "♦" }[suit];
}

export function suitColor(suit: Suit): "red" | "black" {
  return isRedSuit(suit) ? "red" : "black";
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
