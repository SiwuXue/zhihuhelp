# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Project Overview
知乎助手 - An Electron desktop app for downloading Zhihu content as EPUB e-books.

## Tech Stack
- **Main Process**: Node.js + TypeScript + Electron + AdonisJS (Ace)
- **Renderer (Client)**: React + Vite + Ant Design
- **Build**: Babel (not tsc) for transpilation
- **Package Manager**: pnpm

## Build Commands

### Root Directory (Main Process)
```bash
# Development
npm run watch          # Babel watch mode (compiles src/ -> dist/)
npm run start          # Start Electron app with --zhihuhelp-debug flag

# Build
npm run build          # Babel compile src to dist (with sourcemaps)
npm run build-without-sourcemap  # Production build (no sourcemaps)

# Package & Distribution
npm run pack           # Build + package (no installer)
npm run dist           # Build + create installer
```

### Client Directory (Frontend)
```bash
cd client
npm run dev            # Start Vite dev server
npm run build          # Build for production
```

## 本地启动（开发模式）

改完代码后，本地调试需要两个终端，按顺序启动：

1. 编译主进程（`src/` -> `dist/`，实际使用 `tsc` 编译）：

```bash
npm run build
```

2. 启动前端 Vite dev server（终端 A，长驻，监听 8080）：

```bash
npm run startgui
```

3. 启动 Electron（终端 B，长驻）：

```bash
npm run start
```

端口与顺序说明：

- `npm run start` 会以 `--zhihuhelp-debug` 启动 Electron，此时主窗口硬编码加载 `http://localhost:8080`（见 `src/index.ts`）。
- 因此必须先启动前端并让 Vite 占用 8080，再启动 Electron，否则窗口会白屏。
- 若 8080 已被其它进程占用，Vite 会自动改用 8081，导致 Electron 白屏。启动前请确保 8080 空闲（如存在残留 vite 进程，先停掉）。
- 前端代码未改动时，可直接复用已在 8080 运行的 Vite dev server，无需重复启动。

## Code Style
- **Prettier**: No semicolons, single quotes, trailing commas, 120 char line width
- **ESLint**: Disabled `@typescript-eslint/no-unused-vars` and `no-unused-vars`
- **Import Alias**: Use `~/src/` prefix for imports from src/ directory (configured in .babelrc)

## Project-Specific Conventions

### Module Path Aliases
Babel root-import plugin maps `~/src/` to `./src/`. Always use this for internal imports:
```typescript
import Logger from '~/src/library/logger'
import Config from '~/src/config/path'
```

### AdonisJS Commands
Commands are registered via AdonisJS Ace. The project uses decorators for command definition.

### Directory Structure Notes
- `src/` - Main Electron process code
- `client/` - React frontend (separate Vite project)
- `dist/` - Compiled output (gitignored)
- Command and API directories appear to use dynamic loading patterns

### No Test Framework
This project does not have automated tests configured.

## Debugging
- Electron runs with `--zhihuhelp-debug` flag by default via `npm start`
- The app generates `.adonisrc.json` at runtime from `adonisrc.json` template

## Known Issues & Solutions

### sharp Module Load Error
**Error**: `The specified module could not be found. sharp-win32-x64.node`

**Root Cause**: Node ABI version mismatch between system Node.js and Electron's Node.js.
- sharp is compiled for system Node.js ABI (e.g., v24 -> ABI v137)
- Electron uses different Node.js version (e.g., v18 -> ABI v113)
- This causes the native module to fail loading in Electron

**Solution**:
```bash
# 1. Reinstall sharp to get fresh dependencies
pnpm uninstall sharp
pnpm install sharp@0.30.7

# 2. Download libvips binaries
node node_modules/sharp/install/libvips.js

# 3. Copy DLL files
node node_modules/sharp/install/dll-copy.js

# 4. Rebuild sharp for Electron
npx electron-rebuild -f -w sharp
```

**Prevention**: Add to `package.json` scripts:
```json
"postinstall": "electron-builder install-app-deps || npx electron-rebuild"
```
