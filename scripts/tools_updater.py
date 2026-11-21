"""Finds tools (MCP servers) that AI agents can call, and links them to skills.

Source: the official MCP Registry (registry.modelcontextprotocol.io). Anyone can
publish there, so only two kinds of entry are kept:
  official - published under a well-known company's namespace. The registry only
             lets a publisher use `com.example/...` after proving they own
             example.com, and `io.github.org/...` after signing in as that org.
  popular  - community servers whose source repository is among the most-starred
             MCP projects on GitHub.
"""
import json
import re
import urllib.parse
from datetime import datetime, timezone

import updater

REGISTRY = "https://registry.modelcontextprotocol.io/v0/servers"
MAX_PAGES = 2000
MIN_STARS = 300
MAX_TOOLS = 450
SEARCH_QUERIES = ["topic:mcp-server", "topic:model-context-protocol", "topic:mcp"]
SEARCH_PAGES = 3

# Second-level domain labels of well-known companies (com.<label>, io.<label>, ...).
VENDOR_DOMAINS = set("""
notion stripe figma linear atlassian microsoft github cloudflare vercel supabase sentry paypal shopify
hubspot asana zapier box canva mongodb neon prisma netlify twilio datadoghq datadog elastic redis postman
gitlab google apify brave exa firecrawl browserbase monday intercom webflow wix squareup square plaid
airtable clickup todoist dropbox grafana pulumi hashicorp docker jetbrains snyk semgrep auth0 okta
salesforce zoom miro anthropic openai perplexity huggingface replicate elevenlabs mapbox tavily upstash
pinecone qdrant trychroma posthog mixpanel amplitude segment slack discord dynatrace newrelic pagerduty
launchdarkly circleci buildkite jfrog sonarsource gitguardian aws amazon azure oracle ibm adobe zendesk
mailchimp sendgrid resend mailgun postmarkapp klaviyo contentful sanity storyblok strapi algolia
meilisearch weaviate neo4j snowflake databricks clickhouse motherduck cockroachlabs planetscale turso
convex firebase appwrite render railway digitalocean heroku fastly temporal inngest trigger n8n
pipedream smartsheet wrike calendly docusign intuit xero coinbase alpaca polygon spotify reddit glean
coda raycast sourcegraph replit stackblitz codesandbox globalping wordpress automattic browserstack
lambdatest saucelabs cypress chromatic vanta drata hex grafbase hasura apollographql graphql
""".split())
# GitHub organisations of well-known companies (io.github.<org>/...).
VENDOR_ORGS = set("""
github microsoft modelcontextprotocol upstash cloudflare getsentry stripe supabase supabase-community
awslabs aws googleapis google google-gemini hashicorp grafana mongodb-js redis neondatabase pulumi elastic
datadog mendableai firecrawl browserbase exa-labs tavily-ai brave apify makenotion figma atlassian shopify
twilio-labs posthog prisma vercel netlify docker jetbrains chroma-core qdrant pinecone-io zapier linear
paypal square box box-community dropbox canva wix webflow airtable clickup mondaycom asana zoom miroapp
intercom salesforce salesforcecli snyk semgrep auth0 okta oracle ibm anthropics openai perplexityai
huggingface replicate elevenlabs mapbox launchdarkly circleci-public buildkite jfrog sonarsource
gitguardian snowflake-labs databricks clickhouse motherduckdb neo4j neo4j-contrib algolia meilisearch
weaviate contentful sanity-io storyblok strapi resend mailgun klaviyo mixpanel amplitude cockroachdb
planetscale tursodatabase get-convex firebase appwrite render-oss railwayapp digitalocean heroku fastly
temporalio inngest triggerdotdev n8n-io pipedreamhq coinbase alpacahq polygon-io spotify glean-io
sourcegraph stackblitz codesandbox kubernetes-sigs argoproj-labs chromedevtools puppeteer wordpress
automattic browserstack lambdatest saucelabs cypress-io chromaui hasura apollographql dynatrace
newrelic pagerduty zendesk
""".split())
# Hosting domains where anyone can get a subdomain - never treated as a vendor.
SHARED_HOSTS = {"app.vercel", "app.netlify", "dev.pages", "com.herokuapp", "io.gitlab", "dev.workers",
                "app.fly", "com.onrender", "app.render", "app.replit", "dev.replit", "app.web",
                "com.firebaseapp", "app.railway", "app.lovable", "dev.val", "run.app", "com.github"}

