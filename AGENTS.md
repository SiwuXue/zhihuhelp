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
