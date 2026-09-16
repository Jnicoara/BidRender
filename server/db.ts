import {
  and,
  desc,
  eq,
  asc,
  inArray,
  isNull,
  isNotNull,
  gte,
  lte,
  lt,
  or,
  like,
  sql,
} from "drizzle-orm";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";
import { mysqlConnection } from "./databaseConnection";
import {
  InsertUser,
  InsertProject,
  InsertUserMaterialsDb,
  InsertMasterItem,
  InsertMasterAssembly,
  InsertMasterAssemblyItem,
  InsertMasterLaborRate,
  InsertProjectAssembly,
  InsertProjectAssemblyItem,
  InsertProjectItem,
  InsertBidSummary,
  InsertMaterial,
  Material,
  materials,
  InsertLaborRate,
  LaborRate,
  laborRates,
  InsertModifier,
  Modifier,
  ModifierStatus,
  LibraryStatus,
  modifiers,
  InsertAssembly,
  Assembly,
  assemblies,
  assemblyMaterials,
  assemblyModifiers,
  InsertPricingDefaults,
  PricingDefaults,
  pricingDefaults,
  InsertCompanyBranding,
  CompanyBranding,
  companyBranding,
  InsertProposalSettings,
  ProposalSettings,
  proposalSettings,
  InsertBid,
  Bid,
  bids,
  InsertClient,
  Client,
  clients,
  InsertTaxJurisdiction,
  TaxJurisdictionRow,
  taxJurisdictions,
  InsertExpenseItem,
  ExpenseItem,
  expenseItems,
  InsertBidExpense,
  BidExpense,
  bidExpenses,
  InsertScopeNote,
  ScopeNote,
  scopeNotes,
  InsertBidScopeNote,
  BidScopeNote,
  bidScopeNotes,
  InsertBidLineItem,
  InsertBidUnitLink,
  BidUnitLink,
  BidLineItem,
  bidLineItems,
  bidUnitLinks,
  InsertBidPdf,
  BidPdf,
  bidPdfs,
  InsertBidPdfSheet,
  InsertTakeoffRun,
  TakeoffRun,
  takeoffRuns,
  InsertTakeoffStamp,
  TakeoffStamp,
  takeoffStamps,
  TakeoffLocation,
  InsertSymbolLink,
  SymbolLink,
  symbolLinks,
  EarlyAccessSignup,
  earlyAccessSignups,
  InsertPlanCopilotRun,
  PlanCopilotRun,
  planCopilotRuns,
  InsertPlanCopilotFinding,
  PlanCopilotFinding,
  planCopilotFindings,
  PlanCopilotCorrection,
  planCopilotCorrections,
  CopilotFindingStatus,
  InsertTakeoffRunCircuit,
  TakeoffRunCircuit,
  takeoffRunCircuits,
  BidPdfSheet,
  bidPdfSheets,
  BID_STATUSES,
  bidCloseouts,
  bidCloseoutLines,
  assemblyHourSuggestions,
  CLOSEOUT_MODE_VALUES,
  SUGGESTION_STATUS_VALUES,
  type BidCloseout,
  type BidCloseoutLine,
  type AssemblyHourSuggestion,
  companies,
  companyMembers,
  companyInvites,
  COMPANY_ROLE_VALUES,
  MEMBER_STATUS_VALUES,
  ACCESS_TIER_VALUES,
  type Company,
  type CompanyMember,
  type CompanyInvite,
  type InsertCompanyInvite,
  InsertKit,
  Kit,
  kits,
  kitAssemblies,
  projects,
  userMaterialsDb,
  users,
  masterItems,
  masterAssemblies,
  masterAssemblyItems,
  masterLaborRates,
  projectAssemblies,
  projectAssemblyItems,
  projectItems,
  bidSummary,
  aiUsageDaily,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import {
  BASELINE_MATERIALS,
  RENAMED_BASELINE_MATERIALS,
  RETIRED_BASELINE_MATERIALS,
} from "./seed/baselineMaterials";
import { BASELINE_LABOR_RATES } from "./seed/baselineLaborRates";
import { BASELINE_MODIFIERS } from "./seed/baselineModifiers";
import {
  BASELINE_ASSEMBLIES,
  DEFAULT_ASSEMBLY_ROLE,
} from "./seed/baselineAssemblies";
import { BASELINE_KITS } from "./seed/baselineKits";
import { TRADE_ALL, normalizeTradeId, resolveForTrade } from "../shared/trades";
import { hourlyCostFor } from "../shared/laborRateLookup";
import {
  containsPattern,
  dateRangeBounds,
  toSqlTimestamp,
  usableTerm,
} from "../shared/bidSearch";
import { addAssemblyOverheadHours } from "../shared/pricing";
import type { PlanRemovalImpact } from "../shared/planRemoval";

let _db: MySql2Database | null = null;

/**
 * The pool behind `_db`, kept because `withSeedLock` needs ONE connection it
 * can hold for the length of a lock. Every other query is happy with whichever
 * connection the pool hands out; a named lock is not.
 */
let _pool: ReturnType<typeof createPool> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // The pool is built from mysqlConnection rather than the URL directly, so
      // a managed host's TLS certificate is honoured. See databaseConnection.ts.
      _pool = createPool(mysqlConnection(process.env.DATABASE_URL));
      _db = drizzle(_pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _pool = null;
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod", "passwordHash"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value === undefined) continue;
    const normalized = value ?? null;
    (values as Record<string, unknown>)[field] = normalized;
    updateSet[field] = normalized;
  }

  if (user.emailVerified !== undefined) {
    values.emailVerified = user.emailVerified;
    updateSet.emailVerified = user.emailVerified;
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db
    .insert(users)
    .values(values)
    .onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return result[0];
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

// ─── Onboarding state ─────────────────────────────────────────────────────────

/**
 * Mark the first-run flow finished. Idempotent, and never un-set: the first
 * time is the only first time, and an account that has been through it does not
 * become new again.
 */
export async function markOnboardingComplete(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({ onboardingCompletedAt: new Date() })
    .where(and(eq(users.id, userId), isNull(users.onboardingCompletedAt)));
}

/**
 * Hide or restore the getting-started checklist.
 *
 * Takes the value rather than being two functions because it goes both ways —
 * that is the difference between "dismissible" and "gone", and the reversal has
 * to be as easy as the dismissal or the promise is not kept.
 */
export async function setChecklistDismissed(
  userId: number,
  at: Date | null
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({ checklistDismissedAt: at })
    .where(eq(users.id, userId));
}

/**
 * How many of this user's bids actually have work on them.
 *
 * Counts bids joined to at least one line item, which is the checklist's
 * definition of a bid being "complete" — see OnboardingFacts. Counted in SQL
 * rather than by loading bids and their lines, because this runs on every
 * Dashboard load and the answer is almost always 0 or 1.
 */
export async function countBidsWithLineItems(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${bids.id})` })
    .from(bids)
    .innerJoin(bidLineItems, eq(bidLineItems.bidId, bids.id))
    // Archived bids still count. The user did the work; putting the job away
    // afterwards does not un-complete their first bid.
    //
    // The SAMPLE does not count, and that exclusion matters more than it looks.
    // CLAUDE.md § Onboarding is explicit that a step must never tick for
    // anything but the user's own data — a checklist that says "you have
    // completed your first bid" because they opened an example walks them to
    // the end and leaves them believing they are set up when they have done
    // nothing. Caught by looking at a real new account, not by review.
    .where(and(eq(bids.userId, userId), eq(bids.isSample, false)));
  return Number(row?.n ?? 0);
}

export async function updateUserPassword(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function getProjectsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.isArchived, false)))
    .orderBy(desc(projects.updatedAt));
}

export async function searchProjectsByUser(userId: number, query: string) {
  const db = await getDb();
  if (!db) return [];
  const q = `%${query}%`;
  return db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.userId, userId),
        eq(projects.isArchived, false),
        or(
          like(projects.name, q),
          like(projects.customerName, q),
          like(projects.address, q)
        )
      )
    )
    .orderBy(desc(projects.updatedAt));
}

export async function getProjectById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .limit(1);
  return result[0];
}

export async function createProject(data: InsertProject) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(projects).values(data);
  return result[0];
}

export async function updateProject(
  id: number,
  userId: number,
  data: Partial<InsertProject>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(projects)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.userId, userId)));
}

export async function archiveProject(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(projects)
    .set({ isArchived: true, updatedAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.userId, userId)));
}

export async function deleteProject(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .delete(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)));
}

// ─── User Materials Database ───────────────────────────────────────────────────

export async function getUserMaterials(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(userMaterialsDb)
    .where(
      and(
        eq(userMaterialsDb.userId, userId),
        eq(userMaterialsDb.isActive, true)
      )
    )
    .orderBy(asc(userMaterialsDb.category), asc(userMaterialsDb.description));
}

export async function updateMaterialPrice(
  id: number,
  userId: number,
  userPrice: number | null
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(userMaterialsDb)
    .set({
      userPrice,
      lastUpdated: userPrice !== null ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(userMaterialsDb.id, id), eq(userMaterialsDb.userId, userId)));
}

export async function resetMaterialPrice(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(userMaterialsDb)
    .set({ userPrice: null, lastUpdated: null, updatedAt: new Date() })
    .where(and(eq(userMaterialsDb.id, id), eq(userMaterialsDb.userId, userId)));
}

export async function addSingleMaterial(row: InsertUserMaterialsDb) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(userMaterialsDb).values(row);
  return result[0];
}

export async function updateMaterialRow(
  id: number,
  userId: number,
  patch: Partial<
    Pick<
      InsertUserMaterialsDb,
      "description" | "unit" | "category" | "defaultPrice" | "itemCode"
    >
  >
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(userMaterialsDb)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(userMaterialsDb.id, id), eq(userMaterialsDb.userId, userId)));
}

export async function bulkInsertUserMaterials(rows: InsertUserMaterialsDb[]) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  if (rows.length === 0) return;
  await db.insert(userMaterialsDb).values(rows);
}

export async function deleteUserMaterial(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .delete(userMaterialsDb)
    .where(and(eq(userMaterialsDb.id, id), eq(userMaterialsDb.userId, userId)));
}

export async function clearUserMaterials(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(userMaterialsDb).where(eq(userMaterialsDb.userId, userId));
}

// ─── Master Items ─────────────────────────────────────────────────────────────

export async function getMasterItems(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(masterItems)
    .where(and(eq(masterItems.userId, userId), eq(masterItems.isActive, true)))
    .orderBy(asc(masterItems.category), asc(masterItems.description));
}

export async function getMasterItemById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(masterItems)
    .where(and(eq(masterItems.id, id), eq(masterItems.userId, userId)))
    .limit(1);
  return result[0];
}

export async function createMasterItem(data: InsertMasterItem) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(masterItems).values(data);
  return result[0];
}

export async function updateMasterItem(
  id: number,
  userId: number,
  data: Partial<InsertMasterItem>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(masterItems)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(masterItems.id, id), eq(masterItems.userId, userId)));
}

export async function deleteMasterItem(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Soft delete
  await db
    .update(masterItems)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(masterItems.id, id), eq(masterItems.userId, userId)));
}

export async function bulkInsertMasterItems(rows: InsertMasterItem[]) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  if (rows.length === 0) return;
  await db.insert(masterItems).values(rows);
}

// ─── Master Assemblies ────────────────────────────────────────────────────────

export async function getMasterAssemblies(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(masterAssemblies)
    .where(
      and(
        eq(masterAssemblies.userId, userId),
        eq(masterAssemblies.isActive, true)
      )
    )
    .orderBy(asc(masterAssemblies.name));
}

export async function getMasterAssemblyWithItems(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [assembly] = await db
    .select()
    .from(masterAssemblies)
    .where(
      and(eq(masterAssemblies.id, id), eq(masterAssemblies.userId, userId))
    )
    .limit(1);
  if (!assembly) return undefined;

  const items = await db
    .select({
      id: masterAssemblyItems.id,
      assemblyId: masterAssemblyItems.assemblyId,
      masterItemId: masterAssemblyItems.masterItemId,
      qty: masterAssemblyItems.qty,
      sortOrder: masterAssemblyItems.sortOrder,
      itemCode: masterItems.itemCode,
      description: masterItems.description,
      unit: masterItems.unit,
      masterMaterialCost: masterItems.masterMaterialCost,
      masterLaborHours: masterItems.masterLaborHours,
      category: masterItems.category,
    })
    .from(masterAssemblyItems)
    .innerJoin(
      masterItems,
      eq(masterAssemblyItems.masterItemId, masterItems.id)
    )
    .where(eq(masterAssemblyItems.assemblyId, id))
    .orderBy(asc(masterAssemblyItems.sortOrder));

  return { ...assembly, items };
}

export async function createMasterAssembly(data: InsertMasterAssembly) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(masterAssemblies).values(data);
  return result[0];
}

export async function updateMasterAssembly(
  id: number,
  userId: number,
  data: Partial<InsertMasterAssembly>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(masterAssemblies)
    .set({ ...data, updatedAt: new Date() })
    .where(
      and(eq(masterAssemblies.id, id), eq(masterAssemblies.userId, userId))
    );
}

export async function deleteMasterAssembly(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(masterAssemblies)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(eq(masterAssemblies.id, id), eq(masterAssemblies.userId, userId))
    );
}

export async function addItemToMasterAssembly(data: InsertMasterAssemblyItem) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(masterAssemblyItems).values(data);
}

export async function updateMasterAssemblyItem(
  id: number,
  data: Partial<InsertMasterAssemblyItem>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(masterAssemblyItems)
    .set(data)
    .where(eq(masterAssemblyItems.id, id));
}

export async function removeItemFromMasterAssembly(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(masterAssemblyItems).where(eq(masterAssemblyItems.id, id));
}

// ─── Master Labor Rates ───────────────────────────────────────────────────────

export async function getMasterLaborRates(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(masterLaborRates)
    .where(eq(masterLaborRates.userId, userId))
    .orderBy(asc(masterLaborRates.name));
}

export async function createMasterLaborRate(data: InsertMasterLaborRate) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(masterLaborRates).values(data);
  return result[0];
}

export async function updateMasterLaborRate(
  id: number,
  userId: number,
  data: Partial<InsertMasterLaborRate>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(masterLaborRates)
    .set({ ...data, updatedAt: new Date() })
    .where(
      and(eq(masterLaborRates.id, id), eq(masterLaborRates.userId, userId))
    );
}

export async function deleteMasterLaborRate(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .delete(masterLaborRates)
    .where(
      and(eq(masterLaborRates.id, id), eq(masterLaborRates.userId, userId))
    );
}

// ─── Project Assemblies ───────────────────────────────────────────────────────
// All access below is scoped to rows whose parent project belongs to userId —
// project assemblies/items have no userId column of their own, so ownership is
// resolved by walking up to the owning project (same rule as the Master* tables).

export async function getProjectAssemblies(projectId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  const project = await getProjectById(projectId, userId);
  if (!project) return [];
  return db
    .select()
    .from(projectAssemblies)
    .where(eq(projectAssemblies.projectId, projectId))
    .orderBy(
      asc(projectAssemblies.sortOrder),
      asc(projectAssemblies.createdAt)
    );
}

/** Resolve the owning userId for a project assembly, or undefined if it doesn't exist. */
export async function getProjectAssemblyOwnerId(
  assemblyId: number
): Promise<number | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select({ userId: projects.userId })
    .from(projectAssemblies)
    .innerJoin(projects, eq(projectAssemblies.projectId, projects.id))
    .where(eq(projectAssemblies.id, assemblyId))
    .limit(1);
  return row?.userId;
}

/** Resolve the owning userId for a project assembly item, or undefined if it doesn't exist. */
async function getProjectAssemblyItemOwnerId(
  id: number
): Promise<number | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select({ userId: projects.userId })
    .from(projectAssemblyItems)
    .innerJoin(
      projectAssemblies,
      eq(projectAssemblyItems.projectAssemblyId, projectAssemblies.id)
    )
    .innerJoin(projects, eq(projectAssemblies.projectId, projects.id))
    .where(eq(projectAssemblyItems.id, id))
    .limit(1);
  return row?.userId;
}

export async function getProjectAssemblyWithItems(assemblyId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [assembly] = await db
    .select()
    .from(projectAssemblies)
    .where(eq(projectAssemblies.id, assemblyId))
    .limit(1);
  if (!assembly) return undefined;

  const items = await db
    .select()
    .from(projectAssemblyItems)
    .where(eq(projectAssemblyItems.projectAssemblyId, assemblyId))
    .orderBy(asc(projectAssemblyItems.sortOrder));

  return { ...assembly, items };
}

export async function getProjectAssembliesWithItems(
  projectId: number,
  userId: number
) {
  const db = await getDb();
  if (!db) return [];
  const assemblies = await getProjectAssemblies(projectId, userId);
  return Promise.all(assemblies.map(a => getProjectAssemblyWithItems(a.id)));
}

export async function createProjectAssembly(data: InsertProjectAssembly) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(projectAssemblies).values(data);
  return result;
}

export async function updateProjectAssembly(
  id: number,
  userId: number,
  data: Partial<InsertProjectAssembly>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const ownerId = await getProjectAssemblyOwnerId(id);
  if (ownerId !== userId) return;
  await db
    .update(projectAssemblies)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(projectAssemblies.id, id));
}

export async function deleteProjectAssembly(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const ownerId = await getProjectAssemblyOwnerId(id);
  if (ownerId !== userId) return;
  await db.delete(projectAssemblies).where(eq(projectAssemblies.id, id));
}

export async function createProjectAssemblyItem(
  data: InsertProjectAssemblyItem
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(projectAssemblyItems).values(data);
}

export async function updateProjectAssemblyItem(
  id: number,
  userId: number,
  data: Partial<InsertProjectAssemblyItem>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const ownerId = await getProjectAssemblyItemOwnerId(id);
  if (ownerId !== userId) return;
  await db
    .update(projectAssemblyItems)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(projectAssemblyItems.id, id));
}

export async function resetProjectAssemblyItemToMaster(
  id: number,
  userId: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const ownerId = await getProjectAssemblyItemOwnerId(id);
  if (ownerId !== userId) return;
  // Reset overrides to master values
  await db.execute(sql`
    UPDATE project_assembly_items
    SET overrideMaterialCost = masterMaterialCost,
        overrideLaborHours = masterLaborHours,
        updatedAt = NOW()
    WHERE id = ${id}
  `);
}

export async function deleteProjectAssemblyItem(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const ownerId = await getProjectAssemblyItemOwnerId(id);
  if (ownerId !== userId) return;
  await db.delete(projectAssemblyItems).where(eq(projectAssemblyItems.id, id));
}

// ─── Project Items (Standalone) ───────────────────────────────────────────────
// Same rule as above: project items have no userId column, so ownership is
// resolved by walking up to the owning project.

export async function getProjectItems(projectId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  const project = await getProjectById(projectId, userId);
  if (!project) return [];
  return db
    .select()
    .from(projectItems)
    .where(eq(projectItems.projectId, projectId))
    .orderBy(asc(projectItems.sortOrder), asc(projectItems.createdAt));
}

/** Resolve the owning userId for a project item, or undefined if it doesn't exist. */
async function getProjectItemOwnerId(id: number): Promise<number | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select({ userId: projects.userId })
    .from(projectItems)
    .innerJoin(projects, eq(projectItems.projectId, projects.id))
    .where(eq(projectItems.id, id))
    .limit(1);
  return row?.userId;
}

export async function createProjectItem(data: InsertProjectItem) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(projectItems).values(data);
}

export async function updateProjectItem(
  id: number,
  userId: number,
  data: Partial<InsertProjectItem>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const ownerId = await getProjectItemOwnerId(id);
  if (ownerId !== userId) return;
  await db
    .update(projectItems)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(projectItems.id, id));
}

export async function resetProjectItemToMaster(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const ownerId = await getProjectItemOwnerId(id);
  if (ownerId !== userId) return;
  await db.execute(sql`
    UPDATE project_items
    SET overrideMaterialCost = masterMaterialCost,
        overrideLaborHours = masterLaborHours,
        updatedAt = NOW()
    WHERE id = ${id}
  `);
}

export async function deleteProjectItem(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const ownerId = await getProjectItemOwnerId(id);
  if (ownerId !== userId) return;
  await db.delete(projectItems).where(eq(projectItems.id, id));
}

// ─── Bid Summary ──────────────────────────────────────────────────────────────
// bidSummary has no userId column either — scoped via the owning project.

export async function getBidSummary(projectId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const project = await getProjectById(projectId, userId);
  if (!project) return undefined;
  const result = await db
    .select()
    .from(bidSummary)
    .where(eq(bidSummary.projectId, projectId))
    .limit(1);
  return result[0];
}

export async function upsertBidSummary(data: InsertBidSummary, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const project = await getProjectById(data.projectId, userId);
  if (!project) return;
  await db
    .insert(bidSummary)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        percentageLaborFactor: data.percentageLaborFactor,
        lumpSumHours: data.lumpSumHours,
        markupPct: data.markupPct,
        defaultLaborRateId: data.defaultLaborRateId,
        updatedAt: new Date(),
      },
    });
}

// ─── Materials (Foundation library) ───────────────────────────────────────────
//
// NOTE: distinct from `user_materials_db` / getUserMaterials() further up. That
// one is the supply-house price list behind the /matdb screen. This is the
// Foundation catalog that assemblies are built from. The two are expected to
// converge eventually — see the field-copy note on materialContentFields().
//
// Row ownership:
//   userId IS NULL  → baseline library row, shipped with the app, read-only.
//   userId = <id>   → that user's own row, either fully custom or a fork.
//
// A fork stores `baselineId`, which does two jobs: it hides the baseline row it
// replaces from the merged list, and it makes "revert to original" possible.

/**
 * Ownership/bookkeeping columns. Everything NOT listed here is treated as user
 * content and is copied wholesale by fork and revert.
 *
 * This is deliberately a denylist rather than an allowlist: when columns get
 * added to `materials` later (item code, list price, price-updated date — the
 * /matdb fields), they start copying correctly with no change here. An
 * allowlist would silently drop them instead.
 */
const LIBRARY_OWNERSHIP_FIELDS = [
  "id",
  "userId",
  "baselineId",
  "baselineVersion",
  "version",
  "createdAt",
  "updatedAt",
  // Lifecycle, not content. A fresh fork starts `active` from the column
  // default, and reverting a modifier to its starter values must not silently
  // pull an archived row back into the working list.
  "status",
  "archivedAt",
] as const;

/**
 * Run a seeder under a MySQL advisory lock, so two processes cannot both decide
 * a starter row is missing and both insert it.
 *
 * This is not hypothetical: seeding is check-then-insert with no uniqueness
 * constraint to fall back on, and the dev server (which reseeds on every tsx
 * watch restart) plus vitest's parallel test files hit the same database at
 * once. That race duplicated every labor rate and modifier on first run.
 *
 * A named lock is the right tool because the tables cannot express this as a
 * UNIQUE index: baseline rows are keyed by `userId IS NULL`, and MySQL lets any
 * number of NULLs coexist in a unique index.
 *
 * Lock names still start `helixbid:`, the product's old name. Keep them: during
 * a deploy the old and the new build must take the same lock.
 *
 * ── One connection, held for the whole lock ──────────────────────────────────
 * MySQL ties a named lock to the connection that took it. RELEASE_LOCK from any
 * other connection does nothing at all: it returns 0, and the lock stays held
 * until the connection that owns it closes. So taking the lock on a pooled
 * query and releasing it on another was a coin toss — and the three seeders
 * below run at once, so the two halves land on whichever connections happen to
 * be free at the time.
 *
 * A stuck lock is not a crash, which is why it could sit here unnoticed. The
 * cost is paid by the NEXT process: it finds the lock held, logs "could not
 * acquire", and skips its seed for as long as the holder lives. During a
 * rolling deploy the holder is the OLD build, so newly shipped starter content
 * silently never lands.
 *
 * The work inside still uses the pool, so the pool must have room for more than
 * this one connection — it holds ten by default.
 *
 * Exported for server/seedLock.test.ts, which proves the lock is let go.
 */
export async function withSeedLock(
  name: string,
  run: () => Promise<void>
): Promise<void> {
  const db = await getDb();
  if (!db || !_pool) return;

  const connection = await _pool.getConnection();
  try {
    // 10s is generous for a handful of inserts; on timeout we skip rather than
    // seed unguarded, and the next startup tries again.
    const [rows] = await connection.query(
      "SELECT GET_LOCK(?, 10) AS acquired",
      [name]
    );
    const acquired = (rows as unknown as Array<{ acquired: number | null }>)[0]
      ?.acquired;
    if (acquired !== 1) {
      console.warn(
        `[Seed] Could not acquire lock "${name}" — skipping this pass.`
      );
      return;
    }

    try {
      await run();
    } finally {
      // Same connection that took it, which is the only one MySQL will accept.
      await connection.query("SELECT RELEASE_LOCK(?)", [name]);
    }
  } finally {
    // Back to the pool either way. Handing it back while still holding the lock
    // is exactly the failure described above, so the release above is inside.
    connection.release();
  }
}

/**
 * Drop duplicate baseline rows left by a pre-lock race, keeping the lowest id.
 *
 * Self-healing rather than a migration: the duplicates are data damage, not a
 * schema change, and any database that ran the old seeder concurrently has them.
 * Runs inside the seed lock, before inserting, so it never fights a live writer.
 *
 * ── Checked with a read before it writes ─────────────────────────────────────
 * There are almost never any duplicates: this is a repair for a race that was
 * fixed, and it runs on every startup only so a damaged database heals itself.
 * The self-join DELETE takes locks across the whole table for the duration
 * either way, which was unnoticeable when the material catalog was 29 rows and
 * is not at 600 — an unconditional DELETE here deadlocked against ordinary
 * inserts elsewhere. The SELECT costs nothing by comparison and, finding
 * nothing, leaves the table untouched.
 */
async function dedupeBaselineRows(
  table: "materials" | "labor_rates" | "modifiers" | "assemblies" | "kits"
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Table name is a compile-time constant from the union above, never user input.
  const result = await db.execute(
    sql.raw(
      `SELECT 1 FROM \`${table}\` dupe
     JOIN \`${table}\` keeper
       ON dupe.name = keeper.name AND dupe.id > keeper.id
     WHERE dupe.userId IS NULL AND keeper.userId IS NULL
     LIMIT 1`
    )
  );
  // execute() is typed for writes; a SELECT comes back as [rows, fields].
  const [rows] = result as unknown as [unknown[], unknown];
  if (rows.length === 0) return;

  await db.execute(
    sql.raw(
      `DELETE dupe FROM \`${table}\` dupe
     JOIN \`${table}\` keeper
       ON dupe.name = keeper.name AND dupe.id > keeper.id
     WHERE dupe.userId IS NULL AND keeper.userId IS NULL`
    )
  );
}

