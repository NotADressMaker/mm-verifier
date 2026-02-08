import React, { useEffect, useMemo, useState } from 'react';
import { fetchJson } from '../api';
import { DisputeEvent, EvidenceBundle, JobRecord, Receipt } from '../types';
import ReceiptCard from '../components/ReceiptCard';
import EvidenceViewer from '../components/EvidenceViewer';
import DisputeTimeline from '../components/DisputeTimeline';
import ClaimSummary from '../components/ClaimSummary';

export default function JobDetail({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<JobRecord | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [bundle, setBundle] = useState<EvidenceBundle | null>(null);
  const [disputes, setDisputes] = useState<DisputeEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const jobResponse = await fetchJson<{ job: JobRecord }>(`/api/jobs/${jobId}`);
        if (!active) return;
        setJob(jobResponse.job);

        try {
          const receiptResponse = await fetchJson<{ receipt: Receipt }>(`/api/jobs/${jobId}/receipt`);
          if (active) setReceipt(receiptResponse.receipt);
        } catch {
          if (active) setReceipt(null);
        }

        try {
          const bundleResponse = await fetchJson<{ bundle: EvidenceBundle }>(`/api/jobs/${jobId}/bundle`);
          if (active) setBundle(bundleResponse.bundle);
        } catch {
          if (active) setBundle(null);
        }

        try {
          const disputeResponse = await fetchJson<{ disputes: DisputeEvent[] }>(
            `/api/jobs/${jobId}/disputes`
          );
          if (active) setDisputes(disputeResponse.disputes ?? []);
        } catch {
          if (active) setDisputes([]);
        }
      } catch (err) {
        if (active) setError((err as Error).message);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [jobId]);

  const timeline = useMemo(() => job?.statusHistory ?? [], [job]);

  if (error) {
    return <div className="card">Failed to load job: {error}</div>;
  }

  return (
    <div className="container">
      <div className="header">
        <div>
          <h1>Job {jobId}</h1>
          <div className="header-links">
            <a href="/">← Back to jobs</a>
            <a href={`/jobs/${jobId}/debug`}>View debug trace</a>
          </div>
        </div>
        {job && <span className="badge">{job.status}</span>}
      </div>

      <div className="card">
        <h2>Status Timeline</h2>
        {timeline.length === 0 ? (
          <p>No status updates yet.</p>
        ) : (
          <div className="timeline">
            {timeline.map((entry, idx) => (
              <div key={`${entry.status}-${idx}`} className="timeline-item">
                <strong>{entry.status}</strong>
                <div>{new Date(entry.timestamp).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ReceiptCard receipt={receipt} />
      <ClaimSummary receipt={receipt} />
      <EvidenceViewer bundle={bundle} receipt={receipt} />
      <DisputeTimeline events={disputes} />
    </div>
  );
}
