import { AmericaKillGame } from "../game/engine";
import { CARD_BLUEPRINTS, CARD_DEFS } from "../data/cards";
import type { ActionStep, CardId, CardInstance, VisualEventKind } from "../data/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertVisualEvent(game: AmericaKillGame, kind: VisualEventKind, message: string): void {
  assert(
    game.state.currentVisual?.kind === kind || game.state.visualQueue.some((visual) => visual.kind === kind),
    message,
  );
}

function renderText(game: AmericaKillGame): any {
  return JSON.parse(game.renderGameToText());
}

function activateDeferredInteraction(game: AmericaKillGame, message: string): void {
  const initial = renderText(game);
  assert(initial.deferredInteraction, `${message}: expected a deferred human interaction before presentation finishes`);
  assert(!game.state.pending && !game.state.pendingChoice, `${message}: human window should not be active while presentation is pending`);
  for (let guard = 0; guard < 80 && !game.state.pending && !game.state.pendingChoice; guard += 1) {
    game.advanceTime(1000);
  }
  assert(game.state.pending || game.state.pendingChoice, `${message}: human window should activate after presentation finishes`);
  const active = renderText(game);
  assert(!active.deferredInteraction, `${message}: deferred interaction should be consumed after activation`);
}

function ensureHumanWindow(game: AmericaKillGame, message: string): void {
  if (game.state.pending || game.state.pendingChoice) return;
  activateDeferredInteraction(game, message);
}

const game = new AmericaKillGame(20260616);
game.newGame(20260616);

const state = game.state;
assert(state.players.length === 5, "Expected five players");
assert(state.players[0].isHuman, "Seat 0 should be human");
assert(state.players[0].roleId === "incumbent", "Human should start as the visible incumbent in v1");
assert(state.players[0].roleRevealed, "Incumbent should be revealed");
assert(
  state.players.reduce((total, player) => total + player.hand.length, 0) >= 20,
  "Opening deal should put at least four cards per seat into circulation",
);
assert(state.phase === "play", `Expected human play phase, got ${state.phase}`);
assert(Boolean(state.prompt), "Game should expose a table prompt for the UI");
assert(state.lastAction?.tone === "turn", "Game should expose the latest action feedback");

const incumbent = state.players[0];
const challenger = state.players.find((player) => player.roleId === "challenger");
assert(challenger, "Expected a challenger");

const originalHp = challenger.hp;
game.debugDamage(challenger.id, 1, incumbent.id);
assert(challenger.hp <= originalHp, "Damage should not increase target hp");
assertVisualEvent(game, "damage", "Damage should enqueue a visual damage event");

const text = JSON.parse(game.renderGameToText());
assert(text.players.length === 5, "render_game_to_text should expose visible players");
assert(typeof text.deck === "number", "render_game_to_text should include deck count");
assert("currentVisual" in text, "render_game_to_text should expose the current visual event");
assert(typeof text.visualQueueLength === "number", "render_game_to_text should expose the visual queue length");

const customCapitalGame = new AmericaKillGame(20260620);
customCapitalGame.newGame(20260620, { humanCharacterId: "musk", humanRoleId: "maverick" });
const customHuman = customCapitalGame.state.players[0];
assert(customHuman.characterId === "musk", "Custom opening should assign the selected human character");
assert(customHuman.roleId === "maverick", "Custom opening should assign the selected human role");
assert(renderText(customCapitalGame).players[0].role === "资本", "Human role should be visible to the human in text state");
const aiRoleCounts = customCapitalGame.state.players.slice(1).reduce<Record<string, number>>((acc, player) => {
  acc[player.roleId] = (acc[player.roleId] ?? 0) + 1;
  return acc;
}, {});
assert(aiRoleCounts.incumbent === 1, "AI role pool should include one president when human is capital");
assert(aiRoleCounts.staffer === 1, "AI role pool should include one staffer when human is capital");
assert(aiRoleCounts.challenger === 2, "AI role pool should include two opposition roles when human is capital");
assert(new Set(customCapitalGame.state.players.map((player) => player.characterId)).size === 5, "Custom opening should not duplicate characters");
const customIncumbent = customCapitalGame.state.players.find((player) => player.roleId === "incumbent");
assert(customIncumbent && !customIncumbent.isHuman, "Non-president human game should have an AI president");
assert(customIncumbent.roleRevealed, "AI president should be revealed");
assert(customCapitalGame.state.currentPlayerIndex === customIncumbent.seat, "First turn should start from the president seat");

const customPresidentGame = new AmericaKillGame(20260621);
customPresidentGame.newGame(20260621, { humanCharacterId: "trump", humanRoleId: "incumbent" });
const customPresident = customPresidentGame.state.players[0];
assert(customPresident.characterId === "trump", "Custom president opening should assign the selected character");
assert(customPresident.roleId === "incumbent", "Custom president opening should assign the president role");
assert(customPresident.roleRevealed, "Human president should be revealed");
assert(customPresident.maxHp === 5, "Human president should receive +1 max support");
assert(customPresidentGame.state.currentPlayerIndex === 0, "Human president should take the first turn");

const playable = game.humanPlayableCardUids();
for (const uid of playable) {
  const card = incumbent.hand.find((item) => item.uid === uid);
  assert(card, `Playable card ${uid} should exist in hand`);
  assert(CARD_DEFS[card.defId], "Playable card should have a definition");
}

let guard = 0;
while (!game.state.winner && guard < 12) {
  const current = game.state.players[game.state.currentPlayerIndex];
  if (current.isHuman && game.state.phase === "play") game.endPhase();
  else game.advanceTime(16);
  guard += 1;
}
assert(game.state.logs.length > 0, "Game should produce logs while advancing");
assert(game.state.lastAction, "Game should keep action feedback while advancing");

function testCard(defId: CardId, uid: string): CardInstance {
  const blueprint = CARD_BLUEPRINTS.find((card) => card.defId === defId);
  assert(blueprint, `Missing blueprint for ${defId}`);
  return { ...blueprint, uid };
}

