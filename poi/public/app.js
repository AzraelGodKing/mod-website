// poi.azraelsmods.com page. Reads /api/poi every 30 seconds and draws the table, players,
// map and activity views. No libraries, nothing loaded from anywhere else.

const REFRESH_MS = 30_000;
const STATUS = {
  claimed: { icon: "⚑", label: "Claimed" },
  contested: { icon: "⚔", label: "Contested" },
  unclaimed: { icon: "○", label: "Unclaimed" },
};

const $ = (id) => document.getElementById(id);
const state = {
  data: null,
  events: [],
  labels: new Map(),
  sort: { key: "name", dir: 1 },
  filters: { q: "", status: "", tier: "", owner: "", hideTraders: false },
  paused: false,
  timer: null,
  view: "pois",
};

// ---------- helpers ----------

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (key === "dataset") Object.assign(node.dataset, value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function ago(iso, now = Date.now()) {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function dateText(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// A stable colour per player id, so the same player keeps the same colour on every visit.
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function isLight() {
  const forced = document.documentElement.dataset.theme;
  if (forced) return forced === "light";
  return window.matchMedia("(prefers-color-scheme: light)").matches;
}

// Twelve colours that stay apart from each other. Each player gets the slot their id hashes
// to, or the next free one, so two players on the server never share a colour.
const PALETTE = {
  dark: ["#5aa9e6", "#f2c14e", "#9b7ede", "#7fd46b", "#f08a5d", "#4ecdc4", "#e85d9a", "#8fa3b8", "#b0a2ff", "#ff6f61", "#f4f1ea", "#d9a066"],
  light: ["#1f6fb2", "#a87800", "#6a43c4", "#3d8a2a", "#c2551f", "#1a8a83", "#b52d6a", "#4a5d73", "#5146c9", "#c23a2e", "#2b2b2b", "#8a5a1c"],
};
const slots = new Map();

function assignColors(ids) {
  slots.clear();
  const used = new Set();
  for (const id of [...ids].sort()) {
    let slot = hash(id) % PALETTE.dark.length;
    for (let i = 0; i < PALETTE.dark.length && used.has(slot); i += 1) slot = (slot + 1) % PALETTE.dark.length;
    used.add(slot);
    slots.set(id, slot);
  }
}

function colorFor(id) {
  const palette = isLight() ? PALETTE.light : PALETTE.dark;
  const slot = slots.get(id);
  if (slot !== undefined) return palette[slot];
  const h = hash(id);
  return `hsl(${h % 360} 60% ${isLight() ? 40 : 62}%)`;
}

// "Player 1", "Player 2"... when the mod hides names, numbered by id so they stay put.
function buildLabels(data) {
  const ids = new Set();
  for (const player of data.players ?? []) ids.add(player.id);
  for (const poi of data.pois) {
    for (const ref of [poi.owner, ...(poi.coOwners ?? []), ...(poi.contested ?? [])]) if (ref) ids.add(ref.id);
  }
  const names = new Map();
  for (const player of data.players ?? []) if (player.name) names.set(player.id, player.name);
  for (const poi of data.pois) {
    for (const ref of [poi.owner, ...(poi.coOwners ?? []), ...(poi.contested ?? [])]) if (ref?.name) names.set(ref.id, ref.name);
  }
  assignColors(ids);
  const labels = new Map();
  [...ids].sort().forEach((id, index) => labels.set(id, names.get(id) ?? `Player ${index + 1}`));
  return labels;
}

function nameOf(ref) {
  if (!ref) return "";
  return state.labels.get(ref.id) ?? ref.name ?? "Unknown player";
}

function poiName(poi) {
  return poi.displayName || poi.name;
}

function who(ref) {
  if (!ref) return el("span", { class: "muted", text: "—" });
  return el("span", { class: "who" }, el("span", { class: "swatch", style: `background:${colorFor(ref.id)}`, "aria-hidden": "true" }), nameOf(ref));
}

function badge(status) {
  const info = STATUS[status] ?? { icon: "?", label: status };
  return el("span", { class: "badge", dataset: { status } }, el("span", { "aria-hidden": "true", text: info.icon }), info.label);
}

function hasCoords(data) {
  return data.settings?.showCoordinates !== false && data.pois.some((poi) => Number.isFinite(poi.x) && Number.isFinite(poi.z));
}

// ---------- data ----------

async function api(path, init) {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...init });
  if (response.status === 401) {
    const error = new Error("locked");
    error.locked = true;
    throw error;
  }
  if (response.status === 404 && path === "/api/poi") {
    const error = new Error("empty");
    error.empty = true;
    throw error;
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function load() {
  try {
    const [data, events] = await Promise.all([api("/api/poi"), api("/api/poi/events?limit=50")]);
    state.data = data;
    state.events = events.events ?? [];
    state.labels = buildLabels(data);
    show("app");
    render();
    syncTerrain();
  } catch (error) {
    if (error.locked) show("login");
    else if (error.empty) show("empty");
    else if (state.data) $("updated").textContent = `Could not refresh (${error.message}). Showing the last copy.`;
    else {
      show("empty");
      $("empty").querySelector("p").textContent = `The page could not load the data (${error.message}). It will try again shortly.`;
    }
  }
}

function show(which) {
  for (const id of ["login", "empty", "app"]) $(id).hidden = id !== which;
  if (which === "login") $("password").focus();
}

function schedule() {
  clearInterval(state.timer);
  if (!state.paused) state.timer = setInterval(load, REFRESH_MS);
}

// ---------- header and totals ----------

function renderHead() {
  const { data } = state;
  const server = data.server ?? {};
  $("server-name").textContent = server.name || "7 Days to Die server";
  const meta = $("server-meta");
  meta.replaceChildren(
    ...[server.world && `World: ${server.world}`, Number.isFinite(server.day) && `Day ${server.day}`, server.gameVersion]
      .filter(Boolean)
      .map((part) => el("span", { text: part })),
  );
  $("updated").textContent = `Updated ${ago(data.receivedAt)}${state.paused ? " (updates paused)" : ""}`;
  $("updated").title = dateText(data.receivedAt);
  const stale = $("stale");
  if (data.stale) {
    const minutes = Math.max(30, Math.round((Date.now() - Date.parse(data.receivedAt)) / 60_000));
    stale.textContent = `Data is stale: the server has not reported for ${minutes} minutes. It may be off, or the mod stopped.`;
    stale.hidden = false;
  } else stale.hidden = true;

  const pois = data.pois;
  const count = (status) => pois.filter((poi) => poi.status === status).length;
  $("t-total").textContent = pois.length;
  $("t-claimed").textContent = count("claimed");
  $("t-contested").textContent = count("contested");
  $("t-unclaimed").textContent = count("unclaimed");
  const holders = new Set();
  for (const poi of pois) for (const ref of [poi.owner, ...(poi.coOwners ?? [])]) if (ref && poi.status !== "unclaimed") holders.add(ref.id);
  $("t-players").textContent = holders.size;
}

// ---------- POI table ----------

function fillSelect(select, options, keep) {
  const first = select.options[0];
  select.replaceChildren(first, ...options.map(([value, label]) => el("option", { value, text: label })));
  select.value = options.some(([value]) => value === keep) ? keep : "";
}

function renderFilterOptions() {
  const { data, filters } = state;
  const tiers = [...new Set(data.pois.map((poi) => poi.tier).filter(Number.isFinite))].sort((a, b) => a - b);
  fillSelect($("f-tier"), tiers.map((tier) => [String(tier), `Tier ${tier}`]), filters.tier);
  const owners = new Map();
  for (const poi of data.pois) for (const ref of [poi.owner, ...(poi.coOwners ?? [])]) if (ref) owners.set(ref.id, nameOf(ref));
  const sorted = [...owners].sort((a, b) => a[1].localeCompare(b[1]));
  fillSelect($("f-owner"), sorted, filters.owner);
  filters.tier = $("f-tier").value;
  filters.owner = $("f-owner").value;
}

function matches(poi) {
  const { q, status, tier, owner, hideTraders } = state.filters;
  if (hideTraders && poi.trader) return false;
  if (status && poi.status !== status) return false;
  if (tier && String(poi.tier) !== tier) return false;
  const refs = [poi.owner, ...(poi.coOwners ?? [])].filter(Boolean);
  if (owner && !refs.some((ref) => ref.id === owner)) return false;
  if (q) {
    const hay = [poi.displayName, poi.name, ...refs.map(nameOf), ...(poi.contested ?? []).map(nameOf)].join(" ").toLowerCase();
    if (!hay.includes(q.toLowerCase())) return false;
  }
  return true;
}

const SORTS = {
  name: (poi) => poiName(poi).toLowerCase(),
  tier: (poi) => poi.tier ?? -1,
  status: (poi) => ({ contested: 0, claimed: 1, unclaimed: 2 })[poi.status] ?? 3,
  owner: (poi) => (poi.owner ? nameOf(poi.owner).toLowerCase() : "￿"),
  claims: (poi) => poi.claims ?? 0,
  since: (poi) => (poi.claimedSince ? Date.parse(poi.claimedSince) : Number.MAX_SAFE_INTEGER),
};

function renderTable() {
  const { data, sort, filters } = state;
  const pick = SORTS[sort.key];
  const rows = data.pois.filter(matches).sort((a, b) => {
    const x = pick(a);
    const y = pick(b);
    return (x < y ? -1 : x > y ? 1 : poiName(a).localeCompare(poiName(b))) * sort.dir;
  });
  for (const th of document.querySelectorAll(".pois th[data-sort]")) {
    if (th.dataset.sort === sort.key) th.setAttribute("aria-sort", sort.dir === 1 ? "ascending" : "descending");
    else th.removeAttribute("aria-sort");
  }
  $("rows").replaceChildren(
    ...rows.map((poi) =>
      el(
        "tr",
        {
          tabindex: "0",
          dataset: { status: poi.status, id: poi.id },
          "aria-label": `${poiName(poi)}, ${STATUS[poi.status]?.label ?? poi.status}${poi.owner ? `, held by ${nameOf(poi.owner)}` : ""}. Open details.`,
          onclick: () => openDetail(poi.id),
          onkeydown: (event) => rowKeys(event, poi.id),
        },
        el(
          "td",
          {},
          el("span", { class: "poi-name" }, poiName(poi), poi.trader ? el("span", { class: "tag", text: "Trader" }) : null),
          poi.displayName && poi.displayName !== poi.name ? el("span", { class: "poi-id", text: poi.name }) : null,
        ),
        el("td", { text: Number.isFinite(poi.tier) ? poi.tier : "—" }),
        el(
          "td",
          {},
          badge(poi.status),
          poi.status === "contested" && poi.contested?.length
            ? el("span", { class: "contested-by", text: `Between ${poi.contested.map(nameOf).join(" and ")}` })
            : null,
        ),
        el("td", {}, who(poi.owner)),
        el("td", {}, poi.coOwners?.length ? el("span", { class: "list-inline" }, ...poi.coOwners.map(who)) : el("span", { class: "muted", text: "—" })),
        el("td", { class: "num", text: poi.claims ?? 0 }),
        el("td", {}, poi.claimedSince ? el("time", { datetime: poi.claimedSince, title: dateText(poi.claimedSince), text: ago(poi.claimedSince) }) : el("span", { class: "muted", text: "—" })),
      ),
    ),
  );
  const active = filters.q || filters.status || filters.tier || filters.owner || filters.hideTraders;
  $("count").textContent = `Showing ${rows.length} of ${data.pois.length} POIs`;
  $("f-clear").hidden = !active;
}

function rowKeys(event, id) {
  const row = event.currentTarget;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openDetail(id);
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    row.nextElementSibling?.focus();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    row.previousElementSibling?.focus();
  }
}

// ---------- players ----------

function renderPlayers() {
  const { data } = state;
  const held = new Map();
  for (const poi of data.pois) {
    if (poi.status === "unclaimed") continue;
    for (const ref of [poi.owner, ...(poi.coOwners ?? [])]) {
      if (!ref) continue;
      if (!held.has(ref.id)) held.set(ref.id, []);
      held.get(ref.id).push(poi);
    }
  }
  const players = new Map((data.players ?? []).map((player) => [player.id, player]));
  for (const id of held.keys()) if (!players.has(id)) players.set(id, { id, name: null, online: false, lastSeen: null });
  const list = [...players.values()].sort((a, b) => (held.get(b.id)?.length ?? 0) - (held.get(a.id)?.length ?? 0) || nameOf(a).localeCompare(nameOf(b)));
  $("players").replaceChildren(
    ...list.map((player) => {
      const pois = held.get(player.id) ?? [];
      return el(
        "li",
        {},
        el(
          "button",
          { type: "button", onclick: () => filterByOwner(player.id), "aria-label": `${nameOf(player)}: ${pois.length} POIs. Show them in the table.` },
          el(
            "span",
            { class: "player-top" },
            el("span", { class: "swatch", style: `background:${colorFor(player.id)}`, "aria-hidden": "true" }),
            nameOf(player),
            el("span", { class: "player-count", text: `${pois.length} POI${pois.length === 1 ? "" : "s"}` }),
          ),
          el(
            "span",
            { class: "player-meta" },
            player.online ? el("span", { class: "online", text: "● Online" }) : player.lastSeen ? `Last seen ${ago(player.lastSeen)}` : "Not seen lately",
          ),
          el("span", { class: "player-pois", text: pois.length ? pois.map(poiName).sort().join(", ") : "No POIs" }),
        ),
      );
    }),
  );
}

function filterByOwner(id) {
  state.filters = { ...state.filters, owner: id, status: "", q: "" };
  $("f-owner").value = id;
  $("f-status").value = "";
  $("q").value = "";
  selectTab("pois");
  renderTable();
}

// ---------- activity ----------

function eventText(event) {
  const poi = event.poi?.name ?? "A POI";
  const from = event.from ?? {};
  const to = event.to ?? {};
  if (to.status === "contested") return { icon: "⚔", text: `${poi} became contested` };
  if (to.status === "unclaimed") return { icon: "○", text: from.owner ? `${nameOf(from.owner)} no longer holds ${poi}` : `${poi} is unclaimed again` };
  if (from.status === "claimed" && from.owner && to.owner && from.owner.id !== to.owner.id) {
    return { icon: "⇄", text: `${poi} changed hands from ${nameOf(from.owner)} to ${nameOf(to.owner)}` };
  }
  if (from.status === "contested") return { icon: "⚑", text: `${nameOf(to.owner)} now holds ${poi}` };
  return { icon: "⚑", text: `${nameOf(to.owner)} claimed ${poi}` };
}

function feedItems(events, { links = true } = {}) {
  if (!events.length) return [el("li", { class: "none", text: "No changes recorded yet." })];
  return events.map((event) => {
    const { icon, text } = eventText(event);
    const exists = links && state.data?.pois.some((poi) => poi.id === event.poi?.id);
    return el(
      "li",
      {},
      el("span", { class: "icon", "aria-hidden": "true", text: icon }),
      exists ? el("button", { type: "button", class: "link", onclick: () => openDetail(event.poi.id), text }) : el("span", { text }),
      el("time", { datetime: event.at, title: dateText(event.at), text: ago(event.at) }),
    );
  });
}

function renderFeed() {
  $("feed").replaceChildren(...feedItems(state.events));
}

// ---------- detail ----------

async function openDetail(id) {
  const poi = state.data?.pois.find((entry) => entry.id === id);
  if (!poi) return;
  const dialog = $("detail");
  $("detail-title").textContent = poiName(poi);
  const facts = [
    ["Status", badge(poi.status)],
    poi.status === "contested" && poi.contested?.length ? ["Between", el("span", { class: "list-inline" }, ...poi.contested.map(who))] : null,
    ["Owner", who(poi.owner)],
    poi.coOwners?.length ? ["Co-owners", el("span", { class: "list-inline" }, ...poi.coOwners.map(who))] : null,
    ["Tier", Number.isFinite(poi.tier) ? String(poi.tier) : "—"],
    ["Land claims", String(poi.claims ?? 0)],
    poi.claimedSince ? ["Claimed since", `${dateText(poi.claimedSince)} (${ago(poi.claimedSince)})`] : null,
    Number.isFinite(poi.x) && Number.isFinite(poi.z) ? ["Location", `${Math.abs(poi.x)} ${poi.x >= 0 ? "E" : "W"}, ${Math.abs(poi.z)} ${poi.z >= 0 ? "N" : "S"}`] : null,
    poi.trader ? ["Trader", "Yes"] : null,
    ["Prefab", poi.name],
  ].filter(Boolean);
  $("detail-facts").replaceChildren(...facts.flatMap(([term, value]) => [el("dt", { text: term }), el("dd", {}, value)]));
  $("detail-history").replaceChildren(el("li", { class: "none", text: "Loading…" }));
  if (!dialog.open) dialog.showModal();
  try {
    const history = await api(`/api/poi/history?poi=${encodeURIComponent(id)}`);
    $("detail-history").replaceChildren(...feedItems(history.events ?? [], { links: false }));
  } catch (error) {
    if (error.locked) {
      dialog.close();
      show("login");
    } else $("detail-history").replaceChildren(el("li", { class: "none", text: "History could not be loaded." }));
  }
}

// ---------- map ----------

const map = { scale: 1, x: 0, y: 0, fitted: false, hover: null, drag: null };

// ---------- terrain (the world's biomes.png and splat3.png, uploaded by the mod) ----------

// biomes.png uses these colours; each is drawn in a muted shade that suits the page.
const BIOMES = [
  { name: "Forest", from: [0, 64, 0], to: [46, 74, 42] },
  { name: "Burnt forest", from: [186, 0, 255], to: [74, 58, 51] },
  { name: "Desert", from: [255, 228, 119], to: [168, 140, 84] },
  { name: "Snow", from: [255, 255, 255], to: [178, 190, 196] },
  { name: "Wasteland", from: [255, 168, 0], to: [120, 90, 58] },
];
const ROAD = [222, 212, 196];
const terrain = { key: null, canvas: null, size: 0, show: localStorage.getItem("poi-terrain") !== "off", loading: false };

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`could not load ${src}`));
    image.src = src;
  });
}

