import "./style.css";

const params = new URLSearchParams(window.location.search);
const name = params.get("name") ?? "Unknown condition";
const ends = params.get("ends");

const nameEl = document.createElement("div");
nameEl.className = "condition-name";
nameEl.textContent = name;

const root = document.getElementById("root")!;
root.appendChild(nameEl);

if (ends) {
  const endsEl = document.createElement("div");
  endsEl.className = "condition-ends";
  endsEl.textContent = ends;
  root.appendChild(endsEl);
}
