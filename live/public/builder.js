// The overlay builder: turns the form into an /overlay link and keeps the preview in step.
const form = document.getElementById("builder");
const modsBox = document.getElementById("mods");
const gameSelect = document.getElementById("game");
const search = document.getElementById("mod-search");
const link = document.getElementById("link");
const preview = document.getElementById("preview");
const picked = new Set();
let mods = [];

// Start from a link someone already made, so it can be edited.
const start = new URLSearchParams(location.search);
for (const key of (start.get("mods") ?? "").split(",").filter(Boolean)) picked.add(key);
if (start.get("show")) {
  const show = new Set(start.get("show").split(","));
  for (const box of form.querySelectorAll('input[name="show"]')) box.checked = show.has(box.value);
}
for (const id of ["title", "msg", "every", "pos", "theme", "scale", "moon"]) {
  if (start.get(id) !== null) document.getElementById(id).value = start.get(id);
}

function overlayUrl() {
  const params = new URLSearchParams();
  const show = [...form.querySelectorAll('input[name="show"]:checked')].map((box) => box.value);
  params.set("show", show.join(","));
  if ((show.includes("mods") || show.includes("milestones")) && picked.size) params.set("mods", [...picked].join(","));
  const moon = document.getElementById("moon").value;
  if (show.includes("bloodmoon") && moon && moon !== "7") params.set("moon", moon);
  for (const id of ["title", "msg"]) {
    const value = document.getElementById(id).value.trim();
    if (value) params.set(id, value);
  }
  const every = document.getElementById("every").value;
  if (every && every !== "15") params.set("every", every);
  for (const [id, fallback] of [["pos", "br"], ["theme", "dark"], ["scale", "1"]]) {
    const value = document.getElementById(id).value;
    if (value !== fallback) params.set(id, value);
  }
  return `${location.origin}/overlay?${params}`;
}

let previewTimer;
function update() {
  const url = overlayUrl();
  link.value = url;
  document.getElementById("scale-out").textContent = `${Math.round(Number(document.getElementById("scale").value) * 100)}%`;
  document.getElementById("mod-count").textContent = picked.size ? `(${picked.size} picked)` : "";
  document.getElementById("mods-box").hidden = !form.querySelector('input[value="mods"]').checked && !form.querySelector('input[value="milestones"]').checked;
  document.getElementById("moon-row").hidden = !form.querySelector('input[value="bloodmoon"]').checked;
  history.replaceState(null, "", `?${new URL(url).searchParams}`);
  clearTimeout(previewTimer);
  // The preview adds demo=1 so the alert and the countdown show an example straight away.
  previewTimer = setTimeout(() => (preview.src = `${url}&demo=1`), 300);
}

function renderMods() {
  const game = gameSelect.value;
  const words = search.value.trim().toLowerCase();
  const shown = mods.filter((mod) => (!game || mod.game === game) && (!words || mod.name.toLowerCase().includes(words)));
  modsBox.replaceChildren(
    ...shown.map((mod) => {
      const box = Object.assign(document.createElement("input"), { type: "checkbox", value: mod.key, checked: picked.has(mod.key) });
      box.addEventListener("change", () => {
        if (box.checked) picked.add(mod.key);
        else picked.delete(mod.key);
        update();
      });
      const label = document.createElement("label");
      label.className = "check";
      const meta = Object.assign(document.createElement("small"), { textContent: game ? `v${mod.version}` : `${mod.gameName} · v${mod.version}` });
      label.append(box, ` ${mod.name} `, meta);
      return label;
    }),
  );
  if (!shown.length) modsBox.textContent = "No mods match.";
}

async function loadMods() {
  try {
    const response = await fetch("/api/mods");
    if (!response.ok) throw new Error(String(response.status));
    mods = (await response.json()).mods;
    const games = [...new Map(mods.map((mod) => [mod.game, mod.gameName])).entries()];
    gameSelect.append(...games.map(([value, name]) => Object.assign(document.createElement("option"), { value, textContent: name })));
    const firstPicked = mods.find((mod) => picked.has(mod.key));
    if (firstPicked) gameSelect.value = firstPicked.game;
    renderMods();
  } catch {
    modsBox.textContent = "The mod list couldn't load. Refresh to try again.";
  }
}

// The preview iframe draws the overlay at 1920 x 1080 and is scaled down to fit.
function fitPreview() {
  const box = document.getElementById("preview-box");
  preview.style.transform = `scale(${box.clientWidth / 1920})`;
}

form.addEventListener("input", update);
form.addEventListener("submit", (event) => event.preventDefault());
gameSelect.addEventListener("change", renderMods);
search.addEventListener("input", renderMods);
document.getElementById("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(link.value);
    document.getElementById("copied").textContent = "Copied. Paste it into an OBS Browser source.";
  } catch {
    link.select();
    document.getElementById("copied").textContent = "Press Ctrl+C to copy.";
  }
});
new ResizeObserver(fitPreview).observe(document.getElementById("preview-box"));

update();
loadMods();
