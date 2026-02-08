import { parseAuditorArgs } from './auditorParser';
import { createAuditorClient } from './auditorClient';
import { executeAuditorCommand } from './auditorCommands';

export async function runAuditorCli(args: string[]): Promise<void> {
  const command = parseAuditorArgs(args);
  const client = createAuditorClient();
  const allowNetwork = process.env.MMV_AUDITOR_ALLOW_NETWORK === 'true';

  const result = await executeAuditorCommand(command, {
    client,
    allowNetwork,
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  runAuditorCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
