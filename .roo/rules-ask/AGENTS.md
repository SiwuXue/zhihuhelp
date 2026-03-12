# Ask Mode Rules

## Project Documentation Rules (Non-Obvious Only)

### Code Organization Quirks
- `src/command/` and `src/api/` directories exist but may be empty - commands are loaded dynamically by AdonisJS Ace
- `src/model/` is also empty - models may be defined elsewhere or not used
- `src/type/` contains TypeScript type definitions (`.d.ts` files)

### Dual Package Structure
This is effectively two projects:
1. **Root**: Electron main process (Node.js + TypeScript + AdonisJS)
2. **client/**: React frontend (Vite + Ant Design)

They have separate `package.json` files and build independently.

### Documentation Sources
- Main README: `README.md` (Chinese language)
- Type definitions: `src/type/` directory
- Config examples: `demo.config.json`, `demo.customer_task_config.json`
- Architecture notes: `ts学习笔记.md` (TypeScript learning notes)

### Key Concepts
- **Task Config**: Central configuration format defined in `src/type/task_config.d.ts`
- **EPUB Generation**: Core functionality using custom EPUB library in `src/library/epub/`
- **Zhihu API**: Custom encryption handling in `src/library/zhihu_encrypt/`

### No API Documentation
The project doesn't have formal API docs - read the type definitions and example config files to understand data structures.

### Legacy Notes
- `tslint.json` exists but project uses ESLint (tslint is legacy)
- `.yarnrc` exists but project uses pnpm (check `pnpm-lock.yaml`)
