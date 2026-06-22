import { getAddress, keccak256, toUtf8Bytes, verifyMessage } from "ethers";

export const RECEIPT_VERSION = "1.0" as const;

export type ReceiptVerdict = "supported" | "unsupported" | "uncertain";
export type Hex32 = `0x${string}`;

export interface ChainAnchor {
  enabled: boolean;
  chain_id: number | null;
  contract_address: string | null;
  tx_hash: Hex32 | null;
  receipt_hash: Hex32 | null;
  evidence_hash: Hex32 | null;
  program_hash: Hex32 | null;
  subject_hash: Hex32 | null;
  score_bps: number | null;
  status: number | null;
  issuer: string | null;
  anchored_at: string | number | null;
  uri: string | null;
}

/**
 * The portable MAMV product artifact. Every field needed to identify the
 * verification run is top-level so a receipt can be stored and exchanged
 * independently of the MAMV API.
 */
export interface VerificationReceipt {
  receipt_version: typeof RECEIPT_VERSION;
  receipt_id: Hex32;
  created_at: string;
  input_hash: Hex32;
  output_hash: Hex32;
  claim_hash: Hex32;
  verdict: ReceiptVerdict;
  score: number;
  program_id: string;
  program_version: string;
  evidence_bundle_hash: Hex32;
  evidence_uri: string;
  verifier_id: string;
  signature: `0x${string}`;
  chain_anchor: ChainAnchor;
}

export interface UnsignedReceipt extends Omit<
  VerificationReceipt,
  "receipt_id" | "signature" | "chain_anchor"
> {
  chain_anchor?: ChainAnchor;
}

export interface ReceiptVerificationOptions {
  /** Map verifier_id values to Ethereum addresses. No MAMV server lookup occurs. */
  verifier_keys: Record<string, string>;
  /** Optional original artifacts. When present, their commitments are checked. */
  input?: unknown;
  output?: unknown;
  claim?: unknown;
  evidence_bundle?: unknown;
  /** Optional independently obtained chain transaction lookup. */
  chain_transaction?: { chain_id: number; tx_hash: string };
}

export interface ReceiptVerificationResult {
  valid: boolean;
  errors: string[];
  checks: {
    schema: boolean;
    receipt_id: boolean;
    signature: boolean;
    input_hash: boolean | null;
    output_hash: boolean | null;
    claim_hash: boolean | null;
    evidence_bundle_hash: boolean | null;
    chain_anchor: boolean | null;
  };
}

const HASH_32 = /^0x[0-9a-fA-F]{64}$/;
const SIGNATURE = /^0x[0-9a-fA-F]{130}$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function normalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("Canonical JSON does not support non-finite numbers");
    return value;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalize(child)]),
    );
  }
  throw new Error(`Canonical JSON does not support ${typeof value}`);
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function hashArtifact(value: unknown): Hex32 {
  return keccak256(toUtf8Bytes(canonicalize(value))) as Hex32;
}

function receiptPayload(
  receipt: UnsignedReceipt | VerificationReceipt,
): Omit<VerificationReceipt, "receipt_id" | "signature" | "chain_anchor"> {
  return {
    receipt_version: receipt.receipt_version,
    created_at: receipt.created_at,
    input_hash: receipt.input_hash,
    output_hash: receipt.output_hash,
    claim_hash: receipt.claim_hash,
    verdict: receipt.verdict,
    score: receipt.score,
    program_id: receipt.program_id,
    program_version: receipt.program_version,
    evidence_bundle_hash: receipt.evidence_bundle_hash,
    evidence_uri: receipt.evidence_uri,
    verifier_id: receipt.verifier_id,
  };
}

/** The receipt ID is the keccak256 commitment to the canonical unsigned payload. */
export function computeReceiptId(
  receipt: UnsignedReceipt | VerificationReceipt,
): Hex32 {
  return hashArtifact(receiptPayload(receipt));
}

/**
 * Build and sign a receipt. The signer callback receives the receipt_id and
 * can use a local wallet, HSM, or remote signer.
 */
