import OBR, { Image, Item, Math2, Vector2, buildImage, isImage } from "@owlbear-rodeo/sdk";
import { getPluginId } from "../getPluginId";
import { toAbsoluteUrl } from "../toAbsoluteUrl";
import type { HeroCondition } from "../warehouse/warehouseClient";
import { conditionDisplayName } from "../logic/conditionDisplay";

// PNG, not SVG: OBR's item-image loader (unlike its context-menu/action
// icon loader) uploads scene images to a WebGL texture via
// createImageBitmap(), which does not support vector formats at all —
// confirmed live ("DOMException: The image could not be decoded" for every
// badge). Vite's default *.svg/*.png import both resolve to a URL string
// (see vite/client.d.ts); the file being emitted as a real, separately
// hosted asset rather than inlined as a base64 data: URI is controlled by
// build.assetsInlineLimit in vite.config.ts, not by anything at the import
// site.
import bleedingIcon from "./conditionIcons/bleeding.png";
import dazedIcon from "./conditionIcons/dazed.png";
import frightenedIcon from "./conditionIcons/frightened.png";
import grabbedIcon from "./conditionIcons/grabbed.png";
import proneIcon from "./conditionIcons/prone.png";
import restrainedIcon from "./conditionIcons/restrained.png";
import slowedIcon from "./conditionIcons/slowed.png";
import tauntedIcon from "./conditionIcons/taunted.png";
import weakenedIcon from "./conditionIcons/weakened.png";
import genericIcon from "./conditionIcons/generic.png";

const BADGE_METADATA_KEY = getPluginId("condition-badge");

type BadgeMetadata = { conditionId: string; slot: number };

function readBadgeMetadata(item: Item): BadgeMetadata | undefined {
  return item.metadata[BADGE_METADATA_KEY] as BadgeMetadata | undefined;
}

export type PairedToken = {
  token: Item;
  conditions: HeroCondition[];
};

// Badge size, as a fraction of the TOKEN's own computed world size — not a
// fraction of the scene's grid cell. Tried grid-cell-relative sizing first
// and it rendered enormous: this specific token's own grid.dpi doesn't
// correspond to a full scene grid cell (Draw Steel Tools' portrait/stat-
// bubble tokens aren't necessarily sized at 1 cell), so a badge sized
// against "a fraction of 1 full cell" can dwarf a token that itself renders
// much smaller than that. Sizing against the token's own computed
// dimensions instead (tokenWorldSize below) scales correctly regardless.
const BADGE_SIZE_FRACTION = 0.3;
const BADGE_SPACING_FRACTION = BADGE_SIZE_FRACTION * 1.15;

// Static files, not inline data URIs or generated-at-runtime SVG — OBR's
// item-image loader routes image URLs through its own fetch/CDN pipeline
// (same as every real image on the scene, visible as the images.owlbear.rodeo
// resize/crop requests in the network tab) and decodes them via
// createImageBitmap() for texture upload, neither of which a data: URI or an
// SVG source can go through (see the import comment above and project
// memory). Every real OBR extension inspected for reference
// (kgbergman/conditionmarkers' markers) uses PNG for scene-item images for
// the same reason. Provided art (user-supplied, 1024x1024 with an existing
// alpha channel — no background removal needed); "generic" is the provided
// "Surprised" icon repurposed as the Custom/Quick fallback, since Forge
// Steel has no "Surprised" condition. The declared width/height in
// buildBadgeItem is a logical size for grid/dpi math, not the source
// file's real resolution (confirmed against kgbergman/conditionmarkers,
// which does the same) — the browser downscales the real 1024x1024 image
// to fit, so no resizing was needed either.
const ICON_BY_CONDITION_TYPE: Record<string, string> = {
  Bleeding: bleedingIcon,
  Dazed: dazedIcon,
  Frightened: frightenedIcon,
  Grabbed: grabbedIcon,
  Prone: proneIcon,
  Restrained: restrainedIcon,
  Slowed: slowedIcon,
  Taunted: tauntedIcon,
  Weakened: weakenedIcon,
};

