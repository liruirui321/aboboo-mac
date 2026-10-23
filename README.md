# Aboboo Community for macOS

面向 macOS 的轻量音频跟读工具，基于 [hedon954/aboboo-mac](https://github.com/hedon954/aboboo-mac) 的 MIT 开源项目继续维护。

**非官方社区实验版，不是官方 Aboboo 的 macOS 移植。** 目前不支持官方课件格式、账号同步、词典、自动分句或听写批改。社区项目使用独立的 `.abmac` 格式。

## 使用

从本仓库 Releases 下载 Apple Silicon 版本，解压后把 `Aboboo Community.app` 放入“应用程序”。构建采用本地临时签名，尚无 Apple 开发者签名和公证。不要关闭系统的全局安全检查。

- 打开 MP3、WAV、M4A 等系统可解码的音频；OGG 等格式取决于系统解码支持。
- 播放、暂停、拖动定位；各音轨可静音和调节音量。
- 设置 A、B 两点循环跟读；支持 0.5–2× 速度。当前变速会改变音调，尚未实现保调变速。
- 空格播放/暂停，Esc 停止，`[` 设置 A、`]` 设置 B（焦点在输入框、按钮或选择框内时不拦截键盘）。录音自动恢复 1×，录音时暂停循环，并禁止变速和定位。
- 点击“跟读录音”，点击“保存录音”结束并加入音轨。首次录音需要麦克风权限。
- “保存项目”把原音和录音一起存入 `.abmac`；“打开项目”恢复。

项目使用 JSON 和 Base64 内嵌音频，文件体积约比原始音频大三分之一，当前适合较短练习素材。不是无损编辑器，也不保证超长音频的内存表现。

如果文件在 OneDrive / iCloud 中只有云端占位，应用会提示先下载到本机。请选择下载完成的本地副本；仅看见文件名不代表内容已在本机。导入期间会显示读取或解码状态。

## 本地开发

需要 Node.js 22+、Rust stable 和 Xcode Command Line Tools。

```sh
npm ci
npm run tauri dev
npm run tauri build -- --bundles app
```

应用位于 `target/release/bundle/macos/`。

前端行为测试（文件对话框与文件读写使用模拟 IPC，录音使用模拟麦克风）：

```sh
npx playwright install chromium
npm run dev -- --host 127.0.0.1
# 另一个终端
npm test
```

可通过 `CHROME_PATH` 指定本机 Chrome 可执行文件。测试覆盖音频导入、播放暂停、录音、项目保存重开。浏览器测试不等于真实 macOS 麦克风或系统文件对话框测试；这些仍需人工验证。

## 维护范围

修复版已处理项目音频丢失、录音保存、波形反馈触发定位、播放状态与权限配置等问题。已开始加入 A–B 循环、变速和快捷键，后续优先完善真实设备验证和保调变速。欢迎提交可复现的问题，注明 macOS 版本、芯片和音频格式。

## 来源和许可

MIT，原作者版权声明保留在 [LICENSE](LICENSE)。本仓库的初始源码来自上游 main 的快照，后续修改由本仓库单独维护；与 Aboboo 官方无隶属关系。
