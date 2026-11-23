"""Builds one plain web page per skill and per tool, plus the sitemap, so search engines can list them.

Run:  python scripts/pages.py     (build.py runs this automatically after the nightly update)

Reads   site/data/skills.json, tools.json, builtins.json, skill_notes.json
Writes  site/skill/<name>.html, site/tool/<name>.html, site/sitemap.xml

Visitors still use the menu: every page has a "See it on the menu" button that opens the same card.
Licence rule is the same as the menu: pages only show the short description, never the skill's files.
"""
import html
import json
import os
import re
import shutil
from urllib.parse import quote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, "site")
DATA = os.path.join(SITE, "data")
BASE = "https://www.aiskillscafe.com"
CSS = "/style.css?v=23"

CATS = {
    "docs": ("Documents & Office", "📄"), "code": ("Coding & Engineering", "🛠️"), "design": ("Design & Creative", "🎨"),
    "data": ("Data & Research", "📊"), "science": ("Science", "🔬"), "writing": ("Writing & Marketing", "✍️"),
    "workflow": ("Planning & Workflow", "🧭"), "other": ("Everything else", "✨"),
}
TIERS = {"official": "Official", "trusted": "Trusted pick", "popular": "Popular"}
TIER_HELP = {
    "skill": {
        "official": "Published by the AI company or platform itself.",
        "trusted": "Hand-picked by the café: a widely used community collection.",
        "popular": "Found on GitHub with 2,000+ stars, an open-source licence and activity in the last year.",
    },
    "tool": {
        "official": "Published under a well-known company’s verified name in the official MCP Registry.",
        "trusted": "Hand-picked by the café.",
        "popular": "A community tool whose GitHub repository has 300+ stars.",
    },
}
ORIGINS = {"claude": "Made for Claude", "openai": "Made for ChatGPT / Codex", "cross": "Cross-agent"}
SKILL_KIND = {"claude": "Claude skill", "openai": "ChatGPT and Codex skill", "cross": "AI agent skill"}
RUNTIMES = {"npm": "Node.js (npx)", "pypi": "Python (uvx)", "oci": "Docker", "nuget": ".NET", "mcpb": "a one-click MCP bundle"}

e = lambda s: html.escape(str(s or ""), quote=True)


def load(name, default):
    try:
        with open(os.path.join(DATA, name), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def slugify(s):
    s = re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")
    return s[:80] or "item"


def assign_slugs(items, owner_of):
    """Short addresses (/skill/pptx). When two items share a name, both get the author added (pptx-anthropics)."""
    groups = {}
    for it in items:
        groups.setdefault(slugify(it["name"]), []).append(it)
    used = set()
    for base, group in sorted(groups.items()):
        for it in sorted(group, key=lambda x: x["id"]):
            first = slug = base if len(group) == 1 else "%s-%s" % (base, slugify(owner_of(it)))
            n = 2
            while slug in used:
                slug, n = "%s-%d" % (first, n), n + 1
            used.add(slug)
            it["_page"] = slug


# Same as site/blurb.js: author descriptions are written for the AI, so pick the sentence that reads best for a person.
JUNK = re.compile(r"^(for [^.]*,\s*see\b|see\b|do this\b|trigger\b|invoke\b|always\b|never\b|important\b|note:|\.{0,2}/)", re.I)


def tidy(t):
    t = re.sub(r"^this (includes|means)(\s+any task where the user wants to)?\s*:?\s*", "", t, flags=re.I)
    t = re.sub(r"^use (this skill )?(when|whenever|any time|anytime)\s+(the user|you|users?)\s+(wants?|needs?|asks?)\s+to\s+", "Helps you ", t, flags=re.I)
    t = re.sub(r"^use (this skill )?(when|whenever|any time|anytime|for)\s+", "For ", t, flags=re.I)
    t = re.sub(r"^when (the user|you|users?) (wants?|needs?) to\s+", "Helps you ", t, flags=re.I)
    t = re.sub(r"^when (the user|you|users?) (wants?|needs?)\s+", "For when you want ", t, flags=re.I)
    t = re.sub(r",?\s+or asks?\b[\s\S]*$", "", t, flags=re.I)
    t = re.split(r"\s*[:;]\s+|\s+[—–]\s+", t)[0]
    return re.sub(r"[\s,]+$", "", t)


def blurb(s):
    own = (s.get("summary") or "").strip()
    if len(own) >= 30 and not JUNK.match(own) and not re.match(r"this (includes|means)", own, re.I):
        return own
    sentences = [x.strip() for x in re.split(r"(?<=[.!?])\s+", s.get("description") or "") if x.strip()]
    for x in [own] + sentences:
        if x and not JUNK.match(x):
            t = tidy(x)
            if len(t) >= 20:
                t = t[0].upper() + t[1:]
                return t if re.search(r"[.!?)]$", t) else t + "."
    return own or (s.get("description") or "")


def safe_url(u):
    return u if isinstance(u, str) and u.startswith("https://") else ""


def fmt_num(n):
    n = n or 0
    return "%.1fk" % (n / 1000) if n >= 10000 else "{:,}".format(n)


def clip(s, n=155):
    s = re.sub(r"\s+", " ", s or "").strip()
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0].rstrip(",.;:") + "…"


