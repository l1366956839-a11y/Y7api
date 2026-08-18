# Y7st Portable Shell (Y7api)

这是一个独立的启动器与反向代理套壳，用于适配/封装开源项目
[hero8152/Infinite-Canvas](https://github.com/hero8152/Infinite-Canvas)。
上游 Infinite-Canvas 目录保持外部、不被本仓库追踪的产物改动记录；外壳负责品牌入口与代理转发。

> ⚠️ **授权与合规（务必阅读）**
> 本壳会内嵌整个上游项目。上游许可明确：**仅限个人/公司内部使用，禁止商用**（商用须获上游作者
> hero8152 授权），**二次开发必须保持开源**，并**署名原作者**。本壳同样遵守该约定。
> 请阅读 [`LICENSE`](LICENSE) 与 [`ATTRIBUTION.md`](ATTRIBUTION.md) 后再分发。合规红线：不能商用、不能闭源、不能不署名。

## Layout

```text
release/Y7st-Portable/
  Y7st.exe
  启动Y7st.bat
  shell/proxy.exe
  shell/public/
  Infinite-Canvas/              # upstream project, supplied separately
```

## Build

```bash
npm install
npm run build
```

The build requires network access to download the pkg runtime. The current machine has Node.js/npm but no .NET SDK; the launcher is therefore implemented in Node.js and compiled to a Windows EXE.

### 同步上游（钉版本）

```bash
node scripts/sync-upstream.js                        # 同步上游 main (HEAD)
node scripts/sync-upstream.js --ref <commit-sha|tag> # 钉到指定 commit / tag
node scripts/sync-upstream.js --include-python  # 同时复制内置 Python 运行时，用于打包物化
set UPSTREAM_REF=v1.2.0 && node scripts/sync-upstream.js
```

同步会：
- 把上游 ref 解析为 **commit SHA** 并写入 `dist/Y7st-Portable/Infinite-Canvas/UPSTREAM_COMMIT`（便于回滚/复现/追溯）；
- 保留 `conflictKeep` 名单里本壳自行改造过的上游文件（`main.py`、`static/js/canvas.js`、`smart-canvas.js`、`static/online.html`）；
- 失败时非零退出，不留下"看似成功"的产物。

> `--include-python`：默认同步跳过上游 `python/` 运行时以保持轻量。打包一个**开箱即用（含内置 Python 运行时与依赖）**的 EXE 前，先用它物化完整上游，并给 `dist/.../python` 内的 Python 装依赖：
> `python.exe -m pip install -r dist/Y7st-Portable/Infinite-Canvas/requirements.txt websockets`，然后再跑 release/build。

## 版本来源

壳的运行版本统一在 `src/build-info.js`（`EMBED_VERSION`）。升级请只改这一处；
`launcher.js` / `electron-main.js` / `window-controls.js` / `scripts/release-portable.js` 均从它读取，避免版本漂移。

## Run from source

```bash
node src/launcher.js  # 启动器名称：Y7st，品牌：Y7api
```

Environment variables:

- `INFINITE_CANVAS_DIR`: upstream directory; default is `../Infinite-Canvas`
- `UPSTREAM_PORT`: default `3000`
- `SHELL_PORT`: default `8080`
- `NO_BROWSER=1`: do not open the browser automatically

## Test

```bash
npm test
```

`test/upstream-contract.test.js` 校验壳对上游的依赖（健康检查接口 + 品牌图层选择器覆盖度），
在上游同步后跑一遍能尽早发现壳与上游的失配。

## Upgrade

Stop the launcher, back up `Infinite-Canvas/data`, `assets`, `API`, and `history.json`, replace only the external `Infinite-Canvas` directory, and run the same EXE again. The shell binaries and shell/public directory remain unchanged.