const responseGame = new AmericaKillGame(99);
responseGame.newGame(99);
const responseHuman = responseGame.state.players[0];
const responseAi = responseGame.state.players[1];
responseAi.characterId = "trump";
const aiSpray = { ...testCard("spray", "test-ai-spray"), suit: "heart" as const };
const humanWash = testCard("wash", "test-human-wash");
responseAi.hand = [aiSpray];
responseHuman.hand = [humanWash];
responseHuman.hp = responseHuman.maxHp;
responseGame.state.currentPlayerIndex = responseAi.seat;
responseGame.state.phase = "play";
const beforeWashHp = responseHuman.hp;
responseGame.playCard(aiSpray.uid, [responseHuman.id]);
let deferredText = renderText(responseGame);
assert(deferredText.deferredInteraction?.kind === "response", "AI spray should defer the human wash response until presentation catches up");
assert(deferredText.deferredInteraction.cardId === "wash", "Deferred wash response should expose the requested card id");
assert(!responseGame.state.pending, "AI spray should not open the wash window before presentation catches up");
assert(responseHuman.hp === beforeWashHp, "Human should not take spray damage while the wash window is deferred");
activateDeferredInteraction(responseGame, "AI spray wash response");
const activeWashPending = (responseGame.state as any).pending;
assert(activeWashPending?.kind === "wash", "AI spray should open a human wash response window");
assert(activeWashPending.playerId === responseHuman.id, "Wash response should belong to the human target");
assert(responseGame.responsePlayableCardUids().has(humanWash.uid), "Human wash should be highlighted as a response card");
assert(responseHuman.hp === beforeWashHp, "Human should not take spray damage before responding");
responseGame.respondWithCard(humanWash.uid);
assert(!responseGame.state.pending, "Successful wash response should clear pending state");
assert(responseHuman.hp === beforeWashHp, "Wash response should prevent spray damage");
assert(responseGame.state.currentAction?.cardUid === humanWash.uid, "Response action should keep the real wash card uid for the UI");
assertVisualEvent(responseGame, "respondCard", "Wash response should enqueue a respond-card visual event");

const responseConfirmGame = new AmericaKillGame(106);
responseConfirmGame.newGame(106);
const responseConfirmHuman = responseConfirmGame.state.players[0];
const responseConfirmAi = responseConfirmGame.state.players[1];
responseConfirmAi.characterId = "trump";
const confirmAiSpray = { ...testCard("spray", "test-confirm-ai-spray"), suit: "heart" as const };
const confirmHumanWash = testCard("wash", "test-confirm-human-wash");
responseConfirmAi.hand = [confirmAiSpray];
responseConfirmHuman.hand = [confirmHumanWash];
responseConfirmHuman.hp = responseConfirmHuman.maxHp;
responseConfirmGame.state.currentPlayerIndex = responseConfirmAi.seat;
responseConfirmGame.state.phase = "play";
const beforeConfirmHp = responseConfirmHuman.hp;
responseConfirmGame.playCard(confirmAiSpray.uid, [responseConfirmHuman.id]);
activateDeferredInteraction(responseConfirmGame, "Confirm response wash window");
assert(responseConfirmGame.state.pending?.kind === "wash", "Confirm response test should open a wash window");
responseConfirmGame.selectResponseCard(confirmHumanWash.uid);
assert(responseConfirmGame.state.selectedCardUid === confirmHumanWash.uid, "Selecting a response card should store it first");
assert(responseConfirmGame.state.pending, "Selecting a response card should not resolve the pending window");
assert(responseConfirmHuman.hand.some((card) => card.uid === confirmHumanWash.uid), "Selecting a response card should not remove it from hand");
assert(responseConfirmGame.responseSelectionCanConfirm(), "Selected response card should enable confirmation");
responseConfirmGame.cancelResponseSelection();
assert(!responseConfirmGame.state.selectedCardUid, "Cancel response selection should clear the selected response card");
assert(responseConfirmGame.state.pending, "Cancel response selection should keep the pending window open");
responseConfirmGame.selectResponseCard(confirmHumanWash.uid);
responseConfirmGame.confirmResponseSelection();
assert(!responseConfirmGame.state.pending, "Confirming selected response should clear pending state");
assert(responseConfirmHuman.hp === beforeConfirmHp, "Confirmed wash response should prevent spray damage");
assert(responseConfirmGame.state.currentAction?.cardUid === confirmHumanWash.uid, "Confirmed response action should expose the selected card uid");

const declineGame = new AmericaKillGame(100);
declineGame.newGame(100);
const declineHuman = declineGame.state.players[0];
const declineAi = declineGame.state.players[1];
declineAi.characterId = "trump";
const declineSpray = { ...testCard("spray", "test-decline-spray"), suit: "heart" as const };
const nonResponseCard = { ...testCard("expose", "test-non-response"), suit: "heart" as const };
declineAi.hand = [declineSpray];
declineHuman.hand = [nonResponseCard];
declineHuman.hp = declineHuman.maxHp;
declineGame.state.currentPlayerIndex = declineAi.seat;
declineGame.state.phase = "play";
const beforeDeclineHp = declineHuman.hp;
declineGame.playCard(declineSpray.uid, [declineHuman.id]);
activateDeferredInteraction(declineGame, "Decline response wash window");
assert(declineGame.state.pending?.kind === "wash", "Human should be allowed to decline a spray response");
assert(declineGame.responsePlayableCardUids().size === 0, "No response cards should be highlighted when human has no wash");
declineGame.declineResponse();
assert(!declineGame.state.pending, "Declining should clear pending state");
assert(declineHuman.hp === beforeDeclineHp - 1, "Declining wash should apply spray damage");

const nullifyGame = new AmericaKillGame(101);
nullifyGame.newGame(101);
const nullifyHuman = nullifyGame.state.players[0];
const nullifyAi = nullifyGame.state.players[1];
nullifyAi.characterId = "trump";
const expose = { ...testCard("expose", "test-expose"), suit: "heart" as const };
const factCheck = testCard("factCheck", "test-human-fact-check");
const protectedCard = testCard("vote", "test-protected-card");
nullifyAi.hand = [expose];
nullifyHuman.hand = [factCheck, protectedCard];
nullifyGame.state.currentPlayerIndex = nullifyAi.seat;
nullifyGame.state.phase = "play";
nullifyGame.playCard(expose.uid, [nullifyHuman.id]);
activateDeferredInteraction(nullifyGame, "Fact-check response window");
assert(nullifyGame.state.pending?.kind === "factCheck", "Trick card should open a human fact-check response window");
assert(nullifyGame.responsePlayableCardUids().has(factCheck.uid), "Fact-check should be highlighted as a response card");
nullifyGame.respondWithCard(factCheck.uid);
assert(!nullifyGame.state.pending, "Fact-check response should clear pending state");
assert(nullifyHuman.hand.some((card) => card.uid === protectedCard.uid), "Nullified trick should not discard the protected target card");