/**
 * Strip ownership columns, leaving only the content worth copying.
 *
 * Shared by materials, labor rates and modifiers — all three have the identical
 * baseline/fork shape, so the copy rule is identical too.
 */
function contentFields<TRow extends object, TInsert>(
  row: TRow
): Partial<TInsert> {
  const copy: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const field of LIBRARY_OWNERSHIP_FIELDS) delete copy[field];
  return copy as Partial<TInsert>;
}

/** Back-compat alias — materials read better with the specific name. */
const materialContentFields = (row: Material) =>
  contentFields<Material, InsertMaterial>(row);

/**
 * Collapse baseline + user rows into the one list a user should see.
 *
 * A user's fork replaces the baseline it came from, so the baseline is dropped.
 * Exported and kept pure so it can be tested without a database, and reused for
 * labor rates / modifiers / assemblies, which have the same ownership shape.
 */
export function mergeLibraryRows<
  T extends { id: number; userId: number | null; baselineId: number | null },
>(rows: T[], userId: number): T[] {
  const supersededBaselineIds = new Set<number>();
  for (const row of rows) {
    if (row.userId === userId && row.baselineId != null)
      supersededBaselineIds.add(row.baselineId);
  }
  return rows.filter(
    row => !(row.userId === null && supersededBaselineIds.has(row.id))
  );
}

// ─── Library lifecycle (archive / restore / delete forever) ───────────────────
/**
 * The remove-is-recoverable rules, shared by every library table.
 *
 * Modifiers has worked this way since Foundation; materials, assemblies and
 * kits used to set `isActive = false` instead, which hid a row with no way back
 * — a delete wearing a softer name. These functions are that Modifiers
 * behaviour lifted out so all four tables genuinely share it rather than
 * growing four versions that drift.
 *
 * Two rules carry the whole design, and both are here rather than in a router:
 *
 *   1. **A starter is forked before it is archived.** Starter rows are shared
 *      with every other user, so one cannot be archived in place. Forking first
 *      gives this user their own row to archive, and the fork is what hides the
 *      starter from their list.
 *
 *   2. **Deleting forever tombstones a fork rather than dropping it.** The fork
 *      is the only thing suppressing the shared starter, so actually deleting
 *      the row would resurrect the very item the user just said to remove for
 *      good. A from-scratch row has nothing to suppress and is really deleted.
 *
 * No expiry, deliberately. An archived BID holds uploaded plans and is purged
 * after 30 days; these are small records, so keeping one costs nothing and a
 * countdown would only invent a deadline for the user to miss.
 */
const LIFECYCLE_TABLES = { materials, assemblies, kits, modifiers } as const;
export type LibraryTableName = keyof typeof LIFECYCLE_TABLES;

/** One row's lifecycle columns, whichever table it came from. */
type LifecycleRow = {
  id: number;
  userId: number | null;
  baselineId: number | null;
};

async function readLifecycleRow(
  table: LibraryTableName,
  id: number,
  userId: number
): Promise<LifecycleRow | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const t = LIFECYCLE_TABLES[table];
  const [row] = await db
    .select({ id: t.id, userId: t.userId, baselineId: t.baselineId })
    .from(t as never)
    .where(and(eq(t.id, id), eq(t.userId, userId)))
    .limit(1);
  return row as LifecycleRow | undefined;
}

/**
 * Write the lifecycle columns on one of the user's own rows.
 *
 * The switch is dispatch, not logic — drizzle needs the concrete table to type
 * an update. Every rule lives in the callers below, once.
 */
async function setLifecycle(
  table: LibraryTableName,
  id: number,
  userId: number,
  patch: { status: LibraryStatus; archivedAt: Date | null }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const now = new Date();
  const values = { ...patch, updatedAt: now };

  switch (table) {
    case "materials":
      await db
        .update(materials)
        .set(values)
        .where(and(eq(materials.id, id), eq(materials.userId, userId)));
      return;
    case "assemblies":
      await db
        .update(assemblies)
        .set(values)
        .where(and(eq(assemblies.id, id), eq(assemblies.userId, userId)));
      return;
    case "kits":
      await db
        .update(kits)
        .set(values)
        .where(and(eq(kits.id, id), eq(kits.userId, userId)));
      return;
    case "modifiers":
      await db
        .update(modifiers)
        .set(values)
        .where(and(eq(modifiers.id, id), eq(modifiers.userId, userId)));
      return;
  }
}

async function hardDeleteRow(
  table: LibraryTableName,
  id: number,
  userId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  switch (table) {
    case "materials":
      await db
        .delete(materials)
        .where(and(eq(materials.id, id), eq(materials.userId, userId)));
      return;
    case "assemblies":
      await db
        .delete(assemblies)
        .where(and(eq(assemblies.id, id), eq(assemblies.userId, userId)));
      return;
    case "kits":
      await db
        .delete(kits)
        .where(and(eq(kits.id, id), eq(kits.userId, userId)));
      return;
    case "modifiers":
      await db
        .delete(modifiers)
        .where(and(eq(modifiers.id, id), eq(modifiers.userId, userId)));
      return;
  }
}

/**
 * Archive a library row, forking a starter first (rule 1).
 *
 * Returns the id that ended up archived — the caller's id for an own row, or
 * the new fork's id for a starter, which the UI needs so it can point at the
 * row that actually moved.
 */
export async function archiveLibraryRow(
  table: LibraryTableName,
  id: number,
  userId: number,
  fork: (baselineId: number, userId: number) => Promise<number>,
  read: (
    id: number,
    userId: number
  ) => Promise<{ userId: number | null } | undefined>
): Promise<number> {
  const target = await read(id, userId);
  if (!target) throw new Error("Not found");

  const ownId = target.userId === null ? await fork(id, userId) : id;
  await setLifecycle(table, ownId, userId, {
    status: "archived",
    archivedAt: new Date(),
  });
  return ownId;
}

/** Put an archived row back on the working list. */
export async function restoreLibraryRow(
  table: LibraryTableName,
  id: number,
  userId: number
): Promise<void> {
  await setLifecycle(table, id, userId, { status: "active", archivedAt: null });
}

/**
 * Permanent, unrecoverable removal — only ever reached from the archive view.
 *
 * Tombstones a fork rather than dropping it (rule 2). Either way the row is
 * gone from every view for good.
 */
export async function deleteLibraryRowForever(
  table: LibraryTableName,
  id: number,
  userId: number
): Promise<void> {
  const row = await readLifecycleRow(table, id, userId);
  if (!row) throw new Error("Not found");

  if (row.baselineId == null) {
    await hardDeleteRow(table, id, userId);
    return;
  }
  await setLifecycle(table, id, userId, {
    status: "deleted",
    archivedAt: null,
  });
}

/** Baseline rows plus the user's own, forked baselines collapsed away. */
export async function getLibraryMaterials(
  userId: number,
  status: LibraryStatus = "active"
): Promise<Material[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(materials)
    .where(
      and(
        or(isNull(materials.userId), eq(materials.userId, userId)),
        eq(materials.isActive, true)
      )
    )
    .orderBy(asc(materials.name));
  // Merge first, then filter by status: an archived FORK must still suppress
  // its starter, or archiving your edited copy would bring the shipped one
  // back in its place — which reads as the delete having failed.
  return mergeLibraryRows(rows, userId).filter(row => row.status === status);
}

/** A single material the user is allowed to see — their own, or a baseline. */
export async function getMaterialById(
  id: number,
  userId: number
): Promise<Material | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(materials)
    .where(
      and(
        eq(materials.id, id),
        or(isNull(materials.userId), eq(materials.userId, userId))
      )
    )
    .limit(1);
  return result[0];
}

/** Create a material owned by the user. Returns the new row id. */
export async function createMaterial(data: InsertMaterial): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(materials).values(data);
  return result.insertId;
}

/**
 * Update one of the user's own materials.
 *
 * Baseline rows have userId IS NULL and so can never match here — that is what
 * keeps them read-only. Ownership columns in `data` are ignored rather than
 * trusted, so a caller cannot reassign a row to another user.
 */
export async function updateMaterial(
  id: number,
  userId: number,
  data: Partial<InsertMaterial>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const safe: Record<string, unknown> = { ...data };
  for (const field of LIBRARY_OWNERSHIP_FIELDS) delete safe[field];
  await db
    .update(materials)
    .set({ ...safe, updatedAt: new Date() })
    .where(and(eq(materials.id, id), eq(materials.userId, userId)));
}

/** Soft-delete one of the user's own materials — assemblies may still point at it. */
/**
 * Archive a material — recoverable, unlike the `isActive = false` this replaces.
 *
 * Forks a starter first; see archiveLibraryRow for why.
 */
export async function archiveMaterial(
  id: number,
  userId: number
): Promise<number> {
  return archiveLibraryRow(
    "materials",
    id,
    userId,
    forkMaterial,
    getMaterialById
  );
}

export async function restoreMaterial(id: number, userId: number) {
  return restoreLibraryRow("materials", id, userId);
}

export async function deleteMaterialForever(id: number, userId: number) {
  return deleteLibraryRowForever("materials", id, userId);
}

/**
 * Give the user their own editable copy of a baseline material.
 * Idempotent — forking twice returns the existing copy instead of duplicating.
 */
export async function forkMaterial(
  baselineId: number,
  userId: number
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [existing] = await db
    .select()
    .from(materials)
    .where(
      and(eq(materials.userId, userId), eq(materials.baselineId, baselineId))
    )
    .limit(1);
  if (existing) return existing.id;

  const [baseline] = await db
    .select()
    .from(materials)
    .where(and(eq(materials.id, baselineId), isNull(materials.userId)))
    .limit(1);
  if (!baseline) throw new Error("Baseline material not found");

  // Cast: materialContentFields returns Partial, but `name` is always present
  // on a real row, so the result satisfies InsertMaterial.
  const [result] = await db.insert(materials).values({
    ...materialContentFields(baseline),
    userId,
    baselineId: baseline.id,
    baselineVersion: baseline.version,
  } as InsertMaterial);
  return result.insertId;
}

/**
 * Discard the user's edits and restore the current baseline content.
 *
 * The row id is kept rather than deleting and re-reading the baseline, so
 * anything already referencing this material keeps working.
 */
export async function revertMaterialToBaseline(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [fork] = await db
    .select()
    .from(materials)
    .where(and(eq(materials.id, id), eq(materials.userId, userId)))
    .limit(1);
  if (!fork) throw new Error("Material not found");
  if (fork.baselineId == null)
    throw new Error(
      "Material is fully custom — there is no original to revert to"
    );

  const [baseline] = await db
    .select()
    .from(materials)
    .where(and(eq(materials.id, fork.baselineId), isNull(materials.userId)))
    .limit(1);
  if (!baseline) throw new Error("Baseline material no longer exists");

  await db
    .update(materials)
    .set({
      ...materialContentFields(baseline),
      // Re-stamp the version so any future "update available" check starts clean.
      baselineVersion: baseline.version,
      updatedAt: new Date(),
    })
    .where(and(eq(materials.id, id), eq(materials.userId, userId)));
}

/**
 * Seed the shipped baseline materials. Called at server startup; a no-op once
 * they exist. Matched by name — see renameBaselineMaterials for what that costs
 * and how a rename is done safely.
 */
export async function seedBaselineMaterials(): Promise<void> {
  await withSeedLock("helixbid:seed:materials", seedBaselineMaterialsUnlocked);
}

/**
 * Rename baseline rows whose catalog name has changed, in place.
 *
 * Matching by name is what makes the seed re-runnable, and it is also why a
 * rename cannot simply be typed into the seed file: the seeder would see an
 * unfamiliar name, insert a second row, and strand the original as an orphan
 * the user then sees twice with no way to tell them apart. Renaming here keeps
 * the id, which is the part that actually matters — assemblies, kits, project
 * items and takeoff stamps all point at material ids.
 *
 * Runs before matching, and only ever touches baseline rows: a user's fork
 * carries their own name and is none of the seeder's business.
 */
async function renameBaselineMaterials(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const entries = Object.entries(RENAMED_BASELINE_MATERIALS);
  if (entries.length === 0) return;

  const baselineNames = new Set(
    (
      await db
        .select({ name: materials.name })
        .from(materials)
        .where(isNull(materials.userId))
    ).map(row => row.name)
  );

  for (const [from, to] of entries) {
    if (!baselineNames.has(from)) continue; // already renamed, or never existed
    if (baselineNames.has(to)) {
      // Both names present. That is a half-migrated database rather than
      // anything this function can fix: merging them would have to pick which
      // id survives, and every reference to the loser would break. Leaving the
      // old row alone keeps a visible duplicate, which is recoverable; guessing
      // is not.
      console.warn(
        `[seed] baseline material "${from}" cannot be renamed to "${to}" — both exist.`
      );
      continue;
    }
    await db
      .update(materials)
      .set({ name: to })
      .where(and(eq(materials.name, from), isNull(materials.userId)));
    baselineNames.delete(from);
    baselineNames.add(to);
  }
}

/**
 * Withdraw baseline rows the catalog no longer ships.
 *
 * Sets `isActive = false` rather than deleting: the row leaves every list but
 * keeps its id, so a bid priced from it last month still resolves the part it
 * was priced from. See RETIRED_BASELINE_MATERIALS for when to use this at all
 * — a rename is not a retirement, and treating one as the other loses the row.
 *
 * Only baseline rows. A user who forked a retired material keeps their copy;
 * it is theirs, and the catalog dropping the original says nothing about
 * whether they still buy the part.
 */
async function retireBaselineMaterials(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  if (RETIRED_BASELINE_MATERIALS.length === 0) return;

  await db
    .update(materials)
    .set({ isActive: false })
    .where(
      and(
        isNull(materials.userId),
        inArray(materials.name, RETIRED_BASELINE_MATERIALS),
        eq(materials.isActive, true)
      )
    );
}

async function seedBaselineMaterialsUnlocked(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await dedupeBaselineRows("materials");
  await renameBaselineMaterials();
  await retireBaselineMaterials();

  const existing = await db
    .select({ name: materials.name })
    .from(materials)
    .where(isNull(materials.userId));
  const alreadySeeded = new Set(existing.map(row => row.name));

  const missing = BASELINE_MATERIALS.filter(
    m => !alreadySeeded.has(m.name)
  ).map(m => ({
    name: m.name,
    unitOfSale: m.unitOfSale,
    costPerUnit: m.costPerUnit,
    category: m.category,
    searchAliases: m.searchAliases,
    description: m.description ?? null,
    trade: m.trade ?? "electrical",
    defaultQty: m.defaultQty != null ? m.defaultQty.toFixed(4) : null,
    userId: null,
  }));

  // Chunked: 600 rows of a dozen columns each overflows the default packet on
  // a single INSERT, and the whole seed failing would leave a half-built
  // catalog behind the seed lock.
  for (let i = 0; i < missing.length; i += 100) {
    await db.insert(materials).values(missing.slice(i, i + 100));
  }

  await backfillMaterialMetadata();
}

/**
 * Bring catalog metadata — `category` and `searchAliases` — up to date on rows
 * that predate those columns.
 *
 * Two passes, both idempotent and both cheap enough to run on every startup:
 *
 *  1. Baseline rows are re-stamped from BASELINE_MATERIALS unconditionally.
 *    They are app-owned and read-only to users, so the seed file stays the
 *    authority — re-shelving a material or adding slang to it there fixes live
 *    databases for free, with no migration.
 *  2. User forks that are still NULL inherit from the baseline they came from.
 *    Only NULL is touched: a value the user chose is theirs to keep, and a fork
 *    is allowed to sit on a different shelf than its original.
 *
 * NULL therefore means "never set, inherit it" — never "empty". Clearing the
 * aliases in the Materials editor stores an empty string on purpose, so the
 * clear survives the next startup; do not widen these NULL checks to cover
 * blank text, or a user who deletes a term will find it back tomorrow.
 *
 * NULL therefore means "never set, inherit it" — never "empty". Clearing the
 * aliases in the Materials editor stores an empty string on purpose, so the
 * clear survives the next startup; do not widen these NULL checks to cover
 * blank text, or a user who deletes a term will find it back tomorrow.
 *
 * Fully custom rows (no baselineId) are left alone — there is nothing to
 * inherit from, and guessing would be worse than leaving them blank.
 *
 * ── Price is re-stamped too, and only ever downward to zero ──────────────────
 * Every shipped row is priced at zero (see UNPRICED), so this pass drags a
 * baseline row that still carries one of the old estimate prices back to zero.
 * That is the point rather than a side effect: a stale estimate is
 * indistinguishable on screen from a price the user checked, so it can be bid
 * on without anyone noticing, whereas zero is flagged as needing a price and
 * can be filtered for. It cannot touch a user's own number — a user who edits
 * a price is editing their FORK, and forks are not in this pass at all.
 */
async function backfillMaterialMetadata(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const baselines = await db
    .select({
      id: materials.id,
      name: materials.name,
      category: materials.category,
      searchAliases: materials.searchAliases,
      defaultQty: materials.defaultQty,
      description: materials.description,
      trade: materials.trade,
      costPerUnit: materials.costPerUnit,
    })
    .from(materials)
    .where(isNull(materials.userId));

  const seedByName = new Map(BASELINE_MATERIALS.map(m => [m.name, m]));
  const seedById = new Map<number, (typeof BASELINE_MATERIALS)[number]>();

  for (const row of baselines) {
    const intended = seedByName.get(row.name);
    if (!intended) continue; // a baseline row no longer in the seed file
    seedById.set(row.id, intended);

    const patch: Partial<InsertMaterial> = {};
    if (row.category !== intended.category) patch.category = intended.category;
    if (row.searchAliases !== intended.searchAliases)
      patch.searchAliases = intended.searchAliases;

    const wantDescription = intended.description ?? null;
    if (row.description !== wantDescription)
      patch.description = wantDescription;

    const wantTrade = intended.trade ?? "electrical";
    if (row.trade !== wantTrade) patch.trade = wantTrade;

    // Compared numerically: the column hands back "0.4000" where the seed says
    // "0.0000", and a string compare would rewrite every row every startup.
    if (Number(row.costPerUnit) !== Number(intended.costPerUnit)) {
      patch.costPerUnit = intended.costPerUnit;
    }

    const wantQty =
      intended.defaultQty != null ? intended.defaultQty.toFixed(4) : null;
    if (row.defaultQty !== wantQty) patch.defaultQty = wantQty;

    if (Object.keys(patch).length > 0) {
      await db.update(materials).set(patch).where(eq(materials.id, row.id));
    }
  }

  const staleForks = await db
    .select({
      id: materials.id,
      baselineId: materials.baselineId,
      category: materials.category,
      searchAliases: materials.searchAliases,
      defaultQty: materials.defaultQty,
    })
    .from(materials)
    .where(
      and(
        isNotNull(materials.userId),
        isNotNull(materials.baselineId),
        or(
          isNull(materials.category),
          isNull(materials.searchAliases),
          isNull(materials.defaultQty)
        )
      )
    );

  // Note what is absent here: price, description and trade. Price is the
  // user's whole reason for forking and must never be reached into. The other
  // two are NOT NULL with defaults, so there is no "never set" state to detect
  // — a fork that wants the baseline's copy of either gets it through revert,
  // which is the explicit action for that.
  for (const fork of staleForks) {
    const source =
      fork.baselineId != null ? seedById.get(fork.baselineId) : undefined;
    if (!source) continue;

    const patch: Partial<InsertMaterial> = {};
    if (fork.category === null) patch.category = source.category;
    if (fork.searchAliases === null) patch.searchAliases = source.searchAliases;
    // A fork made before this column existed shows NULL, which the builder
    // reads as "1" — so a forked box of wire nuts would lose its suggestion.
    // Only NULL is filled; a material with no default legitimately stays NULL.
    if (fork.defaultQty === null && source.defaultQty != null) {
      patch.defaultQty = source.defaultQty.toFixed(4);
    }
    if (Object.keys(patch).length > 0) {
      await db.update(materials).set(patch).where(eq(materials.id, fork.id));
    }
  }
}

// ─── Labor Rates (Foundation library) ─────────────────────────────────────────
//
// Same ownership model as Materials: userId NULL is a shipped starter row, a
// user editing one gets a fork, revert restores the starter content.
//
// A salaried role stores annualSalary and annualHours and NEVER a computed
// rate — see effectiveHourlyRate in shared/pricing.ts for why.

/** Starter rows plus the user's own, forked starters collapsed away. */
export async function getLibraryLaborRates(
  userId: number
): Promise<LaborRate[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(laborRates)
    .where(
      and(
        or(isNull(laborRates.userId), eq(laborRates.userId, userId)),
        eq(laborRates.isActive, true)
      )
    )
    .orderBy(asc(laborRates.name));
  return mergeLibraryRows(rows, userId);
}

/** A single labor rate the user may see — their own, or a starter. */
export async function getLaborRateById(
  id: number,
  userId: number
): Promise<LaborRate | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(laborRates)
    .where(
      and(
        eq(laborRates.id, id),
        or(isNull(laborRates.userId), eq(laborRates.userId, userId))
      )
    )
    .limit(1);
  return result[0];
}

export async function createLaborRate(data: InsertLaborRate): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(laborRates).values(data);
  return result.insertId;
}

/** Update one of the user's own rates. Starter rows have userId NULL and never match. */
export async function updateLaborRate(
  id: number,
  userId: number,
  data: Partial<InsertLaborRate>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const safe: Record<string, unknown> = { ...data };
  for (const field of LIBRARY_OWNERSHIP_FIELDS) delete safe[field];
  await db
    .update(laborRates)
    .set({ ...safe, updatedAt: new Date() })
    .where(and(eq(laborRates.id, id), eq(laborRates.userId, userId)));
}

/** Soft-delete — assemblies may already price against this role. */
export async function deactivateLaborRate(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(laborRates)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(laborRates.id, id), eq(laborRates.userId, userId)));
}

/** Give the user their own editable copy of a starter rate. Idempotent. */
/**
 * Set an hourly rate, forking a starter role first if that is what it is.
 *
 * Exists so the first-run screen can price a role without re-implementing the
 * fork-on-edit dance the Labor Rates screen does — a starter edited during
 * onboarding has to end up in exactly the state it would have if the user had
 * edited it later, or their library quietly differs depending on which door
 * they came through.
 */
export async function setLaborRateHourlyCost(
  id: number,
  userId: number,
  hourlyCost: number
): Promise<{ id: number; forked: boolean }> {
  const target = await getLaborRateById(id, userId);
  if (!target) throw new Error("Labor rate not found");

  const isBaseline = target.userId === null;
  const editableId = isBaseline ? await forkLaborRate(id, userId) : id;

  await updateLaborRate(editableId, userId, {
    hourlyCost: hourlyCost.toFixed(4),
  });
  return { id: editableId, forked: isBaseline };
}

