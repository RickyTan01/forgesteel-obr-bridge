import type { HeroCondition } from "../warehouse/warehouseClient";

// Forge Steel's ConditionType enum uses these two literal values for
// conditions whose real name lives in `text` instead of `type` (see
// ConditionLogic.getFullDescription in forgesteel/src/logic/condition-logic.ts) —
// mirrored here rather than imported, per the standing decision not to vendor
// Forge Steel's model/logic code into the bridge (see warehouseClient.ts).
const FREEFORM_TYPES = new Set(["Custom Condition", "Quick Condition"]);

export function conditionDisplayName(condition: HeroCondition): string {
  return FREEFORM_TYPES.has(condition.type) ? condition.text : condition.type;
}

export function conditionFullLabel(condition: HeroCondition): string {
  const name = conditionDisplayName(condition);
  switch (condition.ends) {
    case "End of turn":
      return `${name} (EoT)`;
    case "Save ends":
      return `${name} (Save ends)`;
    default:
      return name;
  }
}
