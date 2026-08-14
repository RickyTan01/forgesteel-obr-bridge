import OBR, { BoundingBox, Image, Item, buildImage, isImage } from "@owlbear-rodeo/sdk";
import { getPluginId } from "../getPluginId";
import type { HeroCondition } from "../warehouse/warehouseClient";
import { conditionDisplayName } from "../logic/conditionDisplay";

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

// Internal SVG drawing resolution — independent of the badge's declared
// ImageContent width/height (which varies per token, see buildBadgeItem).
// SVGs are vector/resolution-independent, so this only affects crispness.
const BADGE_SVG_PX = 64;

const GLYPH_OVERRIDES: Record<string, string> = {
  Bleeding: "Bl",
  Dazed: "Dz",
  Frightened: "Fr",
  Grabbed: "Gb",
  Prone: "Pr",
  Restrained: "Rs",
  Slowed: "Sl",
  Taunted: "Tn",
  Weakened: "Wk",
};

function glyphFor(condition: HeroCondition): string {
  const override = GLYPH_OVERRIDES[condition.type];
  if (override) return override;
  const name = conditionDisplayName(condition);
  return (name.trim().slice(0, 2) || "?").toUpperCase();
}

/** Deterministic per-condition color so the same condition always renders the same way. */
function colorFor(condition: HeroCondition): string {
  const name = conditionDisplayName(condition);
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return `hsl(${hash % 360}, 65%, 42%)`;
}

function buildBadgeSvgDataUri(condition: HeroCondition): string {
  const glyph = glyphFor(condition);
  const color = colorFor(condition);
  const fontSize = glyph.length > 1 ? 22 : 28;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BADGE_SVG_PX}" height="${BADGE_SVG_PX}" viewBox="0 0 ${BADGE_SVG_PX} ${BADGE_SVG_PX}">` +
    `<circle cx="32" cy="32" r="29" fill="${color}" stroke="#14141c" stroke-width="4"/>` +
    `<text x="32" y="33" text-anchor="middle" dominant-baseline="central" font-family="system-ui, sans-serif" font-size="${fontSize}" font-weight="700" fill="#fff">${glyph}</text>` +
    `</svg>`;
  // base64, not a percent-encoded ";utf8," data URI — OBR's own image loader
  // does a real fetch() of this URL and choked on the non-standard MIME
  // parameter (";utf8" isn't valid; should be ";charset=utf-8" at best),
  // silently falling back to its broken-image placeholder for every badge.
  const base64 = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${base64}`;
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
    { width: pixelSize, height: pixelSize, mime: "image/svg+xml", url: buildBadgeSvgDataUri(condition) },
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
