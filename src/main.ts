import "./styles.css";
import { CARD_DEFS, getCardDef, suitLabel } from "./data/cards";
import { CHARACTER_ORDER, CHARACTERS } from "./data/characters";
import { FIVE_PLAYER_ROLES, ROLES } from "./data/roles";
import type { ActionFeedback, ActionStep, CardId, CardInstance, CharacterId, EquipmentSlot, PendingChoiceOption, PlayerState, RoleId, SkillId, VisualEvent, VisualZone } from "./data/types";
import { AmericaKillGame } from "./game/engine";

declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => void;
    americaKillGame: AmericaKillGame;
  }
}

type ModalKind = "logs" | "menu" | "card" | null;
type UiMode = "setup" | "game";

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) throw new Error("Missing #app");
const app: HTMLDivElement = appRoot;
const uiState: {
  mode: UiMode;
  modal: ModalKind;
  inspectedCardUid?: string;
  animatedVisualSerial?: number;
  selectedCharacterId: CharacterId;
  selectedRoleId: RoleId;
} = {
  mode: "setup",
  modal: null,
  selectedCharacterId: "trump",
  selectedRoleId: "incumbent",
};
const renderCache: { shellReady: boolean; handSignature: string; regions: Record<string, string> } = {
  shellReady: false,
  handSignature: "",
  regions: {},
};
let eventsBound = false;
const missingArtSrcs = new Set<string>();
const SKILL_SHORT_LABELS: Partial<Record<SkillId, string>> = {
  trafficRecovery: "流量",
  redHatGuard: "红帽",
  hardCounter: "回击",
  grabMic: "抢麦",
  crisisPr: "公关",
  pollChain: "民调",
  coalitionAid: "输血",
  blueAssist: "蓝援",
  orthodoxNarrative: "正统",
  rapidFire: "连喷",
  scheduleControl: "排程",
  emptyAgenda: "空程",
  switchMode: "转换",
  campaignRush: "巡回",
  prosecutorFollowup: "追问",
  iterate: "迭代",
  capitalRescue: "救援",
  logisticsDismantle: "拆单",
  dataHoard: "囤积",
  contrarianBuy: "加仓",
  keynote: "发布",
  realityDistortion: "扭曲",
  systemUpdate: "更新",
  patchRedirect: "转移",
  trustBarrier: "壁垒",
  chainDraw: "连营",
  mergerHeal: "并购",
  assetRestructure: "重组",
  foundingAid: "急救",
  reliefClinic: "配给",
  decisiveStrike: "定音",
  newDealDuel: "新政",
  firesideChat: "炉边",
};

const game = new AmericaKillGame();
window.americaKillGame = game;
window.render_game_to_text = () =>
  uiState.mode === "setup"
    ? JSON.stringify({
        mode: "setup",
        selectedCharacterId: uiState.selectedCharacterId,
        selectedCharacter: CHARACTERS[uiState.selectedCharacterId].name,
        selectedRoleId: uiState.selectedRoleId,
        selectedRole: ROLES[uiState.selectedRoleId].name,
      })
    : game.renderGameToText();
window.advanceTime = (ms: number) => {
  if (uiState.mode === "game") game.advanceTime(ms);
};

game.subscribe(renderStable);
window.setInterval(() => {
  if (uiState.mode === "game") game.advanceTime(120);
}, 120);

function renderStable(): void {
  if (uiState.mode === "setup") {
    renderSetupScreen();
    return;
  }
  const state = game.state;
  const human = state.players.find((player) => player.isHuman) ?? state.players[0];
  const current = state.players[state.currentPlayerIndex];
  const visibleHumanHand = visibleHandCards(human);
  const selectedCard = visibleHumanHand.find((card) => card.uid === state.selectedCardUid);
  const responsePlayable = game.responsePlayableCardUids();
  const discardSelectable = game.discardSelectableCardUids();
  const choiceSelectable = game.choiceSelectableCardUids();
  const normalPlayable = game.humanPlayableCardUids();
  const playable = state.pendingChoice ? choiceSelectable : state.pendingDiscard ? discardSelectable : state.pending ? responsePlayable : normalPlayable;
  const selectedDiscardUids = new Set(state.pendingDiscard?.selectedCardUids ?? []);
  const selectedChoiceUids = new Set(state.pendingChoice?.selectedCardUids ?? []);
  const legalTargets = game.selectedLegalTargetIds();
  const selectedTargets = new Set(state.selectedTargetIds);
  const action = state.currentAction ?? state.lastAction;
  const arenaClasses = [
    "noname-arena",
    `phase-${state.phase}`,
    state.pending ? "choose-to-respond selecting" : "",
    state.pending?.kind === "dyingSave" ? "dying-response" : "",
    state.pendingDiscard ? "choose-to-discard selecting" : "",
    state.pendingChoice ? "choose-to-choice selecting" : "",
    selectedCard ? "selecting-card" : "",
    state.winner ? "gameover" : "",
  ];

  ensureShell();
  const arena = app.querySelector<HTMLElement>("#arena");
  if (arena) arena.className = arenaClasses.join(" ");

  setRegionHtml("flow", renderFlowOverlay(current, action));
  setRegionHtml("visual", renderVisualLayer(state.currentVisual), state.currentVisual ? `visual:${state.currentVisual.serial}` : "visual:none");
  setRegionHtml("players", state.players.map((player) => renderPlayer(player, legalTargets, selectedTargets, action)).join(""));
  renderHandCards(human, visibleHumanHand, playable, selectedCard, new Set([...selectedDiscardUids, ...selectedChoiceUids]));
  setRegionHtml("thrown", state.pendingChoice ? "" : renderThrown());
  setRegionHtml("choice", renderChoicePanel(human));
  setRegionHtml("control", renderControl(human, selectedCard, legalTargets));
  setRegionHtml("system", renderSystem(current));
  setRegionHtml("arenalog", renderArenaLog());
  setRegionHtml("modal", renderModal(human, selectedCard));
}

function renderSetupScreen(): void {
  ensureShell();
  const arena = app.querySelector<HTMLElement>("#arena");
  if (arena) arena.className = "noname-arena pregame";
  renderCache.handSignature = "";
  setRegionHtml("flow", "");
  setRegionHtml("visual", renderVisualLayer(undefined), "visual:none");
  setRegionHtml("players", "");
  setRegionHtml("thrown", "");
  setRegionHtml("choice", "");
  setRegionHtml("control", "");
  setRegionHtml("system", "");
  setRegionHtml("arenalog", "");
  setRegionHtml("modal", renderPreGameSetup());
  const hand = app.querySelector<HTMLElement>("#handcards1");
  if (hand) hand.innerHTML = "";
}

