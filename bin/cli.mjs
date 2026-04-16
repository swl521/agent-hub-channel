#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "fs";
import { join, dirname } from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = join(__dirname, "..");
const HOME = process.env.HOME || process.env.USERPROFILE;
const INSTALL_DIR = join(HOME, "program", "agent-hub-channel");
const HUB_DIR = join(HOME, ".claude", "agent-hub");
const MCP_FILE = join(HOME, ".mcp.json");
const SETTINGS_LOCAL = join(HOME, ".claude", "settings.local.json");

const cmd = process.argv[2];

if (cmd === "init" || cmd === "install" || !cmd) {
  console.log("=== Agent Hub Channel Setup ===\n");

  // 1. Copy source files to install dir
  console.log("[1/5] Installing source files...");
  mkdirSync(INSTALL_DIR, { recursive: true });
  for (const f of ["index.ts", "package.json"]) {
    copyFileSync(join(PKG_DIR, f), join(INSTALL_DIR, f));
  }
  console.log(`  Installed to ${INSTALL_DIR}`);

  // 2. Install bun deps
  console.log("[2/5] Installing dependencies...");
  try {
    execSync("bun install --silent", { cwd: INSTALL_DIR, stdio: "pipe" });
    console.log("  done");
  } catch {
    console.log("  WARNING: bun install failed. Run manually: cd " + INSTALL_DIR + " && bun install");
  }

  // 3. Create runtime dirs
  console.log("[3/5] Creating runtime directories...");
  mkdirSync(join(HUB_DIR, "responses"), { recursive: true });
  console.log(`  ${HUB_DIR}/`);

  // 4. Configure .mcp.json
  console.log("[4/5] Configuring MCP Server...");
  if (existsSync(MCP_FILE)) {
    const content = readFileSync(MCP_FILE, "utf-8");
    if (content.includes("agent-hub")) {
      console.log("  ~/.mcp.json already configured");
    } else {
      const mcp = JSON.parse(content);
      mcp.mcpServers = mcp.mcpServers || {};
      mcp.mcpServers["agent-hub"] = {
        command: "bun",
        args: [join(INSTALL_DIR, "index.ts")],
      };
      writeFileSync(MCP_FILE, JSON.stringify(mcp, null, 2));
      console.log("  Added agent-hub to ~/.mcp.json");
    }
  } else {
    writeFileSync(
      MCP_FILE,
      JSON.stringify(
        {
          mcpServers: {
            "agent-hub": {
              command: "bun",
              args: [join(INSTALL_DIR, "index.ts")],
            },
          },
        },
        null,
        2
      )
    );
    console.log("  Created ~/.mcp.json");
  }

  // 5. Configure settings.local.json
  console.log("[5/5] Configuring Claude Code settings...");
  const settingsDir = join(HOME, ".claude");
  mkdirSync(settingsDir, { recursive: true });
  if (existsSync(SETTINGS_LOCAL)) {
    const content = readFileSync(SETTINGS_LOCAL, "utf-8");
    if (content.includes("agent-hub")) {
      console.log("  settings.local.json already configured");
    } else {
      const settings = JSON.parse(content);
      settings.enabledMcpjsonServers = settings.enabledMcpjsonServers || [];
      if (!settings.enabledMcpjsonServers.includes("agent-hub")) {
        settings.enabledMcpjsonServers.push("agent-hub");
      }
      writeFileSync(SETTINGS_LOCAL, JSON.stringify(settings, null, 2));
      console.log("  Added agent-hub to settings.local.json");
    }
  } else {
    writeFileSync(
      SETTINGS_LOCAL,
      JSON.stringify(
        {
          enableAllProjectMcpServers: true,
          enabledMcpjsonServers: ["agent-hub"],
        },
        null,
        2
      )
    );
    console.log("  Created settings.local.json");
  }

  console.log("\n=== Setup Complete ===\n");
  console.log("Next steps:");
  console.log("  1. Add shell alias to auto-load channel:");
  console.log('     echo \'alias claude="claude --dangerously-load-development-channels server:agent-hub"\'  >> ~/.zshrc');
  console.log("  2. source ~/.zshrc");
  console.log("  3. Start claude — it will auto-register to agent-hub");
  console.log("  4. Configure Dispatch Customize (see dispatch-instructions.md on GitHub)\n");
} else if (cmd === "status") {
  const regFile = join(HUB_DIR, "registry.json");
  if (!existsSync(regFile)) {
    console.log("No sessions registered.");
    process.exit(0);
  }
  const reg = JSON.parse(readFileSync(regFile, "utf-8"));
  const sessions = Object.entries(reg.sessions || {});
  if (sessions.length === 0) {
    console.log("No active sessions.");
  } else {
    console.log(`${sessions.length} session(s):\n`);
    console.log("Name".padEnd(25) + "Port".padEnd(8) + "Status".padEnd(10) + "Directory");
    console.log("-".repeat(70));
    for (const [name, info] of sessions) {
      console.log(
        name.padEnd(25) +
          String(info.port).padEnd(8) +
          (info.status || "?").padEnd(10) +
          (info.cwd || "")
      );
    }
  }
} else {
  console.log("Usage:");
  console.log("  agent-hub-channel init     Setup agent-hub on this machine");
  console.log("  agent-hub-channel status   Show registered CLI sessions");
}
