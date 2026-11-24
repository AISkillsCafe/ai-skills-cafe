"use strict";
const CATS = {
  docs: ["Documents & Office", "📄"], code: ["Coding & Engineering", "🛠️"], design: ["Design & Creative", "🎨"],
  data: ["Data & Research", "📊"], science: ["Science", "🔬"], writing: ["Writing & Marketing", "✍️"],
  workflow: ["Planning & Workflow", "🧭"], other: ["Everything else", "✨"],
};
const TIERS = { official: "Official", trusted: "Trusted pick", popular: "Popular" };
const TIER_HELP = {
  skill: {
    official: "Published by the AI vendor or platform company itself.",
    trusted: "Hand-picked, widely used community collection.",
    popular: "Found on GitHub: 2,000+ stars, open-source licence, active in the last year.",
  },
  tool: {
    official: "Published under a well-known company's own verified domain or GitHub organisation.",
    popular: "Community tool whose own GitHub repository has 300+ stars.",
  },
};
const ORIGINS = { claude: "Made for Claude", openai: "Made for ChatGPT / Codex", cross: "Cross-agent" };
const HERO = {
  skills: ["What do you want your AI to be good at?", "Try “make a slide deck”, “review my code”, “write a launch email”…"],
  tools: ["What do you want your AI to be able to reach?", "Try “Notion”, “browser testing”, “payments”, “database”…"],
};
const STOP = new Set("a an the to for of my me i and or with in on is it that this want need help how do can make create get from".split(" "));
const PAGE = 60;
const RANK = { official: 0, trusted: 1, popular: 2 };

let lib = { skills: [], sources: [], tools: [], updated_at: null };
let user = { favorites: [], ratings: {}, notes: {}, tried: [] };
let mode = "skills";
const f = { q: "", cat: "all", repo: "", origin: "all", tier: "all", fav: false, isNew: false, tests: false, remote: false, linked: false,
  sort: "popular", view: "cards", shown: PAGE };
let current = [];
let skillTools = {};
let blend = [];       // House Blend picks for the Tools menu (site/data/house_blend.json)
let skillNotes = {};   // hand-written setup notes by skill id or repo (site/data/skill_notes.json)

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtNum = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, "") + "k" : String(n));
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");
const safeUrl = (u) => (/^https:\/\/[^\s"'<>]+$/.test(u || "") ? u : "#");
const repoLabel = (u) => ({ "github.com": "GitHub page", "gitlab.com": "GitLab page", "bitbucket.org": "Bitbucket page" })[
  (String(u || "").match(/^https:\/\/(?:www\.)?([^/]+)/) || [])[1]] || "Code page";
const items = () => (mode === "skills" ? lib.skills : lib.tools);
const byId = (id) => lib.skills.find((s) => s.id === id) || lib.tools.find((t) => t.id === id);

async function getJSON(path) {
  const r = await fetch(path, { cache: "no-cache" });
  if (!r.ok) throw new Error("Could not load " + path);
  return r.json();
}
const USER_KEY = "aiskillscafe.user.v1";
function toast(msg, ms = 3200) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), ms);
}
/* Your shelf, ratings and notes live only in this browser (nothing is sent anywhere). */
function saveUser() {
  try { localStorage.setItem(USER_KEY, JSON.stringify(user)); }
  catch { toast("Your browser isn’t letting this site save — changes will be lost when you close the tab."); }
}
function loadUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || "{}") || {}; } catch { return {}; }
}

/* ---------- loading ---------- */
async function load() {
  const [skills, tools, builtins, notes, picks] = await Promise.all([getJSON("/data/skills.json"), getJSON("/data/tools.json").catch(() => ({})),
    getJSON("/data/builtins.json").catch(() => ({})), getJSON("/data/skill_notes.json").catch(() => ({})),
    getJSON("/data/house_blend.json").catch(() => ({}))]);
  skillNotes = notes.notes || {};
  user = Object.assign({ favorites: [], ratings: {}, notes: {}, tried: [] }, loadUser());
  const extras = (builtins.items || []).filter((b) => b.id && b.name && CATS[b.category]);   // features built into an agent
  lib = { skills: [...extras, ...(skills.skills || [])], sources: skills.sources || [], updated_at: skills.updated_at,
    tools: tools.tools || [], tools_updated_at: tools.updated_at, registry_entries: tools.registry_entries || 0 };
  for (const list of [lib.skills, lib.tools]) {
    const seen = {};
    list.forEach((s) => (s._i = seen[s.author] = (seen[s.author] ?? -1) + 1));
  }
  const toolById = Object.fromEntries(lib.tools.map((t) => [t.id, t]));
  blend = (picks.picks || []).filter((p) => toolById[p.id]).map((p) => ({ ...p, tool: toolById[p.id] }));
  skillTools = {};
  lib.tools.forEach((t) => (t.skills || []).forEach((sid) => (skillTools[sid] = skillTools[sid] || []).push(t)));
  Object.values(skillTools).forEach((l) => l.sort((a, b) => RANK[a.tier] - RANK[b.tier] || b.stars - a.stars));
  $("#n-skills").textContent = lib.skills.length;
  $("#n-tools").textContent = lib.tools.length;
  renderMode();
}

function renderMode() {
  const n = items().length, isTools = mode === "tools";
  document.body.dataset.mode = mode;
  document.querySelectorAll("#mode button").forEach((b) => { b.classList.toggle("on", b.dataset.v === mode); b.setAttribute("aria-selected", b.dataset.v === mode); });
  $("#hero-title").textContent = HERO[mode][0];
  $("#surprise").title = mode === "tools" ? "Open a random tool" : "Open a random skill";
  $("#q").placeholder = HERO[mode][1];
  $("#stats").textContent = isTools
    ? (n ? `${n} tools · picked from ${(lib.registry_entries || 0).toLocaleString()} in the MCP Registry · refreshed nightly, last ${fmtDate(lib.tools_updated_at)}` : "No tools yet")
    : (n ? `${n} skills · ${lib.tools.length} tools · ${lib.sources.length} sources · refreshed nightly, last ${fmtDate(lib.updated_at)}` : "No skills yet");
  const newCount = items().filter((s) => s.is_new).length;
  $("#f-new").hidden = !newCount;
  $("#new-count").textContent = newCount || "";
  if (isTools && f.view === "sources") setView("cards");
  syncControls();
  render();
}

