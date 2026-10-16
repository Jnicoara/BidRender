import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from "@shared/const";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import { registerServiceWorker } from "@/lib/registerServiceWorker";
import { markStagingEnvironment } from "@/lib/appEnvironment";
import { shouldRetryRead } from "@/lib/queryRetry";
import StagingBand from "@/components/StagingBand";
import { NewVersionBar } from "@/components/NewVersionBar";
import { DataUnreachableBar } from "@/components/DataUnreachableBar";
import {
  noteNoAnswer,
  noteReadFailure,
  noteReadSuccess,
  setPendingWrites,
} from "@/lib/dataReach";
import { markPageOutOfDate } from "@/lib/versionCheck";
import { QUERY_DEADLINE_MS, withQueryDeadline } from "@/lib/queryDeadline";
import { isPriceHistoryQuery, isStepBarQuery } from "@/lib/stepBarQuery";
import {
  SESSION_EXPIRED_KEY,
  addressAfterExpiry,
  expiryNote,
} from "@/lib/sessionExpiry";
import "./index.css";

/*
  Finished mutations are let go as soon as nothing on screen watches them.

  React Query keeps one for 5 minutes by default (`gcTime`), and with it the
  callbacks it was given — which close over the screen that made it. Measured
  2026-10-15 (references/stress-results.md, "Memory"): every visit to a dense
  Plans screen fires a few saves whose callbacks hold its canvas ref, so the
  whole drawing — ~14,600 DOM nodes and 4,400 listeners for 2,000 marks —
  stayed alive for 5 minutes after leaving, and each further visit in that
  window stacked another copy (90,000 nodes after six). Nothing here reads a
  finished mutation (no useMutationState / useIsMutating), and a mounted
  useMutation keeps its own result, so 0 loses nothing.
*/
const queryClient = new QueryClient({
  defaultOptions: {
    mutations: { gcTime: 0 },
    // "Not found" / "not yours" are answers, not hiccups (@/lib/queryRetry).
    queries: { retry: shouldRetryRead },
  },
});

const redirectToLoginIfUnauthorized = (
  error: unknown,
  fromMutation = false
) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  // Signed out mid-work: keep the address and say why on the sign-in form
  // (client/src/lib/sessionExpiry.ts). This jumped to "/" with no word until
  // 2026-10-15, dropping the change and the bid it was on.
  try {
    sessionStorage.setItem(SESSION_EXPIRED_KEY, expiryNote(fromMutation));
  } catch {
    // Storage blocked: the sign-in form simply shows no note.
  }
  window.location.href = addressAfterExpiry(getLoginUrl(), window.location);
  // Same path and hash is not a navigation; reload so the app re-asks who
  // is signed in.
  if (getLoginUrl() === "/") window.location.reload();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    noteReadFailure(error);
    console.error("[API Query Error]", error);
  }
  // Any read that answers means the data is reachable (@/lib/dataReach).
  if (event.type === "updated" && event.action.type === "success")
    noteReadSuccess();
});

/** The unreachable bar's retry: ask again for what is on screen. */
const retryVisibleReads = () =>
  void queryClient.refetchQueries({ type: "active" });

// The bid's step bar (BidStepBar) counts marks, runs, lines and sheets that
// nearly every editing mutation on a bid moves. Rather than adding it to each
// screen's refresh helper — and missing one, the stale-number fault CLAUDE.md
// § "A test that calls the server cannot see a screen showing yesterday's
// answer" describes — ANY successful mutation lets it go. It is one small
// query, refetched only while a bar is on screen.
queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "success")
    void queryClient.invalidateQueries({
      predicate: query =>
        isStepBarQuery(query.queryKey) || isPriceHistoryQuery(query.queryKey),
    });
});

// How many saves are in flight or held for a reconnect — paused ones count,
// since they are still "pending". Read before any reload (@/lib/lazyPage).
queryClient
  .getMutationCache()
  .subscribe(() => setPendingWrites(queryClient.isMutating()));

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error, true);
    noteReadFailure(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        // Preview auto-login fallback: when the browser blocks iframe cookies
        // (Safari ITP / private browsing / WebView), the runtime mirrors the
        // session into sessionStorage so we can forward it as a Bearer token.
        // The regular OAuth cookie flow keeps working and takes priority server-side.
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) {
              return { Authorization: `Bearer ${token}` };
            }
          }
        } catch {
          // sessionStorage unavailable
        }
        return {};
      },
      // A read that never answers is given up on and retried, rather than
      // holding a screen blank for good (@/lib/queryDeadline) — and says so
      // at once, rather than after every retry (@/lib/dataReach).
      fetch(input, init) {
        return withQueryDeadline(
          globalThis.fetch,
          QUERY_DEADLINE_MS,
          noteNoAnswer
        )(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

// Installed-app behaviour: caches the shell so a repeat visit is instant, and
// nothing else. Production only, and a no-op wherever workers are unavailable —
// see the module for why neither is incidental.
registerServiceWorker();

// A piece of the app failed to load: almost always a tab that outlived a
// deploy, asking for a hashed file the new build no longer has. Not
// preventDefault()ed, so the import still fails into the error screen, which
// then says "updated, refresh" instead of "stopped working" (ErrorBoundary).
// Never reloads by itself; see @/lib/versionCheck for why.
// Offline is not a deploy: a file that could not download with no signal
// said "A new version is available — Refresh", and Refresh then would have
// dropped any save held for the reconnect (drill, 2026-10-15). The page
// loader reloads by itself once the connection is back (@/lib/lazyPage).
window.addEventListener("vite:preloadError", () => {
  if (navigator.onLine === false) return;
  markPageOutOfDate();
});

// Before the first render, so no screen is ever drawn without room for the band.
const isStaging = markStagingEnvironment(document);

createRoot(document.getElementById("root")!).render(
  <>
    {isStaging && <StagingBand />}
    <NewVersionBar />
    <DataUnreachableBar retry={retryVisibleReads} />
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  </>
);
