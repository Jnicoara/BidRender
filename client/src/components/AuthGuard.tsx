import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/_core/hooks/useAuth";
import { isSignInQuery, shouldDropAccountCache } from "@/lib/accountCache";
import LoginPage from "@/pages/LoginPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import { isResetAddress } from "@/lib/resetLink";
import { inviteCodeFromHash, isSignupAddress } from "@/lib/signupLink";
import LandingPageContainer from "@/pages/landing/LandingPageContainer";
import { addressAfterSignOut, landingAfterSignIn } from "@/lib/signInLanding";
import { Loader2 } from "lucide-react";
import { SESSION_EXPIRED_KEY, expiryNotice } from "@/lib/sessionExpiry";

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
  const { user, loading, refresh, error } = useAuth();
  /*
    The server could not reach its data (SERVICE_UNAVAILABLE from auth.me —
    server/_core/context.ts). NOT "signed out": until 2026-10-14 this fell
    through to the landing page, so a database blip showed a signed-in
    contractor "Sign in / Get early access" (failure drill,
    references/stress-results.md). Retried by itself every 10 s.
  */
  const unavailable =
    !user &&
    !!error &&
    (error as { data?: { code?: string } }).data?.code ===
      "SERVICE_UNAVAILABLE";

  /*
    The signed-in person changed (signed out, or someone else in): drop every
    cached read but the sign-in check, so nothing read for one company is on
    the next one's screen (@/lib/accountCache — company B saw company A's
    bids after A signed out on the same tab). A database blip is not a
    change of person, so it leaves the cache and the tracking alone.
  */
  const queryClient = useQueryClient();
  const lastUserId = useRef<number | null>(null);
  useEffect(() => {
    if (unavailable || loading) return;
    const next = user?.id ?? null;
    if (shouldDropAccountCache(lastUserId.current, next))
      queryClient.removeQueries({
        predicate: query => !isSignInQuery(query.queryKey),
      });
    lastUserId.current = next;
  }, [user?.id, unavailable, loading, queryClient]);
  useEffect(() => {
    if (!unavailable) return;
    const timer = window.setInterval(() => refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, [unavailable, refresh]);
  /*
    Signed out mid-work (client/src/lib/sessionExpiry.ts): read once, then
    forgotten. With a note the sign-in form opens straight away, saying why,
    instead of the marketing page.
  */
  const [expired] = useState(() => {
    try {
      const notice = expiryNotice(sessionStorage.getItem(SESSION_EXPIRED_KEY));
      sessionStorage.removeItem(SESSION_EXPIRED_KEY);
      return notice;
    } catch {
      return null;
    }
  });
  /** A visitor asked to sign in, so the form replaces the marketing page. */
  const [signingIn, setSigningIn] = useState(expired !== null);
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
  const [signInNotice, setSignInNotice] = useState<string | undefined>(
    expired ?? undefined
  );
  /**
   * On a sign-up link — `#/signup`, usually `?invite=<code>` from an invite
   * (@/lib/signupLink). Read once, like the reset address; the code is kept
   * here and the form sends it with the sign-up.
   */
  const [signupLink, setSignupLink] = useState(() =>
    isSignupAddress(window.location.hash)
      ? { code: inviteCodeFromHash(window.location.hash) }
      : null
  );

  useEffect(() => {
    const onHash = () => {
      if (isResetAddress(window.location.hash)) setResetting(true);
      if (isSignupAddress(window.location.hash))
        setSignupLink({ code: inviteCodeFromHash(window.location.hash) });
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

  if (unavailable)
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background px-4">
        <div className="max-w-sm text-center space-y-3">
          <p className="text-base font-semibold text-foreground">
            Can't reach BidRidge right now
          </p>
          <p className="text-sm text-muted-foreground">
            You're still signed in and nothing you saved is lost. This is a
            problem on our side — it tries again by itself every few seconds.
          </p>
          <button
            type="button"
            onClick={() => refresh()}
            className="inline-flex h-9 items-center rounded-md bg-[#F5C518] px-4 text-sm font-medium text-black"
          >
            Try again now
          </button>
        </div>
      </div>
    );

  if (!user) {
    if (signingIn || signupLink)
      return (
        <LoginPage
          notice={signInNotice}
          initialMode={signupLink ? "signup" : "login"}
          inviteCode={signupLink?.code ?? null}
          onJoinWaitlist={() => {
            setSignupLink(null);
            setSigningIn(false);
            // The landing page's early-access form (LandingPage.tsx
            // SIGNUP_ANCHOR); the landing page renders on this same address.
            window.location.hash = "#early-access";
          }}
          onSuccess={() => {
            // Off the sign-up address, so the invite code does not stay in
            // the address bar or land the app on an address it does not have.
            if (isSignupAddress(window.location.hash))
              window.history.replaceState(
                null,
                "",
                window.location.pathname + window.location.search
              );
            setSignupLink(null);
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
