import { createCipheriv, createDecipheriv, createECDH, createHash, randomBytes } from 'crypto';
import { Wallet, verifyMessage } from 'ethers';
import { canonicalizeBundle, computeBundleHash } from './evidenceReplay';
import { EvidenceBundle, BundleKeyEnvelope, VerifiedPlaintextStatement } from './types';

export type EncryptedPayload = {
  alg: 'aes-256-gcm';
  iv: string;
  tag: string;
  ciphertext: string;
};

function toHex(value: Buffer): string {
  return `0x${value.toString('hex')}`;
}

function fromHex(value: string): Buffer {
  return Buffer.from(value.replace(/^0x/, ''), 'hex');
}

function deriveSharedKey(
  privateKey: Buffer,
  publicKey: Buffer
): Buffer {
  const ecdh = createECDH('secp256k1');
  ecdh.setPrivateKey(privateKey);
  const secret = ecdh.computeSecret(publicKey);
  return createHash('sha256').update(secret).digest();
}

function encryptSymmetricKeyForRecipient(
  symmetricKey: Buffer,
  recipientPubkey: string
): BundleKeyEnvelope {
  const ecdh = createECDH('secp256k1');
  ecdh.generateKeys();
  const recipientKey = fromHex(recipientPubkey);
  const sharedKey = createHash('sha256').update(ecdh.computeSecret(recipientKey)).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', sharedKey, iv);
  const ciphertext = Buffer.concat([cipher.update(symmetricKey), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    recipient_pubkey: recipientPubkey,
    enc_key: toHex(ciphertext),
    alg: 'secp256k1-ecies-aes-256-gcm',
    iv: toHex(iv),
    tag: toHex(tag),
    ephemeral_pubkey: toHex(ecdh.getPublicKey()),
  };
}

function decryptSymmetricKey(
  envelope: BundleKeyEnvelope,
  recipientPrivateKey: string
): Buffer {
  const privateKey = fromHex(recipientPrivateKey);
  const sharedKey = deriveSharedKey(privateKey, fromHex(envelope.ephemeral_pubkey));
  const decipher = createDecipheriv('aes-256-gcm', sharedKey, fromHex(envelope.iv));
  decipher.setAuthTag(fromHex(envelope.tag));
  return Buffer.concat([
    decipher.update(fromHex(envelope.enc_key)),
    decipher.final(),
  ]);
}

function redactBundle(bundle: EvidenceBundle): EvidenceBundle {
  const redacted = JSON.parse(JSON.stringify(bundle)) as EvidenceBundle;
  redacted.model_runs = redacted.model_runs.map((run) => ({
    ...run,
    raw_output: '',
  }));

  if ('replay' in redacted && redacted.replay?.transcript) {
    redacted.replay.transcript.messages = undefined;
    redacted.replay.transcript.outputs = undefined;
    redacted.replay.transcript.privacy_redacted = true;
  }

  return redacted;
}

export function encryptEvidenceBundle(params: {
  bundle: EvidenceBundle;
  recipients: string[];
}): {
  encryptedBundle: EvidenceBundle;
  encryptedPayload: EncryptedPayload;
  encryptedPayloadHash: `0x${string}`;
  plaintextCommitmentHash: `0x${string}`;
} {
  const plaintextCommitmentHash = computeBundleHash(params.bundle, 'keccak256');
  const plaintextBytes = canonicalizeBundle(params.bundle);

  const symmetricKey = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', symmetricKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintextBytes), cipher.final()]);
  const tag = cipher.getAuthTag();

  const encryptedPayload: EncryptedPayload = {
    alg: 'aes-256-gcm',
    iv: toHex(iv),
    tag: toHex(tag),
    ciphertext: ciphertext.toString('base64'),
  };

  const payloadBytes = Buffer.from(JSON.stringify(encryptedPayload), 'utf8');
  const encryptedPayloadHash = `0x${createHash('sha256').update(payloadBytes).digest('hex')}` as `0x${string}`;

  const keyEnvelopes = params.recipients.map((recipient) =>
    encryptSymmetricKeyForRecipient(symmetricKey, recipient)
  );

  const encryptedBundle = redactBundle(params.bundle);
  const bundleWithPrivacy = encryptedBundle as EvidenceBundle & {
    privacy_mode?: boolean;
    encrypted_payload_hash?: `0x${string}`;
    plaintext_commitment_hash?: `0x${string}`;
    key_envelopes?: BundleKeyEnvelope[];
  };
  bundleWithPrivacy.privacy_mode = true;
  bundleWithPrivacy.encrypted_payload_hash = encryptedPayloadHash;
  bundleWithPrivacy.plaintext_commitment_hash = plaintextCommitmentHash;
  bundleWithPrivacy.key_envelopes = keyEnvelopes;

  return {
    encryptedBundle,
    encryptedPayload,
    encryptedPayloadHash,
    plaintextCommitmentHash,
  };
}

export function decryptEvidenceBundle(params: {
  encryptedBundle: EvidenceBundle;
  encryptedPayload: EncryptedPayload;
  recipientPrivateKey: string;
}): EvidenceBundle {
  const bundleWithPrivacy = params.encryptedBundle as EvidenceBundle & {
    key_envelopes?: BundleKeyEnvelope[];
    plaintext_commitment_hash?: `0x${string}`;
  };

  const envelope = bundleWithPrivacy.key_envelopes?.find((entry: BundleKeyEnvelope) => {
    const ecdh = createECDH('secp256k1');
    ecdh.setPrivateKey(fromHex(params.recipientPrivateKey));
    const pubkey = toHex(ecdh.getPublicKey());
    return entry.recipient_pubkey.toLowerCase() === pubkey.toLowerCase();
  });

  if (!envelope) {
    throw new Error('No matching key envelope for recipient');
  }

  const symmetricKey = decryptSymmetricKey(envelope, params.recipientPrivateKey);
  const decipher = createDecipheriv(
    'aes-256-gcm',
    symmetricKey,
    fromHex(params.encryptedPayload.iv)
  );
  decipher.setAuthTag(fromHex(params.encryptedPayload.tag));
  const ciphertext = Buffer.from(params.encryptedPayload.ciphertext, 'base64');
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const bundle = JSON.parse(plaintext.toString('utf8')) as EvidenceBundle;

  const commitment = computeBundleHash(bundle, 'keccak256');
  if (bundleWithPrivacy.plaintext_commitment_hash !== commitment) {
    throw new Error('Plaintext commitment hash mismatch');
  }

  return bundle;
}

export function buildVerifiedPlaintextStatement(
  plaintextCommitmentHash: string
): string {
  return `I verified plaintext evidence bundle hash = ${plaintextCommitmentHash}`;
}

export async function signVerifiedPlaintextStatement(
  wallet: Wallet,
  plaintextCommitmentHash: string
): Promise<VerifiedPlaintextStatement> {
  const statement = buildVerifiedPlaintextStatement(plaintextCommitmentHash);
  const signature = await wallet.signMessage(statement);
  return {
    plaintext_commitment_hash: plaintextCommitmentHash,
    signer: wallet.address,
    signature,
    signed_at: Math.floor(Date.now() / 1000),
    statement,
  };
}

export function verifyVerifiedPlaintextStatement(
  statement: VerifiedPlaintextStatement
): boolean {
  const recovered = verifyMessage(statement.statement, statement.signature);
  return recovered.toLowerCase() === statement.signer.toLowerCase();
}
