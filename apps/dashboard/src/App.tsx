import React, { useEffect, useMemo, useState } from 'react';
import { fetchJson } from './api';
import JobTable from './components/JobTable';
import JobDetail from './pages/JobDetail';
import { JobRecord } from './types';

function useJobList() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetchJson<{ jobs: JobRecord[] }>(`/api/jobs`);
        if (active) {
          setJobs(response.jobs ?? []);
        }
      } catch (err) {
        if (active) setError((err as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  return { jobs, error, loading };
}

export default function App() {
  const path = window.location.pathname;
  const jobId = useMemo(() => {
    const parts = path.split('/').filter(Boolean);
    return parts[0] === 'jobs' && parts[1] ? parts[1] : null;
  }, [path]);

  if (jobId) {
    return <JobDetail jobId={jobId} />;
  }

  const { jobs, error, loading } = useJobList();

  return (
    <div className="container">
      <div className="header">
        <div>
          <h1>MMV Dashboard</h1>
          <p>Mock verifier job list and receipts.</p>
        </div>
        <span className="badge">API: /api/jobs</span>
      </div>

      <div className="card">
        <h2>Jobs</h2>
        {loading && <p>Loading jobs…</p>}
        {error && <p>Failed to load jobs: {error}</p>}
        {!loading && !error && jobs.length === 0 && <p>No jobs found.</p>}
        {!loading && !error && jobs.length > 0 && <JobTable jobs={jobs} />}
      </div>
    </div>
  );
}
