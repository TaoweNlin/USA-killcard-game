export type Suit = "spade" | "heart" | "club" | "diamond";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
export type CardCategory = "basic" | "trick" | "delayed" | "weapon" | "armor" | "mount";
export type EquipmentSlot = "weapon" | "armor" | "plusMount" | "minusMount";
export type Faction = "red" | "blue" | "capital" | "historic";
export type Gender = "male" | "female";
export type RoleId = "incumbent" | "staffer" | "challenger" | "maverick";
export type Phase = "setup" | "prepare" | "judge" | "draw" | "play" | "discard" | "finish" | "gameover";
export type Winner = "incumbentTeam" | "challengers" | "maverick" | "draw";

export interface ArtRef {
  src: string;
  thumb?: string;
  alt: string;
  focalPoint?: `${number}% ${number}%`;
  credit?: string;
  license?: string;
}

export interface GameCardDefinition {
  id: CardId;
  originalName: string;
  name: string;
  category: CardCategory;
  shortText: string;
  detailText: string;
  targetMode: "none" | "self" | "single" | "singleOther" | "allOthers" | "anyWounded" | "weaponHolder";
  art: ArtRef;
  equipment?: {
    slot: EquipmentSlot;
    range?: number;
    distanceDelta?: number;
  };
}

export interface CardBlueprint {
  id: string;
  defId: CardId;
  suit: Suit;
  rank: Rank;
  ex?: boolean;
  source: "standard" | "ex";
  art: ArtRef;
}

export interface CardInstance extends CardBlueprint {
  uid: string;
}

export interface RoleDefinition {
  id: RoleId;
  name: string;
  originalName: string;
  color: string;
  objective: string;
  art: ArtRef;
}

export interface CharacterDefinition {
  id: CharacterId;
  name: string;
  originalTemplate: string;
  faction: Faction;
  gender: Gender;
  maxHp: number;
  skills: SkillId[];
  skillText: string[];
  art: ArtRef;
}

export interface PlayerState {
  id: string;
  seat: number;
  name: string;
  isHuman: boolean;
  roleId: RoleId;
  roleRevealed: boolean;
  characterId: CharacterId;
  maxHp: number;
  hp: number;
  alive: boolean;
  hand: CardInstance[];
  equipment: Partial<Record<EquipmentSlot, CardInstance>>;
  judgment: CardInstance[];
  usedSlashThisTurn: number;
  skippedPlayByJudgment: boolean;
  temporaryDamageBonus: number;
  flags: Record<string, number | boolean | string>;
}

export interface NewGameOptions {
  humanCharacterId?: CharacterId;
  humanRoleId?: RoleId;
}

export type PendingResponseKind = "wash" | "spray" | "vote" | "factCheck" | "dyingSave";

export interface PendingResponse {
  id: string;
  kind: PendingResponseKind;
  playerId: string;
  sourceId?: string;
  cardId?: CardId;
  card?: CardInstance;
  allowedCardIds: CardId[];
  message: string;
  requiredCount: number;
  providedCount: number;
  canDecline: boolean;
  onSuccessLabel: string;
  onFailLabel: string;
}

export interface PendingDiscard {
  playerId: string;
  requiredCount: number;
  selectedCardUids: string[];
  message: string;
}

export type PendingChoiceKind = "zoneCard" | "revealedCard" | "discardCost" | "skillConfirm" | "viewAsUse";
export type ChoiceZone = "hand" | "equipment" | "judgment" | "revealed" | "none";

export interface PendingChoiceOption {
  uid: string;
  ownerId?: string;
  zone: ChoiceZone;
  cardId?: CardId;
  label: string;
  hidden?: boolean;
}

export interface PendingChoice {
  id: string;
  kind: PendingChoiceKind;
  playerId: string;
  sourceId?: string;
  targetId?: string;
  cardId?: CardId;
  message: string;
  options: PendingChoiceOption[];
  selectedCardUids: string[];
  minCount: number;
  maxCount: number;
  canDecline: boolean;
  onConfirmLabel: string;
  onDeclineLabel?: string;
}

export type ActionStepKind =
  | "turn"
  | "phase"
  | "judge"
  | "useCard"
  | "target"
  | "respondPrompt"
  | "respondCard"
  | "cancel"
  | "damage"
  | "heal"
  | "death"
  | "system";