const nullifyChainGame = new AmericaKillGame(104);
nullifyChainGame.newGame(104);
const chainHuman = nullifyChainGame.state.players[0];
const chainSource = nullifyChainGame.state.players[2];
const chainCounterAi = nullifyChainGame.state.players[3];
const chainExpose = { ...testCard("expose", "test-chain-expose"), suit: "heart" as const };
const chainHumanFactOne = testCard("factCheck", "test-chain-human-fact-1");
const chainHumanFactTwo = testCard("factCheck", "test-chain-human-fact-2");
const chainAiFact = testCard("factCheck", "test-chain-ai-fact");
const chainProtected = testCard("vote", "test-chain-protected");
for (const player of nullifyChainGame.state.players) player.hand = [];
chainSource.hand = [chainExpose];
chainCounterAi.hand = [chainAiFact];
chainHuman.hand = [chainHumanFactOne, chainHumanFactTwo, chainProtected];
nullifyChainGame.state.currentPlayerIndex = chainSource.seat;
nullifyChainGame.state.phase = "play";
nullifyChainGame.playCard(chainExpose.uid, [chainHuman.id]);
activateDeferredInteraction(nullifyChainGame, "First fact-check chain window");
assert(nullifyChainGame.state.pending?.kind === "factCheck", "First fact-check window should open for the human target");
assert(nullifyChainGame.responsePlayableCardUids().has(chainHumanFactOne.uid), "Human first fact-check should be playable");
nullifyChainGame.respondWithCard(chainHumanFactOne.uid);
activateDeferredInteraction(nullifyChainGame, "Second fact-check chain window");
assert(nullifyChainGame.state.pending?.kind === "factCheck", "AI counter-nullify should reopen a second human fact-check window");
assert(chainCounterAi.hand.length === 0, "AI counter fact-check should be consumed between human prompts");
assert(nullifyChainGame.responsePlayableCardUids().has(chainHumanFactTwo.uid), "Human second fact-check should be playable after counter-nullify");
nullifyChainGame.respondWithCard(chainHumanFactTwo.uid);
assert(!nullifyChainGame.state.pending, "Second human fact-check should finish the nullify chain");
assert(chainHuman.hand.some((card) => card.uid === chainProtected.uid), "Final nullified trick should leave the protected card in hand");

const voteSelfGame = new AmericaKillGame(109);
voteSelfGame.newGame(109);
const voteHuman = voteSelfGame.state.players[0];
const voteAlly = voteSelfGame.state.players.find((player) => player.roleId === "staffer");
assert(voteAlly, "Vote self-only test needs a staffer");
voteHuman.characterId = "trump";
const selfVote = testCard("vote", "test-self-vote");
voteHuman.hand = [selfVote];
voteHuman.hp = voteHuman.maxHp - 1;
voteAlly.hp = voteAlly.maxHp - 1;
confirmGameStateReady(voteSelfGame, voteHuman.seat);
voteSelfGame.selectCard(selfVote.uid);
const voteTargets = voteSelfGame.selectedLegalTargetIds();
assert(voteTargets.has(voteHuman.id), "Vote should be usable on wounded self");
assert(!voteTargets.has(voteAlly.id), "Vote should not target wounded allies during play phase");

const choiceExposeGame = new AmericaKillGame(110);
choiceExposeGame.newGame(110);
const choiceSource = choiceExposeGame.state.players[0];
const choiceTarget = choiceExposeGame.state.players[1];
const choiceExpose = testCard("expose", "test-choice-expose");
const choiceProtected = testCard("vote", "test-choice-protected");
for (const player of choiceExposeGame.state.players) player.hand = [];
choiceSource.hand = [choiceExpose];
choiceTarget.hand = [choiceProtected];
confirmGameStateReady(choiceExposeGame, choiceSource.seat);
choiceExposeGame.playCard(choiceExpose.uid, [choiceTarget.id]);
activateDeferredInteraction(choiceExposeGame, "Expose zone-card choice");
assert(choiceExposeGame.state.pendingChoice?.kind === "zoneCard", "Expose should open a zone-card choice for the human source");
assert(choiceExposeGame.choiceSelectableCardUids().has(choiceProtected.uid), "Target hand card should be selectable by uid");
choiceExposeGame.toggleChoiceCard(choiceProtected.uid);
assert(choiceExposeGame.choiceSelectionCanConfirm(), "Selecting a target zone card should enable confirmation");
choiceExposeGame.confirmChoice();
assert(!choiceTarget.hand.some((card) => card.uid === choiceProtected.uid), "Confirmed expose choice should remove selected target card");
assert(choiceExposeGame.state.discard.some((card) => card.uid === choiceProtected.uid), "Expose choice should discard the selected card");

const fundraiserChoiceGame = new AmericaKillGame(111);
fundraiserChoiceGame.newGame(111);
const fundraiserHuman = fundraiserChoiceGame.state.players[0];
fundraiserHuman.characterId = "trump";
const fundraiser = testCard("fundraiser", "test-choice-fundraiser");
const revealedVote = testCard("vote", "test-revealed-vote");
const revealedSpray = testCard("spray", "test-revealed-spray");
for (const player of fundraiserChoiceGame.state.players) player.hand = [];
fundraiserHuman.hand = [fundraiser];
fundraiserChoiceGame.state.deck.unshift(
  revealedVote,
  revealedSpray,
  testCard("wash", "test-revealed-wash"),
  testCard("expose", "test-revealed-expose"),
  testCard("poach", "test-revealed-poach"),
);
confirmGameStateReady(fundraiserChoiceGame, fundraiserHuman.seat);
fundraiserChoiceGame.playCard(fundraiser.uid, []);
activateDeferredInteraction(fundraiserChoiceGame, "Fundraiser revealed-card choice");
assert(fundraiserChoiceGame.state.pendingChoice?.kind === "revealedCard", "Fundraiser should ask the human to choose from revealed cards first");
assert(fundraiserChoiceGame.choiceSelectableCardUids().has(revealedSpray.uid), "Revealed cards should be selectable");
fundraiserChoiceGame.toggleChoiceCard(revealedSpray.uid);
fundraiserChoiceGame.confirmChoice();
assert(fundraiserHuman.hand.some((card) => card.uid === revealedSpray.uid), "Human should gain the selected fundraiser card");

