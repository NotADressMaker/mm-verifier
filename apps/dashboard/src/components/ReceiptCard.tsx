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
  const [showReasoning, setShowReasoning] = useState(false);
  const [showAllusions, setShowAllusions] = useState(false);

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

      {receipt.genericity_assessment && <section className="genericity-assessment"><h3>Genericity and scope</h3><p><strong>{receipt.genericity_assessment.inferredQuantifier ?? 'No inferred quantifier'}</strong> — model-conditioned linguistic signal, not a truth judgment.</p>{receipt.genericity_assessment.warnings.map((warning) => <p key={warning}><strong>{warning}</strong></p>)}<p>{receipt.genericity_assessment.overgeneralization.reason}</p><p>Limitations: {receipt.genericity_assessment.limitations.join(' ')}</p></section>}
      {receipt.allusion_assessment && <section><h3>Allusions and implicit references</h3><button onClick={() => setShowAllusions(value => !value)}>{showAllusions ? 'Hide' : 'Show'} allusion analysis</button>{showAllusions && <div className="table-like"><p>Detection confidence is a classifier signal, while consensus describes agreement only; neither is evidence or a verification score.</p>{receipt.allusion_assessment.candidates.map(candidate => { const verification = receipt.allusion_assessment?.verifications.find(item => item.allusion_id === candidate.allusion_id); return <div key={candidate.allusion_id}><strong>{candidate.text_span} · {candidate.type} · {candidate.explicitness}</strong><span>Literal: {candidate.literal_interpretation ?? 'not reported'} · Allusive: {candidate.interpretation}</span><span>Source: {candidate.proposed_source ?? 'not established'} · Target: {candidate.proposed_target_concept ?? 'not established'}</span><span>Detection confidence: {Math.round(candidate.confidence * 100)}% · Consensus confidence: {candidate.deliberation?.consensus_confidence === undefined ? 'not reported' : `${Math.round(candidate.deliberation.consensus_confidence * 100)}%`} · Verification status: {verification?.status ?? 'not assessed'}</span><span>Evidence: {verification?.evidence_ids.join(', ') || 'none'} · Alternatives: {candidate.alternative_interpretations.join('; ') || 'none'} · Warnings: {candidate.warnings.join('; ') || 'none'} · Limitations: {verification?.limitations.join('; ') || 'none'}</span></div>; })}</div>}</section>}
      {receipt.coherence_assessment && <section><h3>Coherence and stability</h3><p><strong>Coherence does not establish truth.</strong> Convergence is not evidence. Path sensitivity indicates instability, not necessarily error.</p><p>Contradiction density: {Math.round(receipt.coherence_assessment.contradiction_density * 100)}% · Integration cost: {Math.round(receipt.coherence_assessment.integration.integration_cost * 100)}% · Claim clusters: {receipt.coherence_assessment.fragmentation.cluster_count}</p><p>{receipt.coherence_assessment.integration.explanation}</p><p>Verification convergence: {receipt.coherence_assessment.convergence_stability === undefined ? 'not assessed' : `${Math.round(receipt.coherence_assessment.convergence_stability * 100)}%`}. Boundary sensitivity: {Math.round(receipt.coherence_assessment.boundary.sensitivity * 100)}%.</p>{receipt.coherence_assessment.warnings.map(warning => <p key={warning}><strong>{warning}</strong></p>)}<p>Limitations: {receipt.coherence_assessment.limitations.join(' ')}</p></section>}
      {receipt.metacognitive_assessment && <section><h3>Reasoning and critique</h3><button onClick={() => setShowReasoning(value => !value)}>{showReasoning ? 'Hide' : 'Show'} structured summaries</button>{showReasoning && <div className="table-like"><p>These are concise, inspectable summaries, not raw hidden chain-of-thought or a guaranteed-faithful record of model computation.</p><p><strong>Strategy:</strong> {receipt.metacognitive_assessment.strategy}</p><p><strong>Verification confidence:</strong> {Math.round(confidence * 100)}% · <strong>Consensus confidence:</strong> {receipt.metacognitive_assessment.consensus_confidence === undefined ? 'not reported' : `${Math.round(receipt.metacognitive_assessment.consensus_confidence * 100)}%`} · <strong>Model-stated confidence:</strong> {receipt.metacognitive_assessment.candidates[0]?.model_stated_confidence === undefined ? 'not reported' : `${Math.round(receipt.metacognitive_assessment.candidates[0].model_stated_confidence * 100)}%`}</p>{receipt.metacognitive_assessment.steps.map((step, index) => <div key={step.id ?? index}><strong>{step.phase}</strong><span>{step.summary}</span><span>Assumptions: {step.assumptions.join('; ') || 'none'} · Uncertainties: {step.uncertainties.join('; ') || 'none'} · Evidence: {step.evidence_ids.join(', ') || 'none'} · Alternatives: {step.alternatives_considered.join('; ') || 'none'}</span></div>)}{receipt.metacognitive_assessment.critiques.map((critique, index) => <div key={`${critique.category}-${index}`}><strong>{critique.severity.toUpperCase()} · {critique.category}</strong><span>{critique.resolution_summary ?? (critique.resolved ? 'Resolved.' : 'Unresolved.')} Evidence: {critique.evidence_ids.join(', ') || 'none'}</span></div>)}</div>}</section>}
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
