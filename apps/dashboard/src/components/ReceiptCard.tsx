import React from 'react';
import { Receipt } from '../types';

export default function ReceiptCard({ receipt }: { receipt: Receipt | null }) {
  if (!receipt) {
    return <div className="card">No receipt available yet.</div>;
  }

  const bundleUri = receipt.evidence?.bundle_uri || '';
  const storageMode = bundleUri.startsWith('hash-only://')
    ? 'hashed-only'
    : bundleUri.startsWith('encrypted+')
    ? 'encrypted'
    : 'plaintext';

  return (
    <div className="card">
      <h2>Receipt Summary</h2>
      <div className="grid">
        <div>
          <div className="section-title">Verdict</div>
          <div className={`badge ${receipt.verdict ? 'success' : 'fail'}`}>
            {receipt.verdict ? 'ACCEPT' : 'REJECT'}
          </div>
        </div>
        <div>
          <div className="section-title">Score</div>
          <strong>{(receipt.score_bps / 100).toFixed(2)}%</strong>
        </div>
        <div>
          <div className="section-title">Evidence Stored</div>
          <div className={`badge ${storageMode === 'encrypted' ? 'success' : 'warn'}`}>
            {storageMode}
          </div>
        </div>
        <div>
          <div className="section-title">Bundle Hash</div>
          <div>{receipt.evidence.bundle_hash}</div>
        </div>
        <div>
          <div className="section-title">Bundle URI</div>
          <div>{receipt.evidence.bundle_uri}</div>
        </div>
      </div>
      <div className="section-title" style={{ marginTop: '16px' }}>
        Receipt JSON
      </div>
      <pre className="json-block">{JSON.stringify(receipt, null, 2)}</pre>
    </div>
  );
}
