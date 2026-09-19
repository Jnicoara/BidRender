import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { authRouter } from "./routers/authRouter";
import { projectsRouter } from "./routers/projectsRouter";
import { masterItemsRouter } from "./routers/masterItemsRouter";
import { masterAssembliesRouter } from "./routers/masterAssembliesRouter";
import { masterLaborRatesRouter } from "./routers/masterLaborRatesRouter";
import { projectAssembliesRouter } from "./routers/projectAssembliesRouter";
import { projectItemsRouter } from "./routers/projectItemsRouter";
import { bidSummaryRouter } from "./routers/bidSummaryRouter";
import { materialsRouter } from "./routers/materialsRouter";
import { laborRatesRouter } from "./routers/laborRatesRouter";
import { modifiersRouter } from "./routers/modifiersRouter";
import { assembliesRouter } from "./routers/assembliesRouter";
import { bidsRouter } from "./routers/bidsRouter";
import { clientsRouter } from "./routers/clientsRouter";
import { salesTaxRouter } from "./routers/salesTaxRouter";
import { bidExtrasRouter } from "./routers/bidExtrasRouter";
import { materialsListRouter } from "./routers/materialsListRouter";
import { accountingRouter } from "./routers/accountingRouter";
import { companyRouter } from "./routers/companyRouter";
import { closeoutRouter } from "./routers/closeoutRouter";
import { analyticsRouter } from "./routers/analyticsRouter";
import { sampleRouter } from "./routers/sampleRouter";
import { proposalsRouter } from "./routers/proposalsRouter";
import { bidPdfsRouter } from "./routers/bidPdfsRouter";
import { takeoffHeightsRouter } from "./routers/takeoffHeightsRouter";
import { takeoffRunsRouter } from "./routers/takeoffRunsRouter";
import { takeoffGroupsRouter } from "./routers/takeoffGroupsRouter";
import { takeoffRunTypesRouter } from "./routers/takeoffRunTypesRouter";
import { takeoffStampsRouter } from "./routers/takeoffStampsRouter";
import { kitsRouter } from "./routers/kitsRouter";
import { onboardingRouter } from "./routers/onboardingRouter";
import { navigationRouter } from "./routers/navigationRouter";
import { planCopilotRouter } from "./routers/planCopilotRouter";
import { earlyAccessRouter } from "./routers/earlyAccessRouter";
import { backupRouter } from "./routers/backupRouter";
import { aiUsageRouter } from "./routers/aiUsageRouter";

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  projects: projectsRouter,
  masterItems: masterItemsRouter,
  masterAssemblies: masterAssembliesRouter,
  masterLaborRates: masterLaborRatesRouter,
  projectAssemblies: projectAssembliesRouter,
  projectItems: projectItemsRouter,
  bidSummary: bidSummaryRouter,
  materials: materialsRouter,
  laborRates: laborRatesRouter,
  modifiers: modifiersRouter,
  assemblies: assembliesRouter,
  bids: bidsRouter,
  // Who the work is for. A bid points at one optionally — see shared/bidClient.ts
  // for how a linked record and a bid's own typed-in name are reconciled.
  clients: clientsRouter,
  // Sales tax areas and the company rules that say what is taxable. Nothing
  // here is seeded — see shared/salesTax.ts for why a shipped rate table
  // would be worse than none.
  salesTax: salesTaxRouter,
  // Flat charges and includes/excludes — reusable lists plus what is attached
  // to a bid. Both snapshot onto the bid, as every library in this app does.
  bidExtras: bidExtrasRouter,
  materialsList: materialsListRouter,
  accounting: accountingRouter,
  // Access control: who is in the company and what they may do. Every route
  // acts on ctx.scope.companyId — none of them take a company id.
  company: companyRouter,
  // Job close-out: actual hours against the estimate, and the suggestions that
  // fall out of them. Nothing here writes to the library without a person.
  closeout: closeoutRouter,
  // Company performance — win rate and what finished jobs actually earned.
  // Aggregated in SQL over the whole history, and gated tighter than the rest
  // of the bid layer: owners and admins only. See the router header.
  analytics: analyticsRouter,
  // The shipped example bid. Ordinary rows flagged isSample — see
  // shared/sampleProject.ts for why that is a column and not a name.
  sample: sampleRouter,
  proposals: proposalsRouter,
  bidPdfs: bidPdfsRouter,
  takeoffRuns: takeoffRunsRouter,
  takeoffHeights: takeoffHeightsRouter,
  takeoffGroups: takeoffGroupsRouter,
  takeoffRunTypes: takeoffRunTypesRouter,
  takeoffStamps: takeoffStampsRouter,
  kits: kitsRouter,
  onboarding: onboardingRouter,
  navigation: navigationRouter,
  // Separate from `navigation` on purpose — separate scope, separate action
  // list, separate model call. See the header of planCopilotRouter.
  planCopilot: planCopilotRouter,
  // The marketing landing page's waitlist. Carries the app's only public
  // write — see the router header for what guards it instead of auth.
  earlyAccess: earlyAccessRouter,
  // Admin-only. Exports everything to Cloudflare R2, independent of Manus —
  // scripts/backup.mts is the same job without needing the app to be up.
  backup: backupRouter,
  aiUsage: aiUsageRouter,
});

export type AppRouter = typeof appRouter;