/* ---------- filtering ---------- */
function score(s, tokens) {
  let total = 0;
  if (tokens.length > 1) {   // the whole phrase ("slide deck") beats scattered single words
    const phrase = tokens.join(" ");
    if ((s.name + " " + s.description).toLowerCase().replace(/[-_]/g, " ").includes(phrase)) total += 10;
  }
  const name = s.name.toLowerCase().replace(/[-_]/g, " "), desc = s.description.toLowerCase();
  const cat = CATS[s.category][0].toLowerCase(), who = (s.author + " " + s.repo + " " + (s.keyword || "")).toLowerCase();
  for (const t of tokens) {
    const stem = t.length > 4 ? t.replace(/(ing|es|s)$/, "") : t;
    let hit = 0;
    if (name.includes(stem)) hit += 6;
    if (cat.includes(stem)) hit += 2;
    if (desc.includes(stem)) hit += 2;
    if (who.includes(stem)) hit += 1;
    total += hit;
  }
  return total;
}
const tokenize = (q) => q.toLowerCase().split(/[^a-z0-9.+#]+/).filter((t) => t && !STOP.has(t));
function filtered(cat = f.cat) {
  const tokens = tokenize(f.q);
  const isTools = mode === "tools";
  let list = items().filter((s) =>
    (cat === "all" || s.category === cat) && (isTools || !f.repo || s.repo === f.repo) && (isTools || f.origin === "all" || s.origin === f.origin) &&
    (f.tier === "all" || s.tier === f.tier) && (!f.fav || user.favorites.includes(s.id)) && (!f.isNew || s.is_new) &&
    (isTools || !f.tests || s.has_tests) && (!isTools || !f.remote || s.is_remote) &&
    (!isTools || !f.linked || (s.skills || []).length));
  if (tokens.length) {
    list = list.map((s) => [score(s, tokens), s]).filter((x) => x[0] > 0).sort((a, b) => b[0] - a[0] || b[1].stars - a[1].stars).map((x) => x[1]);
    if (f.sort === "popular") return list; // best match first
  }
  const sorters = {
    // featured: official first, then rotate through publishers so no single one dominates
    popular: (a, b) => RANK[a.tier] - RANK[b.tier] || a._i - b._i || b.stars - a.stars,
    stars: (a, b) => b.stars - a.stars || a.name.localeCompare(b.name),
    recent: (a, b) => (b.updated || "").localeCompare(a.updated || ""),
    az: (a, b) => a.name.localeCompare(b.name),
    mine: (a, b) => (user.ratings[b.id] || 0) - (user.ratings[a.id] || 0) || b.stars - a.stars,
  };
  return list.slice().sort(sorters[f.sort]);
}
/* How many of the tucked-away filters are on (shown on the Filters & sort button). */
function hiddenFilterCount() {
  const isTools = mode === "tools";
  return [!isTools && f.origin !== "all", f.tier !== "all", f.isNew, !isTools && f.tests, isTools && f.remote, isTools && f.linked].filter(Boolean).length;
}
function activeFilters() {
  const isTools = mode === "tools";
  return [f.q && "search", f.cat !== "all" && "category", !isTools && f.repo && "source " + f.repo, !isTools && f.origin !== "all" && "agent", f.tier !== "all" && "source",
    f.fav && "My shelf", f.isNew && "New", !isTools && f.tests && "Has tests", isTools && f.remote && "No install",
    isTools && f.linked && "Used by skills"].filter(Boolean);
}

/* ---------- rendering ---------- */
function renderCats() {
  const exists = {}, counts = {}, pool = filtered("all");
  items().forEach((s) => (exists[s.category] = true));
  pool.forEach((s) => (counts[s.category] = (counts[s.category] || 0) + 1));
  if (f.cat !== "all" && !exists[f.cat]) f.cat = "all";
  const chip = (c, label, n, style = "") => `<button class="chip ${f.cat === c ? "on" : ""} ${n ? "" : "zero"}" data-cat="${c}" aria-pressed="${f.cat === c}"${style}>${label} <small>${n}</small></button>`;
  $("#cats").innerHTML = chip("all", "All", pool.length) +
    Object.keys(CATS).filter((c) => exists[c]).map((c) => chip(c, `${CATS[c][1]} ${CATS[c][0]}`, counts[c] || 0, ` style="--c:var(--c-${c})"`)).join("");
}
function cardHtml(s, i) {
  const mine = user.ratings[s.id], isTool = s.kind === "tool";
  const extra = isTool
    ? `<span class="badge ${s.is_remote ? "remote" : ""}" title="${s.is_remote ? "Runs online — nothing to install" : "Runs on your computer"}">${s.is_remote ? "☁ Remote" : "💻 Local"}</span>
       ${(s.skills || []).length ? `<span title="Skills that mention this tool">🔗 ${s.skills.length}</span>` : ""}`
    : (skillTools[s.id] ? `<span title="Tools this skill works with">🔌 ${skillTools[s.id].length}</span>` : "");
  return `<article class="card ${s.tier} ${isTool ? "tool" : ""}" data-id="${esc(s.id)}" tabindex="0" style="--c:var(--c-${s.category});animation-delay:${Math.min(i, 20) * 18}ms">
    <div class="card-head"><div class="glyph">${isTool ? "🔌" : CATS[s.category][1]}</div>
      <div><h3>${esc(s.name)}</h3><div class="by">by ${esc(s.author)}</div></div></div>
    <p>${esc(s.summary)}</p>
    <div class="card-foot">
      ${s.is_new ? '<span class="badge new">New</span>' : ""}
      <span class="badge ${s.tier}">${TIERS[s.tier]}</span>
      ${s.builtin ? `<span class="badge builtin" title="Comes with ${esc(s.builtin)} — nothing to download">Built in</span>` : ""}
      ${extra}
      ${s.stars ? `<span title="GitHub stars of the source repository">★ ${fmtNum(s.stars)}</span>` : ""}
      ${mine ? `<span class="mine" title="Your rating">${"★".repeat(mine)}</span>` : ""}
      <button class="heart ${user.favorites.includes(s.id) ? "on" : ""}" data-fav="${esc(s.id)}" aria-label="Add to my shelf" title="Add to my shelf">♥</button>
    </div></article>`;
}
function render() {
  current = filtered();
  renderCats();
  const all = items(), noun = mode === "skills" ? "skills" : "tools", one = noun.slice(0, -1);
  const hiddenN = hiddenFilterCount();
  $("#filters-n").textContent = hiddenN ? `(${hiddenN})` : "";
  document.body.dataset.view = f.view;
  syncUrl();
  $("#fav-count").textContent = all.filter((s) => user.favorites.includes(s.id)).length || "";
  const active = activeFilters();
  renderBlend(active);
  const clearBtn = active.length ? ` · filtered by ${esc(active.join(", "))} <button class="btn small" data-clear>Clear filters</button>` : "";
  const srcs = sourcesShown();
  $("#count").innerHTML = !all.length ? "" : f.view === "sources" ? `${srcs.length} of ${lib.sources.length} sources${f.q ? ` matching “${esc(f.q)}”` : ""}`
    : `${current.length} of ${all.length} ${noun}${clearBtn}`;
  $("#grid").hidden = f.view !== "cards";
  $("#galaxy").hidden = f.view !== "galaxy";
  $("#sources").hidden = f.view !== "sources";
  $("#more").hidden = true;
  if (f.view === "cards") {
    const shelfEmpty = f.fav && !all.some((s) => user.favorites.includes(s.id));
    $("#grid").innerHTML = current.length ? current.slice(0, f.shown).map(cardHtml).join("") : emptyHtml(all, noun, one, shelfEmpty, active);
    $("#more").hidden = current.length <= f.shown;
    $("#more").textContent = `Show more (${current.length - f.shown} left)`;
  } else if (f.view === "galaxy") drawGalaxy(current);
  else renderSources(srcs);
}
/* House Blend: shown on the Tools menu until the visitor starts searching or filtering. */
function renderBlend(active) {
  const show = mode === "tools" && f.view === "cards" && !active.length && blend.length > 0;
  $("#blend").hidden = !show;
  if (!show || $("#blend-row").childElementCount) return;
  $("#blend-row").innerHTML = blend.map(({ job, note, tool: t }) =>
    `<button class="blend-item" data-open="${esc(t.id)}" style="--c:var(--c-${t.category})" title="${esc(note)}">
      <span class="blend-job">${esc(job)}</span><b>${esc(t.name)}</b>
      <small>${t.is_remote ? "☁ Remote" : "💻 Local"} · by ${esc(t.author)}</small></button>`).join("");
}
/* No results: say why, and offer the most likely way out. */
function emptyHtml(all, noun, one, shelfEmpty, active) {
  if (!all.length) return `<div class="empty"><h3>No ${noun} yet</h3><p>The menu is being restocked — please check back soon.</p></div>`;
  if (shelfEmpty) return `<div class="empty"><h3>Your shelf is empty</h3><p>“My shelf” is switched on, but you haven’t added any ${noun} to it yet. Click the ♥ on a card to add one.</p>
    <p><button class="btn primary" data-clear>Show all ${noun}</button></p></div>`;
  const onlySearch = active.length === 1 && f.q;
  const other = mode === "skills" ? lib.tools : lib.skills, otherNoun = mode === "skills" ? "tools" : "skills";
  const tokens = tokenize(f.q), otherHits = f.q ? other.filter((x) => score(x, tokens) > 0).length : 0;
  const switchBtn = otherHits ? `<button class="btn primary" data-switch>Show ${otherHits} matching ${otherNoun}</button>` : "";
  if (onlySearch) return `<div class="empty"><h3>No ${noun} match “${esc(f.q)}”</h3>
    <p>Try fewer or different words — for example what you want done (“summarise a PDF”) rather than a product name.${otherHits ? ` There ${otherHits === 1 ? "is" : "are"} ${otherHits} matching ${otherHits === 1 ? otherNoun.slice(0, -1) : otherNoun}, though.` : ""}</p>
    <p>${switchBtn} <button class="btn" data-clear>Clear the search</button></p></div>`;
  return `<div class="empty"><h3>Nothing matches all of that</h3><p>Your search and filters together hide every ${one}. Try turning off a filter${hiddenFilterCount() ? " under Filters &amp; sort" : ""}.</p>
    <p><button class="btn primary" data-clear>Clear filters and show all ${noun}</button> ${switchBtn}</p></div>`;
}
function sourcesShown() {
  const tokens = tokenize(f.q);
  if (!tokens.length) return lib.sources;
  return lib.sources.filter((s) => { const t = (s.repo + " " + (s.description || "")).toLowerCase(); return tokens.some((k) => t.includes(k)); });
}
function renderSources(list) {
  $("#sources").innerHTML = !list.length ? `<div class="empty"><h3>No sources match “${esc(f.q)}”</h3><p><button class="btn" data-clear>Clear the search</button></p></div>`
    : list.map((s) => `<div class="source">
    <img src="${esc(/^https:\/\/avatars\.githubusercontent\.com\//.test(s.avatar) ? s.avatar : "")}" alt="" loading="lazy">
    <div><h3>${esc(s.repo)}</h3><p>${esc(s.description)}</p>
    <div class="row"><span class="badge ${s.tier}" title="${TIER_HELP.skill[s.tier]}">${TIERS[s.tier]}</span><span>★ ${fmtNum(s.stars)}</span><span>${s.skills} skills</span>
    <span>updated ${fmtDate(s.pushed_at)}</span><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">Open on GitHub ↗</a></div>
    <p><button class="btn small" data-source="${esc(s.repo)}">See its ${s.skills} skill${s.skills === 1 ? "" : "s"} →</button></p></div></div>`).join("");
}

/* ---------- galaxy view ---------- */
let galaxyRun = 0;
function drawGalaxy(list) {
  const svg = $("#galaxy-svg"), W = 1200, H = 700, run = ++galaxyRun;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const cats = Object.keys(CATS).filter((c) => list.some((s) => s.category === c));
  const centers = {};
  cats.forEach((c, i) => {
    const a = (i / cats.length) * Math.PI * 2 - Math.PI / 2;
    centers[c] = cats.length === 1 ? [W / 2, H / 2] : [W / 2 + Math.cos(a) * W * 0.33, H / 2 + Math.sin(a) * H * 0.3];
  });
  const nodes = list.slice(0, 400).map((s) => {
    const r = Math.max(5, Math.min(17, 5 + 12 * ((Math.log10(s.stars + 1) - 3.3) / 2.4)));
    const [cx, cy] = centers[s.category];
    return { s, r, x: cx + (Math.random() - 0.5) * 200, y: cy + (Math.random() - 0.5) * 200 };
  });
  svg.innerHTML = nodes.map((n, i) => `<circle data-i="${i}" r="${n.r.toFixed(1)}" fill="var(--c-${n.s.category})" fill-opacity=".82"
      stroke="${n.s.tier === "official" ? "var(--gold)" : "none"}" stroke-width="3"></circle>`).join("") +
    cats.map((c) => `<text data-c="${c}">${CATS[c][0]}</text>`).join("");
  const circles = [...svg.querySelectorAll("circle")], labels = [...svg.querySelectorAll("text")];
  let ticks = 0;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function step() {
    for (const n of nodes) {
      const [cx, cy] = centers[n.s.category];
      n.x += (cx - n.x) * 0.012; n.y += (cy - n.y) * 0.012;
    }
    for (let pass = 0; pass < 3; pass++) for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
      const min = a.r + b.r + (a.s.category === b.s.category ? 2 : 26);
      if (d < min) { const push = (min - d) / 2; dx /= d; dy /= d; a.x -= dx * push; a.y -= dy * push; b.x += dx * push; b.y += dy * push; }
    }
    for (const n of nodes) { n.x = Math.max(n.r, Math.min(W - n.r, n.x)); n.y = Math.max(n.r + 4, Math.min(H - n.r, n.y)); }
  }
  function paint() {
    nodes.forEach((n, i) => { circles[i].setAttribute("cx", n.x.toFixed(1)); circles[i].setAttribute("cy", n.y.toFixed(1)); });
    labels.forEach((t) => {
      const group = nodes.filter((n) => n.s.category === t.dataset.c);
      const top = Math.min(...group.map((n) => n.y - n.r)), mid = group.reduce((a, n) => a + n.x, 0) / group.length;
      t.setAttribute("x", Math.max(90, Math.min(W - 90, mid)).toFixed(0)); t.setAttribute("y", Math.max(16, top - 8).toFixed(0));
    });
  }
  function frame() {
    if (run !== galaxyRun) return;
    for (let k = 0; k < 4; k++) step();
    ticks += 4; paint();
    if (ticks < 260) requestAnimationFrame(frame);
  }
  if (reduce) { for (let k = 0; k < 260; k++) step(); paint(); } else frame();
  const tip = $("#tip");
  svg.onmousemove = (e) => {
    const c = e.target.closest("circle");
    if (!c) return (tip.hidden = true);
    const s = nodes[+c.dataset.i].s, box = $("#galaxy").getBoundingClientRect();
    tip.innerHTML = tipHtml(s);
    tip.hidden = false;
    tip.style.left = Math.min(box.width - 270, e.clientX - box.left + 14) + "px";
    tip.style.top = e.clientY - box.top + 14 + "px";
  };
  svg.onmouseleave = () => { if (document.activeElement !== svg) tip.hidden = true; };
  svg.onclick = (e) => { const c = e.target.closest("circle"); if (c) openItem(nodes[+c.dataset.i].s.id); };
  // Keyboard: arrows walk the bubbles (grouped by category, then name), Enter opens.
  const order = nodes.map((n, i) => i).sort((a, b) => Object.keys(CATS).indexOf(nodes[a].s.category) - Object.keys(CATS).indexOf(nodes[b].s.category) || nodes[a].s.name.localeCompare(nodes[b].s.name));
  let k = -1;
  const focusNode = () => {
    circles.forEach((c) => c.classList.remove("kfocus"));
    const n = nodes[order[k]], c = circles[order[k]];
    c.classList.add("kfocus");
    const box = $("#galaxy").getBoundingClientRect(), sb = svg.getBoundingClientRect(), sc = sb.width / W;
    tip.innerHTML = tipHtml(n.s); tip.hidden = false;
    tip.style.left = Math.min(box.width - 270, n.x * sc + 14) + "px";
    tip.style.top = n.y * (sb.height / H) + 14 + "px";
    $("#g-live").textContent = `${n.s.name}, ${CATS[n.s.category][0]}, ${k + 1} of ${order.length}`;
  };
  svg.onkeydown = (e) => {
    if (!order.length) return;
    if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)) {
      e.preventDefault();
      k = k < 0 ? 0 : (k + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1) + order.length) % order.length;
      focusNode();
    } else if (e.key === "Enter" && k >= 0) openItem(nodes[order[k]].s.id);
  };
  svg.onblur = () => { tip.hidden = true; circles.forEach((c) => c.classList.remove("kfocus")); };
}
const tipHtml = (s) => `<b>${esc(s.name)}</b>${esc(s.author)}${s.tier === "official" ? " · Official" : ""}${s.stars ? " · ★ " + fmtNum(s.stars) : ""}`;

