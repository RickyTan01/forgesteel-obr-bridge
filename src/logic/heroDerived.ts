/**
 * ⚠️ MAINTENANCE-RISK CODE ⚠️
 *
 * Forge Steel does NOT store max stamina or max recoveries — they're computed
 * live by HeroLogic.getStamina() / HeroLogic.getRecoveries() from the hero's
 * kit, class echelon, and any Bonus-type features. The Warehouse API has no
 * endpoint that returns these already-computed, so the bridge has to derive
 * them itself from the raw hero JSON.
 *
 * This is a PARTIAL port of that logic (kit stamina × echelon only). It does
 * NOT yet walk bonus features that modify Stamina/RecoveryValue/Recoveries
 * fields (FeatureType.Bonus + FeatureField.Stamina/RecoveryValue/Recoveries
 * in forgesteel's source) — any hero with a stamina- or recovery-boosting
 * feature will get the wrong max until that's added.
 *
 * Source of truth to re-check against on every Forge Steel upstream sync:
 * https://github.com/andyaiken/forgesteel/blob/main/src/logic/hero-logic.ts
 * (search for `getStamina`, `getRecoveryValue`, `getRecoveries`, `getEchelon`)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function computeMaxStamina(hero: any): number {
  const kitStamina: number = Math.max(
    0,
    ...(hero.kits ?? []).map((k: { stamina?: number }) => k.stamina ?? 0)
  );
  const echelon = getEchelon(hero.class?.level ?? 1);
  // TODO: add FeatureType.Bonus / FeatureField.Stamina walk — see warning above
  return kitStamina * echelon;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function computeMaxRecoveries(hero: any): number {
  // TODO: port the Bonus/FeatureField.Recoveries walk — see warning above.
  // Returning 0 until ported is deliberate: better to fail loudly (obviously
  // wrong number in the UI) than silently show a plausible-but-wrong value.
  void hero;
  return 0;
}

function getEchelon(level: number): number {
  // Matches CreatureLogic.getEchelon in forgesteel: levels 1-3 => 1, 4-6 => 2,
  // 7-9 => 3, 10 => 4. Confirm against source if andyaiken changes tiering.
  if (level >= 10) return 4;
  if (level >= 7) return 3;
  if (level >= 4) return 2;
  return 1;
}