export async function createReceipt(
  fields: UnsignedReceipt,
  sign: (receiptId: Hex32) => Promise<string>,
): Promise<VerificationReceipt> {
  const receipt_id = computeReceiptId(fields);
  const signature = await sign(receipt_id);
  return {
    ...receiptPayload(fields),
    receipt_id,
    signature: signature as `0x${string}`,
    chain_anchor: fields.chain_anchor ?? disabledChainAnchor(),
  };
}

export function disabledChainAnchor(): ChainAnchor {
  return {
    enabled: false,
    chain_id: null,
    contract_address: null,
    tx_hash: null,
    receipt_hash: null,
    evidence_hash: null,
    program_hash: null,
    subject_hash: null,
    score_bps: null,
    status: null,
    issuer: null,
    anchored_at: null,
    uri: null,
  };
}

export interface AnchoredRecordMetadata {
  receiptHash: Hex32;
  evidenceHash: Hex32;
  programHash: Hex32;
  subjectHash: Hex32;
  scoreBps: number | bigint;
  status: number | bigint;
  issuer: string;
  uri?: string;
}

/**
 * Public receipt verification helper for onchain receipt anchoring.
 * MAMV checks AI outputs offchain; blockchain verifies the record, not the truth of the claim.
 */
export function verifyAnchoredRecord(
  receipt: VerificationReceipt,
  record: AnchoredRecordMetadata,
): string[] {
  const errors: string[] = [];
  if (!receipt.chain_anchor.enabled)
    return ["receipt does not declare onchain receipt anchoring"];
  const anchorErrors = verifyChainAnchorFields(receipt);
  errors.push(...anchorErrors);
  const anchor = receipt.chain_anchor;
  if (anchor.receipt_hash?.toLowerCase() !== record.receiptHash.toLowerCase())
    errors.push("anchored receipt hash mismatch");
  if (anchor.evidence_hash?.toLowerCase() !== record.evidenceHash.toLowerCase())
    errors.push("anchored evidence hash mismatch");
  if (anchor.program_hash?.toLowerCase() !== record.programHash.toLowerCase())
    errors.push("anchored verification program hash mismatch");
  if (anchor.subject_hash?.toLowerCase() !== record.subjectHash.toLowerCase())
    errors.push("anchored subject/output hash mismatch");
  if (anchor.score_bps !== Number(record.scoreBps))
    errors.push("anchored score mismatch");
  if (anchor.status !== Number(record.status))
    errors.push("anchored status mismatch");
  try {
    if (
      anchor.issuer === null ||
      getAddress(anchor.issuer) !== getAddress(record.issuer)
    )
      errors.push("anchored issuer mismatch");
  } catch {
    errors.push("anchored issuer mismatch");
  }
  if (record.uri !== undefined && anchor.uri !== record.uri)
    errors.push("anchored URI mismatch");
  return errors;
}

function programHash(receipt: VerificationReceipt): Hex32 {
  return keccak256(
    toUtf8Bytes(`${receipt.program_id}@${receipt.program_version}`),
  ) as Hex32;
}

function scoreBps(receipt: VerificationReceipt): number {
  return Math.round(receipt.score * 10_000);
}

function statusCode(receipt: VerificationReceipt): number {
  return { unsupported: 0, supported: 1, uncertain: 2 }[receipt.verdict];
}

function verifyChainAnchorFields(receipt: VerificationReceipt): string[] {
  const anchor = receipt.chain_anchor;
  const errors: string[] = [];
  if (anchor.receipt_hash?.toLowerCase() !== receipt.receipt_id.toLowerCase())
    errors.push("chain_anchor receipt_hash does not match receipt_id");
  if (
    anchor.evidence_hash?.toLowerCase() !==
    receipt.evidence_bundle_hash.toLowerCase()
  )
    errors.push(
      "chain_anchor evidence_hash does not match evidence_bundle_hash",
    );
  if (anchor.program_hash?.toLowerCase() !== programHash(receipt).toLowerCase())
    errors.push(
      "chain_anchor program_hash does not match program_id and program_version",
    );
  if (anchor.subject_hash?.toLowerCase() !== receipt.output_hash.toLowerCase())
    errors.push("chain_anchor subject_hash does not match output_hash");
  if (anchor.score_bps !== scoreBps(receipt))
    errors.push("chain_anchor score_bps does not match score");
  if (anchor.status !== statusCode(receipt))
    errors.push("chain_anchor status does not match verdict");
  return errors;
}

