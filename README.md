# AI Skills Café

A free, curated menu of AI agent **skills** (SKILL.md) and **tools** (MCP servers), with setup steps for Claude, ChatGPT, Codex, Gemini CLI, GitHub Copilot, Cursor and other agents.

Live site: https://www.aiskillscafe.com

## How it works

- `site/` is the whole website: plain HTML, CSS and JavaScript, no build step. Cloudflare Pages serves this folder.
- `scripts/build.py` refreshes `site/data/skills.json` and `site/data/tools.json` from GitHub and the official MCP Registry.
- `.github/workflows/update.yml` runs the build every night and commits the new data. Each commit makes Cloudflare Pages publish the update.
- Visitors' shelves, ratings and notes are kept in their own browser (`localStorage`). Nothing is sent to a server.
- Only openly licensed skills are listed (skill, skill-folder LICENSE file or repository licence). Skill instructions and downloads are fetched by the visitor's browser straight from the author's GitHub repository.

## Common jobs

| Job | How |
|---|---|
| Change the donate link or repository link | Edit `site/config.js` |
| Remove an item after a removal request | Add its id, `owner/repo`, or tool registry name to `scripts/removed.json`, commit, then run the workflow (Actions → Nightly menu update → Run workflow) |
| Add or remove a trusted skill source | Edit `CURATED` in `scripts/updater.py` |
| Refresh the data now | Actions → Nightly menu update → Run workflow |
| Preview locally | `python scripts/serve.py`, then open http://localhost:8080 |

## Cloudflare Pages settings

- Framework preset: **None**
- Build command: *(leave empty)*
- Build output directory: `site`
