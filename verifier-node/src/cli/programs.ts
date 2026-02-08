import { programRegistry } from '../services/programRegistry';

function parseSpec(spec?: string): { id: string; version: string } {
  if (!spec) {
    throw new Error('Program spec required (id@version)');
  }
  const [id, version] = spec.split('@');
  if (!id || !version) {
    throw new Error('Program spec must be in the form id@version');
  }
  return { id, version };
}

async function run() {
  const [command, spec] = process.argv.slice(2);

  switch (command) {
    case 'list': {
      const programs = programRegistry.listPrograms();
      process.stdout.write(JSON.stringify({ total: programs.length, programs }, null, 2));
      break;
    }
    case 'verify': {
      const { id, version } = parseSpec(spec);
      const result = programRegistry.verifyProgram(id, version);
      process.stdout.write(JSON.stringify(result, null, 2));
      break;
    }
    case 'hash': {
      const { id, version } = parseSpec(spec);
      const hash = programRegistry.hashProgram(id, version);
      process.stdout.write(hash);
      break;
    }
    default: {
      process.stderr.write('Usage: programs <list|verify|hash> [id@version]\n');
      process.exit(1);
    }
  }
}

run().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
