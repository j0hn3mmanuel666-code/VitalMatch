// Compatibility entry point. Read-only unless --apply --backup-confirmed is explicit.
import { migrationCli } from './scripts/migrate-schema.js';
await migrationCli();
