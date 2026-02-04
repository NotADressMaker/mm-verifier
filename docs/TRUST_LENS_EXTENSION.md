# Trust Lens Extension (MMV)

Trust Lens is a Chrome MV3 extension that surfaces MMV verification receipts and risk flags when users hit MMV-protected endpoints.

## Receipt detection

The extension detects MMV receipts from:

1. `X-MMV-Receipt` response header (preferred)
2. `<meta name="mmv-receipt" content="...">` in HTML

The receipt payload is JSON containing:

```
{
  "requestId": "...",
  "receiptId": "...",
  "workHash": "...",
  "proofHash": "..."
}
```

## Popup UI

The popup shows:

- Receipt ID / hash
- Latest verification result (verdict, score, tag, timestamp)
- Validator identity
- Risk flags (NEW_VALIDATOR, LOW_SIGNAL, SCORE_SHIFT, STALE, UNVERIFIED)

## API endpoints used

The extension reads from the MMV read API:

- `GET /api/validation/receipts/:receiptId`
- `GET /api/validation/receipts/:requestId/history`
- `GET /api/validation/validators/:validatorId/summary`

## Local dev

1. Start the API and validator service:
   ```
   ./scripts/dev-demo.sh
   ./scripts/dev-validator.sh
   ```
2. Build the extension:
   ```
   ./scripts/build-trust-lens.sh
   ```
3. Load `apps/trust-lens/dist` as an unpacked extension in Chrome.
4. Visit:
   ```
   http://localhost:3000/api/validation/demo/protected?requestId=<requestId>
   ```
