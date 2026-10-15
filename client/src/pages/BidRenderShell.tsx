/**
 * BidRenderShell — Main layout shell
 * Desktop: fixed left sidebar (icon-only 64px, expands to 224px when the
 *          pointer reaches one of its buttons — not its edge; see the aside)
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
 *
 * ── Changed 2026-10-14 (owner): daily work on top, setup at the bottom ──────
 * Work is now Dashboard, Bids, Plans, Clients — the four things opened every
 * day — and Library is Materials and Assemblies. Everything set up once and
 * left alone sits in the bottom group, with Settings: Performance, Labor
 * rates, Settings, Crew, and Admin for staff. Bids (/bids) and Plans (/plans)
 * came back as SCREENS with content — a searchable list of every bid, and
 * every bid with drawings — never as "which one?" choosers, which is what
 * removed them before. On a phone the five bottom slots are Dashboard, Bids,
 * Plans, Materials and More; More holds the rest.
 */
import { useApp } from "@/contexts/AppContext";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import SettingsPage from "@/pages/SettingsPage";
import MaterialDatabasePage from "@/pages/MaterialDatabasePage";
import DashboardPage from "@/pages/DashboardPage";
import { BackupHealthBanner } from "@/components/BackupHealthBanner";
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
import BidListPage from "@/pages/BidListPage";
import PlansIndexPage from "@/pages/PlansIndexPage";
import TrashPage from "@/pages/TrashPage";
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
  FileStack,
  Map as MapIcon,
  MoreHorizontal,
  Trash2,
  HelpCircle,
} from "lucide-react";
import { GuideStrip } from "@/components/GuideStrip";
import { HelpSearch } from "@/components/HelpSearch";
import type { GuideScreen } from "@/lib/guide";
import type { StepPlace } from "@shared/bidSteps";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { APP_VERSION_LABEL } from "@shared/version";
import { buildAgeLabel, buildStampLabel } from "@shared/buildStamp";
import { BUILD_STAMP } from "@/lib/buildStamp";
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
/**
 * Screens a bid can be opened FROM that its Back button should return to,
 * with the word the button shows (owner, 2026-10-14: "Back returns where you
 * were"). Anything else — a deep link, the welcome screen — goes back to the
 * Dashboard as before.
 */
const BID_ORIGINS: Partial<Record<Route, string>> = {
  dashboard: "Dashboard",
  "bid-list": "Bids",
  "plans-index": "Plans",
  clients: "Clients",
  analytics: "Performance",
  "bid-archive": "Deleted bids",
  trash: "Recently deleted",
};
/** The screens that belong to one bid: moving between them keeps the origin. */
const BID_SCREENS: ReadonlySet<Route> = new Set<Route>([
  "bids",
  "takeoff",
  "count",
  "proposal",
]);

function getCurrentRouteState(): RouteState {
  const hash = window.location.hash;
  if (hash && hash.length > 1) return pathToRoute(hash);
  return pathToRoute(window.location.pathname);
}

// ── Sidebar nav item helpers ───────────────────────────────────────────────
//
// At MODULE level, never inside BidRenderShell (2026-10-14). They were
// declared inside the shell's render, so every shell re-render made them a
// NEW component type and React unmounted and rebuilt the whole menu — twice
// in the first second after load, and again on any later re-render. A tap
// whose press and release straddled a rebuild landed on a detached button
// and did nothing: the first tap on Bids after opening the app was lost
// (found by e2e/smoke/newScreens.spec.ts; client/src/lib/shellNavStable.test.ts
// keeps them out here).
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
    data-nav-trigger
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
      className="whitespace-nowrap opacity-0 group-data-[open=true]:opacity-100 transition-opacity duration-150 truncate text-xs"
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
        className="hidden group-data-[open=true]:block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 whitespace-nowrap"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
      >
        {label}
      </span>
      {/* Collapsed stand-in for the heading. aria-hidden because the group is
          already named for assistive tech by the <nav> aria-label below. */}
      <span
        className="block group-data-[open=true]:hidden h-px bg-sidebar-border mx-1"
        aria-hidden
      />
    </div>
    {children}
  </div>
);

