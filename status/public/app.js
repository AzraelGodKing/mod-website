const LABEL = { up: "Working", degraded: "Partly working", down: "Down", unknown: "Not checked yet" };
const OVERALL = {
  up: ["Everything is working", "All sites and downloads answered the last check."],
  degraded: ["Some things need a look", "Everything answers, but something below isn't quite right."],
  down: ["Something is down", "One or more services stopped answering. Azrael gets pinged automatically."],
  unknown: ["Checking…", "The page fills in once the first check has run."],
};

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of children) if (child != null) node.append(child);
  return node;
};

function ago(iso) {
  if (!iso) return "";
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

function row(service) {
  const name = el("div", { className: "row-name" }, service.url ? el("a", { href: service.url, textContent: service.name }) : service.name);
  const pill = el("span", { className: "pill", textContent: LABEL[service.status] ?? service.status });
  pill.dataset.status = service.status;
  const bars = el("div", { className: "bars", role: "img" });
  const down = service.hours.filter((code) => code === 0).length;
  bars.setAttribute("aria-label", down ? `Down in ${down} of the last 24 hours` : "No downtime in the last 24 hours");
  for (const code of service.hours) {
    const bar = el("span");
    bar.dataset.code = code == null ? "none" : String(code);
    bars.append(bar);
  }
  const uptime = el(
    "div",
    { className: "uptime" },
    service.uptime == null ? "–" : `${(service.uptime * 100).toFixed(service.uptime === 1 ? 0 : 1)}%`,
    el("small", { textContent: service.ms != null ? `${service.ms} ms${service.slow ? " (slow)" : ""}` : "" }),
  );
  const wrap = el("div", { className: "row" }, name, pill, bars, uptime);
  if (service.detail && service.status !== "up") wrap.append(el("p", { className: "row-detail", textContent: `${service.detail} · since ${ago(service.since)}` }));
  return wrap;
}

function render(data) {
  const overall = document.getElementById("overall");
  overall.dataset.status = data.overall;
  const [title, note] = OVERALL[data.overall] ?? OVERALL.unknown;
  document.getElementById("overall-title").textContent = title;
  document.getElementById("overall-note").textContent = data.checkedAt ? `${note} Last checked ${ago(data.checkedAt)}.` : note;

  const groups = document.getElementById("groups");
  groups.replaceChildren();
  const byGroup = new Map();
  for (const service of data.services) byGroup.set(service.group, [...(byGroup.get(service.group) ?? []), service]);
  for (const [group, services] of byGroup) {
    groups.append(el("section", { className: "panel" }, el("h2", { textContent: group }), ...services.map(row)));
  }

  const games = (data.games ?? []).filter((game) => game.newest);
  document.getElementById("games-panel").hidden = !games.length;
  document.getElementById("games").replaceChildren(
    ...games.map((game) => {
      const summary = el("summary", { textContent: `${game.gameName} ${game.newest}: ${game.supporting} of ${game.total} mods` });
      const details = el("details", { className: "game" }, summary);
      if (game.behind.length) {
        details.append(
          el(
            "ul",
            {},
            ...game.behind.map((mod) =>
              el("li", {}, el("a", { href: `https://azraelsmods.com${mod.path}`, textContent: mod.name }), mod.versions.length ? ` (lists ${mod.versions.join(", ")})` : " (no versions listed)"),
            ),
          ),
        );
      } else {
        details.append(el("p", { className: "muted small", textContent: "Every mod lists it." }));
      }
      return details;
    }),
  );
}

async function load() {
  try {
    const response = await fetch("/api/status", { cache: "no-store" });
    if (response.ok) render(await response.json());
  } catch {
    // Keep what is on screen; the next refresh tries again.
  }
}

load();
setInterval(load, 60_000);
