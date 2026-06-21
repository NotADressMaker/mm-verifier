import React, { useMemo, useState } from 'react';
import JobDetail from './pages/JobDetail';
import JobDebug from './pages/JobDebug';

type IconName =
  | 'shield'
  | 'sparkles'
  | 'check'
  | 'alert'
  | 'external'
  | 'file'
  | 'download'
  | 'copy'
  | 'chevron';

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    shield: <><path d="M12 3 5 6v5c0 4.4 2.9 8.4 7 10 4.1-1.6 7-5.6 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-5"/></>,
    sparkles: <><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z"/><path d="m5 15 .7 2.3L8 18l-2.3.7L5 21l-.7-2.3L2 18l2.3-.7L5 15Z"/><path d="m19 13 .5 1.5 1.5.5-1.5.5L19 17l-.5-1.5L17 15l1.5-.5L19 13Z"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    alert: <><path d="M10.3 4.1 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 4.1a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></>,
    external: <><path d="M15 3h6v6M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></>,
    download: <><path d="M12 3v12m0 0 5-5m-5 5-5-5"/><path d="M5 21h14"/></>,
    copy: <><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const claims = [
  {
    id: '01',
    state: 'supported',
    text: 'The James Webb Space Telescope launched on December 25, 2021.',
    source: 'NASA — Webb Telescope Launch',
    domain: 'nasa.gov',
    detail: 'NASA’s mission timeline confirms launch aboard an Ariane 5 from French Guiana on December 25, 2021.',
  },
  {
    id: '02',
    state: 'supported',
    text: 'JWST orbits the Sun near the second Lagrange point, about 1.5 million kilometers from Earth.',
    source: 'ESA — Webb’s orbit at L2',
    domain: 'esa.int',
    detail: 'ESA describes Webb’s halo orbit around Sun–Earth L2 and its approximate distance from Earth.',
  },
  {
    id: '03',
    state: 'partial',
    text: 'Its primary mirror is 6.5 meters wide and made from 18 gold-plated beryllium segments.',
    source: 'NASA — Mirrors Webb/NASA',
    domain: 'science.nasa.gov',
    detail: 'The source supports the dimensions and 18-segment construction. “Gold-plated” is accurate but simplifies the thin gold coating.',
  },
  {
    id: '04',
    state: 'supported',
    text: 'Webb observes primarily in infrared wavelengths, allowing it to study very distant galaxies.',
    source: 'STScI — About Webb',
    domain: 'stsci.edu',
    detail: 'STScI documents Webb’s infrared instruments and their role in observing highly redshifted early galaxies.',
  },
];