function nearestBiome(r, g, b) {
  let best = BIOMES[0];
  let bestDistance = Infinity;
  for (const biome of BIOMES) {
    const [fr, fg, fb] = biome.from;
    const distance = (r - fr) ** 2 + (g - fg) ** 2 + (b - fb) ** 2;
    if (distance < bestDistance) [best, bestDistance] = [biome, distance];
  }
  return best.to;
}

// Draws both layers once into one canvas, a few thousand pixels across, recoloured.
async function buildTerrain(info) {
  const px = Math.min(info.size, window.innerWidth < 800 ? 2048 : 3072);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const [biomes, roads] = await Promise.all(
    ["biomes", "roads"].map((layer) =>
      info.layers[layer] ? loadImage(`/api/poi/map/${layer}?v=${info.layers[layer].hash}`).catch(() => null) : null,
    ),
  );
  if (!biomes && !roads) return null;
  const pixels = ctx.createImageData(px, px);
  const out = pixels.data;
  if (biomes) {
    ctx.drawImage(biomes, 0, 0, px, px);
    const src = ctx.getImageData(0, 0, px, px).data;
    const cache = new Map();
    for (let i = 0; i < src.length; i += 4) {
      const key = (src[i] << 16) | (src[i + 1] << 8) | src[i + 2];
      let to = cache.get(key);
      if (!to) cache.set(key, (to = nearestBiome(src[i], src[i + 1], src[i + 2])));
      out[i] = to[0];
      out[i + 1] = to[1];
      out[i + 2] = to[2];
      out[i + 3] = 255;
    }
  }
  if (roads) {
    ctx.clearRect(0, 0, px, px);
    ctx.drawImage(roads, 0, 0, px, px);
    const src = ctx.getImageData(0, 0, px, px).data;
    for (let i = 0; i < src.length; i += 4) {
      // splat3.png is empty (black or clear) except where roads are.
      if (src[i + 3] < 40 || Math.max(src[i], src[i + 1], src[i + 2]) < 40) continue;
      out[i] = ROAD[0];
      out[i + 1] = ROAD[1];
      out[i + 2] = ROAD[2];
      out[i + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

async function syncTerrain() {
  const info = state.data?.map;
  const key = info ? `${info.size}:${Object.values(info.layers).map((layer) => layer.hash).join(",")}` : null;
  $("terrain-toggle").hidden = !info;
  renderTerrainLegend();
  if (key === terrain.key || terrain.loading) return;
  if (!info) {
    Object.assign(terrain, { key: null, canvas: null, size: 0 });
    drawMap();
    return;
  }
  terrain.loading = true;
  try {
    terrain.canvas = await buildTerrain(info);
    terrain.size = info.size;
    terrain.key = key;
  } catch {
    terrain.canvas = null;
  } finally {
    terrain.loading = false;
  }
  renderTerrainLegend();
  drawMap();
}

function renderTerrainLegend() {
  const list = $("terrain-legend");
  const on = Boolean(state.data?.map) && terrain.show;
  list.hidden = !on;
  if (!on) return;
  const swatch = (rgb, text) =>
    el("li", {}, el("span", { class: "swatch", style: `background: rgb(${rgb.join(",")})`, "aria-hidden": "true" }), el("span", { text }));
  list.replaceChildren(
    ...BIOMES.map((biome) => swatch(biome.to, biome.name)),
    ...(state.data.map.layers.roads ? [swatch(ROAD, "Road")] : []),
  );
  $("terrain-toggle").setAttribute("aria-pressed", String(terrain.show));
}

function drawTerrain(ctx) {
  if (!terrain.canvas || !terrain.show) return;
  // The image's top-left corner is the world's north-west corner; 0,0 is the middle.
  const half = terrain.size / 2;
  const [left, top] = toScreen(-half, half);
  const side = terrain.size * map.scale;
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.imageSmoothingEnabled = side < terrain.canvas.width * 2;
  ctx.drawImage(terrain.canvas, left, top, side, side);
  ctx.restore();
}

function mapPois() {
  return state.data.pois.filter((poi) => Number.isFinite(poi.x) && Number.isFinite(poi.z) && !(state.filters.hideTraders && poi.trader));
}

function fitMap() {
  const canvas = $("map");
  const pois = mapPois();
  if (!pois.length) return;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const poi of pois) {
    minX = Math.min(minX, poi.x);
    maxX = Math.max(maxX, poi.x + (poi.sizeX ?? 30));
    minZ = Math.min(minZ, poi.z);
    maxZ = Math.max(maxZ, poi.z + (poi.sizeZ ?? 30));
  }
  const { width, height } = canvas.getBoundingClientRect();
  const pad = 40;
  map.scale = Math.min((width - pad * 2) / Math.max(1, maxX - minX), (height - pad * 2) / Math.max(1, maxZ - minZ));
  // The screen centre shows the middle of the POIs. North (+z) is up.
  map.x = width / 2 - ((minX + maxX) / 2) * map.scale;
  map.y = height / 2 + ((minZ + maxZ) / 2) * map.scale;
  map.fitted = true;
}

function toScreen(x, z) {
  return [map.x + x * map.scale, map.y - z * map.scale];
}

function poiRect(poi) {
  // Never smaller than 12 px, so a zoomed-out map of a big world is still readable.
  const w = Math.max(12, (poi.sizeX ?? 30) * map.scale);
  const h = Math.max(12, (poi.sizeZ ?? 30) * map.scale);
  // x and z are the POI's south-west corner (its lowest x and z), as the mod sends them.
  const [cx, cy] = toScreen(poi.x + (poi.sizeX ?? 30) / 2, poi.z + (poi.sizeZ ?? 30) / 2);
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

function drawMap() {
  const canvas = $("map");
  if (canvas.offsetParent === null) return;
  const ratio = window.devicePixelRatio || 1;
  const { width, height } = canvas.getBoundingClientRect();
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  if (!map.fitted) fitMap();
  const css = getComputedStyle(document.documentElement);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  drawTerrain(ctx);

  // A 500 m grid with the 0,0 lines a little stronger.
  ctx.strokeStyle = css.getPropertyValue("--map-grid");
  ctx.lineWidth = 1;
  const step = 500 * map.scale;
  if (step > 12) {
    const startX = map.x % step;
    const startY = map.y % step;
    ctx.beginPath();
    for (let x = startX; x < width; x += step) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, height);
    }
    for (let y = startY; y < height; y += step) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(width, Math.round(y) + 0.5);
    }
    ctx.stroke();
  }

  const contested = css.getPropertyValue("--contested").trim();
  const unclaimed = css.getPropertyValue("--unclaimed").trim();
  const ink = css.getPropertyValue("--ink").trim();
  for (const poi of mapPois()) {
    const r = poiRect(poi);
    if (r.x + r.w < 0 || r.y + r.h < 0 || r.x > width || r.y > height) continue;
    const dim = state.filters.owner && ![poi.owner, ...(poi.coOwners ?? [])].some((ref) => ref?.id === state.filters.owner);
    ctx.globalAlpha = dim ? 0.25 : 1;
    if (poi.status === "claimed" && poi.owner) {
      ctx.fillStyle = colorFor(poi.owner.id);
      ctx.fillRect(r.x, r.y, r.w, r.h);
      if (poi.coOwners?.length && r.w > 8) {
        // A corner in the first co-owner's colour.
        ctx.fillStyle = colorFor(poi.coOwners[0].id);
        ctx.beginPath();
        ctx.moveTo(r.x + r.w, r.y + r.h);
        ctx.lineTo(r.x + r.w, r.y + r.h * 0.45);
        ctx.lineTo(r.x + r.w * 0.55, r.y + r.h);
        ctx.fill();
      }
    } else if (poi.status === "contested") {
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();
      ctx.strokeStyle = contested;
      ctx.lineWidth = 2;
      for (let d = -r.h; d < r.w; d += 6) {
        ctx.moveTo(r.x + d, r.y + r.h);
        ctx.lineTo(r.x + d + r.h, r.y);
      }
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = contested;
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    } else {
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = unclaimed;
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      ctx.setLineDash([]);
    }
    if (poi.trader) {
      ctx.fillStyle = ink;
      ctx.font = `700 ${Math.max(10, Math.min(16, r.h * 0.5))}px ${css.getPropertyValue("--font")}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("$", r.x + r.w / 2, r.y + r.h / 2);
    }
    if (map.hover === poi.id) {
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
    }
    if (map.scale > 0.6 || poi.status !== "unclaimed") {
      ctx.globalAlpha = dim ? 0.3 : 1;
      ctx.fillStyle = ink;
      ctx.font = `600 11px ${css.getPropertyValue("--font")}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(poiName(poi), r.x + r.w / 2, r.y + r.h + 3, Math.max(60, r.w * 1.6));
    }
  }
  ctx.globalAlpha = 1;
}

function poiAt(clientX, clientY) {
  const box = $("map").getBoundingClientRect();
  const x = clientX - box.left;
  const y = clientY - box.top;
  const hits = mapPois().filter((poi) => {
    const r = poiRect(poi);
    return x >= r.x - 2 && x <= r.x + r.w + 2 && y >= r.y - 2 && y <= r.y + r.h + 2;
  });
  // The smallest one wins, so a POI inside a bigger one can still be picked.
  return hits.sort((a, b) => (a.sizeX ?? 0) * (a.sizeZ ?? 0) - (b.sizeX ?? 0) * (b.sizeZ ?? 0))[0] ?? null;
}

function zoom(factor, cx, cy) {
  const box = $("map").getBoundingClientRect();
  const px = cx ?? box.width / 2;
  const py = cy ?? box.height / 2;
  const next = Math.min(40, Math.max(0.02, map.scale * factor));
  const real = next / map.scale;
  map.x = px - (px - map.x) * real;
  map.y = py - (py - map.y) * real;
  map.scale = next;
  drawMap();
}

function renderLegend() {
  const owners = new Map();
  for (const poi of state.data.pois) {
    if (poi.status === "claimed" && poi.owner) owners.set(poi.owner.id, poi.owner);
    for (const ref of poi.coOwners ?? []) owners.set(ref.id, ref);
  }
  const items = [...owners.values()]
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
    .map((ref) => el("li", {}, el("span", { class: "swatch", style: `background:${colorFor(ref.id)}`, "aria-hidden": "true" }), nameOf(ref)));
  items.push(el("li", {}, el("span", { class: "swatch hatch", "aria-hidden": "true" }), "Contested"));
  items.push(el("li", {}, el("span", { class: "swatch open", "aria-hidden": "true" }), "Unclaimed"));
  items.push(el("li", {}, el("span", { "aria-hidden": "true", text: "$" }), "Trader"));
  items.push(el("li", { class: "muted" }, "Corner = first co-owner"));
  $("legend").replaceChildren(...items);
}

function setupMap() {
  const canvas = $("map");
  const tip = $("map-tip");
  canvas.addEventListener("pointerdown", (event) => {
    map.drag = { x: event.clientX, y: event.clientY, mapX: map.x, mapY: map.y, moved: false };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (map.drag) {
      const dx = event.clientX - map.drag.x;
      const dy = event.clientY - map.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) {
        map.drag.moved = true;
        canvas.classList.add("dragging");
        tip.hidden = true;
      }
      map.x = map.drag.mapX + dx;
      map.y = map.drag.mapY + dy;
      drawMap();
      return;
    }
    const poi = poiAt(event.clientX, event.clientY);
    const id = poi?.id ?? null;
    if (id !== map.hover) {
      map.hover = id;
      drawMap();
    }
    canvas.style.cursor = poi ? "pointer" : "";
    if (poi) {
      const box = canvas.getBoundingClientRect();
      tip.replaceChildren(
        el("strong", { text: poiName(poi) }),
        el("br"),
        `${STATUS[poi.status]?.label ?? poi.status}${poi.owner ? ` · ${nameOf(poi.owner)}` : ""}`,
        poi.coOwners?.length ? el("br") : null,
        poi.coOwners?.length ? `With ${poi.coOwners.map(nameOf).join(", ")}` : null,
      );
      tip.style.left = `${Math.min(box.width - 200, event.clientX - box.left + 14)}px`;
      tip.style.top = `${event.clientY - box.top + 14}px`;
      tip.hidden = false;
    } else tip.hidden = true;
  });
  const end = (event) => {
    if (!map.drag) return;
    const { moved } = map.drag;
    map.drag = null;
    canvas.classList.remove("dragging");
    if (!moved && event.type === "pointerup") {
      const poi = poiAt(event.clientX, event.clientY);
      if (poi) openDetail(poi.id);
    }
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("pointerleave", () => {
    tip.hidden = true;
    if (map.hover) {
      map.hover = null;
      drawMap();
    }
  });
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const box = canvas.getBoundingClientRect();
      zoom(event.deltaY < 0 ? 1.2 : 1 / 1.2, event.clientX - box.left, event.clientY - box.top);
    },
    { passive: false },
  );
  $("terrain-toggle").addEventListener("click", () => {
    terrain.show = !terrain.show;
    localStorage.setItem("poi-terrain", terrain.show ? "on" : "off");
    renderTerrainLegend();
    drawMap();
  });
  $("zoom-in").addEventListener("click", () => zoom(1.4));
  $("zoom-out").addEventListener("click", () => zoom(1 / 1.4));
  $("zoom-reset").addEventListener("click", () => {
    fitMap();
    drawMap();
  });
  new ResizeObserver(() => drawMap()).observe(canvas);
}