const aiFundraiserTimingGame = new AmericaKillGame(124);
aiFundraiserTimingGame.newGame(124);
const aiFundraiserHuman = aiFundraiserTimingGame.state.players[0];
const aiFundraiserSource = aiFundraiserTimingGame.state.players[1];
const aiTimingFundraiser = testCard("fundraiser", "test-ai-timing-fundraiser");
const aiTimingRevealed = [
  testCard("vote", "test-ai-timing-vote"),
  testCard("spray", "test-ai-timing-spray"),
  testCard("wash", "test-ai-timing-wash"),
  testCard("expose", "test-ai-timing-expose"),
  testCard("poach", "test-ai-timing-poach"),
];
for (const player of aiFundraiserTimingGame.state.players) player.hand = [];
aiFundraiserSource.characterId = "trump";
aiFundraiserSource.hand = [aiTimingFundraiser];
aiFundraiserTimingGame.state.deck.unshift(...aiTimingRevealed);
confirmGameStateReady(aiFundraiserTimingGame, aiFundraiserSource.seat);
aiFundraiserTimingGame.playCard(aiTimingFundraiser.uid, []);
const aiFundraiserInitial = renderText(aiFundraiserTimingGame);
assert(!aiFundraiserTimingGame.state.pendingChoice, "AI fundraiser should not show the human revealed-card choice while presentation is pending");
assert(aiFundraiserInitial.deferredInteraction?.kind === "choice", "AI fundraiser should queue a deferred human choice");
assert(aiFundraiserInitial.deferredInteraction.playerId === aiFundraiserHuman.id, "Deferred fundraiser choice should belong to the human player");
assert(aiFundraiserInitial.deferredInteraction.sourceId === aiFundraiserSource.id, "Deferred fundraiser choice should keep the AI source id");
assert(aiFundraiserInitial.deferredInteraction.cardId === "fundraiser", "Deferred fundraiser choice should expose the fundraiser card id");
assert(aiFundraiserTimingGame.state.currentPlayerIndex === aiFundraiserSource.seat, "AI should not advance to the next turn while the fundraiser choice is deferred");
assert(aiFundraiserTimingGame.state.phase === "play", "AI should stay in play phase while the fundraiser choice is deferred");
activateDeferredInteraction(aiFundraiserTimingGame, "AI fundraiser revealed-card choice timing");
const activatedAiFundraiserChoice = (aiFundraiserTimingGame.state as any).pendingChoice;
assert(activatedAiFundraiserChoice?.kind === "revealedCard", "AI fundraiser should show the human revealed-card choice after presentation finishes");
assert(activatedAiFundraiserChoice.sourceId === aiFundraiserSource.id, "Activated fundraiser choice should still point to the AI source");
const aiFundraiserChoiceUid = [...aiFundraiserTimingGame.choiceSelectableCardUids()][0];
assert(aiFundraiserChoiceUid, "Activated AI fundraiser choice should expose at least one selectable revealed card");
aiFundraiserTimingGame.toggleChoiceCard(aiFundraiserChoiceUid);
aiFundraiserTimingGame.confirmChoice();
assert(aiFundraiserHuman.hand.some((card) => card.uid === aiFundraiserChoiceUid), "Human should gain the selected AI fundraiser card after confirming");

const borrowGame = new AmericaKillGame(112);
borrowGame.newGame(112);
const borrowSource = borrowGame.state.players[0];
const borrowHolder = borrowGame.state.players[1];
const borrowVictim = borrowGame.state.players[2];
const borrow = testCard("borrowAccount", "test-borrow-account");
const borrowedWeapon = testCard("repeatMic", "test-borrow-weapon");
const borrowedSpray = { ...testCard("spray", "test-borrow-spray"), suit: "heart" as const };
for (const player of borrowGame.state.players) player.hand = [];
borrowSource.hand = [borrow];
borrowHolder.equipment.weapon = borrowedWeapon;
borrowHolder.hand = [borrowedSpray];
borrowVictim.hand = [];
borrowVictim.hp = borrowVictim.maxHp;
confirmGameStateReady(borrowGame, borrowSource.seat);
borrowGame.playCard(borrow.uid, [borrowHolder.id, borrowVictim.id]);
assert(borrowVictim.hp === borrowVictim.maxHp - 1, "Borrow account should make the holder spray the selected second target");
assert(borrowHolder.equipment.weapon?.uid === borrowedWeapon.uid, "Holder keeps weapon after successfully using spray");

const debatePendingGame = new AmericaKillGame(113);
debatePendingGame.newGame(113);
const debateHuman = debatePendingGame.state.players[0];
const debateAi = debatePendingGame.state.players[1];
const debateCard = testCard("debate", "test-debate-card");
const debateHumanSpray = testCard("spray", "test-debate-human-spray");
for (const player of debatePendingGame.state.players) player.hand = [];
debateAi.hand = [debateCard];
debateHuman.hand = [debateHumanSpray];
debatePendingGame.state.currentPlayerIndex = debateAi.seat;
debatePendingGame.state.phase = "play";
debatePendingGame.playCard(debateCard.uid, [debateHuman.id]);
activateDeferredInteraction(debatePendingGame, "Debate spray response");
assert(debatePendingGame.state.pending?.kind === "spray", "Debate should ask the human target to respond with spray first");
assert(debatePendingGame.responsePlayableCardUids().has(debateHumanSpray.uid), "Human spray should be playable in debate response");
debatePendingGame.respondWithCard(debateHumanSpray.uid);
assert(!debatePendingGame.state.pending, "Debate response should clear pending state after resolution continues");

const delayedNullifyGame = new AmericaKillGame(114);
delayedNullifyGame.newGame(114);
const delayedHuman = delayedNullifyGame.state.players[0];
const delayedNullifyInvestigation = testCard("investigation", "test-delayed-nullify-investigation");
const delayedFact = testCard("factCheck", "test-delayed-nullify-fact");
for (const player of delayedNullifyGame.state.players) player.hand = [];
delayedHuman.hand = [delayedFact];
delayedHuman.judgment = [delayedNullifyInvestigation];
delayedNullifyGame.state.currentPlayerIndex = delayedHuman.seat;
delayedNullifyGame.state.phase = "finish";
delayedNullifyGame.state.currentAction = undefined;
delayedNullifyGame.state.actionQueue = [];
delayedNullifyGame.state.actionClockMs = 0;
delayedNullifyGame.state.currentVisual = undefined;
delayedNullifyGame.state.visualQueue = [];
delayedNullifyGame.state.visualClockMs = 0;
delayedNullifyGame.advanceTime(16);
ensureHumanWindow(delayedNullifyGame, "Delayed trick fact-check response");
assert(delayedNullifyGame.state.pending?.kind === "factCheck", "Delayed trick should open a fact-check window before judgment effect");
delayedNullifyGame.respondWithCard(delayedFact.uid);
assert(!delayedNullifyGame.state.pending, "Fact-checking a delayed trick should clear pending state");
assert(!delayedHuman.judgment.some((card) => card.uid === delayedNullifyInvestigation.uid), "Nullified investigation should leave the judgment area");
assert(delayedNullifyGame.state.discard.some((card) => card.uid === delayedNullifyInvestigation.uid), "Nullified investigation should enter discard pile");