KEYWORD_STOP = set("""
mcp server servers official remote hosted api apis tool tools ai the for and with by cloud platform app apps
service services integration integrations connector connectors client plus pro lite kit hub lab labs io dev
bridge gateway proxy manager helper utils util data web docs doc document documents code email calendar
image images video videos files file database databases sql chart charts weather news finance stock stocks
crypto context knowledge notes note task tasks project projects agent agents assistant model models chat
open free simple smart super best memory browser browsers search fetch filesystem time git everything
sequential thinking reader writer read write analytics automation workflow workflows content generator
model-context-protocol protocol local unofficial community mcp-server mcpserver
design claude work google next native working desktop harness codebase toolkit three windows awesome
world reactive mesh toolbox agentic skills skill microsoft amazon azure aws ibm oracle adobe chrome
devtools productivity cli sdk core engine studio suite center centre platform system systems network
remote-mcp live apple meta health intelligence insights monitor monitoring manager management builder assistant copilot unified
universal multi deep quick fast light easy context7 index graph vector knowledge-graph render run runner
""".split())
MULTI_PRODUCT = {"google", "microsoft", "aws", "amazon", "azure", "ibm", "oracle", "adobe"}


def _get_json(url):
    with updater._request(url, "application/json", timeout=40) as r:
        return json.loads(r.read().decode("utf-8"))


