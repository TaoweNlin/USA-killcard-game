import { CARD_BLUEPRINTS, CARD_DEFS, createDeck, getCardDef, isRedSuit, suitColor } from "../data/cards";
import { CHARACTER_ORDER, CHARACTERS } from "../data/characters";
import { FIVE_PLAYER_ROLES, ROLES } from "../data/roles";
import type {
  CardId,
  CardInstance,
  CharacterId,
  EquipmentSlot,
  GameState,
  ActionFeedback,
  ActionStep,
  PendingChoice,
  PendingChoiceOption,
  PendingDiscard,
  PendingResponse,
  PendingResponseKind,
  NewGameOptions,
  Phase,
  PlayerState,
  RoleId,
  SkillId,
  VisualEvent,
  VisualEventKind,
  VisualTone,
  VisualZone,
  Winner,
} from "../data/types";

type Subscriber = (state: GameState) => void;
type AiTurnStage = "begin" | "play" | "discard" | "finish";
type ResponseResult = boolean | "pending";
type PendingResolver = (success: boolean) => void;
type ChoiceResult = { confirmed: boolean; selectedUids: string[] } | "pending";
type ChoiceResolver = (confirmed: boolean, selectedUids: string[]) => void;
type InteractionTiming = "afterPresentation" | "immediate";
type DeferredHumanWindow = {
  kind: "response" | "choice";
  playerId: string;
  sourceId?: string;
  cardId?: CardId;
  message: string;
  activate: () => void;
};

const MAX_LOGS = 100;
const AI_ACTION_LIMIT = 7;
const DEFAULT_ACTION_DURATION = 620;
const MAX_NULLIFY_CHAIN = 12;

export const ENGINE_SKILL_COVERAGE: Record<SkillId, "implemented" | "simplified" | "data-only"> = {
  trafficRecovery: "implemented",
  redHatGuard: "simplified",
  procedureFeedback: "implemented",
  alterJudgment: "simplified",
  hardCounter: "implemented",
  grabMic: "implemented",
  hardball: "implemented",
  crisisPr: "implemented",
  pollChain: "implemented",
  coalitionAid: "simplified",
  blueAssist: "simplified",
  orthodoxNarrative: "implemented",
  rapidFire: "implemented",
  scheduleControl: "simplified",
  emptyAgenda: "implemented",
  switchMode: "implemented",
  campaignRush: "implemented",
  prosecutorFollowup: "implemented",
  issueIgnition: "implemented",
  mediaGenius: "implemented",
  iterate: "implemented",
  capitalRescue: "simplified",
  logisticsDismantle: "implemented",
  dataHoard: "implemented",
  contrarianBuy: "implemented",
  keynote: "implemented",
  realityDistortion: "simplified",
  systemUpdate: "implemented",
  patchRedirect: "simplified",
  trustBarrier: "implemented",
  chainDraw: "implemented",
  mergerHeal: "simplified",
  assetRestructure: "implemented",
  foundingAid: "implemented",
  reliefClinic: "implemented",
  decisiveStrike: "implemented",
  newDealDuel: "simplified",
  firesideChat: "implemented",
};

export class AmericaKillGame {
  state: GameState;
  private subscribers = new Set<Subscriber>();
  private seed: number;
  private rng: () => number;
  private recoveredCardUids = new Set<string>();
  private actionSerial = 0;
  private visualSerial = 0;
  private aiTurn?: { playerId: string; stage: AiTurnStage; actions: number };
  private pendingResolver?: PendingResolver;
  private pendingDesired?: CardId;
  private pendingChoiceResolver?: ChoiceResolver;
  private deferredHumanWindow?: DeferredHumanWindow;

