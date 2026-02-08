import { ethers } from 'ethers';
import { getRpcUrl } from '../../../shared/env';

export type DisputeStatusName =
  | 'NONE'
  | 'OPEN'
  | 'ROUND_ACTIVE'
  | 'ROUND_RESOLVED'
  | 'FINALIZED';

export type DisputeSummary = {
  disputeId: number;
  status: DisputeStatusName;
  bundleId: string;
  challenger: string;
  verifier: string;
  currentLevel: number;
  roundIndex: number;
  challengeDeadline: number;
  responseDeadline: number;
  bundleHash: string;
  bundleUriHash: string;
  receiptHash: string;
  programHash: string;
};

export type RoundSummary = {
  level: number;
  phase: number;
  jurors: string[];
  evidenceDeadline: number;
  voteDeadline: number;
  appealDeadline: number;
  votesCast: number;
  winner: number;
};

export type DisputeDetails = DisputeSummary & {
  round: RoundSummary | null;
};

const DISPUTE_LADDER_ABI = [
  'function nextDisputeId() view returns (uint256)',
  'function disputes(uint256) view returns (uint8 status, bytes32 bundleId, uint32 branchId, uint8 faultType, address challenger, address verifier, uint256 createdAt, uint256 challengeBond, uint256 defenseBond, uint8 currentLevel, uint8 roundIndex)',
  'function getDisputeMetadata(uint256) view returns (bytes32 bundleHash, bytes32 bundleUriHash, bytes32 receiptHash, bytes32 programHash, uint64 challengeDeadline, uint64 responseDeadline, bool responded, bytes32 responseHash)',
  'function getRound(uint256,uint8) view returns (uint8 level,uint8 phase,address[] jurors,uint64 evidenceDeadline,uint64 voteDeadline,uint64 appealDeadline,uint32 votesCast,uint8 winner)',
  'function submitAuditVote(uint256,(uint8,uint16,bool,uint8,bytes32),uint16,bytes32)'
];

const STATUS_NAMES: DisputeStatusName[] = [
  'NONE',
  'OPEN',
  'ROUND_ACTIVE',
  'ROUND_RESOLVED',
  'FINALIZED',
];

export class AuditorChainClient {
  private readonly provider: ethers.JsonRpcProvider;
  private readonly signer?: ethers.Wallet;
  private readonly contract: ethers.Contract;

  constructor({
    rpcUrl,
    disputeLadderAddress,
    privateKey,
  }: {
    rpcUrl: string;
    disputeLadderAddress: string;
    privateKey?: string;
  }) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.signer = privateKey ? new ethers.Wallet(privateKey, this.provider) : undefined;
    this.contract = new ethers.Contract(disputeLadderAddress, DISPUTE_LADDER_ABI, this.signer ?? this.provider);
  }

  async listDisputes(status?: DisputeStatusName): Promise<DisputeSummary[]> {
    const nextId = await this.contract.nextDisputeId();
    const results: DisputeSummary[] = [];

    for (let i = 1; i < Number(nextId); i += 1) {
      const summary = await this.getDisputeSummary(i);
      if (!summary) continue;
      if (status && summary.status !== status) continue;
      results.push(summary);
    }

    return results;
  }

  async getDisputeSummary(disputeId: number): Promise<DisputeSummary | null> {
    const dispute = await this.contract.disputes(disputeId);
    if (!dispute || dispute.status === undefined) return null;

    const metadata = await this.contract.getDisputeMetadata(disputeId);
    return {
      disputeId,
      status: STATUS_NAMES[Number(dispute.status)],
      bundleId: dispute.bundleId,
      challenger: dispute.challenger,
      verifier: dispute.verifier,
      currentLevel: Number(dispute.currentLevel),
      roundIndex: Number(dispute.roundIndex),
      challengeDeadline: Number(metadata.challengeDeadline),
      responseDeadline: Number(metadata.responseDeadline),
      bundleHash: metadata.bundleHash,
      bundleUriHash: metadata.bundleUriHash,
      receiptHash: metadata.receiptHash,
      programHash: metadata.programHash,
    };
  }

  async getDisputeDetails(disputeId: number): Promise<DisputeDetails | null> {
    const summary = await this.getDisputeSummary(disputeId);
    if (!summary) return null;
    let round: RoundSummary | null = null;
    if (summary.roundIndex >= 0) {
      const roundData = await this.contract.getRound(disputeId, summary.roundIndex);
      round = {
        level: Number(roundData.level),
        phase: Number(roundData.phase),
        jurors: roundData.jurors,
        evidenceDeadline: Number(roundData.evidenceDeadline),
        voteDeadline: Number(roundData.voteDeadline),
        appealDeadline: Number(roundData.appealDeadline),
        votesCast: Number(roundData.votesCast),
        winner: Number(roundData.winner),
      };
    }

    return {
      ...summary,
      round,
    };
  }

  async submitAuditVote(params: {
    disputeId: number;
    vote: {
      winner: number;
      invalidBranchCount: number;
      fabricationProven: boolean;
      winningEvidenceTier: number;
      rationaleHash: string;
    };
    scoreBps: number;
    evidenceHash: string;
  }): Promise<string> {
    if (!this.signer) {
      throw new Error('AUDITOR_PRIVATE_KEY is required for submit');
    }

    const tx = await this.contract.submitAuditVote(
      params.disputeId,
      [
        params.vote.winner,
        params.vote.invalidBranchCount,
        params.vote.fabricationProven,
        params.vote.winningEvidenceTier,
        params.vote.rationaleHash,
      ],
      params.scoreBps,
      params.evidenceHash
    );
    const receipt = await tx.wait();
    return receipt.hash;
  }
}

export function createAuditorClient(): AuditorChainClient {
  const disputeLadderAddress = process.env.DISPUTE_LADDER_ADDRESS;
  if (!disputeLadderAddress) {
    throw new Error('DISPUTE_LADDER_ADDRESS not configured');
  }

  return new AuditorChainClient({
    rpcUrl: getRpcUrl(),
    disputeLadderAddress,
    privateKey:
      process.env.AUDITOR_PRIVATE_KEY ||
      process.env.WALLET_PRIVATE_KEY ||
      process.env.PRIVATE_KEY,
  });
}

export function parseStatusFilter(status?: string): DisputeStatusName | undefined {
  if (!status) return undefined;
  const normalized = status.toUpperCase();
  if (STATUS_NAMES.includes(normalized as DisputeStatusName)) {
    return normalized as DisputeStatusName;
  }
  throw new Error(`Unknown status: ${status}`);
}
