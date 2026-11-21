"""Finds agent skills (SKILL.md format) from reliable public sources on GitHub.

Sources, in order of trust:
  official  - published by the AI vendor / platform company itself
  trusted   - hand-picked, widely used community collections
  popular   - discovered live via GitHub topics, filtered by a quality gate
              (2,000+ stars, open-source licence, active in the last year)

Only the Python standard library is used.
"""
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

API = "https://api.github.com"
RAW = "https://raw.githubusercontent.com"
UA = "ai-skills-cafe-builder"

CURATED = [
    ("anthropics/skills", "official"),
    ("openai/skills", "official"),
    ("vercel-labs/agent-skills", "official"),
    ("google/skills", "official"),
    ("firebase/agent-skills", "official"),
    ("obra/superpowers", "trusted"),
    ("addyosmani/agent-skills", "trusted"),
    ("K-Dense-AI/scientific-agent-skills", "trusted"),
    ("coreyhaines31/marketingskills", "trusted"),
]
DISCOVERY_TOPICS = ["agent-skills", "claude-skills", "codex-skills", "gemini-skills"]
MIN_STARS = 2000
MAX_DISCOVERED_REPOS = 12
CAP = {"official": 60, "trusted": 40, "popular": 12}
SKIP_SEGMENTS = {"node_modules", "template", "templates", "fixtures", "test", "tests",
                 "vendor", "archive", "archived", "deprecated", ".git", "dist", "build"}

CATEGORIES = [
    ("docs", ["pdf", "docx", "word doc", "excel", "xlsx", "spreadsheet", "pptx", "powerpoint",
              "slide", "presentation", "document", "office"]),
    ("science", ["bio", "chem", "genom", "protein", "clinical", "molecul", "physics", "astronom",
                 "scientific", "medic", "drug", "neuro", "lab ", "cheminformatics", "sequenc"]),
    ("design", ["design", "ui", "ux", "css", "art", "image", "canvas", "brand", "theme",
                "frontend", "animation", "video", "gif", "music", "visual", "figma", "tailwind"]),
    ("data", ["data", "analysis", "analytics", "research", "sql", "database", "chart",
              "statistic", "scrap", "search", "dataset", "machine learning", "plot"]),
    ("writing", ["writing", "copywrit", "seo", "marketing", "blog", "content", "email",
                 "social", "newsletter", "comms", "launch", "pricing", "ads", "conversion"]),
    ("code", ["code", "debug", "refactor", "git", "api", "typescript", "python", "react",
              "deploy", "testing", "test", "review", "security", "build", "mcp", "sdk",
              "developer", "programming", "ci", "docker", "next.js", "performance"]),
    ("workflow", ["plan", "workflow", "automat", "project", "meeting", "task", "brainstorm",
                  "agent", "skill", "productiv", "notion", "linear", "jira", "calendar"]),
]


class RateLimited(Exception):
    def __init__(self, reset_at):
        super().__init__("GitHub rate limit reached")
        self.reset_at = reset_at


def _request(url, accept=None, timeout=25):
    headers = {"User-Agent": UA}
    if accept:
        headers["Accept"] = accept
    token = os.environ.get("GITHUB_TOKEN")
    if token and url.startswith(API):
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, headers=headers)
    return urllib.request.urlopen(req, timeout=timeout)


def gh(path):
    """Call the GitHub REST API and return parsed JSON."""
    try:
        with _request(API + path, "application/vnd.github+json") as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 429 or (e.code == 403 and e.headers.get("x-ratelimit-remaining") == "0"):
            reset = e.headers.get("x-ratelimit-reset")
            when = None
            if reset and reset.isdigit():
                when = datetime.fromtimestamp(int(reset)).strftime("%I:%M %p").lstrip("0")
            raise RateLimited(when)
        raise


def fetch_raw(repo, branch, path, binary=False, limit=2_000_000):
    url = "%s/%s/%s/%s" % (RAW, repo, urllib.parse.quote(branch, safe=""),
                           urllib.parse.quote(path))
    try:
        with _request(url) as r:
            data = r.read(limit + 1)
            if len(data) > limit:
                return None
            return data if binary else data.decode("utf-8", errors="replace")
    except Exception:
        return None


