# Y7st Portable Shell (Y7api)

This is an independent launcher and reverse-proxy wrapper. The upstream Infinite-Canvas directory remains external and is never modified.

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

## Run from source

```bash
node src/launcher.js  # 启动器名称：Y7st，品牌：Y7api
```

Environment variables:

- `INFINITE_CANVAS_DIR`: upstream directory; default is `../Infinite-Canvas`
- `UPSTREAM_PORT`: default `3000`
- `SHELL_PORT`: default `8080`
- `NO_BROWSER=1`: do not open the browser automatically

## Upgrade

Stop the launcher, back up `Infinite-Canvas/data`, `assets`, `API`, and `history.json`, replace only the external `Infinite-Canvas` directory, and run the same EXE again. The shell binaries and shell/public directory remain unchanged.