function ensureShell(): void {
  if (renderCache.shellReady) return;
  app.innerHTML = `
    <main id="window" class="noname-window glass_ui" data-testid="war-table">
      <section id="arena" class="noname-arena" aria-label="牌桌">
        <div class="table-texture"></div>
        <div data-region="flow"></div>
        <div data-region="visual"></div>
        <div data-region="players"></div>
        <div id="mebg"></div>
        <section id="me" aria-label="你的手牌">
          <div id="handcards1" class="handcards" data-testid="hand-rail"></div>
        </section>
        <div data-region="thrown"></div>
        <div data-region="choice"></div>
        <div data-region="control"></div>
        <div data-region="system"></div>
        <div data-region="arenalog"></div>
      </section>
      <div data-region="modal"></div>
    </main>
  `;
  renderCache.shellReady = true;
  bindEventsOnce();
}

function setRegionHtml(region: string, html: string, signature = html): void {
  if (renderCache.regions[region] === signature) return;
  const node = app.querySelector<HTMLElement>(`[data-region="${region}"]`);
  if (!node) return;
  node.innerHTML = html;
  renderCache.regions[region] = signature;
}

function renderHandCards(
  human: PlayerState,
  visibleCards: CardInstance[],
  playable: Set<string>,
  selectedCard: CardInstance | undefined,
  selectedUids: Set<string>,
): void {
  const signature = visibleCards
    .map((card, index) =>
      [
        index,
        card.uid,
        card.defId,
        card.suit,
        card.rank,
        card.ex ? "ex" : "std",
        playable.has(card.uid) ? "playable" : "idle",
        selectedCard?.uid === card.uid || selectedUids.has(card.uid) ? "selected" : "normal",
        game.effectiveCardName(human, card),
      ].join(":"),
    )
    .join("|");
  if (renderCache.handSignature === signature) return;
  const hand = app.querySelector<HTMLElement>("#handcards1");
  if (!hand) return;
  hand.innerHTML = visibleCards
    .map((card, index) => renderHandCard(card, index, playable.has(card.uid), selectedCard?.uid === card.uid || selectedUids.has(card.uid), human))
    .join("");
  renderCache.handSignature = signature;
}

function visibleHandCards(player: PlayerState): CardInstance[] {
  if (!player.isHuman) return player.hand;
  const incoming = incomingHumanHandUids(player.id);
  if (!incoming.size) return player.hand;
  return player.hand.filter((card) => !incoming.has(card.uid));
}

function incomingHumanHandUids(playerId: string): Set<string> {
  const incoming = new Set<string>();
  const collect = (visual?: VisualEvent) => {
    if (!visual || (visual.kind !== "drawCards" && visual.kind !== "gainCards")) return;
    if (visual.toZone !== "hand" || !visual.targetIds?.includes(playerId)) return;
    for (const uid of visual.cardUids ?? []) incoming.add(uid);
  };
  collect(game.state.currentVisual);
  for (const visual of game.state.visualQueue) collect(visual);
  return incoming;
}

function bindEventsOnce(): void {
  if (eventsBound) return;
  eventsBound = true;

  app.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const characterButton = target.closest<HTMLButtonElement>("[data-select-character]");
    if (characterButton && app.contains(characterButton)) {
      uiState.selectedCharacterId = characterButton.dataset.selectCharacter as CharacterId;
      renderStable();
      return;
    }

    const roleButton = target.closest<HTMLButtonElement>("[data-select-role]");
    if (roleButton && app.contains(roleButton)) {
      uiState.selectedRoleId = roleButton.dataset.selectRole as RoleId;
      renderStable();
      return;
    }

    const choiceButton = target.closest<HTMLButtonElement>("[data-choice-card-uid]");
    if (choiceButton && app.contains(choiceButton)) {
      const uid = choiceButton.dataset.choiceCardUid;
      if (uid) game.toggleChoiceCard(uid);
      return;
    }

    const cardButton = target.closest<HTMLButtonElement>("[data-card-uid]");
    if (cardButton && app.contains(cardButton)) {
      handleCardClick(cardButton);
      return;
    }

    const skillInfo = target.closest<HTMLElement>("[data-skill-info]");
    if (skillInfo && app.contains(skillInfo)) {
      return;
    }

    const actionButton = target.closest<HTMLButtonElement>("[data-action]");
    if (actionButton && app.contains(actionButton)) {
      handleActionClick(actionButton, event);
      return;
    }

    const skillButton = target.closest<HTMLButtonElement>("[data-skill]");
    if (skillButton && app.contains(skillButton)) {
      game.useSkill(skillButton.dataset.skill as SkillId);
      return;
    }

    const playerPanel = target.closest<HTMLElement>("[data-player-id]");
    if (playerPanel && app.contains(playerPanel)) {
      if (!game.state.pending && playerPanel.dataset.playerId) game.selectTarget(playerPanel.dataset.playerId);
      return;
    }

    const backdrop = target.closest<HTMLElement>(".modal-backdrop");
    if (backdrop && event.target === backdrop && !game.state.winner) closeModal();
  });

  app.addEventListener("dblclick", (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-card-uid]");
    const uid = button?.dataset.cardUid;
    if (uid) openCard(uid);
  });

  app.addEventListener("contextmenu", (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-card-uid]");
    const uid = button?.dataset.cardUid;
    if (!uid) return;
    event.preventDefault();
    openCard(uid);
  });

  app.addEventListener(
    "error",
    (event) => {
      const img = event.target instanceof HTMLImageElement ? event.target : undefined;
      if (!img) return;
      const src = img.dataset.artSrc ?? img.getAttribute("src");
      if (src) missingArtSrcs.add(src);
      img.classList.add("missing-art");
      img.setAttribute("aria-hidden", "true");
    },
    true,
  );
}

function handleCardClick(button: HTMLButtonElement): void {
  const uid = button.dataset.cardUid;
  if (!uid) return;
  if (game.state.pendingChoice) {
    if (button.dataset.playable === "true") game.toggleChoiceCard(uid);
    else openCard(uid);
    return;
  }
  if (game.state.pending) {
    if (button.dataset.playable === "true") game.selectResponseCard(uid);
    else openCard(uid);
    return;
  }
  if (game.state.pendingDiscard) {
    if (button.dataset.playable === "true") game.toggleDiscardCard(uid);
    else openCard(uid);
    return;
  }
  if (button.dataset.playable === "true") game.selectCard(uid);
  else openCard(uid);
}