export async function forkLaborRate(
  baselineId: number,
  userId: number
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [existing] = await db
    .select()
    .from(laborRates)
    .where(
      and(eq(laborRates.userId, userId), eq(laborRates.baselineId, baselineId))
    )
    .limit(1);
  if (existing) return existing.id;

  const [baseline] = await db
    .select()
    .from(laborRates)
    .where(and(eq(laborRates.id, baselineId), isNull(laborRates.userId)))
    .limit(1);
  if (!baseline) throw new Error("Baseline labor rate not found");

  const [result] = await db.insert(laborRates).values({
    ...contentFields<LaborRate, InsertLaborRate>(baseline),
    userId,
    baselineId: baseline.id,
    baselineVersion: baseline.version,
  } as InsertLaborRate);
  return result.insertId;
}

/** Discard the user's edits, restoring the starter content. Keeps the row id. */
export async function revertLaborRateToBaseline(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [fork] = await db
    .select()
    .from(laborRates)
    .where(and(eq(laborRates.id, id), eq(laborRates.userId, userId)))
    .limit(1);
  if (!fork) throw new Error("Labor rate not found");
  if (fork.baselineId == null) {
    throw new Error(
      "Labor rate was created from scratch — there is no original to revert to"
    );
  }

  const [baseline] = await db
    .select()
    .from(laborRates)
    .where(and(eq(laborRates.id, fork.baselineId), isNull(laborRates.userId)))
    .limit(1);
  if (!baseline) throw new Error("Baseline labor rate no longer exists");

  await db
    .update(laborRates)
    .set({
      ...contentFields<LaborRate, InsertLaborRate>(baseline),
      baselineVersion: baseline.version,
      updatedAt: new Date(),
    })
    .where(and(eq(laborRates.id, id), eq(laborRates.userId, userId)));
}

/** Seed the shipped starter roles. Idempotent, matched by name. */
export async function seedBaselineLaborRates(): Promise<void> {
  await withSeedLock("helixbid:seed:labor_rates", async () => {
    const db = await getDb();
    if (!db) return;

    await dedupeBaselineRows("labor_rates");

    const existing = await db
      .select({ name: laborRates.name })
      .from(laborRates)
      .where(isNull(laborRates.userId));
    const alreadySeeded = new Set(existing.map(row => row.name));

    const missing = BASELINE_LABOR_RATES.filter(
      r => !alreadySeeded.has(r.name)
    ).map(r => ({ ...r, userId: null }));

    if (missing.length > 0) await db.insert(laborRates).values(missing);

    await backfillLaborRateAmounts();
  });
}

/**
 * Drag shipped labor rates back to $0.
 *
 * The same pass materials get, for the same reason and with more at stake: the
 * catalog used to ship plausible-looking rates, and a plausible rate that
 * nobody chose is indistinguishable on screen from one they did. A material
 * priced wrong costs one line; the labor rate multiplies every line in the bid.
 *
 * Only baseline rows. A user who has set a rate has set it on their own FORK,
 * which this cannot see — same boundary as the material price pass.
 */
async function backfillLaborRateAmounts(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const rows = await db
    .select({
      id: laborRates.id,
      name: laborRates.name,
      hourlyCost: laborRates.hourlyCost,
      annualSalary: laborRates.annualSalary,
      annualHours: laborRates.annualHours,
    })
    .from(laborRates)
    .where(isNull(laborRates.userId));

  const intended = new Map(BASELINE_LABOR_RATES.map(r => [r.name, r]));

  for (const row of rows) {
    const want = intended.get(row.name);
    if (!want) continue; // a starter role no longer shipped

    const patch: Partial<InsertLaborRate> = {};
    // Compared numerically: the column returns "22.0000" where the seed says
    // "0.0000", and a string compare would rewrite every row every startup.
    if (Number(row.hourlyCost) !== Number(want.hourlyCost)) {
      patch.hourlyCost = want.hourlyCost;
    }
    if (Number(row.annualSalary ?? 0) !== Number(want.annualSalary ?? 0)) {
      patch.annualSalary = want.annualSalary;
    }
    // Hours are NOT zeroed — see the note in baselineLaborRates.ts. They are
    // still re-stamped so a row that lost them gets a usable divisor back.
    if (Number(row.annualHours ?? 0) !== Number(want.annualHours ?? 0)) {
      patch.annualHours = want.annualHours;
    }

    if (Object.keys(patch).length > 0) {
      await db.update(laborRates).set(patch).where(eq(laborRates.id, row.id));
    }
  }
}

// ─── Modifiers (Foundation library) ───────────────────────────────────────────
//
// Ownership works exactly as it does for materials and labor rates. What is
// different is the lifecycle: modifiers are never hard-deleted out of the
// working list, they are archived and can be restored. See MODIFIER_STATUSES.
//
// `isActive` on this table is vestigial — `status` is authoritative. It is left
// at its default so the column shape still matches the other library tables.

/**
 * Modifiers in one lifecycle state.
 *
 * Merge runs BEFORE the status filter, and that order matters: a user's fork
 * hides the starter row it came from regardless of what state the fork is in,
 * which is exactly how archiving a starter modifier makes it disappear from the
 * active list without touching the shared row.
 */
export async function getLibraryModifiers(
  userId: number,
  status: ModifierStatus = "active"
): Promise<Modifier[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(modifiers)
    .where(or(isNull(modifiers.userId), eq(modifiers.userId, userId)))
    .orderBy(asc(modifiers.name));

  return mergeLibraryRows(rows, userId).filter(row => row.status === status);
}

export async function getModifierById(
  id: number,
  userId: number
): Promise<Modifier | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(modifiers)
    .where(
      and(
        eq(modifiers.id, id),
        or(isNull(modifiers.userId), eq(modifiers.userId, userId))
      )
    )
    .limit(1);
  return result[0];
}

export async function createModifier(data: InsertModifier): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(modifiers).values(data);
  return result.insertId;
}

export async function updateModifier(
  id: number,
  userId: number,
  data: Partial<InsertModifier>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const safe: Record<string, unknown> = { ...data };
  for (const field of LIBRARY_OWNERSHIP_FIELDS) delete safe[field];
  await db
    .update(modifiers)
    .set({ ...safe, updatedAt: new Date() })
    .where(and(eq(modifiers.id, id), eq(modifiers.userId, userId)));
}

export async function forkModifier(
  baselineId: number,
  userId: number
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [existing] = await db
    .select()
    .from(modifiers)
    .where(
      and(eq(modifiers.userId, userId), eq(modifiers.baselineId, baselineId))
    )
    .limit(1);
  if (existing) return existing.id;

  const [baseline] = await db
    .select()
    .from(modifiers)
    .where(and(eq(modifiers.id, baselineId), isNull(modifiers.userId)))
    .limit(1);
  if (!baseline) throw new Error("Baseline modifier not found");

  const [result] = await db.insert(modifiers).values({
    ...contentFields<Modifier, InsertModifier>(baseline),
    userId,
    baselineId: baseline.id,
    baselineVersion: baseline.version,
  } as InsertModifier);
  return result.insertId;
}

export async function revertModifierToBaseline(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [fork] = await db
    .select()
    .from(modifiers)
    .where(and(eq(modifiers.id, id), eq(modifiers.userId, userId)))
    .limit(1);
  if (!fork) throw new Error("Modifier not found");
  if (fork.baselineId == null) {
    throw new Error(
      "Modifier was created from scratch — there is no original to revert to"
    );
  }

  const [baseline] = await db
    .select()
    .from(modifiers)
    .where(and(eq(modifiers.id, fork.baselineId), isNull(modifiers.userId)))
    .limit(1);
  if (!baseline) throw new Error("Baseline modifier no longer exists");

  await db
    .update(modifiers)
    .set({
      ...contentFields<Modifier, InsertModifier>(baseline),
      baselineVersion: baseline.version,
      updatedAt: new Date(),
    })
    .where(and(eq(modifiers.id, id), eq(modifiers.userId, userId)));
}

/**
 * Move a modifier out of the working list. Returns the row that holds the
 * archived state — for a starter that is a NEW fork id, not the id passed in.
 */
export async function archiveModifier(
  id: number,
  userId: number
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const target = await getModifierById(id, userId);
  if (!target) throw new Error("Modifier not found");

  // A starter row is shared with every other user, so it cannot itself be
  // archived. Fork first; the fork then hides the starter from the list.
  const ownId = target.userId === null ? await forkModifier(id, userId) : id;

  await db
    .update(modifiers)
    .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(modifiers.id, ownId), eq(modifiers.userId, userId)));
  return ownId;
}

/** Put an archived modifier back in the working list. */
export async function restoreModifier(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(modifiers)
    .set({ status: "active", archivedAt: null, updatedAt: new Date() })
    .where(and(eq(modifiers.id, id), eq(modifiers.userId, userId)));
}

/**
 * Permanent, unrecoverable removal. Only ever reached from the Archived view.
 *
 * A fully custom row is really deleted. A row forked from a starter becomes a
 * `deleted` tombstone instead: the fork is the only thing hiding the shared
 * starter row, so dropping it would resurrect the very modifier the user just
 * said to remove forever. Either way it is gone from every view, permanently.
 */
export async function deleteModifierForever(
  id: number,
  userId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [row] = await db
    .select()
    .from(modifiers)
    .where(and(eq(modifiers.id, id), eq(modifiers.userId, userId)))
    .limit(1);
  if (!row) throw new Error("Modifier not found");

  if (row.baselineId == null) {
    await db
      .delete(modifiers)
      .where(and(eq(modifiers.id, id), eq(modifiers.userId, userId)));
    return;
  }

  await db
    .update(modifiers)
    .set({ status: "deleted", updatedAt: new Date() })
    .where(and(eq(modifiers.id, id), eq(modifiers.userId, userId)));
}

/** Seed the shipped starter modifiers. Idempotent, matched by name. */
export async function seedBaselineModifiers(): Promise<void> {
  await withSeedLock("helixbid:seed:modifiers", async () => {
    const db = await getDb();
    if (!db) return;

    await dedupeBaselineRows("modifiers");

    const existing = await db
      .select({ name: modifiers.name })
      .from(modifiers)
      .where(isNull(modifiers.userId));
    const alreadySeeded = new Set(existing.map(row => row.name));

    const missing = BASELINE_MODIFIERS.filter(
      m => !alreadySeeded.has(m.name)
    ).map(m => ({ ...m, userId: null }));

    if (missing.length > 0) await db.insert(modifiers).values(missing);
  });
}

// ─── Assemblies (Foundation library) ──────────────────────────────────────────
//
// Same ownership model as the other library tables, with one difference that
// drives most of the code below: an assembly has CHILDREN — its material lines
// and its applicable modifiers. Fork and revert therefore have to deep-copy,
// and an edit that changes the recipe has to replace the child rows.
//
// Child rows are replaced wholesale (delete-then-insert) rather than diffed.
// A recipe is a handful of lines, the write is inside one request, and diffing
// would buy nothing but a chance to leave orphans behind.

/** One material line with the material's own data joined in. */
export type AssemblyMaterialLine = {
  id: number;
  materialId: number;
  qty: string;
  sortOrder: number;
  name: string;
  unitOfSale: Material["unitOfSale"];
  costPerUnit: string;
  category: Material["category"];
};

export type AssemblyDetail = Assembly & {
  materials: AssemblyMaterialLine[];
  /** Ids of the modifiers switched on for this assembly. */
  modifierIds: number[];
};

/** Starter assemblies plus the user's own, forked starters collapsed away. */
export async function getLibraryAssemblies(
  userId: number,
  status: LibraryStatus = "active"
): Promise<Assembly[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(assemblies)
    .where(
      and(
        or(isNull(assemblies.userId), eq(assemblies.userId, userId)),
        eq(assemblies.isActive, true)
      )
    )
    .orderBy(asc(assemblies.name));
  // See getLibraryMaterials on why the merge happens before the filter.
  return mergeLibraryRows(rows, userId).filter(row => row.status === status);
}

export async function getAssemblyById(
  id: number,
  userId: number
): Promise<Assembly | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(assemblies)
    .where(
      and(
        eq(assemblies.id, id),
        or(isNull(assemblies.userId), eq(assemblies.userId, userId))
      )
    )
    .limit(1);
  return result[0];
}

/** Material lines for an assembly, with each material's current cost joined in. */
export async function getAssemblyMaterialLines(
  assemblyId: number
): Promise<AssemblyMaterialLine[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: assemblyMaterials.id,
      materialId: assemblyMaterials.materialId,
      qty: assemblyMaterials.qty,
      sortOrder: assemblyMaterials.sortOrder,
      name: materials.name,
      unitOfSale: materials.unitOfSale,
      costPerUnit: materials.costPerUnit,
      category: materials.category,
    })
    .from(assemblyMaterials)
    .innerJoin(materials, eq(assemblyMaterials.materialId, materials.id))
    .where(eq(assemblyMaterials.assemblyId, assemblyId))
    .orderBy(asc(assemblyMaterials.sortOrder), asc(assemblyMaterials.id));
  return rows;
}

export async function getAssemblyModifierIds(
  assemblyId: number
): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ modifierId: assemblyModifiers.modifierId })
    .from(assemblyModifiers)
    .where(eq(assemblyModifiers.assemblyId, assemblyId))
    .orderBy(asc(assemblyModifiers.sortOrder), asc(assemblyModifiers.id));
  return rows.map(r => r.modifierId);
}

/** An assembly and everything it is made of. */
export async function getAssemblyDetail(
  id: number,
  userId: number
): Promise<AssemblyDetail | undefined> {
  const assembly = await getAssemblyById(id, userId);
  if (!assembly) return undefined;
  const [materialLines, modifierIds] = await Promise.all([
    getAssemblyMaterialLines(id),
    getAssemblyModifierIds(id),
  ]);
  return { ...assembly, materials: materialLines, modifierIds };
}

export async function createAssembly(data: InsertAssembly): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(assemblies).values(data);
  return result.insertId;
}

export async function updateAssembly(
  id: number,
  userId: number,
  data: Partial<InsertAssembly>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const safe: Record<string, unknown> = { ...data };
  for (const field of LIBRARY_OWNERSHIP_FIELDS) delete safe[field];
  await db
    .update(assemblies)
    .set({ ...safe, updatedAt: new Date() })
    .where(and(eq(assemblies.id, id), eq(assemblies.userId, userId)));
}

/** Soft-delete — projects may already reference this assembly. */
/** Archive an assembly — recoverable. See archiveLibraryRow. */
export async function archiveAssembly(
  id: number,
  userId: number
): Promise<number> {
  return archiveLibraryRow(
    "assemblies",
    id,
    userId,
    forkAssembly,
    getAssemblyById
  );
}

export async function restoreAssembly(id: number, userId: number) {
  return restoreLibraryRow("assemblies", id, userId);
}

export async function deleteAssemblyForever(id: number, userId: number) {
  return deleteLibraryRowForever("assemblies", id, userId);
}

/** Replace an assembly's material lines wholesale. */
export async function setAssemblyMaterials(
  assemblyId: number,
  lines: Array<{ materialId: number; qty: string }>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .delete(assemblyMaterials)
    .where(eq(assemblyMaterials.assemblyId, assemblyId));
  if (lines.length === 0) return;
  await db.insert(assemblyMaterials).values(
    lines.map((line, index) => ({
      assemblyId,
      materialId: line.materialId,
      qty: line.qty,
      sortOrder: index,
    }))
  );
}

/** Replace which modifiers apply to an assembly. */
export async function setAssemblyModifiers(
  assemblyId: number,
  modifierIds: number[]
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .delete(assemblyModifiers)
    .where(eq(assemblyModifiers.assemblyId, assemblyId));
  if (modifierIds.length === 0) return;
  await db.insert(assemblyModifiers).values(
    modifierIds.map((modifierId, index) => ({
      assemblyId,
      modifierId,
      sortOrder: index,
    }))
  );
}

/**
 * Give the user their own editable copy of a starter assembly, children and all.
 * Idempotent — forking twice returns the existing copy.
 */
export async function forkAssembly(
  baselineId: number,
  userId: number
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [existing] = await db
    .select()
    .from(assemblies)
    .where(
      and(eq(assemblies.userId, userId), eq(assemblies.baselineId, baselineId))
    )
    .limit(1);
  if (existing) return existing.id;

  const [baseline] = await db
    .select()
    .from(assemblies)
    .where(and(eq(assemblies.id, baselineId), isNull(assemblies.userId)))
    .limit(1);
  if (!baseline) throw new Error("Baseline assembly not found");

  const [result] = await db.insert(assemblies).values({
    ...contentFields<Assembly, InsertAssembly>(baseline),
    userId,
    baselineId: baseline.id,
    baselineVersion: baseline.version,
  } as InsertAssembly);
  const forkId = result.insertId;

  // The recipe is the assembly — a fork without its lines is an empty shell.
  await copyAssemblyChildren(baseline.id, forkId);
  return forkId;
}

/** Copy material lines and modifier links from one assembly onto another. */
async function copyAssemblyChildren(
  fromAssemblyId: number,
  toAssemblyId: number
) {
  const [lines, modifierIds] = await Promise.all([
    getAssemblyMaterialLines(fromAssemblyId),
    getAssemblyModifierIds(fromAssemblyId),
  ]);
  await setAssemblyMaterials(
    toAssemblyId,
    lines.map(line => ({ materialId: line.materialId, qty: line.qty }))
  );
  await setAssemblyModifiers(toAssemblyId, modifierIds);
}

/**
 * Discard the user's edits and restore the starter recipe — fields AND children.
 * Keeps the row id so anything already pointing at this assembly keeps working.
 */
export async function revertAssemblyToBaseline(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [fork] = await db
    .select()
    .from(assemblies)
    .where(and(eq(assemblies.id, id), eq(assemblies.userId, userId)))
    .limit(1);
  if (!fork) throw new Error("Assembly not found");
  if (fork.baselineId == null) {
    throw new Error(
      "Assembly was created from scratch — there is no original to revert to"
    );
  }

  const [baseline] = await db
    .select()
    .from(assemblies)
    .where(and(eq(assemblies.id, fork.baselineId), isNull(assemblies.userId)))
    .limit(1);
  if (!baseline) throw new Error("Baseline assembly no longer exists");

  await db
    .update(assemblies)
    .set({
      ...contentFields<Assembly, InsertAssembly>(baseline),
      baselineVersion: baseline.version,
      updatedAt: new Date(),
    })
    .where(and(eq(assemblies.id, id), eq(assemblies.userId, userId)));

  // Reverting the header without the lines would leave the user's edited recipe
  // priced against the starter's hours — worse than either state alone.
  await copyAssemblyChildren(baseline.id, id);
}

/**
 * Seed the shipped starter assemblies.
 *
 * Runs AFTER materials, labor rates and modifiers, because every line is
 * resolved by name against those catalogs. An assembly whose materials are not
 * all present is skipped rather than half-built — a recipe missing lines prices
 * the job too low, which is worse than the recipe being absent.
 */
export async function seedBaselineAssemblies(): Promise<void> {
  await withSeedLock("helixbid:seed:assemblies", async () => {
    const db = await getDb();
    if (!db) return;

    await dedupeBaselineRows("assemblies");

    /**
     * The role every starter assembly is costed against.
     *
     * Looked up by name rather than hardcoded, the same way materials and
     * modifiers are below — the seeder never holds an id. Labor rates are
     * seeded before assemblies (see _core/index.ts), so this is present by the
     * time it is needed; if it somehow is not, assemblies are still created and
     * simply carry no role, which is what they did before this existed.
     */
    const [defaultRole] = await db
      .select({ id: laborRates.id })
      .from(laborRates)
      .where(
        and(
          isNull(laborRates.userId),
          eq(laborRates.name, DEFAULT_ASSEMBLY_ROLE)
        )
      )
      .limit(1);

    /**
     * Give the assemblies that shipped BEFORE this a role, too.
     *
     * The insert below only runs for assemblies not already present, so without
     * this the fix would reach nobody who already has a database — including
     * every existing account, where the silent $0 is happening right now.
     *
     * Deliberately narrow: baseline rows only (`userId IS NULL`) that have no
     * role yet. A user's own assembly, and any baseline someone has already
     * pointed at a different role, are left exactly as they are — this fills a
     * gap, it does not overwrite a decision.
     */
    if (defaultRole) {
      await db
        .update(assemblies)
        .set({ laborRateId: defaultRole.id })
        .where(and(isNull(assemblies.userId), isNull(assemblies.laborRateId)));
    }

    const existingRows = await db
      .select({ name: assemblies.name })
      .from(assemblies)
      .where(isNull(assemblies.userId));
    const alreadySeeded = new Set(existingRows.map(row => row.name));

    const pending = BASELINE_ASSEMBLIES.filter(a => !alreadySeeded.has(a.name));
    if (pending.length === 0) return;

    const baselineMaterialRows = await db
      .select({ id: materials.id, name: materials.name })
      .from(materials)
      .where(isNull(materials.userId));
    const materialIdByName = new Map(
      baselineMaterialRows.map(row => [row.name, row.id])
    );

    const baselineModifierRows = await db
      .select({ id: modifiers.id, name: modifiers.name })
      .from(modifiers)
      .where(isNull(modifiers.userId));
    const modifierIdByName = new Map(
      baselineModifierRows.map(row => [row.name, row.id])
    );

    for (const spec of pending) {
      const lines = spec.materials.map(line => ({
        materialId: materialIdByName.get(line.material),
        qty: line.qty.toFixed(4),
      }));
      if (lines.some(line => line.materialId === undefined)) {
        const missing = spec.materials
          .filter(line => !materialIdByName.has(line.material))
          .map(line => line.material);
        console.warn(
          `[BaselineAssemblies] Skipping "${spec.name}" — missing materials: ${missing.join(", ")}`
        );
        continue;
      }

      const [result] = await db.insert(assemblies).values({
        userId: null,
        name: spec.name,
        category: spec.category,
        projectType: spec.projectType,
        baseLaborHours: spec.baseLaborHours.toFixed(4),
        // Without this the hours above cost nothing — see DEFAULT_ASSEMBLY_ROLE.
        laborRateId: defaultRole?.id ?? null,
      });
      const assemblyId = result.insertId;

      await setAssemblyMaterials(
        assemblyId,
        lines as Array<{ materialId: number; qty: string }>
      );

      const modifierIds = (spec.modifiers ?? [])
        .map(name => modifierIdByName.get(name))
        .filter((id): id is number => id !== undefined);
      await setAssemblyModifiers(assemblyId, modifierIds);
    }
  });
}

// ─── Pricing Defaults (company level) ─────────────────────────────────────────

/**
 * Is this the unique-key collision two concurrent create-on-read calls produce?
 *
 * The settings tables below all create their row on first READ, which is a
 * convenience that hides a race: two requests for the same user arriving
 * together both find nothing and both insert, and the loser gets ER_DUP_ENTRY.
 *
 * It went unnoticed for as long as nothing fetched the same row twice at once.
 * Adding sales tax did exactly that — `companyDefaultsFor` and `taxRulesFor`
 * sit in the same Promise.all — and it surfaced as a bid failing to price at
 * all. Losing the race is not an error: the row the caller wanted now exists,
 * so the right response is to read it back.
 */
function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    ("code" in error
      ? (error as { code?: string }).code === "ER_DUP_ENTRY"
      : false ||
        // drizzle wraps the driver error; the cause carries the code.
        ("cause" in error &&
          isDuplicateKey((error as { cause: unknown }).cause)))
  );
}

/** The shipped defaults for a user who has never opened the settings. */
const FALLBACK_PRICING_DEFAULTS = {
  overheadEnabled: false,
  overheadMode: "percentage" as const,
  overheadValue: "0",
  profitMethod: "markup" as const,
  profitValue: "0",
};

/**
 * A user's company-level pricing defaults, creating the row on first read.
 *
 * ── The `trade` parameter, and why it defaults ───────────────────────────────
 * These are now one row per user PER TRADE, with `all` meaning the company-wide
 * record (see the schema comment). Reads resolve through resolveForTrade: the
 * trade's own row if it has one, otherwise the `all` row. Every caller today
 * passes nothing and gets the `all` row, which is the single row each user
 * already had — which is why adding the column changed nothing on screen.
 *
 * A `limit(1)` on userId alone would have been the bug here: correct while
 * exactly one row exists, and quietly returning an arbitrary trade's settings
 * the moment a second one does.
 */
