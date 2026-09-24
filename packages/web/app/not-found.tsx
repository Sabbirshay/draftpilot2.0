export default function NotFound() {
  return (
    <main className="auth-form" style={{ paddingTop: 100 }}>
      <h2>This page flew off course.</h2>
      <p className="muted">Head back to your DraftPilot workspace.</p>
      <a className="button primary" href="/">
        Back to workspace →
      </a>
    </main>
  );
}
