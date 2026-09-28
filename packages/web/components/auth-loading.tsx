import Image from "next/image";

export default function AuthLoading({ message = "Opening your workspace…" }: { message?: string }) {
  return <div className="auth-loading" role="status" aria-live="polite" aria-busy="true">
    <div className="auth-loading-card">
      <span className="auth-loading-brand">DraftPilot<span>.</span></span>
      <div className="auth-loading-art">
        <Image className="auth-loading-motion" src="/auth-loading.webp" width={400} height={300} alt="" unoptimized priority />
        <Image className="auth-loading-still" src="/auth-loading-still.webp" width={400} height={300} alt="" unoptimized priority />
      </div>
      <h2>{message}</h2>
      <p>We’re getting things ready for you.</p>
    </div>
  </div>;
}