  constructor(seed = Date.now()) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.state = this.createInitialState(seed);
  }

  subscribe(subscriber: Subscriber): () => void {
    this.subscribers.add(subscriber);
    subscriber(this.state);
    return () => this.subscribers.delete(subscriber);
  }

  notify(): void {
    for (const subscriber of this.subscribers) subscriber(this.state);
  }

  newGame(seed = Date.now(), options: NewGameOptions = {}): void {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.actionSerial = 0;
    this.visualSerial = 0;
    this.aiTurn = undefined;
    this.pendingResolver = undefined;
    this.pendingDesired = undefined;
    this.pendingChoiceResolver = undefined;
    this.deferredHumanWindow = undefined;
    this.recoveredCardUids.clear();
    this.state = this.createInitialState(seed, options);
    this.flashAction({ tone: "system", message: "新一局开始" });
    this.log("新一局开始：5人身份局，总统明置。");
    const incumbentIndex = this.state.players.findIndex((player) => player.roleId === "incumbent");
    this.state.currentPlayerIndex = incumbentIndex >= 0 ? incumbentIndex : 0;
    if (this.currentPlayer().isHuman) this.runHumanTurnStart();
    else this.continueAutomatedTurns(1);
    this.notify();
  }

  selectCard(uid?: string): void {
    if (this.state.phase !== "play" || this.state.pending || this.state.pendingDiscard || this.state.pendingChoice || this.state.winner) return;
    this.state.selectedCardUid = this.state.selectedCardUid === uid ? undefined : uid;
    this.state.selectedTargetIds = [];
    const player = this.currentPlayer();
    const card = player.hand.find((item) => item.uid === this.state.selectedCardUid);
    if (card) {
      const effective = this.effectivePlayId(player, card);
      this.state.prompt = requiresTarget(effective) ? "请选择目标" : "可直接使用";
    } else {
      this.state.prompt = "请选择一张可用手牌";
    }
    this.notify();
  }

  humanPlayableCardUids(): Set<string> {
    const player = this.state.players.find((item) => item.isHuman);
    if (!player || this.state.phase !== "play" || this.state.pendingDiscard || this.state.pendingChoice) return new Set();
    return new Set(player.hand.filter((card) => this.isPlayable(player, card)).map((card) => card.uid));
  }

  canUseDraftScramble(): boolean {
    const player = this.currentPlayer();
    if (!player?.isHuman || this.state.phase !== "play" || this.state.pending || this.state.pendingDiscard || this.state.pendingChoice || this.state.winner) return false;
    if (player.equipment.weapon?.defId !== "draftScramble") return false;
    if (player.hand.length < 2 || !this.canUseSlash(player)) return false;
    return this.legalTargets(player.id, player.hand[0], "spray").length > 0;
  }

  startDraftScrambleUse(): void {
    const player = this.currentPlayer();
    if (!this.canUseDraftScramble()) return;
    const options = player.hand.map((card) => ({
      uid: card.uid,
      ownerId: player.id,
      zone: "hand" as const,
      cardId: card.defId,
      label: CARD_DEFS[card.defId].name,
    }));
    this.clearDraftScrambleUse(player);
    this.requestChoice(
      player,
      {
        kind: "viewAsUse",
        playerId: player.id,
        sourceId: player.id,
        cardId: "draftScramble",
        message: "发动【临场拼稿】：选择任意两张手牌当【喷】使用",
        options,
        minCount: 2,
        maxCount: 2,
        canDecline: true,
        onConfirmLabel: "当【喷】使用",
        onDeclineLabel: "取消",
      },
      (confirmed, selectedUids) => {
        if (!confirmed || selectedUids.length < 2) return;
        const selected = selectedUids.slice(0, 2);
        this.setDraftScrambleUse(player, selected);
        this.state.selectedCardUid = selected[0];
        this.state.selectedTargetIds = [];
        this.state.prompt = "【临场拼稿】：请选择【喷】的目标，再点击使用确认";
      },
      player.hand
        .slice()
        .sort((a, b) => scoreCardForOwner(player, a.defId) - scoreCardForOwner(player, b.defId))
        .slice(0, 2)
        .map((card) => card.uid),
      "immediate",
    );
    this.notify();
  }

  discardSelectableCardUids(): Set<string> {
    const pending = this.state.pendingDiscard;
    if (!pending) return new Set();
    const player = this.player(pending.playerId);
    if (!player?.isHuman) return new Set();
    return new Set(player.hand.map((card) => card.uid));
  }

  toggleDiscardCard(uid: string): void {
    const pending = this.state.pendingDiscard;
    if (!pending || this.state.winner) return;
    const player = this.player(pending.playerId);
    if (!player?.isHuman || !player.hand.some((card) => card.uid === uid)) return;
    const index = pending.selectedCardUids.indexOf(uid);
    if (index >= 0) {
      pending.selectedCardUids.splice(index, 1);
    } else if (pending.selectedCardUids.length < pending.requiredCount) {
      pending.selectedCardUids.push(uid);
    }
    pending.message = this.discardPrompt(pending);
    this.state.prompt = pending.message;
    this.notify();
  }

  confirmDiscardSelection(): void {
    const pending = this.state.pendingDiscard;
    if (!pending || this.state.winner) return;
    const player = this.player(pending.playerId);
    if (!player?.isHuman || pending.selectedCardUids.length < pending.requiredCount) return;

    const selected = [...pending.selectedCardUids];
    this.state.pendingDiscard = undefined;
    this.state.pendingChoice = undefined;
    this.state.selectedCardUid = undefined;
    this.state.selectedTargetIds = [];
    for (const uid of selected) {
      const card = this.removeFromHand(player, uid);
      if (!card) continue;
      this.discard(card);
      this.log(`${player.name} 弃置${this.cardLabel(card)}。`);
      this.flashAction({
        kind: "useCard",
        tone: "play",
        actorId: player.id,
        cardId: card.defId,
        cardName: CARD_DEFS[card.defId].name,
        message: `${player.name} 弃置【${CARD_DEFS[card.defId].name}】`,
        durationMs: 420,
      });
    }
    this.state.prompt = "等待其他玩家行动";
    this.finishTurn(player);
    this.aiTurn = undefined;
    this.notify();
  }

  choiceSelectableCardUids(): Set<string> {
    const pending = this.state.pendingChoice;
    if (!pending) return new Set();
    const player = this.player(pending.playerId);
    if (!player?.isHuman) return new Set();
    return new Set(pending.options.map((option) => option.uid));
  }

  toggleChoiceCard(uid: string): void {
    const pending = this.state.pendingChoice;
    if (!pending || this.state.winner) return;
    const player = this.player(pending.playerId);
    if (!player?.isHuman || !pending.options.some((option) => option.uid === uid)) return;
    const index = pending.selectedCardUids.indexOf(uid);
    if (index >= 0) {
      pending.selectedCardUids.splice(index, 1);
    } else if (pending.maxCount <= 1) {
      pending.selectedCardUids = [uid];
    } else if (pending.selectedCardUids.length < pending.maxCount) {
      pending.selectedCardUids.push(uid);
    }
    this.state.selectedCardUid = pending.selectedCardUids.at(-1);
    this.state.selectedTargetIds = [];
    this.state.prompt = this.choicePrompt(pending);
    this.notify();
  }

  choiceSelectionCanConfirm(): boolean {
    const pending = this.state.pendingChoice;
    if (!pending) return false;
    const count = pending.selectedCardUids.length;
    return count >= pending.minCount && count <= pending.maxCount;
  }

  confirmChoice(): void {
    const pending = this.state.pendingChoice;
    const resolver = this.pendingChoiceResolver;
    if (!pending || !resolver || !this.choiceSelectionCanConfirm()) return;
    const selected = [...pending.selectedCardUids];
    this.clearPendingChoice();
    resolver(true, selected);
    this.notify();
  }

  declineChoice(): void {
    const pending = this.state.pendingChoice;
    const resolver = this.pendingChoiceResolver;
    if (!pending || !resolver || !pending.canDecline) return;
    this.clearPendingChoice();
    resolver(false, []);
    this.notify();
  }

  responsePlayableCardUids(): Set<string> {
    const pending = this.state.pending;
    if (!pending) return new Set();
    const player = this.player(pending.playerId);
    if (!player?.isHuman) return new Set();
    const desired = this.responseDesiredCard(pending);
    return new Set(player.hand.filter((card) => this.canTreatAs(player, card, desired)).map((card) => card.uid));
  }

  selectResponseCard(uid: string): void {
    const pending = this.state.pending;
    if (!pending || this.state.winner) return;
    const player = this.player(pending.playerId);
    if (!player?.isHuman) return;
    const desired = this.responseDesiredCard(pending);
    const card = player.hand.find((item) => item.uid === uid);
    if (!card || !this.canTreatAs(player, card, desired)) return;
    this.state.selectedCardUid = this.state.selectedCardUid === uid ? undefined : uid;
    this.state.selectedTargetIds = [];
    this.state.prompt = this.state.selectedCardUid ? `已选择【${CARD_DEFS[desired].name}】，点击确定响应` : pending.message;
    this.notify();
  }

  responseSelectionCanConfirm(): boolean {
    const pending = this.state.pending;
    if (!pending || !this.state.selectedCardUid) return false;
    const player = this.player(pending.playerId);
    if (!player?.isHuman) return false;
    const card = player.hand.find((item) => item.uid === this.state.selectedCardUid);
    return Boolean(card && this.canTreatAs(player, card, this.responseDesiredCard(pending)));
  }

  confirmResponseSelection(): void {
    if (!this.responseSelectionCanConfirm() || !this.state.selectedCardUid) return;
    this.respondWithCard(this.state.selectedCardUid);
  }

  cancelResponseSelection(): void {
    if (!this.state.pending) return;
    this.state.selectedCardUid = undefined;
    this.state.selectedTargetIds = [];
    this.state.prompt = this.state.pending.message;
    this.notify();
  }

  respondWithCard(uid: string): void {
    const pending = this.state.pending;
    if (!pending || !this.pendingResolver) return;
    const player = this.player(pending.playerId);
    if (!player?.isHuman) return;
    const desired = this.responseDesiredCard(pending);
    const card = player.hand.find((item) => item.uid === uid);
    if (!card || !this.canTreatAs(player, card, desired)) return;

    const actualDef = CARD_DEFS[card.defId];
    this.removeFromHand(player, card.uid);
    this.discard(card, { animate: false });
    pending.providedCount += 1;
    if (card.defId !== desired) {
      this.log(`${player.name} 将【${actualDef.name}】当作【${CARD_DEFS[desired].name}】打出。`);
    } else {
      this.log(`${player.name} 打出【${actualDef.name}】。`);
    }
    this.focusActionNow();
    this.flashAction({
      kind: "respondCard",
      tone: "response",
      actorId: player.id,
      cardId: desired,
      cardName: CARD_DEFS[desired].name,
      cardUid: card.uid,
      message: `${player.name} 打出【${CARD_DEFS[desired].name}】响应`,
      durationMs: 560,
    });
    this.state.selectedCardUid = undefined;
    this.state.selectedTargetIds = [];

    if (pending.providedCount < pending.requiredCount) {
      pending.message = `${player.name} 还需要打出 ${pending.requiredCount - pending.providedCount} 张【${CARD_DEFS[desired].name}】`;
      this.state.prompt = pending.message;
      this.notify();
      return;
    }

    const resolver = this.pendingResolver;
    this.clearPendingResponse();
    resolver(true);
    this.notify();
  }

  declineResponse(): void {
    const pending = this.state.pending;
    const resolver = this.pendingResolver;
    if (!pending || !resolver || !pending.canDecline) return;
    const player = this.player(pending.playerId);
    this.log(`${player?.name ?? "玩家"} 选择不响应。`);
    this.focusActionNow();
    this.flashAction({
      kind: "cancel",
      tone: "response",
      actorId: pending.playerId,
      cardId: pending.cardId,
      cardName: pending.cardId ? CARD_DEFS[pending.cardId].name : "不响应",
      message: `${player?.name ?? "玩家"} 不响应`,
      durationMs: 480,
    });
    this.clearPendingResponse();
    resolver(false);
    this.notify();
  }

  selectedLegalTargetIds(): Set<string> {
    const player = this.currentPlayer();
    const card = player.hand.find((item) => item.uid === this.state.selectedCardUid);
    if (!card) return new Set();
    const effective = this.effectivePlayId(player, card);
    if (!requiresTarget(effective)) return new Set();
    return new Set(this.selectableTargetsForCard(player, card, effective).map((target) => target.id));
  }

  selectedCardNeedsTarget(): boolean {
    const player = this.currentPlayer();
    const card = player.hand.find((item) => item.uid === this.state.selectedCardUid);
    if (!card) return false;
    return requiresTarget(this.effectivePlayId(player, card));
  }

  selectedCardCanConfirm(): boolean {
    const player = this.currentPlayer();
    const card = player.hand.find((item) => item.uid === this.state.selectedCardUid);
    if (!card) return false;
    const effective = this.effectivePlayId(player, card);
    if (!requiresTarget(effective)) return true;
    const [minTargets, maxTargets] = this.targetCountRange(player, card, effective);
    return this.state.selectedTargetIds.length >= minTargets && this.state.selectedTargetIds.length <= maxTargets;
  }

  confirmSelectedCard(): void {
    const player = this.currentPlayer();
    const card = player.hand.find((item) => item.uid === this.state.selectedCardUid);
    if (!card || !this.selectedCardCanConfirm()) return;
    this.playCard(card.uid, [...this.state.selectedTargetIds]);
  }

  cancelSelection(): void {
    this.clearDraftScrambleUse(this.currentPlayer());
    this.state.selectedCardUid = undefined;
    this.state.selectedTargetIds = [];
    if (!this.state.winner) this.state.prompt = "请选择手牌出牌";
    this.notify();
  }

  effectiveCardName(player: PlayerState, card: CardInstance): string {
    return CARD_DEFS[this.effectivePlayId(player, card)].name;
  }

  selectTarget(playerId: string): void {
    if (!this.state.selectedCardUid) return;
    const current = this.currentPlayer();
    const card = current.hand.find((item) => item.uid === this.state.selectedCardUid);
    if (!card) return;
    const effective = this.effectivePlayId(current, card);
    if (!requiresTarget(effective)) return;
    const legalTargets = this.selectableTargetsForCard(current, card, effective).map((player) => player.id);
    if (!legalTargets.includes(playerId)) return;
    const [minTargets, maxTargets] = this.targetCountRange(current, card, effective);
    if (minTargets === 1 && maxTargets === 1) {
      this.playCard(card.uid, [playerId]);
      return;
    }
    const selectedIndex = this.state.selectedTargetIds.indexOf(playerId);
    if (selectedIndex >= 0) {
      this.state.selectedTargetIds.splice(selectedIndex, 1);
    } else {
      if (maxTargets <= 1) this.state.selectedTargetIds = [playerId];
      else this.state.selectedTargetIds.push(playerId);
    }
    this.state.prompt = this.selectedCardCanConfirm() ? "目标已选择，点击使用确认" : "请选择目标";
    this.notify();
  }

  playCard(uid: string, targetIds: string[] = []): void {
    if (this.state.phase !== "play" || this.state.pending || this.state.pendingDiscard || this.state.pendingChoice || this.state.winner) return;
    const source = this.currentPlayer();
    const card = source.hand.find((item) => item.uid === uid);
    if (!card || !this.isPlayable(source, card)) return;
    const effectiveId = this.effectivePlayId(source, card);
    const targetList = targetIds.length ? targetIds.map((id) => this.player(id)).filter((target): target is PlayerState => Boolean(target)) : [];
    const def = CARD_DEFS[effectiveId];
    const [minTargets, maxTargets] = this.targetCountRange(source, card, effectiveId);
    if (requiresTarget(effectiveId) && (targetList.length < minTargets || targetList.length > maxTargets)) return;
    if (!this.validateTargetList(source, card, effectiveId, targetList)) return;
    const draftExtraCost = this.draftScrambleExtraCost(source, card, effectiveId);
    if (this.isDraftScrambleViewAs(source, card, effectiveId) && draftExtraCost.length < 1) return;

    this.removeFromHand(source, card.uid);
    for (const cost of draftExtraCost) {
      const removed = this.removeFromHand(source, cost.uid);
      if (removed) this.discard(removed);
    }
    this.clearDraftScrambleUse(source);
    this.state.selectedCardUid = undefined;
    this.state.selectedTargetIds = [];
    if (source.isHuman) this.focusActionNow();
    const originalDef = getCardDef(card);
    if (effectiveId !== card.defId) {
      this.log(`${source.name} 将【${originalDef.name}】当作【${def.name}】使用。`);
    } else {
      this.log(`${source.name} 使用【${def.name}】。`);
    }
    this.flashAction({
      kind: "useCard",
      tone: isEquipment(effectiveId) ? "skill" : "play",
      actorId: source.id,
      targetIds: targetList.map((target) => target.id),
      cardId: effectiveId,
      cardName: def.name,
      cardUid: card.uid,
      durationMs: 720,
      message: targetList.length ? `${source.name} 对 ${targetList.map((target) => target.name).join("、")} 使用【${def.name}】` : `${source.name} 使用【${def.name}】`,
    });

    if (def.category === "weapon" || def.category === "armor" || def.category === "mount") {
      this.equipCard(source, card);
      this.afterUsingCard(source, card, effectiveId);
      if (source.isHuman && !this.state.winner) this.state.prompt = "继续出牌，或结束回合";
      this.notify();
      return;
    }

    if (effectiveId === "factCheck") {
      this.discard(card, { animate: false });
      this.log("【事实核查】只能在锦囊响应窗口中使用。");
      if (source.isHuman && !this.state.winner) this.state.prompt = "事实核查需要在响应窗口使用";
      this.notify();
      return;
    }

    const finishResolvedCard = () => {
      this.afterUsingCard(source, card, effectiveId);
      this.checkVictory();
      if (source.isHuman && !this.state.winner) this.state.prompt = "继续出牌，或结束回合";
      this.notify();
    };
    const completed = this.resolveCard(source, card, effectiveId, targetList, finishResolvedCard);
    if (!completed) {
      this.notify();
      return;
    }
    finishResolvedCard();
  }

  endPhase(): void {
    if (this.state.winner) return;
    const current = this.currentPlayer();
    if (!current.isHuman) return;
    if (this.state.phase === "play") {
      this.state.phase = "discard";
      if (this.startHumanDiscard(current)) {
        this.notify();
        return;
      }
    }
    this.state.selectedCardUid = undefined;
    this.state.selectedTargetIds = [];
    this.state.pendingDiscard = undefined;
    this.state.prompt = "等待其他玩家行动";
    this.finishTurn(current);
    this.aiTurn = undefined;
    this.notify();
  }

  autoDiscardHuman(): void {
    const current = this.currentPlayer();
    if (current.isHuman && this.state.phase === "discard") {
      this.handleDiscard(current);
      this.state.prompt = "等待其他玩家行动";
      this.finishTurn(current);
      this.aiTurn = undefined;
      this.notify();
    }
  }

  useSkill(skill: SkillId): void {
    const player = this.currentPlayer();
    if (!player.isHuman || this.state.phase !== "play" || this.state.pendingChoice || this.state.winner) return;
    if (!this.hasSkill(player, skill)) return;
    if (skill === "iterate" && !player.flags.iterated && player.hand.length > 0) {
      const count = Math.min(2, player.hand.length);
      const discarded = player.hand.splice(0, count);
      discarded.forEach((card) => this.discard(card));
      this.drawCards(player, count);
      player.flags.iterated = true;
      this.log(`${player.name} 发动【极限迭代】，弃${count}张并摸${count}张。`);
      this.flashAction({ tone: "skill", actorId: player.id, cardName: "极限迭代", message: `${player.name} 发动【极限迭代】` });
    }
    if (skill === "contrarianBuy" && !player.flags.contrarianBuy && player.hp > 1) {
      player.hp -= 1;
      this.drawCards(player, 2);
      player.flags.contrarianBuy = true;
      this.log(`${player.name} 发动【逆势加仓】，失去1点支持率并摸2张。`);
      this.flashAction({ tone: "skill", actorId: player.id, cardName: "逆势加仓", message: `${player.name} 发动【逆势加仓】` });
    }
    if (skill === "reliefClinic" && !player.flags.reliefClinic) {
      const target = this.state.players.find((item) => item.alive && item.hp < item.maxHp);
      const redCard = player.hand.find((card) => isRedSuit(card.suit));
      if (target && redCard) {
        this.removeFromHand(player, redCard.uid);
        this.discard(redCard);
        this.heal(target, 1, player);
        player.flags.reliefClinic = true;
        this.log(`${player.name} 发动【独立配给】，${target.name} 回复1点支持率。`);
        this.flashAction({ tone: "skill", actorId: player.id, targetIds: [target.id], cardName: "独立配给", message: `${player.name} 发动【独立配给】` });
      }
    }
    this.notify();
  }

  renderGameToText(): string {
    const current = this.currentPlayer();
    const payload = {
      note: "DOM card table; seats are clockwise from the human player at seat 0.",
      phase: this.state.phase,
      round: this.state.round,
      current: current?.name,
      winner: this.state.winText ?? null,
      prompt: this.state.prompt,
      lastAction: this.state.lastAction ?? null,
      currentAction: this.state.currentAction ?? null,
      pending: this.state.pending
        ? {
            kind: this.state.pending.kind,
            playerId: this.state.pending.playerId,
            cardId: this.state.pending.cardId,
            message: this.state.pending.message,
            requiredCount: this.state.pending.requiredCount,
            providedCount: this.state.pending.providedCount,
          }
        : null,
      pendingDiscard: this.state.pendingDiscard
        ? {
            playerId: this.state.pendingDiscard.playerId,
            requiredCount: this.state.pendingDiscard.requiredCount,
            selectedCount: this.state.pendingDiscard.selectedCardUids.length,
            message: this.state.pendingDiscard.message,
          }
        : null,
      pendingChoice: this.state.pendingChoice
        ? {
            kind: this.state.pendingChoice.kind,
            playerId: this.state.pendingChoice.playerId,
            sourceId: this.state.pendingChoice.sourceId ?? null,
            targetId: this.state.pendingChoice.targetId ?? null,
            cardId: this.state.pendingChoice.cardId ?? null,
            message: this.state.pendingChoice.message,
            minCount: this.state.pendingChoice.minCount,
            maxCount: this.state.pendingChoice.maxCount,
            selectedCount: this.state.pendingChoice.selectedCardUids.length,
            options: this.state.pendingChoice.options.map((option) => ({
              uid: option.uid,
              zone: option.zone,
              cardId: option.hidden ? null : (option.cardId ?? null),
              hidden: Boolean(option.hidden),
              label: option.label,
            })),
          }
        : null,
      deferredInteraction: this.deferredHumanWindow
        ? {
            kind: this.deferredHumanWindow.kind,
            playerId: this.deferredHumanWindow.playerId,
            sourceId: this.deferredHumanWindow.sourceId ?? null,
            cardId: this.deferredHumanWindow.cardId ?? null,
            message: this.deferredHumanWindow.message,
          }
        : null,
      actionQueueLength: this.state.actionQueue.length,
      currentVisual: this.state.currentVisual ?? null,
      visualQueueLength: this.state.visualQueue.length,
      selectedCard: this.state.selectedCardUid ?? null,
      selectedTargets: [...this.state.selectedTargetIds],
      players: this.state.players.map((player) => ({
        seat: player.seat,
        name: player.name,
        role: player.roleRevealed || player.isHuman ? ROLES[player.roleId].name : "暗置",
        roleId: player.roleId,
        characterId: player.characterId,
        isHuman: player.isHuman,
        hp: player.hp,
        maxHp: player.maxHp,
        hand: player.isHuman ? player.hand.map((card) => CARD_DEFS[card.defId].name) : player.hand.length,
        equipment: Object.fromEntries(Object.entries(player.equipment).map(([slot, card]) => [slot, card ? CARD_DEFS[card.defId].name : null])),
        judgment: player.judgment.map((card) => CARD_DEFS[card.defId].name),
        alive: player.alive,
      })),
      deck: this.state.deck.length,
      discard: this.state.discard.length,
      latestLogs: this.state.logs.slice(-8),
    };
    return JSON.stringify(payload);
  }

  advanceTime(ms: number): void {
    let changed = this.advanceVisual(ms);
    if (this.state.currentAction) {
      this.state.actionClockMs += Math.max(0, ms);
      this.state.currentAction.elapsedMs = this.state.actionClockMs;
      if (this.state.actionClockMs < this.state.currentAction.durationMs) {
        if (changed) this.notify();
        return;
      }
      this.state.currentAction = this.state.actionQueue.shift();
      this.state.actionClockMs = 0;
      changed = true;
      if (this.state.currentAction) {
        this.notify();
        return;
      }
    }
    if (this.hasPresentationWork()) {
      if (changed) this.notify();
      return;
    }
    if (this.deferredHumanWindow) {
      this.activateDeferredHumanWindow();
      this.notify();
      return;
    }
    if (this.state.pending || this.state.pendingChoice || this.state.pendingDiscard) {
      if (changed) this.notify();
      return;
    }
    const advanced = this.continueAutomatedTurns(1);
    if (advanced || changed) this.notify();
  }

  private hasPresentationWork(): boolean {
    return Boolean(this.state.currentAction || this.state.actionQueue.length || this.state.currentVisual || this.state.visualQueue.length);
  }

  private shouldDeferHumanWindow(timing: InteractionTiming): boolean {
    return timing !== "immediate" && this.hasPresentationWork();
  }

  private activateDeferredHumanWindow(): void {
    const deferred = this.deferredHumanWindow;
    if (!deferred) return;
    this.deferredHumanWindow = undefined;
    deferred.activate();
  }

  debugDamage(targetId: string, amount: number, sourceId?: string): void {
    const target = this.player(targetId);
    const source = sourceId ? this.player(sourceId) : undefined;
    if (target) {
      this.damage(target, amount, source, undefined);
      this.checkVictory();
      this.notify();
    }
  }

  private createInitialState(seed: number, options: NewGameOptions = {}): GameState {
    const deck = createDeck(seed);
    const isCustomOpening = Boolean(options.humanCharacterId || options.humanRoleId);
    const humanRoleId = options.humanRoleId ?? "incumbent";
    const humanCharacterId = options.humanCharacterId ?? (isCustomOpening ? "trump" : undefined);
    const characterIds = humanCharacterId
      ? [humanCharacterId, ...this.shuffle(CHARACTER_ORDER.filter((id) => id !== humanCharacterId)).slice(0, 4)]
      : this.shuffle([...CHARACTER_ORDER]).slice(0, 5);
    const roleIds = isCustomOpening ? [humanRoleId, ...this.remainingRolesForHuman(humanRoleId)] : FIVE_PLAYER_ROLES;
    const players: PlayerState[] = roleIds.map((roleId, index) => {
      const character = CHARACTERS[characterIds[index]];
      const incumbentBonus = roleId === "incumbent" ? 1 : 0;
      return {
        id: `p${index}`,
        seat: index,
        name: character.name,
        isHuman: index === 0,
        roleId,
        roleRevealed: roleId === "incumbent",
        characterId: character.id,
        maxHp: character.maxHp + incumbentBonus,
        hp: character.maxHp + incumbentBonus,
        alive: true,
        hand: [],
        equipment: {},
        judgment: [],
        usedSlashThisTurn: 0,
        skippedPlayByJudgment: false,
        temporaryDamageBonus: 0,
        flags: {},
      };
    });
    const state: GameState = {
      players,
      deck,
      discard: [],
      revealed: [],
      currentPlayerIndex: 0,
      phase: "setup",
      round: 1,
      selectedTargetIds: [],
      prompt: "等待开局",
      actionQueue: [],
      actionClockMs: 0,
      visualQueue: [],
      visualClockMs: 0,
      logs: [],
      alerts: [],
    };
    this.state = state;
    for (const player of players) this.drawCards(player, 4, true);
    return state;
  }

  private remainingRolesForHuman(humanRoleId: RoleId): RoleId[] {
    const roles = [...FIVE_PLAYER_ROLES];
    const index = roles.indexOf(humanRoleId);
    if (index >= 0) roles.splice(index, 1);
    return this.shuffle(roles);
  }

  private runHumanTurnStart(): void {
    const player = this.currentPlayer();
    if (!player || !player.alive || !player.isHuman || this.state.winner) return;
    if (!this.beginTurn(player, () => {
      this.completeHumanTurnStart(player);
      this.notify();
    })) {
      return;
    }
    this.completeHumanTurnStart(player);
  }

  private completeHumanTurnStart(player: PlayerState): void {
    if (!player.skippedPlayByJudgment) {
      this.state.phase = "play";
      this.state.prompt = "请选择手牌出牌";
    this.log(`轮到${player.name}出牌。可以点选手牌，再点目标。`);
    } else {
      this.state.phase = "discard";
      this.state.prompt = "判定跳过出牌阶段，正在弃牌";
      this.handleDiscard(player);
      this.finishTurn(player);
      this.aiTurn = undefined;
    }
  }

  private runAiUntilHuman(): void {
    this.continueAutomatedTurns(120);
  }

  private continueAutomatedTurns(maxSteps: number): boolean {
    let advanced = false;
    let guard = 0;
    while (!this.state.winner && guard < maxSteps) {
      const player = this.currentPlayer();
      if (player.isHuman) {
        if (this.state.phase !== "play" && this.state.phase !== "discard") {
          this.aiTurn = undefined;
          this.runHumanTurnStart();
          advanced = true;
        }
        break;
      }
      this.stepAiTurn(player);
      advanced = true;
      guard += 1;
    }
    return advanced;
  }

  private processAiTurn(player: PlayerState): void {
    if (!this.beginTurn(player)) return;
    if (!player.skippedPlayByJudgment) {
      this.state.phase = "play";
      this.performAiPlay(player);
    }
    this.state.phase = "discard";
    this.handleDiscard(player);
    this.finishTurn(player);
  }

  private stepAiTurn(player: PlayerState): void {
    if (!player.alive) {
      this.aiTurn = undefined;
      this.advanceToNextAlivePlayer();
      return;
    }
    if (!this.aiTurn || this.aiTurn.playerId !== player.id) {
      this.aiTurn = { playerId: player.id, stage: "begin", actions: 0 };
    }
    if (this.aiTurn.stage === "begin") {
      if (!this.beginTurn(player, () => {
        this.completeAiBegin(player);
        this.notify();
      })) {
        return;
      }
      if (this.state.winner) return;
      this.completeAiBegin(player);
      return;
    }
    if (this.aiTurn.stage === "play") {
      const acted = this.performAiSingleAction(player);
      if (this.state.winner) return;
      this.aiTurn.actions += acted ? 1 : AI_ACTION_LIMIT;
      if (!acted || this.aiTurn.actions >= AI_ACTION_LIMIT || !player.alive || this.state.winner) {
        this.state.phase = "discard";
        this.state.prompt = `${player.name} 进入弃牌阶段`;
        this.flashAction({ tone: "turn", actorId: player.id, message: `${player.name} 进入弃牌阶段` });
        this.aiTurn.stage = "discard";
      }
      return;
    }
    if (this.aiTurn.stage === "discard") {
      this.state.phase = "discard";
      this.handleDiscard(player);
      this.state.phase = "finish";
      this.state.prompt = `${player.name} 回合结束`;
      this.flashAction({ tone: "turn", actorId: player.id, message: `${player.name} 回合结束` });
      this.aiTurn.stage = "finish";
      return;
    }
    this.finishTurn(player);
    this.aiTurn = undefined;
    if (!this.state.winner) this.state.prompt = "等待下一名玩家";
  }

  private completeAiBegin(player: PlayerState): void {
    if (this.state.winner) return;
    if (!this.aiTurn || this.aiTurn.playerId !== player.id) {
      this.aiTurn = { playerId: player.id, stage: "begin", actions: 0 };
    }
    if (player.skippedPlayByJudgment) {
      this.state.phase = "discard";
      this.state.prompt = `${player.name} 被判定跳过出牌`;
      this.aiTurn.stage = "discard";
    } else {
      this.state.phase = "play";
      this.state.prompt = `${player.name} 正在出牌`;
      this.flashAction({ tone: "turn", actorId: player.id, message: `${player.name} 进入出牌阶段` });
      this.aiTurn.stage = "play";
    }
  }

  private beginTurn(player: PlayerState, onComplete?: () => void): boolean {
    this.state.phase = "prepare";
    player.usedSlashThisTurn = 0;
    player.skippedPlayByJudgment = false;
    player.temporaryDamageBonus = 0;
    player.flags = {};
    this.flashAction({ tone: "turn", actorId: player.id, message: `${player.name} 回合开始` });
    this.log(`第${this.state.round}轮，${player.name}回合开始。`);
    this.prepareSkills(player);
    this.state.phase = "judge";
    if (!this.resolveJudgments(player, () => {
      this.state.phase = "draw";
      this.drawPhase(player);
      onComplete?.();
    })) {
      return false;
    }
    this.state.phase = "draw";
    this.drawPhase(player);
    return true;
  }

  private finishTurn(player: PlayerState): void {
    this.state.phase = "finish";
    this.flashAction({ tone: "turn", actorId: player.id, message: `${player.name} 结束回合` });
    if (this.hasSkill(player, "firesideChat") && player.alive) {
      this.drawCards(player, 1);
      this.log(`${player.name} 发动【炉边谈话】，摸1张牌。`);
    }
    this.checkVictory();
    if (this.state.winner) return;
    this.advanceToNextAlivePlayer();
  }

  private prepareSkills(player: PlayerState): void {
    if (this.hasSkill(player, "pollChain")) {
      let count = 0;
      while (count < 8 && this.state.deck.length > 0) {
        const judge = this.drawJudgeCard();
        this.log(`${player.name}【民调连抽】判定：${this.cardLabel(judge)}。`);
        if (suitColor(judge.suit) === "black") {
          player.hand.push(judge);
          count += 1;
          this.log(`黑色判定入手，继续民调。`);
        } else {
          this.discard(judge);
          break;
        }
      }
    }
    if (this.hasSkill(player, "scheduleControl") && this.state.deck.length >= 3) {
      const peek = this.state.deck.slice(0, 3);
      peek.sort((a, b) => scoreCardForOwner(player, b.defId) - scoreCardForOwner(player, a.defId));
      this.state.deck.splice(0, 3, ...peek);
      this.log(`${player.name} 发动【排程控场】，整理牌堆顶3张。`);
    }
  }

  private resolveJudgments(player: PlayerState, onComplete?: () => void, pending = [...player.judgment].reverse(), startIndex = 0): boolean {
    if (startIndex === 0) player.judgment = [];
    for (let index = startIndex; index < pending.length; index += 1) {
      const delayed = pending[index];
      if (!player.alive) {
        this.discard(delayed);
        continue;
      }
      const nullifyResult = this.tryNullify(player, delayed, delayed.defId, [player], (cancelled) => {
        if (cancelled) this.resolveNullifiedDelayed(player, delayed);
        else this.resolveDelayedCard(player, delayed);
        const completed = this.resolveJudgments(player, onComplete, pending, index + 1);
        if (completed) onComplete?.();
        this.notify();
      });
      if (nullifyResult === "pending") return false;
      if (nullifyResult) this.resolveNullifiedDelayed(player, delayed);
      else this.resolveDelayedCard(player, delayed);
    }
    return true;
  }

  private resolveDelayedCard(player: PlayerState, delayed: CardInstance): void {
    if (delayed.defId === "investigation") this.resolveInvestigation(player, delayed);
    if (delayed.defId === "blackSwan") this.resolveBlackSwan(player, delayed);
  }

  private resolveNullifiedDelayed(player: PlayerState, delayed: CardInstance): void {
    this.log(`${player.name} 的【${CARD_DEFS[delayed.defId].name}】被【事实核查】抵消。`);
    this.flashAction({
      kind: "cancel",
      tone: "response",
      actorId: player.id,
      targetIds: [player.id],
      cardId: delayed.defId,
      cardName: CARD_DEFS[delayed.defId].name,
      message: `${CARD_DEFS[delayed.defId].name} 被抵消`,
      durationMs: 560,
    });
    if (delayed.defId === "blackSwan") {
      const next = this.nextAlivePlayer(player);
      if (next && !next.judgment.some((card) => card.defId === "blackSwan")) {
        next.judgment.push(delayed);
        this.log(`【黑天鹅】被抵消后转移给${next.name}。`);
        return;
      }
    }
    this.discard(delayed);
  }

  private resolveInvestigation(player: PlayerState, delayed: CardInstance): void {
    const judge = this.modifiedJudge(player, "investigation");
    const passed = judge.suit === "heart";
    this.log(`${player.name} 的【调查缠身】判定：${this.cardLabel(judge)}，${passed ? "通过" : "跳过出牌阶段"}。`);
    this.flashJudge(player, judge, "investigation", passed ? "通过" : "跳过出牌阶段");
    if (!passed) player.skippedPlayByJudgment = true;
    this.discard(judge, { animate: false });
    this.discard(delayed);
  }

  private resolveBlackSwan(player: PlayerState, delayed: CardInstance): void {
    const judge = this.modifiedJudge(player, "blackSwan");
    const rankOrder: Record<string, number> = { A: 1, J: 11, Q: 12, K: 13 };
    const numericRank = rankOrder[judge.rank] ?? Number(judge.rank);
    const hit = judge.suit === "spade" && numericRank >= 2 && numericRank <= 9;
    this.log(`${player.name} 的【黑天鹅】判定：${this.cardLabel(judge)}，${hit ? "爆发" : "未爆发"}。`);
    this.flashJudge(player, judge, "blackSwan", hit ? "爆发" : "未爆发");
    this.discard(judge, { animate: false });
    if (hit) {
      this.discard(delayed);
      this.damage(player, 3, undefined, delayed);
    } else {
      const next = this.nextAlivePlayer(player);
      if (next && !next.judgment.some((card) => card.defId === "blackSwan")) {
        next.judgment.push(delayed);
        this.log(`【黑天鹅】转移给${next.name}。`);
      } else {
        this.discard(delayed);
      }
    }
  }

  private modifiedJudge(player: PlayerState, reason: CardId): CardInstance {
    let judge = this.drawJudgeCard();
    const mayAlter =
      this.hasSkill(player, "alterJudgment") ||
      this.state.players.some((item) => item.alive && this.hasSkill(item, "alterJudgment") && item.hand.length > 0);
    if (!mayAlter) return judge;
    const controller = this.hasSkill(player, "alterJudgment")
      ? player
      : this.state.players.find((item) => item.alive && this.hasSkill(item, "alterJudgment") && item.hand.length > 0);
    if (!controller) return judge;
    const replacement = chooseJudgmentReplacement(controller, judge, reason);
    if (!replacement) return judge;
    this.removeFromHand(controller, replacement.uid);
    this.discard(judge);
    judge = replacement;
    this.log(`${controller.name} 发动【改判】，用${this.cardLabel(judge)}替换判定。`);
    return judge;
  }

  private flashJudge(player: PlayerState, judge: CardInstance, reason: CardId, result: string): void {
    this.flashAction({
      kind: "judge",
      tone: "skill",
      actorId: player.id,
      targetIds: [player.id],
      cardId: judge.defId,
      cardName: "判定",
      cardUid: judge.uid,
      durationMs: 820,
      message: `${player.name}【${CARD_DEFS[reason].name}】判定：${this.cardLabel(judge)}，${result}`,
    });
  }

  private drawPhase(player: PlayerState): void {
    if (this.hasSkill(player, "grabMic")) {
      this.drawCards(player, 1);
      const victims = this.enemiesOf(player).filter((item) => item.hand.length > 0).slice(0, 2);
      for (const victim of victims) {
        const taken = victim.hand.shift();
        if (taken) {
          player.hand.push(taken);
          this.afterLosingCards(victim);
          this.log(`${player.name} 发动【抢麦】，从${victim.name}拿走1张手牌。`);
        }
      }
      return;
    }
    let amount = 2;
    if (this.hasSkill(player, "hardball")) {
      amount -= 1;
      player.temporaryDamageBonus = 1;
      this.log(`${player.name} 发动【硬刚】，本回合伤害+1。`);
    }
    if (this.hasSkill(player, "keynote")) {
      amount += 1;
      this.log(`${player.name} 发动【发布会】，额外摸1张。`);
    }
    this.drawCards(player, Math.max(0, amount));
  }

  private performAiPlay(player: PlayerState): void {
    let guard = 0;
    while (player.alive && guard < 10 && !this.state.winner) {
      guard += 1;
      if (!this.performAiSingleAction(player)) break;
    }
  }

  private performAiSingleAction(player: PlayerState): boolean {
    if (!player.alive || this.state.winner) return false;
    if (this.useAiSkill(player)) return true;
    const playable = this.chooseAiCard(player);
    if (!playable) return false;
    this.playAiCard(player, playable.card, playable.targetIds);
    return true;
  }

  private useAiSkill(player: PlayerState): boolean {
    if (this.hasSkill(player, "contrarianBuy") && !player.flags.contrarianBuy && player.hp > 2) {
      player.hp -= 1;
      this.drawCards(player, 2);
      player.flags.contrarianBuy = true;
      this.log(`${player.name} 发动【逆势加仓】，失去1点支持率并摸2张。`);
      this.flashAction({ tone: "skill", actorId: player.id, cardName: "逆势加仓", message: `${player.name} 发动【逆势加仓】` });
      return true;
    }
    if (this.hasSkill(player, "iterate") && !player.flags.iterated && player.hand.length >= 4) {
      const weak = player.hand.filter((card) => ["wash", "factCheck"].includes(card.defId)).slice(0, 2);
      if (weak.length) {
        for (const card of weak) {
          this.removeFromHand(player, card.uid);
          this.discard(card);
        }
        this.drawCards(player, weak.length);
        player.flags.iterated = true;
        this.log(`${player.name} 发动【极限迭代】，弃${weak.length}张并摸${weak.length}张。`);
        this.flashAction({ tone: "skill", actorId: player.id, cardName: "极限迭代", message: `${player.name} 发动【极限迭代】` });
        return true;
      }
    }
    if (this.hasSkill(player, "reliefClinic") && !player.flags.reliefClinic) {
      const ally = this.alliesOf(player).find((item) => item.hp < item.maxHp);
      const redCard = player.hand.find((card) => isRedSuit(card.suit));
      if (ally && redCard) {
        this.removeFromHand(player, redCard.uid);
        this.discard(redCard);
        this.heal(ally, 1, player);
        player.flags.reliefClinic = true;
        this.log(`${player.name} 发动【独立配给】，${ally.name} 回复1点支持率。`);
        this.flashAction({ tone: "skill", actorId: player.id, targetIds: [ally.id], cardName: "独立配给", message: `${player.name} 发动【独立配给】` });
        return true;
      }
    }
    if (this.hasSkill(player, "coalitionAid") && !player.flags.coalitionAid && player.hand.length >= 4) {
      const ally = this.alliesOf(player).find((item) => item.id !== player.id);
      if (ally) {
        const sent = player.hand.splice(0, 2);
        ally.hand.push(...sent);
        this.heal(player, 1, player);
        player.flags.coalitionAid = true;
        this.log(`${player.name} 发动【联盟输血】，交给${ally.name}两张牌并回复1点支持率。`);
        this.flashAction({ tone: "skill", actorId: player.id, targetIds: [ally.id], cardName: "联盟输血", message: `${player.name} 发动【联盟输血】` });
        return true;
      }
    }
    return false;
  }

  private chooseAiCard(player: PlayerState): { card: CardInstance; targetIds: string[] } | undefined {
    const enemy = this.enemiesOf(player).find((item) => this.canTarget(player, item, "spray"));
    const selfWounded = player.hp < player.maxHp;
    const ordered = [...player.hand].sort((a, b) => scoreCardForOwner(player, b.defId) - scoreCardForOwner(player, a.defId));
    for (const card of ordered) {
      const effective = this.effectivePlayId(player, card);
      if (!this.isPlayable(player, card)) continue;
      if (effective === "vote" && selfWounded) return { card, targetIds: [player.id] };
      if (isEquipment(effective)) return { card, targetIds: [] };
      if (effective === "trendBoost") return { card, targetIds: [] };
      if (effective === "nationalUnity" && this.alliesOf(player).some((item) => item.hp < item.maxHp)) return { card, targetIds: [] };
      if (effective === "fundraiser" && player.hand.length < 3) return { card, targetIds: [] };
      if (effective === "spray" && enemy && this.canUseSlash(player)) return { card, targetIds: [enemy.id] };
      if (["debate", "expose", "poach", "investigation"].includes(effective)) {
        const target = this.enemiesOf(player).find((item) => this.canTarget(player, item, effective));
        if (target) return { card, targetIds: [target.id] };
      }
      if (effective === "borrowAccount") {
        const holder = this.enemiesOf(player).find((item) => this.canTarget(player, item, "borrowAccount"));
        const victim = holder ? this.borrowAccountVictims(holder).find((item) => this.isEnemy(holder, item) || this.isAlly(player, item)) : undefined;
        if (holder && victim) return { card, targetIds: [holder.id, victim.id] };
      }
      if (effective === "pileOn" || effective === "mockingLive") return { card, targetIds: [] };
      if (effective === "blackSwan" && !player.judgment.some((item) => item.defId === "blackSwan")) return { card, targetIds: [] };
    }
    return undefined;
  }

  private playAiCard(player: PlayerState, card: CardInstance, targetIds: string[]): void {
    this.state.selectedCardUid = card.uid;
    this.playCard(card.uid, targetIds);
  }

  private resolveZoneCardEffect(
    source: PlayerState,
    target: PlayerState,
    card: CardInstance,
    gain: boolean,
    onComplete?: () => void,
  ): boolean {
    if (!target) return true;
    const options = this.zoneChoiceOptions(target, true, true);
    if (!options.length) return true;
    const selected = this.aiChooseZoneCards(source, target, options, 1);
    const applyChoice = (selectedUids: string[]) => {
      const uid = selectedUids[0] ?? selected[0];
      const taken = this.removeZoneCardByUid(target, uid);
      if (!taken) return;
      if (gain) source.hand.push(taken);
      else this.discard(taken);
      this.log(`${source.name} ${gain ? "获得" : "弃置"}了${target.name}的${this.cardLabel(taken)}。`);
      this.flashAction({
        kind: gain ? "target" : "cancel",
        tone: "play",
        actorId: source.id,
        targetIds: [target.id],
        cardId: card.defId,
        cardName: CARD_DEFS[card.defId].name,
        cardUid: taken.uid,
        message: `${source.name}${gain ? "拿走" : "弃置"}${target.name}一张牌`,
        durationMs: 560,
      });
    };
    const result = this.requestChoice(
      source,
      {
        kind: "zoneCard",
        playerId: source.id,
        sourceId: source.id,
        targetId: target.id,
        cardId: card.defId,
        message: `请选择${target.name}的一张牌`,
        options,
        minCount: 1,
        maxCount: 1,
        canDecline: false,
        onConfirmLabel: gain ? "获得" : "弃置",
      },
      (_confirmed, selectedUids) => {
        applyChoice(selectedUids);
        onComplete?.();
      },
      selected,
    );
    if (result === "pending") return false;
    if (result.confirmed) applyChoice(result.selectedUids);
    return true;
  }

  private resolveTargetedTrick(
    source: PlayerState,
    card: CardInstance,
    effectiveId: CardId,
    targets: PlayerState[],
    applyEffect: (onDone?: () => void) => boolean,
    onComplete?: () => void,
  ): boolean {
    const finishAsync = () => {
      onComplete?.();
      this.notify();
    };
    const logCancelled = () => {
      const targetNames = targets.length ? targets.map((target) => target.name).join("、") : source.name;
      this.log(`【${CARD_DEFS[effectiveId].name}】对${targetNames}的效果被【事实核查】抵消。`);
      this.flashAction({
        kind: "cancel",
        tone: "response",
        actorId: source.id,
        targetIds: targets.map((target) => target.id),
        cardId: effectiveId,
        cardName: CARD_DEFS[effectiveId].name,
        message: `【${CARD_DEFS[effectiveId].name}】对${targetNames}无效`,
        durationMs: 520,
      });
    };
    const nullifyResult = this.tryNullify(source, card, effectiveId, targets, (cancelled) => {
      if (cancelled) {
        logCancelled();
        finishAsync();
        return;
      }
      const completed = applyEffect(finishAsync);
      if (completed) finishAsync();
    });
    if (nullifyResult === "pending") return false;
    if (nullifyResult) {
      logCancelled();
      return true;
    }
    return applyEffect(finishAsync);
  }

  private resolveDelayedPlacement(source: PlayerState, card: CardInstance, effectiveId: CardId, target: PlayerState, onComplete?: () => void): boolean {
    const finishAsync = (cancelled: boolean) => {
      if (cancelled) {
        this.log(`【${CARD_DEFS[effectiveId].name}】被【事实核查】抵消，未进入${target.name}的判定区。`);
        this.settleUsedCard(card);
      } else {
        this.placeDelayedCard(source, target, card, effectiveId);
      }
      onComplete?.();
      this.notify();
    };
    const nullifyResult = this.tryNullify(source, card, effectiveId, [target], finishAsync);
    if (nullifyResult === "pending") return false;
    if (nullifyResult) {
      this.log(`【${CARD_DEFS[effectiveId].name}】被【事实核查】抵消，未进入${target.name}的判定区。`);
      this.settleUsedCard(card);
      return true;
    }
    this.placeDelayedCard(source, target, card, effectiveId);
    return true;
  }

  private placeDelayedCard(source: PlayerState, target: PlayerState, card: CardInstance, effectiveId: CardId): void {
    target.judgment.push(card);
    this.log(`【${CARD_DEFS[effectiveId].name}】进入${target.name}的判定区。`);
    this.queueVisual({
      kind: "giveCards",
      actorId: source.id,
      targetIds: [target.id],
      cardUids: [card.uid],
      cardIds: [effectiveId],
      fromZone: "center",
      toZone: "judgment",
      text: `【${CARD_DEFS[effectiveId].name}】进入${target.name}判定区`,
      tone: "play",
      durationMs: 620,
      holdMs: 160,
    });
  }

  private resolveCard(source: PlayerState, card: CardInstance, effectiveId: CardId, targets: PlayerState[], onComplete?: () => void): boolean {
    switch (effectiveId) {
      case "spray":
        if (!this.resolveSpray(source, card, targets, () => {
          this.settleUsedCard(card);
          onComplete?.();
        })) {
          return false;
        }
        this.settleUsedCard(card);
        return true;
      case "vote":
        this.heal(source, this.voteHealAmount(source, source), source);
        this.settleUsedCard(card);
        break;
      case "expose":
        if (!this.resolveTargetedTrick(source, card, effectiveId, [targets[0]], (done) => this.resolveZoneCardEffect(source, targets[0], card, false, done), () => {
          this.settleUsedCard(card);
          onComplete?.();
        })) {
          return false;
        }
        this.settleUsedCard(card);
        break;
      case "poach":
        if (!this.resolveTargetedTrick(source, card, effectiveId, [targets[0]], (done) => this.resolveZoneCardEffect(source, targets[0], card, true, done), () => {
          this.settleUsedCard(card);
          onComplete?.();
        })) {
          return false;
        }
        this.settleUsedCard(card);
        break;
      case "trendBoost":
        if (!this.resolveTargetedTrick(source, card, effectiveId, [source], () => {
          this.drawCards(source, 2);
          return true;
        }, () => {
          this.settleUsedCard(card);
          onComplete?.();
        })) {
          return false;
        }
        this.settleUsedCard(card);
        break;
      case "pileOn":
        if (!this.resolveMassResponse(source, card, "spray", () => {
          this.settleUsedCard(card);
          onComplete?.();
        })) {
          return false;
        }
        this.settleUsedCard(card);
        break;
      case "mockingLive":
        if (!this.resolveMassResponse(source, card, "wash", () => {
          this.settleUsedCard(card);
          onComplete?.();
        })) {
          return false;
        }
        this.settleUsedCard(card);
        break;
      case "debate":
        if (!this.resolveTargetedTrick(source, card, effectiveId, [targets[0]], (done) => this.resolveDebate(source, targets[0], card, done), () => {
          this.settleUsedCard(card);
          onComplete?.();
        })) {
          return false;
        }
        this.settleUsedCard(card);
        break;
      case "borrowAccount":
        if (!this.resolveTargetedTrick(source, card, effectiveId, [targets[0]], (done) => this.resolveBorrowAccount(source, targets[0], targets[1], card, done), () => {
          this.settleUsedCard(card);
          onComplete?.();
        })) {
          return false;
        }
        this.settleUsedCard(card);
        break;
      case "fundraiser":
        if (!this.resolveFundraiser(source, card, () => {
          this.settleUsedCard(card);
          onComplete?.();
        })) {
          return false;
        }
        this.settleUsedCard(card);
        break;
      case "nationalUnity":
        if (!this.resolveNationalUnity(source, card, () => {
          this.settleUsedCard(card);
          onComplete?.();
        })) {
          return false;
        }
        this.settleUsedCard(card);
        break;
      case "investigation":
        if (!this.resolveDelayedPlacement(source, card, effectiveId, targets[0], onComplete)) {
          return false;
        }
        break;
      case "blackSwan":
        if (!this.resolveDelayedPlacement(source, card, effectiveId, source, onComplete)) {
          return false;
        }
        break;
      default:
        this.settleUsedCard(card);
    }
    return true;
  }

  private resolveSpray(source: PlayerState, card: CardInstance, targets: PlayerState[], onComplete?: () => void, startIndex = 0, countUse = true): boolean {
    if (startIndex === 0 && countUse) source.usedSlashThisTurn += 1;
    for (let index = startIndex; index < targets.length; index += 1) {
      const target = targets[index];
      if (!target.alive) continue;
      if (!this.resolveTwoTrackMessage(source, target, card, () => {
        const completed = this.resolveSpray(source, card, targets, onComplete, index, false);
        if (completed) {
          onComplete?.();
          this.notify();
        }
      })) {
        return false;
      }
      if (this.hasSkill(target, "emptyAgenda") && target.hand.length === 0) {
        this.log(`${target.name}【空议程】生效，不能成为【喷】目标。`);
        this.flashAction({
          kind: "cancel",
          tone: "response",
          actorId: target.id,
          targetIds: [target.id],
          cardId: card.defId,
          cardName: CARD_DEFS[card.defId].name,
          message: `${target.name}【空议程】避开【喷】`,
        });
        continue;
      }
      if (target.equipment.armor?.defId === "safeState" && suitColor(card.suit) === "black" && source.equipment.weapon?.defId !== "gotchaQuestion") {
        this.log(`${target.name} 的【铁票仓】挡下黑色【喷】。`);
        this.flashAction({
          kind: "cancel",
          tone: "response",
          actorId: target.id,
          targetIds: [target.id],
          cardId: "safeState",
          cardName: "铁票仓",
          message: `${target.name} 的【铁票仓】挡下【喷】`,
        });
        continue;
      }
      const required = this.hasSkill(source, "decisiveStrike") ? 2 : 1;
      const noDodge = this.hasSkill(source, "prosecutorFollowup") && isRedSuit(this.drawJudgeCardWithDiscard(`${source.name}【检察追问】判定`).suit);
      const dodged = noDodge
        ? false
        : this.requestResponse(target, "wash", required, {
            source,
            card,
            message: `${source.name} 对 ${target.name} 使用【喷】，请打出 ${required} 张【洗】`,
            successLabel: "洗掉这次攻击",
            failLabel: "不洗，承受命中",
            onResolved: (success) => {
              const resolved = this.resolveSprayOutcome(source, target, card, success, () => {
                const completed = this.resolveSpray(source, card, targets, onComplete, index + 1, false);
                if (completed) onComplete?.();
                this.notify();
              });
              if (resolved) {
                const completed = this.resolveSpray(source, card, targets, onComplete, index + 1, false);
                if (completed) {
                  onComplete?.();
                  this.notify();
                }
              }
            },
          });
      if (dodged === "pending") return false;
      if (dodged) {
        if (!this.resolveSprayOutcome(source, target, card, true, () => {
          const completed = this.resolveSpray(source, card, targets, onComplete, index + 1, false);
          if (completed) onComplete?.();
          this.notify();
        })) {
          return false;
        }
      } else {
        if (!this.resolveSprayOutcome(source, target, card, false, () => {
          const completed = this.resolveSpray(source, card, targets, onComplete, index + 1, false);
          if (completed) onComplete?.();
          this.notify();
        })) {
          return false;
        }
      }
    }
    return true;
  }

  private resolveTwoTrackMessage(source: PlayerState, target: PlayerState, card: CardInstance, onComplete: () => void): boolean {
    const key = `twoTrack:${card.uid}:${target.id}`;
    if (source.flags[key]) return true;
    if (source.equipment.weapon?.defId !== "twoTrackMessage") return true;
    if (this.character(source).gender === this.character(target).gender) return true;
    source.flags[key] = true;
    if (target.hand.length === 0) {
      this.drawCards(source, 1);
      this.log(`${target.name} 没有手牌，【双线话术】令${source.name}摸一张牌。`);
      return true;
    }
    const worst = chooseWorstCard(target);
    const applyDiscard = (selectedUids: string[]) => {
      const uid = selectedUids[0] ?? worst.uid;
      const discarded = this.removeFromHand(target, uid);
      if (discarded) {
        this.discard(discarded);
        this.log(`${target.name} 为【双线话术】弃置${this.cardLabel(discarded)}。`);
      } else {
        this.drawCards(source, 1);
      }
    };
    const result = this.requestChoice(
      target,
      {
        kind: "discardCost",
        playerId: target.id,
        sourceId: source.id,
        targetId: target.id,
        cardId: "twoTrackMessage",
        message: `${source.name} 的【双线话术】：弃一张手牌，或令${source.name}摸一张牌`,
        options: target.hand.map((item, index) => ({
          uid: item.uid,
          ownerId: target.id,
          zone: "hand" as const,
          cardId: item.defId,
          label: `手牌 ${index + 1}`,
        })),
        minCount: 1,
        maxCount: 1,
        canDecline: true,
        onConfirmLabel: "弃牌",
        onDeclineLabel: "让对方摸牌",
      },
      (confirmed, selectedUids) => {
        if (confirmed) applyDiscard(selectedUids);
        else this.drawCards(source, 1);
        onComplete();
      },
      [worst.uid],
    );
    if (result === "pending") return false;
    if (result.confirmed) applyDiscard(result.selectedUids);
    else this.drawCards(source, 1);
    return true;
  }

  private resolveSprayOutcome(source: PlayerState, target: PlayerState, card: CardInstance, dodged: boolean, onComplete?: () => void): boolean {
    if (dodged) {
      this.log(`${target.name} 打出足够【洗】，挡下【喷】。`);
      this.flashAction({
        kind: "cancel",
        tone: "response",
        actorId: target.id,
        targetIds: [target.id],
        cardId: "wash",
        cardName: "洗",
        message: `${target.name} 洗掉【喷】`,
        durationMs: 620,
      });
      return this.afterSprayDodged(source, target, onComplete);
    }

    const damageAmount = 1 + source.temporaryDamageBonus;
    this.log(`${target.name} 没能洗掉，被【喷】命中。`);
    this.flashAction({
      kind: "target",
      tone: "play",
      actorId: source.id,
      targetIds: [target.id],
      cardId: "spray",
      cardName: "喷",
      message: `【喷】命中 ${target.name}`,
      durationMs: 520,
    });
    if (source.equipment.weapon?.defId === "coldTreatment" && target.hand.length + Object.keys(target.equipment).length > 0) {
      const options = this.zoneChoiceOptions(target, true, false).filter((option) => option.zone !== "judgment");
      const selected = this.aiChooseZoneCards(source, target, options, Math.min(2, options.length));
      const applyCold = (confirmed: boolean, selectedUids: string[]): boolean => {
        if (confirmed && selectedUids.length) {
          for (const uid of selectedUids.slice(0, 2)) {
            const discarded = this.removeZoneCardByUid(target, uid);
            if (discarded) this.discard(discarded);
          }
          this.log(`${source.name} 发动【冷处理】，防止伤害并弃置${target.name}的牌。`);
        } else {
          this.damage(target, damageAmount, source, card);
          if (target.alive && target.hp > 0) return this.resolveCutTour(source, target, onComplete);
          return true;
        }
        return true;
      };
      const result = this.requestChoice(
        source,
        {
          kind: "zoneCard",
          playerId: source.id,
          sourceId: source.id,
          targetId: target.id,
          cardId: "coldTreatment",
          message: `是否发动【冷处理】，防止伤害并弃置${target.name}至多两张牌`,
          options,
          minCount: 1,
          maxCount: Math.min(2, options.length),
          canDecline: true,
          onConfirmLabel: "冷处理",
          onDeclineLabel: "造成伤害",
        },
        (confirmed, selectedUids) => {
          const completed = applyCold(confirmed, selectedUids);
          if (completed) onComplete?.();
        },
        selected,
      );
      if (result === "pending") return false;
      return applyCold(result.confirmed, result.selectedUids);
    }
    this.damage(target, damageAmount, source, card);
    if (target.alive && target.hp > 0) return this.resolveCutTour(source, target, onComplete);
    return true;
  }

  private resolveCutTour(source: PlayerState, target: PlayerState, onComplete?: () => void): boolean {
    if (source.equipment.weapon?.defId !== "cutTour") return true;
    const options = this.equipmentChoiceOptions(target, ["plusMount", "minusMount"]);
    if (!options.length) return true;
    const apply = (selectedUids: string[]) => {
      const discarded = this.removeZoneCardByUid(target, selectedUids[0] ?? options[0].uid);
      if (discarded) {
        this.discard(discarded);
        this.log(`${source.name} 发动【砍行程】，弃置${target.name}的坐骑。`);
      }
    };
    const result = this.requestChoice(
      source,
      {
        kind: "zoneCard",
        playerId: source.id,
        sourceId: source.id,
        targetId: target.id,
        cardId: "cutTour",
        message: `是否发动【砍行程】，弃置${target.name}的一张坐骑`,
        options,
        minCount: 1,
        maxCount: 1,
        canDecline: true,
        onConfirmLabel: "弃置坐骑",
        onDeclineLabel: "不发动",
      },
      (confirmed, selectedUids) => {
        if (confirmed) apply(selectedUids);
        onComplete?.();
        this.notify();
      },
      [options[0].uid],
    );
    if (result === "pending") return false;
    if (result.confirmed) apply(result.selectedUids);
    return true;
  }

  private afterSprayDodged(source: PlayerState, target: PlayerState, onComplete?: () => void): boolean {
    if (source.equipment.weapon?.defId === "followUpMic") {
      const followUp = source.hand.find((card) => this.effectivePlayId(source, card) === "spray");
      if (followUp) {
        const useFollowUp = (done?: () => void): boolean => {
          this.log(`${source.name} 发动【追问话筒】，继续追问${target.name}。`);
          this.removeFromHand(source, followUp.uid);
          if (!this.resolveSpray(source, followUp, [target], () => {
            this.discard(followUp);
            done?.();
            this.notify();
          }, 0, false)) {
            return false;
          }
          this.discard(followUp);
          return true;
        };
        const result = this.requestChoice(
          source,
          {
            kind: "skillConfirm",
            playerId: source.id,
            sourceId: source.id,
            targetId: target.id,
            cardId: "followUpMic",
            message: `是否发动【追问话筒】，再对${target.name}使用一张【喷】`,
            options: [{ uid: followUp.uid, ownerId: source.id, zone: "hand", cardId: followUp.defId, label: CARD_DEFS[followUp.defId].name }],
            minCount: 1,
            maxCount: 1,
            canDecline: true,
            onConfirmLabel: "追问",
            onDeclineLabel: "不追问",
          },
          (confirmed) => {
            if (confirmed) {
              const completed = useFollowUp(onComplete);
              if (completed) onComplete?.();
            } else {
              onComplete?.();
            }
            this.notify();
          },
          [followUp.uid],
        );
        if (result === "pending") return false;
        if (result.confirmed) return useFollowUp();
        return true;
      }
    }
    if (source.equipment.weapon?.defId === "moneyPush") {
      const options = this.zoneChoiceOptions(source, false, false).filter((option) => option.uid !== source.equipment.weapon?.uid);
      if (options.length >= 2) {
        const selected = this.aiChooseZoneCards(source, source, options, 2);
        const apply = (selectedUids: string[]) => {
          for (const uid of selectedUids.slice(0, 2)) {
            const discarded = this.removeZoneCardByUid(source, uid);
            if (discarded) this.discard(discarded);
          }
          this.log(`${source.name} 发动【砸钱硬推】，弃2张牌强行造成伤害。`);
          this.damage(target, 1 + source.temporaryDamageBonus, source, source.equipment.weapon);
        };
        const result = this.requestChoice(
          source,
          {
            kind: "discardCost",
            playerId: source.id,
            sourceId: source.id,
            targetId: target.id,
            cardId: "moneyPush",
            message: `是否发动【砸钱硬推】，弃两张牌令【喷】仍然命中${target.name}`,
            options,
            minCount: 2,
            maxCount: 2,
            canDecline: true,
            onConfirmLabel: "硬推",
            onDeclineLabel: "不发动",
          },
          (confirmed, selectedUids) => {
            if (confirmed) apply(selectedUids);
            onComplete?.();
            this.notify();
          },
          selected,
        );
        if (result === "pending") return false;
        if (result.confirmed) apply(result.selectedUids);
      }
    }
    return true;
  }

  private resolveMassResponse(
    source: PlayerState,
    card: CardInstance,
    response: CardId,
    onComplete?: () => void,
    startIndex = 0,
    targets = this.alivePlayersFrom(source, false),
  ): boolean {
    for (let index = startIndex; index < targets.length; index += 1) {
      const target = targets[index];
      if (target.id === source.id || !target.alive) continue;
      this.flashAction({
        kind: "target",
        tone: "play",
        actorId: source.id,
        targetIds: [target.id],
        cardId: card.defId,
        cardName: CARD_DEFS[card.defId].name,
        message: `【${CARD_DEFS[card.defId].name}】结算到 ${target.name}`,
        durationMs: 520,
      });
      const nullifyResult = this.tryNullify(source, card, card.defId, [target], (cancelled) => {
        if (cancelled) {
          this.log(`【${CARD_DEFS[card.defId].name}】对${target.name}的效果被【事实核查】抵消。`);
          const completed = this.resolveMassResponse(source, card, response, onComplete, index + 1, targets);
          if (completed) onComplete?.();
          this.notify();
          return;
        }
        const ok = this.requestResponse(target, response, 1, {
          source,
          card,
          message: `${source.name} 的【${CARD_DEFS[card.defId].name}】结算到 ${target.name}，请打出【${CARD_DEFS[response].name}】`,
          successLabel: "响应这次群体牌",
          failLabel: "不响应，承受效果",
          onResolved: (success) => {
            this.resolveMassResponseOutcome(source, target, card, response, success);
            const completed = this.resolveMassResponse(source, card, response, onComplete, index + 1, targets);
            if (completed) {
              onComplete?.();
              this.notify();
            }
          },
        });
        if (ok !== "pending") {
          this.resolveMassResponseOutcome(source, target, card, response, ok);
          const completed = this.resolveMassResponse(source, card, response, onComplete, index + 1, targets);
          if (completed) onComplete?.();
          this.notify();
        }
      });
      if (nullifyResult === "pending") return false;
      if (nullifyResult) {
        this.log(`【${CARD_DEFS[card.defId].name}】对${target.name}的效果被【事实核查】抵消。`);
        continue;
      }
      const ok = this.requestResponse(target, response, 1, {
        source,
        card,
        message: `${source.name} 的【${CARD_DEFS[card.defId].name}】结算到 ${target.name}，请打出【${CARD_DEFS[response].name}】`,
        successLabel: "响应这次群体牌",
        failLabel: "不响应，承受效果",
        onResolved: (success) => {
          this.resolveMassResponseOutcome(source, target, card, response, success);
          const completed = this.resolveMassResponse(source, card, response, onComplete, index + 1, targets);
          if (completed) {
            onComplete?.();
            this.notify();
          }
        },
      });
      if (ok === "pending") return false;
      this.resolveMassResponseOutcome(source, target, card, response, ok);
    }
    return true;
  }

  private resolveMassResponseOutcome(source: PlayerState, target: PlayerState, card: CardInstance, response: CardId, ok: boolean): void {
    if (!ok) {
      this.log(`${target.name} 没能响应【${CARD_DEFS[card.defId].name}】。`);
      this.damage(target, 1 + source.temporaryDamageBonus, source, card);
      return;
    }
    this.log(`${target.name} 响应了【${CARD_DEFS[card.defId].name}】。`);
    this.flashAction({
      kind: "cancel",
      tone: "response",
      actorId: target.id,
      targetIds: [target.id],
      cardId: response,
      cardName: CARD_DEFS[response].name,
      message: `${target.name} 打出【${CARD_DEFS[response].name}】响应【${CARD_DEFS[card.defId].name}】`,
      durationMs: 560,
    });
  }

  private resolveNationalUnity(source: PlayerState, card: CardInstance, onComplete?: () => void, targets = this.state.players.filter((player) => player.alive && player.hp < player.maxHp), index = 0): boolean {
    for (let cursor = index; cursor < targets.length; cursor += 1) {
      const target = targets[cursor];
      if (!target.alive || target.hp >= target.maxHp) continue;
      const nullifyResult = this.tryNullify(source, card, "nationalUnity", [target], (cancelled) => {
        if (!cancelled) this.heal(target, 1, source);
        else this.log(`【${CARD_DEFS.nationalUnity.name}】对${target.name}的效果被【事实核查】抵消。`);
        const completed = this.resolveNationalUnity(source, card, onComplete, targets, cursor + 1);
        if (completed) {
          onComplete?.();
          this.notify();
        }
      });
      if (nullifyResult === "pending") return false;
      if (!nullifyResult) this.heal(target, 1, source);
      else this.log(`【${CARD_DEFS.nationalUnity.name}】对${target.name}的效果被【事实核查】抵消。`);
    }
    return true;
  }

  private resolveDebate(source: PlayerState, target: PlayerState, card: CardInstance, onComplete?: () => void, turn = target, opponent = source, count = 0): boolean {
    if (!target) return true;
    if (count > 32) {
      this.log("【直播辩论】久辩不决，双方都没有受到伤害。");
      return true;
    }
    const ok = this.requestResponse(turn, "spray", 1, {
      source: opponent,
      card,
      message: `${turn.name} 需要在【直播辩论】中打出【喷】`,
      successLabel: "接上话",
      failLabel: "接不上话",
      onResolved: (success) => {
        if (!success) {
          this.log(`${turn.name} 在【直播辩论】中接不上话。`);
          this.damage(turn, 1 + opponent.temporaryDamageBonus, opponent, card);
          onComplete?.();
          this.notify();
          return;
        }
        const completed = this.resolveDebate(source, target, card, onComplete, opponent, turn, count + 1);
        if (completed) {
          onComplete?.();
          this.notify();
        }
      },
    });
    if (ok === "pending") return false;
    if (!ok) {
      this.log(`${turn.name} 在【直播辩论】中接不上话。`);
      this.damage(turn, 1 + opponent.temporaryDamageBonus, opponent, card);
      return true;
    }
    return this.resolveDebate(source, target, card, onComplete, opponent, turn, count + 1);
  }

  private resolveBorrowAccount(source: PlayerState, holder: PlayerState, victim: PlayerState, card: CardInstance, onComplete?: () => void): boolean {
    if (!holder?.equipment.weapon || !victim) return true;
    const sprays = holder.hand.filter((item) => this.effectivePlayId(holder, item) === "spray");
    const finish = () => {
      onComplete?.();
      this.notify();
    };
    const useSpray = (slash: CardInstance): boolean => {
      this.log(`${source.name} 借${holder.name}的号开火，目标是${victim.name}。`);
      this.removeFromHand(holder, slash.uid);
      if (!this.resolveSpray(holder, slash, [victim], () => {
        this.discard(slash);
        finish();
      })) {
        return false;
      }
      this.discard(slash);
      return true;
    };
    const giveWeapon = () => {
      const weapon = holder.equipment.weapon;
      if (!weapon) return;
      delete holder.equipment.weapon;
      source.hand.push(weapon);
      this.afterLosingEquipment(holder);
      this.log(`${holder.name} 没能开火，把武器交给${source.name}。`);
    };
    if (holder.isHuman && sprays.length) {
      const options = sprays.map((slash) => ({
        uid: slash.uid,
        ownerId: holder.id,
        zone: "hand" as const,
        cardId: slash.defId,
        label: CARD_DEFS[slash.defId].name,
      }));
      this.requestChoice(
        holder,
        {
          kind: "skillConfirm",
          playerId: holder.id,
          sourceId: source.id,
          targetId: victim.id,
          cardId: card.defId,
          message: `${source.name} 要借你的号开火：请选择一张【喷】攻击${victim.name}，或放弃交出武器`,
          options,
          minCount: 1,
          maxCount: 1,
          canDecline: true,
          onConfirmLabel: "开火",
          onDeclineLabel: "交出武器",
        },
        (confirmed, selectedUids) => {
          const slash = holder.hand.find((item) => item.uid === selectedUids[0]);
          if (confirmed && slash) {
            const completed = useSpray(slash);
            if (completed) finish();
          }
          else giveWeapon();
          if (!confirmed || !slash) finish();
        },
        [sprays[0].uid],
      );
      return false;
    }
    const slash = sprays[0];
    if (slash) return useSpray(slash);
    else giveWeapon();
    return true;
  }

  private resolveFundraiser(
    source: PlayerState,
    card: CardInstance,
    onComplete?: () => void,
    alive = this.alivePlayersFrom(source, true),
    revealed?: CardInstance[],
    index = 0,
  ): boolean {
    if (!revealed) {
      revealed = [];
      for (let i = 0; i < alive.length; i += 1) {
        const card = this.drawOne();
        if (card) revealed.push(card);
      }
      this.state.revealed = revealed;
      this.log(`【公开募资】亮出${revealed.map((card) => this.cardLabel(card)).join("、")}。`);
      this.queueVisual({
        kind: "gainCards",
        actorId: source.id,
        targetIds: alive.map((player) => player.id),
        cardUids: revealed.map((card) => card.uid),
        cardIds: revealed.map((card) => card.defId),
        fromZone: "deck",
        toZone: "revealed",
        text: `【公开募资】亮出${revealed.length}张牌`,
        tone: "play",
        durationMs: 720,
        holdMs: 300,
      });
    }
    if (index >= alive.length || revealed.length === 0) {
      revealed.forEach((card) => this.discard(card));
      this.state.revealed = [];
      return true;
    }
    const player = alive[index];
    const nullifyKey = `fundraiserNullify:${card.uid}:${player.id}`;
    if (!source.flags[nullifyKey]) {
      source.flags[nullifyKey] = true;
      const nullifyResult = this.tryNullify(source, card, "fundraiser", [player], (cancelled) => {
        if (cancelled) {
          this.log(`【${CARD_DEFS.fundraiser.name}】对${player.name}的选牌效果被【事实核查】抵消。`);
          const completed = this.resolveFundraiser(source, card, onComplete, alive, revealed, index + 1);
          if (completed) onComplete?.();
          this.notify();
          return;
        }
        const completedCurrent = this.resolveFundraiser(source, card, onComplete, alive, revealed, index);
        if (completedCurrent) onComplete?.();
        this.notify();
      });
      if (nullifyResult === "pending") return false;
      if (nullifyResult) {
        this.log(`【${CARD_DEFS.fundraiser.name}】对${player.name}的选牌效果被【事实核查】抵消。`);
        return this.resolveFundraiser(source, card, onComplete, alive, revealed, index + 1);
      }
    }
    const options = revealed.map((option) => ({
      uid: option.uid,
      zone: "revealed" as const,
      cardId: option.defId,
      label: CARD_DEFS[option.defId].name,
    }));
    const bestIndex = chooseBestRevealed(player, revealed);
    const applyPick = (selectedUids: string[]) => {
      const uid = selectedUids[0] ?? revealed?.[bestIndex]?.uid;
      const pickedIndex = revealed?.findIndex((item) => item.uid === uid) ?? -1;
      if (!revealed || pickedIndex < 0) return;
      const [picked] = revealed.splice(pickedIndex, 1);
      player.hand.push(picked);
      this.log(`${player.name} 获得${this.cardLabel(picked)}。`);
      this.queueVisual({
        kind: "gainCards",
        actorId: player.id,
        targetIds: [player.id],
        cardUids: [picked.uid],
        cardIds: [picked.defId],
        fromZone: "revealed",
        toZone: "hand",
        text: `${player.name} 获得【${CARD_DEFS[picked.defId].name}】`,
        tone: "play",
        durationMs: 560,
        holdMs: 120,
      });
      this.flashAction({
        kind: "target",
        tone: "play",
        actorId: player.id,
        cardId: picked.defId,
        cardName: CARD_DEFS[picked.defId].name,
        cardUid: picked.uid,
        message: `${player.name} 从【公开募资】拿走${CARD_DEFS[picked.defId].name}`,
        durationMs: 520,
      });
    };
    const result = this.requestChoice(
      player,
      {
        kind: "revealedCard",
        playerId: player.id,
        sourceId: source.id,
        cardId: "fundraiser",
        message: `${player.name} 从【公开募资】中选择一张牌`,
        options,
        minCount: 1,
        maxCount: 1,
        canDecline: false,
        onConfirmLabel: "获得",
      },
      (_confirmed, selectedUids) => {
        applyPick(selectedUids);
        const completed = this.resolveFundraiser(source, card, onComplete, alive, revealed, index + 1);
        if (completed) onComplete?.();
        this.notify();
      },
      [revealed[bestIndex]?.uid].filter(Boolean) as string[],
    );
    if (result === "pending") return false;
    if (result.confirmed) applyPick(result.selectedUids);
    return this.resolveFundraiser(source, card, onComplete, alive, revealed, index + 1);
  }

  private afterUsingCard(source: PlayerState, card: CardInstance, effectiveId: CardId): void {
    if (this.isTrickLike(effectiveId) && this.hasSkill(source, "issueIgnition")) {
      this.drawCards(source, 1);
      this.log(`${source.name} 发动【议题引爆】，摸1张牌。`);
    }
    if (source.equipment.weapon?.defId === "twoTrackMessage" && effectiveId === "spray") {
      // The target-specific choice is simplified in resolveSpray; this marker keeps the weapon visible in text state.
    }
    this.afterLosingCards(source);
    this.checkVictory();
  }

  private tryNullify(source: PlayerState, card: CardInstance, effectiveId: CardId, targets: PlayerState[], onComplete?: (cancelled: boolean) => void): ResponseResult {
    if (!this.isTrickLike(effectiveId) || effectiveId === "factCheck") return false;
    return this.resolveNullifyChain(source, card, effectiveId, targets, false, new Set(), 0, onComplete);
  }

  private resolveNullifyChain(
    source: PlayerState,
    card: CardInstance,
    effectiveId: CardId,
    targets: PlayerState[],
    cancelled: boolean,
    skipped: Set<string>,
    depth: number,
    onComplete?: (cancelled: boolean) => void,
  ): ResponseResult {
    if (depth >= MAX_NULLIFY_CHAIN) {
      this.log(`【事实核查】链达到上限，按当前${cancelled ? "已抵消" : "未抵消"}状态结算。`);
      return cancelled;
    }
    const actor = this.findNullifyActor(source, targets, cancelled, skipped);
    if (!actor) return cancelled;
    const chainSide = cancelled ? "restore" : "cancel";
    const actionLabel = cancelled ? "反抵消" : "抵消";

    if (actor.isHuman) {
      const message = cancelled
        ? `【${CARD_DEFS[effectiveId].name}】已被抵消，是否打出【事实核查】反抵消？`
        : depth > 0
          ? `【${CARD_DEFS[effectiveId].name}】反抵消后继续生效，是否再次打出【事实核查】抵消？`
          : `${source.name} 使用【${CARD_DEFS[effectiveId].name}】，是否打出【事实核查】抵消？`;
      return this.requestResponse(actor, "factCheck", 1, {
        source,
        card,
        message,
        successLabel: actionLabel,
        failLabel: "不响应",
        onResolved: (success) => {
          if (success) {
            const nextCancelled = !cancelled;
            this.recordNullifyAction(actor, effectiveId, nextCancelled);
            const result = this.resolveNullifyChain(source, card, effectiveId, targets, nextCancelled, new Set(), depth + 1, onComplete);
            if (result !== "pending") onComplete?.(result);
            return;
          }
          const nextSkipped = new Set(skipped);
          nextSkipped.add(`${actor.id}:${chainSide}`);
          const result = this.resolveNullifyChain(source, card, effectiveId, targets, cancelled, nextSkipped, depth, onComplete);
          if (result !== "pending") onComplete?.(result);
        },
      });
    }

    const ok = this.consumeResponse(actor, "factCheck", 1);
    if (!ok) {
      const nextSkipped = new Set(skipped);
      nextSkipped.add(`${actor.id}:${chainSide}`);
      return this.resolveNullifyChain(source, card, effectiveId, targets, cancelled, nextSkipped, depth, onComplete);
    }
    const nextCancelled = !cancelled;
    this.recordNullifyAction(actor, effectiveId, nextCancelled);
    return this.resolveNullifyChain(source, card, effectiveId, targets, nextCancelled, new Set(), depth + 1, onComplete);
  }

  private findNullifyActor(source: PlayerState, targets: PlayerState[], cancelled: boolean, skipped: Set<string>): PlayerState | undefined {
    const participants = this.alivePlayersFrom(source, true);
    const chainSide = cancelled ? "restore" : "cancel";
    return participants.find((player) => {
      if (skipped.has(`${player.id}:${chainSide}`)) return false;
      if (!this.findResponseCard(player, "factCheck")) return false;
      const hostileToSource = this.isEnemy(player, source);
      const protectsTarget = targets.some((target) => this.isAlly(player, target));
      return cancelled ? this.isAlly(player, source) : hostileToSource || protectsTarget;
    });
  }

  private recordNullifyAction(actor: PlayerState, effectiveId: CardId, cancelled: boolean): void {
    this.log(`${actor.name} 打出【事实核查】，${cancelled ? "抵消" : "反抵消"}【${CARD_DEFS[effectiveId].name}】。`);
    this.flashAction({
      kind: "cancel",
      tone: "response",
      actorId: actor.id,
      cardId: "factCheck",
      cardName: "事实核查",
      message: `${actor.name} ${cancelled ? "抵消" : "反抵消"}【${CARD_DEFS[effectiveId].name}】`,
      durationMs: 560,
    });
  }

  private requestResponse(
    player: PlayerState,
    desired: CardId,
    requiredCount: number,
    context: {
      source?: PlayerState;
      card?: CardInstance;
      message: string;
      successLabel: string;
      failLabel: string;
      responseKind?: PendingResponseKind;
      onResolved: (success: boolean) => void;
    },
    timing: InteractionTiming = "afterPresentation",
  ): ResponseResult {
    if (!player.isHuman) return this.consumeResponse(player, desired, requiredCount, context.source);

    if (desired === "spray" && !this.findResponseCard(player, "spray") && player.equipment.weapon?.defId === "draftScramble" && player.hand.length >= 2) {
      const options = player.hand.map((item) => ({
        uid: item.uid,
        ownerId: player.id,
        zone: "hand" as const,
        cardId: item.defId,
        label: CARD_DEFS[item.defId].name,
      }));
      const selected = [...player.hand]
        .sort((a, b) => scoreCardForOwner(player, a.defId) - scoreCardForOwner(player, b.defId))
        .slice(0, 2)
        .map((item) => item.uid);
      const result = this.requestChoice(
        player,
        {
          kind: "discardCost",
          playerId: player.id,
          sourceId: context.source?.id,
          cardId: "draftScramble",
          message: `${player.name} 可发动【临场拼稿】，选择两张手牌当【喷】打出`,
          options,
          minCount: 2,
          maxCount: 2,
          canDecline: true,
          onConfirmLabel: "当【喷】打出",
          onDeclineLabel: "不响应",
        },
        (confirmed, selectedUids) => {
          if (confirmed) {
            for (const uid of selectedUids.slice(0, 2)) {
              const discarded = this.removeFromHand(player, uid);
              if (discarded) this.discard(discarded);
            }
            this.log(`${player.name} 发动【临场拼稿】，将两张手牌当【喷】打出。`);
            this.flashAction({
              kind: "respondCard",
              tone: "response",
              actorId: player.id,
              cardId: "spray",
              cardName: "喷",
              message: `${player.name} 以【临场拼稿】打出【喷】`,
              durationMs: 560,
            });
          }
          context.onResolved(confirmed);
        },
        selected,
      );
      if (result === "pending") return "pending";
      return result.confirmed;
    }

    const pending: PendingResponse = {
      id: `pending-${this.actionSerial + 1}`,
      kind: context.responseKind ?? (desired === "wash" ? "wash" : desired === "spray" ? "spray" : desired === "vote" ? "vote" : "factCheck"),
      playerId: player.id,
      sourceId: context.source?.id,
      cardId: desired,
      card: context.card,
      allowedCardIds: this.responseAllowedCardIds(player, desired),
      message: context.message,
      requiredCount,
      providedCount: 0,
      canDecline: true,
      onSuccessLabel: context.successLabel,
      onFailLabel: context.failLabel,
    };
    const activate = () => {
      this.state.pending = pending;
      this.pendingResolver = context.onResolved;
      this.pendingDesired = desired;
      this.state.prompt = context.message;
      this.focusActionNow();
      this.flashAction({
        kind: "respondPrompt",
        tone: "response",
        actorId: context.source?.id,
        targetIds: [player.id],
        cardId: desired,
        cardName: CARD_DEFS[desired].name,
        message: context.message,
        durationMs: 520,
      });
    };
    if (this.shouldDeferHumanWindow(timing)) {
      this.deferredHumanWindow = {
        kind: "response",
        playerId: player.id,
        sourceId: context.source?.id,
        cardId: desired,
        message: context.message,
        activate,
      };
      return "pending";
    }
    activate();
    return "pending";
  }

  private focusActionNow(): void {
    this.state.currentAction = undefined;
    this.state.actionQueue = [];
    this.state.actionClockMs = 0;
  }

  private consumeResponse(player: PlayerState, desired: CardId, requiredCount: number, source?: PlayerState): boolean {
    let provided = 0;
    while (provided < requiredCount) {
      if (desired === "wash" && player.equipment.armor?.defId === "prTeam" && source?.equipment.weapon?.defId !== "gotchaQuestion") {
        const judge = this.drawJudgeCardWithDiscard(`${player.name}【公关团队】判定`);
        if (isRedSuit(judge.suit)) {
          provided += 1;
          this.log(`${player.name} 的【公关团队】视为打出【洗】。`);
          continue;
        }
      }
      const card = this.findResponseCard(player, desired);
      if (!card) {
        if (desired === "spray" && player.equipment.weapon?.defId === "draftScramble" && player.hand.length >= 2) {
          const discarded = [...player.hand]
            .sort((a, b) => scoreCardForOwner(player, a.defId) - scoreCardForOwner(player, b.defId))
            .slice(0, 2);
          for (const item of discarded) {
            this.removeFromHand(player, item.uid);
            this.discard(item);
          }
          this.log(`${player.name} 发动【临场拼稿】，将两张手牌当【喷】打出。`);
          this.flashAction({
            tone: "response",
            actorId: player.id,
            cardId: "spray",
            cardName: "喷",
            message: `${player.name} 以【临场拼稿】打出【喷】`,
          });
          provided += 1;
          continue;
        }
        break;
      }
      const actualDef = CARD_DEFS[card.defId];
      this.removeFromHand(player, card.uid);
      this.discard(card, { animate: false });
      if (card.defId !== desired) {
        this.log(`${player.name} 将【${actualDef.name}】当作【${CARD_DEFS[desired].name}】打出。`);
      } else {
        this.log(`${player.name} 打出【${actualDef.name}】。`);
      }
      this.flashAction({
        tone: "response",
        actorId: player.id,
        cardId: desired,
        cardName: CARD_DEFS[desired].name,
        cardUid: card.uid,
        message: `${player.name} 打出【${CARD_DEFS[desired].name}】响应`,
      });
      provided += 1;
    }
    return provided >= requiredCount;
  }

  private findResponseCard(player: PlayerState, desired: CardId): CardInstance | undefined {
    return player.hand.find((card) => this.canTreatAs(player, card, desired));
  }

  private canTreatAs(player: PlayerState, card: CardInstance, desired: CardId): boolean {
    if (card.defId === desired) return true;
    if (desired === "wash" && this.hasSkill(player, "switchMode") && card.defId === "spray") return true;
    if (desired === "wash" && this.hasSkill(player, "pollChain") && suitColor(card.suit) === "black") return true;
    if (desired === "spray" && this.hasSkill(player, "switchMode") && card.defId === "wash") return true;
    if (desired === "spray" && this.hasSkill(player, "orthodoxNarrative") && isRedSuit(card.suit)) return true;
    if (desired === "vote" && this.hasSkill(player, "foundingAid") && isRedSuit(card.suit)) return true;
    return false;
  }

  private responseAllowedCardIds(player: PlayerState, desired: CardId): CardId[] {
    const ids = new Set<CardId>();
    for (const card of player.hand) {
      if (this.canTreatAs(player, card, desired)) ids.add(card.defId);
    }
    if (ids.size === 0) ids.add(desired);
    return [...ids];
  }

  private responseDesiredCard(pending: PendingResponse): CardId {
    if (pending.kind === "dyingSave") return "vote";
    return pending.cardId ?? this.pendingDesired ?? "wash";
  }

  private clearPendingResponse(): void {
    this.state.pending = undefined;
    this.pendingResolver = undefined;
    this.pendingDesired = undefined;
    this.state.selectedCardUid = undefined;
    this.state.selectedTargetIds = [];
    if (!this.state.winner) this.state.prompt = "继续牌局";
  }

  private requestChoice(
    player: PlayerState,
    choice: Omit<PendingChoice, "id" | "selectedCardUids">,
    onResolved: ChoiceResolver,
    aiSelectedUids: string[] = [],
    timing: InteractionTiming = "afterPresentation",
  ): ChoiceResult {
    if (!player.isHuman) {
      const selected = aiSelectedUids.slice(0, choice.maxCount);
      return { confirmed: selected.length >= choice.minCount, selectedUids: selected };
    }

    const pending: PendingChoice = {
      ...choice,
      id: `choice-${this.actionSerial + 1}`,
      selectedCardUids: [],
    };
    const activate = () => {
      this.state.pendingChoice = pending;
      this.pendingChoiceResolver = onResolved;
      this.state.selectedCardUid = undefined;
      this.state.selectedTargetIds = [];
      this.state.prompt = this.choicePrompt(pending);
      this.focusActionNow();
      this.flashAction({
        kind: "respondPrompt",
        tone: "skill",
        actorId: choice.sourceId ?? player.id,
        targetIds: choice.targetId ? [choice.targetId] : [player.id],
        cardId: choice.cardId,
        cardName: choice.cardId ? CARD_DEFS[choice.cardId].name : "选择",
        message: choice.message,
        durationMs: 520,
      });
    };
    if (this.shouldDeferHumanWindow(timing)) {
      this.deferredHumanWindow = {
        kind: "choice",
        playerId: player.id,
        sourceId: choice.sourceId,
        cardId: choice.cardId,
        message: choice.message,
        activate,
      };
      return "pending";
    }
    activate();
    return "pending";
  }

  private choicePrompt(pending: PendingChoice): string {
    const count = pending.selectedCardUids.length;
    if (pending.options.length === 0) return pending.message;
    if (count < pending.minCount) return `${pending.message}（已选 ${count}/${pending.minCount}）`;
    return `${pending.message}（已选 ${count}，可确认）`;
  }

  private clearPendingChoice(): void {
    this.state.pendingChoice = undefined;
    this.pendingChoiceResolver = undefined;
    this.state.selectedCardUid = undefined;
    this.state.selectedTargetIds = [];
    if (!this.state.winner) this.state.prompt = "继续牌局";
  }

  private draftScrambleExtraCost(player: PlayerState, card: CardInstance, effectiveId: CardId): CardInstance[] {
    if (!this.isDraftScrambleViewAs(player, card, effectiveId)) return [];
    const selected = this.draftScrambleSelectedUids(player, card.uid);
    if (selected.length >= 2) {
      const extra = player.hand.find((item) => item.uid === selected[1]);
      return extra ? [extra] : [];
    }
    if (player.isHuman) return [];
    const extra = player.hand
      .filter((item) => item.uid !== card.uid)
      .sort((a, b) => scoreCardForOwner(player, a.defId) - scoreCardForOwner(player, b.defId))[0];
    return extra ? [extra] : [];
  }

  private effectivePlayId(player: PlayerState, card: CardInstance): CardId {
    if (card.defId === "wash" && this.hasSkill(player, "switchMode")) return "spray";
    if (this.draftScrambleSelectedUids(player, card.uid).length >= 2) return "spray";
    if (card.defId !== "spray" && this.hasSkill(player, "orthodoxNarrative") && isRedSuit(card.suit)) return "spray";
    if (
      !player.isHuman &&
      player.equipment.weapon?.defId === "draftScramble" &&
      card.defId !== "spray" &&
      !player.hand.some((item) => item.defId === "spray") &&
      player.hand.length >= 2
    ) {
      return "spray";
    }
    if (card.defId !== "expose" && this.hasSkill(player, "logisticsDismantle") && suitColor(card.suit) === "black") return "expose";
    if (card.defId !== "investigation" && this.hasSkill(player, "systemUpdate") && card.suit === "diamond") return "investigation";
    if (card.defId !== "vote" && this.hasSkill(player, "foundingAid") && isRedSuit(card.suit)) return "vote";
    return card.defId;
  }

  private isDraftScrambleViewAs(player: PlayerState, card: CardInstance, effectiveId: CardId): boolean {
    if (effectiveId !== "spray" || card.defId === "spray" || player.equipment.weapon?.defId !== "draftScramble") return false;
    if (this.draftScrambleSelectedUids(player, card.uid).length >= 2) return true;
    if (this.isNonDraftSprayViewAs(player, card)) return false;
    return !player.isHuman && !player.hand.some((item) => item.defId === "spray") && player.hand.length >= 2;
  }

  private isNonDraftSprayViewAs(player: PlayerState, card: CardInstance): boolean {
    if (card.defId === "wash" && this.hasSkill(player, "switchMode")) return true;
    return card.defId !== "spray" && this.hasSkill(player, "orthodoxNarrative") && isRedSuit(card.suit);
  }

  private draftScrambleSelectedUids(player: PlayerState, primaryUid: string): string[] {
    const value = player.flags[`draftScrambleUse:${primaryUid}`];
    return typeof value === "string" ? value.split(",").filter(Boolean) : [];
  }

  private setDraftScrambleUse(player: PlayerState, selectedUids: string[]): void {
    this.clearDraftScrambleUse(player);
    const selected = selectedUids.slice(0, 2);
    if (selected.length < 2) return;
    player.flags[`draftScrambleUse:${selected[0]}`] = selected.join(",");
  }

  private clearDraftScrambleUse(player: PlayerState): void {
    for (const key of Object.keys(player.flags)) {
      if (key.startsWith("draftScrambleUse:")) delete player.flags[key];
    }
  }

  private isPlayable(player: PlayerState, card: CardInstance): boolean {
    const effective = this.effectivePlayId(player, card);
    if (effective === "wash" || effective === "factCheck") return false;
    if (effective === "spray") return this.canUseSlash(player) && this.legalTargets(player.id, card, effective).length > 0;
    if (effective === "vote") return player.hp < player.maxHp;
    if (effective === "poach" || effective === "expose" || effective === "debate" || effective === "investigation" || effective === "borrowAccount") {
      return this.legalTargets(player.id, card, effective).length > 0;
    }
    if (effective === "blackSwan") return !player.judgment.some((item) => item.defId === "blackSwan");
    return true;
  }

  legalTargets(sourceId: string, card: CardInstance, effectiveId = card.defId): PlayerState[] {
    const source = this.player(sourceId);
    if (!source) return [];
    return this.state.players.filter((target) => this.canTarget(source, target, effectiveId));
  }

  private selectableTargetsForCard(source: PlayerState, card: CardInstance, effectiveId: CardId): PlayerState[] {
    if (effectiveId === "borrowAccount") {
      const selectedHolder = this.state.selectedTargetIds[0] ? this.player(this.state.selectedTargetIds[0]) : undefined;
      if (!selectedHolder) {
        return this.state.players.filter((target) => this.canTarget(source, target, "borrowAccount"));
      }
      if (this.state.selectedTargetIds.length >= 2) return [];
      return this.borrowAccountVictims(selectedHolder);
    }
    const legal = this.legalTargets(source.id, card, effectiveId);
    if (effectiveId === "spray" && this.targetCountRange(source, card, effectiveId)[1] > 1) {
      return legal.filter((target) => !this.state.selectedTargetIds.includes(target.id));
    }
    return legal;
  }

  private targetCountRange(source: PlayerState, card: CardInstance, effectiveId: CardId): [number, number] {
    if (!requiresTarget(effectiveId)) return [0, 0];
    if (effectiveId === "borrowAccount") return [2, 2];
    if (effectiveId === "spray") return [1, this.sprayMaxTargets(source, card)];
    return [1, 1];
  }

  private sprayMaxTargets(source: PlayerState, card: CardInstance): number {
    if (source.equipment.weapon?.defId === "tripleBroadcast" && source.hand.length === 1 && source.hand[0]?.uid === card.uid) return 3;
    return 1;
  }

  private validateTargetList(source: PlayerState, card: CardInstance, effectiveId: CardId, targets: PlayerState[]): boolean {
    if (!requiresTarget(effectiveId)) return targets.length === 0;
    if (effectiveId === "borrowAccount") {
      const [holder, victim] = targets;
      return Boolean(holder && victim && this.canTarget(source, holder, "borrowAccount") && this.borrowAccountVictims(holder).includes(victim));
    }
    const legal = this.legalTargets(source.id, card, effectiveId);
    return targets.every((target) => legal.includes(target));
  }

  private borrowAccountVictims(holder: PlayerState): PlayerState[] {
    return this.state.players.filter((target) => {
      if (!target.alive || target.id === holder.id) return false;
      return this.distanceBetween(holder, target) <= this.attackRange(holder);
    });
  }

  private canTarget(source: PlayerState, target: PlayerState, effectiveId: CardId): boolean {
    if (!source.alive || !target.alive) return false;
    if (effectiveId === "vote") return target.id === source.id && target.hp < target.maxHp;
    if (effectiveId === "expose") return this.zoneCardCount(target) > 0;
    if (target.id === source.id) return effectiveId === "blackSwan";
    if (this.hasSkill(target, "trustBarrier") && (effectiveId === "poach" || effectiveId === "investigation")) return false;
    if (this.hasSkill(target, "emptyAgenda") && target.hand.length === 0 && (effectiveId === "spray" || effectiveId === "debate")) return false;
    if (effectiveId === "spray") return this.distanceBetween(source, target) <= this.attackRange(source);
    if (effectiveId === "poach") return this.hasSkill(source, "mediaGenius") || this.distanceBetween(source, target) <= 1;
    if (effectiveId === "investigation") return !target.judgment.some((card) => card.defId === "investigation");
    if (effectiveId === "borrowAccount") return Boolean(target.equipment.weapon && this.borrowAccountVictims(target).length);
    if (effectiveId === "debate") return true;
    return false;
  }

  private canUseSlash(player: PlayerState): boolean {
    if (this.hasSkill(player, "rapidFire")) return true;
    if (player.equipment.weapon?.defId === "repeatMic") return true;
    return player.usedSlashThisTurn < 1;
  }

  private drawCards(player: PlayerState, amount: number, silent = false): void {
    const drawn: CardInstance[] = [];
    for (let i = 0; i < amount; i += 1) {
      const card = this.drawOne();
      if (!card) break;
      player.hand.push(card);
      drawn.push(card);
    }
    if (!silent && amount > 0) this.log(`${player.name} 摸${drawn.length}张牌。`);
    if (!silent && drawn.length > 0) {
      this.queueVisual({
        kind: "drawCards",
        actorId: player.id,
        targetIds: [player.id],
        cardUids: player.isHuman ? drawn.map((card) => card.uid) : undefined,
        cardIds: player.isHuman ? drawn.map((card) => card.defId) : undefined,
        fromZone: "deck",
        toZone: "hand",
        text: `${player.name} 摸${drawn.length}张牌`,
        tone: "system",
        durationMs: 620,
        holdMs: 120,
        hidden: !player.isHuman,
      });
    }
  }

  private drawOne(): CardInstance | undefined {
    if (this.state.deck.length === 0) this.reshuffleDiscard();
    const card = this.state.deck.shift();
    if (!card) {
      this.endInDraw();
      return undefined;
    }
    return card;
  }

  private drawJudgeCard(): CardInstance {
    const card = this.drawOne();
    if (!card) {
      const fallback = {
        ...CARD_BLUEPRINTS[0],
        uid: `fallback-${Date.now()}`,
      };
      return fallback;
    }
    return card;
  }

  private drawJudgeCardWithDiscard(prefix: string): CardInstance {
    const judge = this.drawJudgeCard();
    this.log(`${prefix}：${this.cardLabel(judge)}。`);
    this.discard(judge);
    return judge;
  }

  private reshuffleDiscard(): void {
    if (this.state.discard.length === 0) return;
    this.log("牌堆耗尽，弃牌堆洗回牌堆。");
    this.state.deck = this.shuffle(this.state.discard.splice(0));
  }

  private endInDraw(): void {
    if (this.state.winner) return;
    this.state.winner = "draw";
    this.state.phase = "gameover";
    this.state.winText = "牌堆与弃牌堆都不足，判定为平局。";
    this.log(this.state.winText);
  }

  private equipCard(player: PlayerState, card: CardInstance): void {
    const def = getCardDef(card);
    const slot = def.equipment?.slot;
    if (!slot) return;
    const old = player.equipment[slot];
    if (old) {
      this.discard(old);
      this.afterLosingEquipment(player);
      this.log(`${player.name} 替换装备，旧【${CARD_DEFS[old.defId].name}】进入弃牌堆。`);
    }
    player.equipment[slot] = card;
    this.log(`${player.name} 装备【${def.name}】。`);
    this.queueVisual({
      kind: "equipCard",
      actorId: player.id,
      targetIds: [player.id],
      cardUids: [card.uid],
      cardIds: [card.defId],
      fromZone: "center",
      toZone: "equipment",
      text: `${player.name} 装备【${def.name}】`,
      tone: "skill",
      durationMs: 620,
      holdMs: 160,
    });
  }

  private handleDiscard(player: PlayerState): void {
    if (!player.alive) return;
    if (this.hasSkill(player, "dataHoard") && player.usedSlashThisTurn === 0) {
      this.log(`${player.name}【数据囤积】生效，弃牌阶段不用弃牌。`);
      return;
    }
    const limit = Math.max(0, player.hp);
    while (player.hand.length > limit) {
      const card = chooseWorstCard(player);
      this.removeFromHand(player, card.uid);
      this.discard(card);
      this.log(`${player.name} 弃置${this.cardLabel(card)}。`);
    }
  }

  private startHumanDiscard(player: PlayerState): boolean {
    if (!player.alive) return false;
    if (this.hasSkill(player, "dataHoard") && player.usedSlashThisTurn === 0) {
      this.log(`${player.name}【数据囤积】生效，弃牌阶段不用弃牌。`);
      return false;
    }
    const limit = Math.max(0, player.hp);
    const requiredCount = Math.max(0, player.hand.length - limit);
    if (requiredCount <= 0) return false;
    const pending: PendingDiscard = {
      playerId: player.id,
      requiredCount,
      selectedCardUids: [],
      message: "",
    };
    pending.message = this.discardPrompt(pending);
    this.state.pendingDiscard = pending;
    this.state.selectedCardUid = undefined;
    this.state.selectedTargetIds = [];
    this.state.prompt = pending.message;
    this.focusActionNow();
    this.flashAction({
      kind: "phase",
      tone: "turn",
      actorId: player.id,
      cardName: "弃牌",
      message: pending.message,
      durationMs: 520,
    });
    return true;
  }

  private discardPrompt(pending: PendingDiscard): string {
    const remaining = pending.requiredCount - pending.selectedCardUids.length;
    return remaining > 0 ? `弃牌阶段：请再选择 ${remaining} 张手牌` : `已选择 ${pending.requiredCount} 张，点击确定弃牌`;
  }

  private heal(target: PlayerState, amount: number, source?: PlayerState): void {
    if (!target.alive) return;
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    if (target.hp > before) {
      const healed = target.hp - before;
      this.flashAction({
        tone: "heal",
        actorId: source?.id ?? target.id,
        targetIds: [target.id],
        cardName: "回复",
        message: `${source?.name ?? target.name} 让${target.name} 回复${healed}点支持率`,
        hpChange: { targetId: target.id, before, after: target.hp },
      });
      this.log(`${source?.name ?? target.name} 让${target.name} 回复${healed}点支持率。`);
    }
  }

  private damage(target: PlayerState, amount: number, source?: PlayerState, card?: CardInstance): void {
    if (!target.alive || this.state.winner) return;
    const before = target.hp;
    target.hp -= amount;
    this.flashAction({
      tone: "damage",
      actorId: source?.id,
      targetIds: [target.id],
      cardId: card?.defId,
      cardName: card ? CARD_DEFS[card.defId].name : "伤害",
      message: `${target.name} 失去${amount}点支持率`,
      hpChange: { targetId: target.id, before, after: target.hp },
    });
    this.log(`${target.name} 失去${amount}点支持率，剩余${Math.max(0, target.hp)}。`);
    this.afterDamaged(target, source, card, amount);
    if (target.hp <= 0) this.resolveDying(target, source);
  }

  private afterDamaged(target: PlayerState, source?: PlayerState, card?: CardInstance, amount = 1): void {
    if (source && this.hasSkill(target, "trafficRecovery") && card) {
      const inDiscardIndex = this.state.discard.findIndex((item) => item.uid === card.uid);
      if (inDiscardIndex >= 0) target.hand.push(...this.state.discard.splice(inDiscardIndex, 1));
      else target.hand.push(card);
      this.recoveredCardUids.add(card.uid);
      this.log(`${target.name} 发动【流量回收】，获得造成伤害的牌。`);
    }
    if (source && this.hasSkill(target, "procedureFeedback")) {
      const taken = source.hand.shift();
      if (taken) {
        target.hand.push(taken);
        this.afterLosingCards(source);
        this.log(`${target.name} 发动【程序反馈】，获得${source.name}一张牌。`);
      }
    }
    if (source && this.hasSkill(target, "hardCounter")) {
      const judge = this.drawJudgeCardWithDiscard(`${target.name}【强硬回击】判定`);
      if (judge.suit !== "heart") {
        if (source.hand.length >= 2) {
          for (let i = 0; i < 2; i += 1) {
            const lost = source.hand.shift();
            if (lost) this.discard(lost);
          }
          this.afterLosingCards(source);
          this.log(`${source.name} 弃置2张牌应对【强硬回击】。`);
        } else {
          this.damage(source, 1, target);
        }
      }
    }
    if (this.hasSkill(target, "crisisPr")) {
      this.drawCards(target, 2 * amount);
      this.log(`${target.name} 发动【危机公关】，摸${2 * amount}张牌。`);
    }
  }

  private resolveDying(target: PlayerState, source?: PlayerState, skipHuman = false): void {
    if (!target.alive || this.state.winner || target.hp > 0) return;
    this.log(`${target.name} 进入濒死，开始求【票】。`);
    const humanRescuer = this.alivePlayersFrom(target, true).find((player) => player.isHuman && this.findResponseCard(player, "vote"));
    if (!skipHuman && humanRescuer && target.hp <= 0) {
      this.requestResponse(humanRescuer, "vote", 1, {
        source,
        message: `${target.name} 濒死，请打出【票】救援`,
        successLabel: `救援 ${target.name}`,
        failLabel: "不救援",
        responseKind: "dyingSave",
        onResolved: (success) => {
          if (success) this.heal(target, this.voteHealAmount(humanRescuer, target), humanRescuer);
          this.resolveDying(target, source, !success);
        },
      });
      if (this.state.pending) this.state.pending.kind = "dyingSave";
      return;
    }
    let guard = 0;
    while (target.hp <= 0 && guard < 10) {
      guard += 1;
      const rescuer = this.alivePlayersFrom(target, true).find((player) => !player.isHuman && this.findResponseCard(player, "vote"));
      if (!rescuer) break;
      const vote = this.findResponseCard(rescuer, "vote");
      if (!vote) break;
      this.removeFromHand(rescuer, vote.uid);
      this.discard(vote);
      this.log(`${rescuer.name} 打出【票】救${target.name}。`);
      this.heal(target, this.voteHealAmount(rescuer, target), rescuer);
    }
    if (target.hp <= 0) this.killPlayer(target, source);
  }

  private voteHealAmount(source: PlayerState, target: PlayerState): number {
    const incumbent = this.state.players.find((player) => player.roleId === "incumbent");
    if (target.id === incumbent?.id && this.hasSkill(incumbent, "capitalRescue") && this.character(source).faction === "capital") {
      return 2;
    }
    return 1;
  }

  private killPlayer(target: PlayerState, killer?: PlayerState): void {
    if (!target.alive) return;
    target.alive = false;
    target.roleRevealed = true;
    target.hp = 0;
    this.flashAction({
      tone: "death",
      actorId: killer?.id,
      targetIds: [target.id],
      cardName: "出局",
      message: `${target.name} 出局`,
    });
    this.log(`${target.name} 出局，身份是【${ROLES[target.roleId].name}】。`);
    this.discardAllZones(target);
    this.checkVictory();
    if (this.state.winner) return;
    if (killer?.alive && target.roleId === "challenger") {
      this.drawCards(killer, 3);
      this.log(`${killer.name} 击败反对，摸3张牌。`);
    }
    if (killer?.alive && killer.roleId === "incumbent" && target.roleId === "staffer") {
      this.discardAllZones(killer);
      this.log(`总统误伤幕僚，弃置所有牌和装备。`);
    }
  }

  private discardAllZones(player: PlayerState): void {
    player.hand.splice(0).forEach((card) => this.discard(card));
    Object.values(player.equipment).forEach((card) => card && this.discard(card));
    player.equipment = {};
    player.judgment.splice(0).forEach((card) => this.discard(card));
  }

  private checkVictory(): void {
    if (this.state.winner) return;
    const incumbent = this.state.players.find((player) => player.roleId === "incumbent");
    if (!incumbent?.alive) {
      const alive = this.state.players.filter((player) => player.alive);
      if (alive.length === 1 && alive[0].roleId === "maverick") this.endGame("maverick", "资本完成单挑收官，资本获胜。");
      else this.endGame("challengers", "总统倒台，反对阵营获胜。");
      return;
    }
    const threatsAlive = this.state.players.some((player) => player.alive && (player.roleId === "challenger" || player.roleId === "maverick"));
    if (!threatsAlive) this.endGame("incumbentTeam", "反对和资本全灭，总统/幕僚获胜。");
  }

  private endGame(winner: Winner, text: string): void {
    this.state.winner = winner;
    this.state.phase = "gameover";
    this.state.winText = text;
    this.state.prompt = "牌局结束";
    this.state.players.forEach((player) => (player.roleRevealed = true));
    this.flashAction({ tone: "system", cardName: "胜负", message: text });
    this.log(text);
  }

  private advanceToNextAlivePlayer(): void {
    const start = this.state.currentPlayerIndex;
    let index = start;
    do {
      index = (index + 1) % this.state.players.length;
      if (index === 0) this.state.round += 1;
      if (this.state.players[index].alive) {
        this.state.currentPlayerIndex = index;
        return;
      }
    } while (index !== start);
  }

  private nextAlivePlayer(player: PlayerState): PlayerState | undefined {
    let index = player.seat;
    for (let i = 0; i < this.state.players.length; i += 1) {
      index = (index + 1) % this.state.players.length;
      const next = this.state.players[index];
      if (next.alive) return next;
    }
    return undefined;
  }

  private alivePlayersFrom(player: PlayerState, includeSelf: boolean): PlayerState[] {
    const result: PlayerState[] = [];
    for (let offset = 0; offset < this.state.players.length; offset += 1) {
      const target = this.state.players[(player.seat + offset) % this.state.players.length];
      if (!target.alive) continue;
      if (!includeSelf && target.id === player.id) continue;
      result.push(target);
    }
    return result;
  }

  private currentPlayer(): PlayerState {
    return this.state.players[this.state.currentPlayerIndex];
  }

  private player(id: string): PlayerState | undefined {
    return this.state.players.find((player) => player.id === id);
  }

  private character(player: PlayerState) {
    return CHARACTERS[player.characterId];
  }

  private hasSkill(player: PlayerState, skill: SkillId): boolean {
    return this.character(player).skills.includes(skill);
  }

  private alliesOf(player: PlayerState): PlayerState[] {
    return this.state.players.filter((candidate) => candidate.alive && this.isAlly(player, candidate));
  }

  private enemiesOf(player: PlayerState): PlayerState[] {
    return this.state.players.filter((candidate) => candidate.alive && candidate.id !== player.id && this.isEnemy(player, candidate));
  }

  private isAlly(a: PlayerState, b: PlayerState): boolean {
    if (a.roleId === "incumbent" || a.roleId === "staffer") return b.roleId === "incumbent" || b.roleId === "staffer";
    if (a.roleId === "challenger") return b.roleId === "challenger";
    return a.id === b.id;
  }

  private isEnemy(a: PlayerState, b: PlayerState): boolean {
    if (a.id === b.id) return false;
    if (a.roleId === "incumbent" || a.roleId === "staffer") return b.roleId === "challenger" || b.roleId === "maverick";
    if (a.roleId === "challenger") return b.roleId === "incumbent" || b.roleId === "staffer";
    return true;
  }

  private attackRange(player: PlayerState): number {
    return CARD_DEFS[player.equipment.weapon?.defId ?? "spray"].equipment?.range ?? 1;
  }

  private distanceBetween(source: PlayerState, target: PlayerState): number {
    const alive = this.state.players.filter((player) => player.alive).sort((a, b) => a.seat - b.seat);
    const from = alive.findIndex((player) => player.id === source.id);
    const to = alive.findIndex((player) => player.id === target.id);
    if (from < 0 || to < 0) return 99;
    const clockwise = Math.abs(to - from);
    const base = Math.min(clockwise, alive.length - clockwise);
    const minusMount = source.equipment.minusMount ? -1 : 0;
    const plusMount = target.equipment.plusMount ? 1 : 0;
    const rush = this.hasSkill(source, "campaignRush") ? -1 : 0;
    return Math.max(1, base + minusMount + plusMount + rush);
  }

  private zoneCardCount(player: PlayerState): number {
    return player.hand.length + Object.keys(player.equipment).length + player.judgment.length;
  }

  private zoneChoiceOptions(target: PlayerState, hideHand = true, includeJudgment = true): PendingChoiceOption[] {
    const options: PendingChoiceOption[] = [];
    if (includeJudgment) {
      for (const card of target.judgment) {
        options.push({
          uid: card.uid,
          ownerId: target.id,
          zone: "judgment",
          cardId: card.defId,
          label: `判定区 ${CARD_DEFS[card.defId].name}`,
        });
      }
    }
    for (const card of Object.values(target.equipment)) {
      if (!card) continue;
      options.push({
        uid: card.uid,
        ownerId: target.id,
        zone: "equipment",
        cardId: card.defId,
        label: `装备区 ${CARD_DEFS[card.defId].name}`,
      });
    }
    target.hand.forEach((card, index) => {
      options.push({
        uid: card.uid,
        ownerId: target.id,
        zone: "hand",
        cardId: hideHand ? undefined : card.defId,
        label: hideHand ? `手牌 ${index + 1}` : `手牌 ${CARD_DEFS[card.defId].name}`,
        hidden: hideHand,
      });
    });
    return options;
  }

  private equipmentChoiceOptions(target: PlayerState, slots: EquipmentSlot[]): PendingChoiceOption[] {
    return slots
      .map((slot): PendingChoiceOption | undefined => {
        const card = target.equipment[slot];
        if (!card) return undefined;
        return {
          uid: card.uid,
          ownerId: target.id,
          zone: "equipment" as const,
          cardId: card.defId,
          label: CARD_DEFS[card.defId].name,
        };
      })
      .filter((option): option is PendingChoiceOption => Boolean(option));
  }

  private removeZoneCardByUid(target: PlayerState, uid: string): CardInstance | undefined {
    const handIndex = target.hand.findIndex((card) => card.uid === uid);
    if (handIndex >= 0) {
      const [card] = target.hand.splice(handIndex, 1);
      this.afterLosingCards(target);
      return card;
    }
    const judgeIndex = target.judgment.findIndex((card) => card.uid === uid);
    if (judgeIndex >= 0) {
      const [card] = target.judgment.splice(judgeIndex, 1);
      return card;
    }
    for (const slot of ["weapon", "armor", "plusMount", "minusMount"] as EquipmentSlot[]) {
      const card = target.equipment[slot];
      if (card?.uid === uid) {
        delete target.equipment[slot];
        this.afterLosingEquipment(target);
        return card;
      }
    }
    return undefined;
  }

  private aiChooseZoneCards(source: PlayerState, target: PlayerState, options: PendingChoiceOption[], count: number): string[] {
    const ally = this.isAlly(source, target);
    const scored = [...options].sort((a, b) => this.zoneOptionScore(source, target, b, ally) - this.zoneOptionScore(source, target, a, ally));
    return scored.slice(0, count).map((option) => option.uid);
  }

  private zoneOptionScore(source: PlayerState, target: PlayerState, option: PendingChoiceOption, ally: boolean): number {
    if (ally) {
      if (option.zone === "judgment") return 100;
      if (option.zone === "equipment") return -20;
      return -40;
    }
    if (option.zone === "equipment") return 80;
    if (option.zone === "hand") return 60;
    if (option.zone === "judgment") return 20;
    return scoreCardForOwner(source, option.cardId ?? "spray");
  }

  private discardRandomZoneCard(target: PlayerState, source: PlayerState, allowHandToSource: boolean): void {
    const zones: Array<() => CardInstance | undefined> = [
      () => target.judgment.pop(),
      () => popFirstEquipment(target),
      () => target.hand.shift(),
    ];
    for (const take of zones) {
      const card = take();
      if (card) {
        if (allowHandToSource) source.hand.push(card);
        else this.discard(card);
        this.afterLosingCards(target);
        this.afterLosingEquipment(target);
        this.log(`${source.name} 处理了${target.name}的${this.cardLabel(card)}。`);
        return;
      }
    }
  }

  private takeRandomZoneCard(target: PlayerState, source: PlayerState): void {
    const before = source.hand.length;
    this.discardRandomZoneCard(target, source, true);
    if (source.hand.length === before) {
      const card = target.hand.shift();
      if (card) {
        source.hand.push(card);
        this.afterLosingCards(target);
      }
    }
  }

  private discardMount(target: PlayerState, source: PlayerState): void {
    const mountSlot: EquipmentSlot | undefined = target.equipment.plusMount ? "plusMount" : target.equipment.minusMount ? "minusMount" : undefined;
    if (!mountSlot) return;
    const mount = target.equipment[mountSlot];
    delete target.equipment[mountSlot];
    if (mount) {
      this.discard(mount);
      this.afterLosingEquipment(target);
      this.log(`${source.name} 触发【砍行程】，弃置${target.name}的坐骑。`);
    }
  }

  private afterLosingCards(player: PlayerState): void {
    if (player.hand.length === 0 && this.hasSkill(player, "chainDraw") && !player.flags.chainDrawLock && player.alive) {
      player.flags.chainDrawLock = true;
      this.drawCards(player, 1);
      player.flags.chainDrawLock = false;
      this.log(`${player.name} 发动【连营】，摸1张牌。`);
    }
  }

  private afterLosingEquipment(player: PlayerState): void {
    if (this.hasSkill(player, "assetRestructure") && player.alive) {
      this.drawCards(player, 2);
      this.log(`${player.name} 发动【资产重组】，摸2张牌。`);
    }
  }

  private removeFromHand(player: PlayerState, uid: string): CardInstance | undefined {
    const index = player.hand.findIndex((card) => card.uid === uid);
    if (index < 0) return undefined;
    const [card] = player.hand.splice(index, 1);
    this.afterLosingCards(player);
    return card;
  }

  private discard(card: CardInstance, options: { animate?: boolean } = {}): void {
    this.state.discard.push(card);
    if (options.animate === false) return;
    this.queueVisual({
      kind: "discardCards",
      cardUids: [card.uid],
      cardIds: [card.defId],
      fromZone: "center",
      toZone: "discard",
      text: `弃置【${CARD_DEFS[card.defId].name}】`,
      tone: "system",
      durationMs: 520,
      holdMs: 80,
    });
  }

  private settleUsedCard(card: CardInstance): void {
    if (this.recoveredCardUids.delete(card.uid)) return;
    this.discard(card, { animate: false });
  }

  private flashAction(
    action: Omit<ActionFeedback, "serial"> & {
      kind?: ActionStep["kind"];
      durationMs?: number;
      cardUid?: string;
    },
  ): void {
    this.actionSerial += 1;
    const { kind, durationMs, cardUid, ...feedbackAction } = action;
    const feedback: ActionFeedback = {
      ...feedbackAction,
      serial: this.actionSerial,
    };
    this.state.lastAction = feedback;
    const step: ActionStep = {
      ...feedback,
      kind: kind ?? stepKindFromTone(feedback.tone),
      durationMs: durationMs ?? DEFAULT_ACTION_DURATION,
      elapsedMs: 0,
      cardUid,
    };
    if (this.state.currentAction) this.state.actionQueue.push(step);
    else {
      this.state.currentAction = step;
      this.state.actionClockMs = 0;
    }
    this.queueVisualsForAction(step);
  }

  private advanceVisual(ms: number): boolean {
    if (!this.state.currentVisual) {
      this.state.currentVisual = this.state.visualQueue.shift();
      this.state.visualClockMs = 0;
      return Boolean(this.state.currentVisual);
    }
    this.state.visualClockMs += Math.max(0, ms);
    this.state.currentVisual.elapsedMs = this.state.visualClockMs;
    const limit = this.state.currentVisual.durationMs + this.state.currentVisual.holdMs;
    if (this.state.visualClockMs < limit) return false;
    this.state.currentVisual = this.state.visualQueue.shift();
    this.state.visualClockMs = 0;
    return true;
  }

  private queueVisualsForAction(action: ActionStep): void {
    if (action.actorId && action.targetIds?.length) {
      this.queueVisual({
        kind: "line",
        actorId: action.actorId,
        targetIds: action.targetIds,
        text: action.cardName,
        tone: this.visualTone(action.tone),
        durationMs: 360,
        holdMs: 80,
        color: this.visualLineColor(action),
      });
    }
    const visualKind = this.visualKindForAction(action);
    if (!visualKind) return;
    this.queueVisual({
      kind: visualKind,
      actorId: action.actorId,
      targetIds: action.targetIds,
      cardUids: action.cardUid ? [action.cardUid] : undefined,
      cardIds: action.cardId ? [action.cardId] : undefined,
      fromZone: this.visualFromZone(action),
      toZone: this.visualToZone(action),
      text: action.message,
      tone: this.visualTone(action.tone),
      durationMs: Math.max(360, Math.min(action.durationMs, 900)),
      holdMs: action.kind === "useCard" || action.kind === "respondCard" || action.kind === "judge" ? 360 : 180,
      color: this.visualLineColor(action),
      hidden: false,
      hpChange: action.hpChange,
    });
  }

  private queueVisual(event: Omit<VisualEvent, "serial" | "elapsedMs">): void {
    this.visualSerial += 1;
    const visual: VisualEvent = {
      ...event,
      serial: this.visualSerial,
      elapsedMs: 0,
    };
    if (this.state.currentVisual) this.state.visualQueue.push(visual);
    else {
      this.state.currentVisual = visual;
      this.state.visualClockMs = 0;
    }
  }

  private visualKindForAction(action: ActionStep): VisualEventKind | undefined {
    if (action.kind === "useCard") return "useCard";
    if (action.kind === "respondCard") return "respondCard";
    if (action.kind === "judge") return "judgeFlip";
    if (action.kind === "damage") return "damage";
    if (action.kind === "heal") return "heal";
    if (action.kind === "death") return "death";
    if (action.kind === "cancel" || action.kind === "respondPrompt" || action.kind === "target") return "popup";
    if (action.kind === "turn" || action.kind === "phase" || action.kind === "system") return "phase";
    return undefined;
  }

  private visualTone(tone: ActionFeedback["tone"]): VisualTone {
    if (tone === "turn") return "system";
    return tone;
  }

  private visualFromZone(action: ActionStep): VisualZone | undefined {
    if (action.kind === "useCard" || action.kind === "respondCard") return "hand";
    if (action.kind === "judge") return "deck";
    return undefined;
  }

  private visualToZone(action: ActionStep): VisualZone | undefined {
    if (action.kind === "useCard" || action.kind === "respondCard" || action.kind === "judge") return "center";
    return undefined;
  }

  private visualLineColor(action: ActionStep): string | undefined {
    if (action.tone === "damage") return "fire";
    if (action.tone === "heal") return "green";
    if (action.tone === "response") return "blue";
    if (action.tone === "death") return "red";
    return undefined;
  }

  private log(message: string): void {
    this.state.logs.push(message);
    if (this.state.logs.length > MAX_LOGS) this.state.logs.splice(0, this.state.logs.length - MAX_LOGS);
  }

  private cardLabel(card: CardInstance): string {
    const def = CARD_DEFS[card.defId];
    return `${suitSymbol(card.suit)}${card.rank}【${def.name}】`;
  }

  private shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.rng() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  private isTrickLike(cardId: CardId): boolean {
    const category = CARD_DEFS[cardId].category;
    return category === "trick" || category === "delayed";
  }
}

