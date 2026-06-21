import { runAuditorCli } from './auditor';
import { encryptBundleCli, decryptBundleCli } from './privacy';
import { runBenchmarkCli } from './benchmark';
import { runAdminCli } from './admin';

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
    default:
      process.stderr.write(
        'Usage: mamv <auditor|encrypt-bundle|decrypt-bundle|benchmark|admin> [args]\n'
      );
      process.exit(1);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
