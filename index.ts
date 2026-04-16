#!/usr/bin/env bun
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, basename } from "path";
import { createServer, type Server as HttpServer } from "http";

// ── Constants ──────────────────────────────────────────────────────────
const HUB_DIR = join(process.env.HOME!, ".claude", "agent-hub");
const REGISTRY_FILE = join(HUB_DIR, "registry.json");
const RESPONSES_DIR = join(HUB_DIR, "responses");
const CONFIG_FILE = join(HUB_DIR, "config.json");
const PORT_RANGE_START = 18001;
const PORT_RANGE_END = 18099;

// ── State ──────────────────────────────────────────────────────────────
let sessionName = basename(process.cwd());
let assignedPort = 0;
let httpServer: HttpServer | null = null;
const sessionId = crypto.randomUUID().slice(0, 8);

// ── Helpers ────────────────────────────────────────────────────────────

function ensureDirs() {
  mkdirSync(HUB_DIR, { recursive: true });
  mkdirSync(RESPONSES_DIR, { recursive: true });
}

function readRegistry(): Record<string, any> {
  try {
    return JSON.parse(readFileSync(REGISTRY_FILE, "utf-8"));
  } catch {
    return { sessions: {} };
  }
}

function writeRegistry(reg: Record<string, any>) {
  writeFileSync(REGISTRY_FILE, JSON.stringify(reg, null, 2));
}

function register(name: string, port: number) {
  const reg = readRegistry();
  // If name already taken by another live process, append session id
  if (reg.sessions[name] && reg.sessions[name].sessionId !== sessionId) {
    try {
      process.kill(reg.sessions[name].pid, 0);
      // Process alive — use suffixed name
      name = `${name}-${sessionId}`;
    } catch {
      // Process dead — take over the name
    }
  }
  sessionName = name;
  reg.sessions[name] = {
    port,
    pid: process.pid,
    sessionId,
    cwd: process.cwd(),
    started: new Date().toISOString(),
    status: "idle",
  };
  writeRegistry(reg);
}

function unregister() {
  try {
    const reg = readRegistry();
    if (reg.sessions[sessionName]?.sessionId === sessionId) {
      delete reg.sessions[sessionName];
      writeRegistry(reg);
    }
  } catch {
    // best effort
  }
}

function updateStatus(status: string) {
  try {
    const reg = readRegistry();
    if (reg.sessions[sessionName]) {
      reg.sessions[sessionName].status = status;
      writeRegistry(reg);
    }
  } catch {
    // best effort
  }
}

function readConfig(): Record<string, any> {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return {};
  }
}

async function pushNotify(session: string, result: string) {
  const config = readConfig();
  const ntfyTopic = config.ntfy_topic || process.env.AGENT_HUB_NTFY_TOPIC;
  if (!ntfyTopic) return;

  const ntfyServer = config.ntfy_server || "https://ntfy.sh";
  const title = `[${session}] task done`;
  const body = result.length > 200 ? result.slice(0, 200) + "..." : result;

  try {
    await fetch(`${ntfyServer}/${ntfyTopic}`, {
      method: "POST",
      headers: {
        Title: title,
        Priority: "default",
        Tags: "robot",
      },
      body,
    });
  } catch {
    // best effort — don't block on push failure
  }
}

function cleanDeadSessions() {
  const reg = readRegistry();
  let changed = false;
  for (const [name, info] of Object.entries(reg.sessions) as [string, any][]) {
    try {
      process.kill(info.pid, 0);
    } catch {
      delete reg.sessions[name];
      changed = true;
    }
  }
  if (changed) writeRegistry(reg);
}

async function findAvailablePort(): Promise<number> {
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const srv = createServer();
        srv.once("error", reject);
        srv.listen(port, "127.0.0.1", () => {
          srv.close(() => resolve());
        });
      });
      return port;
    } catch {
      continue;
    }
  }
  throw new Error("No available port in range 18001-18099");
}

// ── MCP Server ─────────────────────────────────────────────────────────

const mcp = new Server(
  { name: "agent-hub", version: "0.1.0" },
  {
    capabilities: {
      experimental: { "claude/channel": {} },
      tools: {},
    },
    instructions: `你已连接到 agent-hub 多会话调度系统。

当你收到 <channel source="agent-hub"> 消息时，这是来自手机端 Dispatch 的远程指令。
- 认真执行指令中的任务
- 执行完毕后，必须调用 hub_reply tool 回复结果
- 回复要简洁明了，包含关键信息

可用工具：
- hub_reply: 回复远程指令的执行结果
- hub_set_name: 设置本会话的显示名称（默认为当前目录名）
- hub_status: 更新本会话状态（idle/busy/done）`,
  }
);

