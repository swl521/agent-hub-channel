# Agent Hub Channel

Multi-CLI session dispatch system for [Claude Code](https://claude.ai/code). Control multiple Claude Code CLI sessions from your phone (Dispatch) or other CLI sessions via MCP Channel protocol.

## Architecture

```
┌─────────────┐     curl POST /send      ┌──────────────────┐
│  Dispatch   │ ────────────────────────> │  agent-hub MCP   │
│  (mobile)   │                           │  (HTTP + Channel)│
└─────────────┘                           └────────┬─────────┘
       ▲                                           │
       │  read responses/{id}.json     notifications/claude/channel
       │                                           │
       │                                           ▼
       │                                  ┌──────────────────┐
       │                                  │  Claude CLI      │
       │                                  │  (execute task)  │
       │                                  └────────┬─────────┘
       │                              hub_reply(msg_id, result)
       │                                           │
       └──────────────────────────────── responses/{id}.json
```

## Installation

### Method 1: npx (Recommended)

```bash
npx agent-hub-channel init
```

Then add the shell alias:

```bash
echo 'alias claude="claude --dangerously-load-development-channels server:agent-hub"' >> ~/.zshrc
source ~/.zshrc
```

### Method 2: Git Clone

```bash
git clone https://github.com/swl521/agent-hub-channel.git ~/program/agent-hub-channel
cd ~/program/agent-hub-channel
chmod +x install.sh
./install.sh
source ~/.zshrc
```

### Method 3: Claude Code Plugin

```bash
claude /install github:swl521/agent-hub-channel
```

Then add the shell alias:

```bash
echo 'alias claude="claude --dangerously-load-development-channels server:agent-hub"' >> ~/.zshrc
source ~/.zshrc
```

## Prerequisites

- **[bun](https://bun.sh/)** >= 1.0 — Runtime
- **[Claude Code CLI](https://claude.ai/code)** >= 2.1.80 — Channel support
- **macOS / Linux** — Windows not tested

## Quick Start

1. Install using any method above
2. Start Claude Code:
   ```bash
   claude    # alias auto-loads agent-hub channel
   ```
3. Verify registration:
   ```bash
   cat ~/.claude/agent-hub/registry.json
   ```
4. Check session status:
   ```bash
   npx agent-hub-channel status
   ```

## How It Works

1. Each CLI session auto-registers to `~/.claude/agent-hub/registry.json` on startup
2. Each session listens on a local HTTP port (18001-18099, 127.0.0.1 only)
3. External systems send commands via `POST /send` with `{command, msg_id}`
4. The MCP Channel injects the command into the CLI conversation
5. CLI executes the task and calls `hub_reply` to write response to `responses/{msg_id}.json`
6. The sender polls `responses/{msg_id}.json` to get the result

## MCP Tools

Each CLI session with agent-hub loaded exposes:

| Tool | Description |
|------|-------------|
| `hub_reply(msg_id, result)` | Reply to a remote command |
| `hub_set_name(name)` | Set session display name |
| `hub_status(status)` | Update status: `idle` / `busy` / `done` |

## HTTP Endpoints

Each session listens on `127.0.0.1:{port}`:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/status` | Session info (name, port, status) |
| `POST` | `/send` | Inject command `{command, msg_id}` |
| `GET` | `/responses/:id` | Check if response is ready |

## Dispatch (Mobile) Setup

To control CLI sessions from your phone via Claude Desktop Dispatch, add the following to Dispatch's **Customize** section:

<details>
<summary>Click to expand Dispatch instructions</summary>

```
## Agent Hub

My Mac runs multiple Claude CLI sessions managed by agent-hub.

### View all CLI sessions
Read ~/.claude/agent-hub/registry.json and list each session's name, port, directory, and status.

### Send command to a CLI (when I say "@name do something")
1. Read ~/.claude/agent-hub/registry.json to find the target session's port
2. Generate a random msg_id (8 alphanumeric characters)
3. Run:
   curl -s -X POST http://127.0.0.1:{port}/send -H "Content-Type: application/json" -d '{"command":"the instruction","msg_id":"the_msg_id"}'
4. Confirm the response contains {"status":"delivered"}
5. Every 5 seconds, check: cat ~/.claude/agent-hub/responses/{msg_id}.json
6. When the file exists, read it and return the result field to me
7. If no response within 90 seconds, report timeout

### Check a CLI's status
curl -s http://127.0.0.1:{port}/status
```

</details>

## File Structure

```
~/.claude/agent-hub/                # Runtime (auto-created)
├── registry.json                   # Session registry
└── responses/                      # Response files
    └── {msg_id}.json

~/.mcp.json                         # MCP server declaration
~/.claude/settings.local.json       # Claude Code settings
~/.zshrc                            # Shell alias
```

## Configuration Layers

| Layer | File | Purpose |
|-------|------|---------|
| MCP Server | `~/.mcp.json` | Declares agent-hub as MCP server |
| Settings | `~/.claude/settings.local.json` | Enables agent-hub MCP |
| Channel | `~/.zshrc` alias | `--dangerously-load-development-channels server:agent-hub` |
| CLI Guide | `~/.claude/CLAUDE.md` | Teaches CLI how to use agent-hub |
| Dispatch | Dispatch Customize | Teaches Dispatch how to call agent-hub |

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| CLI not in registry | Not started with alias | `source ~/.zshrc`, restart `claude` |
| Command delivered but no reply | Channel not loaded | Ensure alias has `server:agent-hub` |
| Connection refused | Session exited, stale registry | Restart CLI, dead sessions auto-cleaned |
| Dispatch doesn't understand | Customize not configured | Copy Dispatch instructions above |
| Permission popup blocks reply | First MCP tool use | Approve in CLI terminal window |
| Duplicate session names | Multiple CLIs in same directory | Auto-suffixed, or use `hub_set_name` |

## License

MIT