export function verifyReceipt(
  receipt: unknown,
  options: ReceiptVerificationOptions,
): ReceiptVerificationResult {
  const errors = validateReceipt(receipt);
  const checks: ReceiptVerificationResult["checks"] = {
    schema: errors.length === 0,
    receipt_id: false,
    signature: false,
    input_hash: null,
    output_hash: null,
    claim_hash: null,
    evidence_bundle_hash: null,
    chain_anchor: null,
  };

  if (errors.length > 0) return { valid: false, errors, checks };
  const value = receipt as VerificationReceipt;

  checks.receipt_id =
    computeReceiptId(value).toLowerCase() === value.receipt_id.toLowerCase();
  if (!checks.receipt_id)
    errors.push("receipt_id does not match the canonical receipt payload");

  const expectedSigner = options.verifier_keys[value.verifier_id];
  if (!expectedSigner) {
    errors.push(
      `No independently trusted public key for verifier_id "${value.verifier_id}"`,
    );
  } else {
    try {
      checks.signature =
        getAddress(verifyMessage(value.receipt_id, value.signature)) ===
        getAddress(expectedSigner);
    } catch {
      checks.signature = false;
    }
    if (!checks.signature)
      errors.push("signature was not produced by the trusted verifier key");
  }

  const artifacts: Array<
    [
      keyof Pick<
        ReceiptVerificationResult["checks"],
        "input_hash" | "output_hash" | "claim_hash" | "evidence_bundle_hash"
      >,
      unknown,
      Hex32,
    ]
  > = [
    ["input_hash", options.input, value.input_hash],
    ["output_hash", options.output, value.output_hash],
    ["claim_hash", options.claim, value.claim_hash],
    [
      "evidence_bundle_hash",
      options.evidence_bundle,
      value.evidence_bundle_hash,
    ],
  ];
  for (const [name, artifact, expected] of artifacts) {
    if (artifact !== undefined) {
      checks[name] =
        hashArtifact(artifact).toLowerCase() === expected.toLowerCase();
      if (!checks[name])
        errors.push(`${name} does not match the supplied artifact`);
    }
  }

  if (value.chain_anchor.enabled) {
    if (options.chain_transaction) {
      checks.chain_anchor =
        options.chain_transaction.chain_id === value.chain_anchor.chain_id &&
        options.chain_transaction.tx_hash.toLowerCase() ===
          value.chain_anchor.tx_hash?.toLowerCase();
      if (!checks.chain_anchor)
        errors.push("chain_anchor does not match the supplied transaction");
    } else {
      errors.push(
        "enabled chain_anchor requires independently obtained transaction data",
      );
    }

    if (checks.chain_anchor !== false) {
      const anchorErrors = verifyChainAnchorFields(value);
      if (anchorErrors.length > 0) {
        checks.chain_anchor = false;
        errors.push(...anchorErrors);
      }
    }
  } else {
    checks.chain_anchor = true;
  }

  return { valid: errors.length === 0, errors, checks };
}

