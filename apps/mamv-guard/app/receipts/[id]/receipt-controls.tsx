'use client';

import { useState } from 'react';

export function ReceiptControls({ receiptId, title }: { receiptId: string; title: string }) {
  const [message, setMessage] = useState('');
  const receiptUrl = `/api/receipts/${receiptId}`;

  async function shareReceipt() {
    const url = `${window.location.origin}/receipts/${receiptId}`;
    if (navigator.share) {
      await navigator.share({ title, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    setMessage('Receipt link copied');
  }

  return <div className="flex flex-wrap items-center gap-2"><a className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold hover:bg-slate-800" href={receiptUrl} download={`mamv-receipt-${receiptId}.json`}>Download JSON</a><button className="rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300" onClick={() => void shareReceipt()}>Share receipt</button>{message ? <span className="text-sm text-emerald-300" role="status">{message}</span> : null}</div>;
}
