# 日志系统说明

Modbus Slave 现在提供统一日志系统，覆盖通讯、脚本、连接、工作空间、CLI 操作。

## 能力

1. 主进程统一日志总线（`SystemLogger`）
2. 内存环形缓冲（默认 100MB）
3. 文件落盘与轮转（`system.log`，10MB 轮转，最多 5 份）
4. 日志实时推送到通讯详情窗口
5. 打开通讯详情时自动回补历史日志（最近 10000 条）
6. 通讯报文 + 系统日志统一过滤

日志目录：

- `app.getPath('userData')/logs/system.log`

## 通讯详情过滤字段

- 报文字段：`kind` `direction` `unit/slaveid` `fc/functioncode` `data` `exception`
- 日志字段：`level` `source` `module` `message`

示例：

```text
kind == comm and direction == RX and fc == 3
kind == log and level == error
source == script and message contains "failed"
```

## 日志来源

- `system`
- `comm`
- `script`
- `connection`
- `register`
- `workspace`
- `cli`