// ---------- tabs ----------

const TABS = ["pois", "players", "map", "activity"];

function selectTab(name, focus = false) {
  if (!TABS.includes(name) || $(`tab-${name}`).hidden) name = "pois";
  state.view = name;
  for (const tab of TABS) {
    const button = $(`tab-${tab}`);
    const on = tab === name;
    button.setAttribute("aria-selected", String(on));
    button.tabIndex = on ? 0 : -1;
    $(`view-${tab}`).hidden = !on;
  }
  if (focus) $(`tab-${name}`).focus();
  if (name === "map") requestAnimationFrame(drawMap);
  if (location.hash.slice(1) !== name) history.replaceState(null, "", name === "pois" ? location.pathname : `#${name}`);
}

function setupTabs() {
  for (const tab of TABS) {
    $(`tab-${tab}`).addEventListener("click", () => selectTab(tab));
    $(`tab-${tab}`).addEventListener("keydown", (event) => {
      const visible = TABS.filter((name) => !$(`tab-${name}`).hidden);
      const index = visible.indexOf(tab);
      if (event.key === "ArrowRight") selectTab(visible[(index + 1) % visible.length], true);
      else if (event.key === "ArrowLeft") selectTab(visible[(index - 1 + visible.length) % visible.length], true);
      else return;
      event.preventDefault();
    });
  }
}

