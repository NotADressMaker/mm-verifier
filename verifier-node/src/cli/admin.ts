import { purgeEncryptedEvidence, parseDurationToMs } from '../evidence/evidenceStorage';

export async function runAdminCli(args: string[]): Promise<void> {
  const [command, ...rest] = args;

  if (command !== 'purge-evidence') {
    process.stderr.write('Usage: mamv admin purge-evidence --older-than <7d>\n');
    process.exit(1);
  }

  const olderThanIndex = rest.findIndex((value) => value === '--older-than');
  if (olderThanIndex === -1 || !rest[olderThanIndex + 1]) {
    process.stderr.write('Usage: mamv admin purge-evidence --older-than <7d>\n');
    process.exit(1);
  }

  const olderThan = rest[olderThanIndex + 1];
  const olderThanMs = parseDurationToMs(olderThan);
  const result = purgeEncryptedEvidence({ older_than_ms: olderThanMs });

  process.stdout.write(
    `Purged encrypted evidence. Removed=${result.removed}, Remaining=${result.remaining}\n`
  );
}