const massFactCheckGame = new AmericaKillGame(115);
massFactCheckGame.newGame(115);
const massFactHuman = massFactCheckGame.state.players[0];
const massFactSource = massFactCheckGame.state.players[4];
const massFactOther = massFactCheckGame.state.players[1];
const massFactPileOn = testCard("pileOn", "test-mass-fact-pile-on");
const massFactCheck = testCard("factCheck", "test-mass-fact-check");
for (const player of massFactCheckGame.state.players) player.hand = [];
massFactSource.hand = [massFactPileOn];
massFactHuman.hand = [massFactCheck];
massFactHuman.hp = massFactHuman.maxHp;
massFactOther.hp = massFactOther.maxHp;
massFactCheckGame.state.currentPlayerIndex = massFactSource.seat;
massFactCheckGame.state.phase = "play";
massFactCheckGame.playCard(massFactPileOn.uid, []);
activateDeferredInteraction(massFactCheckGame, "Mass trick fact-check response");
assert(massFactCheckGame.state.pending?.kind === "factCheck", "Mass trick should ask fact-check before the human target effect");
massFactCheckGame.respondWithCard(massFactCheck.uid);
assert(!massFactCheckGame.state.pending, "Fact-checking one mass target should continue and finish the remaining targets");
assert(massFactHuman.hp === massFactHuman.maxHp, "Fact-check should cancel only the human's mass trick effect");
assert(massFactOther.hp === massFactOther.maxHp - 1, "Other mass trick targets should still resolve after one target is nullified");

const viewAsExposeGame = new AmericaKillGame(116);
viewAsExposeGame.newGame(116);
const viewAsHuman = viewAsExposeGame.state.players[0];
const viewAsSource = viewAsExposeGame.state.players[2];
const viewAsBlackCard = { ...testCard("wash", "test-view-as-expose-black"), suit: "spade" as const };
const viewAsFactCheck = testCard("factCheck", "test-view-as-expose-fact");
const viewAsProtected = testCard("vote", "test-view-as-expose-protected");
for (const player of viewAsExposeGame.state.players) player.hand = [];
viewAsSource.characterId = "bezos";
viewAsSource.hand = [viewAsBlackCard];
viewAsHuman.hand = [viewAsFactCheck, viewAsProtected];
viewAsExposeGame.state.currentPlayerIndex = viewAsSource.seat;
viewAsExposeGame.state.phase = "play";
viewAsExposeGame.playCard(viewAsBlackCard.uid, [viewAsHuman.id]);
activateDeferredInteraction(viewAsExposeGame, "View-as expose fact-check response");
assert(viewAsExposeGame.state.pending?.kind === "factCheck", "A view-as expose should use the effective trick id for fact-check");
viewAsExposeGame.respondWithCard(viewAsFactCheck.uid);
assert(viewAsHuman.hand.some((card) => card.uid === viewAsProtected.uid), "Nullified view-as expose should not discard the target card");
assert(viewAsExposeGame.state.discard.some((card) => card.uid === viewAsBlackCard.uid), "The original view-as card should settle after nullification");

const viewAsDelayedGame = new AmericaKillGame(117);
viewAsDelayedGame.newGame(117);
const viewAsDelayedHuman = viewAsDelayedGame.state.players[0];
const viewAsDelayedSource = viewAsDelayedGame.state.players[2];
const viewAsDiamondCard = { ...testCard("vote", "test-view-as-investigation-diamond"), suit: "diamond" as const };
const viewAsDelayedFact = testCard("factCheck", "test-view-as-investigation-fact");
for (const player of viewAsDelayedGame.state.players) player.hand = [];
viewAsDelayedSource.characterId = "gates";
viewAsDelayedSource.hand = [viewAsDiamondCard];
viewAsDelayedHuman.hand = [viewAsDelayedFact];
viewAsDelayedGame.state.currentPlayerIndex = viewAsDelayedSource.seat;
viewAsDelayedGame.state.phase = "play";
viewAsDelayedGame.playCard(viewAsDiamondCard.uid, [viewAsDelayedHuman.id]);
activateDeferredInteraction(viewAsDelayedGame, "View-as delayed fact-check response");
assert(viewAsDelayedGame.state.pending?.kind === "factCheck", "A view-as delayed trick should be fact-checkable before entering judgment");
viewAsDelayedGame.respondWithCard(viewAsDelayedFact.uid);
assert(!viewAsDelayedHuman.judgment.some((card) => card.uid === viewAsDiamondCard.uid), "Nullified view-as investigation should not enter judgment");
assert(viewAsDelayedGame.state.discard.some((card) => card.uid === viewAsDiamondCard.uid), "Nullified view-as investigation should settle the original card");

const borrowPendingGame = new AmericaKillGame(118);
borrowPendingGame.newGame(118);
const borrowPendingHuman = borrowPendingGame.state.players[0];
const borrowPendingSource = borrowPendingGame.state.players[2];
const borrowPendingVictim = borrowPendingGame.state.players[1];
const borrowPendingCard = testCard("borrowAccount", "test-borrow-pending-card");
const borrowPendingWeapon = testCard("repeatMic", "test-borrow-pending-weapon");
const borrowPendingSpray = { ...testCard("spray", "test-borrow-pending-spray"), suit: "heart" as const };
for (const player of borrowPendingGame.state.players) player.hand = [];
borrowPendingSource.hand = [borrowPendingCard];
borrowPendingHuman.equipment.weapon = borrowPendingWeapon;
borrowPendingHuman.hand = [borrowPendingSpray];
borrowPendingGame.state.currentPlayerIndex = borrowPendingSource.seat;
borrowPendingGame.state.phase = "play";
borrowPendingGame.playCard(borrowPendingCard.uid, [borrowPendingHuman.id, borrowPendingVictim.id]);
activateDeferredInteraction(borrowPendingGame, "Borrow account holder choice");
assert(borrowPendingGame.state.pendingChoice?.kind === "skillConfirm", "Borrow account should wait for a human weapon holder choice");
assert(!borrowPendingGame.state.discard.some((card) => card.uid === borrowPendingCard.uid), "Borrow account should not settle while the holder choice is pending");
borrowPendingGame.declineChoice();
assert(!borrowPendingHuman.equipment.weapon, "Declining borrow account should hand over the weapon");
assert(borrowPendingSource.hand.some((card) => card.uid === borrowPendingWeapon.uid), "Borrow account source should receive the declined weapon");
assert(borrowPendingGame.state.discard.some((card) => card.uid === borrowPendingCard.uid), "Borrow account should settle only after the human choice resolves");