export async function getPricingDefaults(
  userId: number,
  trade: string = TRADE_ALL
): Promise<PricingDefaults | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const rows = await db
    .select()
    .from(pricingDefaults)
    .where(eq(pricingDefaults.userId, userId));
  const existing = resolveForTrade(rows, trade);
  if (existing) return existing;

  // Nothing at all for this user yet. The first row is created for whatever
  // trade was asked for, which for every caller today is `all`.
  const wanted = normalizeTradeId(trade);
  try {
    await db
      .insert(pricingDefaults)
      .values({ userId, trade: wanted, ...FALLBACK_PRICING_DEFAULTS });
  } catch (error) {
    // Another request created it between our read and our write. See
    // isDuplicateKey — the row exists now, which is all the caller wanted.
    if (!isDuplicateKey(error)) throw error;
  }
  const created = await db
    .select()
    .from(pricingDefaults)
    .where(eq(pricingDefaults.userId, userId));
  return resolveForTrade(created, trade);
}

/**
 * Write the row for exactly this trade, creating it if it does not exist.
 *
 * Note the asymmetry with the read above, which is deliberate: a READ of
 * plumbing settings may fall back to the company-wide row, but a WRITE must
 * never land on it — editing plumbing's overhead would otherwise silently move
 * electrical's too. So this targets `trade` exactly.
 *
 * A per-trade row created this way starts from the shipped fallback rather than
 * inheriting the `all` row's current values. That choice is only reachable once
 * a second trade ships and there is a screen to make it from; it is called out
 * here so whoever builds that screen makes it deliberately rather than
 * discovering it.
 */
export async function updatePricingDefaults(
  userId: number,
  data: Partial<InsertPricingDefaults>,
  trade: string = TRADE_ALL
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const wanted = normalizeTradeId(trade);

  const rows = await db
    .select()
    .from(pricingDefaults)
    .where(eq(pricingDefaults.userId, userId));
  const exact = rows.find(row => normalizeTradeId(row.trade) === wanted);
  if (!exact) {
    try {
      await db
        .insert(pricingDefaults)
        .values({ userId, trade: wanted, ...FALLBACK_PRICING_DEFAULTS });
    } catch (error) {
      // Lost the create race; the UPDATE below writes the winner's row.
      if (!isDuplicateKey(error)) throw error;
    }
  }

  const safe: Record<string, unknown> = { ...data };
  delete safe.id;
  delete safe.userId;
  delete safe.trade;
  await db
    .update(pricingDefaults)
    .set({ ...safe, updatedAt: new Date() })
    .where(
      and(eq(pricingDefaults.userId, userId), eq(pricingDefaults.trade, wanted))
    );
}

// ─── Company branding & proposal presentation ─────────────────────────────────
//
// Both follow the same create-on-first-read shape as the pricing defaults
// above: a user has a row from the first time anything asks for one, so no
// caller has to handle "no settings yet" separately from "settings that are
// still empty". The row is created BLANK on purpose — see the schema comment on
// `company_branding`. Nothing here ever invents a company name.

/**
 * A user's branding, creating the (blank) row on first read.
 *
 * Trade-resolved exactly like getPricingDefaults above — see that function for
 * why the read falls back to the `all` row and the write does not. The licence
 * number is the field that makes this per trade: two trades mean two numbers
 * from two boards, and printing the wrong one is a compliance problem.
 */
export async function getCompanyBranding(
  userId: number,
  trade: string = TRADE_ALL
): Promise<CompanyBranding | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const rows = await db
    .select()
    .from(companyBranding)
    .where(eq(companyBranding.userId, userId));
  const existing = resolveForTrade(rows, trade);
  if (existing) return existing;

  const wanted = normalizeTradeId(trade);
  try {
    await db.insert(companyBranding).values({ userId, trade: wanted });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
  }
  const created = await db
    .select()
    .from(companyBranding)
    .where(eq(companyBranding.userId, userId));
  return resolveForTrade(created, trade);
}

export async function updateCompanyBranding(
  userId: number,
  data: Partial<InsertCompanyBranding>,
  trade: string = TRADE_ALL
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const wanted = normalizeTradeId(trade);

  const rows = await db
    .select()
    .from(companyBranding)
    .where(eq(companyBranding.userId, userId));
  if (!rows.some(row => normalizeTradeId(row.trade) === wanted)) {
    try {
      await db.insert(companyBranding).values({ userId, trade: wanted });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
  }

  const safe: Record<string, unknown> = { ...data };
  delete safe.id;
  delete safe.userId;
  delete safe.trade;
  await db
    .update(companyBranding)
    .set({ ...safe, updatedAt: new Date() })
    .where(
      and(eq(companyBranding.userId, userId), eq(companyBranding.trade, wanted))
    );
}

/**
 * A user's proposal presentation settings, creating the row on first read.
 *
 * Trade-resolved like the two above. `termsText` is what makes it worth
 * splitting: an electrical quote's exclusions are not a plumbing quote's.
 */
export async function getProposalSettings(
  userId: number,
  trade: string = TRADE_ALL
): Promise<ProposalSettings | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const rows = await db
    .select()
    .from(proposalSettings)
    .where(eq(proposalSettings.userId, userId));
  const existing = resolveForTrade(rows, trade);
  if (existing) return existing;

  const wanted = normalizeTradeId(trade);
  try {
    await db.insert(proposalSettings).values({ userId, trade: wanted });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
  }
  const created = await db
    .select()
    .from(proposalSettings)
    .where(eq(proposalSettings.userId, userId));
  return resolveForTrade(created, trade);
}

export async function updateProposalSettings(
  userId: number,
  data: Partial<InsertProposalSettings>,
  trade: string = TRADE_ALL
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const wanted = normalizeTradeId(trade);

  const rows = await db
    .select()
    .from(proposalSettings)
    .where(eq(proposalSettings.userId, userId));
  if (!rows.some(row => normalizeTradeId(row.trade) === wanted)) {
    try {
      await db.insert(proposalSettings).values({ userId, trade: wanted });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
  }

  const safe: Record<string, unknown> = { ...data };
  delete safe.id;
  delete safe.userId;
  delete safe.trade;
  await db
    .update(proposalSettings)
    .set({ ...safe, updatedAt: new Date() })
    .where(
      and(
        eq(proposalSettings.userId, userId),
        eq(proposalSettings.trade, wanted)
      )
    );
}

// ─── Clients ──────────────────────────────────────────────────────────────────
//
// Scoped by userId like everything else. Every read filters on it, and the
// write paths take it as a parameter rather than trusting an id the caller
// happened to have — a client id is a small integer and guessable, so "you knew
// the number" must never be the only thing standing in the way.

/** The user's live clients, A–Z. Archived ones are excluded. */
export async function getClientsByUser(userId: number): Promise<Client[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(clients)
    .where(and(eq(clients.userId, userId), isNull(clients.archivedAt)))
    .orderBy(asc(clients.name));
}

/** Archived clients, most recently archived first. */
export async function getArchivedClients(userId: number): Promise<Client[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(clients)
    .where(and(eq(clients.userId, userId), isNotNull(clients.archivedAt)))
    .orderBy(desc(clients.archivedAt));
}

/**
 * One client, live or archived.
 *
 * Archived rows resolve on purpose: a bid linked to a client the user has since
 * archived must still print that client's name. Hiding it from this lookup
 * would turn tidying the contact list into silently blanking old proposals.
 */
export async function getClientById(
  id: number,
  userId: number
): Promise<Client | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.userId, userId)))
    .limit(1);
  return row;
}

export async function createClient(data: InsertClient): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(clients).values(data);
  return result.insertId;
}

export async function updateClient(
  id: number,
  userId: number,
  data: Partial<InsertClient>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const safe: Record<string, unknown> = { ...data };
  delete safe.id;
  delete safe.userId;
  await db
    .update(clients)
    .set({ ...safe, updatedAt: new Date() })
    .where(and(eq(clients.id, id), eq(clients.userId, userId)));
}

/**
 * Take a client off the working list, keeping the row.
 *
 * There is no hard delete here and no countdown either. A client is a name and
 * a phone number that bid history points at, so keeping one costs nothing —
 * and destroying it would null the `clientId` on every bid that referenced it
 * (the FK is `set null`), quietly unpicking the link the record existed for.
 * Guarded on `archivedAt IS NULL` so a double-click cannot move the date.
 */
export async function archiveClient(
  id: number,
  userId: number,
  now: Date = new Date()
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(clients)
    .set({ archivedAt: now, updatedAt: now })
    .where(
      and(
        eq(clients.id, id),
        eq(clients.userId, userId),
        isNull(clients.archivedAt)
      )
    );
}

export async function restoreClient(
  id: number,
  userId: number,
  now: Date = new Date()
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(clients)
    .set({ archivedAt: null, updatedAt: now })
    .where(
      and(
        eq(clients.id, id),
        eq(clients.userId, userId),
        isNotNull(clients.archivedAt)
      )
    );
}

/**
 * Every bid belonging to a client — what historical bid search will be built
 * on, and what the client detail view lists today.
 *
 * Includes archived bids: "what have I quoted this customer" is a question
 * about history, and history does not stop at the dashboard's edge.
 */
export async function getBidsForClient(
  clientId: number,
  userId: number
): Promise<Bid[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(bids)
    .where(and(eq(bids.clientId, clientId), eq(bids.userId, userId)))
    .orderBy(desc(bids.updatedAt));
}

/** How many bids point at each of a user's clients, for the list view. */
export async function countBidsPerClient(
  userId: number
): Promise<Map<number, number>> {
  const db = await getDb();
  if (!db) return new Map();
  const rows = await db
    .select({ clientId: bids.clientId, n: sql<number>`count(*)` })
    .from(bids)
    .where(and(eq(bids.userId, userId), isNotNull(bids.clientId)))
    .groupBy(bids.clientId);
  const counts = new Map<number, number>();
  for (const row of rows) {
    if (row.clientId != null) counts.set(row.clientId, Number(row.n));
  }
  return counts;
}

// ─── Additional expenses ──────────────────────────────────────────────────────
//
// Two levels, as everywhere: a reusable library scoped by userId, and the
// snapshotted copies that sit on a bid. A bid expense with no library id is a
// one-off, and nothing about it is second class.

export async function getExpenseItems(userId: number): Promise<ExpenseItem[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(expenseItems)
    .where(
      and(eq(expenseItems.userId, userId), isNull(expenseItems.archivedAt))
    )
    .orderBy(asc(expenseItems.name));
}

export async function getArchivedExpenseItems(
  userId: number
): Promise<ExpenseItem[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(expenseItems)
    .where(
      and(eq(expenseItems.userId, userId), isNotNull(expenseItems.archivedAt))
    )
    .orderBy(desc(expenseItems.archivedAt));
}

export async function getExpenseItemById(
  id: number,
  userId: number
): Promise<ExpenseItem | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(expenseItems)
    .where(and(eq(expenseItems.id, id), eq(expenseItems.userId, userId)))
    .limit(1);
  return row;
}

export async function createExpenseItem(
  data: InsertExpenseItem
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(expenseItems).values(data);
  return result.insertId;
}

export async function updateExpenseItem(
  id: number,
  userId: number,
  data: Partial<InsertExpenseItem>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const safe: Record<string, unknown> = { ...data };
  delete safe.id;
  delete safe.userId;
  await db
    .update(expenseItems)
    .set({ ...safe, updatedAt: new Date() })
    .where(and(eq(expenseItems.id, id), eq(expenseItems.userId, userId)));
}

export async function setExpenseItemArchived(
  id: number,
  userId: number,
  archivedAt: Date | null
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(expenseItems)
    .set({ archivedAt, updatedAt: new Date() })
    .where(and(eq(expenseItems.id, id), eq(expenseItems.userId, userId)));
}

/** The expenses on one bid, in the order they were added. */
export async function getBidExpenses(bidId: number): Promise<BidExpense[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(bidExpenses)
    .where(eq(bidExpenses.bidId, bidId))
    .orderBy(asc(bidExpenses.sortOrder), asc(bidExpenses.id));
}

export async function createBidExpense(
  data: InsertBidExpense
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(bidExpenses).values(data);
  return result.insertId;
}

export async function updateBidExpense(
  id: number,
  bidId: number,
  data: Partial<InsertBidExpense>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const safe: Record<string, unknown> = { ...data };
  delete safe.id;
  delete safe.bidId;
  await db
    .update(bidExpenses)
    .set({ ...safe, updatedAt: new Date() })
    .where(and(eq(bidExpenses.id, id), eq(bidExpenses.bidId, bidId)));
}

export async function deleteBidExpense(id: number, bidId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .delete(bidExpenses)
    .where(and(eq(bidExpenses.id, id), eq(bidExpenses.bidId, bidId)));
}

export async function nextBidExpenseSortOrder(bidId: number): Promise<number> {
  const rows = await getBidExpenses(bidId);
  return rows.length === 0 ? 0 : Math.max(...rows.map(r => r.sortOrder)) + 1;
}

// ─── Includes / excludes ──────────────────────────────────────────────────────

export async function getScopeNotes(userId: number): Promise<ScopeNote[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(scopeNotes)
    .where(and(eq(scopeNotes.userId, userId), isNull(scopeNotes.archivedAt)))
    .orderBy(asc(scopeNotes.kind), asc(scopeNotes.text));
}

export async function getArchivedScopeNotes(
  userId: number
): Promise<ScopeNote[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(scopeNotes)
    .where(and(eq(scopeNotes.userId, userId), isNotNull(scopeNotes.archivedAt)))
    .orderBy(desc(scopeNotes.archivedAt));
}

export async function getScopeNoteById(
  id: number,
  userId: number
): Promise<ScopeNote | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(scopeNotes)
    .where(and(eq(scopeNotes.id, id), eq(scopeNotes.userId, userId)))
    .limit(1);
  return row;
}

export async function createScopeNote(data: InsertScopeNote): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(scopeNotes).values(data);
  return result.insertId;
}

export async function updateScopeNote(
  id: number,
  userId: number,
  data: Partial<InsertScopeNote>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const safe: Record<string, unknown> = { ...data };
  delete safe.id;
  delete safe.userId;
  await db
    .update(scopeNotes)
    .set({ ...safe, updatedAt: new Date() })
    .where(and(eq(scopeNotes.id, id), eq(scopeNotes.userId, userId)));
}

export async function setScopeNoteArchived(
  id: number,
  userId: number,
  archivedAt: Date | null
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(scopeNotes)
    .set({ archivedAt, updatedAt: new Date() })
    .where(and(eq(scopeNotes.id, id), eq(scopeNotes.userId, userId)));
}

export async function getBidScopeNotes(bidId: number): Promise<BidScopeNote[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(bidScopeNotes)
    .where(eq(bidScopeNotes.bidId, bidId))
    .orderBy(asc(bidScopeNotes.sortOrder), asc(bidScopeNotes.id));
}

export async function createBidScopeNote(
  data: InsertBidScopeNote
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(bidScopeNotes).values(data);
  return result.insertId;
}

export async function updateBidScopeNote(
  id: number,
  bidId: number,
  data: Partial<InsertBidScopeNote>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const safe: Record<string, unknown> = { ...data };
  delete safe.id;
  delete safe.bidId;
  await db
    .update(bidScopeNotes)
    .set({ ...safe, updatedAt: new Date() })
    .where(and(eq(bidScopeNotes.id, id), eq(bidScopeNotes.bidId, bidId)));
}

export async function deleteBidScopeNote(id: number, bidId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .delete(bidScopeNotes)
    .where(and(eq(bidScopeNotes.id, id), eq(bidScopeNotes.bidId, bidId)));
}

export async function nextBidScopeNoteSortOrder(
  bidId: number
): Promise<number> {
  const rows = await getBidScopeNotes(bidId);
  return rows.length === 0 ? 0 : Math.max(...rows.map(r => r.sortOrder)) + 1;
}

// ─── Tax jurisdictions ────────────────────────────────────────────────────────
//
// Scoped by userId like everything else. Nothing is seeded — see the schema
// comment and shared/salesTax.ts for why shipping a rate table would be worse
// than shipping none.

/** The user's live tax areas, A–Z. */
export async function getTaxJurisdictions(
  userId: number
): Promise<TaxJurisdictionRow[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(taxJurisdictions)
    .where(
      and(
        eq(taxJurisdictions.userId, userId),
        isNull(taxJurisdictions.archivedAt)
      )
    )
    .orderBy(asc(taxJurisdictions.name));
}

export async function getArchivedTaxJurisdictions(
  userId: number
): Promise<TaxJurisdictionRow[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(taxJurisdictions)
    .where(
      and(
        eq(taxJurisdictions.userId, userId),
        isNotNull(taxJurisdictions.archivedAt)
      )
    )
    .orderBy(desc(taxJurisdictions.archivedAt));
}

/**
 * One tax area, archived or not.
 *
 * Archived rows resolve on purpose, the same as clients: a bid pinned to an
 * area the user has since archived must still be able to say what rate it is
 * using rather than silently dropping to no tax.
 */
export async function getTaxJurisdictionById(
  id: number,
  userId: number
): Promise<TaxJurisdictionRow | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(taxJurisdictions)
    .where(
      and(eq(taxJurisdictions.id, id), eq(taxJurisdictions.userId, userId))
    )
    .limit(1);
  return row;
}

export async function createTaxJurisdiction(
  data: InsertTaxJurisdiction
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(taxJurisdictions).values(data);
  return result.insertId;
}

export async function updateTaxJurisdiction(
  id: number,
  userId: number,
  data: Partial<InsertTaxJurisdiction>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const safe: Record<string, unknown> = { ...data };
  delete safe.id;
  delete safe.userId;
  await db
    .update(taxJurisdictions)
    .set({ ...safe, updatedAt: new Date() })
    .where(
      and(eq(taxJurisdictions.id, id), eq(taxJurisdictions.userId, userId))
    );
}

export async function archiveTaxJurisdiction(
  id: number,
  userId: number,
  now: Date = new Date()
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(taxJurisdictions)
    .set({ archivedAt: now, updatedAt: now })
    .where(
      and(
        eq(taxJurisdictions.id, id),
        eq(taxJurisdictions.userId, userId),
        isNull(taxJurisdictions.archivedAt)
      )
    );
}

export async function restoreTaxJurisdiction(
  id: number,
  userId: number,
  now: Date = new Date()
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(taxJurisdictions)
    .set({ archivedAt: null, updatedAt: now })
    .where(
      and(
        eq(taxJurisdictions.id, id),
        eq(taxJurisdictions.userId, userId),
        isNotNull(taxJurisdictions.archivedAt)
      )
    );
}

// ─── Bids ─────────────────────────────────────────────────────────────────────

/** The live bids — everything not sitting in the archive. */
export async function getBidsByUser(userId: number): Promise<Bid[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(bids)
    .where(and(eq(bids.userId, userId), isNull(bids.archivedAt)))
    .orderBy(desc(bids.updatedAt));
}

export async function getBidById(
  id: number,
  userId: number
): Promise<Bid | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(bids)
    .where(and(eq(bids.id, id), eq(bids.userId, userId)))
    .limit(1);
  return row;
}

export async function createBid(data: InsertBid): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(bids).values(data);
  return result.insertId;
}

export async function updateBid(
  id: number,
  userId: number,
  data: Partial<InsertBid>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const safe: Record<string, unknown> = { ...data };
  delete safe.id;
  delete safe.userId;
  await db
    .update(bids)
    .set({ ...safe, updatedAt: new Date() })
    .where(and(eq(bids.id, id), eq(bids.userId, userId)));
}

/**
 * Move a bid to the archive, starting its retention clock.
 *
 * `now` is a parameter rather than `new Date()` because this instant is what
 * the countdown and the eventual deletion are both measured from — a test that
 * cannot set it cannot check either. See shared/retention.ts.
 *
 * Re-archiving an already-archived bid does NOT restart the clock: the guard on
 * `archivedAt IS NULL` means a stray second call cannot quietly buy another 30
 * days, which would let something sit in the archive forever.
 */
export async function archiveBid(
  id: number,
  userId: number,
  now: Date = new Date()
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(bids)
    .set({ archivedAt: now, updatedAt: now })
    .where(
      and(eq(bids.id, id), eq(bids.userId, userId), isNull(bids.archivedAt))
    );
}

/**
 * Take a bid back out of the archive, in full.
 *
 * Clearing `archivedAt` is the entire operation: it stops the countdown, puts
 * the bid back on the dashboard, and — because the PDFs were never detached,
 * only carried along by the bid — restores its plans with it. Nothing about the
 * bid's status, pricing or line items was touched on the way in, so there is
 * nothing to put back.
 */
export async function restoreBid(
  id: number,
  userId: number,
  now: Date = new Date()
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(bids)
    .set({ archivedAt: null, updatedAt: now })
    .where(
      and(eq(bids.id, id), eq(bids.userId, userId), isNotNull(bids.archivedAt))
    );
}

/** The archive, soonest-to-expire first — the order the user needs to act in. */
export async function getArchivedBids(userId: number): Promise<Bid[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(bids)
    .where(and(eq(bids.userId, userId), isNotNull(bids.archivedAt)))
    .orderBy(asc(bids.archivedAt));
}

/**
 * Destroy a bid and everything hanging off it. There is no undo past here.
 *
 * Line items and PDF rows go by `onDelete: "cascade"`, so this is one DELETE.
 * The S3 objects behind those PDF rows are NOT removed — see
 * server/scheduled/purgeArchivedBids.ts for why, and what it costs.
 */
export async function deleteBidForever(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(bids).where(and(eq(bids.id, id), eq(bids.userId, userId)));
}

/**
 * Every bid whose retention window has closed, across ALL users.
 *
 * Deliberately not user-scoped: the purge is a system sweep, not something a
 * user runs. The cutoff is computed once from the injected `now` and compared
 * against stored instants, so the boundary is exact rather than rounded to a
 * day — see shared/retention.ts on why the display rounds and this does not.
 */
export async function getExpiredArchivedBids(
  now: Date,
  retentionDays: number
): Promise<Bid[]> {
  const db = await getDb();
  if (!db) return [];
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  return db
    .select()
    .from(bids)
    .where(and(isNotNull(bids.archivedAt), lte(bids.archivedAt, cutoff)))
    .orderBy(asc(bids.archivedAt));
}

// ─── Bid PDFs (plan sheets) ───────────────────────────────────────────────────

/** Sheets attached to a bid, in the order the user put them. */
export async function getBidPdfs(
  bidId: number,
  userId: number
): Promise<BidPdf[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(bidPdfs)
    .where(and(eq(bidPdfs.bidId, bidId), eq(bidPdfs.userId, userId)))
    .orderBy(asc(bidPdfs.sortOrder), asc(bidPdfs.id));
}

export async function getBidPdf(
  id: number,
  userId: number
): Promise<BidPdf | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(bidPdfs)
    .where(and(eq(bidPdfs.id, id), eq(bidPdfs.userId, userId)))
    .limit(1);
  return row;
}

export async function createBidPdf(data: InsertBidPdf): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(bidPdfs).values(data);
  return result.insertId;
}

/** Next free slot, so a newly attached sheet lands at the bottom of the list. */
export async function nextBidPdfSortOrder(
  bidId: number,
  userId: number
): Promise<number> {
  const rows = await getBidPdfs(bidId, userId);
  return rows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
}

/**
 * Record how many pages a document turned out to have.
 *
 * Written by the viewer after the document opens, because parsing a PDF to
 * count pages needs a PDF parser and the server has none.
 */
export async function setBidPdfPageCount(
  id: number,
  userId: number,
  pageCount: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(bidPdfs)
    .set({ pageCount, updatedAt: new Date() })
    .where(and(eq(bidPdfs.id, id), eq(bidPdfs.userId, userId)));
}

export async function deleteBidPdf(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .delete(bidPdfs)
    .where(and(eq(bidPdfs.id, id), eq(bidPdfs.userId, userId)));
}

/**
 * How much takeoff work sits on one plan — everything deleteBidPdf destroys.
 *
 * Removing a plan cascades from its sheets to every stamp, traced run (and each
 * run's circuits) and plan-reader result on them, so the remove warning shows
 * these counts before anyone can confirm. They are counted straight from the
 * tables the cascade empties, so the warning and the delete cannot disagree.
 * See references/takeoff-spec.md, row V3.
 */
