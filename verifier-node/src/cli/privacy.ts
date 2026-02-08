import fs from 'fs/promises';
import path from 'path';
import { decryptEvidenceBundle, encryptEvidenceBundle } from '../../../shared/privacyMode';
import { EvidenceBundle } from '../../../shared/types';

function parseArgs(args: string[]): Record<string, string[]> {
  const parsed: Record<string, string[]> = {};
  let currentKey: string | null = null;

  for (const arg of args) {
    if (arg.startsWith('--')) {
      currentKey = arg.slice(2);
      parsed[currentKey] = [];
    } else if (currentKey) {
      parsed[currentKey].push(arg);
    }
  }

  return parsed;
}

export async function encryptBundleCli(args: string[]): Promise<void> {
  const [bundlePath] = args.filter((arg) => !arg.startsWith('--'));
  if (!bundlePath) {
    throw new Error('Usage: mmv encrypt-bundle <bundle.json> --recipients <pubkey...> --out <bundle.encrypted.json>');
  }

  const parsed = parseArgs(args);
  const recipients = parsed.recipients ?? [];
  if (recipients.length === 0) {
    throw new Error('At least one recipient public key is required');
  }

  const outPath = parsed.out?.[0] ?? `${bundlePath}.encrypted.json`;
  const payloadPath =
    parsed['payload-out']?.[0] ?? `${outPath.replace(/\.json$/, '')}.payload.json`;

  const raw = await fs.readFile(bundlePath, 'utf8');
  const bundle = JSON.parse(raw) as EvidenceBundle;

  const encrypted = encryptEvidenceBundle({ bundle, recipients });
  encrypted.encryptedBundle.encrypted_payload_uri = path.relative(
    path.dirname(outPath),
    payloadPath
  );

  await fs.writeFile(payloadPath, JSON.stringify(encrypted.encryptedPayload, null, 2), 'utf8');
  await fs.writeFile(outPath, JSON.stringify(encrypted.encryptedBundle, null, 2), 'utf8');

  process.stdout.write(`Encrypted bundle written to ${outPath}\n`);
  process.stdout.write(`Encrypted payload written to ${payloadPath}\n`);
}

export async function decryptBundleCli(args: string[]): Promise<void> {
  const [bundlePath] = args.filter((arg) => !arg.startsWith('--'));
  if (!bundlePath) {
    throw new Error('Usage: mmv decrypt-bundle <bundle.encrypted.json> --key <hex-private-key> [--out bundle.json]');
  }

  const parsed = parseArgs(args);
  const key = parsed.key?.[0];
  if (!key) {
    throw new Error('Recipient private key is required via --key');
  }

  const outPath = parsed.out?.[0] ?? `${bundlePath}.decrypted.json`;
  const raw = await fs.readFile(bundlePath, 'utf8');
  const encryptedBundle = JSON.parse(raw) as EvidenceBundle;
  const payloadUri = encryptedBundle.encrypted_payload_uri;

  if (!payloadUri) {
    throw new Error('encrypted_payload_uri missing from bundle');
  }

  const payloadPath = payloadUri.startsWith('file://')
    ? payloadUri.replace('file://', '')
    : path.resolve(path.dirname(bundlePath), payloadUri);
  const payloadRaw = await fs.readFile(payloadPath, 'utf8');
  const encryptedPayload = JSON.parse(payloadRaw);

  const decrypted = decryptEvidenceBundle({
    encryptedBundle,
    encryptedPayload,
    recipientPrivateKey: key,
  });

  await fs.writeFile(outPath, JSON.stringify(decrypted, null, 2), 'utf8');
  process.stdout.write(`Decrypted bundle written to ${outPath}\n`);
}
