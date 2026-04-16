# Dispatch 端配置说明

将以下内容复制到 Dispatch 的 **Customize** 中：

---

## Agent Hub — 多 CLI 调度

我的 Mac 上运行着多个 Claude CLI 会话，通过 agent-hub 管理。

### 查看所有 CLI 会话
读取 `~/.claude/agent-hub/registry.json`，列出每个会话的名字、端口、目录、状态。

### 给 CLI 发指令（当我说 "@名字 做某事"）
1. 读 `~/.claude/agent-hub/registry.json` 找到目标会话的端口
2. 生成随机 msg_id（8位字母数字）
3. 执行（注意 `wait: true` 会等待 CLI 执行完毕后直接返回结果）：
```bash
curl -s -X POST http://127.0.0.1:{端口}/send -H "Content-Type: application/json" -d '{"command":"指令内容","msg_id":"生成的msg_id","wait":true,"timeout":120}'
```
4. curl 会阻塞直到 CLI 执行完毕，直接返回包含 result 字段的 JSON
5. 如果超时，会返回 `{"status":"timeout"}`
6. 把 result 字段返回给我

### 查看某个 CLI 状态
```bash
curl -s http://127.0.0.1:{端口}/status
```

### 注意事项
- `wait: true` 模式下 curl 会阻塞等待结果，最长等 timeout 秒（默认 120，最大 300）
- 如果不需要等结果，去掉 `wait` 字段即可立即返回
- 端口范围 18001-18099，只监听 127.0.0.1
- status 字段：idle（空闲）、busy（执行中）、done（完成）