const followUpPendingGame = new AmericaKillGame(119);
followUpPendingGame.newGame(119);
const followSource = followUpPendingGame.state.players[0];
const followTarget = followUpPendingGame.state.players[1];
const followWeapon = testCard("followUpMic", "test-follow-weapon");
const followSprayOne = { ...testCard("spray", "test-follow-spray-one"), suit: "heart" as const };
const followSprayTwo = { ...testCard("spray", "test-follow-spray-two"), suit: "heart" as const };
const followWash = testCard("wash", "test-follow-wash");
for (const player of followUpPendingGame.state.players) player.hand = [];
followSource.equipment.weapon = followWeapon;
followSource.hand = [followSprayOne, followSprayTwo];
followTarget.hand = [followWash];
confirmGameStateReady(followUpPendingGame, followSource.seat);
followUpPendingGame.playCard(followSprayOne.uid, [followTarget.id]);
activateDeferredInteraction(followUpPendingGame, "Follow-up mic trigger choice");
assert(followUpPendingGame.state.pendingChoice?.cardId === "followUpMic", "Follow-up mic should wait for the human trigger choice");
assert(!followUpPendingGame.state.discard.some((card) => card.uid === followSprayOne.uid), "Dodged spray should not settle before follow-up choice");
followUpPendingGame.declineChoice();
assert(followUpPendingGame.state.discard.some((card) => card.uid === followSprayOne.uid), "Dodged spray should settle after declining follow-up");

const moneyPushPendingGame = new AmericaKillGame(120);
moneyPushPendingGame.newGame(120);
const moneySource = moneyPushPendingGame.state.players[0];
const moneyTarget = moneyPushPendingGame.state.players[1];
const moneyWeapon = testCard("moneyPush", "test-money-weapon");
const moneySpray = { ...testCard("spray", "test-money-spray"), suit: "heart" as const };
const moneyCostOne = testCard("vote", "test-money-cost-one");
const moneyCostTwo = testCard("expose", "test-money-cost-two");
const moneyWash = testCard("wash", "test-money-wash");
for (const player of moneyPushPendingGame.state.players) player.hand = [];
moneySource.equipment.weapon = moneyWeapon;
moneySource.hand = [moneySpray, moneyCostOne, moneyCostTwo];
moneyTarget.hand = [moneyWash];
moneyTarget.hp = moneyTarget.maxHp;
confirmGameStateReady(moneyPushPendingGame, moneySource.seat);
moneyPushPendingGame.playCard(moneySpray.uid, [moneyTarget.id]);
activateDeferredInteraction(moneyPushPendingGame, "Money push discard-cost choice");
assert(moneyPushPendingGame.state.pendingChoice?.cardId === "moneyPush", "Money push should wait for the human discard-cost choice");
assert(!moneyPushPendingGame.state.discard.some((card) => card.uid === moneySpray.uid), "Dodged spray should not settle before money-push choice");
moneyPushPendingGame.toggleChoiceCard(moneyCostOne.uid);
moneyPushPendingGame.toggleChoiceCard(moneyCostTwo.uid);
moneyPushPendingGame.confirmChoice();
assert(moneyTarget.hp === moneyTarget.maxHp - 1, "Confirmed money push should force the dodged spray to deal damage");
assert(moneyPushPendingGame.state.discard.some((card) => card.uid === moneySpray.uid), "Money-push spray should settle after the discard cost resolves");

const cutTourPendingGame = new AmericaKillGame(121);
cutTourPendingGame.newGame(121);
const cutSource = cutTourPendingGame.state.players[0];
const cutTarget = cutTourPendingGame.state.players[1];
const cutWeapon = testCard("cutTour", "test-cut-weapon");
const cutSpray = { ...testCard("spray", "test-cut-spray"), suit: "heart" as const };
const cutMount = testCard("securityMotorcade", "test-cut-mount");
for (const player of cutTourPendingGame.state.players) player.hand = [];
cutSource.equipment.weapon = cutWeapon;
cutSource.hand = [cutSpray];
cutTarget.equipment.plusMount = cutMount;
cutTarget.hand = [];
confirmGameStateReady(cutTourPendingGame, cutSource.seat);
cutTourPendingGame.playCard(cutSpray.uid, [cutTarget.id]);
activateDeferredInteraction(cutTourPendingGame, "Cut tour mount-discard choice");
assert(cutTourPendingGame.state.pendingChoice?.cardId === "cutTour", "Cut tour should wait for the human mount-discard choice after damage");
assert(!cutTourPendingGame.state.discard.some((card) => card.uid === cutSpray.uid), "Damaging spray should not settle before cut-tour choice");
cutTourPendingGame.toggleChoiceCard(cutMount.uid);
cutTourPendingGame.confirmChoice();
assert(!cutTarget.equipment.plusMount, "Confirmed cut tour should discard the target mount");
assert(cutTourPendingGame.state.discard.some((card) => card.uid === cutSpray.uid), "Cut-tour spray should settle after the weapon choice resolves");

const draftUseGame = new AmericaKillGame(122);
draftUseGame.newGame(122);
const draftHuman = draftUseGame.state.players[0];
const draftTarget = draftUseGame.state.players[1];
const draftWeapon = testCard("draftScramble", "test-draft-use-weapon");
const draftUseOne = testCard("wash", "test-draft-use-one");
const draftUseTwo = testCard("vote", "test-draft-use-two");
for (const player of draftUseGame.state.players) player.hand = [];
draftHuman.equipment.weapon = draftWeapon;
draftHuman.hand = [draftUseOne, draftUseTwo];
draftTarget.hand = [];
draftTarget.hp = draftTarget.maxHp;
confirmGameStateReady(draftUseGame, draftHuman.seat);
assert(!draftUseGame.humanPlayableCardUids().has(draftUseOne.uid), "Draft scramble should not auto-mark wash as playable spray before choosing the weapon ability");
assert(draftUseGame.canUseDraftScramble(), "Draft scramble button should be available with two hand cards and a legal target");
draftUseGame.startDraftScrambleUse();
assert(draftUseGame.state.pendingChoice?.kind === "viewAsUse", "Draft scramble play-phase use should open a view-as-use choice");
draftUseGame.toggleChoiceCard(draftUseOne.uid);
draftUseGame.toggleChoiceCard(draftUseTwo.uid);
draftUseGame.confirmChoice();
assert(draftUseGame.state.selectedCardUid === draftUseOne.uid, "Confirming draft scramble should select the first chosen card as the view-as spray");
assert(draftUseGame.selectedLegalTargetIds().has(draftTarget.id), "Draft scramble view-as spray should expose legal spray targets");
draftUseGame.selectTarget(draftTarget.id);
draftUseGame.confirmSelectedCard();
assert(draftTarget.hp === draftTarget.maxHp - 1, "Draft scramble play-phase spray should damage an undefended target");
assert(draftUseGame.state.discard.some((card) => card.uid === draftUseOne.uid), "Draft scramble primary card should settle as the used card");
assert(draftUseGame.state.discard.some((card) => card.uid === draftUseTwo.uid), "Draft scramble second selected card should be paid as cost");

