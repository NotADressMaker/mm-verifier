import { runAuditorCli } from './auditor';
import { encryptBundleCli, decryptBundleCli } from './privacy';
import { runBenchmarkCli } from './benchmark';
import { runAdminCli } from './admin';
import { readFileSync } from 'fs';
import { VerificationPipeline } from '../ovp/core/pipeline';
import { jsonReport } from '../ovp/reports/jsonReport';

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case 'auditor':
      await runAuditorCli(rest);
      break;
    case 'encrypt-bundle':
      await encryptBundleCli(rest);
      break;
    case 'decrypt-bundle':
      await decryptBundleCli(rest);
      break;
    case 'benchmark': {
      const [subcommand, ...subrest] = rest;
      if (subcommand === 'run') {
        await runBenchmarkCli(subrest);
        break;
      }
      process.stderr.write('Usage: mamv benchmark run --bundles <path> --out <out>\n');
      process.exit(1);
      break;
    }
    case 'admin':
      await runAdminCli(rest);
      break;
    case 'verify': {
      const [file] = rest;
      if (!file) throw new Error('Usage: mamv verify FILE');
      const run = await new VerificationPipeline().verify({ text: readFileSync(file, 'utf8'), inputType: 'file' });
      process.stdout.write(jsonReport(run));
      break;
    }
    case 'verify-claim': {
      const [claim] = rest;
      if (!claim) throw new Error('Usage: mamv verify-claim "CLAIM"');
      process.stdout.write(jsonReport(await new VerificationPipeline().verify({ text: claim, inputType: 'claim' })));
      break;
    }
    case 'verify-argument': {
      const premises = rest.filter((value, index) => rest[index - 1] === '--premise');
      const conclusion = rest[rest.indexOf('--conclusion') + 1];
      if (!premises.length || !conclusion) throw new Error('Usage: mamv verify-argument --premise "..." --conclusion "..."');
      process.stdout.write(jsonReport(await new VerificationPipeline().verify({ text: `${premises.join('. ')}. Therefore, ${conclusion}.`, inputType: 'argument', profile: 'quick-chat' })));
      break;
    }
    default:
      process.stderr.write(
        'Usage: mamv <verify|verify-claim|verify-argument|auditor|encrypt-bundle|decrypt-bundle|benchmark|admin> [args]\n'
      );
      process.exit(1);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
