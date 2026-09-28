export const metadata = { title: "Restricted sign-in | DraftPilot", robots: { index: false, follow: false } };
export default async function AdminSignIn({searchParams}: {searchParams: Promise<{access?: string}>}) {
  const denied = (await searchParams).access === "not-enabled";
  return <main className="auth-form" style={{maxWidth: 460, margin: "80px auto", padding: 24}}>
    <h1>Restricted access</h1><p>Use your authorized Google account, then verify with Google Authenticator.</p>
    {denied && <p role="alert">This account does not have administrator access enabled. Your sign-in completed, but the dashboard remains locked.</p>}
    <a className="button primary" href="/api/auth/google?admin=1">Continue with Google</a>
    <p><a href="/">Back to DraftPilot</a></p>
  </main>;
}