const draftResponseGame = new AmericaKillGame(123);
draftResponseGame.newGame(123);
const draftResponseHuman = draftResponseGame.state.players[0];
const draftResponseAi = draftResponseGame.state.players[1];
const draftResponseDebate = testCard("debate", "test-draft-response-debate");
const draftResponseWeapon = testCard("draftScramble", "test-draft-response-weapon");
const draftResponseOne = testCard("wash", "test-draft-response-one");
const draftResponseTwo = testCard("vote", "test-draft-response-two");
for (const player of draftResponseGame.state.players) player.hand = [];
draftResponseHuman.equipment.weapon = draftResponseWeapon;
draftResponseHuman.hand = [draftResponseOne, draftResponseTwo];
draftResponseAi.hand = [draftResponseDebate];
draftResponseGame.state.currentPlayerIndex = draftResponseAi.seat;
draftResponseGame.state.phase = "play";
draftResponseGame.playCard(draftResponseDebate.uid, [draftResponseHuman.id]);
activateDeferredInteraction(draftResponseGame, "Draft scramble response choice");
assert(draftResponseGame.state.pendingChoice?.cardId === "draftScramble", "Draft scramble should allow two hand cards as a spray response");
draftResponseGame.toggleChoiceCard(draftResponseOne.uid);
draftResponseGame.toggleChoiceCard(draftResponseTwo.uid);
draftResponseGame.confirmChoice();
assert(!draftResponseGame.state.pendingChoice, "Confirming draft scramble response should resolve the response choice");
assert(draftResponseGame.state.discard.some((card) => card.uid === draftResponseOne.uid), "Draft scramble response should discard the first selected card");
assert(draftResponseGame.state.discard.some((card) => card.uid === draftResponseTwo.uid), "Draft scramble response should discard the second selected card");

const massGame = new AmericaKillGame(102);
massGame.newGame(102);
const massHuman = massGame.state.players[0];
const massAi = massGame.state.players[1];
massAi.characterId = "trump";
const pileOn = { ...testCard("pileOn", "test-pile-on"), suit: "heart" as const };
const humanSpray = { ...testCard("spray", "test-human-spray-response"), suit: "heart" as const };
massAi.hand = [pileOn];
massHuman.hand = [humanSpray];
for (const player of massGame.state.players) {
  if (player.id !== massAi.id && player.id !== massHuman.id) player.hand = [testCard("expose", `test-mass-filler-${player.id}`)];
}
massHuman.hp = massHuman.maxHp;
massGame.state.currentPlayerIndex = massAi.seat;
massGame.state.phase = "play";
const beforeMassHp = massHuman.hp;
massGame.playCard(pileOn.uid, []);
activateDeferredInteraction(massGame, "Mass attack spray response");
assert(massGame.state.pending?.kind === "spray", "Mass attack should ask the human to respond with spray");
assert((massGame.state.pending as any).playerId === massHuman.id, "Mass attack response should belong to the human target");
assert(massGame.responsePlayableCardUids().has(humanSpray.uid), "Human spray should be highlighted for mass response");
assert(massHuman.hp === beforeMassHp, "Human should not take mass-response damage before responding");
massGame.respondWithCard(humanSpray.uid);
assert(!massGame.state.pending, "Mass response should clear pending state after human responds");
assert(massHuman.hp === beforeMassHp, "Responding to mass attack should prevent damage");
assert(massGame.state.currentAction?.cardUid === humanSpray.uid, "Mass response action should expose the response card uid");

const discardGame = new AmericaKillGame(103);
discardGame.newGame(103);
const discardHuman = discardGame.state.players[0];
discardHuman.characterId = "trump";
discardHuman.hp = 2;
discardHuman.hand = [
  testCard("spray", "test-discard-1"),
  testCard("wash", "test-discard-2"),
  testCard("vote", "test-discard-3"),
  testCard("expose", "test-discard-4"),
];
discardGame.state.currentPlayerIndex = discardHuman.seat;
discardGame.state.phase = "play";
discardGame.endPhase();
const discardPhase: string = discardGame.state.phase;
assert(discardPhase === "discard", "Ending play with too many cards should enter discard phase");
assert(discardGame.state.pendingDiscard?.requiredCount === 2, "Human discard phase should ask for excess cards");
assert(discardHuman.hand.length === 4, "Human discard should not happen before confirmation");
assert(discardGame.discardSelectableCardUids().size === 4, "All human hand cards should be selectable during discard");
discardGame.toggleDiscardCard("test-discard-1");
discardGame.toggleDiscardCard("test-discard-2");
assert(discardGame.state.pendingDiscard?.selectedCardUids.length === 2, "Selected discard count should update");
discardGame.confirmDiscardSelection();
assert(!discardGame.state.pendingDiscard, "Confirming discard should clear pending discard state");
const handAfterDiscard: number = discardHuman.hand.length;
assert(handAfterDiscard === 2, "Confirming discard should remove selected cards");
assert(discardGame.state.discard.some((card) => card.uid === "test-discard-1"), "Selected discard should enter discard pile");
assert(discardGame.state.currentPlayerIndex !== discardHuman.seat, "Confirming discard should advance to the next player");

const confirmTargetGame = new AmericaKillGame(105);
confirmTargetGame.newGame(105);
const confirmHuman = confirmTargetGame.state.players[0];
const confirmTarget = confirmTargetGame.state.players[1];
confirmTarget.characterId = "trump";
const confirmSpray = { ...testCard("spray", "test-confirm-spray"), suit: "heart" as const };
confirmHuman.hand = [confirmSpray];
confirmTarget.hand = [];
confirmTarget.hp = confirmTarget.maxHp;
confirmGameStateReady(confirmTargetGame, confirmHuman.seat);
confirmTargetGame.selectCard(confirmSpray.uid);
confirmTargetGame.cancelSelection();
assert(!confirmTargetGame.state.selectedCardUid && confirmTargetGame.state.selectedTargetIds.length === 0, "Cancel should clear selected card and target");
assert(confirmHuman.hand.some((card) => card.uid === confirmSpray.uid), "Cancel should keep the card in hand");
confirmTargetGame.selectCard(confirmSpray.uid);
confirmTargetGame.selectTarget(confirmTarget.id);
assert(!confirmHuman.hand.some((card) => card.uid === confirmSpray.uid), "Clicking a single legal target should immediately play the selected card");
assert(confirmTargetGame.state.selectedTargetIds.length === 0, "Immediate target use should clear selected targets");
assert(confirmTargetGame.state.currentAction?.cardUid === confirmSpray.uid, "Immediate target use should expose the real card uid for the UI");
assertVisualEvent(confirmTargetGame, "line", "Immediate target use should enqueue a source-to-target line visual event");
assertVisualEvent(confirmTargetGame, "useCard", "Immediate target use should enqueue a use-card visual event");
assert(!confirmTargetGame.state.visualQueue.some((visual) => visual.kind === "discardCards" && visual.cardUids?.includes(confirmSpray.uid)), "Used cards should not enqueue a duplicate discard-card visual event");