function handleActionClick(button: HTMLButtonElement, event: MouseEvent): void {
  const action = button.dataset.action;
  if (action === "play-selected") game.confirmSelectedCard();
  else if (action === "inspect-selected") {
    const uid = game.state.selectedCardUid;
    if (uid) openCard(uid);
  } else if (action === "confirm-response") game.confirmResponseSelection();
  else if (action === "confirm-choice") game.confirmChoice();
  else if (action === "decline-choice") game.declineChoice();
  else if (action === "cancel-response-selection") game.cancelResponseSelection();
  else if (action === "decline-response") game.declineResponse();
  else if (action === "confirm-discard") game.confirmDiscardSelection();
  else if (action === "cancel-selection") game.cancelSelection();
  else if (action === "end-turn") game.endPhase();
  else if (action === "auto-discard") game.autoDiscardHuman();
  else if (action === "draft-scramble") game.startDraftScrambleUse();
  else if (action === "start-selected-game") startSelectedGame();
  else if (action === "setup-new-game") showSetupScreen();
  else if (action === "new-game") {
    showSetupScreen();
  } else if (action === "fullscreen") toggleFullscreen();
  else if (action === "logs") {
    uiState.modal = "logs";
    renderStable();
  } else if (action === "menu") {
    uiState.modal = "menu";
    renderStable();
  } else if (action === "close-modal") {
    event.preventDefault();
    closeModal();
  }
}

function startSelectedGame(): void {
  uiState.mode = "game";
  uiState.modal = null;
  uiState.inspectedCardUid = undefined;
  uiState.animatedVisualSerial = undefined;
  renderCache.handSignature = "";
  renderCache.regions = {};
  game.newGame(Date.now(), {
    humanCharacterId: uiState.selectedCharacterId,
    humanRoleId: uiState.selectedRoleId,
  });
}

function showSetupScreen(): void {
  uiState.mode = "setup";
  uiState.modal = null;
  uiState.inspectedCardUid = undefined;
  uiState.animatedVisualSerial = undefined;
  renderCache.handSignature = "";
  renderCache.regions = {};
  renderStable();
}

function renderVisualLayer(visual?: VisualEvent): string {
  if (!visual) return `<div id="visual-layer" aria-hidden="true"></div>`;
  const isNew = uiState.animatedVisualSerial !== visual.serial;
  uiState.animatedVisualSerial = visual.serial;
  const className = `visual-event visual-${visual.kind} tone-${visual.tone} ${isNew ? "visual-entering" : "visual-stable"}`;
  const body =
    visual.kind === "line"
      ? renderVisualLine(visual)
      : visual.kind === "damage" || visual.kind === "heal" || visual.kind === "popup" || visual.kind === "death" || visual.kind === "phase"
        ? renderVisualPopup(visual)
        : visual.kind === "clearThrown"
          ? ""
          : renderVisualCards(visual);
  return `<div id="visual-layer" class="${className}" data-visual-serial="${visual.serial}" aria-hidden="true">${body}</div>`;
}

function renderVisualLine(visual: VisualEvent): string {
  const actor = visual.actorId ? game.state.players.find((player) => player.id === visual.actorId) : undefined;
  if (!actor || !visual.targetIds?.length) return "";
  return visual.targetIds
    .map((targetId) => {
      const target = game.state.players.find((player) => player.id === targetId);
      if (!target || target.id === actor.id) return "";
      const from = visualPoint(visual.fromZone ?? "player", actor.id);
      const to = visualPoint(visual.toZone ?? "player", target.id);
      return `
        <svg class="visual-line ${visual.color ?? ""}" viewBox="0 0 100 100" preserveAspectRatio="none">
          <line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />
        </svg>
      `;
    })
    .join("");
}

function renderVisualCards(visual: VisualEvent): string {
  const count = Math.max(1, visual.cardUids?.length ?? visual.cardIds?.length ?? 1);
  const actorId = visual.actorId ?? visual.targetIds?.[0];
  const fromBase = visualPoint(visual.fromZone ?? "center", actorId);
  const toBase = visualPoint(visual.toZone ?? "center", visual.targetIds?.[0] ?? actorId);
  const cards = Array.from({ length: count }, (_, index) => {
    const uid = visual.cardUids?.[index];
    const cardId = visual.cardIds?.[index];
    const offset = index - (count - 1) / 2;
    const from = { x: fromBase.x + offset * 1.6, y: fromBase.y };
    const to = visual.toZone === "center" || visual.toZone === "revealed" ? { x: toBase.x + offset * 6, y: toBase.y } : { x: toBase.x + offset * 1.8, y: toBase.y };
    return `
      <div class="visual-card-flight" style="--from-x:${from.x}%; --from-y:${from.y}%; --to-x:${to.x}%; --to-y:${to.y}%; --dur:${visual.durationMs}ms; --delay:${index * 70}ms;">
        ${renderVisualCard(uid, cardId, visual.hidden)}
      </div>
    `;
  }).join("");
  const label = visual.text ? `<div class="visual-caption">${escapeHtml(visual.text)}</div>` : "";
  return `${cards}${label}`;
}

function renderVisualCard(uid: string | undefined, cardId: CardId | undefined, hidden?: boolean): string {
  if (hidden) return `<div class="card fullskin visual-card-face card-back"><div class="background"></div><div class="card-back-mark">牌</div></div>`;
  const card = uid ? findCardByUid(uid) : undefined;
  const owner = findCardOwner(uid) ?? game.state.players.find((player) => player.id === game.state.currentVisual?.actorId) ?? game.state.players[0];
  if (card) return renderCardShell(card, owner, "visual-card-face");
  if (cardId) return renderSyntheticVisualCard(cardId);
  return `<div class="card fullskin visual-card-face card-back"><div class="background"></div><div class="card-back-mark">牌</div></div>`;
}

function renderSyntheticVisualCard(cardId: CardId): string {
  const def = CARD_DEFS[cardId];
  return `
    <div class="card fullskin visual-card-face ${def.category}">
      ${renderCardFace({
        artSrc: def.art.src,
        artAlt: def.art.alt,
        title: def.name,
        rankLabel: "",
        rankRed: false,
        badgeLabel: cardCategoryLabel(def.category),
        sourceLabel: "\u6807\u51c6",
      })}
    </div>
  `;
}

function renderVisualPopup(visual: VisualEvent): string {
  const targetId = visual.targetIds?.[0] ?? visual.actorId;
  const point = visualPoint("player", targetId);
  const text = visual.text ?? visual.kind;
  return `
    <div class="visual-popup" style="--pop-x:${point.x}%; --pop-y:${point.y}%;">
      <strong>${escapeHtml(visualPopupText(visual, text))}</strong>
    </div>
  `;
}

