# Debug Mode Rules

## Project Debug Rules (Non-Obvious Only)

### Debug Flag
- Electron runs with `--zhihuhelp-debug` flag by default when using `npm start`
- This flag enables debug logging and dev tools

### Build Watch Mode
- Use `npm run watch` for development - Babel will auto-recompile on changes
- Must restart Electron manually after code changes (no hot reload for main process)

### Common Debug Issues

#### Import Path Errors
If you see module not found errors, check:
- Import uses `~/src/` prefix (not relative paths like `../`)
- File exists in `src/` directory (not `dist/`)

#### AdonisJS Command Not Found
Commands are auto-discovered from `src/command/` - ensure:
- Command file exports default class extending `BaseCommand`
- `static commandName` is defined
- File is in `src/command/` subdirectory

#### Frontend Not Loading
- Client is a separate Vite project in `client/` directory
- Run `cd client && npm run dev` separately for frontend development
- Main process serves built files from `gui/dist/`

#### Build Artifacts
- `dist/` - Compiled main process code (delete and rebuild if weird issues occur)
- `gui/dist/` - Built frontend (created by `npm run buildgui`)
- `release/` - Packaged app output

### Database
- Uses SQLite via Knex.js
- Database file location controlled by `PathConfig` in `src/config/path`

### Logging
- Logger utility in `src/library/logger`
- Check console output when `--zhihuhelp-debug` flag is active