export async function getBidPdfTakeoffCounts(
  bidPdfId: number,
  userId: number
): Promise<PlanRemovalImpact> {
  const sheets = await getBidPdfSheets(bidPdfId, userId);
  if (sheets.length === 0) {
    return { sheets: 0, stamps: 0, runs: 0, circuits: 0, readerResults: 0 };
  }
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const sheetIds = sheets.map(sheet => sheet.id);

  const [stamps, runs, circuits, readerResults] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)` })
      .from(takeoffStamps)
      .where(
        and(
          inArray(takeoffStamps.sheetId, sheetIds),
          eq(takeoffStamps.userId, userId)
        )
      ),
    db
      .select({ n: sql<number>`count(*)` })
      .from(takeoffRuns)
      .where(
        and(
          inArray(takeoffRuns.sheetId, sheetIds),
          eq(takeoffRuns.userId, userId)
        )
      ),
    db
      .select({ n: sql<number>`count(*)` })
      .from(takeoffRunCircuits)
      .innerJoin(takeoffRuns, eq(takeoffRunCircuits.runId, takeoffRuns.id))
      .where(
        and(
          inArray(takeoffRuns.sheetId, sheetIds),
          eq(takeoffRuns.userId, userId)
        )
      ),
    db
      .select({ n: sql<number>`count(*)` })
      .from(planCopilotRuns)
      .where(
        and(
          inArray(planCopilotRuns.sheetId, sheetIds),
          eq(planCopilotRuns.userId, userId)
        )
      ),
  ]);

  const first = (rows: { n: number }[]) => Number(rows[0]?.n ?? 0);
  return {
    sheets: sheets.length,
    stamps: first(stamps),
    runs: first(runs),
    circuits: first(circuits),
    readerResults: first(readerResults),
  };
}

// ─── Plan sheets ──────────────────────────────────────────────────────────────

/** Re-exported so routers can type a sheet without importing the schema. */
export type BidPdfSheetRow = BidPdfSheet;

/** Every sheet of one document, in page order. */
export async function getBidPdfSheets(
  bidPdfId: number,
  userId: number
): Promise<BidPdfSheet[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(bidPdfSheets)
    .where(
      and(eq(bidPdfSheets.bidPdfId, bidPdfId), eq(bidPdfSheets.userId, userId))
    )
    .orderBy(asc(bidPdfSheets.pageNumber));
}

export async function getBidPdfSheet(
  id: number,
  userId: number
): Promise<BidPdfSheet | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(bidPdfSheets)
    .where(and(eq(bidPdfSheets.id, id), eq(bidPdfSheets.userId, userId)))
    .limit(1);
  return row;
}

export async function insertBidPdfSheets(rows: InsertBidPdfSheet[]) {
  if (rows.length === 0) return;
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(bidPdfSheets).values(rows);
}

export async function updateBidPdfSheet(
  id: number,
  userId: number,
  data: Partial<InsertBidPdfSheet>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const safe: Record<string, unknown> = { ...data };
  delete safe.id;
  delete safe.userId;
  delete safe.bidPdfId;
  delete safe.pageNumber;
  await db
    .update(bidPdfSheets)
    .set({ ...safe, updatedAt: new Date() })
    .where(and(eq(bidPdfSheets.id, id), eq(bidPdfSheets.userId, userId)));
}

// ─── Bid line items ───────────────────────────────────────────────────────────

/**
 * The bid's LIVE lines — archived ones are excluded here, once, deliberately.
 *
 * Every total on the bid is computed from this list, so filtering at the source
 * is what makes an archived unit stop costing money without the rollup knowing
 * archiving exists. The alternative — filtering at each call site — is one
 * forgotten `.filter()` away from a bid that quotes rooms the estimator removed.
 */
export async function getBidLineItems(bidId: number): Promise<BidLineItem[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(bidLineItems)
    .where(and(eq(bidLineItems.bidId, bidId), isNull(bidLineItems.archivedAt)))
    .orderBy(asc(bidLineItems.sortOrder), asc(bidLineItems.id));
}

/** Archived lines only — for showing what a bulk archive removed, and undoing it. */
export async function getArchivedBidLineItems(
  bidId: number
): Promise<BidLineItem[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(bidLineItems)
    .where(
      and(eq(bidLineItems.bidId, bidId), isNotNull(bidLineItems.archivedAt))
    )
    .orderBy(asc(bidLineItems.sortOrder), asc(bidLineItems.id));
}

export async function getBidLineItem(
  id: number,
  bidId: number
): Promise<BidLineItem | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(bidLineItems)
    .where(and(eq(bidLineItems.id, id), eq(bidLineItems.bidId, bidId)))
    .limit(1);
  return row;
}

/** Next free sort position, so appended lines land at the bottom. */
async function nextBidSortOrder(bidId: number): Promise<number> {
  const rows = await getBidLineItems(bidId);
  return rows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
}

/**
 * Take a live assembly and freeze its cost inputs onto a bid.
 *
 * This is the snapshot boundary. Everything the assembly currently resolves to
 * — its materials at today's prices, its hours, its role's rate, its modifier
 * total — is copied onto the line and never consulted again. Editing the
 * library assembly afterwards has no effect on this bid, which is the whole
 * point (ASSEMBLIES_PLAN.md § PROJECT ESTIMATES).
 */
export async function addAssemblyToBid(
  bidId: number,
  userId: number,
  assemblyId: number,
  qty: number,
  unitLabel: string | null = null,
  options: { merge?: boolean } = {}
): Promise<{ id: number; merged: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const detail = await getAssemblyDetail(assemblyId, userId);
  if (!detail) throw new Error("Assembly not found");

  /**
   * Quick-bid counts the same assembly over and over ("another six
   * receptacles"), and one row per keystroke-batch would bury the bid in
   * duplicates. With `merge` it finds the existing line for this assembly and
   * unit and adds to its quantity instead.
   *
   * The existing line KEEPS its original snapshot. That is the correct reading:
   * the estimator is counting more of a thing already priced on this bid, not
   * re-pricing it at today's rates. Taking a fresh snapshot here would make the
   * same assembly cost two different amounts within one bid depending on when
   * each was counted. Callers wanting a fresh snapshot omit `merge` — the
   * default — and get a new line, which is what the Bids screen does.
   */
  if (options.merge) {
    const existing = await db
      .select()
      .from(bidLineItems)
      .where(
        and(
          eq(bidLineItems.bidId, bidId),
          eq(bidLineItems.assemblyId, detail.id),
          unitLabel === null
            ? isNull(bidLineItems.unitLabel)
            : eq(bidLineItems.unitLabel, unitLabel)
        )
      )
      .limit(1);

    if (existing[0]) {
      const merged = Number(existing[0].qty) + qty;
      await db
        .update(bidLineItems)
        .set({ qty: merged.toFixed(4), updatedAt: new Date() })
        .where(eq(bidLineItems.id, existing[0].id));
      return { id: existing[0].id, merged: true };
    }
  }

  const [activeModifiers, rates] = await Promise.all([
    getLibraryModifiers(userId, "active"),
    getLibraryLaborRates(userId),
  ]);

  const applied = activeModifiers.filter(m =>
    detail.modifierIds.includes(m.id)
  );
  const modifierPct = applied.reduce(
    (sum, m) => sum + Number(m.laborAdjustmentPct),
    0
  );

  // Resolved through the shared lookup so a forked role still prices — the
  // snapshot must freeze the rate the assembly ACTUALLY means, not zero.
  const laborRate = hourlyCostFor(rates, detail.laborRateId);

  const materialCost = detail.materials.reduce(
    (sum, line) => sum + Number(line.costPerUnit) * Number(line.qty),
    0
  );

  const [result] = await db.insert(bidLineItems).values({
    bidId,
    assemblyId: detail.id,
    name: detail.name,
    qty: qty.toFixed(4),
    unitLabel,
    snapshotMaterialCost: materialCost.toFixed(4),
    /**
     * Material-driven hours AND the assembly's overhead hours, as one figure.
     *
     * Rolled up here rather than frozen as two columns, for the same reason
     * `snapshotMaterialCost` is one number rather than a copy of the recipe and
     * `snapshotModifierPct` is one summed fraction rather than a list: the
     * snapshot stores what the engine needs to re-price this line, not a replica
     * of the library row it came from.
     *
     * It also removes a whole class of bug. Three places copy a line's snapshot
     * — mass duplicate, unit generation and template push — and a second hours
     * column is a column each of them could forget, which would silently
     * under-price every generated room. One field cannot be half-copied.
     *
     * The split stays visible on the assembly itself, which is where an
     * estimator would go to ask what the hours are made of.
     */
    snapshotLaborHours: addAssemblyOverheadHours(
      Number(detail.baseLaborHours),
      Number(detail.overheadLaborHours)
    ).toFixed(4),
    snapshotModifierPct: modifierPct.toFixed(4),
    snapshotLaborRate: laborRate.toFixed(4),
    snapshotModifierNames: applied.map(m => m.name),
    sortOrder: await nextBidSortOrder(bidId),
  });
  return { id: result.insertId, merged: false };
}

/**
 * Editing a line inside a linked copy forks that copy — the same
 * fork-not-multiply rule the material library uses for shipped rows.
 *
 * `breakLink` defaults to TRUE because that is the safe direction: a caller who
 * forgets the option forks a copy that maybe did not need forking, which costs
 * the user one relink. The opposite default would silently overwrite a room the
 * estimator had deliberately customised the next time anyone pushed a template,
 * and they would have no way to know it happened.
 *
 * `pushTemplateToLinkedCopies` is the one caller that passes false: it IS the
 * template speaking, so its writes must not be mistaken for a hand edit.
 */
export async function updateBidLineItem(
  id: number,
  bidId: number,
  data: Partial<InsertBidLineItem>,
  options: { breakLink?: boolean } = {}
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const safe: Record<string, unknown> = { ...data };
  delete safe.id;
  delete safe.bidId;

  if (options.breakLink !== false) {
    const line = await getBidLineItem(id, bidId);
    if (line?.unitLabel) await forkBidUnit(bidId, line.unitLabel);
  }

  await db
    .update(bidLineItems)
    .set({ ...safe, updatedAt: new Date() })
    .where(and(eq(bidLineItems.id, id), eq(bidLineItems.bidId, bidId)));
}

/**
 * Removing a line from a copy is an edit like any other, so it forks too.
 * Without this, deleting the one assembly that made Room 107 different would
 * leave it "linked", and the next template push would put it straight back.
 */
export async function deleteBidLineItem(
  id: number,
  bidId: number,
  options: { breakLink?: boolean } = {}
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  if (options.breakLink !== false) {
    const line = await getBidLineItem(id, bidId);
    if (line?.unitLabel) await forkBidUnit(bidId, line.unitLabel);
  }

  await db
    .delete(bidLineItems)
    .where(and(eq(bidLineItems.id, id), eq(bidLineItems.bidId, bidId)));
}

/** Distinct unit labels present on a bid, in first-appearance order. */
export async function getBidUnitLabels(bidId: number): Promise<string[]> {
  const rows = await getBidLineItems(bidId);
  const seen: string[] = [];
  for (const row of rows) {
    if (row.unitLabel && !seen.includes(row.unitLabel))
      seen.push(row.unitLabel);
  }
  return seen;
}

/** One template and how many copies of it this generate action should make. */
export type UnitGroupSpec = { sourceUnitLabel: string; count: number };

/**
 * Generate numbered copies from one or more templates in a single action.
 *
 * ── Numbering runs across the groups, not within them ────────────────────────
 * "Standard Room" ×35 and "ADA Room" ×5 produce Room 101–140, in the order the
 * groups were given. That is the whole reason multi-group exists: a hotel's
 * rooms are numbered by where they are in the building, not by which spec they
 * were built from. Numbering each group from its own start would produce two
 * Room 101s, which is not a naming inconvenience — it is two different rooms
 * with one label, and every per-unit total downstream would merge them.
 *
 * ── Groups are not a relationship ────────────────────────────────────────────
 * Each group writes ordinary link rows pointing at its own template. Nothing
 * records that the groups were generated together, because nothing downstream
 * asks. Pushing an edit from "ADA Room" finds its five copies and stops.
 *
 * Copies inherit the TEMPLATE's snapshot rather than re-reading the library, so
 * 200 rooms from one template price identically even if a material moved
 * between the first add and this call.
 *
 * Labels colliding with one already on the bid are skipped, not overwritten,
 * and returned so the caller can say what it did not do.
 */
export async function generateBidUnits(
  bidId: number,
  groups: UnitGroupSpec[],
  baseName: string,
  startNumber: number
): Promise<{
  created: string[];
  skipped: string[];
  byTemplate: Record<string, string[]>;
}> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  if (groups.length === 0) throw new Error("No unit groups given");

  const all = await getBidLineItems(bidId);

  // Resolve every template up front so a bad label fails before anything is
  // written — a half-generated floor is worse than a rejected one.
  const sources = new Map<string, BidLineItem[]>();
  for (const group of groups) {
    if (!sources.has(group.sourceUnitLabel)) {
      const lines = all.filter(row => row.unitLabel === group.sourceUnitLabel);
      if (lines.length === 0)
        throw new Error(
          `No line items found for unit "${group.sourceUnitLabel}"`
        );
      sources.set(group.sourceUnitLabel, lines);
    }
  }

  const existingLabels = new Set(
    all.map(row => row.unitLabel).filter(Boolean) as string[]
  );
  let sortOrder = await nextBidSortOrder(bidId);
  let nextNumber = startNumber;

  const created: string[] = [];
  const skipped: string[] = [];
  const byTemplate: Record<string, string[]> = {};
  const rows: InsertBidLineItem[] = [];
  const links: InsertBidUnitLink[] = [];

  for (const group of groups) {
    const source = sources.get(group.sourceUnitLabel)!;
    byTemplate[group.sourceUnitLabel] ??= [];

    for (let made = 0; made < group.count; made++) {
      const label = `${baseName} ${nextNumber++}`;
      if (existingLabels.has(label)) {
        skipped.push(label);
        continue;
      }
      existingLabels.add(label);
      created.push(label);
      byTemplate[group.sourceUnitLabel].push(label);

      links.push({
        bidId,
        unitLabel: label,
        templateLabel: group.sourceUnitLabel,
      });

      for (const line of source) {
        rows.push({
          bidId,
          assemblyId: line.assemblyId,
          name: line.name,
          qty: line.qty,
          unitLabel: label,
          snapshotMaterialCost: line.snapshotMaterialCost,
          snapshotLaborHours: line.snapshotLaborHours,
          snapshotModifierPct: line.snapshotModifierPct,
          snapshotLaborRate: line.snapshotLaborRate,
          snapshotModifierNames: line.snapshotModifierNames,
          snapshotAt: line.snapshotAt,
          sortOrder: sortOrder++,
        });
      }
    }
  }

  if (rows.length > 0) await db.insert(bidLineItems).values(rows);
  if (links.length > 0) await db.insert(bidUnitLinks).values(links);
  return { created, skipped, byTemplate };
}

/**
 * Single-template generation — the original signature, now one group of one.
 *
 * Kept because the Quick-bid flow and the existing tests call it, and because
 * the simple case should stay simple: a house with repeating bedrooms has no
 * use for group syntax.
 */
export async function duplicateBidUnit(
  bidId: number,
  sourceUnitLabel: string,
  baseName: string,
  startNumber: number,
  count: number
): Promise<{ created: string[]; skipped: string[] }> {
  const { created, skipped } = await generateBidUnits(
    bidId,
    [{ sourceUnitLabel, count }],
    baseName,
    startNumber
  );
  return { created, skipped };
}

// ─── Unit template links ──────────────────────────────────────────────────────

export async function getBidUnitLinks(bidId: number): Promise<BidUnitLink[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(bidUnitLinks)
    .where(eq(bidUnitLinks.bidId, bidId))
    .orderBy(asc(bidUnitLinks.id));
}

/**
 * Break one copy's link. Idempotent, and a no-op for a unit that was never
 * generated — callers fork on any edit without first asking whether it matters.
 */
export async function forkBidUnit(
  bidId: number,
  unitLabel: string
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [link] = await db
    .select()
    .from(bidUnitLinks)
    .where(
      and(
        eq(bidUnitLinks.bidId, bidId),
        eq(bidUnitLinks.unitLabel, unitLabel),
        isNull(bidUnitLinks.forkedAt)
      )
    )
    .limit(1);
  if (!link) return false;

  await db
    .update(bidUnitLinks)
    .set({ forkedAt: new Date(), updatedAt: new Date() })
    .where(eq(bidUnitLinks.id, link.id));
  return true;
}

/** What a unit is, for the badge on screen and the actions offered on it. */
export type BidUnitState = {
  label: string;
  role: "template" | "linked" | "forked" | "standalone";
  /** Where a linked or forked copy came from. */
  templateLabel: string | null;
  /** For a template: how many copies still follow it, and how many broke away. */
  linkedCount: number;
  forkedCount: number;
};

/**
 * Every unit on the bid with its link role, derived rather than stored.
 *
 * "Template" is not a flag anyone sets — a unit is a template because copies
 * point at it. That means a template cannot be wrong about being one, and a
 * label typed by hand on a one-off line is simply `standalone`.
 */
export async function getBidUnitStates(bidId: number): Promise<BidUnitState[]> {
  const [labels, links] = await Promise.all([
    getBidUnitLabels(bidId),
    getBidUnitLinks(bidId),
  ]);

  const byCopy = new Map(links.map(link => [link.unitLabel, link]));
  const templates = new Map<string, { linked: number; forked: number }>();
  for (const link of links) {
    const tally = templates.get(link.templateLabel) ?? { linked: 0, forked: 0 };
    if (link.forkedAt) tally.forked++;
    else tally.linked++;
    templates.set(link.templateLabel, tally);
  }

  return labels.map(label => {
    const tally = templates.get(label);
    if (tally) {
      return {
        label,
        role: "template" as const,
        templateLabel: null,
        linkedCount: tally.linked,
        forkedCount: tally.forked,
      };
    }
    const link = byCopy.get(label);
    if (link) {
      return {
        label,
        role: link.forkedAt ? ("forked" as const) : ("linked" as const),
        templateLabel: link.templateLabel,
        linkedCount: 0,
        forkedCount: 0,
      };
    }
    return {
      label,
      role: "standalone" as const,
      templateLabel: null,
      linkedCount: 0,
      forkedCount: 0,
    };
  });
}

/**
 * Re-copy a template over every copy still following it.
 *
 * Replace rather than diff: the template's lines ARE the copy's lines, so
 * rebuilding is both simpler and correct for adds, removes and quantity changes
 * at once. A diff would need an identity for "the same line" across a copy, and
 * bid lines have none — two "Duplex receptacle" rows in one unit are a normal
 * thing to have.
 *
 * Forked copies are untouched, which is the entire point of forking. Archived
 * copies are untouched too: they are not on the bid, and silently reviving one
 * because its template moved would be a total changing for no visible reason.
 */
export async function pushTemplateToLinkedCopies(
  bidId: number,
  templateLabel: string
): Promise<{ updated: string[]; skippedForked: string[] }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const all = await getBidLineItems(bidId);
  const source = all.filter(row => row.unitLabel === templateLabel);
  if (source.length === 0)
    throw new Error(`No line items found for unit "${templateLabel}"`);

  const links = await getBidUnitLinks(bidId);
  const mine = links.filter(link => link.templateLabel === templateLabel);
  const live = new Set(
    all.map(row => row.unitLabel).filter(Boolean) as string[]
  );

  const updated: string[] = [];
  const skippedForked: string[] = [];

  for (const link of mine) {
    if (link.forkedAt) {
      skippedForked.push(link.unitLabel);
      continue;
    }
    if (!live.has(link.unitLabel)) continue; // archived — leave it alone
    updated.push(link.unitLabel);
  }

  if (updated.length === 0) return { updated, skippedForked };

  // Drop and rebuild in place. Deleting directly rather than through
  // deleteBidLineItem is deliberate: that helper forks, and this write is the
  // template speaking, not a hand edit.
  await db
    .delete(bidLineItems)
    .where(
      and(
        eq(bidLineItems.bidId, bidId),
        inArray(bidLineItems.unitLabel, updated)
      )
    );

  let sortOrder = await nextBidSortOrder(bidId);
  const rows: InsertBidLineItem[] = [];
  for (const label of updated) {
    for (const line of source) {
      rows.push({
        bidId,
        assemblyId: line.assemblyId,
        name: line.name,
        qty: line.qty,
        unitLabel: label,
        snapshotMaterialCost: line.snapshotMaterialCost,
        snapshotLaborHours: line.snapshotLaborHours,
        snapshotModifierPct: line.snapshotModifierPct,
        snapshotLaborRate: line.snapshotLaborRate,
        snapshotModifierNames: line.snapshotModifierNames,
        snapshotAt: line.snapshotAt,
        sortOrder: sortOrder++,
      });
    }
  }
  if (rows.length > 0) await db.insert(bidLineItems).values(rows);

  return { updated, skippedForked };
}

/**
 * Archive every copy still following a template — the "remove all 40 rooms"
 * action, reached from the link relationship rather than a separate mechanism.
 *
 * Archive rather than delete because this is the most destructive thing the
 * screen offers, and the snapshot that made every copy price alike would go
 * with a hard delete. Forked copies are left alone: breaking the link is how a
 * user says "this one is mine now", and a bulk action on the template must not
 * override that.
 */
export async function archiveLinkedCopies(
  bidId: number,
  templateLabel: string
): Promise<{ archived: string[]; skippedForked: string[] }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const links = await getBidUnitLinks(bidId);
  const mine = links.filter(link => link.templateLabel === templateLabel);
  const archived = mine.filter(l => !l.forkedAt).map(l => l.unitLabel);
  const skippedForked = mine.filter(l => l.forkedAt).map(l => l.unitLabel);

  if (archived.length > 0) {
    await db
      .update(bidLineItems)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(bidLineItems.bidId, bidId),
          inArray(bidLineItems.unitLabel, archived),
          isNull(bidLineItems.archivedAt)
        )
      );
  }
  return { archived, skippedForked };
}

/** Undo a bulk archive. The link rows were never removed, so copies relink. */
export async function restoreArchivedUnits(
  bidId: number,
  unitLabels: string[]
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  if (unitLabels.length === 0) return 0;

  await db
    .update(bidLineItems)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(bidLineItems.bidId, bidId),
        inArray(bidLineItems.unitLabel, unitLabels),
        isNotNull(bidLineItems.archivedAt)
      )
    );
  return unitLabels.length;
}

// ─── Recently used materials ──────────────────────────────────────────────────

/**
 * Materials this user has most recently put into one of their own assemblies.
 *
 * Powers the "start here" list the Assembly Builder shows before anything is
 * typed. Ordered by the assembly_materials row id, which is insertion order and
 * therefore recency, and de-duplicated so a material used ten times appears
 * once, at its most recent position.
 *
 * Scoped to the user's OWN assemblies — the shipped starter recipes are not
 * something this user reached for, so counting them would put the same handful
 * of materials at the top for everybody, forever.
 */
export async function getRecentMaterialsForUser(
  userId: number,
  limit = 8
): Promise<Material[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      materialId: assemblyMaterials.materialId,
      at: assemblyMaterials.id,
    })
    .from(assemblyMaterials)
    .innerJoin(assemblies, eq(assemblyMaterials.assemblyId, assemblies.id))
    .where(and(eq(assemblies.userId, userId), eq(assemblies.isActive, true)))
    .orderBy(desc(assemblyMaterials.id))
    .limit(limit * 8); // over-fetch, then de-duplicate down to `limit`

  const seen: number[] = [];
  for (const row of rows) {
    if (!seen.includes(row.materialId)) seen.push(row.materialId);
    if (seen.length >= limit) break;
  }
  if (seen.length === 0) return [];

  // Re-read through the library view so forks and visibility rules apply.
  const visible = await getLibraryMaterials(userId);
  const byId = new Map(visible.map(m => [m.id, m]));
  return seen.map(id => byId.get(id)).filter((m): m is Material => Boolean(m));
}

// ─── Duplicating an assembly ──────────────────────────────────────────────────

/**
 * Copy an assembly into a brand-new, fully independent one.
 *
 * Distinct from forkAssembly, and the difference matters: a fork REPLACES its
 * starter in the user's library and remembers where it came from, so it can be
 * reverted. A duplicate is a separate assembly that stands alongside the
 * original with `baselineId` NULL — no link back, nothing to revert to, and
 * editing it can never affect what it was copied from.
 */
export async function duplicateAssembly(
  sourceId: number,
  userId: number,
  newName: string
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const source = await getAssemblyById(sourceId, userId);
  if (!source) throw new Error("Assembly not found");

  const [result] = await db.insert(assemblies).values({
    ...contentFields<Assembly, InsertAssembly>(source),
    name: newName,
    userId,
    // The whole point: no baseline link, so this is nobody's copy but its own.
    baselineId: null,
    baselineVersion: null,
  } as InsertAssembly);
  const newId = result.insertId;

  await copyAssemblyChildren(source.id, newId);
  return newId;
}

// ─── Kits ─────────────────────────────────────────────────────────────────────

export type KitItemLine = {
  id: number;
  assemblyId: number;
  qty: string;
  sortOrder: number;
  name: string;
  category: Assembly["category"];
  baseLaborHours: string;
  /** Carried alongside the base hours so a kit's rollup counts them too. */
  overheadLaborHours: string;
  laborRateId: number | null;
};

export type KitDetail = Kit & { items: KitItemLine[] };

/** Starter kits plus the user's own, forked starters collapsed away. */
export async function getLibraryKits(
  userId: number,
  status: LibraryStatus = "active"
): Promise<Kit[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(kits)
    .where(
      and(
        or(isNull(kits.userId), eq(kits.userId, userId)),
        eq(kits.isActive, true)
      )
    )
    .orderBy(asc(kits.name));
  // See getLibraryMaterials on why the merge happens before the filter.
  return mergeLibraryRows(rows, userId).filter(row => row.status === status);
}

export async function getKitById(
  id: number,
  userId: number
): Promise<Kit | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(kits)
    .where(
      and(eq(kits.id, id), or(isNull(kits.userId), eq(kits.userId, userId)))
    )
    .limit(1);
  return row;
}

export async function getKitItems(kitId: number): Promise<KitItemLine[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: kitAssemblies.id,
      assemblyId: kitAssemblies.assemblyId,
      qty: kitAssemblies.qty,
      sortOrder: kitAssemblies.sortOrder,
      name: assemblies.name,
      category: assemblies.category,
      baseLaborHours: assemblies.baseLaborHours,
      overheadLaborHours: assemblies.overheadLaborHours,
      laborRateId: assemblies.laborRateId,
    })
    .from(kitAssemblies)
    .innerJoin(assemblies, eq(kitAssemblies.assemblyId, assemblies.id))
    .where(eq(kitAssemblies.kitId, kitId))
    .orderBy(asc(kitAssemblies.sortOrder), asc(kitAssemblies.id));
}

export async function getKitDetail(
  id: number,
  userId: number
): Promise<KitDetail | undefined> {
  const kit = await getKitById(id, userId);
  if (!kit) return undefined;
  return { ...kit, items: await getKitItems(id) };
}

export async function createKit(data: InsertKit): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(kits).values(data);
  return result.insertId;
}

export async function updateKit(
  id: number,
  userId: number,
  data: Partial<InsertKit>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const safe: Record<string, unknown> = { ...data };
  for (const field of LIBRARY_OWNERSHIP_FIELDS) delete safe[field];
  await db
    .update(kits)
    .set({ ...safe, updatedAt: new Date() })
    .where(and(eq(kits.id, id), eq(kits.userId, userId)));
}

/** Archive a kit — recoverable. See archiveLibraryRow. */
export async function archiveKit(id: number, userId: number): Promise<number> {
  return archiveLibraryRow("kits", id, userId, forkKit, getKitById);
}

export async function restoreKit(id: number, userId: number) {
  return restoreLibraryRow("kits", id, userId);
}

export async function deleteKitForever(id: number, userId: number) {
  return deleteLibraryRowForever("kits", id, userId);
}

/** Replace a kit's contents wholesale — same rule as assembly children. */
export async function setKitItems(
  kitId: number,
  items: Array<{ assemblyId: number; qty: string }>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(kitAssemblies).where(eq(kitAssemblies.kitId, kitId));
  if (items.length === 0) return;
  await db.insert(kitAssemblies).values(
    items.map((item, index) => ({
      kitId,
      assemblyId: item.assemblyId,
      qty: item.qty,
      sortOrder: index,
    }))
  );
}

export async function forkKit(
  baselineId: number,
  userId: number
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [existing] = await db
    .select()
    .from(kits)
    .where(and(eq(kits.userId, userId), eq(kits.baselineId, baselineId)))
    .limit(1);
  if (existing) return existing.id;

  const [baseline] = await db
    .select()
    .from(kits)
    .where(and(eq(kits.id, baselineId), isNull(kits.userId)))
    .limit(1);
  if (!baseline) throw new Error("Baseline kit not found");

  const [result] = await db.insert(kits).values({
    ...contentFields<Kit, InsertKit>(baseline),
    userId,
    baselineId: baseline.id,
    baselineVersion: baseline.version,
  } as InsertKit);
  const forkId = result.insertId;

  const items = await getKitItems(baseline.id);
  await setKitItems(
    forkId,
    items.map(i => ({ assemblyId: i.assemblyId, qty: i.qty }))
  );
  return forkId;
}

export async function revertKitToBaseline(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [fork] = await db
    .select()
    .from(kits)
    .where(and(eq(kits.id, id), eq(kits.userId, userId)))
    .limit(1);
  if (!fork) throw new Error("Kit not found");
  if (fork.baselineId == null) {
    throw new Error(
      "Kit was created from scratch — there is no original to revert to"
    );
  }

  const [baseline] = await db
    .select()
    .from(kits)
    .where(and(eq(kits.id, fork.baselineId), isNull(kits.userId)))
    .limit(1);
  if (!baseline) throw new Error("Baseline kit no longer exists");

  await db
    .update(kits)
    .set({
      ...contentFields<Kit, InsertKit>(baseline),
      baselineVersion: baseline.version,
      updatedAt: new Date(),
    })
    .where(and(eq(kits.id, id), eq(kits.userId, userId)));

  const items = await getKitItems(baseline.id);
  await setKitItems(
    id,
    items.map(i => ({ assemblyId: i.assemblyId, qty: i.qty }))
  );
}

/** Copy a kit into a new, independent one. Same distinction as duplicateAssembly. */
export async function duplicateKit(
  sourceId: number,
  userId: number,
  newName: string
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const source = await getKitById(sourceId, userId);
  if (!source) throw new Error("Kit not found");

  const [result] = await db.insert(kits).values({
    ...contentFields<Kit, InsertKit>(source),
    name: newName,
    userId,
    baselineId: null,
    baselineVersion: null,
  } as InsertKit);
  const newId = result.insertId;

  const items = await getKitItems(source.id);
  await setKitItems(
    newId,
    items.map(i => ({ assemblyId: i.assemblyId, qty: i.qty }))
  );
  return newId;
}

/**
 * Add every assembly in a kit to a bid, snapshotting each one.
 *
 * A kit does NOT become a row on the bid. It expands into ordinary line items,
 * which is what makes the per-item quantities editable afterwards — one bedroom
 * needing a fifth receptacle is just an edit to that line, with no kit-shaped
 * container in the way.
 *
 * Each line snapshots independently through the existing addAssemblyToBid, so
 * kit lines and hand-added lines are the same kind of thing and price
 * identically. `qty` multiplies through: 2 × "Bedroom package" containing
 * 4 receptacles lands 8 receptacles.
 */
export async function addKitToBid(
  bidId: number,
  userId: number,
  kitId: number,
  qty: number,
  unitLabel: string | null = null
): Promise<{ lineIds: number[]; kitName: string; skipped: string[] }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const kit = await getKitDetail(kitId, userId);
  if (!kit) throw new Error("Kit not found");

  const lineIds: number[] = [];
  const skipped: string[] = [];

  for (const item of kit.items) {
    try {
      const { id } = await addAssemblyToBid(
        bidId,
        userId,
        item.assemblyId,
        Number(item.qty) * qty,
        unitLabel
      );
      await db
        .update(bidLineItems)
        .set({ sourceKitName: kit.name })
        .where(eq(bidLineItems.id, id));
      lineIds.push(id);
    } catch {
      // One unreachable assembly must not abandon the rest of the kit
      // half-added; report it instead.
      skipped.push(item.name);
    }
  }

  return { lineIds, kitName: kit.name, skipped };
}

/** Seed the shipped starter kits. Runs after assemblies, matched by name. */
export async function seedBaselineKits(): Promise<void> {
  await withSeedLock("helixbid:seed:kits", async () => {
    const db = await getDb();
    if (!db) return;

    await dedupeBaselineRows("kits");

    const existingRows = await db
      .select({ name: kits.name })
      .from(kits)
      .where(isNull(kits.userId));
    const alreadySeeded = new Set(existingRows.map(row => row.name));

    const pending = BASELINE_KITS.filter(k => !alreadySeeded.has(k.name));
    if (pending.length === 0) return;

    const baselineAssemblies = await db
      .select({ id: assemblies.id, name: assemblies.name })
      .from(assemblies)
      .where(isNull(assemblies.userId));
    const idByName = new Map(baselineAssemblies.map(row => [row.name, row.id]));

    for (const spec of pending) {
      const items = spec.items.map(item => ({
        assemblyId: idByName.get(item.assembly),
        qty: item.qty.toFixed(4),
      }));
      if (items.some(item => item.assemblyId === undefined)) {
        const missing = spec.items
          .filter(item => !idByName.has(item.assembly))
          .map(item => item.assembly);
        console.warn(
          `[BaselineKits] Skipping "${spec.name}" — missing assemblies: ${missing.join(", ")}`
        );
        continue;
      }

      const [result] = await db.insert(kits).values({
        userId: null,
        name: spec.name,
        description: spec.description,
      });
      await setKitItems(
        result.insertId,
        items as Array<{ assemblyId: number; qty: string }>
      );
    }
  });
}

// ─── Traced runs (takeoff phase 2b) ───────────────────────────────────────────

/** Every run on one sheet, oldest first — the order they were traced. */
export async function getRunsForSheet(
  sheetId: number,
  userId: number
): Promise<TakeoffRun[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(takeoffRuns)
    .where(
      and(eq(takeoffRuns.sheetId, sheetId), eq(takeoffRuns.userId, userId))
    )
    .orderBy(asc(takeoffRuns.id));
}

/** Every run on a whole bid, for the bill of materials rollup. */
export async function getRunsForBid(
  bidId: number,
  userId: number
): Promise<TakeoffRun[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(takeoffRuns)
    .where(and(eq(takeoffRuns.bidId, bidId), eq(takeoffRuns.userId, userId)))
    .orderBy(asc(takeoffRuns.id));
}

export async function getRunById(
  id: number,
  userId: number
): Promise<TakeoffRun | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(takeoffRuns)
    .where(and(eq(takeoffRuns.id, id), eq(takeoffRuns.userId, userId)))
    .limit(1);
  return row;
}

export async function createRun(data: InsertTakeoffRun): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(takeoffRuns).values(data);
  return result.insertId;
}

export async function updateRun(
  id: number,
  userId: number,
  data: Partial<InsertTakeoffRun>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const safe: Record<string, unknown> = { ...data };
  delete safe.id;
  delete safe.userId;
  delete safe.bidId;
  await db
    .update(takeoffRuns)
    .set({ ...safe, updatedAt: new Date() })
    .where(and(eq(takeoffRuns.id, id), eq(takeoffRuns.userId, userId)));
}

export async function deleteRun(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .delete(takeoffRuns)
    .where(and(eq(takeoffRuns.id, id), eq(takeoffRuns.userId, userId)));
}

/** Circuits pulled through one run. */
export async function getRunCircuits(
  runId: number,
  userId: number
): Promise<TakeoffRunCircuit[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(takeoffRunCircuits)
    .where(
      and(
        eq(takeoffRunCircuits.runId, runId),
        eq(takeoffRunCircuits.userId, userId)
      )
    )
    .orderBy(asc(takeoffRunCircuits.id));
}

/** Circuits for many runs at once, so a rollup is not N+1 queries. */
export async function getCircuitsForRuns(
  runIds: number[],
  userId: number
): Promise<TakeoffRunCircuit[]> {
  if (runIds.length === 0) return [];
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(takeoffRunCircuits)
    .where(
      and(
        inArray(takeoffRunCircuits.runId, runIds),
        eq(takeoffRunCircuits.userId, userId)
      )
    )
    .orderBy(asc(takeoffRunCircuits.id));
}

export async function createRunCircuit(
  data: InsertTakeoffRunCircuit
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(takeoffRunCircuits).values(data);
  return result.insertId;
}

export async function updateRunCircuit(
  id: number,
  userId: number,
  data: Partial<InsertTakeoffRunCircuit>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const safe: Record<string, unknown> = { ...data };
  delete safe.id;
  delete safe.userId;
  delete safe.runId;
  await db
    .update(takeoffRunCircuits)
    .set({ ...safe, updatedAt: new Date() })
    .where(
      and(eq(takeoffRunCircuits.id, id), eq(takeoffRunCircuits.userId, userId))
    );
}

export async function deleteRunCircuit(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .delete(takeoffRunCircuits)
    .where(
      and(eq(takeoffRunCircuits.id, id), eq(takeoffRunCircuits.userId, userId))
    );
}

// ─── Stamps and symbol links (takeoff phase 2c) ───────────────────────────────

export async function getStampsForSheet(
  sheetId: number,
  userId: number
): Promise<TakeoffStamp[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(takeoffStamps)
    .where(
      and(eq(takeoffStamps.sheetId, sheetId), eq(takeoffStamps.userId, userId))
    )
    .orderBy(asc(takeoffStamps.id));
}

export async function getStampsForBid(
  bidId: number,
  userId: number
): Promise<TakeoffStamp[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(takeoffStamps)
    .where(
      and(eq(takeoffStamps.bidId, bidId), eq(takeoffStamps.userId, userId))
    )
    .orderBy(asc(takeoffStamps.id));
}

/** Insert many at once — the stamp tool flushes a batch of clicks. */
export async function createStamps(rows: InsertTakeoffStamp[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(takeoffStamps).values(rows);
}

/** Tag where a placed stamp sits — the Location layer. */
export async function setStampLocation(
  id: number,
  userId: number,
  location: TakeoffLocation | null
) {
  const database = await getDb();
  if (!database) throw new Error("DB unavailable");
  await database
    .update(takeoffStamps)
    .set({ location, updatedAt: new Date() })
    .where(and(eq(takeoffStamps.id, id), eq(takeoffStamps.userId, userId)));
}

/** Tag a whole assembly's stamps at once — the common case after stamping. */
export async function setStampLocationForAssembly(
  sheetId: number,
  userId: number,
  assemblyName: string,
  location: TakeoffLocation | null
) {
  const database = await getDb();
  if (!database) throw new Error("DB unavailable");
  await database
    .update(takeoffStamps)
    .set({ location, updatedAt: new Date() })
    .where(
      and(
        eq(takeoffStamps.sheetId, sheetId),
        eq(takeoffStamps.userId, userId),
        eq(takeoffStamps.assemblyName, assemblyName)
      )
    );
}

export async function deleteStamp(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .delete(takeoffStamps)
    .where(and(eq(takeoffStamps.id, id), eq(takeoffStamps.userId, userId)));
}

/** Every symbol the user has captured, linked or not. */
export async function getSymbolLinks(userId: number): Promise<SymbolLink[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(symbolLinks)
    .where(eq(symbolLinks.userId, userId))
    .orderBy(asc(symbolLinks.label));
}

export async function getSymbolLinkByKey(
  userId: number,
  lookupKey: string
): Promise<SymbolLink | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(symbolLinks)
    .where(
      and(eq(symbolLinks.userId, userId), eq(symbolLinks.lookupKey, lookupKey))
    )
    .limit(1);
  return row;
}

export async function getSymbolLinkById(
  id: number,
  userId: number
): Promise<SymbolLink | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(symbolLinks)
    .where(and(eq(symbolLinks.id, id), eq(symbolLinks.userId, userId)))
    .limit(1);
  return row;
}

export async function createSymbolLink(
  data: InsertSymbolLink
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(symbolLinks).values(data);
  return result.insertId;
}

export async function updateSymbolLink(
  id: number,
  userId: number,
  data: Partial<InsertSymbolLink>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const safe: Record<string, unknown> = { ...data };
  delete safe.id;
  delete safe.userId;
  await db
    .update(symbolLinks)
    .set({ ...safe, updatedAt: new Date() })
    .where(and(eq(symbolLinks.id, id), eq(symbolLinks.userId, userId)));
}

export async function deleteSymbolLink(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .delete(symbolLinks)
    .where(and(eq(symbolLinks.id, id), eq(symbolLinks.userId, userId)));
}

// ─── Early access signups ─────────────────────────────────────────────────────

/**
 * Record a signup, or recognise one already on the list.
 *
 * Returns whether the row was new, because the two cases read completely
 * differently to the person at the form: "you're on the list" and "you're
 * already on the list" are both good news, and a duplicate must never surface
 * as an error. The unique index on email is what makes this safe under two
 * simultaneous submissions of the same address.
 */
export async function addEarlyAccessSignup(data: {
  email: string;
  tradeId: string;
}): Promise<{ created: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [existing] = await db
    .select()
    .from(earlyAccessSignups)
    .where(eq(earlyAccessSignups.email, data.email))
    .limit(1);
  if (existing) return { created: false };

  try {
    await db.insert(earlyAccessSignups).values(data);
    return { created: true };
  } catch (error) {
    // Lost a race with another submission of the same address. That is the
    // unique index doing its job, not a failure worth showing anyone.
    const [now] = await db
      .select()
      .from(earlyAccessSignups)
      .where(eq(earlyAccessSignups.email, data.email))
      .limit(1);
    if (now) return { created: false };
    throw error;
  }
}

/** The list, newest first — what the admin screen and the export both read. */
export async function getEarlyAccessSignups(
  limit = 1000
): Promise<EarlyAccessSignup[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(earlyAccessSignups)
    .orderBy(desc(earlyAccessSignups.createdAt))
    .limit(limit);
}

export async function countEarlyAccessSignups(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db
    .select({ total: sql<number>`count(*)` })
    .from(earlyAccessSignups);
  return Number(row?.total ?? 0);
}

/** Mark someone as contacted, or undo that. */
export async function setEarlyAccessNotified(id: number, notified: boolean) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(earlyAccessSignups)
    .set({ notifiedAt: notified ? new Date() : null, updatedAt: new Date() })
    .where(eq(earlyAccessSignups.id, id));
}

// ─── Plan co-pilot ────────────────────────────────────────────────────────────

/**
 * The stored reading of one sheet, if there is one.
 *
 * This is the cost control: a page already read is returned from here instead
 * of paying a model to read it again. The newest run wins — a re-read leaves
 * the old one in place rather than deleting it, so a user who re-reads and
 * preferred the first answer has not lost it.
 */
export async function getLatestCopilotRun(
  sheetId: number,
  userId: number
): Promise<PlanCopilotRun | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(planCopilotRuns)
    .where(
      and(
        eq(planCopilotRuns.sheetId, sheetId),
        eq(planCopilotRuns.userId, userId)
      )
    )
    .orderBy(desc(planCopilotRuns.id))
    .limit(1);
  return row;
}

export async function createCopilotRun(
  data: InsertPlanCopilotRun
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(planCopilotRuns).values(data);
  return result.insertId;
}

export async function getCopilotRunById(
  id: number,
  userId: number
): Promise<PlanCopilotRun | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(planCopilotRuns)
    .where(and(eq(planCopilotRuns.id, id), eq(planCopilotRuns.userId, userId)))
    .limit(1);
  return row;
}

export async function createCopilotFindings(
  rows: InsertPlanCopilotFinding[]
): Promise<void> {
  if (rows.length === 0) return;
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(planCopilotFindings).values(rows);
}

export async function getCopilotFindings(
  runId: number,
  userId: number
): Promise<PlanCopilotFinding[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(planCopilotFindings)
    .where(
      and(
        eq(planCopilotFindings.runId, runId),
        eq(planCopilotFindings.userId, userId)
      )
    )
    .orderBy(asc(planCopilotFindings.id));
}

export async function getCopilotFindingsByIds(
  ids: number[],
  userId: number
): Promise<PlanCopilotFinding[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(planCopilotFindings)
    .where(
      and(
        inArray(planCopilotFindings.id, ids),
        eq(planCopilotFindings.userId, userId)
      )
    )
    .orderBy(asc(planCopilotFindings.id));
}

/** Mark what became of a finding once the user has decided. */
export async function setCopilotFindingStatus(
  id: number,
  userId: number,
  status: CopilotFindingStatus,
  stampId: number | null = null
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(planCopilotFindings)
    .set({ status, stampId, updatedAt: new Date() })
    .where(
      and(
        eq(planCopilotFindings.id, id),
        eq(planCopilotFindings.userId, userId)
      )
    );
}

/**
 * Re-point a finding after the user corrects what it is.
 *
 * Narrowly typed rather than taking the whole insert shape: a correction may
 * change what a finding MEANS, but it must never be able to reach across and
 * change which run or which user it belongs to.
 */
export async function updateCopilotFinding(
  id: number,
  userId: number,
  data: {
    symbolLinkId?: number | null;
    assemblyId?: number | null;
    assemblyName?: string | null;
    confidence?: "high" | "low" | "unreadable";
    status?: CopilotFindingStatus;
    reason?: string | null;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(planCopilotFindings)
    .set({ ...data, updatedAt: new Date() })
    .where(
      and(
        eq(planCopilotFindings.id, id),
        eq(planCopilotFindings.userId, userId)
      )
    );
}

/**
 * What this user has already corrected on plans from the same source.
 *
 * Scoped by BOTH userId and sourceKey. Dropping either one is the bug this
 * signature exists to make hard: without userId, one contractor's reading of an
 * ambiguous mark rewrites another's; without sourceKey, a fix made for one
 * architect's shorthand is applied to every firm's drawings.
 */
export async function getCopilotCorrections(
  userId: number,
  sourceKey: string
): Promise<PlanCopilotCorrection[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(planCopilotCorrections)
    .where(
      and(
        eq(planCopilotCorrections.userId, userId),
        eq(planCopilotCorrections.sourceKey, sourceKey)
      )
    )
    .orderBy(desc(planCopilotCorrections.timesApplied));
}

/**
 * Remember a correction, or count another instance of one already known.
 *
 * Repeating a correction bumps `timesApplied` rather than adding a row, which
 * is what lets the resolver break a tie in favour of the answer the user keeps
 * giving. Re-pointing an existing correction at a different symbol resets the
 * count to 1 — the user has changed their mind, and the old tally is a tally of
 * a decision they no longer hold.
 */
export async function upsertCopilotCorrection(data: {
  userId: number;
  sourceKey: string;
  rawLabel: string;
  rawLabelKey: string;
  symbolLinkId: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [existing] = await db
    .select()
    .from(planCopilotCorrections)
    .where(
      and(
        eq(planCopilotCorrections.userId, data.userId),
        eq(planCopilotCorrections.sourceKey, data.sourceKey),
        eq(planCopilotCorrections.rawLabelKey, data.rawLabelKey)
      )
    )
    .limit(1);

  if (!existing) {
    await db.insert(planCopilotCorrections).values({
      userId: data.userId,
      sourceKey: data.sourceKey,
      rawLabel: data.rawLabel,
      rawLabelKey: data.rawLabelKey,
      symbolLinkId: data.symbolLinkId,
      timesApplied: 1,
    });
    return;
  }

  const sameAnswer = existing.symbolLinkId === data.symbolLinkId;
  await db
    .update(planCopilotCorrections)
    .set({
      symbolLinkId: data.symbolLinkId,
      rawLabel: data.rawLabel,
      timesApplied: sameAnswer ? existing.timesApplied + 1 : 1,
      updatedAt: new Date(),
    })
    .where(eq(planCopilotCorrections.id, existing.id));
}

/**
 * Insert stamps and hand back their ids, in the order they were given.
 *
 * The plain createStamps() above is enough for the stamp tool, which does not
 * care what row it made. Confirming a co-pilot finding does: the finding has to
 * point at the stamp it became, so deleting the mark later can put the finding
 * back to unconfirmed rather than leaving a dangling claim that it is on the
 * bid. MySQL hands back the first id of a batch insert and guarantees the rest
 * are consecutive, which is what the arithmetic below relies on.
 */
export async function createStampsReturningIds(
  rows: InsertTakeoffStamp[]
): Promise<number[]> {
  if (rows.length === 0) return [];
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(takeoffStamps).values(rows);
  const first = result.insertId;
  return rows.map((_, index) => first + index);
}

// ─── Materials list (supplier quote request) ──────────────────────────────────

/**
 * Material lines for several assemblies at once, WITHOUT their costs.
 *
 * A near-twin of `getAssemblyMaterialLines`, and deliberately not a parameter
 * on it. That one joins `costPerUnit` because pricing needs it; this one does
 * not select the column at all, so the rows it returns have no cost to leak
 * into a document that is sent outside the company. The duplication is the
 * safeguard: a `withCost: false` flag would put the cost one wrong argument
 * away from a supplier, and the flag would be read as a display preference by
 * the next person to touch it. Two functions cannot be confused that way.
 *
 * Batched over many assemblies because a takeoff of forty stamped types would
 * otherwise be forty round trips.
 */
export async function getAssemblyMaterialQuantities(
  assemblyIds: number[]
): Promise<
  Array<{
    assemblyId: number;
    materialId: number;
    qty: string;
    name: string;
    unitOfSale: "each" | "foot" | "box";
    category: string | null;
  }>
> {
  if (assemblyIds.length === 0) return [];
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      assemblyId: assemblyMaterials.assemblyId,
      materialId: assemblyMaterials.materialId,
      qty: assemblyMaterials.qty,
      name: materials.name,
      unitOfSale: materials.unitOfSale,
      category: materials.category,
    })
    .from(assemblyMaterials)
    .innerJoin(materials, eq(assemblyMaterials.materialId, materials.id))
    .where(inArray(assemblyMaterials.assemblyId, assemblyIds))
    .orderBy(asc(assemblyMaterials.sortOrder), asc(assemblyMaterials.id));
}

/**
 * Scale facts for every sheet of a bid, keyed by sheet id.
 *
 * Runs record which sheet they were traced on, and a run cannot be turned into
 * a footage without that sheet's scale. Fetched for the whole bid in one query
 * because a run list spans sheets and documents.
 */
export async function getSheetScalesForBid(
  bidId: number,
  userId: number
): Promise<
  Map<
    number,
    { scaleRatio: number | null; scaleSource: string; notToScale: boolean }
  >
> {
  const db = await getDb();
  if (!db) return new Map();
  const rows = await db
    .select({
      id: bidPdfSheets.id,
      scaleRatio: bidPdfSheets.scaleRatio,
      scaleSource: bidPdfSheets.scaleSource,
      notToScale: bidPdfSheets.notToScale,
    })
    .from(bidPdfSheets)
    .innerJoin(bidPdfs, eq(bidPdfSheets.bidPdfId, bidPdfs.id))
    .where(and(eq(bidPdfs.bidId, bidId), eq(bidPdfSheets.userId, userId)));

  return new Map(
    rows.map(row => [
      row.id,
      {
        scaleRatio: row.scaleRatio === null ? null : Number(row.scaleRatio),
        scaleSource: row.scaleSource,
        notToScale: row.notToScale,
      },
    ])
  );
}

// ─── Companies, members, invitations ──────────────────────────────────────────
/**
 * Access-control storage. Every function here answers a question about WHO,
 * never about whose data — scoping lives in `_core/companyScope.ts`.
 *
 * All of these take a `companyId` that the caller has already proved the actor
 * belongs to. None of them derive a company from anything the client sent, and
 * none of them are safe to call with an id straight off a request.
 */

/** Members of one company, newest role changes last. Bounded: see the cap. */
export async function getCompanyMembers(
  companyId: number,
  limit = 200
): Promise<
  Array<{
    id: number;
    userId: number;
    role: string;
    status: string;
    joinedAt: Date;
    name: string | null;
    email: string | null;
    accessTier: string;
  }>
> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: companyMembers.id,
      userId: companyMembers.userId,
      role: companyMembers.role,
      status: companyMembers.status,
      joinedAt: companyMembers.joinedAt,
      name: users.name,
      email: users.email,
      accessTier: users.accessTier,
    })
    .from(companyMembers)
    .innerJoin(users, eq(companyMembers.userId, users.id))
    .where(eq(companyMembers.companyId, companyId))
    .orderBy(asc(companyMembers.id))
    .limit(limit);
}

/** One membership, or undefined. The authorisation lookup. */
export async function getMembership(
  companyId: number,
  userId: number
): Promise<CompanyMember | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(companyMembers)
    .where(
      and(
        eq(companyMembers.companyId, companyId),
        eq(companyMembers.userId, userId)
      )
    )
    .limit(1);
  return row;
}

export async function getCompanyById(id: number): Promise<Company | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, id))
    .limit(1);
  return row;
}

export async function renameCompany(id: number, name: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(companies).set({ name }).where(eq(companies.id, id));
}

export async function setMemberRole(
  companyId: number,
  userId: number,
  role: (typeof COMPANY_ROLE_VALUES)[number]
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(companyMembers)
    .set({ role })
    .where(
      and(
        eq(companyMembers.companyId, companyId),
        eq(companyMembers.userId, userId)
      )
    );
}

export async function setMemberStatus(
  companyId: number,
  userId: number,
  status: (typeof MEMBER_STATUS_VALUES)[number]
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(companyMembers)
    .set({ status })
    .where(
      and(
        eq(companyMembers.companyId, companyId),
        eq(companyMembers.userId, userId)
      )
    );
}

/** Outstanding invitations. Never returns the code — only its hash exists. */
export async function getCompanyInvites(
  companyId: number,
  limit = 100
): Promise<CompanyInvite[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(companyInvites)
    .where(eq(companyInvites.companyId, companyId))
    .orderBy(desc(companyInvites.id))
    .limit(limit);
}

export async function createInvite(data: InsertCompanyInvite): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(companyInvites).values(data);
  return result.insertId;
}

/**
 * Find an invitation by the hash of its code.
 *
 * By hash and nothing else: there is no company id in the lookup, because the
 * person redeeming a code does not yet belong to the company and has no way to
 * name it. The hash IS the credential, which is why it is unique-indexed and
 * why the plaintext is never stored.
 */
export async function getInviteByCodeHash(
  codeHash: string
): Promise<CompanyInvite | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(companyInvites)
    .where(eq(companyInvites.codeHash, codeHash))
    .limit(1);
  return row;
}

export async function revokeInvite(
  id: number,
  companyId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(companyInvites)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(companyInvites.id, id), eq(companyInvites.companyId, companyId))
    );
}

/**
 * Redeem an invitation: mark it used and add the membership.
 *
 * The two writes are ordered so the invite is consumed FIRST. If the second
 * fails, the code is spent and nobody joined — recoverable by issuing another.
 * The other order would leave a usable code after someone had already joined
 * with it, which is a second stranger in the company.
 */
export async function acceptInvite(
  invite: CompanyInvite,
  userId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(companyInvites)
    .set({ acceptedAt: new Date(), acceptedByUserId: userId })
    .where(eq(companyInvites.id, invite.id));
  await db.insert(companyMembers).values({
    companyId: invite.companyId,
    userId,
    role: invite.role,
    status: "active",
    invitedByUserId: invite.createdByUserId,
  });
}

/** Platform-level tier change. Admin only — see the router. */
export async function setUserAccessTier(
  userId: number,
  accessTier: (typeof ACCESS_TIER_VALUES)[number]
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(users).set({ accessTier }).where(eq(users.id, userId));
}

/**
 * Point a user at the company they are working in.
 *
 * Only ever called with a company the caller has already been proved a member
 * of — see companyRouter. Setting it to a company they cannot reach is not a
 * privilege grant (the resolver re-checks membership every request) but it
 * would strand them, so the check belongs at the call site.
 */
export async function setActiveCompany(
  userId: number,
  companyId: number | null
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(users)
    .set({ activeCompanyId: companyId })
    .where(eq(users.id, userId));
}

/** Every company this user can act in, for the switcher. */
export async function getMembershipsForUser(
  userId: number
): Promise<Array<{ companyId: number; name: string; role: string }>> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      companyId: companies.id,
      name: companies.name,
      role: companyMembers.role,
    })
    .from(companyMembers)
    .innerJoin(companies, eq(companyMembers.companyId, companies.id))
    .where(
      and(
        eq(companyMembers.userId, userId),
        eq(companyMembers.status, "active")
      )
    )
    .orderBy(asc(companyMembers.id))
    .limit(50);
}

// ─── Historical search ────────────────────────────────────────────────────────
/**
 * Search a company's bids, one page at a time.
 *
 * ── Everything narrows in SQL ───────────────────────────────────────────────
 * Nothing here reads a list into Node to filter it. The database is handed
 * every predicate and returns at most `pageSize + 1` rows — the extra row being
 * how the caller knows there is a next page without a second counting query
 * that would scan what this one avoided.
 *
 * ── The join is not optional ────────────────────────────────────────────────
 * A bid carries its client as free text, as a link, or both, and
 * `shared/bidClient.ts` resolves which wins for display. Search has to look at
 * both sources or it misses every bid created through the client picker, which
 * carries only the link. That is a LEFT join: a bid with no client is a normal
 * bid and must still be findable by name or address.
 *
 * ── Keyset, not OFFSET ──────────────────────────────────────────────────────
 * The cursor is `(sortValue, id)` and the predicate is a row comparison against
 * it, so the database seeks into `(userId, sortColumn)` and reads forward. Page
 * 500 costs what page 1 costs, and a bid created mid-scroll cannot shift the
 * window and cause a row to repeat or vanish.
 *
 * ── What is NOT indexed, and when that changes ──────────────────────────────
 * `trades` is a JSON array matched with JSON_CONTAINS, which no b-tree can
 * serve. It is a residual filter applied to rows already narrowed to one
 * company, which is cheap while a company has thousands of bids rather than
 * millions. MySQL 8.0.17+ has multi-valued indexes and this database is 8.0.46,
 * so the escalation is available: index the array and switch the predicate to
 * `MEMBER OF`. Worth doing when a trade filter on a large company starts
 * showing up as slow, not before — drizzle cannot express that index, so it
 * would have to live in a hand-written migration and drift from the schema.
 */
export async function searchBids(
  userId: number,
  filters: {
    text?: string;
    client?: string;
    address?: string;
    trade?: string;
    status?: string;
    dateField?: "created" | "due";
    from?: string;
    to?: string;
    archive?: "live" | "archived" | "all";
    sort?: "recent" | "created";
  },
  cursor: { at: number; id: number } | null,
  pageSize: number
): Promise<Bid[]> {
  const db = await getDb();
  if (!db) return [];

  const sortColumn =
    filters.sort === "created" ? bids.createdAt : bids.updatedAt;
  const conditions = [eq(bids.userId, userId)];

  // Archived is its own axis, not a status. A won bid and an archived bid are
  // different facts and a contractor searching history wants to say so.
  if (filters.archive === "archived")
    conditions.push(isNotNull(bids.archivedAt));
  else if (filters.archive !== "all") conditions.push(isNull(bids.archivedAt));

  /**
   * A LIKE pattern with an explicit escape character.
   *
   * `escapeLike` has already neutralised any `%` or `_` the user typed; this
   * tells MySQL that the backslash it used to do so is an escape rather than a
   * literal. Without the ESCAPE clause the two halves disagree and a search for
   * "50% deposit" matches everything the contractor owns.
   *
   * Four backslashes, and they are all doing something: two survive the
   * TypeScript string to become `\\` in the SQL text, which MySQL then reads as
   * one literal backslash. Writing two here emits `ESCAPE '\'`, an unterminated
   * string literal, and every search fails at the driver.
   */
  const pat = (pattern: string) => sql`${pattern} ESCAPE '\\\\'`;

  const text = usableTerm(filters.text);
  if (text) {
    const pattern = containsPattern(text);
    conditions.push(
      or(
        sql`${bids.name} LIKE ${pat(pattern)}`,
        sql`${bids.clientName} LIKE ${pat(pattern)}`,
        sql`${bids.siteAddress} LIKE ${pat(pattern)}`,
        sql`${clients.name} LIKE ${pat(pattern)}`,
        sql`${clients.address} LIKE ${pat(pattern)}`
      )!
    );
  }

  const client = usableTerm(filters.client);
  if (client) {
    const pattern = containsPattern(client);
    conditions.push(
      or(
        sql`${bids.clientName} LIKE ${pat(pattern)}`,
        sql`${clients.name} LIKE ${pat(pattern)}`
      )!
    );
  }

  const address = usableTerm(filters.address);
  if (address) {
    const pattern = containsPattern(address);
    conditions.push(
      or(
        sql`${bids.siteAddress} LIKE ${pat(pattern)}`,
        sql`${clients.address} LIKE ${pat(pattern)}`
      )!
    );
  }

  const trade = usableTerm(filters.trade);
  if (trade) {
    conditions.push(
      sql`JSON_CONTAINS(${bids.trades}, ${JSON.stringify(trade)})`
    );
  }

  const status = usableTerm(filters.status);
  if (status) {
    conditions.push(eq(bids.status, status as (typeof BID_STATUSES)[number]));
  }

  const { start, end } = dateRangeBounds(filters.from, filters.to);
  if (filters.dateField === "due") {
    // dueDate is a DATE column read in string mode, so it compares against the
    // same `YYYY-MM-DD` shape rather than against a timestamp. Both ends are
    // inclusive here, which is what a person means by a date range.
    if (filters.from) conditions.push(gte(bids.dueDate, filters.from));
    if (filters.to) conditions.push(lte(bids.dueDate, filters.to));
  } else {
    if (start) conditions.push(gte(bids.createdAt, start));
    // `end` is already the exclusive day-after, so this IS inclusive of `to`.
    if (end) conditions.push(lt(bids.createdAt, end));
  }

  if (cursor) {
    // Strictly after the cursor in descending order: an earlier sort value, or
    // the same value with a lower id. The id half is what stops two bids saved
    // in the same second from repeating across a page boundary.
    // Formatted as a UTC string rather than passed as a Date: a raw sql
    // parameter is serialised in the server's local timezone while the column
    // is read back as UTC, and the gap between them skips rows at every page
    // boundary. See toSqlTimestamp.
    const at = toSqlTimestamp(new Date(cursor.at));
    conditions.push(
      sql`(${sortColumn} < ${at} OR (${sortColumn} = ${at} AND ${bids.id} < ${cursor.id}))`
    );
  }

  const rows = await db
    .select({ bid: bids })
    .from(bids)
    .leftJoin(clients, eq(clients.id, bids.clientId))
    .where(and(...conditions))
    .orderBy(desc(sortColumn), desc(bids.id))
    .limit(pageSize + 1);

  return rows.map(row => row.bid);
}

