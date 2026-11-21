# 自定义改动：服务端日志落盘与轮转

> 本文件记录 `custom` 分支相对上游 `owpengram/owpengram-server` 的自定义改动，便于日后 rebase 上游时保留、回溯和回滚。
> 代码中的改动点统一带有 `[custom:log-rotation]` 标记。

## 1. 背景

上游 `telesrv` 只把 zap 日志写到 stderr，由 NSSM 重定向到 `logs\server\server.log`。这种方式有两个问题：

- 日志文件会无限增长（此前单文件已达 6 MB）；
- 现有 `rotate_logs.ps1` 必须停止服务才能改名，每天轮转会造成 1–3 秒全员断线。

因此改为由应用内 `lumberjack` 直接写文件并在进程内轮转，实现**零停机、按大小触发、自动保留/压缩**。

## 2. 改动位置

| 文件 | 说明 |
|---|---|
| `cmd/telesrv/main.go` | `newLogger()` 改为调用新增的 `newLogSink()`；新增 `newLogSink()` 与 `logEnvInt()`，带 `[custom:log-rotation]` 注释 |
| `go.mod` / `go.sum` | 新增依赖 `gopkg.in/natefinch/lumberjack.v2 v2.2.1` |
| `docs/custom-log-rotation.md` | 本文件 |

业务代码零改动：所有包使用的都是 `newLogger()` 注入的 `*zap.Logger`。

## 3. 环境变量

未设置 `TELESRV_LOG_FILE` 时完全保持上游行为（写 stderr），本地 `go run` 不受影响。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `TELESRV_LOG_FILE` | 空 | 日志文件绝对路径；为空表示不落盘、仍写 stderr |
| `TELESRV_LOG_MAX_MB` | `50` | 单文件大小上限（MB），超过即轮转 |
| `TELESRV_LOG_MAX_BACKUPS` | `14` | 最多保留的归档份数 |
| `TELESRV_LOG_MAX_AGE_DAYS` | `30` | 归档最长保留天数 |
| `TELESRV_LOG_COMPRESS` | `true` | 是否 gzip 压缩归档 |
| `TELESRV_LOG_LEVEL` | `info` | 上游已有变量，本次未改动 |

`TELESRV_LOG_MAX_MB` / `TELESRV_LOG_MAX_BACKUPS` / `TELESRV_LOG_MAX_AGE_DAYS` 必须是**非负整数**，`TELESRV_LOG_COMPRESS` 必须是 `true`/`false`；非法值会让服务启动失败并打印 `init logger: parse ...`。

## 4. NSSM 部署配置

启用文件轮转后，**不能**让 NSSM 的 `AppStdout/AppStderr` 再指向同一个日志文件，否则 NSSM 与 lumberjack 会同时持有同一个句柄。建议：

```powershell
$nssm = 'D:\app\env\bin\nssm.exe'
& $nssm set telesrv AppEnvironmentExtra "TELESRV_LOG_FILE=E:\game\Telegram\ts_telegram\logs\server\telesrv.log"
& $nssm set telesrv AppStdout "E:\game\Telegram\ts_telegram\logs\server\stderr.log"
& $nssm set telesrv AppStderr "E:\game\Telegram\ts_telegram\logs\server\stderr.log"
& $nssm set telesrv AppRotateFiles 0
& $nssm restart telesrv
```

结果：

- `logs\server\telesrv.log`：正常业务日志，手动/自动轮转为 `telesrv-<时间戳>.log.gz`；
- `logs\server\stderr.log`：只接收 panic、启动期错误等 stderr 输出，正常情况几乎不增长。

旧的重定向日志 `logs\server\server.log` 可在确认新日志正常后手动归档或删除。

## 5. 与上游同步（rebase）注意事项

1. 改动集中在 `cmd/telesrv/main.go` 的 `newLogger()` 末尾及紧随其后的 `newLogSink()` / `logEnvInt()`，整段带 `[custom:log-rotation]` 标记，冲突时保留整段即可。
2. 若上游也修改了 `newLogger()`，保留上游的级别解析、`BufferedWriteSyncer`、`compactEncoder` 逻辑，只把 `WS: zapcore.AddSync(os.Stderr)` 替换为 `sink`。
3. `go.mod` 中 `gopkg.in/natefinch/lumberjack.v2` 可能与上游整理依赖产生冲突，保留该行并执行 `go mod tidy`。
4. 本文件是新增文件，通常不会与上游冲突。

## 6. 回滚方式

- 临时回滚：删除 NSSM 的 `TELESRV_LOG_FILE` 环境变量，恢复 `AppStdout/AppStderr` 指向 `server.log`，重启服务即可回到上游行为。
- 代码回滚：删除 `newLogSink` / `logEnvInt` 与 lumberjack 依赖，把 `newLogger()` 的 sink 改回 `zapcore.AddSync(os.Stderr)`。

## 7. 验证

1. 编译：`go build -o build\telesrv-logrotate.exe ./cmd/telesrv`
2. 将 `TELESRV_LOG_MAX_MB` 临时设为 `1`，运行并观察目录中出现 `telesrv-*.log.gz`，当前 `telesrv.log` 被清空重写；
3. 确认服务运行期间无断线、无 `Access is denied` / 文件占用错误；
4. 检查 `stderr.log` 是否只剩 panic/启动错误。
