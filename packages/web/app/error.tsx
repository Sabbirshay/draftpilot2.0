"use client";
export default function ErrorPage({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="auth-form" style={{ paddingTop: 100 }}>
      <h2>Let’s try that again.</h2>
      <p className="muted">
        The workspace couldn’t finish loading. Your saved workspace data is
        still on the server.
      </p>
      <button className="button primary" onClick={retry}>
        Reload workspace
      </button>
    </main>
  );
}