// ---------- render ----------

function render() {
  const { data } = state;
  renderHead();
  renderFilterOptions();
  renderTable();
  renderPlayers();
  renderFeed();
  const coords = hasCoords(data);
  $("tab-map").hidden = !coords;
  if (coords) {
    renderLegend();
    const missing = data.pois.filter((poi) => !Number.isFinite(poi.x) || !Number.isFinite(poi.z)).length;
    $("map-note").textContent = `Drag to move, scroll or use the buttons to zoom, and pick a POI for its history. The POIs tab lists the same thing for keyboards and screen readers.${missing ? ` ${missing} POI${missing === 1 ? " has" : "s have"} no location and ${missing === 1 ? "is" : "are"} only in the table.` : ""}`;
  }
  if (!coords && state.view === "map") selectTab("pois");
  else if (state.view === "map") drawMap();
}

// ---------- setup ----------

function setupFilters() {
  const update = () => {
    state.filters = {
      q: $("q").value.trim(),
      status: $("f-status").value,
      tier: $("f-tier").value,
      owner: $("f-owner").value,
      hideTraders: $("f-traders").checked,
    };
    renderTable();
    if (state.view === "map") drawMap();
  };
  for (const id of ["q", "f-status", "f-tier", "f-owner", "f-traders"]) $(id).addEventListener("input", update);
  $("f-clear").addEventListener("click", () => {
    $("q").value = "";
    $("f-status").value = "";
    $("f-tier").value = "";
    $("f-owner").value = "";
    $("f-traders").checked = false;
    update();
  });
  for (const th of document.querySelectorAll(".pois th[data-sort]")) {
    th.querySelector("button").addEventListener("click", () => {
      const key = th.dataset.sort;
      state.sort = { key, dir: state.sort.key === key ? -state.sort.dir : key === "claims" || key === "tier" ? -1 : 1 };
      renderTable();
    });
  }
}

