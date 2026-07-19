import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { ReceiptControls } from './receipt-controls';

type Json = Record<string, any>;

function parseJson(value: string | null): Json {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

function scoreLabel(score?: number | null) {
  if (score == null) return 'Not available';
  if (score >= 9000) return 'Very high';
  if (score >= 7500) return 'High';
  if (score >= 5000) return 'Moderate';
  return 'Low';
}

function statusStyle(passing: boolean) {
  return passing ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200' : 'border-rose-400/40 bg-rose-400/10 text-rose-200';
}

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const verification = await prisma.verification.findUnique({ where: { id } });
  if (!verification) notFound();

  const receipt = parseJson(verification.receiptJson);
  const explain = receipt.explain ?? {};
  const warnings = [
    ...(verification.policyWarningsJson ? JSON.parse(verification.policyWarningsJson) : []),
    ...(receipt.warnings ?? []).map((warning: any) => warning.message ?? warning.code),
    ...(explain.checks_fired ?? []).map((check: any) => check.summary),
  ].filter(Boolean);
  const claims = explain.claim_summary ?? [];
  const contradictions = explain.contradictions_found ?? [];
  const citations = explain.citation_checks ?? [];
  const disagreement = explain.model_disagreement ?? {};
  const votes = receipt.votes ?? [];
  const confidence = receipt.confidence_score != null ? Math.round(receipt.confidence_score * 100) : verification.scoreBps != null ? verification.scoreBps / 100 : null;
  const resultPasses = verification.verdict ?? receipt.verdict ?? false;
  const integrityAnchored = verification.anchorVerified || receipt.onchain_anchor?.anchor_status === 'anchored';
  const integritySigned = Boolean(receipt.signature || receipt.signer || receipt.receipt_hash || verification.receiptHash);
  const integrityStatus = integrityAnchored ? 'Anchored and tamper-evident' : integritySigned ? 'Receipt hash recorded' : 'Integrity information unavailable';
  const verificationMethod = receipt.program?.id
    ? `${receipt.program.id} v${receipt.program.version}`
    : receipt.provenance?.llm_model
      ? `Multi-model verification using ${receipt.provenance.llm_model}`
      : 'MAMV verification';

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald-400">Verification receipt</p>
          <h1 className="mt-1 text-3xl font-bold">Inspection report</h1>
          <p className="mt-2 max-w-2xl text-slate-300">A plain-language record of what MAMV checked, the evidence it found, and any reasons to use caution.</p>
        </div>
        <ReceiptControls receiptId={id} title="MAMV verification receipt" />
      </header>

      <section className={`card border ${statusStyle(resultPasses)}`}>
        <p className="text-sm font-medium uppercase tracking-wider opacity-80">Overall result</p>
        <div className="mt-2 flex flex-wrap items-end gap-x-5 gap-y-2">
          <h2 className="text-3xl font-bold">{resultPasses ? 'Verified' : 'Needs review'}</h2>
          <p className="pb-1">{verification.policyDecision ? `Policy decision: ${verification.policyDecision.replace('_', ' ')}` : verification.status}</p>
        </div>
        <p className="mt-3 text-sm opacity-90">{resultPasses ? 'The checked output met the configured verification threshold.' : 'The checked output did not meet the configured threshold or requires human review.'}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="card"><p className="text-sm text-slate-400">Confidence level</p><p className="mt-1 text-2xl font-bold">{confidence == null ? '—' : `${confidence}%`}</p><p className="mt-1 text-sm text-slate-300">{scoreLabel(verification.scoreBps)}</p></div>
        <div className="card"><p className="text-sm text-slate-400">Claims checked</p><p className="mt-1 text-2xl font-bold">{claims.length}</p><p className="mt-1 text-sm text-slate-300">Core statements assessed</p></div>
        <div className="card"><p className="text-sm text-slate-400">Verification method</p><p className="mt-1 font-semibold">{verificationMethod}</p><p className="mt-1 text-sm text-slate-300">Threshold: {verification.thresholdBps / 100}%</p></div>
      </section>

      <section className="card">
        <h2 className="text-xl font-bold">Key claims checked</h2>
        {claims.length ? <ul className="mt-4 space-y-3">{claims.map((claim: any, index: number) => <li className="rounded-lg border border-slate-800 p-3" key={claim.cluster_id ?? index}><p className="font-medium">{claim.canonical_text}</p><p className="mt-1 text-sm text-slate-400">Supported by {claim.supported_by?.length ?? 0} source{claim.supported_by?.length === 1 ? '' : 's'} · Contradicted by {claim.contradicted_by?.length ?? 0}</p></li>)}</ul> : <p className="mt-3 text-slate-400">No claim-level summary was included in this receipt.</p>}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card"><h2 className="text-xl font-bold">Supporting evidence</h2>{claims.some((claim: any) => claim.citations?.length) || citations.length ? <ul className="mt-4 space-y-3">{claims.flatMap((claim: any) => claim.citations ?? []).map((citation: any, index: number) => <li key={`${citation.url}-${index}`}><a className="font-medium text-emerald-400 hover:underline" href={citation.url} target="_blank" rel="noreferrer">{citation.title ?? citation.domain ?? citation.url}</a><p className="text-sm text-slate-400">Supports a checked claim</p></li>)}{citations.filter((citation: any) => citation.verdict === 'pass').map((citation: any, index: number) => <li key={`check-${index}`} className="text-sm text-slate-300">{citation.claim}</li>)}</ul> : <p className="mt-3 text-slate-400">No public supporting evidence was included.</p>}</div>
        <div className="card"><h2 className="text-xl font-bold">Conflicting evidence</h2>{contradictions.length ? <ul className="mt-4 space-y-3">{contradictions.map((item: any, index: number) => <li className="rounded-lg border border-rose-400/20 bg-rose-400/5 p-3" key={index}><p className="font-medium text-rose-200">{item.summary}</p><p className="mt-1 text-sm text-slate-400">Severity: {item.severity ?? 'not specified'}</p></li>)}</ul> : <p className="mt-3 text-slate-400">No conflicting evidence was identified.</p>}</div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card"><h2 className="text-xl font-bold">Model disagreements</h2>{disagreement.models?.length || votes.length ? <><p className="mt-3 text-slate-300">{disagreement.agreement_rate != null ? `${Math.round(disagreement.agreement_rate * 100)}% model agreement` : 'Model votes recorded'}</p><ul className="mt-3 flex flex-wrap gap-2">{(disagreement.models ?? votes.map((vote: any) => vote.model)).map((model: string) => <li className="rounded-full bg-slate-800 px-3 py-1 text-sm" key={model}>{model}</li>)}</ul></> : <p className="mt-3 text-slate-400">No model disagreement details were included.</p>}</div>
        <div className="card"><h2 className="text-xl font-bold">Warnings</h2>{warnings.length ? <ul className="mt-3 list-disc space-y-2 pl-5 text-amber-200">{warnings.map((warning: string, index: number) => <li key={index}>{warning}</li>)}</ul> : <p className="mt-3 text-slate-400">No warnings were raised.</p>}</div>
      </section>

      <section className="card"><h2 className="text-xl font-bold">Receipt integrity</h2><p className="mt-3 font-semibold text-emerald-300">{integrityStatus}</p><p className="mt-1 text-sm text-slate-300">{integrityAnchored ? 'The receipt was anchored on-chain, providing a timestamped tamper-evident record.' : integritySigned ? 'Keep the receipt hash to compare against downloaded or shared copies.' : 'This result has not provided a receipt hash or on-chain anchor.'}</p></section>

      <details className="card group">
        <summary className="cursor-pointer text-lg font-bold">Advanced details</summary>
        <div className="mt-5 space-y-4 text-sm">
          <dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-slate-400">Receipt hash</dt><dd className="break-all font-mono">{verification.receiptHash ?? receipt.receipt_hash ?? '—'}</dd></div><div><dt className="text-slate-400">Evidence bundle</dt><dd className="break-all font-mono">{receipt.evidence?.bundle_hash ?? '—'}</dd></div><div><dt className="text-slate-400">Chain transaction</dt><dd className="break-all font-mono">{verification.txHash ?? receipt.chain_context?.tx_hash ?? 'Not anchored'}</dd></div><div><dt className="text-slate-400">Verifier</dt><dd>{receipt.provenance?.verifier_node ?? '—'}</dd></div></dl>
          <pre className="max-h-96 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-300">{JSON.stringify(receipt, null, 2)}</pre>
        </div>
      </details>
    </div>
  );
}
