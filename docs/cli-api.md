# Modbus Slave CLI 使用说明

`modbus-slave` 在主进程启动后会暴露本地 CLI API。你可以通过 `yarn cli` 直接完成与 UI 等价的大部分操作。

## 1. 前提条件

1. 先启动 Modbus Slave 程序。
2. 程序启动后会写入连接信息文件 `cli-api.json`。
3. CLI 默认从该文件读取 `host/port/token`。

默认路径：

- Windows: `%APPDATA%\\modbus-slave\\cli-api.json`
- macOS: `~/Library/Application Support/modbus-slave/cli-api.json`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/modbus-slave/cli-api.json`

## 2. 命令总览

```bash
yarn cli health
yarn cli channels
yarn cli invoke <channel> [--args <json-array>]
yarn cli action <action> [--payload <json-object>]
```

也可以手动指定连接：

```bash
yarn cli invoke get_app_version --host 127.0.0.1 --port 53921 --token YOUR_TOKEN
```

## 3. 常用示例

```bash
# 健康检查
yarn cli health

# 查看所有可调用 IPC channel
yarn cli channels

# 调用 IPC：获取版本号
yarn cli invoke get_app_version

# 调用 UI action：获取当前工作空间
yarn cli action workspace.get

# 打开某个连接
yarn cli action connection.open --payload '{"connectionId":"conn-1"}'

# 修改单个寄存器
yarn cli action register.set --payload '{"connectionId":"conn-1","slaveId":"slave-1","registerGroupId":"group-1","address":0,"value":123}'

# 批量修改寄存器
yarn cli action register.batch_set --payload '{"connectionId":"conn-1","slaveId":"slave-1","registerGroupId":"group-1","values":{"0":1,"1":2,"2":3}}'
```

## 4. action 列表（UI 等价层）

- `workspace.get`
- `workspace.replace`
- `connection.create`
- `connection.update`
- `connection.delete`
- `connection.open`
- `connection.close`
- `slave.create`
- `slave.update`
- `slave.delete`
- `register.set`
- `register.batch_set`
- `script.upsert`
- `script.delete`
- `script.run`

## 5. HTTP API（底层）

- `GET /health`
- `GET /channels`
- `POST /invoke` body: `{ "channel": "get_app_version", "args": [] }`
- `POST /ui/action` body: `{ "action": "workspace.get", "payload": {} }`

鉴权方式：

- Header: `Authorization: Bearer <token>`

## 6. 错误排查

1. `ENOENT cli-api.json`：先确认 Modbus Slave 已启动并完成初始化。
2. `401 Unauthorized`：`token` 不正确，检查 `cli-api.json` 或命令行参数。
3. `IPC handler not registered`：channel 名错误，先执行 `yarn cli channels`。
4. `action failed`：payload 字段缺失或 id 不存在，先用 `workspace.get` 查看当前状态。

