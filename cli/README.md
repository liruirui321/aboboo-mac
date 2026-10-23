# Aboboo CLI 与智能体材料通道

Python 3.9+，macOS。把音频下载、离线转写、Qwen 分句、字幕校验、考试指令过滤和桌面版入库封装为可恢复任务。它是本地处理流水线与智能体调用接口，不是自动搜题服务，也不会把练习音频认定为官方真题。

## 安装

在仓库根目录执行：

```sh
bash scripts/setup-asr.sh
bash scripts/setup-llm.sh
cargo build --release --manifest-path src-tauri/Cargo.toml --bin prepare-material
# 还需 ffmpeg；例如 brew install ffmpeg
chmod +x cli/aboboo
mkdir -p "$HOME/.local/bin"
ln -s "$PWD/cli/aboboo" "$HOME/.local/bin/aboboo"
# 将 ~/.local/bin 加入 shell PATH；或直接使用 ./cli/aboboo
aboboo init --storage /Volumes/YourSSD/AbobooMac
aboboo doctor
```

配置位于 `~/.config/aboboo/config.json`，可用 `--config PATH` 或 `ABOBOO_CONFIG` 指定。工具和模型路径可直接在配置中修改。`doctor` 的 `ready` 检查处理组件，`desktopConnected` 检查桌面版是否使用同一个 library 目录。CLI 不自动搬迁或替换已有桌面数据；桌面库应指向配置目录中的 `library`。本机已连接的 SSD 不需要重复设置。

SSD 未挂载时立即报错，不回退到内置盘。下载、临时 PCM、字幕、日志、任务和项目均放在配置的 storage 中。源码、模型与小型配置文件不属于媒体存储。`init` 拒绝覆盖已有配置。

## 常用命令

```sh
# 同步导入，结束后返回结果；无字幕时 Whisper + Qwen 自动处理
aboboo ingest /Volumes/YourSSD/new.mp3 --title '新材料' --source-note '来源与考期说明'

# 推荐智能体使用：后台导入，不占用对话等待时间
aboboo submit 'https://example.org/audio.mp3' --title '新材料'
aboboo status JOB_UUID
aboboo retry JOB_UUID

# 已有字幕：SRT 或 {"segments":[{"start":0,"end":2,"text":"Hello."}]} JSON
aboboo submit /Volumes/YourSSD/new.mp3 --subtitles /Volumes/YourSSD/new.srt
aboboo jobs
aboboo materials
```

音频直链须返回可由 ffmpeg 解码的媒体；网页链接、登录页、网盘分享页不会自动解析。下载默认上限 1 GiB，音频上限两小时，每个处理阶段超时两小时，可在配置中设置 `maxBytes`、`maxDuration`、`timeoutSeconds`。OneDrive/iCloud 占位文件须先恢复为可读取文件，再提交。

默认过滤独立的考试指令和题号；`--keep-instructions` 保留。过滤不会修改原音频，逐句播放跳过相应时间区间。与正文混在同一句的指令仍需人工校正。导入字幕保留其分句；自动字幕不是官方答案，长句和模型回退会写入 warnings。

`completed` 后，桌面版材料库点击“刷新材料”即可看到素材。CLI 按原音频 SHA-256 为 **CLI 导入的材料** 去重；重复导入不会修改现有字幕、答案、收藏或进度。重新提供不同字幕也不会覆盖旧材料。之前由其他途径建立的材料没有统一哈希编号，不保证自动去重。

## 智能体协议

启动 `aboboo serve`，通过 stdin/stdout 传输 JSON Lines，每行一个请求/响应。它不是 HTTP 服务或 MCP 服务，不监听网络端口。同一 Mac 上的智能体可以通过子进程调用；上传是把本地路径或可下载的 HTTP(S) 地址交给 `submit`。

```json
{"id":"a1","argv":["submit","/Volumes/YourSSD/new.mp3","--title","新材料","--source-note","回忆配套练习音频"]}
{"id":"a2","argv":["status","返回的任务 UUID"]}
{"id":"a3","argv":["materials"]}
```

响应统一为 `{"id":"a1","ok":true,"result":{...}}` 或 `{"id":"a1","ok":false,"error":"..."}`。支持 `doctor / submit / status / retry / jobs / materials`；不执行任意 shell 字符串。请求按顺序响应，submit 的转写在独立后台进程执行。会话结束后任务继续；Mac 睡眠会暂停计算，重启或进程崩溃后用 `status` 检查并 `retry`。

CLI 普通命令也只向 stdout 输出一个 JSON 对象（`--help` 除外），失败退出码为 1，参数错误为 2。任务阶段为 `download → decode → transcribe → segment → validate → publish → completed`；提供字幕时跳过转写与分句。失败保留 job ID、阶段和 error；日志在 `storage/jobs/ID/pipeline.log`。`status` 可识别无工作进程持锁的 interrupted 任务。重试复用已完成阶段，不需要重新下载。

建议智能体调用顺序：doctor → submit → status → 检查 warnings → materials。状态为 failed 时查看错误，修复依赖或网络后 retry；不要反复新建同一任务。任务目录保留源音频和中间产物以支持恢复，因此会占用 SSD，当前不自动清理。任务日志和来源 URL 可能含私人信息，不应提交到 GitHub。

## 验证

```sh
ABOBOO_TEST_TMP=/Volumes/YourSSD/test-work python3 tests/cli_test.py
```

测试使用独立材料库，验证真实 ffmpeg 解码、SRT 导入、重复导入保护、无效字幕拒绝、SSD 缺失、失败恢复，以及 JSON Lines 后台任务。真实离线转写需模型文件另行验证。
