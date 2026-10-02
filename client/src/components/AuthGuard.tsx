import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import LoginPage from "@/pages/LoginPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import { isResetAddress } from "@/lib/resetLink";
import LandingPageContainer from "@/pages/landing/LandingPageContainer";
import { addressAfterSignOut, landingAfterSignIn } from "@/lib/signInLanding";
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
  /** Was this browser signed in at some point during this visit? */
  const wasSignedIn = useRef(false);
  /**
   * On the emailed reset link. Checked BEFORE the signed-in question: the
   * link works whether or not this browser is signed in (someone locked out
   * on their phone may still be signed in on this laptop), and a successful
   * reset signs this browser out along with every other.
   */
  const [resetting, setResetting] = useState(() =>
    isResetAddress(window.location.hash)
  );
  /** Said once on the sign-in form after a reset, then gone. */
  const [signInNotice, setSignInNotice] = useState<string>();

  useEffect(() => {
    const onHash = () => {
      if (isResetAddress(window.location.hash)) setResetting(true);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  /**
   * Clear the address when somebody signs out.
   *
   * Routing is hash-based and signing out does not touch the address, so
   * leaving Settings would keep `#/settings` in the bar — and the next sign-in
   * would mount the app straight back onto it. Wiping it here means anything
   * left in the address afterwards is something the person actually asked for,
   * which is what makes the deep-link case below trustworthy.
   *
   * Only on the signed-in → signed-out transition. A visitor who arrives
   * already signed out may be following a link to a particular bid, and that
   * link must survive.
   */
  useEffect(() => {
    if (user) {
      wasSignedIn.current = true;
      return;
    }
    if (!wasSignedIn.current) return;
    wasSignedIn.current = false;
    window.location.hash = `#${addressAfterSignOut()}`;
  }, [user]);

  if (resetting)
    return (
      <ResetPasswordPage
        onDone={outcome => {
          // Off the reset address, so the next screen is not the reset page
          // again and the sign-in lands where it normally would.
          window.history.replaceState(
            null,
            "",
            window.location.pathname + window.location.search
          );
          setResetting(false);
          setSignInNotice(
            outcome === "changed"
              ? "Password changed, and every other session signed out. Sign in with your new password."
              : undefined
          );
          setSigningIn(true);
        }}
      />
    );

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={28} className="animate-spin text-[#F5C518]" />
          <p className="text-sm text-muted-foreground">Loading BidRidge…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (signingIn)
      return (
        <LoginPage
          notice={signInNotice}
          onSuccess={() => {
            // Whatever is in the address now is either a link this person
            // followed while signed out, or nothing in particular — the
            // sign-out above cleared anything left over from last time. See
            // @/lib/signInLanding.
            window.location.hash = `#${landingAfterSignIn(window.location.hash)}`;
            refresh();
          }}
        />
      );
    return <LandingPageContainer onSignIn={() => setSigningIn(true)} />;
  }

  return <>{children}</>;
}
