/**
 * MMV Express Quickstart Example
 *
 * This example demonstrates:
 * 1. Sending a prompt to an LLM
 * 2. Verifying the output with MMV
 * 3. Displaying a "Verified" badge and receipt details
 *
 * Run with: npm start
 * Open: http://localhost:3001
 */

import express, { Request, Response } from 'express';

// Import SDK types (we use a mock for standalone operation)
interface Receipt {
  task_id: string;
  verdict: boolean;
  score_bps: number;
  bundle_hash: string;
  bundle_uri: string;
  program_id: string;
  program_version: string;
  chain_id: number;
  contract_address: string;
}

interface OnchainVerifyResult {
  valid: boolean;
  checks: {
    receipt_exists: boolean;
    hash_matches: boolean;
    chain_matches: boolean;
    contract_matches: boolean;
  };
  errors: string[];
}

// Configuration
const PORT = process.env.PORT ?? 3001;
const MMV_API_URL = process.env.MMV_API_URL ?? 'http://localhost:3000';
const USE_MOCK = process.env.USE_MOCK !== 'false';

// ============================================================================
// Mock LLM Client (simulates calling an LLM)
// ============================================================================

async function queryLLM(prompt: string): Promise<string> {
  // In a real app, this would call OpenAI/Anthropic/etc.
  // For this example, we simulate a response
  const responses: Record<string, string> = {
    'capital of france': 'Paris is the capital of France. It is also the largest city in France, known for the Eiffel Tower, the Louvre Museum, and Notre-Dame Cathedral.',
    'water boil': 'Water boils at 100 degrees Celsius (212 degrees Fahrenheit) at standard atmospheric pressure.',
    default: `In response to your question: ${prompt}\n\nThis is a simulated LLM response for demonstration purposes. In production, this would come from an actual LLM API like OpenAI or Anthropic.`,
  };

  // Simple keyword matching
  const lower = prompt.toLowerCase();
  if (lower.includes('capital') && lower.includes('france')) {
    return responses['capital of france'];
  }
  if (lower.includes('water') && lower.includes('boil')) {
    return responses['water boil'];
  }
  return responses['default'];
}

// ============================================================================
// Mock Verification (when MMV API is not available)
// ============================================================================

function generateMockReceipt(text: string): Receipt {
  const taskId = `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const hash = `0x${Buffer.from(text).toString('hex').padEnd(64, '0').slice(0, 64)}`;

  // Simulate scoring based on content
  let scoreBps = 7500;
  if (text.includes('Paris') && text.includes('capital')) {
    scoreBps = 9200;
  } else if (text.includes('100 degrees') || text.includes('212 degrees')) {
    scoreBps = 9500;
  }

  return {
    task_id: taskId,
    verdict: scoreBps >= 5000,
    score_bps: scoreBps,
    bundle_hash: hash as string,
    bundle_uri: `ipfs://Qm${taskId.slice(5)}`,
    program_id: 'factual-consensus-v1',
    program_version: '1.0.0',
    chain_id: 421614,
    contract_address: '0x0000000000000000000000000000000000000000',
  };
}

function verifyReceiptOnchain(
  receipt: Receipt,
  expectedChainId: number = 421614,
  expectedContract: string = '0x0000000000000000000000000000000000000000'
): OnchainVerifyResult {
  const errors: string[] = [];

  const receiptExists =
    typeof receipt.task_id === 'string' &&
    receipt.task_id.length > 0 &&
    typeof receipt.verdict === 'boolean' &&
    typeof receipt.score_bps === 'number';

  if (!receiptExists) {
    errors.push('Receipt is missing required fields');
  }

  const hashMatches =
    typeof receipt.bundle_hash === 'string' &&
    /^0x[0-9a-fA-F]{64}$/.test(receipt.bundle_hash);

  if (!hashMatches && receiptExists) {
    errors.push(`Invalid bundle_hash format`);
  }

  const chainMatches = receipt.chain_id === expectedChainId;
  if (!chainMatches) {
    errors.push(`Chain ID mismatch: expected ${expectedChainId}, got ${receipt.chain_id}`);
  }

  const contractMatches =
    receipt.contract_address.toLowerCase() === expectedContract.toLowerCase();
  if (!contractMatches) {
    errors.push(`Contract mismatch`);
  }

  return {
    valid: receiptExists && hashMatches && chainMatches && contractMatches,
    checks: {
      receipt_exists: receiptExists,
      hash_matches: hashMatches,
      chain_matches: chainMatches,
      contract_matches: contractMatches,
    },
    errors,
  };
}