def page(title, desc, path, body, ld):
    url = BASE + path
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{url}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{BASE}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#f6f3ec">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="{CSS}">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False).replace("</", "<\\/")}</script>
</head>
<body>
<a class="skip" href="#main">Skip to the page</a>
<header class="top">
  <a class="brand" href="/">
    <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><path d="M6 12h17v7a7 7 0 0 1-7 7h-3a7 7 0 0 1-7-7z" fill="currentColor"/><path d="M23 14h2.5a3.5 3.5 0 0 1 0 7H23" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M11 3c-1.5 2 1.5 3 0 6M16 3c-1.5 2 1.5 3 0 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity=".55"/></svg>
    <div><h1>AI Skills Café</h1><p>The menu</p></div>
  </a>
  <div class="top-actions">
    <a class="btn ghost" href="/menu" aria-label="Back to the menu">←<span class="long"> Back to the menu</span></a>
    <a class="btn primary" data-donate href="#" target="_blank" rel="noopener">☕ <span class="long">Buy me a coffee</span><span class="short">Donate</span></a>
  </div>
</header>

<main class="page item-page" id="main">
{body}
</main>

<footer class="foot">
  <p class="disclaimer"><b>AI Skills Café</b> <i>is not affiliated with Anthropic, OpenAI, Google, GitHub, Cursor or any listed author. Sources shown are listed by us and do not endorse the café. Skills and tools belong to their authors — we list them, credit them and link to them.</i></p>
  <nav>
    <a href="/about#how-we-choose">About the Café and How We Choose</a>
    <a data-removal href="#" target="_blank" rel="noopener">Request Removal</a>
    <a data-feature href="#" target="_blank" rel="noopener">Request a Feature</a>
    <a data-donate href="#" target="_blank" rel="noopener">Support the Café</a>
  </nav>
  <p class="visits" id="visits" hidden></p>
