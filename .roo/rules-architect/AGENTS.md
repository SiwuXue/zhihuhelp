# Architect Mode Rules

## Project Architecture Rules (Non-Obvious Only)

### System Architecture
```
┌─────────────────────────────────────────────────────────┐
│  Electron Main Process (Node.js + AdonisJS Ace)         │
│  ├─ src/index.ts       - Entry point, window management │
│  ├─ src/command/       - CLI commands (dynamic load)    │
│  ├─ src/api/           - API clients (batch/single)     │
│  ├─ src/library/       - Core utilities, EPUB gen       │
│  └─ src/config/        - Path, request configs          │
├─────────────────────────────────────────────────────────┤
│  Renderer Process (React + Vite)                        │
│  └─ client/src/        - UI components, state mgmt      │
└─────────────────────────────────────────────────────────┘
```

### Non-Standard Patterns

#### Dynamic Command Loading
AdonisJS Ace auto-discovers commands from `src/command/` - no manual registration needed. This is why the directory appears empty but commands still work.

#### Babel-based Build (Not TSC)
TypeScript is transpiled via Babel with custom plugins:
- Decorator support (`@babel/plugin-proposal-decorators` with legacy mode)
- Root import plugin for `~/src/` aliases
- React JSX transformation

#### Dual Build Process
1. Babel compiles `src/` → `dist/` (main process)
2. Vite builds `client/` → `gui/dist/` (renderer)
3. Electron packages both together

#### Custom EPUB Generation
EPUB generation is custom-built in `src/library/epub/` - not using a standard npm package. Understand this before modifying export functionality.

#### Zhihu API Encryption
Custom encryption layer in `src/library/zhihu_encrypt/` handles Zhihu's API authentication requirements.

### Database Architecture
- SQLite via Knex.js query builder
- Schema managed through Knex migrations (if any)
- Database file path configured in `src/config/path`

### State Management
- Main process: No formal state management, uses plain objects
- Renderer (client): Uses Valtio for state management (check `client/package.json`)

### Critical Dependencies
- `@adonisjs/ace` - CLI framework with decorator-based commands
- `sharp` - Image processing for EPUB generation
- `sqlite3` + `knex` - Database layer
- `electron-builder` - Packaging and distribution

### Extension Points
- New commands: Add to `src/command/` following Ace conventions
- New API clients: Add to `src/api/batch/` or `src/api/single/`
- New config types: Extend `src/type/task_config.d.ts`
