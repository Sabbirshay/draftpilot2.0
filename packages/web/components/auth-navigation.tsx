"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import AuthLoading from "./auth-loading";

export default function AuthNavigation() {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  useEffect(() => setPending(false), [pathname]);
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setPending(false), 20000);
    return () => window.clearTimeout(timer);
  }, [pending]);
  useEffect(() => {
    const reset = () => setPending(false);
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element).closest?.("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, location.href);
      if (url.origin === location.origin && ["/login", "/signup", "/admin/sign-in", "/api/auth/google"].includes(url.pathname) && url.href !== location.href) setPending(true);
    };
    document.addEventListener("click", click, true);
    window.addEventListener("pageshow", reset);
    return () => { document.removeEventListener("click", click, true); window.removeEventListener("pageshow", reset); };
  }, []);
  return pending ? <AuthLoading message="Taking you to sign in…" /> : null;
}