function requiresTarget(cardId: CardId): boolean {
  return ["spray", "vote", "expose", "poach", "debate", "investigation", "borrowAccount"].includes(cardId);
}

function isEquipment(cardId: CardId): boolean {
  return ["repeatMic", "twoTrackMessage", "gotchaQuestion", "draftScramble", "followUpMic", "moneyPush", "tripleBroadcast", "cutTour", "coldTreatment", "prTeam", "safeState", "securityMotorcade", "campaignJet"].includes(cardId);
}

function popFirstEquipment(player: PlayerState): CardInstance | undefined {
  for (const slot of ["weapon", "armor", "plusMount", "minusMount"] as EquipmentSlot[]) {
    const card = player.equipment[slot];
    if (card) {
      delete player.equipment[slot];
      return card;
    }
  }
  return undefined;
}

function chooseWorstCard(player: PlayerState): CardInstance {
  return [...player.hand].sort((a, b) => scoreCardForOwner(player, a.defId) - scoreCardForOwner(player, b.defId))[0];
}

function chooseBestRevealed(player: PlayerState, cards: CardInstance[]): number {
  let bestIndex = 0;
  let bestScore = -Infinity;
  cards.forEach((card, index) => {
    const score = scoreCardForOwner(player, card.defId);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function chooseJudgmentReplacement(player: PlayerState, judge: CardInstance, reason: CardId): CardInstance | undefined {
  if (reason === "investigation") {
    const heart = player.hand.find((card) => card.suit === "heart");
    if (heart && judge.suit !== "heart") return heart;
  }
  if (reason === "blackSwan") {
    const safe = player.hand.find((card) => !(card.suit === "spade" && ["2", "3", "4", "5", "6", "7", "8", "9"].includes(card.rank)));
    if (safe && judge.suit === "spade") return safe;
  }
  return undefined;
}

function scoreCardForOwner(player: PlayerState, cardId: CardId): number {
  if (cardId === "vote") return player.hp < player.maxHp ? 95 : 55;
  if (cardId === "wash") return 70;
  if (cardId === "spray") return 65;
  if (cardId === "trendBoost") return 90;
  if (cardId === "factCheck") return 60;
  if (["pileOn", "mockingLive", "debate"].includes(cardId)) return 58;
  if (["expose", "poach", "investigation"].includes(cardId)) return 54;
  if (isEquipment(cardId)) return 50;
  return 40;
}

function suitSymbol(suit: string): string {
  return { spade: "♠", heart: "♥", club: "♣", diamond: "♦" }[suit] ?? "?";
}

function stepKindFromTone(tone: ActionFeedback["tone"]): ActionStep["kind"] {
  if (tone === "turn") return "turn";
  if (tone === "play" || tone === "skill") return "useCard";
  if (tone === "response") return "respondCard";
  if (tone === "damage") return "damage";
  if (tone === "heal") return "heal";
  if (tone === "death") return "death";
  return "system";
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
