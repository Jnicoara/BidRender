/**
 * HelixBidShell — Main layout shell
 * Desktop: fixed left sidebar (icon-only 64px, expands to 224px on hover)
 * Mobile:  fixed bottom navigation bar
 * Design: Tactical Dark Mode SaaS, Safety Yellow accent (#F5C518)
 *
 * ── Eight destinations, in three groups ──────────────────────────────────────
 * The sidebar carried fourteen. Six of those sat in one group, which is past
 * the point where a group reads as a group — and the sidebar is 64px of
 * unlabelled icons until you hover it, so a new user was choosing between
 * fourteen glyphs.
 *
 * Three of the fourteen were not screens at all. The Bids LIST was a header, a
 * New bid button, an archive entry and a search panel — every one of which the
 * Dashboard already rendered. Quick bid's top-level page was a bid CHOOSER over
 * an unpaginated list. Supplier Pricing showed the same `materials` rows as the
 * catalog, with different columns. Folding those, plus Kits and Modifiers into
 * Assemblies and Crew into Company, leaves eight.
 *
 * The addresses they used to live at are not dead — see RETIRED_PATHS in
 * @/lib/appRoutes, which sends each to the screen that took its job and
 * rewrites the address bar so a bookmark heals itself.
 */
import { useApp } from "@/contexts/AppContext";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import SettingsPage from "@/pages/SettingsPage";
import MaterialDatabasePage from "@/pages/MaterialDatabasePage";
import DashboardPage from "@/pages/DashboardPage";
import AdminSettingsPage from "@/pages/AdminSettingsPage";
import MaterialsLibraryPage from "@/pages/MaterialsLibraryPage";
import LaborRatesPage from "@/pages/LaborRatesPage";
import ModifiersPage from "@/pages/ModifiersPage";
import AssembliesLibraryPage from "@/pages/AssembliesLibraryPage";
import BidsPage from "@/pages/BidsPage";
import QuickBidPage from "@/pages/QuickBidPage";
import TakeoffPage from "@/pages/TakeoffPage";
import ProposalPage from "@/pages/ProposalPage";
import BidArchivePage from "@/pages/BidArchivePage";
import KitsPage from "@/pages/KitsPage";
import ClientsPage from "@/pages/ClientsPage";
import TeamPage from "@/pages/TeamPage";
import AnalyticsPage from "@/pages/AnalyticsPage";
import FirstRunPage from "@/pages/FirstRunPage";
import { useCompany } from "@/hooks/useCompany";
import { trpc } from "@/lib/trpc";
import {
  Settings,
  ChevronRight,
  Shield,
  Boxes,
  HardHat,
  Layers,
  LayoutDashboard,
  Users,
  UsersRound,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_VERSION_LABEL } from "@shared/version";
import {
  pathToRoute,
  retiredAddress,
  routeToPath,
  type Route,
  type RouteState,
  type SettingsSection,
} from "@/lib/appRoutes";

/**
 * The route model lives in @/lib/appRoutes, with a test against it.
 *
 * Folding five screens into three retires five addresses, and a retired address
 * is what breaks quietly in a restructure — so the mapping is a table that can
 * be asserted without a browser rather than a switch statement in here.
 */
function getCurrentRouteState(): RouteState {
  const hash = window.location.hash;
  if (hash && hash.length > 1) return pathToRoute(hash);
  return pathToRoute(window.location.pathname);
}