function visualPopupText(visual: VisualEvent, fallback: string): string {
  if (visual.kind === "damage" && visual.text) return visual.text;
  if (visual.kind === "heal" && visual.text) return visual.text;
  if (visual.kind === "death") return "出局";
  if (visual.kind === "phase") return fallback;
  if (visual.kind === "popup") return fallback;
  return fallback;
}

function renderPlayer(player: PlayerState, legalTargets: Set<string>, selectedTargets: Set<string>, action?: ActionFeedback | ActionStep): string {
  const character = CHARACTERS[player.characterId];
  const role = ROLES[player.roleId];
  const isCurrent = game.state.players[game.state.currentPlayerIndex].id === player.id;
  const pending = game.state.pending;
  const displayHp = displayHpForPlayer(player);
  const isDying = player.alive && displayHp <= 0;
  const isActor = action?.actorId === player.id || pending?.sourceId === player.id || (pending?.kind === "dyingSave" && pending.playerId === player.id);
  const isTarget = Boolean(action?.targetIds?.includes(player.id)) || pending?.playerId === player.id || (pending?.kind === "dyingSave" && isDying);
  const isPending = game.state.pending?.playerId === player.id;
  const classes = ["player", player.isHuman ? "me-player" : "", player.alive ? "" : "dead"];
  if (isDying) classes.push("dying");
  if (isCurrent) classes.push("glow_phase");
  if (isActor) classes.push("current_action");
  if (isTarget) classes.push("target");
  if (legalTargets.has(player.id)) classes.push("selectable");
  if (isPending || selectedTargets.has(player.id)) classes.push("selectedx");

  return `
    <article class="${classes.join(" ")}" data-position="${player.seat}" data-player-id="${player.id}">
      <div class="avatar">
        <img src="${character.art.src}" alt="${character.art.alt}" loading="lazy" />
        <span>${initials(character.name)}</span>
      </div>
      <div class="name"><span>${verticalName(character.name)}</span></div>
      <div class="identity" data-color="${roleColor(player)}"><div>${player.roleRevealed || player.isHuman ? role.name.slice(0, 1) : "?"}</div></div>
      <div class="hp" data-condition="${hpCondition(displayHp, player.maxHp)}">${renderHp(displayHp, player.maxHp)}</div>
      <div class="count">${player.isHuman ? visibleHandCards(player).length : "?"}</div>
      <div class="equips">${renderZoneCards(player)}</div>
      <div class="judges">${renderJudgmentCards(player)}</div>
      <div class="marks"><span>${factionLabel(character.faction)}</span></div>
      <div class="player-skills">${renderPlayerSkillEntries(player)}</div>
      <div class="damage">${isDying ? "濒死" : player.alive ? "" : "阵亡"}</div>
    </article>
  `;
}

function displayHpForPlayer(player: PlayerState): number {
  const current = game.state.currentVisual;
  if (current?.hpChange?.targetId === player.id && isHpVisual(current)) {
    return clampDisplayHp(current.hpChange.after, player.maxHp);
  }
  const upcoming = game.state.visualQueue.find((visual) => visual.hpChange?.targetId === player.id && isHpVisual(visual));
  if (upcoming?.hpChange) return clampDisplayHp(upcoming.hpChange.before, player.maxHp);
  return clampDisplayHp(player.hp, player.maxHp);
}

function isHpVisual(visual: VisualEvent): boolean {
  return visual.kind === "damage" || visual.kind === "heal";
}

function clampDisplayHp(hp: number, maxHp: number): number {
  return Math.max(0, Math.min(maxHp, hp));
}

function renderFlowOverlay(current: PlayerState, action?: ActionFeedback | ActionStep): string {
  const pending = game.state.pending;
  const pendingDiscard = game.state.pendingDiscard;
  const pendingChoice = game.state.pendingChoice;
  const visual = game.state.currentVisual;
  const selectedTargetId = game.state.selectedTargetIds[0];
  const selectedActorId = selectedTargetId && game.state.selectedCardUid ? game.state.players.find((player) => player.isHuman)?.id : undefined;
  const dyingTargetId = pending?.kind === "dyingSave" ? game.state.players.find((player) => player.alive && player.hp <= 0)?.id : undefined;
  const choiceTargetId =
    pendingChoice?.targetId ?? (pendingChoice && pendingChoice.sourceId && pendingChoice.sourceId !== pendingChoice.playerId ? pendingChoice.playerId : undefined);
  const targetId = dyingTargetId ?? pending?.playerId ?? choiceTargetId ?? selectedTargetId ?? action?.targetIds?.[0];
  const actorId =
    pendingDiscard?.playerId ??
    (pending?.kind === "dyingSave" ? pending.playerId : pending?.sourceId) ??
    pendingChoice?.sourceId ??
    pendingChoice?.playerId ??
    selectedActorId ??
    action?.actorId;
  const actor = actorId ? game.state.players.find((player) => player.id === actorId) : undefined;
  const target = targetId ? game.state.players.find((player) => player.id === targetId) : undefined;
  const lineClass = pending?.kind === "dyingSave" ? "action-line rescue" : "action-line";
  const lineGradientId = pending?.kind === "dyingSave" ? "rescueLineGlow" : "actionLineGlow";
  const lineStops =
    pending?.kind === "dyingSave"
      ? `
                  <stop offset="0%" stop-color="#ffe6a1" stop-opacity="0.12" />
                  <stop offset="46%" stop-color="#fff1a6" stop-opacity="0.95" />
                  <stop offset="100%" stop-color="#73ff9b" stop-opacity="0.9" />
                `
      : `
                  <stop offset="0%" stop-color="#fff3a3" stop-opacity="0.1" />
                  <stop offset="45%" stop-color="#ffe16f" stop-opacity="0.9" />
                  <stop offset="100%" stop-color="#5de7ff" stop-opacity="0.85" />
                `;
  const shouldShowFlowLine = !visual || Boolean(pending || pendingChoice || pendingDiscard || selectedTargetId);
  const line =
    shouldShowFlowLine && actor && target && actor.id !== target.id
      ? (() => {
          const from = seatPoint(actor.seat);
          const to = seatPoint(target.seat);
          return `
            <svg class="${lineClass}" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="${lineGradientId}" x1="0" y1="0" x2="1" y2="0">
${lineStops}
                </linearGradient>
              </defs>
              <line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="url(#${lineGradientId})" />
            </svg>
          `;
        })()
      : "";
  const message = pendingDiscard?.message ?? pending?.message ?? pendingChoice?.message ?? (selectedTargetId ? game.state.prompt : undefined) ?? visual?.text ?? action?.message;
  const actionLabel = message ? `<span>${escapeHtml(message)}</span>` : "";
  const bannerPhase = action && "kind" in action && action.kind === "judge" ? "判定" : phaseLabel(game.state.phase);
  return `
    <div class="flow-layer">
      ${line}
      <div class="phase-banner">
        <b>${bannerPhase}</b>
        <small>${escapeHtml(current.name)}</small>
        ${actionLabel}
      </div>
    </div>
  `;
}

