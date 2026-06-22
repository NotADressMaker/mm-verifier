import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await prisma.verification.findUnique({ where: { id } });
  if (!v) {
    notFound();
    throw new Error('Receipt not found');
  }
  const verification = v;
  const warnings = verification.policyWarningsJson ? JSON.parse(verification.policyWarningsJson) : [];
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">MAMV Receipt</h1>
      <div className="card space-y-2">
        <img src={`/api/receipts/${id}/badge`} alt="MAMV receipt badge" />
        <p>Status: <b>{verification.status}</b></p>
        <p>Policy decision: <b>{verification.policyDecision ?? 'pending'}</b></p>
        <p>Score: <b>{verification.scoreBps ?? '-'}</b> / threshold {verification.thresholdBps}</p>
        <p>MAMV confidence reflects verification quality, not guaranteed correctness.</p>
        <p>Receipt hash: <code>{verification.receiptHash ?? '-'}</code></p>
        <p>Chain: {verification.chainId ?? '-'} {verification.contractAddress ?? ''}</p>
        <p>Tx: {verification.txHash ?? 'not anchored or not found'}</p>
        <p>Onchain anchoring proves this receipt is timestamped and unchanged. It does not guarantee the AI output is correct.</p>
        <p>MAMV verifies the AI output. Blockchain verifies the MAMV receipt.</p>
        {warnings.length > 0 ? <ul className="list-disc pl-6 text-amber-300">{warnings.map((warning: string) => <li key={warning}>{warning}</li>)}</ul> : null}
      </div>
      <pre className="card overflow-auto text-xs">{JSON.stringify(verification.receiptJson ? JSON.parse(verification.receiptJson) : { error: verification.error }, null, 2)}</pre>
    </div>
  );
}
