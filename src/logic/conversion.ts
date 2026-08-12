import type { HeroStateFields } from "../warehouse/warehouseClient";
import type { DstHeroTokenData } from "../obr/drawSteelTokens";

/**
 * Forge Steel → Draw Steel Tools.
 * FS stores damage-taken / recoveries-used; DST stores current-value /
 * recoveries-remaining. Needs the hero's computed maximums (see
 * heroDerived.ts) since neither side stores them directly.
 */
export function heroStateToDstFields(
  state: HeroStateFields,
  maxStamina: number,
  maxRecoveries: number
): Pick<DstHeroTokenData, "stamina" | "staminaMaximum" | "temporaryStamina" | "recoveries" | "surges"> {
  return {
    stamina: maxStamina - state.staminaDamage + state.staminaTemp,
    staminaMaximum: maxStamina,
    temporaryStamina: state.staminaTemp,
    recoveries: maxRecoveries - state.recoveriesUsed,
    surges: state.surges,
  };
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