export default function HelixBidShell() {
  const { uiFontScale } = useApp();

  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  /**
   * Whether to offer Performance at all.
   *
   * Not protection — the server enforces `analytics.view` and this hook says so
   * at the top of its own file. It is honesty: an estimator who clicks a nav
   * item and lands on "you cannot see this" has been shown a door that was
   * never theirs, and hiding it tells them what their account is.
   */
  const { can } = useCompany();
  const canSeeAnalytics = can("analytics.view");

  // ── URL-based routing using hash ──────────────────────────────────────────
  const [routeState, setRouteState] = useState<RouteState>(() =>
    getCurrentRouteState()
  );
  const [previousRoute, setPreviousRoute] = useState<Route>("dashboard");

  const { route, projectId: activeProjectId, view: activeView } = routeState;

  const navigate = useCallback(
    (r: Route, options: { id?: number; view?: string } = {}) => {
      window.location.hash = routeToPath(r, options);
    },
    []
  );

  const goBack = useCallback(() => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigate(previousRoute);
    }
  }, [navigate, previousRoute]);

  useEffect(() => {
    const onHashChange = () => {
      const state = getCurrentRouteState();
      setRouteState(prev => {
        setPreviousRoute(prev.route);
        return state;
      });
    };
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("popstate", onHashChange);
    onHashChange();
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("popstate", onHashChange);
    };
  }, []);

  /**
   * Rewrite a retired address to the one that replaced it.
   *
   * `replaceState` rather than assigning the hash: following an old bookmark
   * should not leave a dead address in history for Back to return to. The
   * screen is already correct before this runs — pathToRoute resolves retired
   * paths on the first paint — so this only makes the URL agree with what the
   * user is already looking at.
   */
  useEffect(() => {
    const canonical = retiredAddress(window.location.hash);
    if (!canonical) return;
    window.history.replaceState(null, "", `#${canonical}`);
  }, [routeState]);

  /**
   * Rewrite a pathname-spelled address into the hash spelling.
   *
   * `helixbid.app/settings` — typed by hand, or a link written before the app
   * became hash-routed — resolves correctly already, because
   * getCurrentRouteState falls back to the pathname. But the pathname then
   * stays on the URL while every later navigation writes only the hash, giving
   * addresses like `/settings#/dashboard` that say two different things.
   *
   * Once, on mount, and only when there is no hash to conflict with. An
   * unrecognised pathname resolves to the Dashboard on the way through, so this
   * heals a bad bookmark rather than preserving it.
   */
  useEffect(() => {
    if (window.location.hash.length > 1) return;
    if (window.location.pathname === "/") return;
    const canonical = routeToPath(routeState.route, {
      id: routeState.projectId,
      view: routeState.view,
    });
    window.history.replaceState(null, "", `/#${canonical}`);
    // Mount only, deliberately: after this the hash is authoritative and the
    // effect above owns any further rewriting.
  }, []);

  // ── Derived state ──────────────────────────────────────────────────────────
  const isOnDashboard = route === "dashboard";
  const isInSettings = route === "settings";
  const isInLibraryMats = route === "library-materials";
  const isInLaborRates = route === "library-labor-rates";
  const isInLibraryAsms = route === "library-assemblies";
  const isInBids = route === "bids";
  const isInClients = route === "clients";
  const isInTeam = route === "team";
  const isInAnalytics = route === "analytics";
  const isInTakeoff = route === "takeoff";
  const isInProposal = route === "proposal";
  const isInBidArchive = route === "bid-archive";
  const isInCount = route === "count";
  const isOnWelcome = route === "welcome";
  const isInAdmin = route === "admin";

  /**
   * Send a brand-new account to the welcome screen instead of the Dashboard.
   *
   * Only from the landing route. Redirecting from ANY route would trap a new
   * user who deliberately clicked into, say, Materials — and would fight the
   * welcome screen's own "start my first bid" hand-off.
   *
   * Existing accounts were stamped as onboarded by the migration that added the
   * column, so nobody who already uses the app sees this.
   */
  const { data: onboarding } = trpc.onboarding.state.useQuery();
  useEffect(() => {
    if (!onboarding?.isFirstRun) return;
    if (route !== "dashboard") return;
    window.location.hash = "#/welcome";
  }, [onboarding?.isFirstRun, route]);

  const openBid = useCallback(
    (id: number) => navigate("bids", { id }),
    [navigate]
  );

  const dashboard = (
    <DashboardPage
      onOpenBid={openBid}
      onOpenArchive={() => navigate("bid-archive")}
      onOpenPlans={id => navigate("takeoff", { id })}
      onCount={id => navigate("count", { id })}
    />
  );

  // ── Content renderer ───────────────────────────────────────────────────────
  const renderContent = () => {
    if (isOnDashboard) return dashboard;
    if (isInSettings)
      return (
        <SettingsPage section={(activeView ?? "pricing") as SettingsSection} />
      );
    // Materials and its supply-house lens are the same rows; the view only
    // decides which columns. See LibraryTabs.
    if (isInLibraryMats)
      return activeView === "pricing" ? (
        <MaterialDatabasePage />
      ) : (
        <MaterialsLibraryPage />
      );
    if (isInLaborRates) return <LaborRatesPage />;
    if (isInLibraryAsms) {
      if (activeView === "kits") return <KitsPage />;
      if (activeView === "modifiers") return <ModifiersPage />;
      return <AssembliesLibraryPage />;
    }
    // Keyed on the id so a fresh /bids/:id remounts into that bid. There is no
    // list mode any more — /bids redirects to the Dashboard, which carried the
    // same search and the same New bid all along.
    if (isInBids && activeProjectId)
      return (
        <BidsPage
          key={activeProjectId}
          bidId={activeProjectId}
          onBack={() => navigate("dashboard")}
        />
      );
    if (isInTakeoff && activeProjectId) {
      return (
        <TakeoffPage
          key={`takeoff-${activeProjectId}`}
          bidId={activeProjectId}
          onBack={() => navigate("bids", { id: activeProjectId })}
        />
      );
    }
    // Counting, given a bid. Keyed like the takeoff surface for the same
    // reason: a different bid is a different set of counts.
    if (isInCount && activeProjectId) {
      return (
        <QuickBidPage
          key={`count-${activeProjectId}`}
          bidId={activeProjectId}
          onBack={() => navigate("bids", { id: activeProjectId })}
        />
      );
    }
    // Keyed like the takeoff surface: a different bid is a different document.
    if (isInProposal && activeProjectId) {
      return (
        <ProposalPage
          key={`proposal-${activeProjectId}`}
          bidId={activeProjectId}
          onBack={() => navigate("bids", { id: activeProjectId })}
        />
      );
    }
    if (isInBidArchive)
      return (
        <BidArchivePage
          onBack={() => navigate("dashboard")}
          onOpenBid={openBid}
        />
      );
    if (isInClients) return <ClientsPage />;
    if (isInTeam) return <TeamPage />;
    if (isInAnalytics) return <AnalyticsPage onOpenBid={openBid} />;
    if (isOnWelcome) return <FirstRunPage />;
    if (isInAdmin) return <AdminSettingsPage />;
    // Every legacy workspace this used to fall through to is gone. The
    // Dashboard is the honest landing for an address that no longer exists.
    return dashboard;
  };

  // Keyed on the view as well as the route, so switching Assemblies → Kits
  // replays the enter transition instead of swapping content under a static
  // frame — the tab strip is the only thing telling you the screen changed.
  const routeKey = `${route}:${activeView ?? ""}`;

  // ── Sidebar nav item helper ────────────────────────────────────────────────
  const NavBtn = ({
    onClick,
    isActive,
    icon: Icon,
    label,
    title,
  }: {
    onClick: () => void;
    isActive: boolean;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    label: string;
    title?: string;
  }) => (
    <button
      onClick={onClick}
      title={title ?? label}
      className={cn(
        "flex items-center gap-3 px-2.5 py-2.5 rounded-md text-sm font-medium transition-all duration-150",
        "hover:bg-accent hover:text-accent-foreground",
        isActive ? "bp-tab-active text-foreground" : "text-muted-foreground"
      )}
    >
      <Icon
        size={20}
        className={cn("shrink-0", isActive ? "text-[#F5C518]" : "")}
      />
      <span
        className="whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 truncate text-xs"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
      >
        {label}
      </span>
    </button>
  );

  /**
   * A labelled group of nav items.
   *
   * ── Why it has two appearances ──────────────────────────────────────────────
   * The sidebar is 64px of icons until you hover it, so a text heading alone
   * would leave the grouping invisible in the state the sidebar is in almost
   * all of the time. Collapsed, each group is separated by a hairline rule;
   * expanded, that rule is replaced by the actual word. Either way the three
   * purposes read as three things rather than one long list.
   *
   * The headings are plain nouns naming what the group is FOR — Work, Library,
   * Company — so someone scanning top to bottom can tell daily tools from
   * building blocks from the things they set up once.
   */
  const NavSection = ({
    label,
    children,
  }: {
    label: string;
    children: React.ReactNode;
  }) => (
    <div className="flex flex-col gap-1">
      <div className="px-2.5 pt-3 pb-1 first:pt-1">
        <span
          className="hidden group-hover:block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 whitespace-nowrap"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {label}
        </span>
        {/* Collapsed stand-in for the heading. aria-hidden because the group is
            already named for assistive tech by the <nav> aria-label below. */}
        <span
          className="block group-hover:hidden h-px bg-sidebar-border mx-1"
          aria-hidden
        />
      </div>
      {children}
    </div>
  );

  return (
    <div
      className="flex h-screen w-screen overflow-hidden bg-background"
      style={{ zoom: uiFontScale }}
    >
      {/* ── Desktop Sidebar ─────────────────────────────────────── */}
      <aside
        className="hidden md:flex flex-col shrink-0 w-16 hover:w-56 transition-[width] duration-200 ease-out
                   bg-sidebar border-r border-sidebar-border overflow-hidden group z-20"
      >
        {/* Logo — click returns to the Dashboard */}
        <div
          onClick={() => navigate("dashboard")}
          className="flex items-center justify-center gap-2 px-3 py-4 h-16 border-b border-sidebar-border shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
          title="BidRender — Dashboard"
        >
          <span
            className="font-bold text-[#F5C518] text-sm shrink-0 group-hover:hidden"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            BR
          </span>
          <span
            className="font-bold text-base whitespace-nowrap hidden group-hover:block transition-opacity duration-150"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            <span className="text-foreground">Bid</span>
            <span className="text-[#F5C518]">Render</span>
          </span>
        </div>

        {/*
          Three groups, in the order a job goes: what you open every day, what
          you build once and reuse, and what you set up and forget.

          ── What is deliberately absent ──────────────────────────────────────
          Bids, Quick bid, Kits, Modifiers and Supplier Pricing are not hidden;
          they are not destinations. The first two were choosers over lists the
          Dashboard already shows, and the last three are views of the screen
          above them in this list. Every one of their addresses still resolves
          (see RETIRED_PATHS).

          The Archive is not here either, and that is a change: it is offered on
          the Dashboard and on a bid, but only once something is IN it. A
          permanent entry to a room that is empty for most users most of the
          time is a door to nowhere, and it was sitting in the group people
          scan when they are lost.

          Takeoff is absent for the original reason: it lives at /bids/:id/plans
          and needs a bid to open, so a top-level entry would dead-end on
          "which one?" — which is exactly the fault that removed Bids and Quick
          bid from this list too.
        */}
        <nav
          className="flex flex-col gap-1 p-2 flex-1 overflow-y-auto"
          aria-label="Main"
        >
          <NavSection label="Work">
            <NavBtn
              onClick={() => navigate("dashboard")}
              isActive={isOnDashboard || isInBids || isInTakeoff}
              icon={LayoutDashboard}
              label="Dashboard"
              title="Dashboard — every bid by stage, and where a new one starts"
            />
            {/* Business data about people outside the company, not
                configuration — so it stays out here rather than going under
                Company with the settings. It sits next to the Dashboard
                because a bid is what it attaches to. */}
            <NavBtn
              onClick={() => navigate("clients")}
              isActive={isInClients}
              icon={Users}
              label="Clients"
              title="Clients — who the work is for"
            />
            {/* Last in Work, and only for those who hold the capability. The
                one read-only screen in the app: reporting behind a
                configuration menu is reporting nobody opens. */}
            {canSeeAnalytics && (
              <NavBtn
                onClick={() => navigate("analytics")}
                isActive={isInAnalytics}
                icon={BarChart3}
                label="Performance"
                title="Performance — win rate and what the work earned"
              />
            )}
          </NavSection>

          <NavSection label="Library">
            {/* Materials carries its own supply-house lens as a tab. Two nav
                entries for one table meant an estimator had to know which
                address owned the field they wanted to edit. */}
            <NavBtn
              onClick={() => navigate("library-materials")}
              isActive={isInLibraryMats}
              icon={Boxes}
              label="Materials"
              title="Materials — the catalog, and your supplier's prices on it"
            />
            {/* Rare after setup, but it is the first onboarding step and the
                rate multiplies every line of every bid, so it stays findable
                on its own rather than becoming a tab. */}
            <NavBtn
              onClick={() => navigate("library-labor-rates")}
              isActive={isInLaborRates}
              icon={HardHat}
              label="Labor Rates"
              title="Labor Rates — what an hour costs, by role"
            />
            {/* Kits and Modifiers are tabs in here: a kit contains assemblies
                and nothing else, and a modifier adjusts an assembly's labor,
                so neither means anything without this screen. */}
            <NavBtn
              onClick={() => navigate("library-assemblies")}
              isActive={isInLibraryAsms}
              icon={Layers}
              label="Assemblies"
              title="Assemblies — recipes, kits and job-condition modifiers"
            />
          </NavSection>
        </nav>

        {/* Company sits outside the scrolling nav so it stays reachable at the
            bottom however long the Library grows. */}
        <div className="flex flex-col gap-1 p-2 pt-0 shrink-0">
          <NavSection label="Company">
            <NavBtn
              onClick={() => navigate("settings")}
              isActive={isInSettings}
              icon={Settings}
              label="Settings"
              title="Settings — pricing defaults, branding, tax and display"
            />
            {/* Here rather than in Work: hiring is not a working rhythm, and
                this screen is invite codes and role assignment. Shown to every
                member whatever their role — a viewer needs to be able to find
                out that they are a viewer. */}
            <NavBtn
              onClick={() => navigate("team")}
              isActive={isInTeam}
              icon={UsersRound}
              label="Crew"
              title="Crew — who can get into this company"
            />
            {/* Admin only, and last: nobody else has it, and those who do do
                not need it above the things they use. */}
            {isAdmin && (
              <NavBtn
                onClick={() => navigate("admin")}
                isActive={isInAdmin}
                icon={Shield}
                label="Admin"
                title="Admin Settings"
              />
            )}
          </NavSection>
        </div>

        {/* Version tag */}
        <div className="px-3 py-2 border-t border-sidebar-border shrink-0">
          <span className="text-[10px] text-muted-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 font-mono">
            {APP_VERSION_LABEL}
          </span>
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="md:hidden flex items-center gap-3 px-4 h-14 border-b border-border shrink-0 bg-sidebar">
          <span
            className="font-bold text-base text-foreground cursor-pointer"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            onClick={() => navigate("dashboard")}
          >
            BidRender
          </span>
          <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground font-mono">
            <ChevronRight size={12} />
            <span>
              {isOnDashboard
                ? "Dashboard"
                : isInSettings
                  ? "Settings"
                  : isInLibraryMats
                    ? activeView === "pricing"
                      ? "Supplier pricing"
                      : "Materials"
                    : isInLibraryAsms
                      ? activeView === "kits"
                        ? "Kits"
                        : activeView === "modifiers"
                          ? "Modifiers"
                          : "Assemblies"
                      : isInLaborRates
                        ? "Labor Rates"
                        : isInClients
                          ? "Clients"
                          : isInTeam
                            ? "Crew"
                            : isInAnalytics
                              ? "Performance"
                              : isInAdmin
                                ? "Admin"
                                : "Bid"}
            </span>
          </div>
        </header>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden tab-enter" key={routeKey}>
          {renderContent()}
        </div>
      </main>

      {/*
        ── Mobile Bottom Nav ──────────────────────────────────────────────────
        Five slots, and now they hold five of the eight real destinations
        rather than two choosers and three screens. Performance, Crew and Admin
        are reachable from Settings and are not things anyone does on a phone
        in a truck.

        It previously spent two of the five on Bids and Quick bid, which on the
        smallest screen was the most expensive place to put a "which one?".
      */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex bg-sidebar border-t border-border"
        aria-label="Main"
      >
        {(
          [
            {
              label: "Dashboard",
              icon: LayoutDashboard,
              active: isOnDashboard || isInBids || isInTakeoff,
              go: () => navigate("dashboard"),
            },
            {
              label: "Clients",
              icon: Users,
              active: isInClients,
              go: () => navigate("clients"),
            },
            {
              label: "Materials",
              icon: Boxes,
              active: isInLibraryMats,
              go: () => navigate("library-materials"),
            },
            {
              label: "Assemblies",
              icon: Layers,
              active: isInLibraryAsms,
              go: () => navigate("library-assemblies"),
            },
            {
              label: "Settings",
              icon: Settings,
              active: isInSettings,
              go: () => navigate("settings"),
            },
          ] as const
        ).map(item => (
          <button
            key={item.label}
            onClick={item.go}
            aria-label={item.label}
            aria-current={item.active ? "page" : undefined}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1 py-3 text-[10px] font-medium transition-colors duration-150 relative",
              item.active ? "text-[#F5C518]" : "text-muted-foreground"
            )}
          >
            <item.icon
              size={18}
              className={item.active ? "text-[#F5C518]" : ""}
            />
            {item.active && (
              <span className="absolute top-0 left-0 right-0 h-0.5 bg-[#F5C518] rounded-b" />
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
