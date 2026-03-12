# Code Mode Rules

## Project Coding Rules (Non-Obvious Only)

### Import Conventions
- **Always use `~/src/` prefix** for internal imports - Babel root-import plugin requires this exact prefix
- Example: `import Logger from '~/src/library/logger'` not `import Logger from '../library/logger'`

### Build System Gotchas
- **Use Babel, not tsc** for transpilation - the project uses Babel with custom plugins
- Source files in `src/` compile to `dist/` - never edit files in `dist/` directly
- The `.adonisrc.json` is auto-generated at runtime from `adonisrc.json` template

### Code Style Enforcement
- **No semicolons** required (Prettier config enforces this)
- **Single quotes** enforced
- **Trailing commas** required
- **120 char line width**
- ESLint explicitly allows unused variables (`@typescript-eslint/no-unused-vars: 0`)

### AdonisJS Command Pattern
Commands use decorator-based registration:
```typescript
import { BaseCommand } from '@adonisjs/ace'
import { CommandOptions } from '@adonisjs/core/build/standalone'

export default class YourCommand extends BaseCommand {
  public static commandName = 'your:command'
  public static options: CommandOptions = {}
  
  async run() {
    // Command logic
  }
}
```

### Critical File Locations
- Entry point: `src/index.ts` (Electron main process)
- Ace CLI entry: `src/ace.ts`
- Frontend: `client/` (separate Vite project)
- Static assets: `src/public/`

### No Test Framework
This project has no test infrastructure - don't attempt to add or run tests.