function iconFor(condition: HeroCondition): string {
  const path = ICON_BY_CONDITION_TYPE[condition.type] ?? genericIcon;
  return toAbsoluteUrl(path);
}

/**
 * These two mirror Draw Steel Tools' own token-overlay math exactly (see
 * SeamusFinlayson/draw-steel-tools-2's
 * src/background/overlays/mathHelpers.ts, getImageDimensions/
 * getImageCenter) — needed because a token's declared `.position` is NOT
 * necessarily its visual center. It's whatever point `grid.offset`
 * designates as the anchor, which does not coincide with the image's own
 * pixel-center for these DST-managed portrait/stat-bubble tokens.
 * Confirmed live: treating `.position` as center placed badges far from
 * the visible token (near an entirely different one on the same scene).
 */
function tokenWorldSize(token: Image, sceneDpi: number): { width: number; height: number } {
  const dpiScale = sceneDpi / token.grid.dpi;
  return {
    width: Math.abs(token.image.width * dpiScale * token.scale.x),
    height: Math.abs(token.image.height * dpiScale * token.scale.y),
  };
}

function tokenWorldCenter(token: Image, sceneDpi: number): Vector2 {
  let center: Vector2 = { x: token.image.width / 2, y: token.image.height / 2 };
  center = Math2.subtract(center, token.grid.offset);
  center = Math2.multiply(center, sceneDpi / token.grid.dpi);
  center = Math2.multiply(center, token.scale);
  center = Math2.rotate(center, { x: 0, y: 0 }, token.rotation);
  center = Math2.add(center, token.position);
  return center;
}

/**
 * Left-to-right starting above the token's top-left corner, one slot per
 * badge, sitting entirely above the token — badge's bottom edge is flush
 * with the token's top edge rather than overlapping it.
 */
function badgePosition(token: Image, sceneDpi: number, badgeSize: number, spacing: number, slot: number) {
  const size = tokenWorldSize(token, sceneDpi);
  const center = tokenWorldCenter(token, sceneDpi);
  const startX = center.x - size.width / 2 + badgeSize / 2;
  const y = center.y - size.height / 2 - badgeSize / 2;
  return { x: startX + slot * spacing, y };
}

function buildBadgeItem(token: Image, condition: HeroCondition, slot: number, sceneDpi: number): Item {
  const tokenSize = tokenWorldSize(token, sceneDpi);
  const badgeSize = Math.min(tokenSize.width, tokenSize.height) * BADGE_SIZE_FRACTION;
  const spacing = badgeSize * (BADGE_SPACING_FRACTION / BADGE_SIZE_FRACTION);

  // TEMPORARY: four size formulas in a row have all rendered oversized
  // despite checking out algebraically each time — logging the actual raw
  // inputs to find out which assumption about this token's real
  // image/grid/scale values is wrong, instead of continuing to guess.
  console.log("[FS Bridge] badge size debug", {
    tokenImage: { width: token.image.width, height: token.image.height },
    tokenGrid: token.grid,
    tokenScale: token.scale,
    tokenRotation: token.rotation,
    tokenPosition: token.position,
    sceneDpi,
    computedTokenSize: tokenSize,
  });

  // Reuse the token's own grid.dpi for the badge's grid (rather than
  // inventing a custom one) so it cancels out of the rendered-size formula
  // algebraically — size is then controlled purely by .scale(), computed
  // from the token's own pixel dimensions directly. The previous attempt
  // computed a custom per-badge dpi (solved from tokenWorldSize's formula,
  // assuming scale stays at the builder's default {1,1}) and rendered
  // roughly 20x too large — this sidesteps needing to trust that inverse
  // computation at all, matching kgbergman/conditionmarkers' approach
  // (reuse attached.grid, drive size via .scale()) more precisely instead
  // of only in spirit.
  const minTokenPixelDim = Math.min(token.image.width * token.scale.x, token.image.height * token.scale.y);
  const badgeScale = (BADGE_SIZE_FRACTION * minTokenPixelDim) / 64;

  const metadata: BadgeMetadata = { conditionId: condition.id, slot };
  return buildImage(
    { width: 64, height: 64, mime: "image/png", url: iconFor(condition) },
    token.grid
  )
    .scale({ x: badgeScale, y: badgeScale })
    .position(badgePosition(token, sceneDpi, badgeSize, spacing, slot))
    .attachedTo(token.id)
    .layer("ATTACHMENT")
    .disableHit(true)
    .name(`Condition: ${conditionDisplayName(condition)}`)
    .metadata({ [BADGE_METADATA_KEY]: metadata })
    .build();
}