def _clean(v):
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        v = v[1:-1].replace('\\"', '"').replace("\\n", " ")
    return re.sub(r"\s+", " ", v).strip()


def parse_frontmatter(text):
    text = text.lstrip("﻿")
    m = re.match(r"^---[ \t]*\r?\n(.*?)\r?\n---[ \t]*(?:\r?\n|$)", text, re.S)
    if not m:
        return {}, text
    fm, key, buf = {}, None, []
    for line in m.group(1).splitlines() + ["__end__: x"]:
        km = re.match(r"^([A-Za-z_][\w.-]*):\s*(.*)$", line)
        if km:
            if key:
                fm[key] = _clean(" ".join(buf))
            key = km.group(1).lower()
            v = km.group(2).strip()
            buf = [] if re.fullmatch(r"[>|][+-]?", v) else [v]
        elif key and line.strip():
            s = line.strip()
            nm = re.match(r"^(author|version):\s*(.+)$", s)
            if key == "metadata" and nm:
                fm["metadata." + nm.group(1)] = _clean(nm.group(2))
            else:
                buf.append(s)
    return fm, text[m.end():]


def categorize(name, desc):
    name_l, desc_l = " " + name.lower().replace("-", " ") + " ", " " + desc.lower() + " "
    best, best_score = "other", 0
    for cat, kws in CATEGORIES:
        score = 0
        for kw in kws:
            pat = r"\b" + re.escape(kw)
            score += 3 * len(re.findall(pat, name_l)) + len(re.findall(pat, desc_l))
        if score > best_score:
            best, best_score = cat, score
    return best


WHEN_RE = re.compile(
    r"\b(use (this|it|when|for|whenever|if|after|before|proactively)|when (the user|you|asked|working|a user|users|someone)"
    r"|trigger|should be used|ideal for|useful (for|when)|invoke (this|when)|do not use|not for)\b", re.I)


def split_description(desc):
    sentences = re.split(r"(?<=[.!?])\s+", desc)
    when = [s for s in sentences if WHEN_RE.search(s)]
    what = [s for s in sentences if s not in when]
    return " ".join(what).strip(), " ".join(when).strip()


def origin_for(repo, path, topics):
    owner = repo.split("/")[0].lower()
    p = "/" + path.lower()
    if owner == "anthropics" or "/.claude/" in p:
        return "claude"
    if owner == "openai" or "/.codex/" in p:
        return "openai"
    t = set(topics or [])
    claude = bool(t & {"claude-skills", "claude-code-skills", "claude-code", "claude"})
    codex = bool(t & {"codex-skills", "codex", "chatgpt", "openai"})
    if claude and not codex:
        return "claude"
    if codex and not claude:
        return "openai"
    return "cross"


def find_skill_paths(tree):
    paths = []
    for e in tree:
        p = e.get("path", "")
        if e.get("type") != "blob" or not (p == "SKILL.md" or p.endswith("/SKILL.md")):
            continue
        segs = [s.lower() for s in p.split("/")[:-1]]
        if any(s in SKIP_SEGMENTS for s in segs):
            continue
        paths.append(p)
    paths.sort(key=lambda p: (not p.startswith("skills/"), p.count("/"), p.lower()))
    return paths