export function validateReceipt(receipt: unknown): string[] {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    return ["Receipt must be an object"];
  }
  const r = receipt as Record<string, unknown>;
  const errors: string[] = [];
  const allowed = new Set([
    "receipt_version",
    "receipt_id",
    "created_at",
    "input_hash",
    "output_hash",
    "claim_hash",
    "verdict",
    "score",
    "program_id",
    "program_version",
    "evidence_bundle_hash",
    "evidence_uri",
    "verifier_id",
    "signature",
    "chain_anchor",
  ]);
  for (const key of Object.keys(r))
    if (!allowed.has(key)) errors.push(`Unknown field: ${key}`);

  if (r.receipt_version !== RECEIPT_VERSION)
    errors.push(`receipt_version must be "${RECEIPT_VERSION}"`);
  for (const field of [
    "receipt_id",
    "input_hash",
    "output_hash",
    "claim_hash",
    "evidence_bundle_hash",
  ]) {
    if (typeof r[field] !== "string" || !HASH_32.test(r[field] as string)) {
      errors.push(`${field} must be a 0x-prefixed 32-byte hex string`);
    }
  }
  if (
    typeof r.created_at !== "string" ||
    Number.isNaN(Date.parse(r.created_at)) ||
    !r.created_at.endsWith("Z")
  ) {
    errors.push("created_at must be an ISO 8601 UTC timestamp");
  }
  if (
    !["supported", "unsupported", "uncertain"].includes(r.verdict as string)
  ) {
    errors.push("verdict must be supported, unsupported, or uncertain");
  }
  if (
    typeof r.score !== "number" ||
    !Number.isFinite(r.score) ||
    r.score < 0 ||
    r.score > 1
  ) {
    errors.push("score must be a number between 0 and 1");
  }
  for (const field of ["program_id", "verifier_id"]) {
    if (typeof r[field] !== "string" || r[field] === "")
      errors.push(`${field} is required`);
  }
  if (
    typeof r.program_version !== "string" ||
    !SEMVER.test(r.program_version)
  ) {
    errors.push("program_version must be semantic versioning");
  }
  if (
    typeof r.evidence_uri !== "string" ||
    !/^(ipfs|https):\/\//.test(r.evidence_uri)
  ) {
    errors.push("evidence_uri must use ipfs:// or https://");
  }
  if (typeof r.signature !== "string" || !SIGNATURE.test(r.signature)) {
    errors.push("signature must be a 65-byte 0x-prefixed hex string");
  }

  const anchor = r.chain_anchor as Record<string, unknown> | undefined;
  const anchorFields = [
    "enabled",
    "chain_id",
    "contract_address",
    "tx_hash",
    "receipt_hash",
    "evidence_hash",
    "program_hash",
    "subject_hash",
    "score_bps",
    "status",
    "issuer",
    "anchored_at",
    "uri",
  ];
  if (!anchor || typeof anchor !== "object" || Array.isArray(anchor)) {
    errors.push("chain_anchor is required");
  } else if (Object.keys(anchor).some((key) => !anchorFields.includes(key))) {
    errors.push("chain_anchor contains an unknown field");
  } else if (anchor.enabled === false) {
    for (const field of anchorFields.filter((field) => field !== "enabled")) {
      if (anchor[field] !== null)
        errors.push(`disabled chain_anchor must have null ${field}`);
    }
  } else if (
    anchor.enabled !== true ||
    !Number.isInteger(anchor.chain_id) ||
    (anchor.chain_id as number) <= 0
  ) {
    errors.push("enabled chain_anchor requires a positive chain_id");
  } else {
    for (const field of [
      "tx_hash",
      "receipt_hash",
      "evidence_hash",
      "program_hash",
      "subject_hash",
    ]) {
      if (
        typeof anchor[field] !== "string" ||
        !HASH_32.test(anchor[field] as string)
      ) {
        errors.push(
          `chain_anchor ${field} must be a 0x-prefixed 32-byte hex string`,
        );
      }
    }
    for (const field of ["contract_address", "issuer"]) {
      try {
        getAddress(anchor[field] as string);
      } catch {
        errors.push(`chain_anchor ${field} must be an Ethereum address`);
      }
    }
    if (
      !Number.isInteger(anchor.score_bps) ||
      (anchor.score_bps as number) < 0 ||
      (anchor.score_bps as number) > 10_000
    )
      errors.push("chain_anchor score_bps must be 0..10000");
    if (
      !Number.isInteger(anchor.status) ||
      (anchor.status as number) < 0 ||
      (anchor.status as number) > 255
    )
      errors.push("chain_anchor status must be 0..255");
    if (
      !(
        typeof anchor.anchored_at === "string" ||
        typeof anchor.anchored_at === "number"
      )
    )
      errors.push("chain_anchor anchored_at is required");
    if (!(anchor.uri === null || typeof anchor.uri === "string"))
      errors.push("chain_anchor uri must be null or a string");
  }
  return errors;
}
