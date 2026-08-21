# CLAUDE.md

This file provides guidance for Claude when working with the 知乎助手 (Zhihu Help) project.

## Project Overview

知乎助手 is an Electron desktop application for downloading Zhihu (知乎) content and exporting it to various formats including EPUB, HTML, Markdown, and PDF.

## Quick Start

```bash
# Install dependencies
pnpm install

# Build backend
pnpm run build

# Build frontend
cd client && pnpm run build

# Start the application
pnpm start
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

## Architecture

### Tech Stack
- **Main Process**: Node.js + TypeScript + Electron + AdonisJS (Ace)
- **Renderer (Client)**: React + Vite + Ant Design
- **Build**: Babel (not tsc) for transpilation
- **Package Manager**: pnpm

### Directory Structure
```
zhihuhelp/
├── src/              # Main Electron process code
│   ├── command/      # AdonisJS commands for fetch/generate
│   ├── config/       # Configuration files
│   ├── constant/     # Constants
│   ├── library/      # Utility libraries
│   ├── model/        # Database models
│   └── type/         # TypeScript type definitions
├── client/           # React frontend (Vite project)
│   └── src/
├── dist/             # Compiled output (gitignored)
└── ...
```

## Development Guidelines

### Build Commands

**Root Directory (Main Process)**:
```bash
npm run watch          # Babel watch mode
npm run build          # Compile with sourcemaps
npm run start          # Start Electron app
```

**Client Directory (Frontend)**:
```bash
cd client
npm run dev            # Vite dev server
npm run build          # Production build
```

### Code Style
- **Prettier**: No semicolons, single quotes, trailing commas, 120 char line width
- **Import Alias**: Use `~/src/` prefix for imports from src/ directory

### Adding New Export Formats

1. Add format constant in `src/constant/task_config.ts`
2. Add type definition in `src/type/task_config.d.ts`
3. Create generator class in `src/command/generate/library/`
4. Update `src/command/generate/customer.ts` to call the generator
5. Add frontend UI in `client/src/page/home/component/customer_task/index.tsx`
6. Update frontend types in `client/src/resource/type/task_config.d.ts`

### Adding New Configuration Options

1. Add type definition in `src/type/task_config.d.ts` (Type_Date_Range)
2. Add default value in `src/constant/task_config.ts` (Const_Default_Config)
3. Add to frontend form state in `client/src/page/home/component/customer_task/state/index.ts`
4. Add UI component in `client/src/page/home/component/customer_task/index.tsx`
5. Update util functions in `client/src/page/home/component/customer_task/library/util.ts`
6. Implement logic in `src/command/generate/customer.ts`

## Common Issues

### sharp Module Load Error
If you encounter `The specified module could not be found. sharp-win32-x64.node`:

```bash
pnpm uninstall sharp
pnpm install sharp@0.30.7
node node_modules/sharp/install/libvips.js
node node_modules/sharp/install/dll-copy.js
npx electron-rebuild -f -w sharp
```

## Key Features

- **Export Formats**: EPUB, HTML, Markdown, PDF
- **Content Types**: Answers, Articles, Pins, Collections, Topics, Columns
- **Filters**: Date range, Image quality, Auto-split by volume
- **Output Directory**: `知乎助手输出的电子书/`

## License

MIT License - Based on [zhihuhelp](https://github.com/SiwuXue/zhihuhelp)
