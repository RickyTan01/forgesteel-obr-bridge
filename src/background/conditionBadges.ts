import OBR, { Image, Item, buildImage, isImage } from "@owlbear-rodeo/sdk";
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

// Badge visual size, as a fraction of one grid cell — independent of the
// badge image's own pixel resolution (BADGE_IMAGE_PX below), which only
// affects crispness.
const BADGE_IMAGE_PX = 64;
const BADGE_SIZE_GRID_FRACTION = 0.3;
const BADGE_SPACING_GRID_FRACTION = BADGE_SIZE_GRID_FRACTION * 1.15;

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
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BADGE_IMAGE_PX}" height="${BADGE_IMAGE_PX}" viewBox="0 0 ${BADGE_IMAGE_PX} ${BADGE_IMAGE_PX}">` +
    `<circle cx="32" cy="32" r="29" fill="${color}" stroke="#14141c" stroke-width="4"/>` +
    `<text x="32" y="33" text-anchor="middle" dominant-baseline="central" font-family="system-ui, sans-serif" font-size="${fontSize}" font-weight="700" fill="#fff">${glyph}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Rendered world-space size of a token, from its own image/grid/scale
 * fields — deliberately not OBR.scene.items.getItemBounds, since that would
 * include our own attachments once drawn and skew the box on every pass.
 */
function tokenWorldSize(token: Image, sceneDpi: number): { width: number; height: number } {
  const cellWidth = token.image.width / token.grid.dpi;
  const cellHeight = token.image.height / token.grid.dpi;
  return {
    width: cellWidth * token.scale.x * sceneDpi,
    height: cellHeight * token.scale.y * sceneDpi,
  };
}

/**
 * Left-to-right along the token's top edge, starting at the top-left
 * corner, one slot per badge. Assumes token.position is the image's visual
 * center, matching the default anchor OBR uses for tokens uploaded through
 * its own pipeline — an assumption worth confirming visually (see README
 * sequencing notes) against tokens with a non-default grid.offset.
 */
function badgePosition(token: Image, sceneDpi: number, slot: number) {
  const size = tokenWorldSize(token, sceneDpi);
  const badgeSize = sceneDpi * BADGE_SIZE_GRID_FRACTION;
  const spacing = sceneDpi * BADGE_SPACING_GRID_FRACTION;
  const startX = token.position.x - size.width / 2 + badgeSize / 2;
  const y = token.position.y - size.height / 2 + badgeSize / 2;
  return { x: startX + slot * spacing, y };
}

function buildBadgeItem(token: Image, condition: HeroCondition, slot: number, sceneDpi: number): Item {
  const badgeDpi = BADGE_IMAGE_PX / BADGE_SIZE_GRID_FRACTION;
  const metadata: BadgeMetadata = { conditionId: condition.id, slot };
  return buildImage(
    { width: BADGE_IMAGE_PX, height: BADGE_IMAGE_PX, mime: "image/svg+xml", url: buildBadgeSvgDataUri(condition) },
    { dpi: badgeDpi, offset: { x: BADGE_IMAGE_PX / 2, y: BADGE_IMAGE_PX / 2 } }
  )
    .position(badgePosition(token, sceneDpi, slot))
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