function renderThrown(): string {
  return `<div id="thrownhighlight" class="thrown idle clean" aria-hidden="true"></div>`;
}

function renderChoicePanel(human: PlayerState): string {
  const pending = game.state.pendingChoice;
  if (!pending) return "";
  const selected = new Set(pending.selectedCardUids);
  return `
    <section id="choicepanel" class="choice-panel choice-${pending.kind}" aria-label="选择窗口">
      <header>
        <strong>${escapeHtml(pending.message)}</strong>
        <span>${pending.selectedCardUids.length}/${pending.minCount}${pending.maxCount !== pending.minCount ? `-${pending.maxCount}` : ""}</span>
      </header>
      <div class="choice-options">
        ${pending.options.map((option) => renderChoiceOption(option, selected.has(option.uid), human)).join("")}
      </div>
    </section>
  `;
}

function renderChoiceOption(option: PendingChoiceOption, selected: boolean, human: PlayerState): string {
  const owner = option.ownerId ? game.state.players.find((player) => player.id === option.ownerId) : undefined;
  const card = option.hidden ? undefined : findCardByUid(option.uid);
  const body = card
    ? renderCardShell(card, owner ?? human, "choice-card")
    : `
      <div class="card fullskin choice-card card-back">
        <div class="background"></div>
        <div class="card-back-mark">${escapeHtml(option.label)}</div>
      </div>
    `;
  return `
    <button class="choice-option ${selected ? "selected" : ""}" data-choice-card-uid="${option.uid}" type="button">
      ${body}
      <small>${escapeHtml(option.label)}</small>
    </button>
  `;
}

function findCardByUid(uid: string): CardInstance | undefined {
  for (const player of game.state.players) {
    const fromHand = player.hand.find((card) => card.uid === uid);
    if (fromHand) return fromHand;
    const fromEquipment = Object.values(player.equipment).find((card): card is CardInstance => Boolean(card && card.uid === uid));
    if (fromEquipment) return fromEquipment;
    const fromJudgment = player.judgment.find((card) => card.uid === uid);
    if (fromJudgment) return fromJudgment;
  }
  return game.state.discard.find((card) => card.uid === uid) ?? game.state.revealed.find((card) => card.uid === uid);
}

function findCardOwner(uid: string | undefined): PlayerState | undefined {
  if (!uid) return undefined;
  return game.state.players.find(
    (player) =>
      player.hand.some((card) => card.uid === uid) ||
      player.judgment.some((card) => card.uid === uid) ||
      Object.values(player.equipment).some((card) => card?.uid === uid),
  );
}

function renderControl(human: PlayerState, selectedCard: CardInstance | undefined, legalTargets: Set<string>): string {
  const state = game.state;
  const current = state.players[state.currentPlayerIndex];
  const pending = state.pending;
  const pendingDiscard = state.pendingDiscard;
  const pendingChoice = state.pendingChoice;
  if (pendingChoice) {
    const canConfirm = game.choiceSelectionCanConfirm();
    return `
      <div id="control" class="control choosing">
        <div class="prompt-line">${escapeHtml(pendingChoice.message)}</div>
        <button class="control-btn primary" data-action="confirm-choice" type="button" ${canConfirm ? "" : "disabled"}>${escapeHtml(pendingChoice.onConfirmLabel)}</button>
        <button class="control-btn" data-action="decline-choice" type="button" ${pendingChoice.canDecline ? "" : "disabled"}>${escapeHtml(pendingChoice.onDeclineLabel ?? "放弃")}</button>
        <button class="control-btn" data-action="logs" type="button">记录</button>
      </div>
    `;
  }
  if (pending) {
    const isHumanPending = pending.playerId === human.id;
    const canConfirmResponse = isHumanPending && game.responseSelectionCanConfirm();
    const isDyingSave = pending.kind === "dyingSave";
    const promptLine = canConfirmResponse ? (isDyingSave ? "已选择【票】，点击救援" : "已选择响应牌，点击确定打出") : pending.message;
    return `
      <div id="control" class="control responding ${isDyingSave ? "dying-control" : ""}">
        <div class="prompt-line">${escapeHtml(promptLine)}</div>
        <button class="control-btn primary" data-action="confirm-response" type="button" ${canConfirmResponse ? "" : "disabled"}>${isDyingSave ? "救援" : "确定"}</button>
        <button class="control-btn" data-action="cancel-response-selection" type="button" ${isHumanPending && selectedCard ? "" : "disabled"}>取消</button>
        <button class="control-btn" data-action="decline-response" type="button" ${isHumanPending && pending.canDecline ? "" : "disabled"}>${isDyingSave ? "不救援" : "不响应"}</button>
        <button class="control-btn" data-action="logs" type="button">记录</button>
      </div>
    `;
  }
  if (pendingDiscard) {
    const selectedCount = pendingDiscard.selectedCardUids.length;
    return `
      <div id="control" class="control discarding">
        <div class="prompt-line">${escapeHtml(pendingDiscard.message)}</div>
        <button class="control-btn primary" data-action="confirm-discard" type="button" ${selectedCount >= pendingDiscard.requiredCount ? "" : "disabled"}>确定弃牌</button>
        <button class="control-btn" data-action="inspect-selected" type="button" ${selectedCard ? "" : "disabled"}>详情</button>
        <button class="control-btn" data-action="logs" type="button">记录</button>
      </div>
    `;
  }

  const canAct = current.isHuman && state.phase === "play" && !state.winner;
  const needsTarget = Boolean(canAct && selectedCard && game.selectedCardNeedsTarget());
  const canUseSelected = Boolean(canAct && selectedCard && game.selectedCardCanConfirm());
  const selectedLine = selectedCard ? `【${game.effectiveCardName(human, selectedCard)}】` : state.prompt;
  const promptLine = needsTarget ? (state.selectedTargetIds.length ? "目标已选择，点击使用确认" : "请选择目标") : selectedLine;
  return `
    <div id="control" class="control">
      <div class="prompt-line">${escapeHtml(promptLine)}</div>
      <div class="skill-buttons">${canAct ? renderSkillButtons(human) : ""}</div>
      <button class="control-btn primary" data-action="play-selected" type="button" ${canUseSelected ? "" : "disabled"}>使用</button>
      <button class="control-btn" data-action="inspect-selected" type="button" ${selectedCard ? "" : "disabled"}>详情</button>
      <button class="control-btn" data-action="cancel-selection" type="button" ${selectedCard ? "" : "disabled"}>取消</button>
      <button class="control-btn" data-action="end-turn" type="button" ${canAct ? "" : "disabled"}>结束</button>
      <button class="control-btn" data-action="auto-discard" type="button" ${current.isHuman && state.phase === "discard" && !state.winner ? "" : "disabled"}>弃牌</button>
    </div>
  `;
}

