# Agent Hub Channel

Claude Code 多 CLI 会话调度系统。通过 MCP Channel 实现 CLI 间通信和手机端 Dispatch 远程控制。

## 架构

```
┌─────────────┐     curl POST /send      ┌──────────────────┐
│  Dispatch   │ ────────────────────────> │  agent-hub MCP   │
│  (手机端)    │                           │  (HTTP + Channel)│
└─────────────┘                           └────────┬─────────┘
       ▲                                           │
       │ 读取 responses/{id}.json      notifications/claude/channel
       │                                           │
       │                                           ▼
       │                                  ┌──────────────────┐
       │                                  │  Claude CLI 会话  │
       │                                  │  (执行任务)       │
       │                                  └────────┬─────────┘
       │                                           │
       │                              hub_reply(msg_id, result)
       │                                           │
       │                                           ▼
       └──────────────────────────────── responses/{id}.json
```

## 文件结构

```
~/program/agent-hub-channel/        # 源码目录
├── index.ts                        # MCP Server 主程序
├── package.json                    # 依赖配置
├── install.sh                      # 一键安装脚本
├── dispatch-instructions.md        # Dispatch 端配置说明
└── README.md                       # 本文件

~/.claude/agent-hub/                # 运行时目录
├── registry.json                   # 会话注册表
└── responses/                      # 回复文件目录
    └── {msg_id}.json               # 各条消息的回复

~/.mcp.json                         # MCP Server 注册
~/.claude/settings.local.json       # Claude Code 本地设置
~/.zshrc                            # shell alias
```

## 权限分布

```
┌──────────────────────────────────────────────────────────────────┐
│                        权限层级结构                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ~/.mcp.json                                                     │
│  ├── 声明 agent-hub 为全局 MCP Server                            │
│  └── 指定启动命令: bun ~/program/agent-hub-channel/index.ts      │
│                                                                  │
│  ~/.claude/settings.local.json                                   │
│  ├── enabledMcpjsonServers: ["agent-hub"]                        │
│  │   └── 允许加载 agent-hub MCP Server                           │
│  └── enableAllProjectMcpServers: true                            │
│      └── 所有项目目录下的 MCP 都自动启用                           │
│                                                                  │
│  ~/.zshrc (alias)                                                │
│  └── claude → claude --dangerously-load-development-channels     │
│               server:agent-hub                                   │
│      └── 每次启动 CLI 自动加载 channel 能力                       │
│          (不加此 flag，MCP 工具可用但 channel 通知不生效)          │
│                                                                  │
│  ~/.claude/CLAUDE.md                                             │
│  └── Agent Hub 操作说明                                          │
│      └── CLI 端：查看会话、发指令、接收指令的操作方式              │
│                                                                  │
│  Dispatch → Customize                                            │
│  └── Agent Hub 操作说明（同上，但面向 Dispatch AI）               │
│      └── 教 Dispatch 如何读 registry、curl 发指令、轮询回复       │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                     MCP 工具权限 (每个 CLI)                       │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  hub_reply(msg_id, result)                                       │
│  ├── 写文件: ~/.claude/agent-hub/responses/{msg_id}.json         │
│  └── 更新 registry.json 状态为 idle                              │
│                                                                  │
│  hub_set_name(name)                                              │
│  └── 修改 registry.json 中的会话名                                │
│                                                                  │
│  hub_status(status)                                              │
│  └── 修改 registry.json 中的会话状态                              │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                     HTTP 端点 (每个 CLI)                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  GET  /status          → 返回会话信息 (名字/端口/状态)           │
│  POST /send            → 注入指令到 CLI (需要 command + msg_id)  │
│  GET  /responses/:id   → 查询回复是否就绪                        │
│                                                                  │
│  监听: 127.0.0.1 only (本机访问)                                 │
│  端口: 18001-18099 (自动分配)                                    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## 安装

```bash
cd ~/program/agent-hub-channel
chmod +x install.sh
./install.sh
source ~/.zshrc
```

## 安装后验证

### 步骤 1: 启动 CLI
```bash
claude    # alias 自动加载 agent-hub channel
```

### 步骤 2: 检查注册
```bash
cat ~/.claude/agent-hub/registry.json
# 应看到你的会话信息
```

### 步骤 3: 测试发指令（从另一个终端）
```bash
# 查状态
curl -s http://127.0.0.1:18001/status

# 发指令
curl -s -X POST http://127.0.0.1:18001/send \
  -H "Content-Type: application/json" \
  -d '{"command":"say hello and reply with hub_reply","msg_id":"test1"}'

# 等几秒后查回复
cat ~/.claude/agent-hub/responses/test1.json
```

### 步骤 4: 配置 Dispatch
把 `dispatch-instructions.md` 的内容复制到 Dispatch 的 Customize 中。

### 步骤 5: 手机端测试
在 Dispatch 中发送 "查看我的 CLI" 或 "@会话名 做某事"。

## 故障排查

| 问题 | 原因 | 解决 |
|------|------|------|
| CLI 不在 registry 中 | 没用 alias 启动 | `source ~/.zshrc` 后重启 `claude` |
| 指令送达但无回复 | channel 未加载 | 确认用 alias 启动，不是直接 `/usr/local/bin/claude` |
| 端口连接拒绝 | 会话已退出，注册残留 | 重启 CLI，自动清理死进程 |
| Dispatch 不识别指令 | Customize 未配置 | 复制 dispatch-instructions.md 内容 |
| 权限弹窗卡住 | MCP 工具首次使用 | 去 CLI 终端窗口点允许 |
| 同名会话冲突 | 同目录开了多个 CLI | 自动加后缀，或用 hub_set_name 改名 |

## 依赖

- **bun** >= 1.0 — 运行时
- **Claude Code CLI** >= 2.1.80 — 支持 channel 功能
- **@modelcontextprotocol/sdk** ^1.12.0 — MCP 协议