</footer>
<script src="/config.js?v=4"></script>
<script src="/links.js?v=6"></script>
</body>
</html>
"""


def crumbs(kind_label, kind_path, name):
    return (f'<nav class="crumbs" aria-label="You are here"><a href="/">Café</a> <span aria-hidden="true">›</span> '
            f'<a href="{kind_path}">{kind_label}</a> <span aria-hidden="true">›</span> <span aria-current="page">{e(name)}</span></nav>')


def breadcrumb_ld(kind_label, kind_path, name, path):
    return {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "AI Skills Café", "item": BASE + "/"},
        {"@type": "ListItem", "position": 2, "name": kind_label, "item": BASE + kind_path},
        {"@type": "ListItem", "position": 3, "name": name, "item": BASE + path}]}


def related_html(title, items, kind):
    if not items:
        return ""
    lis = "".join(f'<li><a href="/{kind}/{x["_page"]}">{e(x["name"])}</a><span>{e(clip(blurb(x) if kind == "skill" else (x.get("summary") or x.get("description")), 90))}</span></li>'
                  for x in items)
    return f'<h3>{e(title)}</h3><ul class="related">{lis}</ul>'


def menu_link(item):
    q = "?mode=tools&" if item.get("kind") == "tool" else "?"
    return "/menu" + q + "open=" + quote(item["id"], safe="")


def skill_page(s, peers, tools_for, notes):
    cat_label, cat_icon = CATS[s["category"]]
    path = "/skill/" + s["_page"]
    when = s.get("use_case") if s.get("use_case") and s.get("use_case") != s.get("summary") else ""
    what = "" if when and s.get("summary") == s.get("description") else (s.get("summary") or s.get("description"))
    builtin = s.get("builtin")
    kind = ("Built into " + builtin) if builtin else SKILL_KIND.get(s.get("origin"), "AI agent skill")
    title = f"{s['name']}: {kind} by {s.get('author') or 'its author'} — AI Skills Café"
    desc = clip(blurb(s))
    src = safe_url(s.get("url"))
    repo = s.get("repo") or ""
    badges = [f'<span class="badge {e(s["tier"])}" title="{e(TIER_HELP["skill"].get(s["tier"], ""))}">{e(TIERS.get(s["tier"], ""))}</span>',
              f'<span class="badge cat" style="--c:var(--c-{e(s["category"])})">{e(cat_label)}</span>',
              f'<span class="badge">{e(ORIGINS.get(s.get("origin"), ""))}</span>']
    if builtin:
        badges.append(f'<span class="badge builtin">Built into {e(builtin)}</span>')
    if s.get("has_tests"):
        badges.append('<span class="badge">✓ Comes with tests</span>')
    if s.get("has_scripts"):
        badges.append('<span class="badge">Includes scripts</span>')

    if builtin:
        meta = f'Comes with {e(builtin)}, by {e(s.get("author"))}. Nothing to download or install.'
        if src:
            meta += f' <a href="{e(src)}" target="_blank" rel="noopener">Official documentation ↗</a>'
    else:
        repo_link = f'<a href="{e("https://github.com/" + repo)}" target="_blank" rel="noopener">{e(repo)} ↗</a>' if repo else ""
        meta = f'By <b>{e(s.get("author"))}</b>' + (f' · from {repo_link}' if repo_link else "")
        if s.get("stars"):
            meta += f' · ★ {fmt_num(s["stars"])} stars on the whole collection'
        meta += f' · licence {e(s.get("license") or "not stated")}' + (" (open)" if s.get("open") else "")
        if (s.get("updated") or "")[:10]:
            meta += f' · updated {e(s["updated"][:10])}'

    note = notes.get(s["id"]) or notes.get(repo)
    if builtin:
        steps = "".join(f'<li>{e(st.get("text"))}' + (f'<pre><code>{e(st["cmd"])}</code></pre>' if st.get("cmd") else "") + "</li>"
                        for st in s.get("steps", []))
        how = f'<ol class="steps">{steps}</ol>' + "".join(f'<p class="note">{e(n)}</p>' for n in s.get("notes", []))
    else:
        get = ("You can download it from the menu as a ready-to-use folder, or copy its instructions."
               if s.get("open") else
               "Its licence doesn’t allow copies here, so the menu sends you to the author’s page to get it.")
        how = (f'<p>The menu has copy-paste setup steps for Claude Code, the Claude app, ChatGPT, Codex, Gemini CLI, '
               f'GitHub Copilot, Cursor and other agents. {get} Once it’s added, just ask your AI for the task and it uses the skill when it fits.</p>')
    if note:
        how = f'<p class="setup-note">{e(note)}</p>' + how

    body = [crumbs("Skills", "/menu", s["name"]),
            f'<h2 class="item-name">{e(s["name"])}</h2>',
            f'<p class="badges">{"".join(badges)}</p>',
            f'<p class="lead">{e(blurb(s))}</p>',
            f'<p class="meta">{meta}</p>',
            f'<p class="item-cta"><a class="btn big" href="{e(menu_link(s))}">See it on the menu →</a></p>']
    if when:
        body.append(f'<h3>When to reach for it</h3><p>{e(when)}</p>')
    if what and what != blurb(s):
        body.append(f'<h3>What it does</h3><p>{e(what)}</p>')
    body.append(f'<h3>How to use it</h3>{how}')
    if tools_for:
        body.append(related_html("Works with these tools", tools_for, "tool"))
    if not builtin:
        body.append(f'<p class="note">{e(TIER_HELP["skill"].get(s["tier"], ""))} Being listed is not an endorsement or a security review, so please read what a skill does before using it.</p>')
    body.append(related_html(f"More {cat_label} skills", peers, "skill"))

    app = {"@type": "SoftwareApplication", "name": s["name"], "description": s.get("description") or s.get("summary"),
           "applicationCategory": "DeveloperApplication", "operatingSystem": "Any", "url": BASE + path,
           "author": {"@type": "Organization" if builtin else "Person", "name": s.get("author") or ""},
           "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}}
    if src:
        app["sameAs"] = src
    if s.get("open") and s.get("license"):
        app["license"] = "https://spdx.org/licenses/%s.html" % s["license"]
    ld = {"@context": "https://schema.org", "@graph": [app, breadcrumb_ld("Skills", "/menu", s["name"], path)]}
    return path, page(title, desc, path, "\n".join(body), ld)


def connection(t):
    """One plain sentence about how the tool connects, from the registry entry."""
    remote = next((r for r in t.get("remotes") or [] if r.get("type") in ("streamable-http", "sse")), None)
    if remote and safe_url(remote.get("url")):
        return f'Runs online: your agent connects to <code>{e(remote["url"])}</code>, so there’s nothing to install.'
    for p in t.get("packages") or []:
        if p.get("registry") in RUNTIMES:
            ident = p.get("identifier") or ""
            shown = f' (<code>{e(ident)}</code>)' if ident and not ident.startswith("http") else ""
            return f'Runs on your computer using {RUNTIMES[p["registry"]]}{shown}.'
    return "The menu shows how to connect it."


def needs_key(t):
    secrets = [h for r in t.get("remotes") or [] for h in r.get("headers") or [] if h.get("secret") and h.get("required")]
    secrets += [v for p in t.get("packages") or [] for v in p.get("env") or [] if v.get("secret") and v.get("required")]
    return bool(secrets)


def tool_page(t, peers, skills_for):
    cat_label, _ = CATS.get(t.get("category"), CATS["other"])
    path = "/tool/" + t["_page"]
    title = f"{t['name']} MCP tool by {t.get('author') or 'its author'}: connect it to your AI — AI Skills Café"
    desc = clip(t.get("description") or t.get("summary"))
    links = []
    if safe_url(t.get("website")):
        links.append(f'<a href="{e(t["website"])}" target="_blank" rel="noopener">Website ↗</a>')
    if safe_url(t.get("repo_url")):
        links.append(f'<a href="{e(t["repo_url"])}" target="_blank" rel="noopener">Source code ↗</a>')
    meta = f'By <b>{e(t.get("author"))}</b>'
    if t.get("stars"):
        meta += f' · ★ {fmt_num(t["stars"])} GitHub stars'
    if t.get("version"):
        meta += f' · version {e(t["version"])}'
    if links:
        meta += " · " + " · ".join(links)
    badges = [f'<span class="badge {e(t["tier"])}" title="{e(TIER_HELP["tool"].get(t["tier"], ""))}">{e(TIERS.get(t["tier"], ""))}</span>',
              f'<span class="badge cat" style="--c:var(--c-{e(t.get("category") or "other")})">{e(cat_label)}</span>',
              f'<span class="badge">{"☁ Remote" if t.get("is_remote") else "💻 Local"}</span>']
    how = (f'<p>{connection(t)}</p>'
           + ('<p>It needs an access key or token from the service. The menu explains where to get one.</p>' if needs_key(t) else "")
           + '<p>The menu has copy-paste setup steps for Claude Code, the Claude app, ChatGPT, Codex, Gemini CLI, GitHub Copilot, Cursor and other agents.</p>')
    body = [crumbs("Tools", "/menu?mode=tools", t["name"]),
            f'<h2 class="item-name">{e(t["name"])}</h2>',
            f'<p class="badges">{"".join(badges)}</p>',
            f'<p class="lead">{e(t.get("description") or t.get("summary"))}</p>',
            f'<p class="meta">{meta}</p>',
            f'<p class="item-cta"><a class="btn big" href="{e(menu_link(t))}">See it on the menu →</a></p>',
            '<h3>What is an MCP tool?</h3><p>An MCP server is a small connector that lets your AI agent act on a service, '
            f'like reading or updating things in {e(t["name"])}, instead of only talking about it.</p>',
            f'<h3>How to connect it</h3>{how}',
            related_html("Skills that work with it", skills_for, "skill"),
            '<p class="note">Only connect tools you trust: a connected tool can act on your behalf.</p>',
            related_html(f"More {cat_label} tools", peers, "tool")]
    app = {"@type": "SoftwareApplication", "name": t["name"], "description": t.get("description") or "",
           "applicationCategory": "DeveloperApplication", "operatingSystem": "Any", "url": BASE + path,
           "author": {"@type": "Organization", "name": t.get("author") or ""},
           "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}}
    if safe_url(t.get("repo_url")):
        app["sameAs"] = t["repo_url"]
    if t.get("version"):
        app["softwareVersion"] = t["version"]
    ld = {"@context": "https://schema.org", "@graph": [app, breadcrumb_ld("Tools", "/menu?mode=tools", t["name"], path)]}
    return path, page(title, desc, path, "\n".join(b for b in body if b), ld)


def peers_of(item, pool, n=6):
    same = [x for x in pool if x.get("category") == item.get("category") and x["id"] != item["id"]]
    same.sort(key=lambda x: (-(x.get("stars") or 0), x["name"].lower()))
    # skip the item's own siblings from the same collection first, so the list spreads across authors
    other = [x for x in same if x.get("repo") != item.get("repo")]
    return (other + [x for x in same if x not in other])[:n]


def write_dir(name, pages):
    folder = os.path.join(SITE, name)
    if os.path.isdir(folder):
        shutil.rmtree(folder)       # removed or renamed items disappear with it
    os.makedirs(folder)
    for slug, text in pages.items():
        with open(os.path.join(folder, slug + ".html"), "w", encoding="utf-8", newline="\n") as f:
            f.write(text)


def main():
    lib = load("skills.json", {})
    skills = [s for s in load("builtins.json", {}).get("items", []) if s.get("id") and s.get("name")] + lib.get("skills", [])
    skills = [s for s in skills if s.get("category") in CATS]
    tools = [t for t in load("tools.json", {}).get("tools", []) if t.get("id") and t.get("name")]
    notes = load("skill_notes.json", {}).get("notes", {})

    assign_slugs(skills, lambda s: s.get("author") or s.get("repo", "").split("/")[0] or "x")
    assign_slugs(tools, lambda t: t.get("author") or t.get("brand") or "x")
    by_id = {s["id"]: s for s in skills}
    tools_for = {}
    for t in tools:
        for sid in t.get("skills") or []:
            tools_for.setdefault(sid, []).append(t)

    skill_pages, tool_pages, urls = {}, {}, []
    for s in skills:
        path, text = skill_page(s, peers_of(s, skills), tools_for.get(s["id"], [])[:6], notes)
        skill_pages[s["_page"]] = text
        urls.append((path, (s.get("updated") or "")[:10]))
    for t in tools:
        linked = [by_id[i] for i in t.get("skills") or [] if i in by_id][:6]
        path, text = tool_page(t, peers_of(t, tools), linked)
        tool_pages[t["_page"]] = text
        urls.append((path, (t.get("updated") or "")[:10]))
    write_dir("skill", skill_pages)
    write_dir("tool", tool_pages)

    today = (lib.get("updated_at") or "")[:10]
    core = [("/", today), ("/menu", today), ("/about", "")]
    rows = []
    for path, mod in core + sorted(urls):
        rows.append("  <url><loc>%s%s</loc>%s</url>" % (BASE, html.escape(path), "<lastmod>%s</lastmod>" % mod if re.match(r"\d{4}-\d\d-\d\d$", mod) else ""))
    with open(os.path.join(SITE, "sitemap.xml"), "w", encoding="utf-8", newline="\n") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                + "\n".join(rows) + "\n</urlset>\n")
    print("Pages: %d skills, %d tools, sitemap with %d addresses." % (len(skill_pages), len(tool_pages), len(rows)))


if __name__ == "__main__":
    main()
