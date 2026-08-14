import OBR, { BoundingBox, Image, Item, buildImage, isImage } from "@owlbear-rodeo/sdk";
import { getPluginId } from "../getPluginId";
import type { HeroCondition } from "../warehouse/warehouseClient";
import { conditionDisplayName } from "../logic/conditionDisplay";

// Vite's default *.svg import already resolves to a URL string (see
// vite/client.d.ts) — the file actually being emitted as a real, separately
// hosted asset rather than inlined as a base64 data: URI is controlled by
// build.assetsInlineLimit in vite.config.ts, not by anything at the import
// site.
import bleedingIcon from "./conditionIcons/bleeding.svg";
import dazedIcon from "./conditionIcons/dazed.svg";
import frightenedIcon from "./conditionIcons/frightened.svg";
import grabbedIcon from "./conditionIcons/grabbed.svg";
import proneIcon from "./conditionIcons/prone.svg";
import restrainedIcon from "./conditionIcons/restrained.svg";
import slowedIcon from "./conditionIcons/slowed.svg";
import tauntedIcon from "./conditionIcons/taunted.svg";
import weakenedIcon from "./conditionIcons/weakened.svg";
import genericIcon from "./conditionIcons/generic.svg";

const BADGE_METADATA_KEY = getPluginId("condition-badge");

type BadgeMetadata = { conditionId: string; slot: number };

function readBadgeMetadata(item: Item): BadgeMetadata | undefined {
  return item.metadata[BADGE_METADATA_KEY] as BadgeMetadata | undefined;
}

export type PairedToken = {
  token: Item;
  conditions: HeroCondition[];
};

// Badge size, as a fraction of the token's own shorter side — computed from
// both the token's image pixel dimensions (for the badge's own ImageContent)
// and its actual on-scene bounds (for world-space position/spacing), with
// the token's own scale/grid copied onto the badge builder. This mirrors
// the pattern used by published OBR attachment extensions (e.g.
// kgbergman/conditionmarkers' buildConditionMarker) rather than deriving a
// world size from OBR.scene.grid.getDpi(), which turned out to be an
// unreliable way to predict an item's actual rendered size.
const BADGE_FRACTION = 0.3;
const BADGE_SPACING_FRACTION = BADGE_FRACTION * 1.15;

// Static files, not inline SVG data URIs — OBR's item-image loader routes
// image URLs through its own fetch/CDN pipeline (same as every real image
// on the scene, visible as the images.owlbear.rodeo resize/crop requests in
// the network tab); a data: URI can't participate in that and fails with
// "Unable to fetch image: Invalid URL" / "Network error may have occurred",
// confirmed against a live badge (see project memory). Every real OBR
// extension inspected for reference (Draw Steel Tools' own context-menu
// icon, kgbergman/conditionmarkers' markers) references an actual hosted
// file, never a data: URI. Colors are fixed per condition (not
// hash-derived) since these are pre-made files, not generated at runtime;
// Custom/Quick conditions (freeform text) fall back to a generic icon —
// the actual text is still shown via the click-to-reveal context menu.
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
  return ICON_BY_CONDITION_TYPE[condition.type] ?? genericIcon;
}

function buildBadgeItem(token: Image, condition: HeroCondition, slot: number, bounds: BoundingBox): Item {
  const pixelSize = Math.min(token.image.width, token.image.height) * BADGE_FRACTION;
  const worldSize = Math.min(bounds.width, bounds.height) * BADGE_FRACTION;
  const worldSpacing = worldSize * (BADGE_SPACING_FRACTION / BADGE_FRACTION);

  // Left-to-right starting above the token's top-left corner (bounds.min —
  // the token's actual on-scene box, not an assumption about its anchor
  // point), sitting entirely above it: badge's bottom edge is flush with
  // the token's top edge rather than overlapping it.
  const x = bounds.min.x + worldSize / 2 + slot * worldSpacing;
  const y = bounds.min.y - worldSize / 2;

  const metadata: BadgeMetadata = { conditionId: condition.id, slot };
  return buildImage(
    { width: pixelSize, height: pixelSize, mime: "image/svg+xml", url: iconFor(condition) },
    token.grid
  )
    .scale(token.scale)
    .position({ x, y })
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
  const allBadges = await OBR.scene.items.getItems<Item>((item) => readBadgeMetadata(item) !== undefined);

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

    const newConditions = conditions.filter((c) => !existingByConditionId.has(c.id));
    if (newConditions.length === 0) continue;

    // Bounds only fetched for tokens that actually need a new badge this
    // pass — most passes touch zero tokens.
    const bounds = await OBR.scene.items.getItemBounds([token.id]);
    for (const condition of newConditions) {
      const slot = nextFreeSlot(usedSlots);
      toAdd.push(buildBadgeItem(token, condition, slot, bounds));
    }
  }

  if (toDelete.length > 0) await OBR.scene.items.deleteItems(toDelete);
  if (toAdd.length > 0) await OBR.scene.items.addItems(toAdd);
}

export async function clearAllConditionBadges(): Promise<void> {
  const badges = await OBR.scene.items.getItems<Item>((item) => readBadgeMetadata(item) !== undefined);
  if (badges.length > 0) await OBR.scene.items.deleteItems(badges.map((b) => b.id));
}
