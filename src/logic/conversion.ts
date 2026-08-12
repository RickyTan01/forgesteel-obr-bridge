import type { HeroDerivedFields, HeroStateFields } from "../warehouse/warehouseClient";
import type { DstHeroTokenData } from "../obr/drawSteelTokens";

/**
 * Forge Steel → Draw Steel Tools.
 * FS stores damage-taken / recoveries-used; DST stores current-value /
 * recoveries-remaining. Needs the hero's computed maximums, which Forge
 * Steel now includes directly on the hero object (see HeroDerivedFields)
 * rather than the bridge deriving them itself.
 */
export function heroStateToDstFields(
  state: HeroStateFields,
  derived: HeroDerivedFields
): Pick<
  DstHeroTokenData,
  "stamina" | "staminaMaximum" | "temporaryStamina" | "recoveries" | "surges" | "heroicResource" | "heroicResourceName"
> {
  const fields: ReturnType<typeof heroStateToDstFields> = {
    stamina: derived.staminaMax - state.staminaDamage + state.staminaTemp,
    staminaMaximum: derived.staminaMax,
    temporaryStamina: state.staminaTemp,
    recoveries: derived.recoveriesMax - state.recoveriesUsed,
    surges: state.surges,
  };
  if (derived.heroicResourceValue !== undefined) fields.heroicResource = derived.heroicResourceValue;
  if (derived.heroicResourceName !== undefined) fields.heroicResourceName = derived.heroicResourceName;
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