/* ---------- shared detail helpers ---------- */
function md(text) {
  const out = [];
  let inCode = false, buf = [];
  const inline = (t) => esc(t).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      if (inCode) { out.push("<pre><code>" + esc(buf.join("\n")) + "</code></pre>"); buf = []; }
      inCode = !inCode; continue;
    }
    if (inCode) { buf.push(line); continue; }
    const h = line.match(/^(#{1,4})\s+(.*)/), li = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)/);
    if (h) out.push(`<h3>${inline(h[2])}</h3>`);
    else if (li) out.push(`<li>${inline(li[1])}</li>`);
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (inCode && buf.length) out.push("<pre><code>" + esc(buf.join("\n")) + "</code></pre>");
  return out.join("");
}
const cmd = (text) => `<div class="cmd"><code>${esc(text)}</code><button class="btn small" data-copy="${esc(text)}">Copy</button></div>`;
const miniList = (list, empty) => list.length
  ? `<div class="mini">${list.map((x) => `<button class="mini-item" data-open="${esc(x.id)}" style="--c:var(--c-${x.category})">
      <span>${x.kind === "tool" ? "🔌" : CATS[x.category][1]}</span><b>${esc(x.name)}</b><small>${esc(x.author)}</small></button>`).join("")}</div>`
  : `<p class="note">${empty}</p>`;

let returnFocus = null;
function showSheet(item, html) {
  const sheet = $(".sheet");
  if ($("#modal").hidden) returnFocus = document.activeElement;   // where to put focus back on close
  sheet.style.setProperty("--c", `var(--c-${item.category})`);
  $("#m-body").innerHTML = html;
  $("#modal").hidden = false;
  document.body.style.overflow = "hidden";
  sheet.scrollTop = 0;
  $("#m-name").focus({ preventScroll: true });
  syncUrl(item.id);
}
function headHtml(s, glyph, badges) {
  return `<div class="m-head"><div class="glyph" style="--c:var(--c-${s.category})">${glyph}</div>
      <div><h2 id="m-name" tabindex="-1">${esc(s.name)}</h2><div class="by">by ${esc(s.author)}${s.url ? ` · <a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">${s.kind === "tool" ? (s.url === s.repo_url ? repoLabel(s.url) : "website") : "view source"} ↗</a>` : ""}</div></div></div>
    <div class="m-badges">${s.is_new ? '<span class="badge new">New</span>' : ""}${badges}</div>`;
}
const shelfLabel = (on) => (on ? "♥ On my shelf" : "♡ Add to my shelf");
const triedLabel = (on) => (on ? "✓ I’ve tried it" : "Mark as tried");
function rateHtml(id) {
  const fav = user.favorites.includes(id), tried = user.tried.includes(id);
  return `<div class="rate"><span id="m-rate-label">Your rating</span><span class="stars" id="m-stars" role="group" aria-labelledby="m-rate-label"></span>
      <button class="toggle ${fav ? "on" : ""}" id="m-fav" aria-pressed="${fav}">${shelfLabel(fav)}</button>
      <button class="toggle ${tried ? "on" : ""}" id="m-tried" aria-pressed="${tried}">${triedLabel(tried)}</button></div>`;
}
/* Sheet tabs: the first one listed is open. */
const tabsHtml = (list) => `<div class="tabs" id="m-tabs" role="tablist" aria-label="About this item">${list.map(([k, l], i) =>
  `<button role="tab" id="tab-${k}" data-t="${k}" aria-controls="p-${k}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" class="${i === 0 ? "on" : ""}">${l}</button>`).join("")}</div>`;
const panel = (k, html, open) => `<div class="panel" role="tabpanel" id="p-${k}" aria-labelledby="tab-${k}" data-p="${k}" ${open ? "" : "hidden"}>${html}</div>`;
const notesHtml = (id) => panel("notes", `<label class="sr-only" for="m-note">My notes</label>
      <textarea id="m-note" placeholder="What worked, what didn’t, prompts worth remembering…">${esc(user.notes[id] || "")}</textarea>
      <p class="note">Saved automatically in this browser only — nobody else can see it.</p>`);
const platformSeg = (list) => `<p class="pick" id="m-pick">Set it up for:</p><div class="seg" id="m-platform" role="group" aria-labelledby="m-pick">${list.map(([v, l]) => `<button data-v="${v}" aria-pressed="false">${l}</button>`).join("")}</div><div id="m-invoke" aria-live="polite"></div>`;
/* Remember the visitor's agent across sheets. Skills say "claude-app", tools "claude-desktop" for the same Claude app. */
function pickPlatform(kind, fallback) {
  let p = user.agent || fallback;
  if (kind === "tool" && p === "claude-app") p = "claude-desktop";
  if (kind !== "tool" && p === "claude-desktop") p = "claude-app";
  return p;
}
function rememberPlatform(p) {
  const v = p === "claude-desktop" ? "claude-app" : p;
  if (user.agent !== v) { user.agent = v; saveUser(); }
}

/* Wires up the parts every detail sheet shares. extra(e) handles sheet-specific clicks. */
function wireSheet(id, setPlatform, extra) {
  const drawStars = () => ($("#m-stars").innerHTML = [1, 2, 3, 4, 5].map((n) =>
    `<button data-n="${n}" class="${(user.ratings[id] || 0) >= n ? "on" : ""}" aria-pressed="${(user.ratings[id] || 0) === n}" aria-label="${n} star${n > 1 ? "s" : ""}">★</button>`).join(""));
  drawStars();
  $("#m-body").onclick = async (e) => {
    const t = e.target.closest("button,a") || e.target;
    if (t.dataset.n) { user.ratings[id] = user.ratings[id] === +t.dataset.n ? undefined : +t.dataset.n; if (!user.ratings[id]) delete user.ratings[id]; drawStars(); saveUser(); render(); }
    else if (t.id === "m-fav" || t.id === "m-tried") {
      const key = t.id === "m-fav" ? "favorites" : "tried";
      user[key] = user[key].includes(id) ? user[key].filter((x) => x !== id) : [...user[key], id];
      const on = user[key].includes(id);
      t.classList.toggle("on", on); t.setAttribute("aria-pressed", on);
      t.textContent = key === "favorites" ? shelfLabel(on) : triedLabel(on);
      saveUser(); render();
    } else if (t.dataset.t) showTab(t);
    else if (t.dataset.v && t.closest("#m-platform")) { setPlatform(t.dataset.v); rememberPlatform(t.dataset.v); }
    else if (t.dataset.open) openItem(t.dataset.open);
    else if (t.dataset.copy !== undefined) { await navigator.clipboard.writeText(t.dataset.copy); toast("Copied"); }
    else if (extra) extra(t);
  };
  $("#m-tabs").onkeydown = (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const tabs = [...document.querySelectorAll("#m-tabs [role=tab]")], i = tabs.indexOf(document.activeElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    e.preventDefault(); showTab(tabs[next]); tabs[next].focus();
  };
  $("#m-note").oninput = (e) => {
    if (e.target.value.trim()) user.notes[id] = e.target.value; else delete user.notes[id];
    clearTimeout(wireSheet.t); wireSheet.t = setTimeout(saveUser, 600);
  };
}
function showTab(t) {
  document.querySelectorAll("#m-tabs [role=tab]").forEach((b) => {
    const on = b === t;
    b.classList.toggle("on", on); b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1;
  });
  document.querySelectorAll(".panel").forEach((p) => (p.hidden = p.dataset.p !== t.dataset.t));
}
function openItem(id) {
  const x = byId(id);
  if (!x) return;
  if (x.kind === "tool") openTool(x); else if (x.builtin) openBuiltin(x); else openSkill(x);
}

/* ---------- built-in feature detail (nothing to download: just steps) ---------- */
function openBuiltin(s) {
  const id = s.id, app = s.builtin;
  const steps = (s.steps || []).map((st) => `<li>${esc(st.text)}${st.cmd ? cmd(st.cmd) : ""}</li>`).join("");
  showSheet(s, headHtml(Object.assign({}, s, { url: "" }), CATS[s.category][1], `
      <span class="badge ${s.tier}" title="${TIER_HELP.skill[s.tier]}">${TIERS[s.tier]}</span>
      <span class="badge cat" style="--c:var(--c-${s.category})">${CATS[s.category][0]}</span>
      <span class="badge builtin">Built into ${esc(app)}</span>`) + `
    <p class="lead">${esc(s.summary)}</p>
    <p class="meta">Comes with ${esc(app)}, by ${esc(s.author)} — nothing to download or install. <a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">Official documentation ↗</a></p>
    ${rateHtml(id)}
    ${tabsHtml([["invoke", "How to use it"], ["about", "About"], ["notes", "My notes"]])}
    ${panel("invoke", `<p class="pick">In ${esc(app)}:</p><ol class="steps">${steps}</ol>
      ${(s.notes || []).map((n) => `<p class="note">${esc(n)}</p>`).join("")}
      <p class="note">Only in ${esc(app)}. Other agents (ChatGPT, Gemini CLI, Copilot, Cursor) don’t have this feature.</p>`, true)}
    ${panel("about", `
      ${s.use_case ? `<h3>When to reach for it</h3><p>${esc(s.use_case)}</p>` : ""}
      <h3>What it does</h3><p>${esc(s.description)}</p>
      <p class="note">Built-in features are hand-picked by the café. Details come from ${esc(s.author)}’s documentation, linked above.</p>`)}
    ${notesHtml(id)}`);
  wireSheet(id, () => {});
}

/* ---------- skill detail ---------- */
const enc = (p) => p.split("/").map(encodeURIComponent).join("/");
const rawUrl = (s, rel) => `https://raw.githubusercontent.com/${enc(s.repo)}/${encodeURIComponent(s.branch || "main")}/${enc([s.folder, rel].filter(Boolean).join("/"))}`;
const stripFront = (t) => t.replace(/^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, "");
const licNote = (s) => `This skill’s licence (${esc(s.license || "not stated")}) doesn’t clearly allow re-sharing, so we send you to the author’s own page instead of offering a copy here.`;
function getSkillHtml(s) {
  return s.open
    ? `<div class="actions"><button class="btn primary small" data-zip>Download ${esc(s.slug)}.zip</button></div>
       <span class="note">Downloaded straight from the author’s GitHub repository (${esc(s.license)} licence).</span>`
    : `<div class="actions"><a class="btn primary small" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">Get it from the author ↗</a></div>
       <span class="note">${licNote(s)}</span>`;
}
const winPath = (p) => p.replace(/^~/, "C:\\Users\\<you>").replace(/\//g, "\\");
function placeSteps(s, home, project, start, invoke) {
  return `<ol class="steps">
    <li><b>Get the skill folder.</b>${getSkillHtml(s)}</li>
    <li><b>Put the <code>${esc(s.slug)}</code> folder in</b> <code>${home}/</code>
      <span class="note">On Windows that’s <code>${esc(winPath(home))}</code>; create the folder if it doesn’t exist.${project ? ` For one project only, use <code>${project}/</code> inside that project instead.` : ""}</span></li>
    <li>${start}</li>
    <li>${invoke}</li></ol>`;
}
function invokeHtml(s, platform) {
  const ask = `Use the ${s.name} skill to help me with this: `;
  if (platform === "claude-code") return placeSteps(s, "~/.claude/skills", ".claude/skills",
    "<b>Start a new Claude Code session</b> so it picks the skill up.",
    `<b>Invoke it</b> — type the slash command:${cmd("/" + s.slug)}or just describe your task; Claude loads the skill when your request matches.`);
  if (platform === "claude-app") {
    return `<ol class="steps">
      <li><b>Get the skill</b> as a .zip file.${getSkillHtml(s)}</li>
      <li><b>Upload it</b> in Claude (web or desktop): <b>Settings → Capabilities → Skills → Upload skill</b>. <span class="note">Menu names can differ slightly between versions; code execution must be on.</span></li>
      <li><b>Invoke it</b> — just ask. Claude uses the skill when it fits, or name it:${cmd(ask)}</li></ol>`;
  }
  if (platform === "chatgpt") {
    return `<ol class="steps">
      <li><b>If your ChatGPT plan has Skills</b>, add the .zip there.${getSkillHtml(s)}</li>
      <li><b>Otherwise, use it as instructions:</b> create a <b>Project</b> or <b>custom GPT</b> and paste the skill’s instructions into its instructions box.
        ${s.open ? `<div class="actions"><button class="btn small" data-copymd>Copy skill instructions</button></div>` : `<span class="note">Open the skill’s <code>SKILL.md</code> on the author’s page and copy it from there.</span>`}</li>
      <li><b>Invoke it</b> inside that Project / GPT:${cmd(ask)}</li></ol>
      <p class="note">Skills that bundle scripts (${s.has_scripts ? "this one does" : "this one does not"}) work best in agents that can run code, like Codex or Claude Code.</p>`;
  }
  if (platform === "codex") return placeSteps(s, "~/.codex/skills", ".agents/skills",
    "<b>Restart Codex.</b>", `<b>Invoke it</b> with a dollar sign:${cmd("$" + s.slug)}or describe the task and let Codex choose it.`);
  if (platform === "gemini") return placeSteps(s, "~/.gemini/skills", ".gemini/skills",
    `<b>Start Gemini CLI</b> and type ${cmd("/skills list")}to check it’s there.`,
    `<b>Invoke it</b> by describing your task. Gemini asks you to approve the skill before using it:${cmd(ask)}`);
  if (platform === "copilot") return placeSteps(s, "~/.copilot/skills", ".github/skills",
    "<b>Open Copilot Chat in VS Code</b> in Agent mode. (Skills in <code>~/.claude/skills</code> work too.)",
    `<b>Invoke it</b> with the slash command:${cmd("/" + s.slug)}or describe your task.`);
  if (platform === "cursor") return placeSteps(s, "~/.claude/skills", ".cursor/skills",
    "<b>Restart Cursor</b> or open a new Agent chat. (Cursor reads Claude’s personal skills folder.)",
    `<b>Invoke it</b> by describing your task in Agent chat, or name it:${cmd(ask)}`);
  return `<p>Skills use the open <b>SKILL.md</b> format, which dozens of agents read (OpenCode, Goose, Amp, Roo Code, Junie, Kiro and more).</p>
    <ol class="steps"><li>Get the skill folder.${getSkillHtml(s)}</li>
    <li>Put it in your agent’s skills folder — often <code>.agents/skills/</code> in your project. Check your agent’s documentation.</li>
    <li>Ask for the task, or name the skill:${cmd(ask)}</li></ol>
    <p class="note">Have Node.js? <code>npx skills add ${esc(s.repo)}</code> installs skills from this collection into most agents.</p>`;
}

/* A tiny ZIP writer (stored, no compression) so downloads need no server. */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function makeZip(files) {
  const te = new TextEncoder(), parts = [], central = [];
  let off = 0;
  for (const f of files) {
    const name = te.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const h = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [12, 0x21, 2], [14, crc, 4], [18, size, 4], [22, size, 4], [26, name.length, 2]]
      .forEach(([o, v, n]) => (n === 4 ? h.setUint32(o, v, true) : h.setUint16(o, v, true)));
    parts.push(new Uint8Array(h.buffer), name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [14, 0x21, 2], [16, crc, 4], [20, size, 4], [24, size, 4], [28, name.length, 2], [42, off, 4]]
      .forEach(([o, v, n]) => (n === 4 ? c.setUint32(o, v, true) : c.setUint16(o, v, true)));
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + size;
  }
  const csize = central.reduce((a, b) => a + b.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, csize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: "application/zip" });
}
async function downloadSkill(s, btn) {
  const label = btn.textContent;
  btn.disabled = true;
  try {
    const files = [];
    let total = 0, done = 0;
    const list = (s.files || []).filter((p) => p && !p.split("/").some((x) => x === ".." || x === "."));
    for (let i = 0; i < list.length; i += 8) {
      await Promise.all(list.slice(i, i + 8).map(async (p) => {
        const r = await fetch(rawUrl(s, p));
        if (!r.ok) return;
        const data = new Uint8Array(await r.arrayBuffer());
        total += data.length;
        files.push({ name: `${s.slug}/${p === s.skill_file ? "SKILL.md" : p}`, data });   // agents expect SKILL.md
        btn.textContent = `Downloading… ${++done}/${list.length}`;
      }));
      if (total > 8e6) throw new Error("This skill is too large to bundle here — get it from the author’s page.");
    }
    if (!files.some((f) => f.name === `${s.slug}/SKILL.md`)) throw new Error("Couldn’t reach GitHub to download this skill. Try again in a minute.");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(makeZip(files)); a.download = `${s.slug}.zip`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    toast(`Downloaded ${files.length} file(s)`);
  } catch (err) { toast(err.message, 6000); }
  btn.disabled = false; btn.textContent = label;
}

function openSkill(s) {
  const id = s.id;
  // The build splits the author's description into "use this when…" sentences (use_case) and the rest (summary).
  // When every sentence was a "when" sentence, summary falls back to the whole description, so don't show it twice.
  const when = s.use_case && s.use_case !== s.summary ? s.use_case : "";
  const what = when && s.summary === s.description ? "" : s.summary || s.description;
  const tools = (skillTools[id] || []).slice(0, 6);
  const repoLink = `<a href="${esc(safeUrl("https://github.com/" + s.repo))}" target="_blank" rel="noopener">${esc(s.repo)} ↗</a>`;
  showSheet(s, headHtml(s, CATS[s.category][1], `
      <span class="badge ${s.tier}" title="${TIER_HELP.skill[s.tier]}">${TIERS[s.tier]}</span>
      <span class="badge cat" style="--c:var(--c-${s.category})">${CATS[s.category][0]}</span>
      <span class="badge">${ORIGINS[s.origin]}</span>
      ${s.has_tests ? '<span class="badge" title="The skill folder includes test or eval files">✓ Comes with tests</span>' : ""}
      ${s.has_scripts ? '<span class="badge" title="The skill bundles programs your agent can run">Includes scripts</span>' : ""}`) + `
    <p class="lead">${esc(window.skillBlurb ? skillBlurb(s) : s.summary)}</p>
    <p class="meta">${s.stars ? `★ ${fmtNum(s.stars)} GitHub stars on the whole ${repoLink} collection` : `From ${repoLink}`}
      · updated ${fmtDate(s.updated)} · licence ${esc(s.license || "not stated")}${s.open ? " (open)" : ""}</p>
    ${rateHtml(id)}
    ${tabsHtml([["invoke", "How to use it"], ["about", "About"], ["inside", "What’s inside"], ["notes", "My notes"]])}
    ${panel("invoke", (skillNotes[s.id] || skillNotes[s.repo] ? `<p class="setup-note">${esc(skillNotes[s.id] || skillNotes[s.repo])}</p>` : "") + platformSeg([["claude-code", "Claude Code"], ["claude-app", "Claude app"], ["chatgpt", "ChatGPT"], ["codex", "Codex"], ["gemini", "Gemini CLI"], ["copilot", "GitHub Copilot"], ["cursor", "Cursor"], ["other", "Other agents"]]), true)}
    ${panel("about", `
      ${when ? `<h3>When to reach for it</h3><p>${esc(when)}</p>` : ""}
      ${what ? `<h3>What it does</h3><p>${esc(what)}</p>` : ""}
      ${tools.length ? `<h3>Works with these tools</h3>${miniList(tools)}<p class="note">Tools this skill mentions by name. Connect one to let your AI act on that service.</p>` : ""}
      <p class="note">The star count belongs to the whole source collection (${esc(s.repo)}), not this single skill. ${TIER_HELP.skill[s.tier]}</p>`)}
    ${panel("inside", "")}
    ${notesHtml(id)}`);

  const files = `<h3>Files in this skill (${(s.files || []).length})</h3><div class="files">${(s.files || []).map(esc).join("<br>")}</div>`;
  let body = null;
  const inside = document.querySelector('[data-p="inside"]');
  inside.innerHTML = '<p class="note">Loading…</p>';
  const detail = s.open
    ? fetch(rawUrl(s, s.skill_file || "SKILL.md")).then((r) => (r.ok ? r.text() : Promise.reject())).then((t) => {
        body = stripFront(t);
        inside.innerHTML = files + `<h3>SKILL.md — the instructions your agent reads</h3><div class="md">${md(body)}</div>
          <p class="note">Shown from <a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">the author’s repository</a> under the ${esc(s.license)} licence.</p>`;
      }).catch(() => (inside.innerHTML = files + `<p class="note">Couldn’t load the instructions from GitHub right now. <a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">Read them on the author’s page ↗</a></p>`))
    : Promise.resolve(inside.innerHTML = files + `<p class="note">${licNote(s)} <a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">Read the instructions on the author’s page ↗</a></p>`);

  const setPlatform = (p) => {
    document.querySelectorAll("#m-platform button").forEach((b) => { b.classList.toggle("on", b.dataset.v === p); b.setAttribute("aria-pressed", b.dataset.v === p); });
    $("#m-invoke").innerHTML = invokeHtml(s, p);
  };
  setPlatform(pickPlatform("skill", s.origin === "openai" ? "codex" : "claude-code"));

  wireSheet(id, setPlatform, async (t) => {
    if (t.dataset.copymd !== undefined) {
      await detail;
      if (body) { await navigator.clipboard.writeText(`# Skill: ${s.name}\n\n${s.description}\n\n${body}`); toast("Skill instructions copied"); }
      else toast("Couldn’t load the instructions — copy them from the author’s page.", 5000);
    } else if (t.dataset.zip !== undefined) downloadSkill(s, t);
  });
}

/* ---------- tool detail ---------- */
const RUNTIMES = {
  npx: ["Node.js", "https://nodejs.org"], uvx: ["uv (a Python tool runner)", "https://docs.astral.sh/uv/"],
  docker: ["Docker Desktop", "https://www.docker.com/products/docker-desktop/"], dnx: [".NET 10 SDK", "https://dotnet.microsoft.com/download"],
};
const placeholder = (name) => (/^authorization$/i.test(name) ? "Bearer <your-access-token>" : `<your-${name.toLowerCase().replace(/_/g, "-")}>`);
const shq = (a) => (/[\s"<>|&]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);

/* Turn the registry entry into something we can write setup steps for. */
function serverSpec(t) {
  const remote = t.remotes.find((r) => r.type === "streamable-http") || t.remotes.find((r) => r.type === "sse");
  if (remote) return { kind: "remote", url: remote.url, transport: remote.type === "sse" ? "sse" : "http", headers: remote.headers || [] };
  for (const p of t.packages) {
    if (p.registry === "mcpb") return { kind: "mcpb", url: p.identifier, env: p.env };
    if (p.transport !== "stdio") continue;
    const runtime = ["npx", "uvx", "docker", "dnx"].includes(p.runtime) ? p.runtime
      : { npm: "npx", pypi: "uvx", oci: "docker", nuget: "dnx" }[p.registry];
    if (!runtime) continue;
    const env = p.env.filter((e) => e.required || e.default);
    const pkgArgs = [];
    p.args.forEach((a) => {
      if (a.type === "named") pkgArgs.push(a.name, ...(a.value || a.valueHint ? [a.value || `<${a.valueHint}>`] : []));
      else pkgArgs.push(a.value || `<${a.valueHint || a.name || "value"}>`);
    });
    const args = runtime === "npx" ? ["-y", p.identifier, ...pkgArgs]
      : runtime === "docker" ? ["run", "-i", "--rm", ...env.flatMap((e) => ["-e", e.name]), p.identifier, ...pkgArgs]
      : runtime === "dnx" ? [p.identifier, "--yes", ...pkgArgs] : [p.identifier, ...pkgArgs];
    return { kind: "local", command: runtime, args, env, allEnv: p.env };
  }
  return null;
}
const envValue = (e) => e.default || placeholder(e.name);

function jsonConfig(t, spec, rootKey = "mcpServers") {
  const entry = spec.kind === "remote"
    ? Object.assign({ url: spec.url }, spec.headers.length ? { headers: Object.fromEntries(spec.headers.map((h) => [h.name, placeholder(h.name)])) } : {})
    : Object.assign({ command: spec.command, args: spec.args }, spec.env.length ? { env: Object.fromEntries(spec.env.map((e) => [e.name, envValue(e)])) } : {});
  return JSON.stringify({ [rootKey]: { [t.slug]: entry } }, null, 2);
}
function runtimeNote(spec) {
  if (spec.kind !== "local") return "";
  const [name, url] = RUNTIMES[spec.command];
  return `<p class="note">Needs <b>${esc(name)}</b> installed on this computer (<a href="${url}" target="_blank" rel="noopener">get it here</a>), because the tool runs locally using <code>${spec.command}</code>.</p>`;
}
function keysNote(spec) {
  const keys = spec.kind === "remote" ? spec.headers : spec.kind === "local" ? spec.env : [];
  if (!keys.length) return "";
  return `<p class="note">🔑 Replace each <code>&lt;your-…&gt;</code> placeholder with your own value — the <b>Details</b> tab says what each one is. An “access token” is a password-like key you create in that service’s settings. Keep API keys private — paste them yourself; never share them in a chat.</p>`;
}

function connectHtml(t, platform) {
  const spec = serverSpec(t);
  if (!spec) return `<p>This tool doesn’t publish a standard way to connect it automatically. ${t.url || t.website
    ? `Follow the setup instructions on its <a href="${esc(safeUrl(t.url || t.website))}" target="_blank" rel="noopener">publisher’s page ↗</a>.` : "Ask its publisher how to connect it."}</p>`;
  const ask = `Using the ${t.name} tool, `;
  if (spec.kind === "mcpb") {
    return `<ol class="steps"><li><b>Download the extension file</b> (.mcpb) from <a href="${esc(safeUrl(spec.url))}" target="_blank" rel="noopener">here ↗</a>.</li>
      <li><b>Double-click it</b> — Claude Desktop opens it and asks you to confirm the install. ${platform === "claude-desktop" ? "" : "<span class=\"note\">This package format is made for Claude Desktop; other agents should use the publisher’s own instructions.</span>"}</li>
      <li><b>Try it:</b>${cmd(ask)}</li></ol>`;
  }
  const remote = spec.kind === "remote";
  if (platform === "claude-code") {
    const line = remote
      ? `claude mcp add --transport ${spec.transport} ${t.slug} ${spec.url}${spec.headers.map((h) => ` --header ${shq(h.name + ": " + placeholder(h.name))}`).join("")}`
      : `claude mcp add ${spec.env.map((e) => `--env ${shq(e.name + "=" + envValue(e))} `).join("")}${t.slug} -- ${[spec.command, ...spec.args].map(shq).join(" ")}`;
    return `<ol class="steps">
      <li><b>Run this in a terminal</b> (PowerShell on Windows, Terminal on Mac):${cmd(line)}
        <span class="note">Add <code>--scope user</code> after <code>add</code> to make it available in every project, not just the current folder.</span></li>
      <li><b>Check it’s connected:</b> start Claude Code and type ${cmd("/mcp")}${remote ? "If the tool asks you to sign in, Claude Code opens the sign-in page for you." : ""}</li>
      <li><b>Use it</b> by describing your task, e.g.${cmd(ask)}</li></ol>${remote ? "" : runtimeNote(spec)}${keysNote(spec)}`;
  }
  if (platform === "claude-desktop") {
    if (remote && !spec.headers.length) {
      return `<ol class="steps"><li>In Claude (web or desktop) open <b>Settings → Connectors → Add custom connector</b>.</li>
        <li>Name it <b>${esc(t.name)}</b> and paste this URL:${cmd(spec.url)}</li>
        <li>Click <b>Add</b>, then <b>Connect</b> and sign in if asked. Turn it on in a chat from the tools menu.</li>
        <li><b>Try it:</b>${cmd(ask)}</li></ol>
        <p class="note">Custom connectors need a paid Claude plan; menu names may differ slightly between versions.</p>`;
    }
    return `<ol class="steps"><li>In <b>Claude Desktop</b> open <b>Settings → Developer → Edit Config</b>. This opens <code>claude_desktop_config.json</code>.</li>
      <li><b>Add this</b> inside the file (merge it into any existing <code>"mcpServers"</code> section):${cmd(jsonConfig(t, spec))}</li>
      <li><b>Save and fully quit Claude Desktop</b> (system tray → Quit), then reopen it.</li>
      <li><b>Try it:</b>${cmd(ask)}</li></ol>${remote ? '<p class="note">Remote tools that need an API key header can’t be added through the Connectors screen, so they go in this file. If Claude Desktop doesn’t accept a <code>"url"</code> entry in your version, use Claude Code instead.</p>' : runtimeNote(spec)}${keysNote(spec)}`;
  }
  if (platform === "chatgpt") {
    if (!remote) {
      return `<p><b>ChatGPT can’t run tools that live on your computer.</b> This one runs locally, so use it from <b>Codex</b> (OpenAI’s coding agent) instead — see the Codex tab.</p>`;
    }
    return `<ol class="steps"><li>In ChatGPT open <b>Settings → Apps &amp; Connectors → Advanced settings</b> and switch on <b>Developer mode</b>.</li>
      <li>Back in <b>Apps &amp; Connectors</b>, choose <b>Create</b>, name it <b>${esc(t.name)}</b> and paste this URL:${cmd(spec.url)}</li>
      <li>Sign in if asked, then turn the connector on in a chat.</li>
      <li><b>Try it:</b>${cmd(ask)}</li></ol>
      <p class="note">Custom connectors depend on your ChatGPT plan and menu names change often; check OpenAI’s help pages if yours look different.${spec.headers.length ? " This tool expects an API key header, which ChatGPT may not support — Codex is the safer route." : ""}</p>`;
  }
  if (platform === "codex") {
    const toml = remote
      ? `[mcp_servers.${t.slug}]\nurl = "${spec.url}"`
      : `[mcp_servers.${t.slug}]\ncommand = "${spec.command}"\nargs = [${spec.args.map((a) => JSON.stringify(a)).join(", ")}]` +
        (spec.env.length ? `\nenv = { ${spec.env.map((e) => `${e.name} = ${JSON.stringify(envValue(e))}`).join(", ")} }` : "");
    return `<ol class="steps"><li>Open (or create) <code>config.toml</code> in the <code>.codex</code> folder inside your user folder.</li>
      <li><b>Add this</b> at the end:${cmd(toml)}</li>
      <li><b>Restart Codex</b>, then type ${cmd("/mcp")} to check it’s listed.</li>
      <li><b>Try it:</b>${cmd(ask)}</li></ol>${remote ? `<p class="note">Remote tools need a recent Codex version.${spec.headers.length ? " For the API key header, see the Codex docs on <code>http_headers</code>." : ""}</p>` : runtimeNote(spec)}${keysNote(spec)}`;
  }
  if (platform === "gemini") {
    const entry = remote
      ? Object.assign({ [spec.transport === "sse" ? "url" : "httpUrl"]: spec.url }, spec.headers.length ? { headers: Object.fromEntries(spec.headers.map((h) => [h.name, placeholder(h.name)])) } : {})
      : Object.assign({ command: spec.command, args: spec.args }, spec.env.length ? { env: Object.fromEntries(spec.env.map((e) => [e.name, envValue(e)])) } : {});
    return `<ol class="steps"><li>Open (or create) <code>settings.json</code> in the <code>.gemini</code> folder inside your user folder.</li>
      <li><b>Add this</b> (merge it into any existing <code>"mcpServers"</code> section):${cmd(JSON.stringify({ mcpServers: { [t.slug]: entry } }, null, 2))}</li>
      <li><b>Restart Gemini CLI</b>, then type ${cmd("/mcp")}to check it’s connected.</li>
      <li><b>Try it:</b>${cmd(ask)}</li></ol>${remote ? "" : runtimeNote(spec)}${keysNote(spec)}`;
  }
  if (platform === "copilot") {
    const entry = remote
      ? Object.assign({ type: spec.transport, url: spec.url }, spec.headers.length ? { headers: Object.fromEntries(spec.headers.map((h) => [h.name, placeholder(h.name)])) } : {})
      : Object.assign({ type: "stdio", command: spec.command, args: spec.args }, spec.env.length ? { env: Object.fromEntries(spec.env.map((e) => [e.name, envValue(e)])) } : {});
    return `<ol class="steps"><li>In <b>VS Code</b>, press <b>Ctrl+Shift+P</b> and run <b>MCP: Open User Configuration</b>. (For one project only, create <code>.vscode/mcp.json</code> in it instead.)</li>
      <li><b>Add this</b> (merge it into any existing <code>"servers"</code> section; note VS Code uses <code>"servers"</code>, not <code>"mcpServers"</code>):${cmd(JSON.stringify({ servers: { [t.slug]: entry } }, null, 2))}</li>
      <li>Click the <b>Start</b> link that appears above the entry, then open <b>Copilot Chat</b> in Agent mode. The tool shows in the 🛠 tools picker.</li>
      <li><b>Try it:</b>${cmd(ask)}</li></ol>${remote ? "" : runtimeNote(spec)}${keysNote(spec)}`;
  }
  if (platform === "cursor") {
    return `<ol class="steps"><li>Open (or create) <code>mcp.json</code> in the <code>.cursor</code> folder inside your user folder. (For one project only, use <code>.cursor/mcp.json</code> in that project.)</li>
      <li><b>Add this</b> (merge it into any existing <code>"mcpServers"</code> section):${cmd(jsonConfig(t, spec))}</li>
      <li>Open <b>Cursor Settings → MCP</b> (called <b>Tools &amp; MCP</b> in some versions) and check the tool is switched on with a green dot.</li>
      <li><b>Try it</b> in Agent chat:${cmd(ask)}</li></ol>${remote ? "" : runtimeNote(spec)}${keysNote(spec)}`;
  }
  return `<p>Most other agents (Windsurf, OpenCode, Goose and more) read the same MCP configuration format:</p>
    ${cmd(jsonConfig(t, spec))}
    <p class="note">Each agent keeps this in its own settings file; check your agent’s documentation for where.</p>${remote ? "" : runtimeNote(spec)}${keysNote(spec)}`;
}

function detailsHtml(t) {
  const spec = serverSpec(t);
  const keys = (spec && spec.kind === "remote") ? spec.headers : (spec && spec.allEnv) || [];
  const keyRows = keys.map((e) => `<tr><td><code>${esc(e.name)}</code></td><td>${e.required ? "Required" : "Optional"}${e.secret ? " · 🔒 secret" : ""}</td><td>${esc(e.description || "—")}</td></tr>`).join("");
  const how = spec ? (spec.kind === "remote" ? `Runs online at <code>${esc(spec.url)}</code> — nothing to install.`
    : spec.kind === "mcpb" ? "Ships as a Claude Desktop extension (.mcpb)."
    : `Runs on your computer with <code>${esc(spec.command)}</code> (${esc(RUNTIMES[spec.command][0])}).`) : "See the publisher’s page.";
  return `<h3>How it runs</h3><p>${how}</p>
    <h3>Settings and keys</h3>${keyRows ? `<table class="keys"><tbody>${keyRows}</tbody></table>` : '<p class="note">None listed — it may ask you to sign in when you first connect.</p>'}
    <h3>Links</h3><p class="links">
      ${t.repo_url ? `<a href="${esc(safeUrl(t.repo_url))}" target="_blank" rel="noopener">${repoLabel(t.repo_url)} ↗</a>` : ""}
      ${t.website ? `<a href="${esc(safeUrl(t.website))}" target="_blank" rel="noopener">Website ↗</a>` : ""}
      <span class="note">Registry name: <code>${esc(t.registry_name)}</code></span></p>
    <h3>Safety</h3><p class="note">A tool is a program that can act on whatever you connect it to — your files, accounts or data. Only connect tools from publishers you trust, give them the narrowest access they need, and review what your AI does with them.</p>`;
}

function openTool(t) {
  const id = t.id;
  const skills = (t.skills || []).map((sid) => lib.skills.find((s) => s.id === sid)).filter(Boolean);
  const spec = serverSpec(t);
  const works = spec && spec.kind === "remote" ? "Claude, ChatGPT, Codex, Gemini, Copilot, Cursor and more" : "Claude Code, the Claude app, Codex, Gemini CLI, Copilot, Cursor and more";
  showSheet(t, headHtml(t, "🔌", `
      <span class="badge ${t.tier}" title="${TIER_HELP.tool[t.tier]}">${TIERS[t.tier]}</span>
      <span class="badge" title="The MCP Registry checked that the publisher controls this ${t.verified_by === "github" ? "GitHub account" : "domain"}">✓ ${t.verified_by === "github" ? "GitHub" : "Domain"} verified</span>
      <span class="badge cat" style="--c:var(--c-${t.category})">${CATS[t.category][0]}</span>
      <span class="badge ${t.is_remote ? "remote" : ""}">${t.is_remote ? "☁ Remote — no install" : "💻 Runs on your computer"}</span>`) + `
    <p class="lead">${esc(t.description)}</p>
    <p class="meta">${t.stars ? `★ ${fmtNum(t.stars)} GitHub stars` : "No public star count"}${t.version ? ` · version ${esc(t.version)}` : ""} · published ${fmtDate(t.created)}${skills.length ? ` · used by ${skills.length} skill${skills.length === 1 ? "" : "s"}` : ""}</p>
    ${rateHtml(id)}
    ${tabsHtml([["invoke", "How to connect"], ["about", "About"], ["inside", "Details"], ["notes", "My notes"]])}
    ${panel("invoke", platformSeg([["claude-code", "Claude Code"], ["claude-desktop", "Claude app"], ["chatgpt", "ChatGPT"], ["codex", "Codex"], ["gemini", "Gemini CLI"], ["copilot", "GitHub Copilot"], ["cursor", "Cursor"], ["other", "Other agents"]]) +
      `<p class="note">Works with ${works}.</p>`, true)}
    ${panel("about", `
      <h3>Skills that use it</h3>
      ${miniList(skills, "No skills in the café mention this tool by name yet. You can still use it on its own — just ask your AI.")}
      <p class="note">${TIER_HELP.tool[t.tier]}${t.stars ? " The star count belongs to the tool’s source repository." : ""}</p>`)}
    ${panel("inside", detailsHtml(t))}
    ${notesHtml(id)}`);
  const setPlatform = (p) => {
    document.querySelectorAll("#m-platform button").forEach((b) => { b.classList.toggle("on", b.dataset.v === p); b.setAttribute("aria-pressed", b.dataset.v === p); });
    $("#m-invoke").innerHTML = connectHtml(t, p);
  };
  setPlatform(pickPlatform("tool", "claude-code"));
  wireSheet(id, setPlatform);
}
function closeModal() {
  if ($("#modal").hidden) return;
  $("#modal").hidden = true; document.body.style.overflow = "";
  syncUrl(null);
  const back = returnFocus && document.contains(returnFocus) ? returnFocus : $("#q");
  back.focus({ preventScroll: true }); returnFocus = null;
}

﻿
/* ---------- events ---------- */
const TOGGLES = [["#f-fav", "fav"], ["#f-new", "isNew"], ["#f-tests", "tests"], ["#f-remote", "remote"], ["#f-linked", "linked"]];
function syncControls() {
  [["#origin", "origin"], ["#tier", "tier"], ["#view", "view"]].forEach(([id, key]) =>
    $(id).querySelectorAll("button").forEach((b) => { b.classList.toggle("on", b.dataset.v === f[key]); b.setAttribute("aria-pressed", b.dataset.v === f[key]); }));
  TOGGLES.forEach(([id, key]) => { $(id).classList.toggle("on", !!f[key]); $(id).setAttribute("aria-pressed", !!f[key]); });
  $("#sort").value = f.sort;
}
function setView(v) { f.view = v; syncControls(); }
/* Keep the address bar in step with what's on screen, so a link (or a reload) brings you back here. */
let openNow = null;
function syncUrl(id) {
  if (id !== undefined) openNow = id;
  const u = new URLSearchParams();
  if (mode === "tools") u.set("mode", "tools");
  if (f.q) u.set("q", f.q);
  if (f.cat !== "all") u.set("cat", f.cat);
  if (f.repo && mode === "skills") u.set("source", f.repo);
  if (f.origin !== "all" && mode === "skills") u.set("made", f.origin);
  if (f.tier !== "all") u.set("tier", f.tier);
  [["isNew", "new"], ["tests", "tests"], ["remote", "remote"], ["linked", "linked"]].forEach(([k, n]) => f[k] && u.set(n, "1"));
  if (f.sort !== "popular") u.set("sort", f.sort);
  if (f.view !== "cards") u.set("view", f.view);
  if (openNow) u.set("open", openNow);
  const qs = u.toString();
  try { history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "")); } catch { /* ignore */ }
}
function seg(id, key) {
  $(id).onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    f[key] = b.dataset.v; f.shown = PAGE; syncControls(); render();
  };
}
seg("#origin", "origin"); seg("#tier", "tier"); seg("#view", "view");
TOGGLES.forEach(([id, key]) => ($(id).onclick = () => { f[key] = !f[key]; f.shown = PAGE; syncControls(); render(); }));
$("#filters-btn").onclick = () => {
  const open = $("#filters").hidden;
  $("#filters").hidden = !open; $("#filters-btn").setAttribute("aria-expanded", open);
};
$("#sort").onchange = (e) => { f.sort = e.target.value; render(); };
$("#q").oninput = (e) => { f.q = e.target.value.trim(); f.shown = PAGE; clearTimeout(load.t); load.t = setTimeout(render, 120); };
$("#cats").onclick = (e) => { const b = e.target.closest("[data-cat]"); if (!b) return; f.cat = b.dataset.cat; f.shown = PAGE; render(); };
$("#more").onclick = () => { f.shown += PAGE; render(); };
$("#mode").onclick = (e) => {
  const b = e.target.closest("button"); if (!b || b.dataset.v === mode) return;
  const q = f.q;                       // keep the visitor's search when switching between skills and tools
  mode = b.dataset.v; clearFilters(false); f.q = q; $("#q").value = q; renderMode();
};
$("#grid").onclick = (e) => {
  const heart = e.target.closest("[data-fav]");
  if (heart) {
    const id = heart.dataset.fav;
    user.favorites = user.favorites.includes(id) ? user.favorites.filter((x) => x !== id) : [...user.favorites, id];
    heart.classList.toggle("on"); saveUser();
    $("#fav-count").textContent = items().filter((s) => user.favorites.includes(s.id)).length || "";
    if (f.fav) render();
    return;
  }
  const card = e.target.closest(".card"); if (card) openItem(card.dataset.id);
};
$("#blend-row").onclick = (e) => { const b = e.target.closest("[data-open]"); if (b) openItem(b.dataset.open); };
$("#grid").onkeydown = (e) => { if (e.key === "Enter" && e.target.classList.contains("card")) openItem(e.target.dataset.id); };
$("#surprise").onclick = () => {
  const pool = current.length ? current : items();
  if (pool.length) openItem(pool[Math.floor(Math.random() * pool.length)].id);
};
function clearFilters(rerender = true) {
  Object.assign(f, { q: "", cat: "all", repo: "", origin: "all", tier: "all", fav: false, isNew: false, tests: false, remote: false, linked: false, shown: PAGE });
  $("#q").value = "";
  syncControls();
  if (rerender) render();
}
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-clear]")) clearFilters();
  else if (e.target.closest("[data-switch]")) $(`#mode [data-v="${mode === "skills" ? "tools" : "skills"}"]`).click();
  else if (e.target.closest("[data-source]")) {
    const repo = e.target.closest("[data-source]").dataset.source;
    clearFilters(false); f.repo = repo; setView("cards"); render(); window.scrollTo({ top: $("#count").offsetTop - 80 });
  }
});
$("#m-close").onclick = closeModal;
$("#modal").onclick = (e) => { if (e.target.id === "modal") closeModal(); };
document.addEventListener("keydown", (e) => {
  if ($("#modal").hidden) return;
  if (e.key === "Escape") return closeModal();
  if (e.key !== "Tab") return;
  // keep keyboard focus inside the open sheet
  const els = [...$(".sheet").querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
  if (!els.length) return;
  const first = els[0], last = els[els.length - 1];
  if (!$(".sheet").contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

/* ---------- site links (set in config.js) ---------- */
const CFG = window.CAFE || {};
document.querySelectorAll("[data-donate]").forEach((a) => {
  if (/^https:\/\//.test(CFG.donateUrl || "")) a.href = CFG.donateUrl; else a.hidden = true;
});
document.querySelectorAll("[data-removal]").forEach((a) => {
  if (/^https:\/\/github\.com\//.test(CFG.repoUrl || "")) a.href = CFG.repoUrl.replace(/\/$/, "") + "/issues/new?template=removal.yml";
  else a.hidden = true;
});

/* Deep links from the welcome page: /menu?q=…&cat=…&source=owner/repo&mode=tools&open=<id> */
const LINK = new URLSearchParams(location.search);
if (LINK.get("mode") === "tools") mode = "tools";
if (LINK.get("q")) { f.q = LINK.get("q").slice(0, 100); $("#q").value = f.q; }
if (CATS[LINK.get("cat")]) f.cat = LINK.get("cat");
if (LINK.get("source")) f.repo = LINK.get("source").slice(0, 200);
if (ORIGINS[LINK.get("made")]) f.origin = LINK.get("made");
if (TIERS[LINK.get("tier")]) f.tier = LINK.get("tier");
[["isNew", "new"], ["tests", "tests"], ["remote", "remote"], ["linked", "linked"]].forEach(([k, n]) => (f[k] = LINK.get(n) === "1"));
if (["stars", "recent", "az", "mine"].includes(LINK.get("sort"))) f.sort = LINK.get("sort");
if (["galaxy", "sources"].includes(LINK.get("view"))) f.view = LINK.get("view");

if (hiddenFilterCount() || f.sort !== "popular") { $("#filters").hidden = false; $("#filters-btn").setAttribute("aria-expanded", "true"); }
load().then(() => { if (LINK.get("open")) openItem(LINK.get("open")); })
  .catch(() => ($("#stats").textContent = "Couldn’t load the menu. Please refresh the page."));
