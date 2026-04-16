# Agent Hub Channel

[Claude Code](https://claude.ai/code) 多 CLI 会话调度系统。通过 MCP Channel 协议，从手机端 Dispatch 或其他 CLI 远程控制多个 Claude Code 会话。

[English](./README.md)

## 架构

```
┌─────────────┐     curl POST /send      ┌──────────────────┐
│  Dispatch   │ ────────────────────────> │  agent-hub MCP   │
│  (手机端)    │                           │  (HTTP + Channel)│
└─────────────┘                           └────────┬─────────┘
       ▲                                           │
       │  读取 responses/{id}.json     notifications/claude/channel
       │                                           │
       │                                           ▼
       │                                  ┌──────────────────┐
       │                                  │  Claude CLI 会话  │
       │                                  │  (执行任务)       │
       │                                  └────────┬─────────┘
       │                              hub_reply(msg_id, result)
       │                                           │
       └──────────────────────────────── responses/{id}.json
```

## 安装

### 方式一：Git Clone（推荐）

```bash
git clone https://github.com/swl521/agent-hub-channel.git ~/program/agent-hub-channel
cd ~/program/agent-hub-channel
chmod +x install.sh
./install.sh
source ~/.zshrc
```

### 方式二：Claude Code 插件

```bash
# 添加插件源
/plugin marketplace add swl521/agent-hub-channel

# 安装插件
/plugin install agent-hub-channel@swl521-agent-hub-channel
```

然后添加 shell alias：

```bash
echo 'alias claude="claude --dangerously-load-development-channels server:agent-hub"' >> ~/.zshrc
source ~/.zshrc
```

## 前置条件

- **[bun](https://bun.sh/)** >= 1.0
- **[Claude Code CLI](https://claude.ai/code)** >= 2.1.80（需支持 Channel 功能）
- **macOS / Linux**

## 快速开始

1. 用上面任一方式安装
2. 启动 Claude Code：
   ```bash
   claude    # alias 自动加载 agent-hub channel
   ```
3. 验证注册：
   ```bash
   cat ~/.claude/agent-hub/registry.json
   ```

## 工作原理

1. 每个 CLI 启动时自动注册到 `~/.claude/agent-hub/registry.json`
2. 每个会话监听本机 HTTP 端口（18001-18099，仅 127.0.0.1）
3. 外部通过 `POST /send` 发送指令，附带 `{command, msg_id}`
4. MCP Channel 将指令注入 CLI 对话
5. CLI 执行任务后调用 `hub_reply` 写回复到 `responses/{msg_id}.json`
6. 发送方轮询回复文件获取结果

## MCP 工具

每个加载了 agent-hub 的 CLI 会话提供：

| 工具 | 说明 |
|------|------|
| `hub_reply(msg_id, result)` | 回复远程指令 |
| `hub_set_name(name)` | 设置会话显示名称 |
| `hub_status(status)` | 更新状态：`idle` / `busy` / `done` |

## HTTP 接口

每个会话监听 `127.0.0.1:{端口}`：

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/status` | 会话信息（名字、端口、状态） |
| `POST` | `/send` | 注入指令 `{command, msg_id}` |
| `GET` | `/responses/:id` | 查询回复是否就绪 |

## 配置 Dispatch（手机端）

在 Claude Desktop Dispatch 的 **Customize** 中添加以下内容，让 Dispatch 能够调度本机 CLI：

<details>
<summary>点击展开 Dispatch 配置</summary>

```
## Agent Hub

我的 Mac 上运行着多个 Claude CLI 会话，通过 agent-hub 管理。

### 查看所有 CLI 会话
读取 ~/.claude/agent-hub/registry.json，列出每个会话的名字、端口、目录、状态。

### 给 CLI 发指令（当我说 "@名字 做某事"）
1. 读 ~/.claude/agent-hub/registry.json 找到目标会话的端口
2. 生成随机 msg_id（8位字母数字）
3. 执行：
   curl -s -X POST http://127.0.0.1:{端口}/send -H "Content-Type: application/json" -d '{"command":"指令内容","msg_id":"生成的msg_id"}'
4. 确认返回 {"status":"delivered"}
5. 每隔 5 秒检查回复：cat ~/.claude/agent-hub/responses/{msg_id}.json
6. 文件存在后读取，把 result 字段返回给我
7. 如果 90 秒内没有回复，告诉我超时

### 查看某个 CLI 状态
curl -s http://127.0.0.1:{端口}/status
```

</details>

## 权限配置层级

| 层级 | 文件 | 作用 |
|------|------|------|
| MCP 声明 | `~/.mcp.json` | 注册 agent-hub 为 MCP Server |
| 加载许可 | `~/.claude/settings.local.json` | 允许加载 agent-hub MCP |
| Channel 激活 | `~/.zshrc` alias | 启动时自动加载 channel 能力 |
| CLI 指南 | `~/.claude/CLAUDE.md` | 教 CLI 如何使用 agent-hub |
| Dispatch 指南 | Dispatch Customize | 教 Dispatch 如何调度 CLI |

> **重要**：alias 是关键一环。不加 `--dangerously-load-development-channels server:agent-hub`，MCP 工具可用但 Channel 通知不生效，CLI 收不到远程指令。

## 文件结构

```
~/program/agent-hub-channel/        # 源码
├── index.ts                        # MCP Server 主程序
├── package.json                    # 依赖
├── install.sh                      # 一键安装脚本
├── bin/cli.mjs                     # CLI 工具（status 查询）
├── dispatch-instructions.md        # Dispatch 配置说明
├── .claude-plugin/                 # Claude Code 插件描述
│   ├── plugin.json
│   └── marketplace.json
├── README.md                       # English
└── README.zh-CN.md                 # 中文说明

~/.claude/agent-hub/                # 运行时（自动创建）
├── registry.json                   # 会话注册表
└── responses/                      # 回复文件
    └── {msg_id}.json
```

## 故障排查

| 问题 | 原因 | 解决 |
|------|------|------|
| CLI 没出现在注册表 | 没用 alias 启动 | `source ~/.zshrc` 后重启 `claude` |
| 指令送达但无回复 | channel 未加载 | 确认 alias 包含 `server:agent-hub` |
| 端口连接拒绝 | 会话已退出，注册残留 | 重启 CLI，死进程自动清理 |
| Dispatch 不识别指令 | Customize 未配置 | 按上面说明添加 |
| 权限弹窗卡住 | MCP 工具首次使用 | 去 CLI 终端窗口点允许 |
| 同名会话冲突 | 同目录开了多个 CLI | 自动加后缀，或用 `hub_set_name` 改名 |

## 许可

MIT
