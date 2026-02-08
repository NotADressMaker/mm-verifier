import { runAuditorCli } from './auditor';

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case 'auditor':
      await runAuditorCli(rest);
      break;
    default:
      process.stderr.write('Usage: mmv <auditor> [args]\n');
      process.exit(1);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
