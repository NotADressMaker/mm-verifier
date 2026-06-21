import express from 'express';
import { config } from './config';
import { initializeDb, isProcessed, markProcessed, persistDb, storeReceipt, getReceipt } from './db';
import { fetchPendingRequests, postReceipt } from './mamvClient';
import { parseValidationRequest } from './requestParser';
import { runVerification } from './plugins/router';
import { buildReceipt } from './receipt';
import { hashCanonical } from '../../../shared/canonicalJson';

async function pollOnce(): Promise<void> {
  const requests = await fetchPendingRequests();
  for (const rawRequest of requests) {
    const request = parseValidationRequest(rawRequest);
    if (isProcessed(request.requestId)) {
      continue;
    }

    const result = await runVerification(request);
    const logsHash = hashCanonical({
      requestId: request.requestId,
      plugin: request.plugin,
      tag: result.tag,
    });
    const environmentHash = hashCanonical({
      validatorId: config.validatorId,
      nodeVersion: process.version,
      platform: process.platform,
    });
    const receipt = buildReceipt(request, result, logsHash, environmentHash);

    storeReceipt(receipt.receiptId, receipt.requestId, JSON.stringify(receipt, null, 2));
    markProcessed(request.requestId);
    persistDb(config.dbPath);

    await postReceipt(request.requestId, receipt);
  }
}

async function startPolling(): Promise<void> {
  setInterval(async () => {
    try {
      await pollOnce();
    } catch (error) {
      console.error('Validator polling error', error);
    }
  }, config.pollIntervalMs);
}

async function main(): Promise<void> {
  await initializeDb(config.dbPath);

  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'healthy',
      validatorId: config.validatorId,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/receipts/:receiptId', (req, res) => {
    const receiptJson = getReceipt(req.params.receiptId);
    if (!receiptJson) {
      return res.status(404).json({ error: 'Receipt not found' });
    }
    return res.status(200).json(JSON.parse(receiptJson));
  });

  app.listen(config.port, () => {
    console.log(`Validator service listening on port ${config.port}`);
  });

  await startPolling();
}

void main();
