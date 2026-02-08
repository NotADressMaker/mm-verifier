import fs from 'fs/promises';
import { ethers } from 'ethers';
import { programRegistry } from '../services/programRegistry';
import {
  buildProgramContext,
  computeEvidenceHash,
  loadEvidenceBundle,
  assertScoreBps,
  verifyEvidenceHash,
} from './auditorCore';
import { AuditorChainClient, parseStatusFilter } from './auditorClient';
import { AuditorCommand } from './auditorParser';

export type AuditorDependencies = {
  client: AuditorChainClient;
  allowNetwork: boolean;
};

export async function executeAuditorCommand(
  command: AuditorCommand,
  deps: AuditorDependencies
): Promise<unknown> {
  switch (command.kind) {
    case 'list-disputes': {
      const status = parseStatusFilter(command.status);
      const disputes = await deps.client.listDisputes(status);
      return {
        total: disputes.length,
        disputes,
      };
    }
    case 'inspect': {
      const details = await deps.client.getDisputeDetails(command.disputeId);
      if (!details) {
        throw new Error(`Dispute ${command.disputeId} not found`);
      }
      const report = {
        dispute: details,
      };
      if (command.outFile) {
        await fs.writeFile(command.outFile, JSON.stringify(report, null, 2));
      }
      return report;
    }
    case 'run': {
      const bundle = await loadEvidenceBundle(command.bundle, {
        allowRemote: deps.allowNetwork,
      });
      const programSpec = command.program.split('@');
      if (programSpec.length !== 2) {
        throw new Error('Program spec must be id@version');
      }
      const [programId, programVersion] = programSpec;
      const record = programRegistry.resolveProgram(programId, programVersion);
      const context = buildProgramContext(bundle, {
        programHash: record.hash,
        contractAddress: process.env.DISPUTE_LADDER_ADDRESS ?? ethers.ZeroAddress,
        bundleUri: command.bundleUri,
      });
      const receipt = await programRegistry.runProgram(bundle, context, programId, programVersion);
      const report = {
        disputeId: command.disputeId,
        bundleHash: computeEvidenceHash(bundle),
        receipt,
      };
      if (command.outFile) {
        await fs.writeFile(command.outFile, JSON.stringify(report, null, 2));
      }
      return report;
    }
    case 'submit': {
      assertScoreBps(command.scoreBps);

      const dispute = await deps.client.getDisputeDetails(command.disputeId);
      if (!dispute) {
        throw new Error(`Dispute ${command.disputeId} not found`);
      }

      if (command.bundle) {
        const bundle = await loadEvidenceBundle(command.bundle, {
          allowRemote: deps.allowNetwork,
        });
        const computed = computeEvidenceHash(bundle);
        verifyEvidenceHash({
          computed,
          expected: command.evidenceHash,
          chainExpected: dispute.bundleHash,
        });
      }

      const verdictWinner = command.verdict === 'ACCEPT' ? 2 : 1;
      const rationaleHash =
        command.rationaleHash ?? ethers.keccak256(ethers.toUtf8Bytes('mmv-auditor'));

      if (command.dryRun) {
        return {
          disputeId: command.disputeId,
          verdict: command.verdict,
          scoreBps: command.scoreBps,
          evidenceHash: command.evidenceHash,
          dryRun: true,
        };
      }

      const txHash = await deps.client.submitAuditVote({
        disputeId: command.disputeId,
        scoreBps: command.scoreBps,
        evidenceHash: command.evidenceHash,
        vote: {
          winner: verdictWinner,
          invalidBranchCount: 0,
          fabricationProven: false,
          winningEvidenceTier: 2,
          rationaleHash,
        },
      });

      return {
        disputeId: command.disputeId,
        txHash,
      };
    }
    default:
      throw new Error('Unsupported command');
  }
}
