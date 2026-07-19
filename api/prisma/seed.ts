/**
 * Prisma Database Seed Script
 *
 * Seeds the database with initial data for development and testing:
 * - Sample verification tasks
 * - Sample evaluations
 * - Sample disputes
 * - Webhook subscriptions
 * - Verifier statistics
 * - Benchmark results
 * - Calibration model
 */

import { PrismaClient, TaskStatus, DisputeStatus, WebhookEvent } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...\n');

  // Two tenants and a shared user demonstrate server-side membership switching.
  const alpha = await prisma.organization.upsert({ where: { slug: 'acme-labs' }, update: {}, create: { slug: 'acme-labs', name: 'Acme Labs' } });
  const beta = await prisma.organization.upsert({ where: { slug: 'northstar' }, update: {}, create: { slug: 'northstar', name: 'Northstar Research', plan: 'PRO' } });
  const users = await Promise.all(['owner@example.test', 'admin@example.test', 'member@example.test', 'viewer@example.test'].map((email) => prisma.user.upsert({ where: { email }, update: {}, create: { externalId: email, email } })));
  await prisma.organizationMembership.createMany({ data: [
    { organizationId: alpha.id, userId: users[0].id, role: 'OWNER' }, { organizationId: beta.id, userId: users[0].id, role: 'OWNER' },
    { organizationId: alpha.id, userId: users[1].id, role: 'ADMIN' }, { organizationId: alpha.id, userId: users[2].id, role: 'MEMBER' }, { organizationId: alpha.id, userId: users[3].id, role: 'VIEWER' },
  ], skipDuplicates: true });

  // ============================================================================
  // 1. CALIBRATION MODEL
  // ============================================================================
  console.log('📊 Creating calibration model...');

  const calibrationModel = await prisma.calibrationModel.create({
    data: {
      version: 1,
      bins: [
        { minScore: 0.0, maxScore: 0.1, count: 50, correctCount: 5, calibratedProbability: 0.05 },
        { minScore: 0.1, maxScore: 0.2, count: 45, correctCount: 10, calibratedProbability: 0.12 },
        { minScore: 0.2, maxScore: 0.3, count: 40, correctCount: 15, calibratedProbability: 0.22 },
        { minScore: 0.3, maxScore: 0.4, count: 35, correctCount: 18, calibratedProbability: 0.34 },
        { minScore: 0.4, maxScore: 0.5, count: 30, correctCount: 20, calibratedProbability: 0.45 },
        { minScore: 0.5, maxScore: 0.6, count: 28, correctCount: 22, calibratedProbability: 0.56 },
        { minScore: 0.6, maxScore: 0.7, count: 32, correctCount: 26, calibratedProbability: 0.67 },
        { minScore: 0.7, maxScore: 0.8, count: 38, correctCount: 32, calibratedProbability: 0.78 },
        { minScore: 0.8, maxScore: 0.9, count: 42, correctCount: 38, calibratedProbability: 0.88 },
        { minScore: 0.9, maxScore: 1.0, count: 60, correctCount: 57, calibratedProbability: 0.95 },
      ],
      sampleCount: 400,
      ece: 0.021, // Expected Calibration Error
      mce: 0.035, // Max Calibration Error
      isActive: true,
    },
  });
  console.log(`✓ Created calibration model (version ${calibrationModel.version}, ECE: ${calibrationModel.ece})\n`);

  // ============================================================================
  // 2. BENCHMARK RESULTS
  // ============================================================================
  console.log('📈 Creating benchmark results...');

  const benchmark = await prisma.benchmarkResult.create({
    data: {
      datasetName: 'factual-qa',
      datasetVersion: '1.0',
      accuracy: 0.95,
      precision: 0.94,
      recall: 0.96,
      f1Score: 0.95,
      calibrationError: 0.021,
      byCategory: {
        'factual-qa': { accuracy: 0.98, precision: 0.97, recall: 0.99, f1Score: 0.98 },
        'calculation': { accuracy: 0.92, precision: 0.90, recall: 0.94, f1Score: 0.92 },
        'logical': { accuracy: 0.89, precision: 0.88, recall: 0.90, f1Score: 0.89 },
        'coding': { accuracy: 0.93, precision: 0.92, recall: 0.94, f1Score: 0.93 },
      },
      config: {
        weights: { citation: 0.3, consensus: 0.4, sourceCheck: 0.2, logicalConsistency: 0.1 },
        models: ['gpt-4', 'claude-3-opus', 'gemini-pro'],
        calibrationEnabled: true,
      },
      ablationResults: {
        withoutCitations: { accuracy: 0.88, f1Score: 0.87 },
        withoutConsensus: { accuracy: 0.91, f1Score: 0.90 },
        withoutSourceCheck: { accuracy: 0.93, f1Score: 0.92 },
      },
    },
  });
  console.log(`✓ Created benchmark result (dataset: ${benchmark.datasetName}, accuracy: ${benchmark.accuracy})\n`);

  // ============================================================================
  // 3. VERIFIER STATS
  // ============================================================================
  console.log('👥 Creating verifier statistics...');

  const verifiers = [
    {
      address: '0x1234567890123456789012345678901234567890',
      tasksCompleted: 150,
      tasksDisputed: 5,
      disputesWon: 4,
      disputesLost: 1,
      accuracyRate: 0.97,
      avgCalibrationError: 0.018,
      avgLatencyMs: 1200,
      totalEarned: '5000000000000000000', // 5 ETH
      totalSlashed: '100000000000000000',  // 0.1 ETH
      currentBond: '10000000000000000000', // 10 ETH
      lastTaskAt: new Date('2025-01-10T20:00:00Z'),
    },
    {
      address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      tasksCompleted: 89,
      tasksDisputed: 3,
      disputesWon: 2,
      disputesLost: 1,
      accuracyRate: 0.94,
      avgCalibrationError: 0.025,
      avgLatencyMs: 1500,
      totalEarned: '2800000000000000000', // 2.8 ETH
      totalSlashed: '50000000000000000',   // 0.05 ETH
      currentBond: '5000000000000000000',  // 5 ETH
      lastTaskAt: new Date('2025-01-10T19:30:00Z'),
    },
  ];

  for (const verifier of verifiers) {
    await prisma.verifierStats.create({ data: verifier });
  }
  console.log(`✓ Created ${verifiers.length} verifier stat records\n`);

  // ============================================================================
  // 4. API KEYS
  // ============================================================================
  console.log('🔑 Creating API keys...');

  const apiKeys = [
    {
      key: crypto.createHash('sha256').update('test-key-1').digest('hex'),
      name: 'Development Key',
      owner: '0x1234567890123456789012345678901234567890',
      enabled: true,
      rateLimit: 100,
      requestCount: 245,
      lastUsedAt: new Date('2025-01-10T18:00:00Z'),
    },
    {
      key: crypto.createHash('sha256').update('test-key-2').digest('hex'),
      name: 'Testing Key',
      owner: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      enabled: true,
      rateLimit: 50,
      requestCount: 89,
      lastUsedAt: new Date('2025-01-10T17:30:00Z'),
    },
  ];

  for (const apiKey of apiKeys) {
    await prisma.apiKey.create({ data: apiKey });
  }
  console.log(`✓ Created ${apiKeys.length} API keys\n`);

  // ============================================================================
  // 5. VERIFICATION TASKS
  // ============================================================================
  console.log('📝 Creating verification tasks...');

  const task1 = await prisma.verificationTask.create({
    data: {
      prompt: 'What is the capital of France?',
      response: 'The capital of France is Paris. Paris has been the capital since 508 AD and is located in the north-central part of the country.',
      taskHash: crypto.createHash('sha256').update('task1').digest('hex'),
      blockchainTaskId: '1',
      txHash: '0x1234...task1',
      status: TaskStatus.COMPLETED,
      score: 9800, // 98/100
      confidence: 0.99,
      verdict: 'RELIABLE',
      requester: '0x1111111111111111111111111111111111111111',
      organizationId: alpha.id,
      verifier: '0x1234567890123456789012345678901234567890',
      evidenceCid: 'QmTaskEvidence1',
      explainabilityCid: 'QmExplain1',
    },
  });

  const task2 = await prisma.verificationTask.create({
    data: {
      prompt: 'What is 2 + 2?',
      response: 'The answer is 5.',
      taskHash: crypto.createHash('sha256').update('task2').digest('hex'),
      blockchainTaskId: '2',
      txHash: '0x1234...task2',
      status: TaskStatus.DISPUTED,
      score: 1000, // 10/100
      confidence: 0.95,
      verdict: 'UNRELIABLE',
      requester: '0x2222222222222222222222222222222222222222',
      organizationId: beta.id,
      verifier: '0x1234567890123456789012345678901234567890',
      evidenceCid: 'QmTaskEvidence2',
      explainabilityCid: 'QmExplain2',
    },
  });

  const task3 = await prisma.verificationTask.create({
    data: {
      prompt: 'Explain quantum computing in simple terms.',
      response: 'Quantum computing uses quantum bits (qubits) that can exist in multiple states simultaneously through superposition...',
      taskHash: crypto.createHash('sha256').update('task3').digest('hex'),
      blockchainTaskId: '3',
      txHash: '0x1234...task3',
      status: TaskStatus.REVEALED,
      score: 8500, // 85/100
      confidence: 0.82,
      verdict: 'RELIABLE',
      requester: '0x3333333333333333333333333333333333333333',
      organizationId: alpha.id,
      verifier: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      evidenceCid: 'QmTaskEvidence3',
      explainabilityCid: 'QmExplain3',
    },
  });

  const task4 = await prisma.verificationTask.create({
    data: {
      prompt: 'Write a Python function to reverse a string.',
      response: 'def reverse_string(s):\\n    return s[::-1]',
      taskHash: crypto.createHash('sha256').update('task4').digest('hex'),
      status: TaskStatus.EVALUATING,
      requester: '0x4444444444444444444444444444444444444444',
      organizationId: beta.id,
      verifier: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    },
  });

  console.log(`✓ Created 4 verification tasks\n`);

  // ============================================================================
  // 6. EVALUATIONS
  // ============================================================================
  console.log('⚡ Creating evaluations...');

  await prisma.evaluation.create({
    data: {
      taskId: task1.id,
      verifier: '0x1234567890123456789012345678901234567890',
      commitHash: '0xcommithash1',
      commitTx: '0xcommittx1',
      revealedAt: new Date('2025-01-10T15:00:00Z'),
      revealTx: '0xrevealtx1',
      score: 9800,
      confidence: 0.99,
      verdict: 'RELIABLE',
      evidenceCid: 'QmEvalEvidence1',
      explainabilityCid: 'QmEvalExplain1',
      providersUsed: ['openai:gpt-4', 'anthropic:claude-3-opus'],
      tokensUsed: 1250,
      costUsd: 0.0375,
      latencyMs: 1180,
    },
  });

  await prisma.evaluation.create({
    data: {
      taskId: task2.id,
      verifier: '0x1234567890123456789012345678901234567890',
      commitHash: '0xcommithash2',
      commitTx: '0xcommittx2',
      revealedAt: new Date('2025-01-10T16:00:00Z'),
      revealTx: '0xrevealtx2',
      score: 1000,
      confidence: 0.95,
      verdict: 'UNRELIABLE',
      evidenceCid: 'QmEvalEvidence2',
      explainabilityCid: 'QmEvalExplain2',
      providersUsed: ['openai:gpt-4', 'anthropic:claude-3-opus', 'google:gemini-pro'],
      tokensUsed: 1800,
      costUsd: 0.054,
      latencyMs: 1420,
    },
  });

  console.log(`✓ Created 2 evaluations\n`);

  // ============================================================================
  // 7. DISPUTES
  // ============================================================================
  console.log('⚖️  Creating disputes...');

  await prisma.dispute.create({
    data: {
      taskId: task2.id,
      blockchainDisputeId: '1',
      disputer: '0x2222222222222222222222222222222222222222',
      bondAmount: '1000000000000000000', // 1 ETH
      reason: 'The answer "2 + 2 = 5" is mathematically incorrect. The correct answer is 4.',
      claimsContested: ['claim-math-001'],
      status: DisputeStatus.UNDER_REVIEW,
      currentRung: 2,
      jurors: [
        '0xjuror1111111111111111111111111111111111',
        '0xjuror2222222222222222222222222222222222',
        '0xjuror3333333333333333333333333333333333',
      ],
      juryVotes: {
        '0xjuror1111111111111111111111111111111111': 'DISPUTER',
        '0xjuror2222222222222222222222222222222222': 'DISPUTER',
        '0xjuror3333333333333333333333333333333333': 'DISPUTER',
      },
    },
  });

  console.log(`✓ Created 1 dispute\n`);

  // ============================================================================
  // 8. WEBHOOK SUBSCRIPTIONS
  // ============================================================================
  console.log('🔔 Creating webhook subscriptions...');

  const webhook1 = await prisma.webhookSubscription.create({
    data: {
      url: 'https://example.com/webhook',
      secret: crypto.randomBytes(32).toString('hex'),
      events: [WebhookEvent.JOB_COMPLETED, WebhookEvent.JOB_DISPUTED],
      enabled: true,
      deliveryCount: 15,
      failureCount: 1,
      lastDeliveryAt: new Date('2025-01-10T14:00:00Z'),
      owner: '0x1111111111111111111111111111111111111111',
    },
  });

  const webhook2 = await prisma.webhookSubscription.create({
    data: {
      url: 'https://api.example.com/notifications',
      secret: crypto.randomBytes(32).toString('hex'),
      events: [
        WebhookEvent.JOB_CREATED,
        WebhookEvent.JOB_COMPLETED,
        WebhookEvent.JOB_FAILED,
      ],
      enabled: true,
      deliveryCount: 42,
      failureCount: 0,
      lastDeliveryAt: new Date('2025-01-10T18:30:00Z'),
      owner: '0x2222222222222222222222222222222222222222',
    },
  });

  console.log(`✓ Created 2 webhook subscriptions\n`);

  // ============================================================================
  // 9. WEBHOOK DELIVERIES
  // ============================================================================
  console.log('📨 Creating webhook deliveries...');

  await prisma.webhookDelivery.create({
    data: {
      subscriptionId: webhook1.id,
      taskId: task1.id,
      event: WebhookEvent.JOB_COMPLETED,
      payload: {
        taskId: task1.id,
        score: 9800,
        verdict: 'RELIABLE',
        confidence: 0.99,
      },
      success: true,
      statusCode: 200,
      attempts: 1,
    },
  });

  await prisma.webhookDelivery.create({
    data: {
      subscriptionId: webhook1.id,
      taskId: task2.id,
      event: WebhookEvent.JOB_DISPUTED,
      payload: {
        taskId: task2.id,
        disputeId: '1',
        disputer: '0x2222222222222222222222222222222222222222',
      },
      success: false,
      statusCode: 500,
      errorMessage: 'Internal Server Error',
      attempts: 3,
      nextRetryAt: new Date(Date.now() + 3600000), // 1 hour from now
    },
  });

  console.log(`✓ Created 2 webhook deliveries\n`);

  // ============================================================================
  // 10. AUDIT LOGS
  // ============================================================================
  console.log('📋 Creating audit logs...');

  const auditLogs = [
    {
      action: 'TASK_CREATED',
      actor: '0x1111111111111111111111111111111111111111',
      taskId: task1.id,
      metadata: { prompt: 'What is the capital of France?' },
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0...',
    },
    {
      action: 'EVALUATION_COMMITTED',
      actor: '0x1234567890123456789012345678901234567890',
      taskId: task1.id,
      metadata: { commitHash: '0xcommithash1' },
    },
    {
      action: 'EVALUATION_REVEALED',
      actor: '0x1234567890123456789012345678901234567890',
      taskId: task1.id,
      metadata: { score: 9800, verdict: 'RELIABLE' },
    },
    {
      action: 'DISPUTE_CREATED',
      actor: '0x2222222222222222222222222222222222222222',
      taskId: task2.id,
      metadata: { bondAmount: '1000000000000000000' },
    },
  ];

  for (const log of auditLogs) {
    await prisma.auditLog.create({ data: log });
  }
  console.log(`✓ Created ${auditLogs.length} audit logs\n`);

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('✅ Database seeding complete!\n');
  console.log('Summary:');
  console.log('  - 1 calibration model (ECE: 0.021)');
  console.log('  - 1 benchmark result (accuracy: 95%)');
  console.log('  - 2 verifier stats');
  console.log('  - 2 API keys');
  console.log('  - 4 verification tasks');
  console.log('  - 2 evaluations');
  console.log('  - 1 dispute');
  console.log('  - 2 webhook subscriptions');
  console.log('  - 2 webhook deliveries');
  console.log('  - 4 audit logs');
  console.log('\n🎉 Ready for development and testing!\n');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
