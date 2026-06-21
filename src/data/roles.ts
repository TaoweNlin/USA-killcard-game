import { identityArt } from "./assets";
import type { RoleDefinition, RoleId } from "./types";

export const ROLES: Record<RoleId, RoleDefinition> = {
  incumbent: {
    id: "incumbent",
    name: "总统",
    originalName: "总统",
    color: "#be123c",
    objective: "清除所有反对和资本。",
    art: identityArt("incumbent", "总统身份牌"),
  },
  staffer: {
    id: "staffer",
    name: "幕僚",
    originalName: "幕僚",
    color: "#d97706",
    objective: "保护总统，击败反对和资本。",
    art: identityArt("staffer", "幕僚身份牌"),
  },
  challenger: {
    id: "challenger",
    name: "反对",
    originalName: "反对",
    color: "#16a34a",
    objective: "推翻总统。",
    art: identityArt("challenger", "反对身份牌"),
  },
  maverick: {
    id: "maverick",
    name: "资本",
    originalName: "资本",
    color: "#2563eb",
    objective: "先清场，最后单挑并击败总统。",
    art: identityArt("maverick", "资本身份牌"),
  },
};

export const FIVE_PLAYER_ROLES: RoleId[] = ["incumbent", "staffer", "challenger", "challenger", "maverick"];