export default function BidRenderShell() {
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
  /** Where the current bid was opened from — see BID_ORIGINS. */
  const [bidOrigin, setBidOrigin] = useState<Route>("dashboard");
  /** Whether the desktop nav is widened — see the aside for what opens it. */
  const [navOpen, setNavOpen] = useState(false);

  const { route, projectId: activeProjectId, view: activeView } = routeState;

  const navigate = useCallback(
    (
      r: Route,
      options: { id?: number; view?: string; fixLineId?: number } = {}
    ) => {
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
        // Entering a bid from outside it: remember where from. Moving
        // between the bid, its plans, its count and its proposal does not.
        if (BID_SCREENS.has(state.route) && !BID_SCREENS.has(prev.route))
          setBidOrigin(BID_ORIGINS[prev.route] ? prev.route : "dashboard");
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
   * `bidridge.com/settings` — typed by hand, or a link written before the app
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
  const isInBidList = route === "bid-list";
  const isInPlansIndex = route === "plans-index";
  const isInTrash = route === "trash" || route === "bid-archive";
  /** Which Work entry a per-bid screen belongs to: the plans to Plans, the
   *  rest of a bid (the bid, its count, its proposal) to Bids. */
  const bidsActive = isInBidList || isInBids || isInCount || isInProposal;
  const plansActive = isInPlansIndex || isInTakeoff;
  /** What the phone's More menu holds — every destination that is not one
   *  of the four daily slots, in the laptop's order. */
  const moreItems = [
    {
      label: "Clients",
      icon: Users,
      active: isInClients,
      go: () => navigate("clients"),
    },
    {
      label: "Assemblies",
      icon: Layers,
      active: isInLibraryAsms,
      go: () => navigate("library-assemblies"),
    },
    ...(canSeeAnalytics
      ? [
          {
            label: "Performance",
            icon: BarChart3,
            active: isInAnalytics,
            go: () => navigate("analytics"),
          },
        ]
      : []),
    {
      label: "Labor rates",
      icon: HardHat,
      active: isInLaborRates,
      go: () => navigate("library-labor-rates"),
    },
    {
      label: "Recently deleted",
      icon: Trash2,
      active: isInTrash,
      go: () => navigate("trash"),
    },
    {
      label: "Where do I…?",
      icon: HelpCircle,
      active: false,
      go: () => setHelpOpen(true),
    },
    {
      label: "Settings",
      icon: Settings,
      active: isInSettings,
      go: () => navigate("settings"),
    },
    {
      label: "Crew",
      icon: UsersRound,
      active: isInTeam,
      go: () => navigate("team"),
    },
    ...(isAdmin
      ? [
          {
            label: "Admin",
            icon: Shield,
            active: isInAdmin,
            go: () => navigate("admin"),
          },
        ]
      : []),
  ];
  const moreActive = moreItems.some(item => item.active);

  // ── Guide mode (client/src/lib/guide.ts) ────────────────────────────────
  // "Where do I…?" opens from the guide strip, the sidebar and More.
  const [helpOpen, setHelpOpen] = useState(false);
  const guideScreen: GuideScreen = isOnDashboard
    ? "dashboard"
    : isInBids && activeProjectId
      ? "bid"
      : isInTakeoff
        ? "plans"
        : isInCount
          ? "count"
          : isInProposal
            ? "proposal"
            : "other";
  const guideBidId =
    guideScreen !== "dashboard" && guideScreen !== "other" && activeProjectId
      ? activeProjectId
      : null;
  const guideGo = (place: StepPlace) => {
    if (!guideBidId) return;
    navigate(
      place === "plans"
        ? "takeoff"
        : place === "proposal"
          ? "proposal"
          : "bids",
      { id: guideBidId }
    );
  };
  /** The phone's More menu, shut whenever the screen changes. */
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => setMoreOpen(false), [route, activeView]);

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

  // A column: the banner is a fixed row and the Dashboard the part that
  // gives. Side by side as siblings, the Dashboard's `h-full` was the whole
  // tab tall BELOW the banner, so its last rows sat the banner's height past
  // the bottom edge on every screen size (found 2026-10-13 by the device
  // audit's covered-at-the-bottom check).
  const dashboard = (
    <div className="flex flex-col h-full">
      <div className="shrink-0">
        <BackupHealthBanner isAdmin={isAdmin} />
      </div>
      <div className="flex-1 min-h-0">
        <DashboardPage
          onOpenBid={openBid}
          onOpenArchive={() => navigate("trash")}
          onOpenPlans={id => navigate("takeoff", { id })}
          onCount={id => navigate("count", { id })}
        />
      </div>
    </div>
  );

  // ── Content renderer ───────────────────────────────────────────────────────
  const renderContent = () => {
    if (isOnDashboard) return dashboard;
    if (isInBidList)
      return (
        <BidListPage
          onOpenBid={openBid}
          onOpenPlans={id => navigate("takeoff", { id })}
          onCount={id => navigate("count", { id })}
          onOpenArchive={() => navigate("trash")}
        />
      );
    if (route === "trash")
      return (
        <TrashPage
          onOpenBidArchive={() => navigate("bid-archive")}
          go={hash => {
            window.location.hash = hash;
          }}
        />
      );
    if (isInPlansIndex)
      return (
        <PlansIndexPage
          onOpenBid={openBid}
          onOpenPlans={id => navigate("takeoff", { id })}
          onCount={id => navigate("count", { id })}
        />
      );
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
    // Keyed on the id so a fresh /bids/:id remounts into that bid. The bare
    // /bids is the Bids list above (back since 2026-10-14).
    if (isInBids && activeProjectId)
      return (
        <BidsPage
          key={activeProjectId}
          bidId={activeProjectId}
          fixLineId={routeState.fixLineId}
          backLabel={BID_ORIGINS[bidOrigin] ?? "Dashboard"}
          onBack={() => navigate(bidOrigin)}
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
          onFixLine={lineId =>
            navigate("bids", { id: activeProjectId, fixLineId: lineId })
          }
        />
      );
    }
    if (isInBidArchive)
      return (
        <BidArchivePage onBack={() => navigate("trash")} onOpenBid={openBid} />
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

  return (
    <div
      /*
        h-dvh, not h-screen, and w-full, not w-screen.

        h-screen is 100vh, which on a phone or tablet is the height the window
        has with the address bar RETRACTED — the largest it ever gets. The bar
        is showing most of the time, so a shell sized that way hangs off the
        bottom of the screen by the height of the bar, permanently, and takes
        whatever is pinned to the bottom of a panel with it. h-dvh tracks the
        real height as the bar slides in and out. The page itself never
        scrolls (overflow-hidden here, scrollers inside), so the resize
        thrash that makes dvh awkward on a long article does not arise.

        w-screen is 100vw, which does NOT subtract a vertical scrollbar. On any
        platform with classic scrollbars that is a few pixels of horizontal
        overflow, which buys a horizontal scrollbar, which then eats a few
        pixels off the BOTTOM. w-full is the parent width, scrollbar already
        accounted for.

        `relative`, because "the page itself never scrolls" was not true
        until 2026-10-13. A `sr-only` label is position: absolute, and with
        no positioned ancestor its box is placed against the DOCUMENT, past
        every overflow-hidden in between — so a long Count or Proposal made
        the document 2,000 px tall, and on a phone the whole app, bottom bar
        and all, could be dragged up off the screen. Positioned here, they
        are contained and clipped like everything else.
      */
      className="relative flex h-dvh w-full overflow-hidden bg-background"
      style={{ zoom: uiFontScale }}
    >
      {/* ── Desktop Sidebar ─────────────────────────────────────── */}
      {/*
        ── It opens from its BUTTONS, not from anywhere over it ────────────────
        Changed 2026-09-24. This was a CSS :hover on the whole aside, so the
        8px of padding at its right edge opened it too — and on the plans page
        a folded sheet strip sits right against that edge. Overshooting the
        strip by a pixel widened the nav by 160px and threw the strip out from
        under the pointer. Now the pointer has to reach a button or the logo
        (anything marked data-nav-trigger); the padding, the gaps between
        buttons and the border are inert, and it closes when the pointer
        leaves the aside. Keyboard focus opens it the same way.
      */}
      <aside
        data-open={navOpen}
        onPointerOver={e => {
          if ((e.target as Element).closest("[data-nav-trigger]"))
            setNavOpen(true);
        }}
        onPointerLeave={() => setNavOpen(false)}
        onFocus={e => {
          if ((e.target as Element).closest("[data-nav-trigger]"))
            setNavOpen(true);
        }}
        onBlur={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null))
            setNavOpen(false);
        }}
        className="hidden md:flex flex-col shrink-0 w-16 data-[open=true]:w-56 transition-[width] duration-200 ease-out
                   bg-sidebar border-r border-sidebar-border overflow-hidden group z-20"
      >
        {/* Logo — click returns to the Dashboard */}
        <div
          data-nav-trigger
          onClick={() => navigate("dashboard")}
          className="flex items-center justify-center gap-2 px-3 py-4 h-16 border-b border-sidebar-border shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
          title="BidRidge — Dashboard"
        >
          <span
            className="font-bold text-[#F5C518] text-sm shrink-0 group-data-[open=true]:hidden"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            BR
          </span>
          <span
            className="font-bold text-base whitespace-nowrap hidden group-data-[open=true]:block transition-opacity duration-150"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            <span className="text-foreground">Bid</span>
            <span className="text-[#F5C518]">Ridge</span>
          </span>
        </div>
        {/*
          Three groups, in the order a job goes: what you open every day, what
          you build once and reuse, and what you set up and forget.

          ── Changed 2026-10-14 (owner) ───────────────────────────────────────
          Work is the daily work: Dashboard, Bids, Plans, Clients. Bids and
          Plans are back as SCREENS — every bid as a searchable list, every
          bid with drawings — so neither dead-ends on "which one?", the fault
          that took the old Bids list and Quick bid's chooser out of here.
          Labor rates and Performance moved down to the bottom group with
          Settings: both are set up or read now and then, not used daily.

          Still absent on purpose: Quick bid, Kits, Modifiers and Supplier
          Pricing (views of other screens; RETIRED_PATHS), and the Archive,
          which is offered on the Dashboard, the Bids list and a bid only once
          something is IN it — a permanent door to an empty room is a door to
          nowhere.
        */}
        <nav
          className="flex flex-col gap-1 p-2 flex-1 overflow-y-auto"
          aria-label="Main"
        >
          <NavSection label="Work">
            <NavBtn
              onClick={() => navigate("dashboard")}
              isActive={isOnDashboard}
              icon={LayoutDashboard}
              label="Dashboard"
              title="Dashboard — every bid by stage, and where a new one starts"
            />
            <NavBtn
              onClick={() => navigate("bid-list")}
              isActive={bidsActive}
              icon={FileStack}
              label="Bids"
              title="Bids — every bid in one list, searchable"
            />
            <NavBtn
              onClick={() => navigate("plans-index")}
              isActive={plansActive}
              icon={MapIcon}
              label="Plans"
              title="Plans — every bid with drawings, and Upload a plan"
            />
            {/* Business data about people outside the company, not
                configuration — so it stays out here rather than going under
                Company with the settings. */}
            <NavBtn
              onClick={() => navigate("clients")}
              isActive={isInClients}
              icon={Users}
              label="Clients"
              title="Clients — who the work is for"
            />
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

        {/* The bottom group sits outside the scrolling nav so it stays
            reachable at the bottom however long the rest grows. Settings is
            the anchor; what you set up once or read now and then sits with it. */}
        <div className="flex flex-col gap-1 p-2 pt-0 shrink-0">
          <NavSection label="Company">
            {/* Only for those who hold the capability. */}
            {canSeeAnalytics && (
              <NavBtn
                onClick={() => navigate("analytics")}
                isActive={isInAnalytics}
                icon={BarChart3}
                label="Performance"
                title="Performance — win rate and what the work earned"
              />
            )}
            {/* Rare after setup, but the first onboarding step and the rate
                multiplies every line of every bid, so it keeps its own entry
                rather than becoming a Settings tab. */}
            <NavBtn
              onClick={() => navigate("library-labor-rates")}
              isActive={isInLaborRates}
              icon={HardHat}
              label="Labor rates"
              title="Labor rates — what an hour costs, by role"
            />
            {/* Always shown, even empty (owner, 2026-10-14: "one easy-to-find
                place"). Unlike the old Archive entry, an empty page here
                still says something useful: where deleted things go. */}
            <NavBtn
              onClick={() => navigate("trash")}
              isActive={isInTrash}
              icon={Trash2}
              label="Recently deleted"
              title="Recently deleted — everything archived, with Restore"
            />
            {/* Guide mode's help search: local, no AI (helpTopics.ts). */}
            <NavBtn
              onClick={() => setHelpOpen(true)}
              isActive={false}
              icon={HelpCircle}
              label="Where do I…?"
              title="Where do I…? — find where anything is done"
            />
            <NavBtn
              onClick={() => navigate("settings")}
              isActive={isInSettings}
              icon={Settings}
              label="Settings"
              title="Settings — pricing defaults, branding, tax and display"
            />
            {/* Shown to every member whatever their role — a viewer needs to
                be able to find out that they are a viewer. */}
            <NavBtn
              onClick={() => navigate("team")}
              isActive={isInTeam}
              icon={UsersRound}
              label="Crew"
              title="Crew — who can get into this company"
            />
            {/* Staff only, and last. */}
            {isAdmin && (
              <NavBtn
                onClick={() => navigate("admin")}
                isActive={isInAdmin}
                icon={Shield}
                label="Admin"
                title="Admin"
              />
            )}
          </NavSection>
        </div>

        {/*
          Version tag, and under it the build this page actually is.

          The second line is the one a deploy is checked against, and it is
          there because the first line could not do that job: APP_VERSION is
          typed by hand, and on 2026-09-18 it had read v6.1 for thirty-three
          commits while two documents told the reader to confirm it had moved.
          The build stamp is written by the build itself, so it cannot be
          forgotten and cannot agree with a deploy that did not happen.

          Both lines stay hidden until the sidebar is hovered, as before — this
          is reference information, not something to read every day.
        */}
        <div className="px-3 py-2 border-t border-sidebar-border shrink-0">
          <div className="opacity-0 group-data-[open=true]:opacity-100 transition-opacity duration-150">
            <span className="block text-[10px] text-muted-foreground whitespace-nowrap font-mono">
              {APP_VERSION_LABEL}
            </span>
            <span
              className="block text-[10px] text-muted-foreground/70 whitespace-nowrap font-mono"
              title={
                BUILD_STAMP.builtAt
                  ? `This page was built ${buildAgeLabel(BUILD_STAMP, new Date()) ?? "at an unknown time"}`
                  : "Running from source — no build stamp"
              }
            >
              {buildStampLabel(BUILD_STAMP)}
            </span>
          </div>
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
            BidRidge
          </span>
          <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground font-mono">
            <ChevronRight size={12} />
            <span>
              {isOnDashboard
                ? "Dashboard"
                : route === "trash"
                  ? "Recently deleted"
                  : isInBidList
                    ? "Bids"
                    : isInPlansIndex
                      ? "Plans"
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
                              ? "Labor rates"
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
        <div
          className="flex-1 min-h-0 overflow-hidden tab-enter"
          key={routeKey}
        >
          {renderContent()}
        </div>

        {/* Guide mode: one tip, under the work, never over it. */}
        <GuideStrip
          screen={guideScreen}
          bidId={guideBidId}
          onGo={guideGo}
          onOpenHelp={() => setHelpOpen(true)}
        />
        <HelpSearch open={helpOpen} onOpenChange={setHelpOpen} />

        {/*
        ── Mobile Bottom Nav ──────────────────────────────────────────────────
        Five slots (owner, 2026-10-14): the four daily ones — Dashboard, Bids,
        Plans, Materials — and More, which opens everything else in one tap.
        Each slot now shows its word under the icon; five bare glyphs were a
        guessing game on the smallest screen.

        Until 2026-10-14 the slots were Dashboard, Clients, Materials,
        Assemblies and Settings, and before that two of them were Bids and
        Quick bid CHOOSERS. Bids and Plans are back as lists with content of
        their own, which is the difference.
      */}
        {/*
        Not on the Plans screen (track-b-phone-and-readability-plan.md § 3):
        it has its own bar along the bottom, and this one, fixed on top of
        it, covered the bar's "This sheet" line and the way into the panel.
        "← Bid" in the screen's own header goes back.
      */}
        {/*
        A ROW OF THE COLUMN, NOT A FIXED BAR (2026-10-13). It used to be
        `fixed bottom-0`, on top of a content area that ran to the bottom of
        the window — so the last item of every screen, scrolled all the way
        down, sat under it ("Pricing settings" on the bid page, half hidden).
        As the column's last `shrink-0` row the content area above it ends
        where the bar starts, by construction; no screen has to pad for it.
        `server/phoneBottomBar.test.ts` keeps it that way, and
        `pnpm device:audit` reports anything still covered at the bottom.
      */}
        <nav
          className={cn(
            "md:hidden shrink-0 flex bg-sidebar border-t border-border",
            isInTakeoff && "hidden"
          )}
          aria-label="Main"
        >
          {(
            [
              {
                label: "Dashboard",
                icon: LayoutDashboard,
                active: isOnDashboard,
                go: () => navigate("dashboard"),
              },
              {
                label: "Bids",
                icon: FileStack,
                active: bidsActive,
                go: () => navigate("bid-list"),
              },
              {
                label: "Plans",
                icon: MapIcon,
                active: plansActive,
                go: () => navigate("plans-index"),
              },
              {
                label: "Materials",
                icon: Boxes,
                active: isInLibraryMats,
                go: () => navigate("library-materials"),
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
              {item.label}
              {item.active && (
                <span className="absolute top-0 left-0 right-0 h-0.5 bg-[#F5C518] rounded-b" />
              )}
            </button>
          ))}
          {/* More: everything that is not daily work, in the same order as
              the laptop's lower groups. One tap opens it; picking closes it
              (the effect on route above). */}
          <Popover open={moreOpen} onOpenChange={setMoreOpen}>
            <PopoverTrigger asChild>
              <button
                aria-label="More"
                aria-current={moreActive ? "page" : undefined}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-1 py-3 text-[10px] font-medium transition-colors duration-150 relative",
                  moreActive ? "text-[#F5C518]" : "text-muted-foreground"
                )}
              >
                <MoreHorizontal
                  size={18}
                  className={moreActive ? "text-[#F5C518]" : ""}
                />
                More
                {moreActive && (
                  <span className="absolute top-0 left-0 right-0 h-0.5 bg-[#F5C518] rounded-b" />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="end"
              className="w-56 p-1"
              aria-label="More destinations"
            >
              {moreItems.map(item => (
                <button
                  key={item.label}
                  onClick={item.go}
                  aria-current={item.active ? "page" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-3 text-sm text-left hover:bg-accent",
                    item.active ? "text-[#F5C518]" : "text-foreground"
                  )}
                >
                  <item.icon size={18} className="shrink-0" />
                  {item.label}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </nav>
      </main>
    </div>
  );
}