// ── Tools ──────────────────────────────────────────────────────────────

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "hub_reply",
      description:
        "回复来自 Dispatch 的远程指令。执行完远程任务后调用此工具发送结果。",
      inputSchema: {
        type: "object" as const,
        properties: {
          msg_id: {
            type: "string",
            description: "消息 ID（从 channel 消息的 msg_id 属性获取）",
          },
          result: {
            type: "string",
            description: "执行结果的简洁描述",
          },
        },
        required: ["msg_id", "result"],
      },
    },
    {
      name: "hub_set_name",
      description: "设置本 CLI 会话在 agent-hub 中的显示名称",
      inputSchema: {
        type: "object" as const,
        properties: {
          name: {
            type: "string",
            description: "新的会话名称（建议用项目名或简短描述）",
          },
        },
        required: ["name"],
      },
    },
    {
      name: "hub_status",
      description: "更新本会话在 agent-hub 中的状态",
      inputSchema: {
        type: "object" as const,
        properties: {
          status: {
            type: "string",
            enum: ["idle", "busy", "done"],
            description: "会话状态",
          },
        },
        required: ["status"],
      },
    },
  ],
}));

mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === "hub_reply") {
    const { msg_id, result } = args as { msg_id: string; result: string };
    const response = {
      msg_id,
      session: sessionName,
      result,
      timestamp: new Date().toISOString(),
    };
    const filePath = join(RESPONSES_DIR, `${msg_id}.json`);
    writeFileSync(filePath, JSON.stringify(response, null, 2));
    updateStatus("idle");
    await pushNotify(sessionName, result);
    return { content: [{ type: "text", text: `已回复消息 ${msg_id}` }] };
  }

  if (name === "hub_set_name") {
    const { name: newName } = args as { name: string };
    const oldName = sessionName;
    const reg = readRegistry();
    const data = reg.sessions[oldName];
    if (data) {
      delete reg.sessions[oldName];
      reg.sessions[newName] = data;
      writeRegistry(reg);
    }
    sessionName = newName;
    return {
      content: [{ type: "text", text: `会话名已从 "${oldName}" 改为 "${newName}"` }],
    };
  }

  if (name === "hub_status") {
    const { status } = args as { status: string };
    updateStatus(status);
    return {
      content: [{ type: "text", text: `状态已更新为 ${status}` }],
    };
  }

  return { content: [{ type: "text", text: `Unknown tool: ${name}` }] };
});

// ── HTTP Server (receives commands from Dispatch) ──────────────────────

function startHttpServer(port: number) {
  httpServer = createServer(async (req, res) => {
    // CORS headers for local access
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = new URL(req.url!, `http://127.0.0.1:${port}`);

    // GET /status — return session info
    if (req.method === "GET" && url.pathname === "/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          name: sessionName,
          port,
          pid: process.pid,
          cwd: process.cwd(),
          status:
            readRegistry().sessions[sessionName]?.status || "unknown",
        })
      );
      return;
    }

    // POST /send — inject command into CLI session
    if (req.method === "POST" && url.pathname === "/send") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const { command, msg_id } = JSON.parse(body);
          const id = msg_id || crypto.randomUUID().slice(0, 8);

          updateStatus("busy");

          await mcp.notification({
            method: "notifications/claude/channel",
            params: {
              content: command,
              meta: { msg_id: id, from: "dispatch" },
            },
          });

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "delivered", msg_id: id }));
        } catch (e: any) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // GET /responses/:msg_id — check if response is ready
    if (req.method === "GET" && url.pathname.startsWith("/responses/")) {
      const msgId = url.pathname.split("/").pop();
      const filePath = join(RESPONSES_DIR, `${msgId}.json`);
      if (existsSync(filePath)) {
        const data = readFileSync(filePath, "utf-8");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(data);
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "pending" }));
      }
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  httpServer.listen(port, "127.0.0.1");
}

// ── Lifecycle ──────────────────────────────────────────────────────────

async function main() {
  ensureDirs();
  cleanDeadSessions();

  // Find port and start HTTP server
  assignedPort = await findAvailablePort();
  startHttpServer(assignedPort);

  // Register in hub
  register(sessionName, assignedPort);

  // Log to stderr (visible in debug, not in MCP stdio)
  console.error(
    `[agent-hub] Registered "${sessionName}" on port ${assignedPort}`
  );

  // Connect MCP over stdio
  const transport = new StdioServerTransport();
  await mcp.connect(transport);

  // Cleanup on exit
  const cleanup = () => {
    unregister();
    httpServer?.close();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("beforeExit", cleanup);
}

main().catch((e) => {
  console.error("[agent-hub] Fatal:", e);
  process.exit(1);
});
