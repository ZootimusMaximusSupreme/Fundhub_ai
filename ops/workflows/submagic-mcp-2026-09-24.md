# Submagic MCP — 2026-09-24

Fetched live: https://docs.submagic.co/mcp-server.md (also authentication.md and rate-limits.md, which the docs index and the MCP page point at).

## What it is

Submagic has a door for AI assistants at `POST https://api.submagic.co/mcp`. An assistant (Cursor, Claude Code, Claude Desktop, Windsurf) can ask Submagic to do work through that door.

## What the docs actually name

The MCP page does not list tool function names. It lists example prompts:

- Create a project from a URL
- Turn a YouTube video into Magic Clips
- Show status of recent projects
- Export a project and publish to TikTok and Instagram
- List published projects and views
- Publishing stats and profile stats
- Add background music to a project
- List caption templates

Those sit on the same REST API we already call (`POST /v1/projects/upload` and the rest). MCP does not replace that upload.

## Auth and credits

Same API key. MCP sends it as `Authorization: Bearer`. The REST docs send the same key as `x-api-key`. Same credit pool and same rate limits.

claude.ai web Custom Connectors want OAuth. Submagic says that path is unsupported. Cursor is Bearer token, not a browser login.

The auth page tells a new user to open app.submagic.co and generate a key. We already have a key. Do not send Chris to log in.

## Next move for VSL 1, VSL 2, portal welcome

Credits still block it. MCP uses the same credits as the failed upload. More API credits on that same key, then either our upload or MCP can create the projects. The MCP examples are “from a URL,” not a file upload.