/**
 * Search a company's clients, one page at a time.
 *
 * The same treatment as bids, and for the same reason: the Clients screen
 * shipped with a client-side filter over an unpaginated list, flagged at the
 * time as fine "if a user ever has hundreds of clients". A contractor with
 * hundreds of clients is a successful contractor, so that condition was a
 * promise to come back rather than a reason not to.
 *
 * Sorted by name, because that is how a person looks for one — so the cursor is
 * a name and an id rather than a timestamp.
 */
export async function searchClients(
  userId: number,
  options: {
    term?: string;
    archived?: boolean;
    cursorName?: string;
    cursorId?: number;
    pageSize: number;
  }
): Promise<Client[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [
    eq(clients.userId, userId),
    options.archived
      ? isNotNull(clients.archivedAt)
      : isNull(clients.archivedAt),
  ];

  const term = usableTerm(options.term);
  if (term) {
    const esc = sql`${containsPattern(term)} ESCAPE '\\\\'`;
    conditions.push(
      or(
        sql`${clients.name} LIKE ${esc}`,
        sql`${clients.address} LIKE ${esc}`,
        sql`${clients.email} LIKE ${esc}`,
        sql`${clients.phone} LIKE ${esc}`
      )!
    );
  }

  if (options.cursorName !== undefined && options.cursorId !== undefined) {
    conditions.push(
      sql`(${clients.name} > ${options.cursorName} OR (${clients.name} = ${options.cursorName} AND ${clients.id} > ${options.cursorId}))`
    );
  }

  return db
    .select()
    .from(clients)
    .where(and(...conditions))
    .orderBy(asc(clients.name), asc(clients.id))
    .limit(options.pageSize + 1);
}

