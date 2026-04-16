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
3. 执行：
```bash
curl -s -X POST http://127.0.0.1:{端口}/send -H "Content-Type: application/json" -d '{"command":"指令内容","msg_id":"生成的msg_id"}'
```
4. 确认返回 `{"status":"delivered"}`
5. 每隔 5 秒检查回复：
```bash
cat ~/.claude/agent-hub/responses/{msg_id}.json
```
6. 文件存在后读取，把 `result` 字段返回给我
7. 如果 90 秒内没有回复，告诉我超时

### 查看某个 CLI 状态
```bash
curl -s http://127.0.0.1:{端口}/status
```

### 注意事项
- 端口范围 18001-18099，只监听 127.0.0.1
- 会话名默认为工作目录名，可被 CLI 修改
- status 字段：idle（空闲）、busy（执行中）、done（完成）
