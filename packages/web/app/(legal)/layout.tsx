import Link from "next/link";
import "./legal.css";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return <div className="legal-shell">
    <header className="legal-header"><Link href="/" className="legal-brand">DraftPilot<span>.</span></Link><Link href="/login">Sign in →</Link></header>
    <main id="main" className="legal-content">{children}</main>
    <footer className="legal-footer"><span>DraftPilot · Bangladesh</span><nav aria-label="Legal navigation"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><a href="mailto:support@draftpilot.com">Contact support</a></nav></footer>
  </div>;
}
