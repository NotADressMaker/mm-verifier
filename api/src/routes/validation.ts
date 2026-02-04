import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import {
  createValidationRequest,
  getLatestReceiptForRequest,
  getReceipt,
  getReceiptHistory,
  getValidationRequest,
  getValidatorSummary,
  listValidationRequests,
  recordValidationReceipt,
} from '../services/validationStore';
import {
  MmvValidationRequest,
  ValidationReceipt,
} from '../../../shared/validationTypes';

const router = Router();

const requestValidators = [
  body('plugin')
    .isIn(['deterministic', 'test-suite', 'tee_or_zk'])
    .withMessage('plugin is required'),
  body('payload').isObject().withMessage('payload is required'),
];

router.post('/requests', requestValidators, (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { plugin, payload, tags } = req.body as {
    plugin: MmvValidationRequest['plugin'];
    payload: MmvValidationRequest['payload'];
    tags?: string[];
  };

  const requesterId = req.header('x-requester-id') || req.ip || 'anonymous';
  const request = createValidationRequest(plugin, payload, requesterId, tags);

  res.status(201).json({
    request,
  });
});

router.get(
  '/requests',
  [
    query('status').optional().isIn(['PENDING', 'COMPLETED', 'FAILED']),
    query('limit').optional().isInt({ min: 1, max: 200 }),
  ],
  (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const status = req.query.status as 'PENDING' | 'COMPLETED' | 'FAILED' | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const requests = listValidationRequests(status, limit);

    res.status(200).json({
      requests,
    });
  }
);

router.get(
  '/requests/:requestId',
  [param('requestId').isString().notEmpty().withMessage('requestId is required')],
  (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const record = getValidationRequest(req.params.requestId);
    if (!record) {
      return res.status(404).json({
        error: 'Request not found',
      });
    }

    res.status(200).json(record);
  }
);

router.post(
  '/requests/:requestId/results',
  [
    param('requestId').isString().notEmpty().withMessage('requestId is required'),
    body('receipt').isObject().withMessage('receipt is required'),
  ],
  (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const receipt = req.body.receipt as ValidationReceipt;

    if (receipt.requestId !== req.params.requestId) {
      return res.status(400).json({
        error: 'receipt.requestId does not match requestId',
      });
    }

    recordValidationReceipt(receipt);

    res.status(200).json({
      receipt,
    });
  }
);

router.get(
  '/receipts/:receiptId',
  [param('receiptId').isString().notEmpty().withMessage('receiptId is required')],
  (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const receipt = getReceipt(req.params.receiptId);
    if (!receipt) {
      return res.status(404).json({
        error: 'Receipt not found',
      });
    }

    res.status(200).json({ receipt });
  }
);

router.get(
  '/receipts/:requestId/history',
  [param('requestId').isString().notEmpty().withMessage('requestId is required')],
  (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const history = getReceiptHistory(req.params.requestId);
    res.status(200).json({ history });
  }
);

router.get(
  '/validators/:validatorId/summary',
  [param('validatorId').isString().notEmpty().withMessage('validatorId is required')],
  (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const summary = getValidatorSummary(req.params.validatorId);
    if (!summary) {
      return res.status(404).json({ error: 'Validator not found' });
    }

    res.status(200).json({ summary });
  }
);

router.get('/demo/protected', (req: Request, res: Response) => {
  const requestId = req.query.requestId as string | undefined;
  const receipt = requestId ? getLatestReceiptForRequest(requestId) : null;
  const resolvedReceipt = receipt ?? null;

  if (resolvedReceipt) {
    res.setHeader(
      'X-MMV-Receipt',
      JSON.stringify({
        requestId: resolvedReceipt.requestId,
        receiptId: resolvedReceipt.receiptId,
        workHash: resolvedReceipt.workHash,
        proofHash: resolvedReceipt.proofHash,
      })
    );
  }

  res.status(200).send(`<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>MMV Protected Demo</title>
      ${
        resolvedReceipt
          ? `<meta name="mmv-receipt" content='${JSON.stringify({
              requestId: resolvedReceipt.requestId,
              receiptId: resolvedReceipt.receiptId,
              workHash: resolvedReceipt.workHash,
              proofHash: resolvedReceipt.proofHash,
            }).replace(/'/g, '&apos;')}' />`
          : ''
      }
    </head>
    <body>
      <h1>MMV Protected Endpoint</h1>
      <p>This endpoint returns MMV receipt metadata for Trust Lens.</p>
      ${
        resolvedReceipt
          ? `<pre>${JSON.stringify(resolvedReceipt, null, 2)}</pre>`
          : '<p>No receipt available yet.</p>'
      }
    </body>
  </html>`);
});

export { router as validationRoutes };
