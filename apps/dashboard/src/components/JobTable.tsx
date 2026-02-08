import React from 'react';
import { JobRecord } from '../types';

function statusClass(status: string) {
  switch (status) {
    case 'completed':
      return 'success';
    case 'running':
      return 'warn';
    case 'failed':
      return 'fail';
    default:
      return '';
  }
}

export default function JobTable({ jobs }: { jobs: JobRecord[] }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Job ID</th>
          <th>Status</th>
          <th>Program</th>
          <th>Created</th>
          <th>Score</th>
          <th>Verdict</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((job) => (
          <tr key={job.jobId}>
            <td>
              <a href={`/jobs/${job.jobId}`}>{job.jobId}</a>
            </td>
            <td>
              <span className={`badge ${statusClass(job.status)}`}>{job.status}</span>
            </td>
            <td>{job.programId ?? 'default'}</td>
            <td>{new Date(job.createdAt).toLocaleString()}</td>
            <td>{job.scoreBps !== undefined ? (job.scoreBps / 100).toFixed(2) : '--'}</td>
            <td>{job.verdict === undefined ? '--' : job.verdict ? 'ACCEPT' : 'REJECT'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
