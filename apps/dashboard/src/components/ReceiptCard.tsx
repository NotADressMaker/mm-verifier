import React, { useMemo, useState } from 'react';
import { Receipt } from '../types';

type PublicStatus = 'Supported' | 'Mostly supported' | 'Mixed evidence' | 'Unsupported' | 'Contradicted' | 'Unable to verify';

function statusFromReceipt(receipt: Receipt): PublicStatus {
  if (receipt.verification_status) return receipt.verification_status;
  // A score alone cannot satisfy the evidence-verdict policy.
  return 'Unable to verify';
}

export default function ReceiptCard({ receipt }: { receipt: Receipt | null }) {
  const [showJson, setShowJson] = useState(false);

  const receiptJson = useMemo(() => JSON.stringify(receipt, null, 2), [receipt]);

  if (!receipt) {
    return <div className="card">No MAMV trust receipt available yet.</div>;
  }

  const status = statusFromReceipt(receipt);
  const confidence = receipt.confidence_score ?? receipt.score_bps / 10000;
  const anchor = receipt.onchain_anchor;
  const signer = receipt.signer ?? receipt.signature;
  const sources = receipt.evidence_sources ?? receipt.explain.claim_summary.flatMap((claim) => claim.citations);
  const votes = receipt.votes ?? receipt.explain.model_disagreement.models.map((model) => ({ provider: receipt.provenance.llm_provider, model, vote: receipt.verdict ? 'support' : 'uncertain', score_bps: receipt.score_bps }));
  const warnings = receipt.warnings ?? receipt.explain.checks_fired.map((check) => ({ code: check.id, severity: check.severity, message: check.summary }));

  const downloadReceipt = () => {
    const blob = new Blob([receiptJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${receipt.receipt_id ?? receipt.task_id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card receipt-viewer">
      <div className="receipt-viewer-header">
        <div>
          <p className="section-title">Portable MAMV trust receipt</p>
          <h2>{status}</h2>
          <p>MAMV checked an AI output and packaged the audit trail into a receipt you can view, share, download, and independently verify.</p>
        </div>
        <span className={`badge status-${status.toLowerCase()}`}>{status}</span>
      </div>

      <div className="grid">
        <div><div className="section-title">What was checked?</div><strong>{receipt.claim_summary || receipt.output_checked || receipt.task_id}</strong><p>{receipt.input_checked || 'Input is represented by hash because plaintext was not stored.'}</p></div>
        <div><div className="section-title">What did MAMV conclude?</div><strong>{receipt.verdict ? 'The output was supported enough to pass.' : 'The output did not pass verification.'}</strong><p>{receipt.explain.highlights[0]}</p></div>
        <div><div className="section-title">Confidence</div><strong>{Math.round(confidence * 100)}%</strong><p>{receipt.score_bps} / 10000 score</p></div>
        <div><div className="section-title">Quorum</div><strong>{receipt.quorum_status?.met ? 'Met' : 'Not met'}</strong><p>{receipt.quorum_status?.method ?? (receipt.explain.bft_quorum ? 'BFT-style weighted quorum' : 'Not reported')}</p></div>
        <div><div className="section-title">Signed?</div><strong>{signer ? 'Signed' : 'Not signed'}</strong><p>{'signer' in (signer ?? {}) ? (signer as any).signer : receipt.signer?.address ?? receipt.signer?.id ?? 'No signer metadata'}</p></div>
        <div><div className="section-title">Onchain anchoring</div><strong>{anchor?.anchor_status ?? (receipt.chain_context ? 'anchored' : 'not_anchored')}</strong><p>{anchor?.tx_hash ?? receipt.chain_context?.tx_hash ?? 'Not anchored. Blockchain anchoring is optional and does not prove truth.'}</p></div>
      </div>

      <h3>Model/provider votes</h3>
      <div className="table-like">{votes.map((vote, index) => <div key={`${vote.provider}-${vote.model}-${index}`}><strong>{vote.provider}/{vote.model}</strong><span>{vote.vote} · {vote.score_bps ?? 'n/a'} bps</span></div>)}</div>

      <h3>Evidence and source metadata</h3>
      {sources.length ? <div className="table-like">{sources.map((source, index) => <div key={`${source.url}-${index}`}><strong>{source.title ?? source.domain ?? source.url}</strong><span>{source.url ?? source.domain}</span></div>)}</div> : <p>No public source metadata was attached to this receipt.</p>}

      <h3>Warnings and outliers</h3>
      <div className="table-like">
        {(warnings.length ? warnings : [{ code: 'none', severity: 'low', message: 'No warnings were reported.' }]).map((warning) => <div key={warning.code}><strong>{warning.severity.toUpperCase()} · {warning.code}</strong><span>{warning.message}</span></div>)}
        {(receipt.outliers ?? []).map((outlier) => <div key={outlier.id}><strong>OUTLIER · {outlier.id}</strong><span>{outlier.reason}</span></div>)}
      </div>

      <h3>How to verify this receipt</h3>
      <ol>
        <li>Download the receipt JSON.</li>
        <li>Recompute the canonical receipt hash and compare it with <code>{receipt.receipt_hash ?? receipt.receipt_id}</code>.</li>
        <li>If signer metadata is present, verify the signature against the receipt hash.</li>
        <li>If anchored, independently look up the transaction and compare the anchored hash. Anchoring makes the receipt tamper-evident; it does not prove the AI answer is correct.</li>
      </ol>
      <div className="receipt-actions"><button onClick={downloadReceipt}>Download receipt JSON</button><button onClick={() => setShowJson((value) => !value)}>{showJson ? 'Hide raw JSON' : 'Advanced: raw JSON'}</button></div>
      {showJson && <pre className="json-block">{receiptJson}</pre>}
    </div>
  );
}