function renderSystem(current: PlayerState): string {
  const counts = roleCounts();
  return `
    <aside id="system">
      <div class="round-info">
        <b>第${game.state.round}轮</b>
        <div class="rolebar" aria-label="身份数量">
          <span data-role="incumbent">总${counts.incumbent}</span>
          <span data-role="staffer">幕${counts.staffer}</span>
          <span data-role="challenger">反${counts.challenger}</span>
          <span data-role="maverick">资${counts.maverick}</span>
        </div>
        <span>${phaseLabel(game.state.phase)} · ${escapeHtml(current.name)}</span>
        <small>牌堆 ${game.state.deck.length} / 弃牌 ${game.state.discard.length}</small>
      </div>
      <button class="menu-btn" data-action="menu" type="button" aria-label="菜单"><span></span><span></span><span></span></button>
    </aside>
  `;
}

function renderArenaLog(): string {
  return `
    <button id="historybar" data-action="logs" type="button">
      ${game.state.logs.slice(-6).map((line) => `<span>${escapeHtml(line)}</span>`).join("")}
    </button>
  `;
}

function renderHandCard(card: CardInstance, index: number, playable: boolean, selected: boolean, owner: PlayerState): string {
  const fanOffset = index - Math.max(0, owner.hand.length - 1) / 2;
  const def = getCardDef(card);
  const classes = ["card", "hand-card", "fullskin", def.category, playable ? "selectable" : "unselectable", selected ? "selected" : ""];
  return `
    <button
      class="${classes.join(" ")}"
      data-card-uid="${card.uid}"
      data-playable="${playable ? "true" : "false"}"
      type="button"
      style="--fan:${fanOffset}; --i:${index}"
      aria-disabled="${playable ? "false" : "true"}"
    >
      ${renderCardInner(card, owner)}
    </button>
  `;
}

function renderCardShell(card: CardInstance, owner: PlayerState, extraClass = ""): string {
  const def = getCardDef(card);
  return `<div class="card fullskin ${def.category} ${extraClass}">${renderCardInner(card, owner)}</div>`;
}

function renderCardInner(card: CardInstance, owner: PlayerState): string {
  const def = getCardDef(card);
  const effectiveName = game.effectiveCardName(owner, card);
  const rankRed = card.suit === "heart" || card.suit === "diamond";
  const sourceLabel = card.ex ? "EX" : cardSourceLabel(card.source);
  return renderCardFace({
    artSrc: def.art.src,
    artAlt: def.art.alt,
    title: effectiveName !== def.name ? effectiveName : def.name,
    subtitle: effectiveName !== def.name ? def.name : undefined,
    rankLabel: `${suitLabel(card.suit)}${card.rank}`,
    rankRed,
    badgeLabel: cardCategoryLabel(def.category),
    sourceLabel,
  });
}

function renderCardFace({
  artSrc,
  artAlt,
  title,
  subtitle,
  rankLabel,
  rankRed,
  badgeLabel,
  sourceLabel,
}: {
  artSrc: string | undefined;
  artAlt: string;
  title: string;
  subtitle?: string;
  rankLabel: string;
  rankRed: boolean;
  badgeLabel: string;
  sourceLabel: string;
}): string {
  return `
    <div class="background"></div>
    ${renderArt(artSrc, artAlt, "card-art")}
    <div class="card-vignette"></div>
    <div class="card-titlebar">
      ${rankLabel ? `<div class="card-rank ${rankRed ? "red" : ""}">${escapeHtml(rankLabel)}</div>` : ""}
      <div class="card-title ${cardNameClass(title)}">${escapeHtml(title)}</div>
      ${subtitle ? `<div class="card-subtitle">${escapeHtml(subtitle)}</div>` : ""}
    </div>
    <div class="card-badge">
      <span>${escapeHtml(badgeLabel)}</span>
      <span>${escapeHtml(sourceLabel)}</span>
    </div>
  `;
}

function cardNameClass(name: string): string {
  const length = Array.from(name).length;
  if (length >= 5) return "xlong-name";
  if (length >= 4) return "long-name";
  return "";
}

function cardSourceLabel(source: CardInstance["source"]): string {
  return source === "ex" ? "EX" : "标准";
}

function cardCategoryLabel(category: string): string {
  if (category === "basic") return "\u57fa\u7840";
  if (category === "trick") return "\u9526\u56ca";
  if (category === "delayed") return "\u5ef6\u65f6";
  if (category === "weapon") return "\u6b66\u5668";
  if (category === "armor") return "\u9632\u5177";
  if (category === "mount") return "\u8f7d\u5177";
  return "\u724c";
}

function renderArt(src: string | undefined, alt: string, className: string): string {
  if (!src || missingArtSrcs.has(src)) return `<div class="${className} missing-art" role="img" aria-label="${escapeHtml(alt)}"></div>`;
  return `<img class="${className}" src="${src}" data-art-src="${src}" alt="${escapeHtml(alt)}" loading="lazy" />`;
}

function renderZoneCards(player: PlayerState): string {
  const slots: EquipmentSlot[] = ["weapon", "armor", "plusMount", "minusMount"];
  return slots
    .map((slot) => {
      const card = player.equipment[slot];
      return card ? renderEquipmentStrip(card, slot) : "";
    })
    .join("");
}

function renderJudgmentCards(player: PlayerState): string {
  return player.judgment.map((card) => `<div class="card zone-card judge">${renderMiniCardInner(card)}</div>`).join("");
}