def fetch_registry(log):
    entries, cursor, pages = [], None, 0
    while pages < MAX_PAGES:
        url = REGISTRY + "?limit=100&version=latest"
        if cursor:
            url += "&cursor=" + urllib.parse.quote(cursor, safe="")
        data = _get_json(url)
        entries.extend(data.get("servers") or [])
        cursor = (data.get("metadata") or {}).get("nextCursor")
        pages += 1
        if pages % 25 == 0:  # ~660 pages today; the bar creeps toward 57% while reading
            log("Read %d registry entries…" % len(entries), min(57, 3 + pages // 12))
        if not cursor:
            break
    return entries


def repo_key(url):
    m = re.match(r"https?://(?:www\.)?github\.com/([^/\s]+)/([^/\s#?]+)", url or "", re.I)
    if not m:
        return None
    return (m.group(1) + "/" + re.sub(r"\.git$", "", m.group(2))).lower()


def popular_repos(log):
    """{owner/repo: (stars, pushed_at, created_at)} for the most-starred MCP repos."""
    stars = {}
    for q in SEARCH_QUERIES:
        for page in range(1, SEARCH_PAGES + 1):
            full = "%s stars:>=%d archived:false" % (q, MIN_STARS)
            res = updater.gh("/search/repositories?q=%s&sort=stars&order=desc&per_page=100&page=%d"
                             % (urllib.parse.quote(full), page))
            items = res.get("items", [])
            for it in items:
                stars[it["full_name"].lower()] = (it["stargazers_count"], it.get("pushed_at"), it.get("created_at"))
            if len(items) < 100:
                break
        log("Checked GitHub popularity for “%s” — %d repositories" % (q, len(stars)))
    return stars


def publisher(ns):
    """(display publisher, brand label or None, verified kind)."""
    parts = ns.lower().split(".")
    if len(parts) >= 3 and parts[0] == "io" and parts[1] == "github":
        org = ns.split(".", 2)[2]
        return org, (org.lower() if org.lower() in VENDOR_ORGS else None), "github"
    if len(parts) >= 2:
        domain = ".".join(reversed(ns.split(".")))
        if ".".join(parts[:2]) in SHARED_HOSTS:
            return domain, None, "domain"
        label = parts[1]
        return domain, (label if label in VENDOR_DOMAINS else None), "domain"
    return ns, None, "unknown"


def pretty_name(server):
    title = (server.get("title") or "").strip()
    if title:
        return title
    ns, _, rest = server["name"].partition("/")
    rest = re.sub(r"(^|[-_])(mcp|server|mcp-server)(?=$|[-_])", " ", rest, flags=re.I).strip(" -_")
    if not rest:
        rest = ns.split(".")[1] if "." in ns else ns
    return " ".join(w.capitalize() if w.islower() else w for w in re.split(r"[-_\s]+", rest) if w)


def keyword_for(name, brand, server):
    text = " ".join([server.get("title") or "", server["name"].split("/", 1)[-1]])
    for tok in re.split(r"[^A-Za-z0-9]+", text.lower()):
        if (len(tok) >= 4 or tok == brand) and len(tok) >= 3 and tok not in KEYWORD_STOP and not tok.isdigit():
            return tok
    if brand and brand not in KEYWORD_STOP and brand not in MULTI_PRODUCT and len(brand) >= 3:
        return brand
    return None


def owns_repo(pub, ns, kind, rk):
    """True when the verified publisher is plausibly the owner of the claimed repository.
    Anyone can *claim* any repository URL, so stars only count when this holds."""
    if not rk:
        return False
    owner, name = rk.split("/", 1)
    if kind == "github":
        return owner == pub.lower()
    label = ns.lower().split(".")[1] if "." in ns else ns.lower()
    squash = lambda s: re.sub(r"[^a-z0-9]", "", s)
    return len(label) >= 3 and (squash(label) in squash(owner) or squash(label) in squash(name))


def slim_args(args):
    out = []
    for a in args or []:
        if a.get("isRequired") or a.get("value"):
            out.append({k: a.get(k) for k in ("type", "name", "value", "valueHint", "description") if a.get(k)})
    return out[:8]


def slim_env(env):
    return [{"name": e.get("name"), "description": (e.get("description") or "")[:300],
             "required": bool(e.get("isRequired")), "secret": bool(e.get("isSecret")),
             "default": e.get("default") or ""} for e in (env or []) if e.get("name")][:20]


def build_tool(entry, tier, brand, pub, kind, star_info):
    s, meta = entry["server"], (entry.get("_meta") or {}).get("io.modelcontextprotocol.registry/official", {})
    repo_url = (s.get("repository") or {}).get("url") or ""
    remotes = [{"type": r.get("type"), "url": r.get("url"),
                "headers": slim_env(r.get("headers"))}
               for r in s.get("remotes") or [] if (r.get("url") or "").startswith("https://")][:3]
    packages = []
    for p in s.get("packages") or []:
        packages.append({
            "registry": p.get("registryType"), "identifier": p.get("identifier"), "version": p.get("version"),
            "runtime": p.get("runtimeHint") or "", "transport": (p.get("transport") or {}).get("type", "stdio"),
            "env": slim_env(p.get("environmentVariables")), "args": slim_args(p.get("packageArguments")),
            "runtime_args": slim_args(p.get("runtimeArguments")),
        })
    packages = packages[:4]
    name = pretty_name(s)
    desc = re.sub(r"\s+", " ", s.get("description") or "").strip()
    stars, pushed, created = star_info or (0, None, None)
    slug = re.sub(r"[^a-z0-9]+", "-", (keyword_for(name, brand, s) or name).lower()).strip("-") or "tool"
    return {
        "id": "tool::" + s["name"],
        "kind": "tool",
        "name": name,
        "slug": slug[:40],
        "registry_name": s["name"],
        "description": desc,
        "summary": desc,
        "author": pub,
        "repo": s["name"],
        "brand": brand or "",
        "verified_by": kind,
        "url": repo_url or s.get("websiteUrl") or "",
        "repo_url": repo_url,
        "website": s.get("websiteUrl") or "",
        "version": s.get("version") or "",
        "stars": stars,
        "tier": tier,
        "category": updater.categorize(name, desc),
        "created": meta.get("publishedAt") or created or "",
        "updated": meta.get("updatedAt") or pushed or "",
        "remotes": remotes,
        "packages": packages,
        "is_remote": bool(remotes),
        "keyword": keyword_for(name, brand, s) or "",
        "skills": [],
    }


def select_tools(entries, stars):
    picked = {}
    for e in entries:
        s = e.get("server") or {}
        meta = (e.get("_meta") or {}).get("io.modelcontextprotocol.registry/official", {})
        if not s.get("name") or meta.get("status", "active") != "active" or meta.get("isLatest") is False:
            continue
        if not (s.get("remotes") or s.get("packages")):
            continue
        ns = s["name"].split("/", 1)[0]
        pub, brand, kind = publisher(ns)
        rk = repo_key((s.get("repository") or {}).get("url"))
        info = stars.get(rk) if rk and (brand or owns_repo(pub, ns, kind, rk)) else None
        if brand:
            tier = "official"
        elif info:
            tier = "popular"
        else:
            continue
        tool = build_tool(e, tier, brand, pub, kind, info)
        if len(tool["description"]) < 10 or re.search(r"\b(moved to|deprecated)\b", tool["name"], re.I):
            continue
        # one entry per source repository: prefer official, then the repo owner's own listing
        key = rk or (pub.lower(), tool["name"].lower())
        owner_match = bool(rk) and kind == "github" and rk.split("/")[0] == pub.lower()
        rank = (tier == "official", owner_match, tool["updated"])
        if key not in picked or rank > picked[key][0]:
            picked[key] = (rank, tool)
    tools = [t for _, t in picked.values()]
    tools.sort(key=lambda t: (t["tier"] != "official", -t["stars"], t["name"].lower()))
    return tools[:MAX_TOOLS]


def link_skills(tools, skills, details):
    """Attach to each tool the ids of skills that mention it by name."""
    texts = []
    for s in skills:
        body = (details.get(s["id"]) or {}).get("body", "")
        texts.append((s, s["name"].lower().replace("_", "-").split("-"), s["description"], body))
    for t in tools:
        kw = t["keyword"]
        if not kw:
            continue
        cap = re.compile(r"\b%s%s\b" % (re.escape(kw[0].upper()), re.escape(kw[1:])), re.I if kw == "github" else 0)
        near = re.compile(r"\b%s\b.{0,60}\bMCP\b|\bMCP\b.{0,40}\b%s\b" % (re.escape(kw), re.escape(kw)), re.I | re.S)
        hits = [s["id"] for s, name_parts, desc, body in texts
                if kw in name_parts or cap.search(desc) or near.search(body)]
        t["skills"] = hits if len(hits) <= 40 else []  # too common a word to mean anything


def run_update(old, skills, details, progress):
    old = old or {}
    old_tools = old.get("tools", [])
    log = lambda m, p=None: progress(m, p)
    warnings = []
    log("Reading the official MCP Registry…", 3)
    try:
        entries = fetch_registry(log)
    except Exception as e:
        log("MCP Registry could not be reached — kept saved tools", 100)
        return old, {"total": len(old_tools), "added": 0, "error": "registry: %s" % e}
    log("Registry read — %d entries. Checking which are official or popular…" % len(entries), 60)
    stars, limited = {}, None
    try:
        stars = popular_repos(log)
    except updater.RateLimited as e:
        limited = e
        warnings.append("GitHub popularity check was rate limited")
    except Exception as e:
        warnings.append("GitHub popularity check failed: %s" % e)
    if not stars:  # fall back to previous star counts so popular tools aren't dropped
        for t in old_tools:
            rk = repo_key(t.get("repo_url"))
            if rk and t.get("stars"):
                stars[rk] = (t["stars"], None, None)
    tools = select_tools(entries, stars)
    link_skills(tools, skills, details)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    first_seen = {t["id"]: t.get("first_seen") for t in old_tools}
    for t in tools:
        t["first_seen"] = first_seen.get(t["id"]) or now
        t["is_new"] = bool(first_seen) and t["id"] not in first_seen
    added = sum(1 for t in tools if t["id"] not in first_seen)
    linked = sum(1 for t in tools if t["skills"])
    log("Done — %d tools (%d official), %d linked to skills, %d new"
        % (len(tools), sum(t["tier"] == "official" for t in tools), linked, added), 100)
    return ({"updated_at": now, "tools": tools, "registry_entries": len(entries)},
            {"total": len(tools), "added": added, "warnings": warnings,
             "rate_limited": bool(limited), "rate_reset": limited.reset_at if limited else None})