// ============================================================================
// Express App
// ============================================================================

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the main page
app.get('/', (_req: Request, res: Response) => {
  res.send(renderPage());
});

// Handle verification request
app.post('/verify', async (req: Request, res: Response) => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    // Step 1: Query the LLM
    const llmResponse = await queryLLM(prompt);

    // Step 2: Verify the output
    let receipt: Receipt;

    if (USE_MOCK) {
      // Use mock verification (for demo without running MMV backend)
      receipt = generateMockReceipt(llmResponse);
    } else {
      // Use real MMV API
      const response = await fetch(`${MMV_API_URL}/v1/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: llmResponse,
          models: ['gpt-4', 'claude-3'],
          task_type: 'factual-qa',
          program_id: 'factual-consensus-v1',
        }),
      });

      if (!response.ok) {
        throw new Error(`MMV API error: ${response.status}`);
      }

      const data = (await response.json()) as { receipt?: Receipt };
      receipt = data.receipt ?? generateMockReceipt(llmResponse);
    }

    // Step 3: Verify the receipt
    const verification = verifyReceiptOnchain(receipt);

    // Return result
    res.json({
      prompt,
      llm_response: llmResponse,
      receipt,
      verification,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// ============================================================================
// HTML Template
// ============================================================================

function renderPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MMV Quickstart - Verify LLM Output</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      min-height: 100vh;
      padding: 2rem;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    h1 {
      color: #333;
      margin-bottom: 0.5rem;
    }
    .subtitle {
      color: #666;
      margin-bottom: 2rem;
    }
    .card {
      background: white;
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 1rem;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    label {
      display: block;
      font-weight: 600;
      margin-bottom: 0.5rem;
      color: #333;
    }
    textarea {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 1rem;
      resize: vertical;
      min-height: 100px;
    }
    button {
      background: #2563eb;
      color: white;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 4px;
      font-size: 1rem;
      cursor: pointer;
      margin-top: 1rem;
    }
    button:hover { background: #1d4ed8; }
    button:disabled { background: #93c5fd; cursor: not-allowed; }
    .result { display: none; }
    .result.visible { display: block; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      border-radius: 9999px;
      font-weight: 600;
      font-size: 1.1rem;
    }
    .badge.verified {
      background: #dcfce7;
      color: #166534;
    }
    .badge.unverified {
      background: #fee2e2;
      color: #991b1b;
    }
    .badge-icon {
      width: 20px;
      height: 20px;
    }
    .score {
      font-size: 2rem;
      font-weight: 700;
      color: #333;
    }
    .score-label {
      color: #666;
      font-size: 0.9rem;
    }
    .llm-response {
      background: #f8fafc;
      border-left: 4px solid #2563eb;
      padding: 1rem;
      margin: 1rem 0;
      white-space: pre-wrap;
    }
    .details-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin-top: 1rem;
    }
    .detail-item {
      background: #f8fafc;
      padding: 0.75rem;
      border-radius: 4px;
    }
    .detail-label {
      font-size: 0.75rem;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .detail-value {
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 0.85rem;
      word-break: break-all;
      margin-top: 0.25rem;
    }
    .checks {
      display: flex;
      gap: 1rem;
      margin-top: 1rem;
      flex-wrap: wrap;
    }
    .check {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.9rem;
    }
    .check.pass { color: #166534; }
    .check.fail { color: #991b1b; }
    .error {
      background: #fee2e2;
      color: #991b1b;
      padding: 1rem;
      border-radius: 4px;
      margin-top: 1rem;
    }
    .mode-badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      background: #fef3c7;
      color: #92400e;
      font-size: 0.75rem;
      border-radius: 4px;
      margin-left: 0.5rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>MMV Quickstart <span class="mode-badge">${USE_MOCK ? 'Mock Mode' : 'Live'}</span></h1>
    <p class="subtitle">Verify LLM outputs with multi-model consensus</p>

    <div class="card">
      <label for="prompt">Enter a question for the LLM:</label>
      <textarea id="prompt" placeholder="e.g., What is the capital of France?">What is the capital of France?</textarea>
      <button id="submit" onclick="verify()">Verify LLM Output</button>
    </div>

    <div id="result" class="result">
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div id="badge"></div>
          <div style="text-align: right;">
            <div class="score" id="score">--</div>
            <div class="score-label">Confidence Score</div>
          </div>
        </div>

        <h3 style="margin-top: 1.5rem;">LLM Response</h3>
        <div class="llm-response" id="llm-response"></div>

        <h3 style="margin-top: 1.5rem;">Receipt Details</h3>
        <div class="details-grid" id="details"></div>

        <h3 style="margin-top: 1.5rem;">Onchain Verification</h3>
        <div class="checks" id="checks"></div>
      </div>
    </div>

    <div id="error" class="error" style="display: none;"></div>
  </div>

  <script>
    async function verify() {
      const prompt = document.getElementById('prompt').value;
      const btn = document.getElementById('submit');
      const result = document.getElementById('result');
      const error = document.getElementById('error');

      btn.disabled = true;
      btn.textContent = 'Verifying...';
      result.classList.remove('visible');
      error.style.display = 'none';

      try {
        const res = await fetch('/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Verification failed');
        }

        // Update badge
        const badgeEl = document.getElementById('badge');
        const isVerified = data.receipt.verdict;
        badgeEl.innerHTML = \`
          <span class="badge \${isVerified ? 'verified' : 'unverified'}">
            \${isVerified ? checkIcon() : xIcon()}
            \${isVerified ? 'Verified' : 'Unverified'}
          </span>
        \`;

        // Update score
        document.getElementById('score').textContent = (data.receipt.score_bps / 100).toFixed(1) + '%';

        // Update LLM response
        document.getElementById('llm-response').textContent = data.llm_response;

        // Update details
        const details = document.getElementById('details');
        details.innerHTML = \`
          <div class="detail-item">
            <div class="detail-label">Task ID</div>
            <div class="detail-value">\${data.receipt.task_id}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Score</div>
            <div class="detail-value">\${data.receipt.score_bps} bps</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Bundle Hash</div>
            <div class="detail-value">\${data.receipt.bundle_hash}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Bundle URI</div>
            <div class="detail-value">\${data.receipt.bundle_uri}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Program</div>
            <div class="detail-value">\${data.receipt.program_id} v\${data.receipt.program_version}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Chain</div>
            <div class="detail-value">ID: \${data.receipt.chain_id}</div>
          </div>
          <div class="detail-item" style="grid-column: span 2;">
            <div class="detail-label">Contract Address</div>
            <div class="detail-value">\${data.receipt.contract_address}</div>
          </div>
        \`;

        // Update checks
        const checks = document.getElementById('checks');
        const v = data.verification;
        checks.innerHTML = \`
          <div class="check \${v.checks.receipt_exists ? 'pass' : 'fail'}">
            \${v.checks.receipt_exists ? checkIcon() : xIcon()} Receipt Valid
          </div>
          <div class="check \${v.checks.hash_matches ? 'pass' : 'fail'}">
            \${v.checks.hash_matches ? checkIcon() : xIcon()} Hash Valid
          </div>
          <div class="check \${v.checks.chain_matches ? 'pass' : 'fail'}">
            \${v.checks.chain_matches ? checkIcon() : xIcon()} Chain Match
          </div>
          <div class="check \${v.checks.contract_matches ? 'pass' : 'fail'}">
            \${v.checks.contract_matches ? checkIcon() : xIcon()} Contract Match
          </div>
        \`;

        result.classList.add('visible');
      } catch (e) {
        error.textContent = e.message;
        error.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Verify LLM Output';
      }
    }

    function checkIcon() {
      return '<svg class="badge-icon" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>';
    }

    function xIcon() {
      return '<svg class="badge-icon" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path></svg>';
    }
  </script>
</body>
</html>`;
}

// Start server
app.listen(PORT, () => {
  console.log(`
  MMV Quickstart Example
  ======================

  Server running at: http://localhost:${PORT}

  Mode: ${USE_MOCK ? 'Mock (no MMV backend required)' : `Live (using ${MMV_API_URL})`}

  To use with real MMV backend:
    USE_MOCK=false MMV_API_URL=http://localhost:3000 npm start
  `);
});