function renderEquipmentStrip(card: CardInstance, slot: EquipmentSlot): string {
  const def = CARD_DEFS[card.defId];
  const slotLabel = equipmentSlotLabel(slot);
  const info = `${suitLabel(card.suit)}${card.rank} ${slotLabel}`;
  const title = `${def.name} · ${info}`;
  return `
    <div
      class="card zone-card equip-strip ${slotClass(slot)}"
      data-card-uid="${card.uid}"
      title="${escapeHtml(title)}"
      aria-label="${escapeHtml(title)}"
    >
      <span class="equip-slot">${escapeHtml(slotLabel)}</span>
      <span class="equip-name">${escapeHtml(def.name)}</span>
      <span class="equip-info" aria-hidden="true">${escapeHtml(info)}</span>
    </div>
  `;
}

function renderMiniCardInner(card: CardInstance): string {
  const def = CARD_DEFS[card.defId];
  return `
    <div class="background"></div>
    <div class="info ${card.suit === "heart" || card.suit === "diamond" ? "red" : ""}">${suitLabel(card.suit)}${card.rank}</div>
    <div class="name">${escapeHtml(def.name)}</div>
  `;
}

function renderSkillButtons(human: PlayerState): string {
  const character = CHARACTERS[human.characterId];
  const available: Array<[SkillId, string]> = [
    ["iterate", "极限迭代"],
    ["contrarianBuy", "逆势加仓"],
    ["reliefClinic", "独立配给"],
  ];
  const buttons = available
    .filter(([skill]) => character.skills.includes(skill))
    .map(([skill, label]) => `<button class="control-btn skill-btn" data-skill="${skill}" type="button">${label}</button>`);
  if (game.canUseDraftScramble()) {
    buttons.push(`<button class="control-btn skill-btn" data-action="draft-scramble" type="button">临场拼稿</button>`);
  }
  return buttons.join("");
}

function renderPlayerSkillEntries(player: PlayerState): string {
  const character = CHARACTERS[player.characterId];
  return character.skillText
    .map((text, index) => {
      const skill = character.skills[index];
      const label = skillTextLabel(text, skill);
      return `
        <button class="player-skill-chip" data-skill-info="${skill ?? index}" type="button" aria-label="${escapeHtml(text)}">
          ${escapeHtml(shortSkillLabel(label, skill))}
          <span class="skill-popover" role="tooltip">
            <b>${escapeHtml(label)}</b>
            <small>${escapeHtml(skillTextBody(text))}</small>
          </span>
        </button>
      `;
    })
    .join("");
}

function skillTextLabel(text: string, fallback?: string): string {
  const index = text.indexOf("：");
  if (index > 0) return text.slice(0, index);
  return fallback ?? "技能";
}

function skillTextBody(text: string): string {
  const index = text.indexOf("：");
  return index > 0 ? text.slice(index + 1) : text;
}

function shortSkillLabel(label: string, skill?: SkillId): string {
  if (skill && SKILL_SHORT_LABELS[skill]) return SKILL_SHORT_LABELS[skill];
  return Array.from(label).slice(0, 2).join("");
}

function renderModal(human: PlayerState, selectedCard: CardInstance | undefined): string {
  if (game.state.winner) return renderResultModal();
  if (uiState.modal === "logs") return renderLogsModal();
  if (uiState.modal === "menu") return renderMenuModal();
  if (uiState.modal === "card") {
    const card = human.hand.find((item) => item.uid === uiState.inspectedCardUid) ?? selectedCard;
    if (card) return renderCardModal(card, human);
  }
  return "";
}

function renderPreGameSetup(): string {
  const selectedCharacter = CHARACTERS[uiState.selectedCharacterId];
  const selectedRole = ROLES[uiState.selectedRoleId];
  return `
    <section class="pre-game-panel" aria-label="开局选择">
      <header class="pre-game-header">
        <div>
          <strong>选择角色与身份</strong>
          <span>选好你的开局席位，其余 4 名对手自动补齐。</span>
        </div>
        <button class="control-btn primary" data-action="start-selected-game" type="button">开始对局</button>
      </header>
      <div class="pre-game-body">
        <section class="pre-game-column character-picker" aria-label="选择角色">
          <div class="pre-game-section-title">
            <b>角色</b>
            <span>${escapeHtml(selectedCharacter.name)} · ${factionName(selectedCharacter.faction)} · ${selectedCharacter.maxHp}支持率</span>
          </div>
          <div class="character-choice-grid">
            ${CHARACTER_ORDER.map((id) => renderCharacterChoice(id)).join("")}
          </div>
        </section>
        <section class="pre-game-column role-picker" aria-label="选择身份">
          <div class="pre-game-section-title">
            <b>身份</b>
            <span>${escapeHtml(selectedRole.name)} · ${escapeHtml(selectedRole.objective)}</span>
          </div>
          <div class="role-choice-grid">
            ${(Object.keys(ROLES) as RoleId[]).map((id) => renderRoleChoice(id)).join("")}
          </div>
          <div class="pre-game-summary">
            <b>本局身份</b>
            <span>总1 · 幕1 · 反2 · 资1</span>
            <small>总统明置；若你不是总统，总统先行动。</small>
          </div>
        </section>
      </div>
    </section>
  `;
}

function renderCharacterChoice(id: CharacterId): string {
  const character = CHARACTERS[id];
  const selected = uiState.selectedCharacterId === id;
  const skillLabels = character.skillText.map((text, index) => shortSkillLabel(skillTextLabel(text, character.skills[index]), character.skills[index]));
  return `
    <button class="character-choice ${selected ? "selected" : ""}" data-select-character="${id}" type="button">
      <div class="character-choice-art">
        ${renderArt(character.art.src, character.art.alt, "image")}
        <span>${initials(character.name)}</span>
      </div>
      <div class="character-choice-copy">
        <strong>${escapeHtml(character.name)}</strong>
        <span>${factionLabel(character.faction)} · ${character.maxHp}支持率</span>
        <small>${skillLabels.map((label) => `【${escapeHtml(label)}】`).join("")}</small>
      </div>
    </button>
  `;
}

function renderRoleChoice(id: RoleId): string {
  const role = ROLES[id];
  const selected = uiState.selectedRoleId === id;
  return `
    <button class="role-choice ${selected ? "selected" : ""}" data-select-role="${id}" data-role="${id}" type="button">
      <i>${escapeHtml(role.name.slice(0, 1))}</i>
      <strong>${escapeHtml(role.name)}</strong>
      <span>${roleCountLabel(id)}</span>
      <small>${escapeHtml(role.objective)}</small>
    </button>
  `;
}

function roleCountLabel(id: RoleId): string {
  const count = FIVE_PLAYER_ROLES.filter((roleId) => roleId === id).length;
  return `本局 ${count} 名`;
}

