import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { VerifiedOutputRegistry } from '../typechain-types';

describe('VerifiedOutputRegistry', () => {
  let registry: VerifiedOutputRegistry;
  let owner: SignerWithAddress;
  let verifier: SignerWithAddress;
  let builder: SignerWithAddress;
  let other: SignerWithAddress;

  // Sample data
  const taskId = ethers.keccak256(ethers.toUtf8Bytes('task-1'));
  const programId = ethers.keccak256(ethers.toUtf8Bytes('mmv-factual-qa'));
  const inputHash = ethers.keccak256(ethers.toUtf8Bytes('input content'));
  const outputHash = ethers.keccak256(ethers.toUtf8Bytes('output content'));
  const bundleHash = ethers.keccak256(ethers.toUtf8Bytes('bundle json'));
  const bundleUri = 'ipfs://QmTestBundle123';
  const scoreBps = 8500; // 85%
  const verdict = true;

  // EIP-712 domain
  const DOMAIN_NAME = 'VerifiedOutputRegistry';
  const DOMAIN_VERSION = '1';

  // EIP-712 type
  const VERIFIED_OUTPUT_TYPE = {
    VerifiedOutput: [
      { name: 'taskId', type: 'bytes32' },
      { name: 'programId', type: 'bytes32' },
      { name: 'inputHash', type: 'bytes32' },
      { name: 'outputHash', type: 'bytes32' },
      { name: 'scoreBps', type: 'uint16' },
      { name: 'verdict', type: 'bool' },
      { name: 'bundleHash', type: 'bytes32' },
      { name: 'finalizedAt', type: 'uint64' },
    ],
  };

  async function signVerifiedOutput(
    signer: SignerWithAddress,
    data: {
      taskId: string;
      programId: string;
      inputHash: string;
      outputHash: string;
      scoreBps: number;
      verdict: boolean;
      bundleHash: string;
      finalizedAt: number;
    }
  ): Promise<string> {
    const domain = {
      name: DOMAIN_NAME,
      version: DOMAIN_VERSION,
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await registry.getAddress(),
    };

    return signer.signTypedData(domain, VERIFIED_OUTPUT_TYPE, data);
  }

  beforeEach(async () => {
    [owner, verifier, builder, other] = await ethers.getSigners();

    const VerifiedOutputRegistry = await ethers.getContractFactory('VerifiedOutputRegistry');
    registry = await VerifiedOutputRegistry.deploy();
    await registry.waitForDeployment();

    // Add verifier as authorized
    await registry.addVerifier(verifier.address);
  });

  describe('Deployment', () => {
    it('should set correct owner', async () => {
      expect(await registry.owner()).to.equal(owner.address);
    });

    it('should initialize with rewards disabled', async () => {
      expect(await registry.rewardsEnabled()).to.be.false;
    });

    it('should have zero total records initially', async () => {
      expect(await registry.totalRecords()).to.equal(0);
    });
  });

  describe('Verifier Management', () => {
    it('should allow owner to add verifier', async () => {
      await registry.addVerifier(other.address);
      expect(await registry.isVerifier(other.address)).to.be.true;
    });

    it('should allow owner to remove verifier', async () => {
      await registry.removeVerifier(verifier.address);
      expect(await registry.isVerifier(verifier.address)).to.be.false;
    });

    it('should reject non-owner adding verifier', async () => {
      await expect(
        registry.connect(other).addVerifier(other.address)
      ).to.be.revertedWithCustomError(registry, 'OwnableUnauthorizedAccount');
    });
  });

  describe('Output Registration', () => {
    it('should register valid output with authorized signature', async () => {
      const finalizedAt = Math.floor(Date.now() / 1000);

      const signature = await signVerifiedOutput(verifier, {
        taskId,
        programId,
        inputHash,
        outputHash,
        scoreBps,
        verdict,
        bundleHash,
        finalizedAt,
      });

      const tx = await registry.connect(builder).registerOutput(
        taskId,
        programId,
        inputHash,
        outputHash,
        scoreBps,
        verdict,
        bundleHash,
        bundleUri,
        signature
      );

      await expect(tx)
        .to.emit(registry, 'OutputRecorded')
        .withArgs(
          // recordId is dynamic
          (value: any) => typeof value === 'string' && value.startsWith('0x'),
          taskId,
          programId,
          builder.address,
          scoreBps,
          verdict,
          bundleHash,
          bundleUri
        );

      expect(await registry.totalRecords()).to.equal(1);
    });

    it('should reject output with unauthorized signature', async () => {
      const finalizedAt = Math.floor(Date.now() / 1000);

      // Sign with unauthorized signer
      const signature = await signVerifiedOutput(other, {
        taskId,
        programId,
        inputHash,
        outputHash,
        scoreBps,
        verdict,
        bundleHash,
        finalizedAt,
      });

      await expect(
        registry.connect(builder).registerOutput(
          taskId,
          programId,
          inputHash,
          outputHash,
          scoreBps,
          verdict,
          bundleHash,
          bundleUri,
          signature
        )
      ).to.be.revertedWith('Invalid verifier signature');
    });

    it('should reject output with score > 100%', async () => {
      const finalizedAt = Math.floor(Date.now() / 1000);

      const signature = await signVerifiedOutput(verifier, {
        taskId,
        programId,
        inputHash,
        outputHash,
        scoreBps: 10001, // Invalid
        verdict,
        bundleHash,
        finalizedAt,
      });

      await expect(
        registry.connect(builder).registerOutput(
          taskId,
          programId,
          inputHash,
          outputHash,
          10001,
          verdict,
          bundleHash,
          bundleUri,
          signature
        )
      ).to.be.revertedWith('Score exceeds 100%');
    });

    it('should reject empty bundle URI', async () => {
      const finalizedAt = Math.floor(Date.now() / 1000);

      const signature = await signVerifiedOutput(verifier, {
        taskId,
        programId,
        inputHash,
        outputHash,
        scoreBps,
        verdict,
        bundleHash,
        finalizedAt,
      });

      await expect(
        registry.connect(builder).registerOutput(
          taskId,
          programId,
          inputHash,
          outputHash,
          scoreBps,
          verdict,
          bundleHash,
          '', // Empty URI
          signature
        )
      ).to.be.revertedWith('Empty bundleUri');
    });
  });

  describe('Query Functions', () => {
    let recordId: string;

    beforeEach(async () => {
      const finalizedAt = Math.floor(Date.now() / 1000);

      const signature = await signVerifiedOutput(verifier, {
        taskId,
        programId,
        inputHash,
        outputHash,
        scoreBps,
        verdict,
        bundleHash,
        finalizedAt,
      });

      const tx = await registry.connect(builder).registerOutput(
        taskId,
        programId,
        inputHash,
        outputHash,
        scoreBps,
        verdict,
        bundleHash,
        bundleUri,
        signature
      );

      const receipt = await tx.wait();
      const event = receipt?.logs.find((log: any) => {
        try {
          const parsed = registry.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          return parsed?.name === 'OutputRecorded';
        } catch {
          return false;
        }
      });

      if (event) {
        const parsed = registry.interface.parseLog({
          topics: event.topics as string[],
          data: event.data,
        });
        recordId = parsed!.args.recordId;
      }
    });

    it('should get output by record ID', async () => {
      const output = await registry.getOutput(recordId);

      expect(output.taskId).to.equal(taskId);
      expect(output.programId).to.equal(programId);
      expect(output.inputHash).to.equal(inputHash);
      expect(output.outputHash).to.equal(outputHash);
      expect(output.scoreBps).to.equal(scoreBps);
      expect(output.verdict).to.equal(verdict);
      expect(output.bundleHash).to.equal(bundleHash);
      expect(output.bundleUri).to.equal(bundleUri);
      expect(output.submitter).to.equal(builder.address);
    });

    it('should check record existence', async () => {
      expect(await registry.recordExists(recordId)).to.be.true;
      expect(await registry.recordExists(ethers.ZeroHash)).to.be.false;
    });

    it('should get records by task ID', async () => {
      const records = await registry.getRecordsByTask(taskId);
      expect(records.length).to.equal(1);
      expect(records[0]).to.equal(recordId);
    });

    it('should get program statistics', async () => {
      const stats = await registry.getProgramStats(programId);

      expect(stats.totalRecords).to.equal(1);
      expect(stats.passedRecords).to.equal(1); // verdict = true
      expect(stats.cumulativeScore).to.equal(scoreBps);
    });

    it('should get builder statistics', async () => {
      const stats = await registry.getBuilderStats(builder.address);

      expect(stats.totalSubmissions).to.equal(1);
      expect(stats.qualitySubmissions).to.equal(1); // score >= 8000
    });

    it('should paginate program records', async () => {
      // Add more records
      for (let i = 0; i < 5; i++) {
        const newTaskId = ethers.keccak256(ethers.toUtf8Bytes(`task-${i + 2}`));
        const finalizedAt = Math.floor(Date.now() / 1000);

        const signature = await signVerifiedOutput(verifier, {
          taskId: newTaskId,
          programId, // Same program
          inputHash,
          outputHash,
          scoreBps,
          verdict,
          bundleHash: ethers.keccak256(ethers.toUtf8Bytes(`bundle-${i}`)),
          finalizedAt,
        });

        await registry.connect(builder).registerOutput(
          newTaskId,
          programId,
          inputHash,
          outputHash,
          scoreBps,
          verdict,
          ethers.keccak256(ethers.toUtf8Bytes(`bundle-${i}`)),
          bundleUri,
          signature
        );
      }

      // Query with pagination
      const [records1, total1] = await registry.getRecordsByProgram(programId, 0, 3);
      expect(records1.length).to.equal(3);
      expect(total1).to.equal(6);

      const [records2, total2] = await registry.getRecordsByProgram(programId, 3, 10);
      expect(records2.length).to.equal(3);
      expect(total2).to.equal(6);
    });
  });

  describe('Rewards', () => {
    it('should configure rewards', async () => {
      const baseReward = ethers.parseEther('0.001');
      const qualityMultiplier = 15000; // 1.5x
      const minScore = 5000; // 50%

      await expect(
        registry.configureRewards(true, baseReward, qualityMultiplier, minScore)
      )
        .to.emit(registry, 'RewardsConfigured')
        .withArgs(true, baseReward, qualityMultiplier, minScore);

      expect(await registry.rewardsEnabled()).to.be.true;

      const [br, qm, ms] = await registry.getRewardConfig();
      expect(br).to.equal(baseReward);
      expect(qm).to.equal(qualityMultiplier);
      expect(ms).to.equal(minScore);
    });

    it('should deposit to reward pool', async () => {
      const depositAmount = ethers.parseEther('1.0');

      await registry.depositRewardPool({ value: depositAmount });

      expect(await registry.rewardPoolBalance()).to.equal(depositAmount);
    });

    it('should accrue rewards for builders when enabled', async () => {
      const baseReward = ethers.parseEther('0.001');

      // Configure and fund rewards
      await registry.configureRewards(true, baseReward, 15000, 5000);
      await registry.depositRewardPool({ value: ethers.parseEther('1.0') });

      const finalizedAt = Math.floor(Date.now() / 1000);

      const signature = await signVerifiedOutput(verifier, {
        taskId,
        programId,
        inputHash,
        outputHash,
        scoreBps, // 8500 - high quality
        verdict,
        bundleHash,
        finalizedAt,
      });

      await registry.connect(builder).registerOutput(
        taskId,
        programId,
        inputHash,
        outputHash,
        scoreBps,
        verdict,
        bundleHash,
        bundleUri,
        signature
      );

      // Check pending rewards (base * 1.5 for quality)
      const pending = await registry.pendingRewards(builder.address);
      const expectedReward = (baseReward * 15000n) / 10000n;
      expect(pending).to.equal(expectedReward);
    });

    it('should allow builders to claim rewards', async () => {
      const baseReward = ethers.parseEther('0.001');

      await registry.configureRewards(true, baseReward, 15000, 5000);
      await registry.depositRewardPool({ value: ethers.parseEther('1.0') });

      const finalizedAt = Math.floor(Date.now() / 1000);

      const signature = await signVerifiedOutput(verifier, {
        taskId,
        programId,
        inputHash,
        outputHash,
        scoreBps,
        verdict,
        bundleHash,
        finalizedAt,
      });

      await registry.connect(builder).registerOutput(
        taskId,
        programId,
        inputHash,
        outputHash,
        scoreBps,
        verdict,
        bundleHash,
        bundleUri,
        signature
      );

      const pendingBefore = await registry.pendingRewards(builder.address);
      const balanceBefore = await ethers.provider.getBalance(builder.address);

      const tx = await registry.connect(builder).claimRewards();
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const balanceAfter = await ethers.provider.getBalance(builder.address);
      const pendingAfter = await registry.pendingRewards(builder.address);

      expect(pendingAfter).to.equal(0);
      expect(balanceAfter).to.equal(balanceBefore + pendingBefore - gasUsed);
    });

    it('should reject claim with no pending rewards', async () => {
      await expect(
        registry.connect(builder).claimRewards()
      ).to.be.revertedWith('No pending rewards');
    });
  });

  describe('Batch Registration', () => {
    it('should register multiple outputs in batch', async () => {
      const count = 5;
      const taskIds: string[] = [];
      const programIds: string[] = [];
      const inputHashes: string[] = [];
      const outputHashes: string[] = [];
      const scoresBps: number[] = [];
      const verdicts: boolean[] = [];
      const bundleHashes: string[] = [];
      const bundleUris: string[] = [];
      const signatures: string[] = [];

      for (let i = 0; i < count; i++) {
        const tId = ethers.keccak256(ethers.toUtf8Bytes(`batch-task-${i}`));
        const pId = ethers.keccak256(ethers.toUtf8Bytes('batch-program'));
        const bHash = ethers.keccak256(ethers.toUtf8Bytes(`batch-bundle-${i}`));
        const finalizedAt = Math.floor(Date.now() / 1000);

        taskIds.push(tId);
        programIds.push(pId);
        inputHashes.push(inputHash);
        outputHashes.push(outputHash);
        scoresBps.push(7000 + i * 500);
        verdicts.push(true);
        bundleHashes.push(bHash);
        bundleUris.push(`ipfs://QmBatch${i}`);

        const sig = await signVerifiedOutput(verifier, {
          taskId: tId,
          programId: pId,
          inputHash,
          outputHash,
          scoreBps: 7000 + i * 500,
          verdict: true,
          bundleHash: bHash,
          finalizedAt,
        });
        signatures.push(sig);
      }

      const tx = await registry.connect(builder).registerOutputBatch(
        taskIds,
        programIds,
        inputHashes,
        outputHashes,
        scoresBps,
        verdicts,
        bundleHashes,
        bundleUris,
        signatures
      );

      await tx.wait();

      expect(await registry.totalRecords()).to.equal(count);
    });

    it('should reject batch with mismatched arrays', async () => {
      await expect(
        registry.connect(builder).registerOutputBatch(
          [taskId],
          [programId, programId], // Mismatched length
          [inputHash],
          [outputHash],
          [scoreBps],
          [verdict],
          [bundleHash],
          [bundleUri],
          ['0x']
        )
      ).to.be.revertedWith('Array length mismatch');
    });

    it('should reject batch exceeding max size', async () => {
      const oversizedArray = Array(51).fill(taskId); // MAX_BATCH_SIZE = 50

      await expect(
        registry.connect(builder).registerOutputBatch(
          oversizedArray,
          oversizedArray,
          oversizedArray,
          oversizedArray,
          Array(51).fill(scoreBps),
          Array(51).fill(verdict),
          oversizedArray,
          Array(51).fill(bundleUri),
          Array(51).fill('0x')
        )
      ).to.be.revertedWith('Invalid batch size');
    });
  });

  describe('Admin Functions', () => {
    it('should allow owner to withdraw reward pool', async () => {
      const amount = ethers.parseEther('1.0');
      await registry.depositRewardPool({ value: amount });

      const balanceBefore = await ethers.provider.getBalance(owner.address);

      const tx = await registry.withdrawRewardPool(amount);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const balanceAfter = await ethers.provider.getBalance(owner.address);

      expect(balanceAfter).to.equal(balanceBefore + amount - gasUsed);
      expect(await registry.rewardPoolBalance()).to.equal(0);
    });

    it('should reject non-owner withdrawing reward pool', async () => {
      await registry.depositRewardPool({ value: ethers.parseEther('1.0') });

      await expect(
        registry.connect(other).withdrawRewardPool(ethers.parseEther('1.0'))
      ).to.be.revertedWithCustomError(registry, 'OwnableUnauthorizedAccount');
    });

    it('should reject withdrawing more than balance', async () => {
      await registry.depositRewardPool({ value: ethers.parseEther('1.0') });

      await expect(
        registry.withdrawRewardPool(ethers.parseEther('2.0'))
      ).to.be.revertedWith('Insufficient balance');
    });
  });
});
