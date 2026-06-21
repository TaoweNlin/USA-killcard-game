import type { ArtRef } from "./types";

export const CARD_ASPECT_RATIO = "5 / 7";
export const CARD_SOURCE_SIZE = "750x1050";
export const CHARACTER_AVATAR_SIZE = "512x512";
export const PUBLIC_ASSET_LICENSE = "MIT";

function resolveBaseUrl(): string {
  try {
    return import.meta.env.BASE_URL;
  } catch {
    return "/";
  }
}

const baseUrl = resolveBaseUrl();

export function publicAsset(path: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.replace(/^\/+/, "");
  return `${normalizedBase}${normalizedPath}`;
}

export function gameCardArt(id: string, alt: string): ArtRef {
  return {
    src: publicAsset(`assets/cards/game/${id}.webp`),
    thumb: publicAsset(`assets/cards/game/${id}.webp`),
    alt,
    focalPoint: "50% 42%",
    credit: "USA-killcard-game bundled card art",
    license: PUBLIC_ASSET_LICENSE,
  };
}

export function characterArt(id: string, alt: string): ArtRef {
  return {
    src: publicAsset(`assets/cards/characters/${id}.webp`),
    thumb: publicAsset(`assets/cards/characters/${id}.webp`),
    alt,
    focalPoint: "50% 38%",
    credit: "USA-killcard-game bundled character art",
    license: PUBLIC_ASSET_LICENSE,
  };
}

export function identityArt(id: string, alt: string): ArtRef {
  return {
    src: publicAsset(`assets/cards/identity/${id}.webp`),
    thumb: publicAsset(`assets/cards/identity/${id}.webp`),
    alt,
    focalPoint: "50% 50%",
    credit: "USA-killcard-game bundled identity art",
    license: PUBLIC_ASSET_LICENSE,
  };
}

export function placeholderArt(type: string, alt: string): ArtRef {
  return {
    src: publicAsset(`assets/cards/placeholders/${type}.webp`),
    thumb: publicAsset(`assets/cards/placeholders/${type}.webp`),
    alt,
    focalPoint: "50% 50%",
    credit: "USA-killcard-game generated placeholder art",
    license: PUBLIC_ASSET_LICENSE,
  };
}
