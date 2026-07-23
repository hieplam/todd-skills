// run.ts — CLI contract shim. The real entrypoint is cli/main.ts; this file exists because
// external callers (orchestrate-campaign's resolve-runner.sh, test-fresh-machine.sh) prove
// the runner by this exact path: plugins/tribe/scripts/runner/run.ts.
import { main } from './cli/main.ts';
export { main, parseArgs, type ParseArgsError, type ParseArgsResult } from './cli/main.ts';

if (import.meta.main) {
  main();
}