/**
 * Every distinct trade this company has actually bid, for the filter's picker.
 *
 * Read from the bids themselves rather than from a fixed list, so a company
 * that has unlocked plumbing sees plumbing and one that has not is never
 * offered a filter that can only return nothing.
 *
 * Bounded, because this is the one query here that does not paginate. At the
 * scale where the cap bites, the answer is a `bid_trades` table rather than a
 * bigger limit — the distinct-values question is what a junction table is for.
 */
export async function getUsedTrades(userId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ trades: bids.trades })
    .from(bids)
    .where(eq(bids.userId, userId))
    .limit(5000);
  const seen = new Set<string>();
  for (const row of rows) {
    for (const trade of row.trades ?? []) seen.add(trade);
  }
  return Array.from(seen).sort();
}

/**
 * Bid counts for a specific set of clients — the page being displayed.
 *
 * The counterpart to pagination. `countBidsPerClient` groups over every bid the
 * company has, which is exactly the unbounded query the paging was added to
 * remove; this one is bounded by the ids handed to it.
 */
export async function countBidsForClients(
  clientIds: number[]
): Promise<Map<number, number>> {
  if (clientIds.length === 0) return new Map();
  const db = await getDb();
  if (!db) return new Map();
  const rows = await db
    .select({ clientId: bids.clientId, n: sql<number>`count(*)` })
    .from(bids)
    .where(inArray(bids.clientId, clientIds))
    .groupBy(bids.clientId);
  const counts = new Map<number, number>();
  for (const row of rows) {
    if (row.clientId != null) counts.set(row.clientId, Number(row.n));
  }
  return counts;
}

// ─── Job close-out ────────────────────────────────────────────────────────────
/**
 * Storage for what a finished job actually took.
 *
 * Every function takes the company's scope id and filters on it. The suggestion
 * queries are the ones to read carefully: a starter assembly is shared across
 * every company, so "how has this assembly performed" is only ever a question
 * about ONE company's close-outs and the userId predicate is what makes it so.
 */

export async function getCloseoutForBid(
  bidId: number,
  userId: number
): Promise<BidCloseout | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(bidCloseouts)
    .where(and(eq(bidCloseouts.bidId, bidId), eq(bidCloseouts.userId, userId)))
    .limit(1);
  return row;
}

export async function getCloseoutLines(
  closeoutId: number,
  userId: number
): Promise<BidCloseoutLine[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(bidCloseoutLines)
    .where(
      and(
        eq(bidCloseoutLines.closeoutId, closeoutId),
        eq(bidCloseoutLines.userId, userId)
      )
    )
    .orderBy(asc(bidCloseoutLines.id));
}

/**
 * Create or replace a bid's close-out.
 *
 * Replace rather than patch: a close-out is one statement about a job, and
 * editing it means restating it. The lines are deleted and rewritten together
 * with the header so a mode change from byAssembly to total cannot leave
 * orphaned lines behind that later queries would still count.
 */
export async function saveCloseout(
  bidId: number,
  userId: number,
  data: {
    mode: (typeof CLOSEOUT_MODE_VALUES)[number];
    totalActualHours: string | null;
    estimatedHours: string;
    closedAt: Date;
    notes: string | null;
    enteredByUserId: number;
    lines: Array<{
      assemblyId: number | null;
      assemblyName: string;
      qty: string;
      estimatedHours: string;
      actualHours: string;
    }>;
  }
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const existing = await getCloseoutForBid(bidId, userId);
  let closeoutId: number;

  if (existing) {
    await db
      .update(bidCloseouts)
      .set({
        mode: data.mode,
        totalActualHours: data.totalActualHours,
        estimatedHours: data.estimatedHours,
        closedAt: data.closedAt,
        notes: data.notes,
        enteredByUserId: data.enteredByUserId,
      })
      .where(eq(bidCloseouts.id, existing.id));
    closeoutId = existing.id;
    await db
      .delete(bidCloseoutLines)
      .where(eq(bidCloseoutLines.closeoutId, closeoutId));
  } else {
    const [inserted] = await db.insert(bidCloseouts).values({
      bidId,
      userId,
      mode: data.mode,
      totalActualHours: data.totalActualHours,
      estimatedHours: data.estimatedHours,
      closedAt: data.closedAt,
      notes: data.notes,
      enteredByUserId: data.enteredByUserId,
    });
    closeoutId = inserted.insertId;
  }

  if (data.lines.length > 0) {
    await db.insert(bidCloseoutLines).values(
      data.lines.map(line => ({
        closeoutId,
        userId,
        assemblyId: line.assemblyId,
        assemblyName: line.assemblyName,
        qty: line.qty,
        estimatedHours: line.estimatedHours,
        actualHours: line.actualHours,
      }))
    );
  }

  return closeoutId;
}

/** Remove a close-out entirely — the job was never really finished. */
export async function deleteCloseout(
  bidId: number,
  userId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .delete(bidCloseouts)
    .where(and(eq(bidCloseouts.bidId, bidId), eq(bidCloseouts.userId, userId)));
}

/**
 * Every closed-out observation of one assembly, for THIS company.
 *
 * The userId predicate is the whole security of the suggestion engine. Assembly
 * ids are shared — a starter assembly has `userId = NULL` and appears in every
 * company's library — so without it, one contractor's crew performance would
 * produce suggestions in another contractor's account.
 */
export async function getAssemblySamples(
  userId: number,
  assemblyId: number,
  limit = 50
): Promise<Array<{ estimatedHours: number; actualHours: number }>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      estimatedHours: bidCloseoutLines.estimatedHours,
      actualHours: bidCloseoutLines.actualHours,
    })
    .from(bidCloseoutLines)
    .where(
      and(
        eq(bidCloseoutLines.userId, userId),
        eq(bidCloseoutLines.assemblyId, assemblyId)
      )
    )
    .orderBy(desc(bidCloseoutLines.id))
    .limit(limit);
  return rows.map(row => ({
    estimatedHours: Number(row.estimatedHours),
    actualHours: Number(row.actualHours),
  }));
}

/** Which assemblies this company has closed-out data for. */
export async function getAssembliesWithSamples(
  userId: number,
  limit = 500
): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .selectDistinct({ assemblyId: bidCloseoutLines.assemblyId })
    .from(bidCloseoutLines)
    .where(
      and(
        eq(bidCloseoutLines.userId, userId),
        isNotNull(bidCloseoutLines.assemblyId)
      )
    )
    .limit(limit);
  return rows
    .map(row => row.assemblyId)
    .filter((id): id is number => id !== null);
}

export async function getHourSuggestions(
  userId: number,
  status?: (typeof SUGGESTION_STATUS_VALUES)[number]
): Promise<AssemblyHourSuggestion[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(assemblyHourSuggestions.userId, userId)];
  if (status) conditions.push(eq(assemblyHourSuggestions.status, status));
  return db
    .select()
    .from(assemblyHourSuggestions)
    .where(and(...conditions))
    .orderBy(desc(assemblyHourSuggestions.id))
    .limit(200);
}

export async function getHourSuggestion(
  userId: number,
  assemblyId: number
): Promise<AssemblyHourSuggestion | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(assemblyHourSuggestions)
    .where(
      and(
        eq(assemblyHourSuggestions.userId, userId),
        eq(assemblyHourSuggestions.assemblyId, assemblyId)
      )
    )
    .limit(1);
  return row;
}

/**
 * Record a suggestion, or refresh the numbers on one already pending.
 *
 * A DISMISSED suggestion is left alone. That is the point of keeping the row:
 * a user who has said "no, I know why those ran long" must not be asked again
 * every time another job closes out. Only an explicit re-open brings it back.
 */
export async function upsertHourSuggestion(
  userId: number,
  assemblyId: number,
  data: {
    currentHours: string;
    suggestedHours: string;
    sampleSize: number;
    ratio: string;
  }
): Promise<"created" | "refreshed" | "left-dismissed"> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const existing = await getHourSuggestion(userId, assemblyId);
  if (existing) {
    if (existing.status !== "pending") return "left-dismissed";
    await db
      .update(assemblyHourSuggestions)
      .set(data)
      .where(eq(assemblyHourSuggestions.id, existing.id));
    return "refreshed";
  }

  await db
    .insert(assemblyHourSuggestions)
    .values({ userId, assemblyId, ...data, status: "pending" });
  return "created";
}

/** Withdraw a suggestion whose evidence no longer supports it. */
export async function clearPendingSuggestion(
  userId: number,
  assemblyId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .delete(assemblyHourSuggestions)
    .where(
      and(
        eq(assemblyHourSuggestions.userId, userId),
        eq(assemblyHourSuggestions.assemblyId, assemblyId),
        eq(assemblyHourSuggestions.status, "pending")
      )
    );
}

export async function respondToSuggestion(
  userId: number,
  suggestionId: number,
  status: "accepted" | "dismissed",
  respondedByUserId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(assemblyHourSuggestions)
    .set({ status, respondedAt: new Date(), respondedByUserId })
    .where(
      and(
        eq(assemblyHourSuggestions.id, suggestionId),
        eq(assemblyHourSuggestions.userId, userId)
      )
    );
}

// ─── The sample project ───────────────────────────────────────────────────────
/**
 * Build the shipped sample bid inside one company.
 *
 * ── What it writes, and what it deliberately does not ───────────────────────
 * Two rows and their children: a client and a bid. No materials, no assemblies,
 * no labor rates, no company settings — so an account that creates the sample,
 * explores it and deletes it is byte-identical to one that never touched it.
 * That is what "cannot corrupt real company data" has to mean.
 *
 * The prices live on the line SNAPSHOTS, which is the mechanism bid lines
 * already use to freeze cost and hours at add time. It is the only way to show
 * a realistically priced job without writing prices into a library that ships
 * unpriced on purpose (CLAUDE.md § Starter content ships unpriced).
 *
 * `assemblyId` is resolved by name against the shipped starter assemblies where
 * one matches, so "open the assembly behind this line" works. Where nothing
 * matches, the line stands on its snapshot alone — exactly as a line whose
 * assembly was later deleted does.
 */
