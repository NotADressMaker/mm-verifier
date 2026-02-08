import React, { useEffect, useMemo, useState } from 'react';
import { fetchJson } from '../api';
import { DebugTrace, DebugTraceStage } from '../types';

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => {
        const lowered = key.toLowerCase();
        if (
          lowered.includes('api_key') ||
          lowered.includes('token') ||
          lowered.includes('secret') ||
          lowered.includes('authorization')
        ) {
          return [key, '[redacted]'];
        }
        return [key, redact(val)];
      })
    );
  }
  return value;
}

function formatDuration(stage: DebugTraceStage) {
  if (typeof stage.duration_ms === 'number') {
    return `${stage.duration_ms} ms`;
  }
  if (stage.end_ms && stage.start_ms) {
    return `${stage.end_ms - stage.start_ms} ms`;
  }
  return '—';
}

export default function JobDebug({ jobId }: { jobId: string }) {
  const [trace, setTrace] = useState<DebugTrace | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetchJson<{ trace: DebugTrace }>(`/api/jobs/${jobId}/trace`);
        if (active) setTrace(response.trace);
      } catch (err) {
        if (active) setError((err as Error).message);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [jobId]);

  const stages = useMemo(() => trace?.stages ?? [], [trace]);

  return (
    <div className="container">
      <div className="header">
        <div>
          <h1>Debug Trace: {jobId}</h1>
          <a href={`/jobs/${jobId}`}>← Back to job</a>
        </div>
        {trace && <span className="badge">Trace {trace.trace_id.slice(0, 8)}…</span>}
      </div>

      <div className="card">
        <h2>Stages</h2>
        {error && <p>Failed to load trace: {error}</p>}
        {!error && stages.length === 0 && <p>No trace data available.</p>}
        {!error && stages.length > 0 && (
          <div className="debug-grid">
            {stages.map((stage, idx) => (
              <div key={`${stage.name}-${idx}`} className="debug-stage">
                <div className="debug-stage-header">
                  <div>
                    <strong>{stage.name}</strong>
                    <span className={`badge badge-${stage.status}`}>{stage.status}</span>
                  </div>
                  <span className="muted">{formatDuration(stage)}</span>
                </div>
                {stage.error && (
                  <div className="debug-error">
                    {stage.error.message}
                    {stage.error.code ? ` (${stage.error.code})` : ''}
                  </div>
                )}
                {stage.outputs && (
                  <details>
                    <summary>Outputs</summary>
                    <pre>{JSON.stringify(redact(stage.outputs), null, 2)}</pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
