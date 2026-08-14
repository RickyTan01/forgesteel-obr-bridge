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
// Steel has no "Surprised" condition.
const ICON_SOURCE_PX = 1024;
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

function computeBadgeLayout(token: Image, sceneDpi: number): { badgeSize: number; spacing: number } {
  const tokenSize = tokenWorldSize(token, sceneDpi);
  const badgeSize = Math.min(tokenSize.width, tokenSize.height) * BADGE_SIZE_FRACTION;
  const spacing = badgeSize * (BADGE_SPACING_FRACTION / BADGE_SIZE_FRACTION);
  return { badgeSize, spacing };
}

function buildBadgeItem(token: Image, condition: HeroCondition, slot: number, sceneDpi: number): Item {
  const { badgeSize, spacing } = computeBadgeLayout(token, sceneDpi);

  // Reuse the token's own grid.dpi for the badge's grid (rather than
  // inventing a custom one) so it cancels out of the rendered-size formula
  // algebraically — size is then controlled purely by .scale(), computed
  // from the token's own pixel dimensions directly, matching
  // kgbergman/conditionmarkers' approach (reuse attached.grid, drive size
  // via .scale()). Every previous attempt at this rendered wildly
  // oversized despite checking out algebraically by hand — root cause
  // (found via a console warning OBR itself logs, not something dug out
  // of the math): the declared ImageContent.width/height MUST match the
  // real source file's actual pixel dimensions. "Declared size is just a
  // logical value for grid math, independent of the real file" — the
  // assumption every earlier attempt relied on, credited to
  // kgbergman/conditionmarkers appearing to do the same — does not hold
  // in general; it only happened to work there because their backend
  // likely serves each marker image pre-sized to match. OBR logs
  // "content width 64 does not match image width 1024 rendering will be
  // wrong" when they diverge, which is exactly what every prior badge
  // here did (all declared 64x64 against these 1024x1024 source files).
  const minTokenPixelDim = Math.min(token.image.width * token.scale.x, token.image.height * token.scale.y);
  const badgeScale = (BADGE_SIZE_FRACTION * minTokenPixelDim) / ICON_SOURCE_PX;

  const metadata: BadgeMetadata = { conditionId: condition.id, slot };
  return buildImage(
    { width: ICON_SOURCE_PX, height: ICON_SOURCE_PX, mime: "image/png", url: iconFor(condition) },
    token.grid
  )
    .scale({ x: badgeScale, y: badgeScale })
    .position(badgePosition(token, sceneDpi, badgeSize, spacing, slot))
    .attachedTo(token.id)
    .layer("ATTACHMENT")
    // Purely visual — no per-badge selection/interaction. Tried making
    // badges individually clickable (disableHit(false) + a per-badge
    // context menu opening a popover), but OBR's selection UI (resize/
    // rotate handles, Transform/Align/Replace Image menu entries) can't be
    // trimmed down for an extension-created item — even locked, per live
    // testing. Not worth that UI cost for a per-marker detail view when
    // the token-level "View Conditions" summary already covers it.
    .disableHit(true)
    .name(`Condition: ${conditionDisplayName(condition)}`)
    .metadata({ [BADGE_METADATA_KEY]: metadata })
    .build();
}

/**
 * Reconciles condition badges against the given paired tokens: removes
 * badges for conditions that ended or tokens that are no longer paired
 * (badges on tokens deleted outright are cleaned up by OBR itself, via the
 * default DELETE attachment behavior), and adds badges for new conditions.
 * Whenever a token's badge set actually changes (something added or
 * removed), every remaining badge on that token is repacked into
 * consecutive slots in the hero's own condition order — so removing one
 * from the middle shifts the rest left instead of leaving a gap. A token
 * nothing changed for this pass is left completely untouched, so a steady
 * state costs zero updateItems calls.
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
  const toReposition: { id: string; slot: number; position: Vector2 }[] = [];

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

    const stale = existing.filter((b) => !currentConditionIds.has(readBadgeMetadata(b)!.conditionId));
    const isNewCondition = conditions.some((c) => !existingByConditionId.has(c.id));
    if (stale.length === 0 && !isNewCondition) continue; // steady state — nothing to do for this token

    toDelete.push(...stale.map((b) => b.id));

    const { badgeSize, spacing } = computeBadgeLayout(token, sceneDpi);
    conditions.forEach((condition, index) => {
      const badge = existingByConditionId.get(condition.id);
      if (!badge) {
        toAdd.push(buildBadgeItem(token, condition, index, sceneDpi));
        return;
      }
      if (readBadgeMetadata(badge)!.slot !== index) {
        toReposition.push({ id: badge.id, slot: index, position: badgePosition(token, sceneDpi, badgeSize, spacing, index) });
      }
    });
  }

  if (toDelete.length > 0) await OBR.scene.items.deleteItems(toDelete);
  if (toAdd.length > 0) await OBR.scene.items.addItems(toAdd);
  if (toReposition.length > 0) {
    const byId = new Map(toReposition.map((r) => [r.id, r]));
    await OBR.scene.items.updateItems(
      toReposition.map((r) => r.id),
      (items) => {
        for (const item of items) {
          const target = byId.get(item.id)!;
          item.position = target.position;
          const metadata = item.metadata[BADGE_METADATA_KEY] as BadgeMetadata;
          metadata.slot = target.slot;
        }
      }
    );
  }
}

export async function clearAllConditionBadges(): Promise<void> {
  const badges = await OBR.scene.items.getItems<Item>((item) => readBadgeMetadata(item) !== undefined);
  if (badges.length > 0) await OBR.scene.items.deleteItems(badges.map((b) => b.id));
}
