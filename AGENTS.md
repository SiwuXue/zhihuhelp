# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Project Overview
知乎助手 - An Electron desktop app for downloading Zhihu content as EPUB e-books.

## Tech Stack
- **Main Process**: Node.js + TypeScript + Electron + AdonisJS (Ace)
- **Renderer (Client)**: React + Vite + Ant Design
- **Build**: TypeScript (tsc) for transpilation
- **Package Manager**: pnpm

## Build Commands

### Root Directory (Main Process)
```bash
# Development
npm run watch          # TypeScript watch mode (tsc -w, compiles src/ -> dist/)
npm run start          # Start Electron app with --zhihuhelp-debug flag

# Build
npm run build          # TypeScript compile src to dist (with sourcemaps)
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

- `npm run start` 会以 `--zhihuhelp-debug` 启动 Electron，此时主窗口会自动探测 `8080-8089` 范围内正在运行的 Vite dev server 并加载（见 `src/index.ts` 的 `asyncGetDevServerUrl`）。
- 因此只需先启动前端、再启动 Electron 即可；即使 8080 被其它进程占用，Vite 自动改用 8081 后也能被正常识别，不会白屏。
- 若未启动前端（探测范围内没有 Vite 服务），会回退到默认的 8080 端口，此时窗口会白屏，属预期行为。
- 前端代码未改动时，可直接复用已在运行的 Vite dev server，无需重复启动。

## Code Style
- **Prettier**: No semicolons, single quotes, trailing commas, 120 char line width
- **ESLint**: Disabled `@typescript-eslint/no-unused-vars` and `no-unused-vars`
- **Import**: 主进程内部使用相对路径导入（`../../config/request`）；tsconfig `paths` 将 `~/src/` 映射到 `src/`，前端 Vite 侧同样配置了 `~/src` 别名

## Project-Specific Conventions

### Module Path Aliases
主进程代码使用相对路径导入即可（构建为 tsc，未使用 Babel root-import）：
```typescript
import Logger from '../../library/logger'
import PathConfig from '../../config/path'
```
前端项目（`client/`）中可使用 Vite 配置的 `~/src/` 别名。

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