const multiTargetGame = new AmericaKillGame(125);
multiTargetGame.newGame(125);
const multiHuman = multiTargetGame.state.players[0];
const multiTargetOne = multiTargetGame.state.players[1];
const multiTargetTwo = multiTargetGame.state.players[2];
const multiSpray = { ...testCard("spray", "test-multi-spray"), suit: "heart" as const };
const multiWeapon = testCard("tripleBroadcast", "test-multi-triple-broadcast");
for (const player of multiTargetGame.state.players) player.hand = [];
multiHuman.hand = [multiSpray];
multiHuman.equipment.weapon = multiWeapon;
multiTargetOne.hand = [];
multiTargetTwo.hand = [];
confirmGameStateReady(multiTargetGame, multiHuman.seat);
multiTargetGame.selectCard(multiSpray.uid);
multiTargetGame.selectTarget(multiTargetOne.id);
assert(multiTargetGame.state.selectedTargetIds.includes(multiTargetOne.id), "Multi-target spray should store the first target instead of immediately playing");
assert(multiHuman.hand.some((card) => card.uid === multiSpray.uid), "Multi-target spray should remain in hand until confirmation");
multiTargetGame.selectTarget(multiTargetTwo.id);
assert(multiTargetGame.state.selectedTargetIds.includes(multiTargetTwo.id), "Multi-target spray should allow adding a second target before confirmation");
multiTargetGame.confirmSelectedCard();
assert(!multiHuman.hand.some((card) => card.uid === multiSpray.uid), "Confirming multi-target spray should play the card");
assertVisualEvent(multiTargetGame, "useCard", "Confirmed multi-target spray should enqueue a use-card visual event");

const judgeGame = new AmericaKillGame(108);
judgeGame.newGame(108);
const judgeHuman = judgeGame.state.players[0];
const delayedInvestigation = testCard("investigation", "test-judge-investigation");
const judgeCard = { ...testCard("vote", "test-judge-card"), suit: "heart" as const, rank: "7" as const };
for (const player of judgeGame.state.players) player.hand = [];
judgeHuman.characterId = "trump";
judgeHuman.judgment = [delayedInvestigation];
judgeGame.state.deck.unshift(judgeCard);
judgeGame.state.currentPlayerIndex = judgeHuman.seat;
judgeGame.state.phase = "finish";
judgeGame.state.currentAction = undefined;
judgeGame.state.actionQueue = [];
judgeGame.state.actionClockMs = 0;
judgeGame.state.currentVisual = undefined;
judgeGame.state.visualQueue = [];
judgeGame.state.visualClockMs = 0;
judgeGame.advanceTime(16);
assert(judgeGame.state.actionQueue.some((action) => action.kind === "judge" && action.cardUid === judgeCard.uid), "Judgment should queue a real-card judge action");
assertVisualEvent(judgeGame, "judgeFlip", "Judgment should enqueue a judge-flip visual event");
judgeGame.advanceTime(700);
const revealedJudgeAction = judgeGame.state.currentAction as ActionStep | undefined;
assert(revealedJudgeAction?.kind === "judge", "Advancing past turn start should reveal the queued judgment action");
assert(revealedJudgeAction.cardUid === judgeCard.uid, "Judgment action should expose the final judge card uid");
assert(judgeGame.state.discard.some((card) => card.uid === judgeCard.uid), "Judgment card should enter discard while remaining available for UI playback");

const dyingGame = new AmericaKillGame(107);
dyingGame.newGame(107);
const dyingHuman = dyingGame.state.players[0];
const dyingTarget = dyingGame.state.players[1];
for (const player of dyingGame.state.players) player.hand = [];
const rescueVote = testCard("vote", "test-dying-human-vote");
dyingHuman.hand = [rescueVote];
dyingTarget.hp = 1;
dyingGame.debugDamage(dyingTarget.id, 1);
activateDeferredInteraction(dyingGame, "Dying rescue response");
assert(dyingGame.state.pending?.kind === "dyingSave", "Dying target should open a human rescue window when human has vote");
const dyingPromptCount = dyingGame.state.logs.filter((line) => line.includes(`${dyingTarget.name} 进入濒死`)).length;
assert(dyingGame.responsePlayableCardUids().has(rescueVote.uid), "Vote should be playable in dying rescue window");
dyingGame.selectResponseCard(rescueVote.uid);
assert(dyingGame.responseSelectionCanConfirm(), "Selected vote should enable dying rescue confirmation");
dyingGame.confirmResponseSelection();
assert(!dyingGame.state.pending, "Confirming rescue should clear dying pending state");
assert(dyingTarget.alive && dyingTarget.hp > 0, "Confirmed vote should rescue the dying target");
assert(dyingGame.state.currentAction?.cardUid === rescueVote.uid, "Dying rescue response should expose the real vote card uid");
assertVisualEvent(dyingGame, "respondCard", "Dying rescue should enqueue a respond-card visual event");
assert(
  dyingGame.state.logs.filter((line) => line.includes(`${dyingTarget.name} 进入濒死`)).length === dyingPromptCount,
  "Successful rescue should not append another dying prompt",
);

console.log("rules-smoke ok", {
  phase: game.state.phase,
  winner: game.state.winText ?? null,
  logs: game.state.logs.slice(-3),
});

function confirmGameStateReady(game: AmericaKillGame, seat: number): void {
  game.state.currentPlayerIndex = seat;
  game.state.phase = "play";
  game.state.currentAction = undefined;
  game.state.actionQueue = [];
  game.state.actionClockMs = 0;
  game.state.currentVisual = undefined;
  game.state.visualQueue = [];
  game.state.visualClockMs = 0;
  game.state.pending = undefined;
  game.state.pendingChoice = undefined;
  game.state.pendingDiscard = undefined;
  game.state.winner = undefined;
}