def build_skill(meta, tier, path, text, blobs):
    repo = meta["full_name"]
    fm, body = parse_frontmatter(text)
    folder = path.rsplit("/", 1)[0] if "/" in path else ""
    name = fm.get("name") or (folder.rsplit("/", 1)[-1] if folder else repo.split("/")[1])
    desc = fm.get("description", "")
    if not desc:
        para = next((p for p in re.split(r"\n\s*\n", body) if p.strip() and not p.strip().startswith("#")), "")
        desc = _clean(para)[:400]
    if not name or len(desc) < 15:
        return None
    files = [p for p in blobs if p.startswith(folder + "/")] if folder else ["SKILL.md"]
    rel = [f[len(folder) + 1:].lower() if folder else f.lower() for f in files]
    summary, use_case = split_description(desc)
    branch = meta["default_branch"]
    web = "https://github.com/%s/tree/%s/%s" % (repo, branch, urllib.parse.quote(folder)) if folder \
        else "https://github.com/" + repo
    skill = {
        "id": repo + "::" + path,
        "name": name,
        "slug": re.sub(r"[^a-z0-9_-]+", "-", name.lower()).strip("-") or "skill",
        "description": desc,
        "summary": summary or desc,
        "use_case": use_case,
        "author": fm.get("metadata.author") or fm.get("author") or meta["owner"]["login"],
        "version": fm.get("metadata.version") or fm.get("version") or "",
        "repo": repo,
        "url": web,
        "stars": meta.get("stargazers_count", 0),
        "forks": meta.get("forks_count", 0),
        "license": fm.get("license") or ((meta.get("license") or {}).get("spdx_id") or ""),
        "created": meta.get("created_at", ""),
        "updated": meta.get("pushed_at", ""),
        "tier": tier,
        "origin": origin_for(repo, path, meta.get("topics")),
        "category": categorize(name, desc),
        "file_count": len(files),
        "has_scripts": any(r.endswith((".py", ".sh", ".js", ".ts", ".mjs", ".rb")) for r in rel),
        "has_tests": any(re.search(r"(^|/)(tests?|evals?)(/|\.|_)|[._-]test\.", r) for r in rel),
    }
    if skill["license"] == "NOASSERTION":
        skill["license"] = ""
    detail = {"body": body.strip()[:60000], "files": files[:120], "folder": folder,
              "branch": branch, "repo": repo}
    return skill, detail


def scan_repo(meta, tier, log):
    """Return ([skills], {id: detail}) for one repository."""
    repo, branch = meta["full_name"], meta["default_branch"]
    tree = gh("/repos/%s/git/trees/%s?recursive=1" % (repo, urllib.parse.quote(branch, safe="")))
    entries = tree.get("tree", [])
    blobs = [e["path"] for e in entries if e.get("type") == "blob"]
    paths = find_skill_paths(entries)
    if not paths:
        return [], {}
    paths = paths[:CAP[tier] * 2]
    with ThreadPoolExecutor(max_workers=8) as pool:
        texts = list(pool.map(lambda p: fetch_raw(repo, branch, p), paths))
    skills, details, seen = [], {}, set()
    for path, text in zip(paths, texts):
        if not text:
            continue
        built = build_skill(meta, tier, path, text, blobs)
        if not built or built[0]["name"].lower() in seen:
            continue
        seen.add(built[0]["name"].lower())
        skills.append(built[0])
        details[built[0]["id"]] = built[1]
        if len(skills) >= CAP[tier]:
            break
    return skills, details


def discover(log):
    since = (datetime.now(timezone.utc) - timedelta(days=365)).strftime("%Y-%m-%d")
    found = {}
    for topic in DISCOVERY_TOPICS:
        q = "topic:%s stars:>=%d archived:false fork:false pushed:>=%s" % (topic, MIN_STARS, since)
        res = gh("/search/repositories?q=%s&sort=stars&order=desc&per_page=20" % urllib.parse.quote(q))
        for item in res.get("items", []):
            if item.get("license") and item["license"].get("spdx_id") not in (None, "NOASSERTION"):
                found[item["full_name"]] = item
        log("Searched GitHub topic “%s” — %d candidates so far" % (topic, len(found)))
    curated = {r.lower() for r, _ in CURATED}
    repos = [m for n, m in found.items() if n.lower() not in curated]
    repos.sort(key=lambda m: -m.get("stargazers_count", 0))
    return repos[:MAX_DISCOVERED_REPOS]