function renderLogsModal(): string {
  return `
    <div class="modal-backdrop">
      <section class="game-modal log-modal" role="dialog" aria-modal="true" aria-label="牌局记录">
        <header><strong>牌局记录</strong><button data-action="close-modal" type="button">×</button></header>
        <ol>${game.state.logs.slice(-80).reverse().map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ol>
      </section>
    </div>
  `;
}

function renderMenuModal(): string {
  return `
    <div class="modal-backdrop">
      <section class="game-modal menu-modal" role="dialog" aria-modal="true" aria-label="菜单">
        <header><strong>菜单</strong><button data-action="close-modal" type="button">×</button></header>
        <div class="menu-grid">
          <button class="control-btn primary" data-action="new-game" type="button">新局</button>
          <button class="control-btn" data-action="fullscreen" type="button">全屏</button>
          <button class="control-btn" data-action="logs" type="button">记录</button>
        </div>
      </section>
    </div>
  `;
}

function renderCardModal(card: CardInstance, owner: PlayerState): string {
  const def = getCardDef(card);
  const effective = game.effectiveCardName(owner, card);
  return `
    <div class="modal-backdrop">
      <section class="game-modal card-modal" role="dialog" aria-modal="true" aria-label="卡牌详情">
        <header><strong>${def.name}</strong><button data-action="close-modal" type="button">×</button></header>
        <div class="card-detail-layout">
          <div class="card fullskin detail-card ${def.category} ${card.suit}">${renderCardInner(card, owner)}</div>
          <div class="detail-copy">
            <b>${effective !== def.name ? `可当【${effective}】使用` : def.shortText}</b>
            <p>${escapeHtml(def.detailText)}</p>
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderResultModal(): string {
  return `
    <div class="modal-backdrop result-backdrop">
      <section class="game-modal result-modal" role="dialog" aria-modal="true" aria-label="牌局结果">
        <header><strong>牌局结束</strong></header>
        <h1>${escapeHtml(game.state.winText ?? "对局结束")}</h1>
        <div class="result-roles">
          ${game.state.players
            .map((player) => {
              const character = CHARACTERS[player.characterId];
              const role = ROLES[player.roleId];
              return `<span style="--role-color:${role.color}"><b>${role.name}</b>${escapeHtml(shortName(character.name))}</span>`;
            })
            .join("")}
        </div>
        <button class="control-btn primary" data-action="new-game" type="button">再开一局</button>
      </section>
    </div>
  `;
}

function renderHp(hp: number, maxHp: number): string {
  return Array.from({ length: maxHp }, (_, index) => `<div class="${index < hp ? "" : "lost"}"></div>`).join("");
}

function roleCounts() {
  return game.state.players.reduce(
    (acc, player) => {
      if (player.alive) acc[player.roleId] += 1;
      return acc;
    },
    { incumbent: 0, staffer: 0, challenger: 0, maverick: 0 },
  );
}

function openCard(uid: string): void {
  uiState.modal = "card";
  uiState.inspectedCardUid = uid;
  renderStable();
}

function closeModal(): void {
  uiState.modal = null;
  uiState.inspectedCardUid = undefined;
  renderStable();
}

function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen();
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && uiState.modal) closeModal();
  if (event.key.toLowerCase() === "f") toggleFullscreen();
});

function phaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    setup: "开局",
    prepare: "准备",
    judge: "判定",
    draw: "摸牌",
    play: "出牌阶段",
    discard: "弃牌阶段",
    finish: "结束",
    gameover: "结算",
  };
  return labels[phase] ?? phase;
}

function factionLabel(faction: string): string {
  const labels: Record<string, string> = {
    red: "红",
    blue: "蓝",
    capital: "商",
    historic: "史",
  };
  return labels[faction] ?? "营";
}

function factionName(faction: string): string {
  const labels: Record<string, string> = {
    red: "红营",
    blue: "蓝营",
    capital: "商业阵营",
    historic: "历史阵营",
  };
  return labels[faction] ?? "阵营";
}

function roleColor(player: PlayerState): string {
  if (!player.roleRevealed && !player.isHuman) return "unknownx";
  return {
    incumbent: "zhu",
    staffer: "zhong",
    challenger: "fan",
    maverick: "nei",
  }[player.roleId];
}

function hpCondition(hp: number, maxHp: number): string {
  if (hp <= Math.max(1, Math.floor(maxHp / 3))) return "low";
  if (hp < maxHp) return "mid";
  return "high";
}

function slotClass(slot: string): string {
  return {
    weapon: "equip1",
    armor: "equip2",
    plusMount: "equip3",
    minusMount: "equip4",
  }[slot] ?? "equip5";
}

function equipmentSlotLabel(slot: EquipmentSlot): string {
  return {
    weapon: "武器",
    armor: "防具",
    plusMount: "+1",
    minusMount: "-1",
  }[slot];
}

function seatPoint(seat: number): { x: number; y: number } {
  return [
    { x: 10, y: 78 },
    { x: 8, y: 39 },
    { x: 38, y: 19 },
    { x: 74, y: 19 },
    { x: 92, y: 40 },
  ][seat] ?? { x: 50, y: 50 };
}

function visualPoint(zone: VisualZone, playerId?: string): { x: number; y: number } {
  if (zone === "deck") return { x: 86, y: 20 };
  if (zone === "discard") return { x: 86, y: 76 };
  if (zone === "center" || zone === "revealed") return { x: 50, y: 43 };
  const player = playerId ? game.state.players.find((item) => item.id === playerId) : undefined;
  if (zone === "hand" && player?.isHuman) return { x: 50, y: 88 };
  if (zone === "hand" && player) {
    const point = seatPoint(player.seat);
    return { x: point.x, y: point.y + 9 };
  }
  if (zone === "equipment" && player) {
    const point = seatPoint(player.seat);
    return { x: point.x + 4, y: point.y + 2 };
  }
  if (zone === "judgment" && player) {
    const point = seatPoint(player.seat);
    return { x: point.x - 4, y: point.y + 2 };
  }
  if (player) return seatPoint(player.seat);
  return { x: 50, y: 43 };
}

function shortName(name: string): string {
  return name
    .replace("唐纳德·", "")
    .replace("米奇·", "")
    .replace("罗恩·", "")
    .replace("贝拉克·", "")
    .replace("卡玛拉·", "")
    .replace("乔治·", "")
    .replace("亚伯拉罕·", "")
    .replace("富兰克林·", "");
}

function verticalName(name: string): string {
  return shortName(name).replace(/[·\-\s]/g, "").slice(0, 4);
}

function initials(name: string): string {
  const compact = shortName(name).replace(/[·\-\s]/g, "");
  return compact.length > 2 ? compact.slice(0, 2) : compact;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