function setupTheme() {
  const button = $("theme");
  const label = () => {
    const light = isLight();
    button.textContent = light ? "☾ Dark" : "☀ Light";
    button.setAttribute("aria-label", light ? "Switch to dark theme" : "Switch to light theme");
  };
  button.addEventListener("click", () => {
    const next = isLight() ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("poi-theme", next);
    } catch {}
    label();
    if (state.data) render();
  });
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    label();
    if (state.data) render();
  });
  label();
}

function setupLogin() {
  $("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const error = $("login-error");
    error.hidden = true;
    const response = await fetch("/api/poi/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: $("password").value }),
      credentials: "same-origin",
    }).catch(() => null);
    if (response?.ok) {
      $("password").value = "";
      $("logout").hidden = false;
      await load();
    } else {
      error.textContent = response?.status === 401 ? "That password is not right." : "Could not reach the server. Try again.";
      error.hidden = false;
    }
  });
  $("logout").addEventListener("click", async () => {
    await fetch("/api/poi/logout", { method: "POST", credentials: "same-origin" }).catch(() => null);
    state.data = null;
    show("login");
    $("logout").hidden = true;
  });
}

function setup() {
  setupTheme();
  setupTabs();
  setupFilters();
  setupMap();
  setupLogin();
  $("detail-close").addEventListener("click", () => $("detail").close());
  $("detail").addEventListener("click", (event) => {
    if (event.target === $("detail")) $("detail").close();
  });
  $("pause").addEventListener("click", () => {
    state.paused = !state.paused;
    $("pause").setAttribute("aria-pressed", String(state.paused));
    $("pause").textContent = state.paused ? "▶ Resume updates" : "⏸ Pause updates";
    schedule();
    if (!state.paused) load();
    else if (state.data) renderHead();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !state.paused) load();
  });
  // The "updated N minutes ago" text keeps moving between refreshes.
  setInterval(() => {
    if (state.data) $("updated").textContent = `Updated ${ago(state.data.receivedAt)}${state.paused ? " (updates paused)" : ""}`;
  }, 15_000);
  load().then(() => selectTab(location.hash.slice(1) || "pois"));
  schedule();
}

setup();
