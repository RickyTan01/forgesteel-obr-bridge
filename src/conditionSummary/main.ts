import OBR from "@owlbear-rodeo/sdk";
import { getTokenConditions } from "../obr/tokenConditions";
import { conditionDisplayName, conditionEndsLabel } from "../logic/conditionDisplay";
import "./style.css";

const root = document.getElementById("root")!;

// Context-menu embeds (unlike a popover opened from onClick) get no
// per-invocation data — just a static URL, registered once. The embedded
// page has to ask OBR itself which item is selected, and re-render if that
// selection changes while the flyout is open — same pattern
// SeamusFinlayson/draw-steel-tools-2 uses for its own "Edit Hero" embed
// (src/helpers/getSelectedItem.ts, usePlayerSelection.ts).
async function render(): Promise<void> {
  const selection = (await OBR.player.getSelection()) ?? [];
  const itemId = selection[0];

  root.innerHTML = "";

  if (!itemId) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No token selected.";
    root.appendChild(empty);
    return;
  }

  const [items, tokenConditions] = await Promise.all([
    OBR.scene.items.getItems([itemId]),
    getTokenConditions(),
  ]);
  const item = items[0];
  const conditions = tokenConditions[itemId];

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = item?.name ?? "Conditions";
  root.appendChild(title);

  if (conditions === undefined || conditions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = conditions === undefined ? "Not synced yet." : "No active conditions.";
    root.appendChild(empty);
    return;
  }

  const list = document.createElement("div");
  list.className = "list";
  for (const condition of conditions) {
    const row = document.createElement("div");
    row.className = "row";

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = conditionDisplayName(condition);

    const ends = document.createElement("span");
    ends.className = "ends";
    ends.textContent = conditionEndsLabel(condition);

    row.append(name, ends);
    list.appendChild(row);
  }
  root.appendChild(list);
}

OBR.onReady(() => {
  render();
  OBR.player.onChange(() => render());
  OBR.room.onMetadataChange(() => render()); // conditions cache (tokenConditions.ts) updates
});