export interface ActionFeedback {
  serial: number;
  tone: "turn" | "play" | "skill" | "response" | "damage" | "heal" | "death" | "system";
  message: string;
  actorId?: string;
  targetIds?: string[];
  cardId?: CardId;
  cardName?: string;
  hpChange?: HpChange;
}

export interface ActionStep extends ActionFeedback {
  kind: ActionStepKind;
  durationMs: number;
  elapsedMs: number;
  cardUid?: string;
}

export type VisualEventKind =
  | "useCard"
  | "respondCard"
  | "drawCards"
  | "gainCards"
  | "giveCards"
  | "discardCards"
  | "equipCard"
  | "judgeFlip"
  | "line"
  | "damage"
  | "heal"
  | "popup"
  | "death"
  | "phase"
  | "clearThrown";

export type VisualZone = "deck" | "discard" | "center" | "hand" | "equipment" | "judgment" | "revealed" | "player";
export type VisualTone = "play" | "skill" | "response" | "damage" | "heal" | "death" | "system";

export interface HpChange {
  targetId: string;
  before: number;
  after: number;
}

export interface VisualEvent {
  serial: number;
  kind: VisualEventKind;
  actorId?: string;
  targetIds?: string[];
  cardUids?: string[];
  cardIds?: CardId[];
  fromZone?: VisualZone;
  toZone?: VisualZone;
  text?: string;
  tone: VisualTone;
  durationMs: number;
  holdMs: number;
  elapsedMs: number;
  color?: string;
  hidden?: boolean;
  hpChange?: HpChange;
}

export interface GameState {
  players: PlayerState[];
  deck: CardInstance[];
  discard: CardInstance[];
  revealed: CardInstance[];
  currentPlayerIndex: number;
  phase: Phase;
  round: number;
  selectedCardUid?: string;
  selectedTargetIds: string[];
  pending?: PendingResponse;
  pendingDiscard?: PendingDiscard;
  pendingChoice?: PendingChoice;
  winner?: Winner;
  winText?: string;
  prompt: string;
  lastAction?: ActionFeedback;
  currentAction?: ActionStep;
  actionQueue: ActionStep[];
  actionClockMs: number;
  currentVisual?: VisualEvent;
  visualQueue: VisualEvent[];
  visualClockMs: number;
  logs: string[];
  alerts: string[];
}

export type CardId =
  | "spray"
  | "wash"
  | "vote"
  | "expose"
  | "poach"
  | "trendBoost"
  | "factCheck"
  | "pileOn"
  | "mockingLive"
  | "debate"
  | "borrowAccount"
  | "fundraiser"
  | "nationalUnity"
  | "investigation"
  | "blackSwan"
  | "repeatMic"
  | "twoTrackMessage"
  | "gotchaQuestion"
  | "draftScramble"
  | "followUpMic"
  | "moneyPush"
  | "tripleBroadcast"
  | "cutTour"
  | "coldTreatment"
  | "prTeam"
  | "safeState"
  | "securityMotorcade"
  | "campaignJet";

export type CharacterId =
  | "trump"
  | "bush"
  | "vance"
  | "billClinton"
  | "hillary"
  | "biden"
  | "reagan"
  | "sanders"
  | "pelosi"
  | "obama"
  | "harris"
  | "musk"
  | "bezos"
  | "zuckerberg"
  | "buffett"
  | "jobs"
  | "gates"
  | "rockefeller"
  | "morgan"
  | "washington"
  | "lincoln"
  | "fdr";

export type SkillId =
  | "trafficRecovery"
  | "redHatGuard"
  | "procedureFeedback"
  | "alterJudgment"
  | "hardCounter"
  | "grabMic"
  | "hardball"
  | "crisisPr"
  | "pollChain"
  | "coalitionAid"
  | "blueAssist"
  | "orthodoxNarrative"
  | "rapidFire"
  | "scheduleControl"
  | "emptyAgenda"
  | "switchMode"
  | "campaignRush"
  | "prosecutorFollowup"
  | "issueIgnition"
  | "mediaGenius"
  | "iterate"
  | "capitalRescue"
  | "logisticsDismantle"
  | "dataHoard"
  | "contrarianBuy"
  | "keynote"
  | "realityDistortion"
  | "systemUpdate"
  | "patchRedirect"
  | "trustBarrier"
  | "chainDraw"
  | "mergerHeal"
  | "assetRestructure"
  | "foundingAid"
  | "reliefClinic"
  | "decisiveStrike"
  | "newDealDuel"
  | "firesideChat";