export default function App() {
  const path = window.location.pathname;
  const routeInfo = useMemo(() => {
    const parts = path.split('/').filter(Boolean);
    return parts[0] === 'jobs' && parts[1] ? { jobId: parts[1], debug: parts[2] === 'debug' } : null;
  }, [path]);
  const [openClaim, setOpenClaim] = useState('01');
  const [copied, setCopied] = useState(false);

  if (routeInfo?.jobId && routeInfo.debug) return <JobDebug jobId={routeInfo.jobId} />;
  if (routeInfo?.jobId) return <JobDetail jobId={routeInfo.jobId} />;

  const copyReceipt = async () => {
    await navigator.clipboard?.writeText('mamv_rcpt_01J8Y7K4R6V2AX91Q3EM');
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="MM-Verifier home">
          <span className="brand-mark"><Icon name="shield" size={20} /></span>
          <span>MM<span>·</span>Verifier</span>
        </a>
        <nav className="nav-links" aria-label="Main navigation">
          <a className="active" href="#verification">Verification</a>
          <a href="#receipts">Receipts</a>
          <a href="#docs">Docs</a>
        </nav>
        <div className="network-pill"><span className="pulse-dot" /> Network operational</div>
      </header>

      <main>
        <section className="intro">
          <div className="eyebrow"><Icon name="sparkles" size={15} /> AI answer verification</div>
          <h1>Don’t just trust the answer.<br/><em>Verify every claim.</em></h1>
          <p>MM-Verifier checks AI-generated answers against their cited sources, then creates a signed, auditable record of what it found.</p>
        </section>

        <section className="workspace" id="verification">
          <div className="answer-panel">
            <div className="panel-heading">
              <div><span className="step-number">1</span><div><h2>AI-generated answer</h2><p>Submitted with 4 cited sources</p></div></div>
              <span className="source-engine">AI SEARCH</span>
            </div>
            <div className="question"><span>QUESTION</span><p>What are the key facts about the James Webb Space Telescope?</p></div>
            <article className="answer-copy">
              <p>The <mark data-claim="01">James Webb Space Telescope launched on December 25, 2021</mark>, beginning its mission to explore the early universe.</p>
              <p>Unlike Hubble, JWST <mark data-claim="02">orbits the Sun near the second Lagrange point (L2), approximately 1.5 million kilometers from Earth</mark>. Its <mark className="partial-mark" data-claim="03">6.5-meter primary mirror is assembled from 18 gold-plated beryllium segments</mark>.</p>
              <p>The telescope <mark data-claim="04">observes primarily in infrared wavelengths, allowing it to study very distant galaxies</mark> whose light has been stretched by the expansion of the universe.</p>
            </article>
            <div className="answer-footer"><span><span className="legend supported"/> Supported claim</span><span><span className="legend partial"/> Partially supported</span><span>4 claims detected</span></div>
          </div>

          <aside className="result-panel">
            <div className="panel-heading compact"><div><span className="step-number">2</span><div><h2>Verification result</h2><p>Completed in 2.4 seconds</p></div></div></div>
            <div className="score-block">
              <div className="score-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52"/><circle className="progress" cx="60" cy="60" r="52" pathLength="100"/></svg><div><strong>91%</strong><span>SUPPORT</span></div></div>
              <div className="score-copy"><span className="verified-badge"><Icon name="check" size={14}/> VERIFIED</span><h3>Strongly supported</h3><p>Most claims are directly backed by reliable sources.</p></div>
            </div>
            <div className="metric-row"><div><strong>3</strong><span>Supported</span></div><div><strong>1</strong><span>Partial</span></div><div><strong>0</strong><span>Unsupported</span></div></div>
            <div className="claim-results">
              {claims.map((claim) => <button key={claim.id} className={openClaim === claim.id ? 'selected' : ''} onClick={() => setOpenClaim(claim.id)}><span className={`claim-icon ${claim.state}`}><Icon name={claim.state === 'supported' ? 'check' : 'alert'} size={14}/></span><span><b>Claim {claim.id}</b><small>{claim.state === 'supported' ? 'Supported' : 'Partially supported'}</small></span><Icon name="chevron" size={15}/></button>)}
            </div>
          </aside>
        </section>

        <section className="evidence-section">
          <div className="section-heading"><span className="step-number">3</span><div><h2>Inspect the evidence</h2><p>Every assessment links back to the exact supporting source.</p></div></div>
          <div className="evidence-card">
            <div className="evidence-status"><span className={`claim-icon ${claims.find(c => c.id === openClaim)?.state}`}><Icon name={claims.find(c => c.id === openClaim)?.state === 'supported' ? 'check' : 'alert'} size={17}/></span><div><span>CLAIM {openClaim}</span><h3>{claims.find(c => c.id === openClaim)?.state === 'supported' ? 'Supported by source' : 'Partially supported by source'}</h3></div></div>
            <blockquote>“{claims.find(c => c.id === openClaim)?.text}”</blockquote>
            <div className="source-box"><div className="source-favicon">{claims.find(c => c.id === openClaim)?.domain.charAt(0).toUpperCase()}</div><div><strong>{claims.find(c => c.id === openClaim)?.source}</strong><span>{claims.find(c => c.id === openClaim)?.domain}</span></div><a href="#source">Open source <Icon name="external" size={14}/></a></div>
            <p className="source-detail">{claims.find(c => c.id === openClaim)?.detail}</p>
          </div>
        </section>

        <section className="receipt-section" id="receipts">
          <div className="receipt-copy"><div className="eyebrow dark"><Icon name="shield" size={15}/> Durable proof</div><h2>A receipt that outlives<br/>the answer.</h2><p>The result is cryptographically signed and bundled with its evidence. Anyone can inspect or independently verify it later—without relying on MM-Verifier.</p><ul><li><Icon name="check" size={15}/> Tamper-evident signature</li><li><Icon name="check" size={15}/> Complete evidence bundle</li><li><Icon name="check" size={15}/> Independently verifiable</li></ul></div>
          <div className="receipt-card">
            <div className="receipt-top"><div className="receipt-brand"><span className="brand-mark small"><Icon name="shield" size={15}/></span><div><strong>Verification receipt</strong><span>MAMV RECEIPT · V1.0</span></div></div><span className="signed"><Icon name="check" size={12}/> SIGNED</span></div>
            <div className="receipt-score"><span>VERIFICATION RESULT</span><strong>Verified: 91% support</strong></div>
            <div className="receipt-data"><div><span>Receipt ID</span><code>mamv_rcpt_01J8Y7K4R6V2AX91Q3EM</code></div><button onClick={copyReceipt} title="Copy receipt ID"><Icon name={copied ? 'check' : 'copy'} size={16}/></button></div>
            <div className="receipt-meta"><div><span>Issued</span><strong>13 Jun 2026, 14:32 UTC</strong></div><div><span>Claims</span><strong>4 assessed</strong></div><div><span>Evidence hash</span><strong>0x7e4a…9c21</strong></div><div><span>Signer</span><strong>MAMV Network</strong></div></div>
            <div className="receipt-actions"><button><Icon name="file" size={16}/> Inspect receipt</button><button><Icon name="download" size={16}/> Evidence bundle</button></div>
          </div>
        </section>
      </main>
      <footer><div className="brand muted-brand"><span className="brand-mark"><Icon name="shield" size={18}/></span>MM<span>·</span>Verifier</div><p>Trust, but verify—every claim, every time.</p><span>Receipt protocol v1.0</span></footer>
    </div>
  );
}
