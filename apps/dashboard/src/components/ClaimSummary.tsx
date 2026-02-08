import React from 'react';
import { Receipt } from '../types';

export default function ClaimSummary({ receipt }: { receipt: Receipt | null }) {
  const claims = receipt?.explain?.claim_summary ?? [];

  if (!receipt) {
    return <div className="card">No receipt available for claim analysis.</div>;
  }

  if (claims.length === 0) {
    return (
      <div className="card">
        <h2>Claims</h2>
        <p>No claim summary available yet.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Claims</h2>
      <div className="claim-list">
        {claims.map((claim) => {
          const isContradicted = Boolean(claim.severity);
          return (
            <div key={claim.cluster_id} className="claim-item">
              <div className="claim-header">
                <span className={`badge ${isContradicted ? 'fail' : 'success'}`}>
                  {isContradicted ? 'Contradicted' : 'Supported'}
                </span>
                {claim.severity && <span className="claim-severity">{claim.severity}</span>}
              </div>
              <div className="claim-text">{claim.canonical_text}</div>
              <div className="claim-meta">
                <div>
                  <div className="section-title">Supported By</div>
                  <div>{claim.supported_by.join(', ') || '—'}</div>
                </div>
                <div>
                  <div className="section-title">Citations</div>
                  {claim.citations.length === 0 ? (
                    <div>None</div>
                  ) : (
                    <ul>
                      {claim.citations.map((citation, idx) => (
                        <li key={`${claim.cluster_id}-citation-${idx}`}>
                          <a href={citation.url} target="_blank" rel="noreferrer">
                            {citation.domain ?? citation.url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
