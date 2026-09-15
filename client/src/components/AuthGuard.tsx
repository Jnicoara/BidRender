import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import LoginPage from "@/pages/LoginPage";
import LandingPageContainer from "@/pages/landing/LandingPageContainer";
import { Loader2 } from "lucide-react";

interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * AuthGuard — wraps the entire app.
 *
 * Shows a loading spinner while auth state is being fetched, the public
 * landing page to a visitor, and the app to a signed-in user.
 *
 * ── Why a visitor gets marketing and not the login form ─────────────────────
 * This used to drop straight to LoginPage, which is the right screen for
 * someone who has an account and the wrong one for everybody else: a stranger
 * arriving at the URL met a sign-in box for a product whose name does not
 * explain itself. The landing page is that first impression now, and signing in
 * is one click away in its header for people who already know what this is.
 *
 * The choice is held here rather than in the router because it is an auth
 * question, not a routing one — and because routing inside the app is
 * hash-based, so every app URL shares the single wouter path this wraps.
 */
export default function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading, refresh } = useAuth();
  /** A visitor asked to sign in, so the form replaces the marketing page. */
  const [signingIn, setSigningIn] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={28} className="animate-spin text-[#F5C518]" />
          <p className="text-sm text-muted-foreground">Loading BidRender…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (signingIn) return <LoginPage onSuccess={() => refresh()} />;
    return <LandingPageContainer onSignIn={() => setSigningIn(true)} />;
  }

  return <>{children}</>;
}
