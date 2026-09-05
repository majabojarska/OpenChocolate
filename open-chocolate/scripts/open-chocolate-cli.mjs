// CLI entrypoint: resolves the real logic (src/lib/cli-lib.ts) and executes
// argv. Node runs TypeScript natively (type stripping), so this .mjs shim
// just forwards; kept as .mjs so scripts/* stays out of vue-tsc.
import { argv, exit } from 'node:process';
import { run } from '../src/lib/cli-lib.ts';

const code = await run(argv.slice(2), undefined, undefined);
exit(code);