def run_update(old_library, old_details, progress):
    """progress(message, percent). Returns (library, details, summary)."""
    old_library = old_library or {}
    old_skills = old_library.get("skills", [])
    old_by_repo, old_sources = {}, {s["repo"]: s for s in old_library.get("sources", [])}
    for s in old_skills:
        old_by_repo.setdefault(s["repo"], []).append(s)
    first_seen = {s["id"]: s.get("first_seen") for s in old_skills}

    skills, details, sources, warnings = [], {}, [], []
    limited = None
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    def log(msg, pct=None):
        progress(msg, pct)

    def reuse(repo, tier, why):
        kept = old_by_repo.get(repo, [])
        if kept:
            skills.extend(kept)
            for s in kept:
                if s["id"] in old_details:
                    details[s["id"]] = old_details[s["id"]]
            if repo in old_sources:
                sources.append(old_sources[repo])
            log("%s — %s, kept %d saved skills" % (repo, why, len(kept)))

    def handle(meta, tier, pct):
        nonlocal limited
        repo = meta["full_name"]
        prev = old_sources.get(repo)
        if prev and prev.get("pushed_at") == meta.get("pushed_at") and old_by_repo.get(repo):
            # unchanged since last update: refresh star counts only
            for s in old_by_repo[repo]:
                s["stars"], s["forks"] = meta.get("stargazers_count", 0), meta.get("forks_count", 0)
            reuse(repo, tier, "no changes")
            return
        if limited:
            reuse(repo, tier, "rate limited")
            return
        try:
            found, det = scan_repo(meta, tier, log)
        except RateLimited as e:
            limited = e
            reuse(repo, tier, "rate limited")
            return
        except Exception as e:
            warnings.append("%s: %s" % (repo, e))
            reuse(repo, tier, "could not be reached")
            return
        if not found:
            log("%s — no SKILL.md files, skipped" % repo, pct)
            return
        skills.extend(found)
        details.update(det)
        sources.append({
            "repo": repo, "tier": tier, "url": meta["html_url"],
            "description": meta.get("description") or "", "stars": meta.get("stargazers_count", 0),
            "pushed_at": meta.get("pushed_at"), "owner": meta["owner"]["login"],
            "avatar": meta["owner"].get("avatar_url", ""), "skills": len(found),
        })
        log("%s — %d skills read" % (repo, len(found)), pct)

    log("Contacting GitHub…", 2)
    for i, (repo, tier) in enumerate(CURATED):
        pct = 5 + int(45 * (i + 1) / len(CURATED))
        if limited:
            reuse(repo, tier, "rate limited")
            continue
        try:
            meta = gh("/repos/" + repo)
        except RateLimited as e:
            limited = e
            reuse(repo, tier, "rate limited")
            continue
        except Exception as e:
            warnings.append("%s: %s" % (repo, e))
            reuse(repo, tier, "could not be reached")
            continue
        handle(meta, tier, pct)

    log("Looking for popular community skill collections…", 52)
    discovered = []
    try:
        discovered = discover(log)
    except RateLimited as e:
        limited = limited or e
    except Exception as e:
        warnings.append("discovery: %s" % e)
    if not discovered:
        # keep previously discovered sources rather than dropping them
        for repo, src in old_sources.items():
            if src.get("tier") == "popular":
                reuse(repo, "popular", "search unavailable")
    for i, meta in enumerate(discovered):
        handle(meta, "popular", 55 + int(40 * (i + 1) / len(discovered)))

    old_ids = set(first_seen)
    for s in skills:
        s["first_seen"] = first_seen.get(s["id"]) or now
        s["is_new"] = bool(old_ids) and s["id"] not in old_ids
    added = sum(1 for s in skills if s["id"] not in old_ids)
    skills.sort(key=lambda s: (-s["stars"], s["name"].lower()))

    library = {"updated_at": now, "skills": skills,
               "sources": sorted(sources, key=lambda s: -s["stars"])}
    summary = {"total": len(skills), "added": added, "sources": len(sources),
               "warnings": warnings[:5], "rate_limited": bool(limited),
               "rate_reset": limited.reset_at if limited else None}
    log("Done — %d skills from %d sources (%d new)" % (len(skills), len(sources), added), 100)
    return library, details, summary