export async function seedSampleProject(
  userId: number,
  content: {
    bidName: string;
    clientName: string;
    siteAddress: string;
    laborRate: number;
    overheadPct: number;
    markupPct: number;
    lines: ReadonlyArray<{
      assemblyName: string;
      qty: number;
      materialCost: number;
      laborHours: number;
      modifierPct?: number;
      modifierNames?: string[];
      unitLabel?: string | null;
    }>;
    expenses: ReadonlyArray<{
      name: string;
      amount: number;
      taxable: boolean;
      markedUp: boolean;
    }>;
    scope: ReadonlyArray<{ kind: "include" | "exclude"; text: string }>;
  }
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [client] = await db.insert(clients).values({
    userId,
    name: content.clientName,
    kind: "company",
    address: content.siteAddress,
    isSample: true,
  });

  const [bid] = await db.insert(bids).values({
    userId,
    name: content.bidName,
    status: "Draft",
    trades: ["electrical"],
    isSample: true,
    clientId: client.insertId,
    clientName: content.clientName,
    siteAddress: content.siteAddress,
    // Per-bid overrides rather than the company defaults. A new account has
    // overhead and profit unset, so an inheriting sample would show a bid
    // priced at cost — the opposite of what it is for — and writing them into
    // the company settings instead would put a margin the user never chose on
    // every real bid they go on to create.
    overheadEnabled: true,
    overheadMode: "percentage",
    overheadValue: content.overheadPct.toFixed(4),
    profitMethod: "markup",
    profitValue: content.markupPct.toFixed(4),
  });
  const bidId = bid.insertId;

  // Match line names to the shipped starters so the lines point somewhere real.
  const library = await getLibraryAssemblies(userId);
  const byName = new Map(library.map(row => [row.name.toLowerCase(), row.id]));

  let sortOrder = 0;
  for (const line of content.lines) {
    await db.insert(bidLineItems).values({
      bidId,
      assemblyId: byName.get(line.assemblyName.toLowerCase()) ?? null,
      name: line.assemblyName,
      qty: line.qty.toFixed(4),
      unitLabel: line.unitLabel ?? null,
      snapshotMaterialCost: line.materialCost.toFixed(4),
      snapshotLaborHours: line.laborHours.toFixed(4),
      snapshotModifierPct: (line.modifierPct ?? 0).toFixed(4),
      snapshotLaborRate: content.laborRate.toFixed(4),
      snapshotModifierNames: line.modifierNames ?? null,
      sortOrder: sortOrder++,
    });
  }

  for (const expense of content.expenses) {
    await db.insert(bidExpenses).values({
      bidId,
      name: expense.name,
      amount: expense.amount.toFixed(2),
      taxable: expense.taxable,
      markedUp: expense.markedUp,
    });
  }

  let scopeOrder = 0;
  for (const note of content.scope) {
    await db.insert(bidScopeNotes).values({
      bidId,
      kind: note.kind,
      text: note.text,
      sortOrder: scopeOrder++,
    });
  }

  return bidId;
}

/**
 * Delete the sample bid and the client that came with it.
 *
 * A hard delete: line items, expenses and scope notes cascade from the bid, and
 * the client is removed only if it is itself flagged as sample data. A user who
 * attached the sample's client to a real bid keeps it — deleting a client out
 * from under a real bid to tidy up a demo would be a far worse outcome than
 * leaving one labelled row behind.
 */
export async function removeSampleProject(
  bidId: number,
  userId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [row] = await db
    .select({ clientId: bids.clientId, isSample: bids.isSample })
    .from(bids)
    .where(and(eq(bids.id, bidId), eq(bids.userId, userId)))
    .limit(1);
  if (!row || !row.isSample) return;

  await db.delete(bids).where(and(eq(bids.id, bidId), eq(bids.userId, userId)));

  if (row.clientId !== null) {
    const stillUsed = await db
      .select({ id: bids.id })
      .from(bids)
      .where(and(eq(bids.userId, userId), eq(bids.clientId, row.clientId)))
      .limit(1);
    if (stillUsed.length === 0) {
      await db
        .delete(clients)
        .where(
          and(
            eq(clients.id, row.clientId),
            eq(clients.userId, userId),
            eq(clients.isSample, true)
          )
        );
    }
  }
}

// ─── Business analytics ───────────────────────────────────────────────────────
/**
 * Aggregating a whole bid history in the database, never in Node.
 *
 * ── Why these are not just "get the bids and add them up" ────────────────────
 * `bids.dashboard` loads every bid and then fetches each one's line items in a
 * loop. That is fine there — it is a screen showing a handful of live bids and
 * it needs each one's card anyway. It is exactly wrong here: analytics asks
 * about YEARS of bids, and a query per bid over a decade of quoting is a page
 * that gets slower every month a contractor uses the product, which is the
 * worst failure shape a business dashboard has.
 *
 * So the table that grows fastest — `bid_line_items`, tens to hundreds of rows
 * per bid — never leaves the database. It is summed in SQL, and what comes back
 * is at most one narrow row per BID; for the win-rate counts, one row per period
 * per status however many bids there are.
 *
 * ── The cost expression duplicates shared/pricing.ts, deliberately ───────────
 * The per-line arithmetic below is `calculateLineItem` rewritten in SQL, down to
 * where it rounds. That is a real duplication and it is the price of aggregating
 * in the database at all — the alternative is loading the lines to run the real
 * function over them, which is the thing this exists to avoid.
 *
 * It is kept safe by proof rather than by care: `server/analytics.test.ts`
 * prices the same bids both ways and asserts they agree to the cent, so changing
 * the pricing engine without changing this fails a test. Do not "tidy" the
 * ROUND() calls away — each one matches a `toCents` in the engine, and dropping
 * them lets the two drift by fractions of a cent per line.
 *
 * ── Scope ────────────────────────────────────────────────────────────────────
 * Every query filters on `userId` — the company's scope id, resolved from the
 * session in _core/companyScope.ts — and every one excludes `isSample`, because
 * CLAUDE.md's sample rule is that fictional money never reaches a headline
 * figure. The predicate sits on the outermost table and the joins hang off it,
 * so there is no shape here that can read across companies.
 */

/** How many bids one call will price. See getClosedJobCosts. */
export const ANALYTICS_MAX_BIDS = 20000;

/**
 * Hours for ONE of an assembly, after modifiers and productivity.
 *
 * Mirrors applyModifiersToHours followed by applyProductivityToHours, including
 * both zero clamps — a modifier summing below −100% must not produce negative
 * hours here while producing zero on the bid screen.
 */
function lineHoursSql(productivityPct: number) {
  return sql`GREATEST(0, GREATEST(0, ${bidLineItems.snapshotLaborHours} * (1 + ${bidLineItems.snapshotModifierPct})) * (1 + COALESCE(${bids.productivityPct}, ${productivityPct})))`;
}

/**
 * The sums that describe what a bid costs, in cents and hours.
 *
 * Material and labor are kept apart because profitability needs them apart —
 * materials are carried at estimate and only labor is re-costed against actual
 * hours (see shared/analytics.ts). `directCents` is its own sum rather than
 * material + labor because the engine rounds each LINE's total, which on a
 * fractional quantity lands a fraction of a cent from rounding the halves
 * separately.
 */
function costSums(productivityPct: number) {
  const hours = lineHoursSql(productivityPct);
  const materialCents = sql`ROUND(${bidLineItems.snapshotMaterialCost} * 100) * ${bidLineItems.qty}`;
  const laborCents = sql`ROUND(${hours} * ${bidLineItems.qty} * ${bidLineItems.snapshotLaborRate} * 100)`;
  return {
    materialCents: sql<string>`COALESCE(SUM(${materialCents}), 0)`,
    laborCents: sql<string>`COALESCE(SUM(${laborCents}), 0)`,
    directCents: sql<string>`COALESCE(SUM(ROUND(${materialCents} + ${laborCents})), 0)`,
    totalHours: sql<string>`COALESCE(SUM(${hours} * ${bidLineItems.qty}), 0)`,
  };
}

/**
 * The period a bid falls in, as SQL.
 *
 * Produces the same string `bucketKeyFor` produces in TypeScript, and the tests
 * assert the two agree — a disagreement would split a month in half and bend the
 * trend line for no visible reason.
 */
function bucketSql(granularity: "month" | "quarter") {
  return granularity === "quarter"
    ? sql<string>`CONCAT(YEAR(${bids.createdAt}), '-Q', QUARTER(${bids.createdAt}))`
    : sql<string>`DATE_FORMAT(${bids.createdAt}, '%Y-%m')`;
}

/** This company's real bids. The base of every analytics query. */
function analyticsBase(userId: number) {
  return [eq(bids.userId, userId), eq(bids.isSample, false)];
}

export type OutcomeBucketRow = {
  bucket: string;
  status: (typeof BID_STATUSES)[number];
  bids: number;
};

/**
 * How many bids of each status fall in each period.
 *
 * ── The cheap query, and the one the headline rests on ───────────────────────
 * Touches `bids` alone — no join, no line items — and returns at most four rows
 * per period. A decade of monthly buckets is 480 rows whether the contractor
 * quoted ten jobs or a hundred thousand, and it runs off
 * `bids_userId_createdAt_idx`.
 *
 * ── Archived bids are counted ────────────────────────────────────────────────
 * Deliberate, and the opposite of what most lists in this app do. Archiving is
 * "get it off my dashboard" and is explicitly independent of status (see the
 * schema on `bids.archivedAt`): a job won in March and archived in June was
 * still won, and dropping it would make a win rate rise or fall with the
 * contractor's filing habits rather than with their business.
 */
export async function getOutcomeBuckets(
  userId: number,
  opts: {
    start: Date | null;
    end: Date | null;
    granularity: "month" | "quarter";
  }
): Promise<OutcomeBucketRow[]> {
  const db = await getDb();
  if (!db) return [];

  const bucket = bucketSql(opts.granularity);
  const conditions = analyticsBase(userId);
  if (opts.start) conditions.push(gte(bids.createdAt, opts.start));
  if (opts.end) conditions.push(lt(bids.createdAt, opts.end));

  const rows = await db
    .select({ bucket, status: bids.status, n: sql<string>`COUNT(*)` })
    .from(bids)
    .where(and(...conditions))
    .groupBy(bucket, bids.status);

  return rows.map(row => ({
    bucket: String(row.bucket),
    status: row.status,
    bids: Number(row.n),
  }));
}

/** One bid, reduced to what pricing it needs. Its line items stay in the DB. */
export type BidCostRow = {
  id: number;
  name: string;
  status: (typeof BID_STATUSES)[number];
  trades: string[] | null;
  bucket: string;
  overheadEnabled: boolean | null;
  overheadMode: "percentage" | "flat" | null;
  overheadValue: number | null;
  profitMethod: "markup" | "margin" | null;
  profitValue: number | null;
  productivityPct: number | null;
  materialCost: number;
  laborCost: number;
  directCost: number;
  totalHours: number;
};

function toBidCostRow(row: Record<string, unknown>): BidCostRow {
  const num = (value: unknown) =>
    value === null || value === undefined ? null : Number(value);
  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
    status: row.status as (typeof BID_STATUSES)[number],
    trades: Array.isArray(row.trades) ? (row.trades as string[]) : null,
    bucket: String(row.bucket ?? ""),
    overheadEnabled:
      row.overheadEnabled === null || row.overheadEnabled === undefined
        ? null
        : Boolean(row.overheadEnabled),
    overheadMode: (row.overheadMode ?? null) as BidCostRow["overheadMode"],
    overheadValue: num(row.overheadValue),
    profitMethod: (row.profitMethod ?? null) as BidCostRow["profitMethod"],
    profitValue: num(row.profitValue),
    productivityPct: num(row.productivityPct),
    materialCost: Number(row.materialCents) / 100,
    laborCost: Number(row.laborCents) / 100,
    directCost: Number(row.directCents) / 100,
    totalHours: Number(row.totalHours),
  };
}

/** The columns both rollup queries select, in one place so they cannot drift. */
function bidCostSelection(
  bucket: ReturnType<typeof bucketSql>,
  sums: ReturnType<typeof costSums>
) {
  return {
    id: bids.id,
    name: bids.name,
    status: bids.status,
    trades: bids.trades,
    bucket,
    overheadEnabled: bids.overheadEnabled,
    overheadMode: bids.overheadMode,
    overheadValue: bids.overheadValue,
    profitMethod: bids.profitMethod,
    profitValue: bids.profitValue,
    productivityPct: bids.productivityPct,
    ...sums,
  };
}

/**
 * Every bid created in the range, costed, one row each.
 *
 * ── Why valuing bids cannot join getOutcomeBuckets ───────────────────────────
 * Counting bids can be done entirely in SQL; valuing them cannot. Overhead and
 * profit resolve PER BID — a bid may override either, flat overhead is an amount
 * per bid rather than a rate on a sum, and a target margin divides rather than
 * multiplies. Summing direct costs first and applying one set of settings to the
 * total would misprice every bid carrying an override, so that step happens in
 * JS over these rows.
 *
 * What does NOT happen in JS is the line items. They are summed here, so this
 * returns one row per bid however many lines each carries.
 */
export async function getBidCosts(
  userId: number,
  opts: {
    start: Date | null;
    end: Date | null;
    granularity: "month" | "quarter";
    /** The company default, for the bids that inherit it. See lineHoursSql. */
    companyProductivityPct: number;
    limit?: number;
  }
): Promise<BidCostRow[]> {
  const db = await getDb();
  if (!db) return [];

  const bucket = bucketSql(opts.granularity);
  const sums = costSums(opts.companyProductivityPct);
  const conditions = analyticsBase(userId);
  if (opts.start) conditions.push(gte(bids.createdAt, opts.start));
  if (opts.end) conditions.push(lt(bids.createdAt, opts.end));

  const rows = await db
    .select(bidCostSelection(bucket, sums))
    .from(bids)
    .leftJoin(
      bidLineItems,
      and(eq(bidLineItems.bidId, bids.id), isNull(bidLineItems.archivedAt))
    )
    .where(and(...conditions))
    .groupBy(bids.id)
    .limit(opts.limit ?? ANALYTICS_MAX_BIDS);

  return rows.map(row => toBidCostRow(row as Record<string, unknown>));
}

/** A finished job: its bid costed, plus what the close-out says it took. */
export type ClosedJobRow = BidCostRow & {
  closedAt: Date;
  /** The estimate FROZEN at close-out — see shared/closeout.ts. */
  closeoutEstimatedHours: number;
  mode: (typeof CLOSEOUT_MODE_VALUES)[number];
  totalActualHours: number | null;
  /** Sum of the per-assembly lines. Only meaningful in `byAssembly` mode. */
  lineActualHours: number;
};

/**
 * Every job closed out in the range, with its bid costed.
 *
 * ── An INNER join, which is what bounds this ─────────────────────────────────
 * Only bids with a close-out appear, so the result grows with jobs the
 * contractor actually finished and recorded, not with everything they ever
 * quoted. `bid_closeouts_userId_closedAt_idx` exists for exactly this query —
 * the schema comment calls it "the time-series index the future dashboard
 * wants" — so the range narrows before a line item is touched.
 *
 * ── Why the close-out lines are a SECOND query ───────────────────────────────
 * Joining `bid_closeout_lines` into the same statement would multiply the rows:
 * a bid with 40 line items and 6 close-out lines produces 240, and both sums
 * come out six and forty times too big. `SUM(DISTINCT ...)` cannot repair it
 * either, because two assemblies that took the same hours are not duplicates.
 * So the hours are summed in their own grouped query and merged by id — still
 * two round trips whatever the size of the history, never one per job.
 *
 * The limit is a ceiling rather than a page. Beyond it the caller compares
 * against `countClosedJobs` and says the figure is truncated, rather than
 * quietly under-reporting a year of revenue.
 */
export async function getClosedJobCosts(
  userId: number,
  opts: {
    start: Date | null;
    end: Date | null;
    granularity: "month" | "quarter";
    companyProductivityPct: number;
    limit?: number;
  }
): Promise<ClosedJobRow[]> {
  const db = await getDb();
  if (!db) return [];

  const bucket = bucketSql(opts.granularity);
  const sums = costSums(opts.companyProductivityPct);
  const conditions = analyticsBase(userId);
  // The close-out's own scope id as well as the bid's. The two can only differ
  // if a row was written wrongly, and this makes such a row invisible rather
  // than letting it attribute another company's hours to this one.
  conditions.push(eq(bidCloseouts.userId, userId));
  if (opts.start) conditions.push(gte(bidCloseouts.closedAt, opts.start));
  if (opts.end) conditions.push(lt(bidCloseouts.closedAt, opts.end));

  const rows = await db
    .select({
      ...bidCostSelection(bucket, sums),
      closeoutId: bidCloseouts.id,
      closedAt: bidCloseouts.closedAt,
      closeoutEstimatedHours: bidCloseouts.estimatedHours,
      mode: bidCloseouts.mode,
      totalActualHours: bidCloseouts.totalActualHours,
    })
    .from(bids)
    .innerJoin(bidCloseouts, eq(bidCloseouts.bidId, bids.id))
    .leftJoin(
      bidLineItems,
      and(eq(bidLineItems.bidId, bids.id), isNull(bidLineItems.archivedAt))
    )
    .where(and(...conditions))
    .groupBy(bids.id, bidCloseouts.id)
    .limit(opts.limit ?? ANALYTICS_MAX_BIDS);

  if (rows.length === 0) return [];

  const closeoutIds = rows.map(row => Number(row.closeoutId));
  const lineRows = await db
    .select({
      closeoutId: bidCloseoutLines.closeoutId,
      actual: sql<string>`COALESCE(SUM(${bidCloseoutLines.actualHours}), 0)`,
    })
    .from(bidCloseoutLines)
    .where(
      and(
        eq(bidCloseoutLines.userId, userId),
        inArray(bidCloseoutLines.closeoutId, closeoutIds)
      )
    )
    .groupBy(bidCloseoutLines.closeoutId);

  const actualByCloseout = new Map(
    lineRows.map(row => [Number(row.closeoutId), Number(row.actual)])
  );

  return rows.map(row => ({
    ...toBidCostRow(row as unknown as Record<string, unknown>),
    closedAt: row.closedAt,
    closeoutEstimatedHours: Number(row.closeoutEstimatedHours),
    mode: row.mode,
    totalActualHours:
      row.totalActualHours === null ? null : Number(row.totalActualHours),
    lineActualHours: actualByCloseout.get(Number(row.closeoutId)) ?? 0,
  }));
}

/** How many jobs the range really holds, so a truncated answer can say so. */
export async function countClosedJobs(
  userId: number,
  opts: { start: Date | null; end: Date | null }
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const conditions = [
    ...analyticsBase(userId),
    eq(bidCloseouts.userId, userId),
  ];
  if (opts.start) conditions.push(gte(bidCloseouts.closedAt, opts.start));
  if (opts.end) conditions.push(lt(bidCloseouts.closedAt, opts.end));

  const [row] = await db
    .select({ n: sql<string>`COUNT(*)` })
    .from(bids)
    .innerJoin(bidCloseouts, eq(bidCloseouts.bidId, bids.id))
    .where(and(...conditions));
  return Number(row?.n ?? 0);
}

/** One live bid, with its line items already summed. See getDashboardBids. */
export type DashboardBidRow = Bid & {
  lineCount: number;
  materialCost: number;
  laborCost: number;
  directCost: number;
  totalHours: number;
};

/**
 * Every live bid, costed, in ONE query.
 *
 * ── What this replaces ───────────────────────────────────────────────────────
 * `bids.dashboard` fetched the bids and then ran `getBidLineItems` for each one
 * in a loop. At 249 bids that answered in ~100ms; at 1,149 it took ~600ms, and
 * it grows in a straight line, on the screen the app OPENS ON. The same data
 * through this query is one round trip, the way `getBidCosts` already does it
 * for the Performance screen — which answers all-time in ~50ms over the same
 * bids, and is why that screen stayed fast while this one did not.
 *
 * ── Deliberately not `getBidCosts` itself ────────────────────────────────────
 * That one excludes the shipped sample (`analyticsBase`), because CLAUDE.md's
 * rule is that fictional money never reaches a headline figure. The Dashboard
 * is the opposite case: it must SHOW the sample — badged, and left out of the
 * "Out for bid" total by the client — so it cannot share that filter. The cost
 * arithmetic is shared through `costSums`; only the WHERE differs.
 */
export async function getDashboardBids(
  userId: number,
  companyProductivityPct: number
): Promise<DashboardBidRow[]> {
  const db = await getDb();
  if (!db) return [];

  const sums = costSums(companyProductivityPct);
  const rows = await db
    .select({
      bid: bids,
      lineCount: sql<string>`COUNT(${bidLineItems.id})`,
      ...sums,
    })
    .from(bids)
    .leftJoin(
      bidLineItems,
      and(eq(bidLineItems.bidId, bids.id), isNull(bidLineItems.archivedAt))
    )
    .where(and(eq(bids.userId, userId), isNull(bids.archivedAt)))
    .groupBy(bids.id)
    .orderBy(desc(bids.updatedAt));

  return rows.map(row => ({
    ...row.bid,
    lineCount: Number(row.lineCount),
    materialCost: Number(row.materialCents) / 100,
    laborCost: Number(row.laborCents) / 100,
    directCost: Number(row.directCents) / 100,
    totalHours: Number(row.totalHours),
  }));
}

/** The oldest bid this company has, so "all time" knows where to start. */
export async function getEarliestBidDate(userId: number): Promise<Date | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select({ createdAt: bids.createdAt })
    .from(bids)
    .where(and(...analyticsBase(userId)))
    .orderBy(asc(bids.createdAt))
    .limit(1);
  return row?.createdAt ?? null;
}

// ─── AI usage ─────────────────────────────────────────────────────────────────

/**
 * Record one AI call against a user's day.
 *
 * An upsert, not a read-then-write. Two calls finishing at the same moment
 * would both read the same count and both write count+1, losing one — which
 * matters because this counter is what enforces the daily limit, and a limit
 * that undercounts is a limit that can be walked past. The unique key on
 * (user, day, feature, model) makes the database do the adding.
 */
export async function recordAiUsage(entry: {
  userId: number;
  day: string;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .insert(aiUsageDaily)
    .values({
      userId: entry.userId,
      day: entry.day,
      feature: entry.feature,
      model: entry.model,
      calls: 1,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      costMicros: entry.costMicros,
    })
    .onDuplicateKeyUpdate({
      set: {
        calls: sql`${aiUsageDaily.calls} + 1`,
        inputTokens: sql`${aiUsageDaily.inputTokens} + ${entry.inputTokens}`,
        outputTokens: sql`${aiUsageDaily.outputTokens} + ${entry.outputTokens}`,
        costMicros: sql`${aiUsageDaily.costMicros} + ${entry.costMicros}`,
      },
    });
}

/**
 * How many calls this user has made today in each feature group's worth of
 * features — returned per feature, so the caller can sum the group it cares
 * about without this function knowing what the groups are.
 */
export async function getAiCallsToday(
  userId: number,
  day: string
): Promise<{ feature: string; calls: number }[]> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const rows = await db
    .select({
      feature: aiUsageDaily.feature,
      calls: sql<number>`SUM(${aiUsageDaily.calls})`,
    })
    .from(aiUsageDaily)
    .where(and(eq(aiUsageDaily.userId, userId), eq(aiUsageDaily.day, day)))
    .groupBy(aiUsageDaily.feature);
  return rows.map(r => ({ feature: r.feature, calls: Number(r.calls) }));
}

/**
 * Everyone's AI spend over a range of days, broken down by feature and model.
 *
 * `from` and `to` are inclusive `YYYY-MM-DD` strings. Comparing dates as text
 * works because the format sorts chronologically, and it keeps the query off
 * any timezone conversion the database might apply to a real date column.
 */
export async function getAiSpend(
  from: string,
  to: string
): Promise<
  {
    feature: string;
    model: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    costMicros: number;
  }[]
> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const rows = await db
    .select({
      feature: aiUsageDaily.feature,
      model: aiUsageDaily.model,
      calls: sql<number>`SUM(${aiUsageDaily.calls})`,
      inputTokens: sql<number>`SUM(${aiUsageDaily.inputTokens})`,
      outputTokens: sql<number>`SUM(${aiUsageDaily.outputTokens})`,
      costMicros: sql<number>`SUM(${aiUsageDaily.costMicros})`,
    })
    .from(aiUsageDaily)
    .where(and(gte(aiUsageDaily.day, from), lte(aiUsageDaily.day, to)))
    .groupBy(aiUsageDaily.feature, aiUsageDaily.model);

  return rows.map(r => ({
    feature: r.feature,
    model: r.model,
    calls: Number(r.calls),
    inputTokens: Number(r.inputTokens),
    outputTokens: Number(r.outputTokens),
    costMicros: Number(r.costMicros),
  }));
}
