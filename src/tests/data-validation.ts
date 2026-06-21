import { CARD_BLUEPRINTS, CARD_DEFS } from "../data/cards";
import { CARD_SOURCE_SIZE, CHARACTER_AVATAR_SIZE } from "../data/assets";
import { CHARACTER_ORDER, CHARACTERS } from "../data/characters";
import { FIVE_PLAYER_ROLES, ROLES } from "../data/roles";
import { ENGINE_SKILL_COVERAGE } from "../game/engine";
import type { CardId } from "../data/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertPublicAssetPath(src: string, segment: string, label: string): void {
  assert(src.includes(segment), `${label} missing ${segment} path`);
  assert(src.endsWith(".webp"), `${label} art path must point to a WebP file`);
  assert(!src.includes("\\"), `${label} art path must use web separators`);
}

const countByDef = CARD_BLUEPRINTS.reduce<Record<string, number>>((acc, card) => {
  acc[card.defId] = (acc[card.defId] ?? 0) + 1;
  return acc;
}, {});

const countByCategory = CARD_BLUEPRINTS.reduce<Record<string, number>>((acc, card) => {
  const category = CARD_DEFS[card.defId].category;
  const bucket = category === "weapon" || category === "armor" || category === "mount" ? "equipment" : category === "delayed" ? "trick" : category;
  acc[bucket] = (acc[bucket] ?? 0) + 1;
  return acc;
}, {});

const expectedCounts: Partial<Record<CardId, number>> = {
  spray: 30,
  wash: 15,
  vote: 8,
  expose: 6,
  poach: 5,
  trendBoost: 4,
  factCheck: 4,
  pileOn: 3,
  mockingLive: 1,
  debate: 3,
  borrowAccount: 2,
  fundraiser: 2,
  nationalUnity: 1,
  investigation: 3,
  blackSwan: 2,
  repeatMic: 2,
  prTeam: 2,
  securityMotorcade: 3,
  campaignJet: 3,
};

assert(CARD_BLUEPRINTS.length === 108, `Expected 108 game cards, got ${CARD_BLUEPRINTS.length}`);
assert(CARD_BLUEPRINTS.filter((card) => card.ex).length === 4, "Expected exactly 4 EX cards");
assert(countByCategory.basic === 53, `Expected 53 basic cards, got ${countByCategory.basic}`);
assert(countByCategory.trick === 36, `Expected 36 trick/delayed cards, got ${countByCategory.trick}`);
assert(countByCategory.equipment === 19, `Expected 19 equipment cards, got ${countByCategory.equipment}`);

for (const [cardId, expected] of Object.entries(expectedCounts) as Array<[CardId, number]>) {
  assert(countByDef[cardId] === expected, `Expected ${expected} ${CARD_DEFS[cardId].name}, got ${countByDef[cardId] ?? 0}`);
}

for (const card of CARD_BLUEPRINTS) {
  const def = CARD_DEFS[card.defId];
  assertPublicAssetPath(def.art.src, "assets/cards/game/", def.name);
  assert(def.art.alt.length > 0, `${def.name} missing alt text`);
}

assert(CHARACTER_ORDER.length === 22, `Expected 22 characters, got ${CHARACTER_ORDER.length}`);
for (const id of CHARACTER_ORDER) {
  const character = CHARACTERS[id];
  assert(character.name.length > 0, `${id} missing Chinese display name`);
  assertPublicAssetPath(character.art.src, "assets/cards/characters/", character.name);
  assert(character.skills.length > 0, `${character.name} missing skills`);
  for (const skill of character.skills) {
    assert(skill in ENGINE_SKILL_COVERAGE, `${character.name} has uncovered skill ${skill}`);
  }
}

assert(FIVE_PLAYER_ROLES.join(",") === "incumbent,staffer,challenger,challenger,maverick", "Five-player roles are not the classic identity mix");
for (const role of FIVE_PLAYER_ROLES) assertPublicAssetPath(ROLES[role].art.src, "assets/cards/identity/", role);

assert(CARD_SOURCE_SIZE === "750x1050", "Card image source size contract changed");
assert(CHARACTER_AVATAR_SIZE === "512x512", "Character avatar source size contract changed");

console.log("data-validation ok", {
  cards: CARD_BLUEPRINTS.length,
  ex: CARD_BLUEPRINTS.filter((card) => card.ex).length,
  categories: countByCategory,
  characters: CHARACTER_ORDER.length,
});
