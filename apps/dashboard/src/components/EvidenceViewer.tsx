import React, { useState } from 'react';
import { EvidenceBundle, Receipt } from '../types';

type TabKey = 'prompt' | 'outputs' | 'citations' | 'contradictions';

export default function EvidenceViewer({
  bundle,
  receipt,
}: {
  bundle: EvidenceBundle | null;
  receipt: Receipt | null;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('prompt');

  const bundleUri = receipt?.evidence?.bundle_uri || '';
  const storageMode = bundleUri.startsWith('hash-only://')
    ? 'hashed-only'
    : bundleUri.startsWith('encrypted+')
    ? 'encrypted'
    : 'plaintext';

  if (!bundle) {
    return (
      <div className="card">
        <h2>Evidence Bundle</h2>
        <p>
          Evidence bundle not available. Storage mode: <strong>{storageMode}</strong>.
        </p>
      </div>
    );
  }

  const activeClaims = bundle.claims ?? [];
  const contradictions = receipt?.explain?.contradictions_found ?? [];

  return (
    <div className="card">
      <h2>Evidence Bundle</h2>
      <div className="tabs">
        {(['prompt', 'outputs', 'citations', 'contradictions'] as TabKey[]).map((tab) => (
          <button
            key={tab}
            className={`tab-button ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'prompt' ? 'Prompt / Transcript' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>
      {activeTab === 'prompt' && (
        <div>
          <div className="section-title">Prompt Hash</div>
          <p>{bundle.task_id}</p>
          <div className="section-title">Explanation</div>
          <p>{bundle.explanation}</p>
        </div>
      )}
      {activeTab === 'outputs' && (
        <div>
          {bundle.model_runs.map((run, idx) => (
            <div key={`${run.model}-${idx}`} className="card">
              <strong>{run.provider}</strong> · {run.model}
              <pre className="json-block">{run.raw_output}</pre>
            </div>
          ))}
        </div>
      )}
      {activeTab === 'citations' && (
        <div>
          {activeClaims.map((claim) => (
            <div key={claim.claim_id} className="card">
              <strong>{claim.text}</strong>
              <ul>
                {claim.support.map((support, idx) => (
                  <li key={`${support.url}-${idx}`}>
                    <a href={support.url} target="_blank" rel="noreferrer">
                      {support.url}
                    </a>
                    <div>{support.snippet}</div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {activeTab === 'contradictions' && (
        <div>
          {contradictions.length === 0 ? (
            <p>No contradictions reported.</p>
          ) : (
            <ul>
              {contradictions.map((item, idx) => (
                <li key={`${item.summary}-${idx}`}>{item.summary}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
