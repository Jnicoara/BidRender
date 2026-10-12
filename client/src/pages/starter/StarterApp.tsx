/**
 * Everything at `/starter` (baseline-screen-plan.md § 1): the starter
 * editor's sign-in, then the baseline screen. Mounted by App.tsx INSTEAD of
 * the company app, never inside it — no AuthGuard, no company shell, no
 * company query. See @/lib/starterAddress for why the split is by pathname.
 *
 * Signed in = `starterAuth.me` answers. Any starter call that answers
 * "Sign in again." means the session ended (30 minutes idle, 8 hours at
 * most, or a reset of the account), and the page goes back to the sign-in
 * with that said, rather than leaving a screen of lists that can no longer
 * load.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import StarterSignInPage from "./StarterSignInPage";
import StarterScreen from "./StarterScreen";

const ENDED = "Your session ended. Sign in again.";

export default function StarterApp() {
  const utils = trpc.useUtils();
  const me = trpc.starterAuth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: true,
  });
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    document.title = "BidRidge starter";
  }, []);

  // The cookie expires at sessionEndsAt; ask again just after, so an idle
  // screen turns into the sign-in on its own instead of waiting for a click.
  const endsAt = me.data?.sessionEndsAt;
  useEffect(() => {
    if (!endsAt) return;
    const wait = Math.max(0, endsAt - Date.now()) + 1000;
    const timer = window.setTimeout(() => {
      void utils.starterAuth.me.invalidate();
    }, wait);
    return () => window.clearTimeout(timer);
  }, [endsAt, utils]);

  const onSessionEnded = useCallback(() => {
    setNotice(ENDED);
    void utils.starterAuth.me.invalidate();
  }, [utils]);

  if (me.isLoading)
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <Loader2 size={28} className="animate-spin text-[#F5C518]" />
      </div>
    );

  // isError as well as !data: a refetch that fails keeps the old data.
  if (me.isError || !me.data)
    return (
      <StarterSignInPage
        notice={me.data ? ENDED : notice}
        onSignedIn={() => {
          setNotice(undefined);
          void utils.starterAuth.me.invalidate();
        }}
      />
    );

  return (
    <StarterScreen
      me={me.data}
      onSessionEnded={onSessionEnded}
      onSignedOut={() => {
        setNotice("Signed out.");
        utils.starterAuth.me.setData(undefined, undefined);
        void utils.starterAuth.me.invalidate();
      }}
    />
  );
}
