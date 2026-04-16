#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Agent Hub Channel — 一键安装脚本
# 多 CLI 会话调度系统，支持 Dispatch 远程控制
# ═══════════════════════════════════════════════════════════════════

set -e

INSTALL_DIR="$HOME/program/agent-hub-channel"
HUB_DIR="$HOME/.claude/agent-hub"
MCP_FILE="$HOME/.mcp.json"
SETTINGS_LOCAL="$HOME/.claude/settings.local.json"
ZSHRC="$HOME/.zshrc"

echo "=== Agent Hub Channel 安装 ==="
echo ""

# ── 1. 检查依赖 ──────────────────────────────────────────────────
echo "[1/6] 检查依赖..."

if ! command -v bun &> /dev/null; then
    echo "  ERROR: 需要 bun 运行时"
    echo "  安装: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi
echo "  bun $(bun --version)"

if ! command -v claude &> /dev/null; then
    echo "  ERROR: 需要 Claude Code CLI"
    echo "  安装: npm install -g @anthropic-ai/claude-code"
    exit 1
fi
echo "  claude $(claude --version 2>/dev/null)"

# ── 2. 安装依赖 ──────────────────────────────────────────────────
echo "[2/6] 安装 npm 依赖..."
cd "$INSTALL_DIR"
bun install --silent
echo "  done"

# ── 3. 创建运行时目录 ────────────────────────────────────────────
echo "[3/6] 创建运行时目录..."
mkdir -p "$HUB_DIR/responses"
echo "  $HUB_DIR/"
echo "  $HUB_DIR/responses/"

# ── 4. 配置 MCP Server ──────────────────────────────────────────
echo "[4/6] 配置 MCP Server..."

if [ -f "$MCP_FILE" ]; then
    if grep -q "agent-hub" "$MCP_FILE"; then
        echo "  ~/.mcp.json 已配置，跳过"
    else
        echo "  WARNING: ~/.mcp.json 已存在但未包含 agent-hub"
        echo "  请手动添加以下内容到 mcpServers:"
        echo '    "agent-hub": {'
        echo '      "command": "bun",'
        echo "      \"args\": [\"$INSTALL_DIR/index.ts\"]"
        echo '    }'
    fi
else
    cat > "$MCP_FILE" << EOF
{
  "mcpServers": {
    "agent-hub": {
      "command": "bun",
      "args": ["$INSTALL_DIR/index.ts"]
    }
  }
}
EOF
    echo "  已创建 ~/.mcp.json"
fi

# ── 5. 配置 settings.local.json ──────────────────────────────────
echo "[5/6] 配置 Claude Code settings..."

if [ -f "$SETTINGS_LOCAL" ]; then
    if grep -q "agent-hub" "$SETTINGS_LOCAL"; then
        echo "  settings.local.json 已配置，跳过"
    else
        echo "  WARNING: settings.local.json 已存在但未包含 agent-hub"
        echo "  请手动添加: \"enabledMcpjsonServers\": [\"agent-hub\"]"
    fi
else
    cat > "$SETTINGS_LOCAL" << 'EOF'
{
  "enableAllProjectMcpServers": true,
  "enabledMcpjsonServers": [
    "agent-hub"
  ]
}
EOF
    echo "  已创建 settings.local.json"
fi

# ── 6. 配置 shell alias ─────────────────────────────────────────
echo "[6/6] 配置 shell alias..."

if grep -q "dangerously-load-development-channels.*agent-hub" "$ZSHRC" 2>/dev/null; then
    echo "  alias 已存在，跳过"
else
    echo '' >> "$ZSHRC"
    echo '# Agent Hub — auto-load channel' >> "$ZSHRC"
    echo 'alias claude="claude --dangerously-load-development-channels server:agent-hub"' >> "$ZSHRC"
    echo "  已添加 alias 到 ~/.zshrc"
fi

echo ""
echo "=== 安装完成 ==="
echo ""

# ── 推送通知配置（可选）────────────────────────────────────────────
CONFIG_FILE="$HUB_DIR/config.json"
if [ ! -f "$CONFIG_FILE" ]; then
    echo "=== 推送通知配置（可选）==="
    echo ""
    echo "  agent-hub 支持通过 ntfy.sh 推送任务完成通知到手机。"
    echo "  1. 手机安装 ntfy app (https://ntfy.sh)"
    echo "  2. 在 app 中订阅一个 topic（如 my-hub）"
    echo "  3. 运行以下命令启用推送："
    echo ""
    echo "     echo '{\"ntfy_topic\":\"你的topic\"}' > $CONFIG_FILE"
    echo ""
    echo "  也可以用自建 ntfy 服务器："
    echo "     echo '{\"ntfy_topic\":\"你的topic\",\"ntfy_server\":\"https://你的服务器\"}' > $CONFIG_FILE"
    echo ""
fi

echo "下一步："
echo "  1. 执行 source ~/.zshrc 或重新打开终端"
echo "  2. 用 claude 启动 CLI（alias 自动加载 channel）"
echo "  3. 在 Dispatch Customize 中添加 agent-hub 操作说明"
echo "  4.（可选）配置 ntfy 推送通知"
echo ""
echo "验证："
echo "  启动 claude 后查看 cat ~/.claude/agent-hub/registry.json"
echo "  应该能看到你的会话注册信息"