function nextFreeSlot(usedSlots: Set<number>): number {
  let slot = 0;
  while (usedSlots.has(slot)) slot++;
  usedSlots.add(slot);
  return slot;
}

/**
 * Reconciles condition badges against the given paired tokens: removes
 * badges for conditions that ended or tokens that are no longer paired
 * (badges on tokens deleted outright are cleaned up by OBR itself, via the
 * default DELETE attachment behavior), and adds badges for new conditions.
 * Untouched badges are left exactly as they are — no repositioning pass —
 * to avoid needless updateItems calls fighting other extensions or causing
 * flicker on every poll.
 */
export async function syncConditionBadges(pairedTokens: PairedToken[]): Promise<void> {
  const [allBadges, sceneDpi] = await Promise.all([
    OBR.scene.items.getItems<Item>((item) => readBadgeMetadata(item) !== undefined),
    OBR.scene.grid.getDpi(),
  ]);

  const badgesByToken = new Map<string, Item[]>();
  for (const badge of allBadges) {
    if (!badge.attachedTo) continue;
    const list = badgesByToken.get(badge.attachedTo) ?? [];
    list.push(badge);
    badgesByToken.set(badge.attachedTo, list);
  }

  const pairedTokenIds = new Set(pairedTokens.map((p) => p.token.id));
  const toDelete: string[] = [];
  const toAdd: Item[] = [];

  // Badges on tokens that still exist but are no longer in the paired set
  // (unlinked, or hero fetch failed this pass).
  for (const [tokenId, badges] of badgesByToken) {
    if (!pairedTokenIds.has(tokenId)) {
      toDelete.push(...badges.map((b) => b.id));
    }
  }

  for (const { token, conditions } of pairedTokens) {
    if (!isImage(token)) continue; // getHeroTokens() only returns images, but keep the type honest

    const existing = badgesByToken.get(token.id) ?? [];
    const existingByConditionId = new Map(
      existing.map((b) => [readBadgeMetadata(b)!.conditionId, b])
    );
    const currentConditionIds = new Set(conditions.map((c) => c.id));

    const usedSlots = new Set<number>();
    for (const [conditionId, badge] of existingByConditionId) {
      if (currentConditionIds.has(conditionId)) {
        usedSlots.add(readBadgeMetadata(badge)!.slot);
      } else {
        toDelete.push(badge.id);
      }
    }

    for (const condition of conditions) {
      if (existingByConditionId.has(condition.id)) continue;
      const slot = nextFreeSlot(usedSlots);
      toAdd.push(buildBadgeItem(token, condition, slot, sceneDpi));
    }
  }

  if (toDelete.length > 0) await OBR.scene.items.deleteItems(toDelete);
  if (toAdd.length > 0) await OBR.scene.items.addItems(toAdd);
}

export async function clearAllConditionBadges(): Promise<void> {
  const badges = await OBR.scene.items.getItems<Item>((item) => readBadgeMetadata(item) !== undefined);
  if (badges.length > 0) await OBR.scene.items.deleteItems(badges.map((b) => b.id));
}
