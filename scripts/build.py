"""Builds the data files for the AI Skills Café website.

Run:  python scripts/build.py            (GitHub Actions runs this nightly)
      python scripts/build.py --seed DIR (first run: reuse a local Skill Atlas data folder)

Writes site/data/skills.json and site/data/tools.json, then the skill/tool pages and sitemap (pages.py). Skill instructions are NOT
stored here: visitors' browsers read them straight from the author's GitHub repo,
and only for openly licensed skills.
"""
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pages  # noqa: E402
import tools_updater  # noqa: E402
import updater  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "site", "data")
SKILLS_FILE = os.path.join(OUT, "skills.json")
TOOLS_FILE = os.path.join(OUT, "tools.json")
REMOVED_FILE = os.path.join(ROOT, "scripts", "removed.json")
MAX_FILES = 120

# Licences that allow anyone to copy and share the files (with credit / licence kept).
OPEN = [
    (r"\bMIT\b", "MIT"), (r"apache[- ]?(licen[cs]e[- ]?)?(v(ersion)?[- ]?)?2", "Apache-2.0"),
    (r"\bBSD[- ]?2", "BSD-2-Clause"), (r"\bBSD[- ]?3", "BSD-3-Clause"), (r"^BSD( licen[cs]e)?$", "BSD"),
    (r"\bISC\b", "ISC"), (r"\b0BSD\b", "0BSD"), (r"unlicense", "Unlicense"),
    (r"CC0|creativecommons\.org/publicdomain/zero", "CC0-1.0"),
    (r"CC[- ]?BY[- ]?4|creativecommons\.org/licenses/by/4", "CC-BY-4.0"),
    (r"MPL[- ]?2|mozilla public", "MPL-2.0"),
    (r"\bL?GPL[- ]?v?3|GPL-3\.0|GPLv3", "GPL-3.0"), (r"\bGPL[- ]?v?2|GPL-2\.0", "GPL-2.0"),
]
NOT_OPEN = re.compile(r"non-?commercial|\bNC\b|proprietary|all rights reserved|polyform", re.I)


def licence_info(raw):
    """-> (display name, is_open). Anything unclear counts as not open."""
    raw = (raw or "").strip()
    if not raw or NOT_OPEN.search(raw):
        return (raw[:40] or "Not stated"), False
    for pat, name in OPEN:
        if re.search(pat, raw, re.I):
            return name, True
    return raw[:40], False


def log(msg, pct=None):
    print(("[%3d%%] " % pct if pct is not None else "       ") + msg, flush=True)


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def save(path, obj):
    os.makedirs(OUT, exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)


def old_state(seed):
    """Previous library + per-skill details (without the instruction text)."""
    if seed:
        lib = load(os.path.join(seed, "library.json"), {})
        det = load(os.path.join(seed, "details.json"), {})
        tools = load(os.path.join(seed, "tools.json"), {})
        return lib, det, tools
    lib = load(SKILLS_FILE, {})
    det = {}
    for s in lib.get("skills", []):
        folder = s.get("folder", "")
        full = [(folder + "/" + f) if folder else f for f in s.get("files", [])]
        det[s["id"]] = {"folder": folder, "files": full, "branch": s.get("branch", "main"), "repo": s["repo"]}
    return lib, det, load(TOOLS_FILE, {})


def main():
    seed = sys.argv[sys.argv.index("--seed") + 1] if "--seed" in sys.argv else None
    old_lib, old_det, old_tools = old_state(seed)

    library, details, summary = updater.run_update(old_lib, old_det, log)
    if not library["skills"]:
        sys.exit("No skills fetched - keeping the previous data.")

    # Read SKILL.md text for skills we reused (needed to link skills to tools).
    missing = [s for s in library["skills"] if not details.get(s["id"], {}).get("body")]
    if missing:
        log("Reading instructions for %d unchanged skills…" % len(missing))

        def body(s):
            d = details.get(s["id"]) or {}
            fname = s.get("skill_file") or "SKILL.md"
            path = (d.get("folder") + "/" + fname) if d.get("folder") else fname
            text = updater.fetch_raw(s["repo"], d.get("branch", "main"), path)
            return updater.parse_frontmatter(text)[1] if text else ""
        with ThreadPoolExecutor(max_workers=8) as pool:
            for s, b in zip(missing, pool.map(body, missing)):
                details.setdefault(s["id"], {})["body"] = b

    try:
        tools, tsum = tools_updater.run_update(old_tools, library["skills"], details, log)
    except Exception as e:  # keep yesterday's tools rather than failing the whole build
        log("Tools update failed: %s - keeping previous tools" % e)
        tools, tsum = old_tools, {}

    for s in library["skills"]:
        d = details.get(s["id"]) or {}
        folder = d.get("folder", "")
        s["folder"], s["branch"] = folder, d.get("branch", "main")
        s["files"] = [f[len(folder) + 1:] if folder else f for f in d.get("files", [])][:MAX_FILES]
        s["license"], s["open"] = licence_info(s.get("license"))

    # Honour removal requests: scripts/removed.json lists skill ids, repos ("owner/name")
    # or tool registry names that must never appear on the site.
    removed = set(x.lower() for x in load(REMOVED_FILE, {}).get("removed", []))
    if removed:
        gone = lambda *keys: any((k or "").lower() in removed for k in keys)
        library["skills"] = [s for s in library["skills"] if not gone(s["id"], s["repo"])]
        library["sources"] = [s for s in library["sources"] if not gone(s["repo"])]
        for src in library["sources"]:
            src["skills"] = sum(1 for s in library["skills"] if s["repo"] == src["repo"])
        if tools.get("tools"):
            tools["tools"] = [t for t in tools["tools"] if not gone(t.get("registry_name"), t.get("repo"), t["id"])]
            for t in tools["tools"]:
                t["skills"] = [i for i in t.get("skills", []) if not gone(i, i.split("::")[0])]

    save(SKILLS_FILE, library)
    if tools.get("tools"):
        save(TOOLS_FILE, tools)
    opened = sum(1 for s in library["skills"] if s["open"])
    log("Saved %d skills (%d openly licensed) and %d tools. %d new skills, %d new tools."
        % (len(library["skills"]), opened, len(tools.get("tools", [])), summary["added"], tsum.get("added", 0)), 100)
    if summary.get("rate_limited"):
        log("Note: GitHub rate limit was reached; some sources kept their previous data.")
    pages.main()   # one page per skill and tool, plus the sitemap, for search engines


if __name__ == "__main__":
    main()
