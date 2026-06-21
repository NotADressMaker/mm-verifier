export function renderJobBoardDashboard(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Agent Job Board + Escrow</title>
  <style>
    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      margin: 0;
      padding: 2rem;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 2rem;
    }
    h1 {
      margin: 0;
      font-size: 1.75rem;
    }
    .card {
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 20px 30px rgba(15, 23, 42, 0.4);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.95rem;
    }
    th, td {
      text-align: left;
      padding: 0.75rem 0.5rem;
      border-bottom: 1px solid #1f2937;
    }
    th {
      color: #94a3b8;
      font-weight: 600;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 0.2rem 0.6rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .badge.open { background: #1e3a8a; color: #bfdbfe; }
    .badge.awarded { background: #0f766e; color: #ccfbf1; }
    .badge.dispute { background: #7c2d12; color: #fed7aa; }
    .badge.closed { background: #374151; color: #e5e7eb; }
    .muted { color: #94a3b8; font-size: 0.85rem; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Agent Job Board + Escrow</h1>
      <p class="muted">On-chain jobs escrowed and released after validator approvals.</p>
    </div>
    <div class="muted" id="job-count">Loading…</div>
  </header>

  <div class="card">
    <table>
      <thead>
        <tr>
          <th>Job ID</th>
          <th>Status</th>
          <th>Agent</th>
          <th>Budget</th>
          <th>Released</th>
          <th>Deadline</th>
        </tr>
      </thead>
      <tbody id="job-table"></tbody>
    </table>
  </div>

  <script>
    function formatTimestamp(ts) {
      if (!ts || ts === '0') return '—';
      return new Date(Number(ts) * 1000).toLocaleString();
    }

    function formatBudget(amount) {
      if (!amount) return '0';
      return Number(amount) / 1e18 + ' ETH';
    }

    async function loadJobs() {
      const response = await fetch('/api/job-board');
      const data = await response.json();
      const table = document.getElementById('job-table');
      const count = document.getElementById('job-count');

      count.textContent = data.total + ' job(s)';
      table.innerHTML = '';

      if (!data.jobs || data.jobs.length === 0) {
        table.innerHTML = '<tr><td colspan="6" class="muted">No jobs yet.</td></tr>';
        return;
      }

      data.jobs.forEach((job) => {
        const row = document.createElement('tr');
        const agentDisplay = job.agent === '0x0000000000000000000000000000000000000000'
          ? '—'
          : job.agent.slice(0, 6) + '…' + job.agent.slice(-4);
        row.innerHTML = '<td>#' + job.jobId + '</td>' +
          '<td><span class="badge ' + job.status + '">' + job.status + '</span></td>' +
          '<td title="' + job.agent + '">' + agentDisplay + '</td>' +
          '<td>' + formatBudget(job.budgetAmount) + '</td>' +
          '<td>' + formatBudget(job.totalReleased) + '</td>' +
          '<td>' + formatTimestamp(job.deadline) + '</td>';
        table.appendChild(row);
      });
    }

    loadJobs();
  </script>
</body>
</html>`;
}
