import type { HeroDerivedFields, HeroStateFields } from "../warehouse/warehouseClient";
import type { DstHeroTokenData } from "../obr/drawSteelTokens";

/**
 * Forge Steel → Draw Steel Tools.
 * FS stores damage-taken / recoveries-used; DST stores current-value /
 * recoveries-remaining. staminaMax/recoveriesMax/heroicResource* are NOT
 * computed here — they come straight from HeroDerivedFields, which Forge
 * Steel itself attaches when saving. If a hero predates that change, these
 * are undefined and the corresponding DST fields are simply omitted rather
 * than synced as wrong/zero values (undefined - number would be NaN).
 */
export function heroStateToDstFields(
  state: HeroStateFields,
  derived: HeroDerivedFields
): Partial<
  Pick<
    DstHeroTokenData,
    "stamina" | "staminaMaximum" | "temporaryStamina" | "recoveries" | "surges" | "heroicResource" | "heroicResourceName"
  >
> {
  const fields: ReturnType<typeof heroStateToDstFields> = {
    temporaryStamina: state.staminaTemp,
    surges: state.surges,
  };

  if (derived.staminaMax !== undefined) {
    fields.staminaMaximum = derived.staminaMax;
    fields.stamina = derived.staminaMax - state.staminaDamage;
  }
  if (derived.recoveriesMax !== undefined) {
    fields.recoveries = derived.recoveriesMax - state.recoveriesUsed;
  }
  if (derived.heroicResourceValue !== undefined) {
    fields.heroicResource = derived.heroicResourceValue;
  }
  if (derived.heroicResourceName !== undefined) {
    fields.heroicResourceName = derived.heroicResourceName;
  }

  return fields;
}

/**
 * Draw Steel Tools → Forge Steel, the reverse conversion. Only meaningful
 * once true live (bidirectional) sync is built — the session-start-only
 * version never writes in this direction.
 */
export function dstFieldsToHeroStatePatch(
  dst: DstHeroTokenData,
  maxRecoveries: number
): Partial<HeroStateFields> {
  const patch: Partial<HeroStateFields> = {};
  if (dst.staminaMaximum !== undefined && dst.stamina !== undefined) {
    const temp = dst.temporaryStamina ?? 0;
    patch.staminaDamage = dst.staminaMaximum - dst.stamina + temp;
    patch.staminaTemp = temp;
  }
  if (dst.recoveries !== undefined) {
    patch.recoveriesUsed = maxRecoveries - dst.recoveries;
  }
  if (dst.surges !== undefined) {
    patch.surges = dst.surges;
  }
  return patch;
}
