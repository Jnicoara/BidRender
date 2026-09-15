import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AppProvider } from "./contexts/AppContext";
import { useTheme } from "./contexts/ThemeContext";
import AuthGuard from "./components/AuthGuard";

/**
 * The estimating app, split out of the first download.
 *
 * A signed-out visitor gets the marketing page, and there is no reason for that
 * page — the first impression for every prospective user — to ship the plan
 * viewer, the library screens and the whole bid workspace behind it. Splitting
 * here rather than deeper is what makes the boundary meaningful: everything the
 * app needs hangs off this one component, and everything the landing page needs
 * is already in the entry chunk.
 *
 * A signed-in user pays for the chunk once, on a screen that was always going
 * to show a loading state while auth resolved.
 */
const BidRenderShell = lazy(() => import("./pages/BidRenderShell"));

// Toaster that follows the active theme
function ToasterWithTheme() {
  const { theme } = useTheme();
  return <Toaster theme={theme} />;
}

/** Shown only while the app chunk arrives — never on the landing page. */
function AppChunkFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 size={28} className="animate-spin text-[#F5C518]" />
    </div>
  );
}

/**
 * One route, matching everything.
 *
 * ── Why there is no 404 screen ───────────────────────────────────────────────
 * Routing inside the app is hash-based, so every real address shares the single
 * pathname `/` and wouter has nothing to discriminate on. What the catch-all
 * actually caught was a pathname-spelled address — someone typing
 * `bidrender.com/settings`, or a link written before the hash — and it answered
 * with the template's 404 card: a light slate gradient and a blue button inside
 * a dark app, telling a contractor the page "may have been moved or deleted"
 * when it had not.
 *
 * The shell already knows what to do with those. `getCurrentRouteState` falls
 * back to `window.location.pathname` when there is no hash, so `/settings`
 * resolves to Settings and a genuinely unknown path resolves to the Dashboard —
 * which is the destination @/lib/appRoutes argues for and the one this screen
 * was overriding. The shell then rewrites the address into its hash spelling,
 * the same way a retired address heals itself.
 */
function Router() {
  return (
    <AuthGuard>
      <Suspense fallback={<AppChunkFallback />}>
        <Switch>
          <Route component={BidRenderShell} />
        </Switch>
      </Suspense>
    </AuthGuard>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable={true}>
        <AppProvider>
          <TooltipProvider>
            <ToasterWithTheme />
            <Router />
          </TooltipProvider>
        </AppProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
