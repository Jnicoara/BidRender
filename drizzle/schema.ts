import {
  bigint,
  boolean,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  float,
  index,
  decimal,
  date,
  unique,
} from "drizzle-orm/mysql-core";

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  /** Bcrypt hash of the user's password — null for OAuth-only accounts */
  passwordHash: text("passwordHash"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  emailVerified: boolean("emailVerified").default(false).notNull(),
  role: mysqlEnum("role", ["user", "admin", "contractor"])
    .default("user")
    .notNull(),

  /**
   * Which build of the product this person sees. See shared/permissions.ts.
   *
   * Deliberately NOT the same column as `role` above, and not part of the
   * company membership either. `role` is platform staff vs customer and
   * predates this; company role is what you may do inside one company; this is
   * whether unreleased work is visible to you at all. A tester helping a
   * customer debug something is internal AND a viewer in that company, and one
   * enum cannot say both.
   *
   * Defaults to `standard`, so a new account never sees unfinished work.
   */
  accessTier: mysqlEnum("accessTier", ["standard", "internal"])
    .default("standard")
    .notNull(),

  /**
   * Which company this person is currently working in.
   *
   * Only meaningful for someone who belongs to more than one — a subcontractor
   * who joined a GC's company keeps their own. NULL means "whichever they have
   * had longest", which is every single-company account.
   *
   * It lives on the USER rather than being sent with each request, and that is
   * the security-relevant part: a company id the client could supply would let
   * a member name someone else's company and be authorised against their own
   * role in their own. The resolver only ever honours this column, and only
   * when the user still has an active membership in it.
   *
   * No foreign key, deliberately. A stale id resolves to no matching membership
   * and falls back to their oldest one; an FK with ON DELETE SET NULL would add
   * a write to every company deletion to achieve the same end state.
   */
  activeCompanyId: int("activeCompanyId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),

  /**
   * When this account finished the first-run flow. NULL = brand new.
   *
   * Drives one thing only: whether signing in lands on the welcome screen or
   * the Dashboard. Stored as a timestamp rather than a boolean because "when"
   * answers questions "whether" cannot — how long an account sat before its
   * first bid, whether a user who reported being lost had actually seen it.
   *
   * The migration that added this column stamps every EXISTING account, so
   * nobody who already uses the app is shown a welcome screen for a product
   * they have been using for months.
   */
  onboardingCompletedAt: timestamp("onboardingCompletedAt"),

  /**
   * When the user dismissed the getting-started checklist. NULL = still shown.
   *
   * Separate from onboarding completion on purpose: finishing first-run means
   * "I have a rate and I am going to build a bid", while dismissing the
   * checklist means "stop showing me this". A user may well do the second
   * without doing the rest of the first, and the checklist can be brought back
   * at any time — which is why this clears rather than latching.
   */
  checklistDismissedAt: timestamp("checklistDismissedAt"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Projects ─────────────────────────────────────────────────────────────────
export const projects = mysqlTable(
  "projects",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    category: mysqlEnum("category", ["electrical"])
      .default("electrical")
      .notNull(),
    description: text("description"),
    // ── v5.45 expanded fields ──
    customerName: varchar("customerName", { length: 255 }),
    address: varchar("address", { length: 512 }),
    bidDate: date("bidDate"),
    notes: text("notes"),
    status: mysqlEnum("status", ["Bidding", "Won", "In Progress", "Lost"])
      .default("Bidding")
      .notNull(),
    metadata: json("metadata"),
    isArchived: boolean("isArchived").default(false).notNull(),
    // ── PDF storage (S3) ──
    pdfUrl: text("pdfUrl"),
    pdfKey: text("pdfKey"),
    pdfFilename: varchar("pdfFilename", { length: 512 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [index("projects_userId_idx").on(t.userId)]
);

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

// ─── User Materials Database ───────────────────────────────────────────────────
export const userMaterialsDb = mysqlTable(
  "user_materials_db",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemCode: varchar("itemCode", { length: 128 }),
    category: varchar("category", { length: 128 }),
    description: varchar("description", { length: 512 }).notNull(),
    unit: varchar("unit", { length: 32 }).default("EA"),
    unitMaterialCost: float("unitMaterialCost").default(0),
    defaultPrice: float("defaultPrice"),
    userPrice: float("userPrice"),
    lastUpdated: timestamp("lastUpdated"),
    baseLaborHours: float("baseLaborHours").default(0),
    phase: varchar("phase", { length: 128 }),
    source: varchar("source", { length: 64 }).default("custom"),
    externalSku: varchar("externalSku", { length: 128 }),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("user_materials_db_userId_idx").on(t.userId),
    index("user_materials_db_category_idx").on(t.category),
  ]
);

export type UserMaterialsDb = typeof userMaterialsDb.$inferSelect;
export type InsertUserMaterialsDb = typeof userMaterialsDb.$inferInsert;

// ─── Master Items ─────────────────────────────────────────────────────────────
// User's personal master catalog of materials/items with baseline pricing & labor.
export const masterItems = mysqlTable(
  "master_items",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemCode: varchar("itemCode", { length: 128 }),
    category: varchar("category", { length: 128 }),
    description: varchar("description", { length: 512 }).notNull(),
    unit: varchar("unit", { length: 32 }).default("EA").notNull(),
    masterMaterialCost: decimal("masterMaterialCost", {
      precision: 10,
      scale: 4,
    })
      .default("0")
      .notNull(),
    masterLaborHours: decimal("masterLaborHours", { precision: 10, scale: 4 })
      .default("0")
      .notNull(),
    notes: text("notes"),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("master_items_userId_idx").on(t.userId),
    index("master_items_category_idx").on(t.category),
  ]
);

export type MasterItem = typeof masterItems.$inferSelect;
export type InsertMasterItem = typeof masterItems.$inferInsert;

// ─── Master Assemblies ────────────────────────────────────────────────────────
// Named groups of master items (e.g. "20A Duplex Outlet Rough-In").
export const masterAssemblies = mysqlTable(
  "master_assemblies",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    phase: varchar("phase", { length: 128 }),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [index("master_assemblies_userId_idx").on(t.userId)]
);

export type MasterAssembly = typeof masterAssemblies.$inferSelect;
export type InsertMasterAssembly = typeof masterAssemblies.$inferInsert;

// ─── Master Assembly Items ────────────────────────────────────────────────────
// Join table: which master items (and qty) belong to a master assembly.
export const masterAssemblyItems = mysqlTable(
  "master_assembly_items",
  {
    id: int("id").autoincrement().primaryKey(),
    assemblyId: int("assemblyId")
      .notNull()
      .references(() => masterAssemblies.id, { onDelete: "cascade" }),
    masterItemId: int("masterItemId")
      .notNull()
      .references(() => masterItems.id, { onDelete: "cascade" }),
    qty: decimal("qty", { precision: 10, scale: 4 }).default("1").notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
  },
  t => [
    index("master_assembly_items_assemblyId_idx").on(t.assemblyId),
    index("master_assembly_items_masterItemId_idx").on(t.masterItemId),
  ]
);

export type MasterAssemblyItem = typeof masterAssemblyItems.$inferSelect;
export type InsertMasterAssemblyItem = typeof masterAssemblyItems.$inferInsert;

// ─── Master Labor Rates ───────────────────────────────────────────────────────
export const masterLaborRates = mysqlTable(
  "master_labor_rates",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 128 }).notNull(),
    ratePerHour: decimal("ratePerHour", { precision: 10, scale: 4 })
      .default("0")
      .notNull(),
    type: mysqlEnum("type", ["journeyman", "apprentice", "foreman"])
      .default("journeyman")
      .notNull(),
    isDefault: boolean("isDefault").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [index("master_labor_rates_userId_idx").on(t.userId)]
);

export type MasterLaborRate = typeof masterLaborRates.$inferSelect;
export type InsertMasterLaborRate = typeof masterLaborRates.$inferInsert;

// ─── Project Assemblies ───────────────────────────────────────────────────────
// Instances of master assemblies added to a specific project bid.
export const projectAssemblies = mysqlTable(
  "project_assemblies",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    masterAssemblyId: int("masterAssemblyId").references(
      () => masterAssemblies.id,
      { onDelete: "set null" }
    ),
    name: varchar("name", { length: 255 }).notNull(),
    phase: varchar("phase", { length: 128 }),
    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [index("project_assemblies_projectId_idx").on(t.projectId)]
);

export type ProjectAssembly = typeof projectAssemblies.$inferSelect;
export type InsertProjectAssembly = typeof projectAssemblies.$inferInsert;

// ─── Project Assembly Items ───────────────────────────────────────────────────
// Snapshot of each item inside a project assembly, with override values.
export const projectAssemblyItems = mysqlTable(
  "project_assembly_items",
  {
    id: int("id").autoincrement().primaryKey(),
    projectAssemblyId: int("projectAssemblyId")
      .notNull()
      .references(() => projectAssemblies.id, { onDelete: "cascade" }),
    masterItemId: int("masterItemId").references(() => masterItems.id, {
      onDelete: "set null",
    }),
    itemCode: varchar("itemCode", { length: 128 }),
    description: varchar("description", { length: 512 }).notNull(),
    unit: varchar("unit", { length: 32 }).default("EA").notNull(),
    qty: decimal("qty", { precision: 10, scale: 4 }).default("1").notNull(),
    // Master values — static reference, never auto-updated after snapshot
    masterMaterialCost: decimal("masterMaterialCost", {
      precision: 10,
      scale: 4,
    })
      .default("0")
      .notNull(),
    masterLaborHours: decimal("masterLaborHours", { precision: 10, scale: 4 })
      .default("0")
      .notNull(),
    // Override values — default to master on creation, editable per-project
    overrideMaterialCost: decimal("overrideMaterialCost", {
      precision: 10,
      scale: 4,
    })
      .default("0")
      .notNull(),
    overrideLaborHours: decimal("overrideLaborHours", {
      precision: 10,
      scale: 4,
    })
      .default("0")
      .notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [index("project_assembly_items_assemblyId_idx").on(t.projectAssemblyId)]
);

export type ProjectAssemblyItem = typeof projectAssemblyItems.$inferSelect;
export type InsertProjectAssemblyItem =
  typeof projectAssemblyItems.$inferInsert;

// ─── Project Items (Standalone) ───────────────────────────────────────────────
// Individual items added directly to a project (not inside an assembly).
export const projectItems = mysqlTable(
  "project_items",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    masterItemId: int("masterItemId").references(() => masterItems.id, {
      onDelete: "set null",
    }),
    itemCode: varchar("itemCode", { length: 128 }),
    description: varchar("description", { length: 512 }).notNull(),
    unit: varchar("unit", { length: 32 }).default("EA").notNull(),
    qty: decimal("qty", { precision: 10, scale: 4 }).default("1").notNull(),
    phase: varchar("phase", { length: 128 }),
    masterMaterialCost: decimal("masterMaterialCost", {
      precision: 10,
      scale: 4,
    })
      .default("0")
      .notNull(),
    masterLaborHours: decimal("masterLaborHours", { precision: 10, scale: 4 })
      .default("0")
      .notNull(),
    overrideMaterialCost: decimal("overrideMaterialCost", {
      precision: 10,
      scale: 4,
    })
      .default("0")
      .notNull(),
    overrideLaborHours: decimal("overrideLaborHours", {
      precision: 10,
      scale: 4,
    })
      .default("0")
      .notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [index("project_items_projectId_idx").on(t.projectId)]
);

export type ProjectItem = typeof projectItems.$inferSelect;
export type InsertProjectItem = typeof projectItems.$inferInsert;

// ─── Bid Summary ──────────────────────────────────────────────────────────────
// One row per project — stores global labor adjustment settings.
export const bidSummary = mysqlTable("bid_summary", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId")
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: "cascade" }),
  // Labor adjustments
  percentageLaborFactor: decimal("percentageLaborFactor", {
    precision: 6,
    scale: 4,
  })
    .default("1.0000")
    .notNull(),
  lumpSumHours: decimal("lumpSumHours", { precision: 10, scale: 4 })
    .default("0")
    .notNull(),
  // Material markup
  markupPct: decimal("markupPct", { precision: 6, scale: 4 })
    .default("0")
    .notNull(),
  // Default labor rate to use for cost calculation
  defaultLaborRateId: int("defaultLaborRateId").references(
    () => masterLaborRates.id,
    { onDelete: "set null" }
  ),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BidSummary = typeof bidSummary.$inferSelect;
export type InsertBidSummary = typeof bidSummary.$inferInsert;

// ══════════════════════════════════════════════════════════════════════════════
// FOUNDATION (v2 library) — see ASSEMBLIES_PLAN.md
// ══════════════════════════════════════════════════════════════════════════════
// These tables are the new Foundation data model. They live ALONGSIDE the legacy
// master_items / master_assemblies / master_labor_rates tables, which stay in
// place and keep serving the current UI until the step-4 validation gate passes
// (see ASSEMBLIES_PLAN.md BUILD ORDER). Do not wire the two systems together —
// the legacy tables get removed wholesale once the new Library screens prove out.
//
// Baseline vs. user rows (CUSTOMIZATION MODEL):
//   • Baseline row  — userId IS NULL. The shipped starter library. Never edited
//                     by a user; `version` bumps when we publish an update.
//   • Forked row    — userId set, baselineId set. A user's personal copy. The
//                     `baselineVersion` records which baseline version it was
//                     forked from, so a newer baseline surfaces as "update
//                     available" rather than silently overwriting.
//   • Custom row    — userId set, baselineId NULL. No baseline link at all.
//
// "Revert to Original" = copy the baseline's fields back over the forked row and
// reset baselineVersion to the baseline's current version.

/** Curated, NOT user-extendable — doubles as the takeoff layer grouping. */
export const ASSEMBLY_CATEGORIES = [
  "Devices",
  "Lighting",
  "Panels",
  "Equipment Connections",
  "Low Voltage/EMS",
] as const;

/**
 * WHERE a placed item sits on a job — the second layer axis (phase 2d).
 *
 * Deliberately not a property of the assembly. A duplex receptacle is always
 * "Devices" (its Category, which travels with the library item), but the same
 * receptacle can be in a wall on one job and in a ceiling on another — so this
 * is tagged on the PLACED item at the moment it is counted.
 * See ASSEMBLIES_PLAN.md § LAYERS.
 *
 * Trade-agnostic on purpose: "Underground" means the same thing for electrical
 * conduit and plumbing pipe, and that shared vocabulary is what makes
 * cross-trade conflict visibility possible later.
 */
export const TAKEOFF_LOCATIONS = [
  "Underground",
  "Slab/Floor",
  "Wall",
  "Ceiling/Overhead",
  "Exposed",
  "Roof",
] as const;
export type TakeoffLocation = (typeof TAKEOFF_LOCATIONS)[number];

export const MATERIAL_UNITS_OF_SALE = ["each", "foot", "box"] as const;

/**
 * How a labor role is paid.
 *
 * Replaces the old fixed LABOR_ROLES enum (apprentice/journeyman/foreman):
 * roles are a contractor's own org chart, so the NAME is free text and only the
 * pay shape is constrained. Nothing consumed the old enum — labor_rates had no
 * router or screen — so it was dropped rather than migrated.
 */
export const LABOR_RATE_TYPES = ["hourly", "salary"] as const;
export type LaborRateType = (typeof LABOR_RATE_TYPES)[number];

/**
 * Lifecycle of a modifier.
 *
 *   active   — in the working list.
 *   archived — removed from the working list but restorable. This is what
 *              "delete" does; there is no hard delete from the active list.
 *   deleted  — a tombstone, shown nowhere and not restorable.
 *
 * The tombstone exists because of the fork model. Archiving a starter modifier
 * forks it, and that fork is what hides the shared starter row from the list.
 * Hard-deleting the fork would resurrect the starter, so "Delete Forever" on a
 * starter-derived row marks it `deleted` instead. Fully custom rows have no
 * starter to suppress and ARE hard-deleted.
 */
export const LIBRARY_STATUSES = ["active", "archived", "deleted"] as const;
export type LibraryStatus = (typeof LIBRARY_STATUSES)[number];

/**
 * Modifiers had this first; materials, assemblies and kits now share it.
 *
 * Kept as an alias rather than renamed everywhere so the enum's stored values
 * are provably identical across the four tables — a second list with the same
 * three strings is a list that can drift.
 */
export const MODIFIER_STATUSES = LIBRARY_STATUSES;
export type ModifierStatus = LibraryStatus;

/**
 * Residential / Commercial / Both — a FILTER on the assembly library, never a
 * structural split (ASSEMBLIES_PLAN.md § DATA MODEL). Materials, labor rates
 * and modifiers stay shared across both; where labor genuinely differs, the
 * user forks the one assembly rather than the catalog being duplicated.
 *
 * Not the same axis as `trade`, which separates electrical from plumbing/HVAC
 * for unlock gating. Do not wire the two together.
 */
export const PROJECT_TYPES = ["residential", "commercial", "both"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

/**
 * The two trade defaults, restated as column literals.
 *
 * The registry itself is shared/trades.ts — that is the file to read for what
 * the trade axis means and why the sentinel exists. These constants are copies
 * because this schema is parsed by drizzle-kit as well as by the app and stays
 * free of app imports (the same reason CONFIDENCE_TIER_VALUES is restated
 * further down rather than imported from shared/copilotConfidence.ts).
 *
 * server/trades.test.ts asserts the copies still equal the originals, so the
 * two cannot drift apart in silence.
 *
 * ── Which tables get which ───────────────────────────────────────────────────
 * TRADE_DEFAULT_TRADE_GATED — materials, assemblies, kits. Rows that ARE a
 *   trade's content, and that a future unlock filters on.
 * TRADE_DEFAULT_SHARED — labor rates, pricing defaults, branding, proposal
 *   settings. Rows ASSEMBLIES_PLAN.md § MULTI-TRADE STRUCTURE says are shared
 *   across every trade regardless of unlock. `all` keeps that promise true
 *   after a second trade lands instead of needing a backfill to restore it.
 */
export const TRADE_DEFAULT_TRADE_GATED = "electrical";
export const TRADE_DEFAULT_SHARED = "all";

/**
 * Whether sales tax is charged on the marked-up price or the underlying cost.
 *
 * Declared up here with the other shared vocabularies because `pricing_defaults`
 * uses it and that table is defined before the tax tables. The full explanation
 * of what the two mean is on `pricing_defaults.taxApplyTo`.
 */
export const TAX_APPLY_TO = ["price", "cost"] as const;

/**
 * How the material catalog is shelved. Curated, NOT user-extendable.
 *
 * Declaration order is the display order on the Materials screen — keep them in
 * the order an estimator walks a job (wire, raceway, boxes, devices, gear).
 *
 * Deliberately NOT the same axis as ASSEMBLY_CATEGORIES above: that groups
 * assemblies by what they accomplish ("Lighting"), this groups materials by
 * what they physically are ("Conduit Fittings"). Do not merge them.
 */
/**
 * The shelves the material catalog is filed on.
 *
 * Order matters — it is the order sections render in on the Materials screen,
 * and it runs roughly in the order work happens: wire and raceway first, then
 * what gets mounted in them, then equipment, then the small parts and
 * consumables that go in every van.
 *
 * ── Adding one is an ALTER, so add deliberately ──────────────────────────────
 * This is a mysqlEnum, unlike `assemblies.trade` which is a varchar precisely
 * so new trades need no migration. The difference is intentional: a trade is an
 * open set the app unlocks, whereas a category is a curated list the user picks
 * from and never adds to, and keeping it an enum is what stops a typo becoming
 * a nineteenth shelf. Append rather than reorder or rename — the value is
 * stored, so a rename orphans every row already carrying the old text.
 */
export const MATERIAL_CATEGORIES = [
  "Wire & Cable",
  "Conduit",
  "Conduit Fittings",
  "Boxes",
  "Receptacles",
  "Switches",
  "Wall Plates & Misc",
  // Split apart in 0028. A panel is a box you hang and a breaker is a part you
  // stock by the dozen — shelving them together meant scrolling past five panel
  // sizes to reach the 20A breakers, on a shelf an estimator reads constantly.
  // Panels first: you hang the panel, then you populate it.
  "Panels",
  "Breakers",
  "Lighting Hardware",
  "Grounding & Bonding",
  "Life Safety",
  "Low Voltage",
  "Connectors & Terminations",
  "Strut & Supports",
  "Fasteners & Anchors",
  "Equipment & Appliances",
  "Distribution Equipment",
  "Consumables",
] as const;

export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];

// ─── Materials ────────────────────────────────────────────────────────────────
// Cost only. Labor lives on the assembly, never on the material.
export const materials = mysqlTable(
  "materials",
  {
    id: int("id").autoincrement().primaryKey(),
    /** NULL = baseline library row. Set = belongs to that user. */
    userId: int("userId").references(() => users.id, { onDelete: "cascade" }),
    /** The baseline row this was forked from. NULL = baseline itself, or fully custom. */
    baselineId: int("baselineId"),
    /** Baseline `version` at fork time — drives the "update available" nudge. */
    baselineVersion: int("baselineVersion"),
    /** Bumped when a baseline row is republished. Meaningless on user rows. */
    version: int("version").default(1).notNull(),

    name: varchar("name", { length: 512 }).notNull(),
    unitOfSale: mysqlEnum("unitOfSale", MATERIAL_UNITS_OF_SALE)
      .default("each")
      .notNull(),
    costPerUnit: decimal("costPerUnit", { precision: 10, scale: 4 })
      .default("0")
      .notNull(),
    /**
     * Nullable on purpose. Rows created before this column existed are honestly
     * uncategorised rather than wrongly guessed, and a quick add does not force
     * a filing decision. The UI shelves NULL under "Uncategorized", last.
     */
    category: mysqlEnum("category", MATERIAL_CATEGORIES),
    /**
     * Which trade's catalog this belongs to. Same varchar-not-enum treatment as
     * `assemblies.trade`, for the same reason: unlocking is gated at the app
     * layer so a new trade is content, not a migration.
     *
     * Low-voltage parts ship as "low-voltage" rather than "electrical" because
     * structured cabling, coax and landscape lighting are a different trade's
     * material list even when the same contractor pulls both — an electrical
     * estimator scrolling for a receptacle should not wade through Cat6 jacks.
     */
    trade: varchar("trade", { length: 64 })
      .default(TRADE_DEFAULT_TRADE_GATED)
      .notNull(),
    /**
     * A short clarifier, shown under the name. Deliberately sparse: it exists
     * only where two catalog entries could genuinely be mistaken for each other
     * — "#10 THHN" solid against "#10 THHN stranded", plastic boxes against
     * metal — and is left NULL on everything self-explanatory. A description on
     * every row is a description nobody reads.
     */
    description: varchar("description", { length: 512 }),
    /**
     * Optional note for the brand or part number the user actually buys.
     *
     * The catalog itself is generic on purpose — "Wire nuts", not a Ideal
     * 30-176 — because a shipped catalog naming one manufacturer is wrong for
     * everyone who buys another. This is where a user records that their supply
     * house stocks a particular part, without the shipped names pretending to.
     */
    brandNote: varchar("brandNote", { length: 255 }),
    /**
     * Trade slang the catalog name does not contain, space-separated, so an
     * electrician finds "Duplex receptacle" by typing "plug" and "4\" square
     * box" by typing "1900". Matched as loose text by smartSearch, which scores
     * it below the item's real name — an alias should surface a material, never
     * outrank one that genuinely matches.
     *
     * Same shape as the older CATALOG's `searchAliases` field, deliberately, so
     * the two can converge later. Nullable: an alias-less material still works.
     */
    searchAliases: text("searchAliases"),
    /**
     * Suggested quantity when this material is added to an assembly. NULL = 1.
     *
     * Exists for the consumables nobody uses one of — you do not fit a single
     * wire nut to a device. Only a handful of materials set it, and it is a
     * SUGGESTION: the builder pre-fills it and the estimator edits it like any
     * other quantity. Adding more is a data change, not a code change.
     */
    defaultQty: decimal("defaultQty", { precision: 10, scale: 4 }),

    /**
     * Which supply house this material's price came from, e.g. "Platt".
     *
     * Free text rather than a suppliers table on purpose: the useful question
     * is "whose price is this, and how old" — not "manage my vendor list". A
     * table would need CRUD, a picker and a merge story before it answered
     * anything the name alone does not.
     *
     * NULL means the price came from nowhere in particular. It is never
     * inferred: a starter row ships at $0 with no supplier, and it stays that
     * way until someone types a real one.
     */
    supplierName: varchar("supplierName", { length: 128 }),

    /**
     * When `costPerUnit` was last set, which is what price staleness is
     * measured from. NULL = never priced.
     *
     * Deliberately NOT `updatedAt`. That column moves when anything changes —
     * a rename, an alias edit, a category fix — so ageing a price off it would
     * show a nine-month-old price as fresh because someone corrected its
     * spelling last week. Stale pricing that looks current is the failure this
     * whole screen exists to prevent, so the date has to track the price and
     * nothing else. Only a cost write touches it.
     *
     * See shared/priceStaleness.ts for the bands, which take the clock as a
     * parameter so they can be tested without waiting 90 days.
     */
    priceUpdatedAt: timestamp("priceUpdatedAt"),

    /**
     * active / archived / deleted — the lifecycle Modifiers has had since
     * Foundation, extended here so removing a material is recoverable.
     *
     * Archived rows are hidden from every working list but keep their id, so
     * anything that referenced one still resolves. Unlike an archived BID there
     * is no expiry: these are lightweight records with no attached files, so
     * keeping one costs nothing and a countdown would only invent a deadline
     * for the user to miss.
     */
    status: mysqlEnum("status", LIBRARY_STATUSES).default("active").notNull(),
    /** When it was archived. Shown in the archive; nothing expires from it. */
    archivedAt: timestamp("archivedAt"),

    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("materials_userId_idx").on(t.userId),
    index("materials_baselineId_idx").on(t.baselineId),
    index("materials_status_idx").on(t.status),
    index("materials_status_idx").on(t.status),
    index("materials_trade_idx").on(t.trade),
    index("materials_category_idx").on(t.category),
  ]
);

export type Material = typeof materials.$inferSelect;
export type InsertMaterial = typeof materials.$inferInsert;

// ─── Labor Rates ──────────────────────────────────────────────────────────────
// Fully separate from assemblies — an assembly stores hours, never a rate.
export const laborRates = mysqlTable(
  "labor_rates",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").references(() => users.id, { onDelete: "cascade" }),
    baselineId: int("baselineId"),
    baselineVersion: int("baselineVersion"),
    version: int("version").default(1).notNull(),

    /** Free text. Roles are the contractor's own org chart, not a fixed list. */
    name: varchar("name", { length: 255 }).notNull(),
    rateType: mysqlEnum("rateType", LABOR_RATE_TYPES)
      .default("hourly")
      .notNull(),

    /**
     * Which trade this role belongs to, or `all` for one that serves every one.
     *
     * ── Defaults to `all`, unlike a material or an assembly ──────────────────
     * ASSEMBLIES_PLAN.md § MULTI-TRADE STRUCTURE lists the labor rate structure
     * as shared across all trades regardless of unlock, and that is also just
     * true of a real shop: the foreman who runs the electrical crew is the same
     * person on the day the company starts taking plumbing work. Tagging every
     * existing rate `electrical` would hide the contractor's whole org chart
     * the moment a second trade unlocked.
     *
     * So the column is opt-in. A rate is company-wide until somebody says
     * otherwise, and naming a trade is how you say a role is specific to one —
     * a plumbing journeyman priced differently from an electrical one. See
     * TRADE_DEFAULT_SHARED and resolveForTrade in shared/trades.ts.
     */
    trade: varchar("trade", { length: 64 })
      .default(TRADE_DEFAULT_SHARED)
      .notNull(),

    /** The rate for an hourly role. Ignored when rateType is "salary". */
    hourlyCost: decimal("hourlyCost", { precision: 10, scale: 4 })
      .default("0")
      .notNull(),

    /**
     * Salary inputs, kept RAW and separate from any computed rate.
     *
     * The effective hourly rate is derived on read (see effectiveHourlyRate in
     * shared/pricing.ts), never stored — storing it would let the number drift
     * out of step with the salary and hours it came from. Both stay editable
     * because a contractor revises them independently: a raise changes the
     * salary, a shop that really works 1,900 productive hours changes the hours.
     */
    annualSalary: decimal("annualSalary", { precision: 12, scale: 2 }),
    annualHours: decimal("annualHours", { precision: 8, scale: 2 }),

    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("labor_rates_userId_idx").on(t.userId),
    index("labor_rates_baselineId_idx").on(t.baselineId),
    index("labor_rates_trade_idx").on(t.trade),
  ]
);

export type LaborRate = typeof laborRates.$inferSelect;
export type InsertLaborRate = typeof laborRates.$inferInsert;

// ─── Modifiers ────────────────────────────────────────────────────────────────
// Adjust labor hours by a percentage. CRITICAL: multiple modifiers on one line
// item ADD together, never compound. +15% height and +10% outdoor = +25% total,
// NOT 1.15 × 1.10. The pricing engine in shared/pricing.ts enforces this.
export const modifiers = mysqlTable(
  "modifiers",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").references(() => users.id, { onDelete: "cascade" }),
    baselineId: int("baselineId"),
    baselineVersion: int("baselineVersion"),
    version: int("version").default(1).notNull(),

    name: varchar("name", { length: 255 }).notNull(),
    /** Fractional labor adjustment: 0.15 = +15% hours, -0.10 = -10% hours. */
    laborAdjustmentPct: decimal("laborAdjustmentPct", {
      precision: 6,
      scale: 4,
    })
      .default("0")
      .notNull(),
    /**
     * "global"   — shared list (height, outdoor, retrofit); assemblies opt in.
     * "assembly" — one-off for a single assembly (e.g. isolated ground).
     */
    scope: mysqlEnum("scope", ["global", "assembly"])
      .default("global")
      .notNull(),

    /** active / archived / deleted — see MODIFIER_STATUSES. */
    status: mysqlEnum("status", MODIFIER_STATUSES).default("active").notNull(),
    /** When it left the active list. Orders the Archived view, newest first. */
    archivedAt: timestamp("archivedAt"),

    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("modifiers_userId_idx").on(t.userId),
    index("modifiers_baselineId_idx").on(t.baselineId),
    index("modifiers_status_idx").on(t.status),
  ]
);

export type Modifier = typeof modifiers.$inferSelect;
export type InsertModifier = typeof modifiers.$inferInsert;

// ─── Assemblies ───────────────────────────────────────────────────────────────
// A reusable recipe: materials + base labor hours + applicable modifiers.
export const assemblies = mysqlTable(
  "assemblies",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").references(() => users.id, { onDelete: "cascade" }),
    baselineId: int("baselineId"),
    baselineVersion: int("baselineVersion"),
    version: int("version").default(1).notNull(),

    name: varchar("name", { length: 255 }).notNull(),
    /** Curated list — users pick, never add. Also drives takeoff layer grouping. */
    category: mysqlEnum("category", ASSEMBLY_CATEGORIES).notNull(),
    /** Unlock-gated at the app layer, not the schema, so new trades need no migration. */
    trade: varchar("trade", { length: 64 })
      .default(TRADE_DEFAULT_TRADE_GATED)
      .notNull(),
    /** Optional library filter. See PROJECT_TYPES. */
    projectType: mysqlEnum("projectType", PROJECT_TYPES),
    baseLaborHours: decimal("baseLaborHours", { precision: 10, scale: 4 })
      .default("0")
      .notNull(),

    /**
     * Time this assembly takes that no material line accounts for — laying out,
     * testing, cleanup, the walk back to the van. Flat hours, added to
     * `baseLaborHours` before anything else touches them.
     *
     * ── Per assembly, and flat, on purpose ───────────────────────────────────
     * Not a company-wide number and not a percentage. Swapping a receptacle and
     * changing out a panel carry completely different amounts of setup that has
     * nothing to do with how many devices are in the recipe, so this is decided
     * once per assembly by whoever knows that work.
     *
     * ── Not the productivity factor, and never mixed with it ─────────────────
     * The two are unrelated layers and the only thing they share is the word
     * "labor". This is ADDITIVE hours belonging to one assembly, applied first.
     * The productivity factor is a company- or bid-level PERCENTAGE applied last
     * to everything (see pricing_defaults.productivityPct). The order is
     *
     *   (material hours + overhead hours) × (1 + modifiers) × (1 + productivity)
     *
     * and shared/pricing.ts is the one place that knows it. Folding this into
     * the modifier sum or the productivity step would make a fixed 20-minute
     * trip charge scale with job conditions, which is exactly what it is not.
     *
     * Ships at 0 for every starter and every existing row, so nothing inflates
     * until someone deliberately sets it.
     */
    overheadLaborHours: decimal("overheadLaborHours", {
      precision: 10,
      scale: 4,
    })
      .default("0")
      .notNull(),

    /**
     * Which role does this work. Nullable, and "set null" on delete rather than
     * cascade: losing a labor rate must not silently delete the recipe that
     * referenced it. The UI shows such an assembly as needing a role picked.
     */
    laborRateId: int("laborRateId").references(() => laborRates.id, {
      onDelete: "set null",
    }),

    /** active / archived / deleted. See materials.status — same lifecycle. */
    status: mysqlEnum("status", LIBRARY_STATUSES).default("active").notNull(),
    archivedAt: timestamp("archivedAt"),

    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("assemblies_userId_idx").on(t.userId),
    index("assemblies_baselineId_idx").on(t.baselineId),
    index("assemblies_status_idx").on(t.status),
    index("assemblies_status_idx").on(t.status),
    index("assemblies_category_idx").on(t.category),
    index("assemblies_trade_idx").on(t.trade),
  ]
);

export type Assembly = typeof assemblies.$inferSelect;
export type InsertAssembly = typeof assemblies.$inferInsert;

// ─── Assembly Materials ───────────────────────────────────────────────────────
// Which materials (and how many) make up an assembly.
export const assemblyMaterials = mysqlTable(
  "assembly_materials",
  {
    id: int("id").autoincrement().primaryKey(),
    assemblyId: int("assemblyId")
      .notNull()
      .references(() => assemblies.id, { onDelete: "cascade" }),
    materialId: int("materialId")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    qty: decimal("qty", { precision: 10, scale: 4 }).default("1").notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
  },
  t => [
    index("assembly_materials_assemblyId_idx").on(t.assemblyId),
    index("assembly_materials_materialId_idx").on(t.materialId),
  ]
);

export type AssemblyMaterial = typeof assemblyMaterials.$inferSelect;
export type InsertAssemblyMaterial = typeof assemblyMaterials.$inferInsert;

// ─── Assembly Modifiers ───────────────────────────────────────────────────────
// Which modifiers are *applicable* to an assembly. Being applicable is not the
// same as being applied — a takeoff line item chooses which of these to switch
// on. Global modifiers are opted into here; assembly-scoped ones live here only.
export const assemblyModifiers = mysqlTable(
  "assembly_modifiers",
  {
    id: int("id").autoincrement().primaryKey(),
    assemblyId: int("assemblyId")
      .notNull()
      .references(() => assemblies.id, { onDelete: "cascade" }),
    modifierId: int("modifierId")
      .notNull()
      .references(() => modifiers.id, { onDelete: "cascade" }),
    sortOrder: int("sortOrder").default(0).notNull(),
  },
  t => [
    index("assembly_modifiers_assemblyId_idx").on(t.assemblyId),
    index("assembly_modifiers_modifierId_idx").on(t.modifierId),
  ]
);

export type AssemblyModifier = typeof assemblyModifiers.$inferSelect;
export type InsertAssemblyModifier = typeof assemblyModifiers.$inferInsert;

// ─── Pricing Defaults ─────────────────────────────────────────────────────────
// Company-level defaults that auto-fill new estimates. The per-project override
// layer is deliberately NOT here — that belongs to Bid/Project structure (build
// step 3), so this table stays the single company-wide source.
export const pricingDefaults = mysqlTable(
  "pricing_defaults",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /**
     * Which trade these defaults govern. `all` is the company-wide row.
     *
     * One row per user became one row per user PER TRADE so that a second
     * trade can carry its own overhead and profit without disturbing the
     * first — a plumbing division that runs on different margins is an
     * ordinary fact about a multi-trade contractor, not an exception.
     *
     * Every existing row is `all` and every read still resolves to it, so this
     * changed nothing on screen. See resolveForTrade in shared/trades.ts for
     * the fallback, and TRADE_DEFAULT_SHARED for why the sentinel is a string
     * rather than NULL — a nullable column would let the unique index below
     * store two company-wide rows and never complain.
     */
    trade: varchar("trade", { length: 64 })
      .default(TRADE_DEFAULT_SHARED)
      .notNull(),

    // Overhead — optional, applied BEFORE profit.
    overheadEnabled: boolean("overheadEnabled").default(false).notNull(),
    overheadMode: mysqlEnum("overheadMode", ["percentage", "flat"])
      .default("percentage")
      .notNull(),
    /** Fraction when percentage (0.10 = 10%); currency amount when flat. */
    overheadValue: decimal("overheadValue", { precision: 12, scale: 4 })
      .default("0")
      .notNull(),

    // Profit — the method is always an explicit choice, never assumed.
    profitMethod: mysqlEnum("profitMethod", ["markup", "margin"])
      .default("markup")
      .notNull(),
    /** Fraction: 0.20 = 20% markup, or 20% target margin, per profitMethod. */
    profitValue: decimal("profitValue", { precision: 6, scale: 4 })
      .default("0")
      .notNull(),

    /**
     * Company-wide productivity adjustment, as a fraction (0.10 = +10% hours).
     *
     * Applied at calculation time as a final multiplier AFTER job-condition
     * modifiers have been summed — a separate step, never added into them. See
     * applyProductivityToHours in shared/pricing.ts for why that separation
     * matters. Ships at 0: no adjustment until the contractor has a reason.
     *
     * Signed, so scale(4) with a negative range — a crew that beats book hours
     * is as real as one that does not.
     */
    productivityPct: decimal("productivityPct", { precision: 6, scale: 4 })
      .default("0")
      .notNull(),

    defaultLaborRateId: int("defaultLaborRateId").references(
      () => laborRates.id,
      { onDelete: "set null" }
    ),

    // ── Sales tax ────────────────────────────────────────────────────────────
    //
    // What is taxable is a COMPANY decision, because it follows from the
    // jurisdiction the contractor operates under and the kind of work they do
    // — not from anything about an individual bid. The rate comes from the job
    // address (tax_jurisdictions); these three say what the rate is applied to.
    //
    // All three ship OFF and taxing nothing. A tax feature that arrives switched
    // on with assumed rules would put a number on a bid that nobody chose, and
    // sales tax is the last place in this app where a plausible default is
    // acceptable. See the header of shared/salesTax.ts.

    /** Master switch. Off means no tax line exists anywhere. */
    salesTaxEnabled: boolean("salesTaxEnabled").default(false).notNull(),

    /**
     * Whether materials / labor are taxable. Both false is a legitimate
     * configuration and reports as "nothing taxable" rather than as $0 tax —
     * an explicit statement beats a silent zero.
     */
    taxMaterials: boolean("taxMaterials").default(false).notNull(),
    taxLabor: boolean("taxLabor").default(false).notNull(),

    /**
     * "price" — tax the customer-facing amount, after overhead and profit.
     * "cost"  — tax the underlying cost, before markup.
     *
     * These give materially different numbers on the same bid, which is why it
     * is a setting. Some jurisdictions write the rule against what the
     * contractor charges; others against what they paid.
     */
    taxApplyTo: mysqlEnum("taxApplyTo", TAX_APPLY_TO)
      .default("price")
      .notNull(),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    // Was unique(userId). One row per user per trade now, which is what makes
    // a second trade additive — and it still permits exactly one company-wide
    // (`all`) row, because the sentinel is a real value the index can see.
    unique("pricing_defaults_user_trade_uq").on(t.userId, t.trade),
  ]
);

export type PricingDefaults = typeof pricingDefaults.$inferSelect;
export type InsertPricingDefaults = typeof pricingDefaults.$inferInsert;

// ─── Company branding ─────────────────────────────────────────────────────────
/**
 * Who the contractor is, as it appears on a document a client receives.
 *
 * ── One row per user, never a shared default ─────────────────────────────────
 * Every field here is the USER's company, not this app's and not some seeded
 * example. A proposal that ships with somebody else's name on it is worse than
 * one that ships blank, because blank is obviously unfinished and wrong-but-
 * plausible is not. Nothing in here is ever populated with sample content.
 *
 * ── Blank is the flag ────────────────────────────────────────────────────────
 * Text fields default to "" and the logo columns to NULL, and "still empty"
 * IS the signal that the user has not filled this in — exactly the reasoning
 * behind `needsPricing` reading the $0 itself instead of carrying a separate
 * "has it been priced" flag (shared/materialPricing.ts). A second column saying
 * whether branding was set up is a fact that can drift out of step with the
 * fields it describes; the fields cannot disagree with themselves.
 * `needsBranding` in shared/proposal.ts is what reads them.
 */
export const companyBranding = mysqlTable(
  "company_branding",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /**
     * Which trade this identity is for. `all` is the company-wide row.
     *
     * ── The licence number is why this is per trade ──────────────────────────
     * Everything else here would happily be one row forever — a company has one
     * name and one phone number. `licenseNumber` does not work that way: a
     * contractor licensed for electrical and plumbing holds two separate
     * numbers from two separate boards, and printing the electrical one on a
     * plumbing proposal is a compliance problem, not a cosmetic one. That alone
     * makes branding a per-trade record.
     *
     * Existing rows are `all` and every read falls back to it, so a
     * single-trade contractor still has exactly one row and sees no change.
     */
    trade: varchar("trade", { length: 64 })
      .default(TRADE_DEFAULT_SHARED)
      .notNull(),

    /** Trading name, as the client should see it. */
    companyName: varchar("companyName", { length: 255 }).default("").notNull(),
    /** Contractor licence number — on many jobs a legal requirement to state. */
    licenseNumber: varchar("licenseNumber", { length: 128 })
      .default("")
      .notNull(),
    /** Free-form, multi-line. Rendered line by line, never parsed. */
    address: varchar("address", { length: 512 }).default("").notNull(),
    phone: varchar("phone", { length: 64 }).default("").notNull(),
    email: varchar("email", { length: 320 }).default("").notNull(),
    website: varchar("website", { length: 255 }).default("").notNull(),

    /**
     * The logo in S3. Two columns for the same reason `bid_pdfs` splits them:
     * the key is what this app owns and can re-sign, the URL is what a browser
     * loads. NULL means no logo, which the document renders as a placeholder
     * rather than as blank space.
     */
    logoKey: varchar("logoKey", { length: 1024 }),
    logoUrl: varchar("logoUrl", { length: 1024 }),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [unique("company_branding_user_trade_uq").on(t.userId, t.trade)]
);

export type CompanyBranding = typeof companyBranding.$inferSelect;
export type InsertCompanyBranding = typeof companyBranding.$inferInsert;

// ─── Proposal presentation ────────────────────────────────────────────────────
/**
 * How the client-facing proposal LOOKS: which of the pre-built layouts, what
 * accent colour, and which optional sections are on.
 *
 * ── Presentation only, never pricing ─────────────────────────────────────────
 * Nothing here can change a number. The document is built from the bid's own
 * snapshot and its resolved pricing settings; this table decides what is shown
 * and in what style. Keeping the two apart is what makes it safe to let a user
 * click through three layouts on a finished bid.
 *
 * ── Hidden, not visible ──────────────────────────────────────────────────────
 * `hiddenSections` stores the ones switched OFF, so a section added to the app
 * later is on by default for everybody rather than silently missing from every
 * existing user's proposals — a "visible list" would grandfather people out of
 * new content they never chose to hide.
 */
export const PROPOSAL_LAYOUTS = ["classic", "modern", "minimal"] as const;
export type ProposalLayout = (typeof PROPOSAL_LAYOUTS)[number];

export const proposalSettings = mysqlTable(
  "proposal_settings",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /**
     * Which trade this presentation is for. `all` is the company-wide row.
     *
     * Layout and accent colour are the same on every document a contractor
     * sends and would never need splitting. `termsText` is the field that does:
     * what a proposal excludes and how long the price stands are trade-specific
     * in practice — an electrical quote's exclusions are not a plumbing quote's
     * — and boilerplate that has to be edited per job is boilerplate that ends
     * up wrong. Splitting the whole row rather than that one field keeps the
     * resolution rule identical across all three settings tables.
     */
    trade: varchar("trade", { length: 64 })
      .default(TRADE_DEFAULT_SHARED)
      .notNull(),

    layout: mysqlEnum("layout", PROPOSAL_LAYOUTS).default("classic").notNull(),
    /** Hex, `#RRGGBB`. Validated at the router, so the document can trust it. */
    accentColor: varchar("accentColor", { length: 9 })
      .default("#F5C518")
      .notNull(),
    /** Section ids the user switched off. See shared/proposal.ts. */
    hiddenSections: json("hiddenSections").$type<string[]>(),

    /**
     * Boilerplate the contractor reuses on every proposal — payment terms, what
     * is excluded, how long the price stands. Stored at company level because
     * retyping it per bid is how it ends up inconsistent or missing.
     */
    termsText: text("termsText"),
    /** How many days the quoted price is good for. 0 = do not state a validity. */
    validDays: int("validDays").default(30).notNull(),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [unique("proposal_settings_user_trade_uq").on(t.userId, t.trade)]
);

export type ProposalSettings = typeof proposalSettings.$inferSelect;
export type InsertProposalSettings = typeof proposalSettings.$inferInsert;

// ─── Clients ──────────────────────────────────────────────────────────────────
/**
 * Who the work is for — a company or a person, with the details that identify
 * them and the address the job is at.
 *
 * ── Why a table, when the bid already has clientName and siteAddress ─────────
 * Those two columns are free text typed per bid, which is fine for printing one
 * proposal and useless for everything after it. A general contractor a user
 * bids for twenty times a year is twenty independent spellings of one name, so
 * "show me everything I have quoted for Harbour Construction" cannot be
 * answered, and neither can "what did I charge them last time". A record with
 * an id makes both a lookup instead of a text search.
 *
 * Three named features are waiting on this, and none of them is built here:
 *   • historical bid search, which queries this;
 *   • sales tax, which needs the JOB address — jurisdiction follows where the
 *     work happens, not where the invoice is posted, which is why `address` and
 *     the bid's own `siteAddress` are separate things and both survive;
 *   • government bids, which will hang contract and agency fields off a client.
 * This pass is the structure they depend on and stops there.
 *
 * ── Optional, and permanently so ─────────────────────────────────────────────
 * `bids.clientId` is nullable and nothing requires it. A contractor quoting a
 * job at 7pm to get a number out the door must not be stopped by a form asking
 * who they are billing, and every bid that already exists predates this table.
 * A bid with no client behaves exactly as it did before — the proposal still
 * reads the bid's own clientName, and the fallback is tested.
 */
export const CLIENT_KINDS = ["company", "individual"] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];

export const clients = mysqlTable(
  "clients",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /**
     * Company or individual. One field, not two tables, because everything
     * about them is identical apart from what `name` means — a builder's
     * trading name against a homeowner's own name — and the distinction is
     * worth keeping only so a document can address them correctly.
     */
    kind: mysqlEnum("kind", CLIENT_KINDS).default("company").notNull(),

    /** The company's trading name, or the person's name. The only required field. */
    name: varchar("name", { length: 255 }).notNull(),
    /**
     * The person you actually deal with at a company. Nullable, and meaningless
     * for an individual, whose name is already in `name`.
     */
    contactName: varchar("contactName", { length: 255 }),

    /**
     * Where the client is. Free-form and multi-line, matching
     * `company_branding.address` — rendered line by line, never parsed.
     *
     * NOT the job address. `bids.siteAddress` stays per bid because one client
     * has many jobs in many places, and it is the JOB's location that decides
     * the tax jurisdiction. Collapsing the two would put the wrong rate on
     * every bid a repeat customer places outside their own town.
     */
    address: varchar("address", { length: 512 }),
    phone: varchar("phone", { length: 64 }),
    email: varchar("email", { length: 320 }),

    /** Anything the contractor wants to remember. Never printed on a document. */
    notes: text("notes"),

    /**
     * When this client was archived, or NULL if live. Same single-column shape
     * as `bids.archivedAt`, and the same reasoning: a flag and a date can
     * disagree, one column cannot.
     *
     * Unlike a bid there is no countdown and nothing purges it. A client is a
     * name and a phone number attached to bid history, so keeping one costs
     * nothing — and deleting it would strand the bids that point at it.
     */
    /** Part of the shipped sample. Same reasoning as bids.isSample. */
    isSample: boolean("isSample").default(false).notNull(),

    archivedAt: timestamp("archivedAt"),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("clients_userId_idx").on(t.userId),
    // Historical search lands here: "every bid for this client" starts by
    // finding the client by name within one account.
    index("clients_userId_name_idx").on(t.userId, t.name),
    // The clients list is now cursor-paginated by name, so the sort key has
    // to be indexed alongside the scope for the same reason bids are above.
    index("clients_userId_archivedAt_name_idx").on(
      t.userId,
      t.archivedAt,
      t.name
    ),
    index("clients_archivedAt_idx").on(t.archivedAt),
  ]
);

export type Client = typeof clients.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;

// ─── Additional expenses ──────────────────────────────────────────────────────
/**
 * A flat charge that is neither material nor labor — a permit, an inspection,
 * a dispatch fee, a minimum service charge.
 *
 * ── Why it is not a material with zero labor ─────────────────────────────────
 * It would price correctly that way and read wrongly everywhere. A permit fee
 * is not something you take off a plan, stock in a van or mark up per unit; it
 * is a number the job carries. Filing it in the material catalog would put it
 * in every material search, give it a unit of sale it does not have, and make
 * the bid's material total wrong as a description of what was bought.
 *
 * ── Library plus one-offs, the same shape as everything else ─────────────────
 * This table is the reusable list. A charge that applies to exactly one bid is
 * written straight onto `bid_expenses` with no row here — see that table.
 */
export const expenseItems = mysqlTable(
  "expense_items",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** "Permit fee", "Minimum service call", "Dispatch". */
    name: varchar("name", { length: 255 }).notNull(),
    /** A flat dollar amount. Not a rate and not per-unit. */
    amount: decimal("amount", { precision: 12, scale: 4 })
      .default("0")
      .notNull(),
    /** Optional note for the user — never printed on a proposal. */
    notes: varchar("notes", { length: 512 }),

    /**
     * Whether this charge is part of the sales-tax base.
     *
     * Off by default, which is the behaviour every existing expense already
     * has. Independent of `markedUp` on purpose: a permit may be marked up but
     * untaxed, taxed but passed through at cost, both, or neither, and which
     * combination is right varies by state AND by the kind of charge. Two
     * booleans on the row beat a rules engine nobody can predict.
     */
    taxable: boolean("taxable").default(false).notNull(),
    /**
     * Whether the company's overhead and profit are applied to this charge.
     *
     * Off by default — a flat pass-through, as before. When on, the amount
     * joins the direct cost and runs through exactly the same overhead and
     * profit calculation as materials and labor, rather than through a second
     * markup path that could drift from it.
     */
    markedUp: boolean("markedUp").default(false).notNull(),

    archivedAt: timestamp("archivedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("expense_items_userId_idx").on(t.userId),
    index("expense_items_archivedAt_idx").on(t.archivedAt),
  ]
);

export type ExpenseItem = typeof expenseItems.$inferSelect;
export type InsertExpenseItem = typeof expenseItems.$inferInsert;

/**
 * One expense placed on one bid, with its amount SNAPSHOT.
 *
 * Same rule as `bid_line_items`: the name and the amount are frozen when the
 * expense is added, so raising the permit fee in the library next month cannot
 * silently re-price a bid already sent. `expenseItemId` is provenance only and
 * is `set null` on delete — removing a library entry must never alter a bid
 * that used it.
 *
 * `expenseItemId` NULL is also how a ONE-OFF is stored: an amount typed onto
 * this bid and deliberately not saved to the library. Nothing distinguishes the
 * two once they are on the bid, which is the point — the library is a
 * convenience for adding, not a container the bid depends on.
 */
export const bidExpenses = mysqlTable(
  "bid_expenses",
  {
    id: int("id").autoincrement().primaryKey(),
    bidId: int("bidId")
      .notNull()
      .references(() => bids.id, { onDelete: "cascade" }),
    /** Provenance. NULL for a one-off typed straight onto the bid. */
    expenseItemId: int("expenseItemId").references(() => expenseItems.id, {
      onDelete: "set null",
    }),

    /** Frozen at add time — the bid reads the same after a library rename. */
    name: varchar("name", { length: 255 }).notNull(),
    amount: decimal("amount", { precision: 12, scale: 4 })
      .default("0")
      .notNull(),

    /**
     * Whether this charge is part of the sales-tax base.
     *
     * Off by default, which is the behaviour every existing expense already
     * has. Independent of `markedUp` on purpose: a permit may be marked up but
     * untaxed, taxed but passed through at cost, both, or neither, and which
     * combination is right varies by state AND by the kind of charge. Two
     * booleans on the row beat a rules engine nobody can predict.
     */
    taxable: boolean("taxable").default(false).notNull(),
    /**
     * Whether the company's overhead and profit are applied to this charge.
     *
     * Off by default — a flat pass-through, as before. When on, the amount
     * joins the direct cost and runs through exactly the same overhead and
     * profit calculation as materials and labor, rather than through a second
     * markup path that could drift from it.
     */
    markedUp: boolean("markedUp").default(false).notNull(),

    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [index("bid_expenses_bidId_idx").on(t.bidId)]
);

export type BidExpense = typeof bidExpenses.$inferSelect;
export type InsertBidExpense = typeof bidExpenses.$inferInsert;

// ─── Includes / excludes ──────────────────────────────────────────────────────
/**
 * A line of scope: something the price covers, or something it explicitly does
 * not.
 *
 * ── Why excludes matter as much as includes ──────────────────────────────────
 * Standard construction bidding practice, and it is a dispute-prevention
 * device rather than a formatting one. "Excludes: permit pulled by owner" on
 * the proposal is what settles the argument three months later about who was
 * supposed to pull it. That is why these print on the client document and why
 * they are worth a reusable list — a contractor's exclusions are close to
 * identical job to job, and retyping them is how one gets left off.
 */
export const SCOPE_NOTE_KINDS = ["include", "exclude"] as const;
export type ScopeNoteKind = (typeof SCOPE_NOTE_KINDS)[number];

export const scopeNotes = mysqlTable(
  "scope_notes",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    kind: mysqlEnum("kind", SCOPE_NOTE_KINDS).notNull(),
    /** One line, as it will read on the document. */
    text: varchar("text", { length: 512 }).notNull(),

    archivedAt: timestamp("archivedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("scope_notes_userId_idx").on(t.userId),
    index("scope_notes_kind_idx").on(t.userId, t.kind),
    index("scope_notes_archivedAt_idx").on(t.archivedAt),
  ]
);

export type ScopeNote = typeof scopeNotes.$inferSelect;
export type InsertScopeNote = typeof scopeNotes.$inferInsert;

/**
 * One include or exclude on one bid, with its text SNAPSHOT.
 *
 * Frozen for the same reason an expense and a line item are: editing a stock
 * exclusion must not silently change the wording of a proposal already in a
 * client's hands — and with exclusions that wording is the whole point of
 * having them. NULL `scopeNoteId` is a one-off typed for this bid.
 */
export const bidScopeNotes = mysqlTable(
  "bid_scope_notes",
  {
    id: int("id").autoincrement().primaryKey(),
    bidId: int("bidId")
      .notNull()
      .references(() => bids.id, { onDelete: "cascade" }),
    scopeNoteId: int("scopeNoteId").references(() => scopeNotes.id, {
      onDelete: "set null",
    }),

    kind: mysqlEnum("kind", SCOPE_NOTE_KINDS).notNull(),
    text: varchar("text", { length: 512 }).notNull(),

    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("bid_scope_notes_bidId_idx").on(t.bidId),
    index("bid_scope_notes_kind_idx").on(t.bidId, t.kind),
  ]
);

export type BidScopeNote = typeof bidScopeNotes.$inferSelect;
export type InsertBidScopeNote = typeof bidScopeNotes.$inferInsert;

// ─── Tax jurisdictions ────────────────────────────────────────────────────────
/**
 * A place, and the sales tax it charges — as the CONTRACTOR entered it.
 *
 * ── Nothing is shipped, and that is the design ───────────────────────────────
 * There is no seeded rate table and there must never be one. Rates change
 * constantly across state, county, city and special districts, and a stale
 * hardcoded rate is worse than none: it looks identical to a correct one on
 * screen, gets bid, gets won, and the difference comes out of a margin or an
 * audit. Every row here was typed in by someone who checked it, which is the
 * only basis on which this app should apply a tax rate at all.
 *
 * See shared/salesTax.ts for the fuller statement of that constraint.
 *
 * ── Components, not one number ───────────────────────────────────────────────
 * `components` is the stack — `[{label:"State", ratePct:6.25}, {label:"Cook
 * County", ratePct:1.75}]` — because that is how a rate is quoted and how it is
 * checked. A single 9.5% gives a contractor nothing to verify against their
 * accountant's figures, and an itemised proposal is what makes the number
 * defensible to a customer.
 *
 * ── Matching is by text, and openly so ───────────────────────────────────────
 * `state` / `county` / `city` are optional matching keys tested against the
 * bid's job address (matchJurisdiction). It is substring matching, not
 * geocoding: it can miss and it can be fooled. That is tolerable only because
 * the match is always displayed with what it matched on, and is always
 * overridable on the bid.
 */
export const taxJurisdictions = mysqlTable(
  "tax_jurisdictions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** What the user calls it — "Illinois — Chicago", "Travis County TX". */
    name: varchar("name", { length: 255 }).notNull(),

    /**
     * The matching keys. All optional; every one that is SET must appear in the
     * job address for the row to match, and a row with none set matches
     * nothing rather than everything.
     */
    state: varchar("state", { length: 64 }),
    county: varchar("county", { length: 128 }),
    city: varchar("city", { length: 128 }),

    /** `[{ label, ratePct }]`, percent as typed — 6.25 means 6.25%. */
    components: json("components")
      .$type<{ label: string; ratePct: number }[]>()
      .notNull(),

    /**
     * Free text for where the rate came from and when it was checked — a link
     * to the state's rate lookup, an accountant's name, a date.
     *
     * It exists because the one question anybody asks about a tax rate is "says
     * who?", and the answer needs somewhere to live next to the number rather
     * than in an email.
     */
    sourceNote: varchar("sourceNote", { length: 512 }),

    /**
     * When the user last confirmed this rate is still current.
     *
     * Deliberately NOT `updatedAt`, for the same reason materials price
     * staleness is not: `updatedAt` moves when anything changes — a rename, a
     * note — so ageing a rate off it would show a two-year-old rate as freshly
     * checked because somebody fixed its spelling. Only an explicit confirm
     * touches this.
     */
    verifiedAt: timestamp("verifiedAt"),

    archivedAt: timestamp("archivedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("tax_jurisdictions_userId_idx").on(t.userId),
    index("tax_jurisdictions_archivedAt_idx").on(t.archivedAt),
  ]
);

export type TaxJurisdictionRow = typeof taxJurisdictions.$inferSelect;
export type InsertTaxJurisdiction = typeof taxJurisdictions.$inferInsert;

// ─── Bids ─────────────────────────────────────────────────────────────────────
// The Foundation bid layer. Deliberately NOT the legacy `projects` table, which
// belongs to the master_* system and carries PDF/takeoff state — see the divider
// comment above. Do not wire the two together.

export const BID_STATUSES = ["Draft", "Active", "Won", "Lost"] as const;
export type BidStatus = (typeof BID_STATUSES)[number];

export const bids = mysqlTable(
  "bids",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    name: varchar("name", { length: 255 }).notNull(),
    status: mysqlEnum("status", BID_STATUSES).default("Draft").notNull(),
    /** Trades unlocked for this bid. One bid may mix line items from several. */
    trades: json("trades").$type<string[]>(),

    /**
     * When the bid is due to be submitted. Nullable on purpose — plenty of work
     * is quoted without a firm deadline, and a fake date would sort ahead of
     * real ones on the dashboard.
     *
     * A DATE, not a timestamp: a deadline is a day, and storing a time would
     * invite timezone drift into something the user thinks of as "the 14th".
     */
    dueDate: date("dueDate", { mode: "string" }),

    /**
     * Per-bid pricing overrides. NULL means "inherit the company default" from
     * `pricing_defaults`, and inheritance is per GROUP, not per field:
     *
     *   overheadEnabled NULL → the whole overhead group is inherited.
     *   profitMethod    NULL → the whole profit group is inherited.
     *
     * Grouping them avoids the half-overridden state where a bid has its own
     * profit percentage but the company's method — which reads as a bug to a
     * user and silently changes the price when the company default moves.
     */
    overheadEnabled: boolean("overheadEnabled"),
    overheadMode: mysqlEnum("overheadMode", ["percentage", "flat"]),
    overheadValue: decimal("overheadValue", { precision: 12, scale: 4 }),
    profitMethod: mysqlEnum("profitMethod", ["markup", "margin"]),
    profitValue: decimal("profitValue", { precision: 6, scale: 4 }),
    /**
     * Per-bid productivity override. NULL inherits the company default.
     *
     * A single column rather than a group, because unlike overhead and profit
     * there is no second field it could be half-overridden against.
     */
    productivityPct: decimal("productivityPct", { precision: 6, scale: 4 }),

    /**
     * The elevation the raceway runs at ON THIS JOB, in inches. NULL inherits
     * the company's, from `takeoff_height_defaults`.
     *
     * A single column rather than a group, like `productivityPct` above and for
     * the same reason: there is no second field it could be half-overridden
     * against. Per bid because a ceiling height is a fact about a building, and
     * the next job has different ones.
     */
    distributionHeightInches: int("distributionHeightInches"),

    /**
     * The client this bid is for, if one has been assigned.
     *
     * ── Nullable, and it stays that way ──────────────────────────────────────
     * Every bid written before this column existed has none, and a bid put
     * together in a hurry never has to have one. Nothing reads it without
     * handling absence — see resolveBidClient in shared/bidClient.ts, which is
     * the single place the fallback to the free-text fields below lives.
     *
     * ── `set null`, never cascade ────────────────────────────────────────────
     * Deleting a client must not delete their bids. That is the difference
     * between tidying a contact list and destroying a year of quoting history,
     * and the bid keeps its own `clientName` text, so an unlinked bid still
     * prints the name it always printed. Same instinct as `assemblyId` on a bid
     * line: a provenance link is severed, never followed into a deletion.
     */
    clientId: int("clientId").references(() => clients.id, {
      onDelete: "set null",
    }),

    /**
     * Who the proposal is addressed to, and where the work is.
     *
     * Per-bid because they ARE the bid — unlike the branding and layout, which
     * are the same on every document this contractor sends. NULL rather than ""
     * so the proposal can tell "not filled in yet" from "deliberately empty"
     * and prompt for it instead of printing a blank line where a client's name
     * belongs.
     *
     * ── Kept after `clientId` landed, deliberately ───────────────────────────
     * These are not made redundant by the link, they are the override layer
     * over it: `clientName` set on the bid wins, and the client record fills in
     * when it is blank. A bid addressed to one division of a customer, or a
     * name corrected for one document, must not edit the shared client record
     * and change every other bid pointing at it — the same
     * snapshot-beats-library rule the whole bid layer runs on.
     *
     * `siteAddress` is more than an override: a client has one address and many
     * jobs, so where THIS work happens is genuinely per bid. It is what sales
     * tax will read.
     *
     * `proposalNote` is the one or two sentences of scope summary that opens
     * the document — the part a contractor writes per job.
     */
    clientName: varchar("clientName", { length: 255 }),
    siteAddress: varchar("siteAddress", { length: 512 }),
    proposalNote: text("proposalNote"),

    // ── Sales tax, per bid ───────────────────────────────────────────────────
    //
    // The rate normally comes from matching `siteAddress` against the user's
    // tax areas. These three exist because that must never be the only path:
    // an automatic tax with no way to correct it is a way to send a wrong
    // number to a customer with no recourse, and exemptions are ordinary.

    /**
     * Use THIS tax area rather than whatever the job address matched.
     *
     * For the address the matcher cannot read, the job that straddles a
     * boundary, and the case where the user simply knows better. `set null` on
     * delete: removing a tax area must not silently re-rate every bid that
     * pointed at it — it drops back to matching, and the bid says so.
     */
    taxJurisdictionId: int("taxJurisdictionId").references(
      () => taxJurisdictions.id,
      { onDelete: "set null" }
    ),

    /**
     * A rate typed straight onto this bid, as a percent. Outranks both the
     * matched area and `taxJurisdictionId`.
     *
     * The last resort, and the reason it exists: a contractor who cannot make
     * the app produce the right number must still be able to send the right
     * bid. NULL means "not overridden", which is different from 0 — zero is a
     * deliberate zero-rate and is applied as one.
     */
    taxRateOverridePct: decimal("taxRateOverridePct", {
      precision: 7,
      scale: 4,
    }),

    /**
     * This customer pays no sales tax. Outranks every rate above.
     *
     * Government bodies, resale, registered exempt organisations. The reason is
     * stored alongside because "why was this bid untaxed" is the first question
     * asked in an audit, and a bare boolean cannot answer it. Shown on the
     * proposal as an explicit $0 line rather than by omission — a customer
     * entitled to an exemption should see that they got it.
     */
    taxExempt: boolean("taxExempt").default(false).notNull(),
    taxExemptReason: varchar("taxExemptReason", { length: 255 }),

    /**
     * When the bid was archived, or NULL if it is live. This single column is
     * the whole archive state — there is deliberately no companion boolean.
     *
     * A flag plus a timestamp can disagree (archived with no date, dated but
     * not archived), and the retention window is computed FROM this value, so a
     * drifted pair would either delete something early or keep it forever. One
     * column cannot drift. `archivedAt IS NULL` is the live test everywhere.
     *
     * Independent of `status`: a bid may be archived while Draft, Active, Won
     * or Lost. Archiving is "get it off my dashboard", not an outcome.
     *
     * Retention is RETENTION_DAYS from this instant — see shared/retention.ts.
     *
     * MySQL TIMESTAMP carries no fractional seconds, so this truncates DOWN to
     * the whole second: the deadline is second-accurate, and a purge can fire
     * up to 999ms early. Irrelevant against a 30-day window swept once a day,
     * and not worth an fsp(3) column to chase.
     */

    /**
     * This bid is the shipped sample, not the contractor's work.
     *
     * A COLUMN rather than a naming convention, and that is the whole point:
     * "call it [SAMPLE]" is a promise kept by remembering it on a dashboard, a
     * search, a proposal, an export and whatever gets built next, while this is
     * a promise the query keeps. Every money AGGREGATE filters on it — see
     * shared/sampleProject.ts, which owns the rule.
     *
     * The row is otherwise completely ordinary. It is editable, deletable and
     * scoped to its company like any other bid, because a sample that behaved
     * differently from a real bid would teach the wrong thing.
     */
    isSample: boolean("isSample").default(false).notNull(),

    archivedAt: timestamp("archivedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("bids_userId_idx").on(t.userId),
    // Composite, and this is what makes historical search page at constant
    // cost. Keyset pagination walks (userId, sortColumn) in order and stops
    // at LIMIT; without the sort column in the index the database has to
    // read every one of that company's bids and sort them to return twenty.
    // Both columns are NOT NULL, which is why they are the only sorts the
    // search offers — see shared/bidSearch.ts.
    index("bids_userId_updatedAt_idx").on(t.userId, t.updatedAt),
    index("bids_userId_createdAt_idx").on(t.userId, t.createdAt),
    // dueDate is a filter, never a sort. Indexed so a date range narrows
    // before anything else runs.
    index("bids_userId_dueDate_idx").on(t.userId, t.dueDate),
    index("bids_status_idx").on(t.status),
    // "Every bid for this client" — the query historical search is built on.
    index("bids_clientId_idx").on(t.clientId),
    // The purge sweep scans this across every user, so it cannot be a table
    // scan that grows with the whole bid history.
    index("bids_archivedAt_idx").on(t.archivedAt),
  ]
);

export type Bid = typeof bids.$inferSelect;
export type InsertBid = typeof bids.$inferInsert;

// ─── Bid PDFs (plan sheets) ───────────────────────────────────────────────────
/**
 * Plan PDFs attached to a bid. Takeoff redesign, phase 1.
 *
 * A bid holds MANY of these, unlike the legacy `projects` row which carried a
 * single `pdfUrl`/`pdfKey`/`pdfFilename` triple inline. Real jobs arrive as a
 * set — electrical sheets, a spec book, an addendum issued a week later — and
 * the one-PDF-per-job shape forced the user to pick which one mattered.
 *
 * The file itself lives in S3 under `storageKey`; nothing here holds bytes.
 * `onDelete: "cascade"` from `bids` is what makes the retention purge a single
 * DELETE on the bid — see server/scheduled/purgeArchivedBids.ts.
 */
export const bidPdfs = mysqlTable(
  "bid_pdfs",
  {
    id: int("id").autoincrement().primaryKey(),
    bidId: int("bidId")
      .notNull()
      .references(() => bids.id, { onDelete: "cascade" }),
    /**
     * Denormalised from the bid so an ownership check is one query, not two.
     * Every read still filters on it — a storage key is guessable enough that
     * "you had the id" must never be the only thing standing in the way.
     */
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** What the user called it. Shown in the sheet list; never used as a path. */
    filename: varchar("filename", { length: 512 }).notNull(),
    /** S3 object key from storagePut(). Resolved through /manus-storage/<key>. */
    storageKey: varchar("storageKey", { length: 1024 }).notNull(),
    /**
     * How big the file is, in bytes.
     *
     * BIGINT, not INT, and the difference is load-bearing: a signed INT tops
     * out at 2,147,483,647, which is one byte under 2GB — exactly the limit the
     * app accepts. As an INT, a 2GB plan set uploaded perfectly to storage and
     * then failed to attach, with the error arriving after the twenty minutes
     * of transfer rather than before. Found by a test that tried the limit.
     */
    byteSize: bigint("byteSize", { mode: "number" }).default(0).notNull(),
    /**
     * Filled in by the client after the document first opens, because counting
     * pages means parsing the PDF and only the viewer has a parser. NULL means
     * "not opened yet", which the list shows as a blank rather than "0 pages" —
     * a real zero-page PDF and an unread one must not look alike.
     */
    pageCount: int("pageCount"),

    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("bid_pdfs_bidId_idx").on(t.bidId),
    index("bid_pdfs_userId_idx").on(t.userId),
  ]
);

export type BidPdf = typeof bidPdfs.$inferSelect;
export type InsertBidPdf = typeof bidPdfs.$inferInsert;

// ─── Plan sheets (one row per page) ───────────────────────────────────────────
/**
 * One page of an attached PDF, with the two things that make it workable: what
 * it is CALLED, and what it is drawn AT. Takeoff redesign, phase 2a.
 *
 * ── Why a row per page rather than deriving on the fly ───────────────────────
 * Both facts are per-page and both are editable. A 40-sheet set has 40 names
 * the user may correct and up to 40 different scales — a detail sheet at
 * 3/4"=1'-0" sits in the same document as a site plan at 1"=40'. Nothing about
 * either can be recomputed from the PDF once a human has touched it, so it is
 * stored.
 *
 * Rows are created when a document is first opened, from the PDF's outline
 * where it has one. Idempotent: reopening never duplicates or overwrites.
 */
export const SHEET_NAME_SOURCES = ["bookmark", "default", "user"] as const;
export type SheetNameSource = (typeof SHEET_NAME_SOURCES)[number];

export const SCALE_SOURCES = ["detected", "manual", "none"] as const;
export type ScaleSourceValue = (typeof SCALE_SOURCES)[number];

export const bidPdfSheets = mysqlTable(
  "bid_pdf_sheets",
  {
    id: int("id").autoincrement().primaryKey(),
    bidPdfId: int("bidPdfId")
      .notNull()
      .references(() => bidPdfs.id, { onDelete: "cascade" }),
    /** Denormalised for one-query ownership checks, as on bid_pdfs. */
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** 1-based, matching how pdfjs and every human count pages. */
    pageNumber: int("pageNumber").notNull(),

    /**
     * What the sheet is called. Never null and never blank — an unnamed sheet
     * makes the index a list of numbers to hunt through, which is the thing the
     * index exists to replace. Falls back to "Sheet N" at creation.
     */
    name: varchar("name", { length: 255 }).notNull(),
    /**
     * Where the name came from. `user` is sticky: a re-scan of the document
     * must never overwrite a name someone typed.
     */
    nameSource: mysqlEnum("nameSource", SHEET_NAME_SOURCES)
      .default("default")
      .notNull(),

    /**
     * Real-world distance per unit of paper — `1/4" = 1'-0"` is 48. NULL means
     * no scale is set, which is honest: it makes every later measuring feature
     * refuse rather than quietly measure against a guess.
     */
    scaleRatio: decimal("scaleRatio", { precision: 14, scale: 6 }),
    /** How the scale reads, e.g. `1/4" = 1'-0"`. Display only; ratio governs. */
    scaleText: varchar("scaleText", { length: 64 }),
    scaleSource: mysqlEnum("scaleSource", SCALE_SOURCES)
      .default("none")
      .notNull(),
    /**
     * What auto-detection found, kept even when it was NOT applied.
     *
     * A low-confidence reading is still useful to a person — "the sheet says
     * 3/4\" = 1'-0\" somewhere" is a head start on typing it — so it is offered
     * as a suggestion rather than thrown away or silently trusted.
     */
    detectedScaleText: varchar("detectedScaleText", { length: 255 }),

    /**
     * The sheet states it is NOT TO SCALE.
     *
     * Phase 2a detected this but only held it in browser state, so it vanished
     * on reload. It has to be stored, because phase 2b uses it as a hard gate:
     * a sheet marked N.T.S. cannot be measured unless a human sets a scale by
     * hand. See measurabilityOf() in shared/takeoffQuantities.ts — a drawing
     * saying its own geometry is untrustworthy is not something to infer again
     * each session.
     */
    notToScale: boolean("notToScale").default(false).notNull(),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("bid_pdf_sheets_bidPdfId_idx").on(t.bidPdfId),
    index("bid_pdf_sheets_userId_idx").on(t.userId),
  ]
);

export type BidPdfSheet = typeof bidPdfSheets.$inferSelect;
export type InsertBidPdfSheet = typeof bidPdfSheets.$inferInsert;

// ─── Traced runs (takeoff phase 2b) ───────────────────────────────────────────
/**
 * One physical raceway traced on a sheet: a conduit route, or a cable run.
 *
 * ── What is stored, and what is recomputed ───────────────────────────────────
 * The POINTS are the measurement. Everything else — length, footage, wire — is
 * derived from them through shared/takeoffGeometry.ts and never stored as the
 * only copy, so a bill of materials can never disagree with the geometry it
 * came from.
 *
 * `lengthInches` and `scaleRatioUsed` are cached alongside anyway, for one
 * reason: if the sheet's scale is edited later, every run traced against the
 * old scale silently changes length. Keeping what was used at trace time lets
 * the app SAY that rather than quietly re-pricing a run the user already
 * checked. It is evidence, not the source of truth.
 */
export const RUN_PATH_TYPES = ["conduit", "cable"] as const;

// ─── Run types (takeoff phase 7) ──────────────────────────────────────────────
/**
 * A kind of run, defined once and reused on every job — "3/4in EMT, 3 #12 THHN".
 *
 * ── Why a library row and not a per-bid one ──────────────────────────────────
 * A counted group (`takeoff_groups`) is per BID because "14 exit signs on this
 * school" is a fact about one job. This is the opposite kind of thing: the same
 * definition applies to every job the contractor will ever bid, which is the
 * definition of a library item. The migration cost decided it — per-bid to
 * per-user later would mean finding and merging duplicates spread across every
 * bid ever made, and per-user from the start costs nothing extra today.
 *
 * ── It is what makes a traced run priceable (T4) ─────────────────────────────
 * A run is only "conduit" or "cable" today, so the materials list prints its
 * footage as "awaiting a specification" and traced footage cannot reach a bid
 * (takeoff-spec.md T4, R2). The material links below are why this table carries
 * a specification rather than a nickname: without them the palette would be
 * cosmetic and T4 would still be open.
 *
 * ── Shipped rows and the contractor's own, one table ─────────────────────────
 * Same shape as materials, and the flag is the same: **NULL `userId` is an
 * app-owned row**, shared by everyone and re-stamped from the seed on startup;
 * a set `userId` is that contractor's own. Editing a shipped row forks it
 * rather than changing everyone's (CLAUDE.md § Customization available).
 *
 * **What ships carries IDENTITY and no money.** A handful of recognisable types
 * — 1/2in EMT with 2 #12 and a ground, 12/2 MC — so the first trace does not
 * require defining something first, which is the setup-before-value failure
 * level 1 exists to remove. Every allowance ships NULL and inherits from the
 * company defaults, because an allowance is the contractor's judgement and a
 * plausible number nobody chose is indistinguishable on screen from one they
 * set. Identical reasoning to every shipped material costing $0.
 *
 * ── Retire, never delete ─────────────────────────────────────────────────────
 * `status` withdraws a type from every picker while anything pointing at it
 * still resolves. A run also keeps `runTypeLabel` as a snapshot, so even a row
 * that somehow goes to NULL leaves the run able to say what it was — see
 * `takeoff_runs`.
 *
 * ── The run reads this LIVE, and that is deliberate ──────────────────────────
 * Editing a type updates every run still following it. The freeze belongs at
 * the bid line, not before it: a traced run is measured work, not money, and
 * the snapshot boundary in this app is the moment something becomes a bid line
 * (see `bid_line_items`). Same relationship an assembly has to a bid.
 */
export const takeoffRunTypes = mysqlTable(
  "takeoff_run_types",
  {
    id: int("id").autoincrement().primaryKey(),
    /** NULL = shipped row, shared by everyone. Set = this contractor's own. */
    userId: int("userId").references(() => users.id, { onDelete: "cascade" }),
    /** The shipped row this was forked from. NULL = shipped, or fully custom. */
    baselineId: int("baselineId"),
    /** Baseline `version` at fork time — drives the "update available" nudge. */
    baselineVersion: int("baselineVersion"),
    /** Bumped when a shipped row is republished. Meaningless on user rows. */
    version: int("version").default(1).notNull(),

    /** What the estimator calls it. Also the name every run of it inherits. */
    label: varchar("label", { length: 255 }).notNull(),
    /** Which tool arms it, and which line style the drawing gives it. */
    pathType: mysqlEnum("pathType", RUN_PATH_TYPES).notNull(),

    /**
     * Which trade's palette this belongs to.
     *
     * Present for the same reason every other library table has it: unlocking
     * is gated at the app layer so a new trade is content rather than a
     * migration (CLAUDE.md § Project). A plumber runs pipe too, and nothing
     * here is electrical except the rows that ship.
     */
    trade: varchar("trade", { length: 64 })
      .default(TRADE_DEFAULT_TRADE_GATED)
      .notNull(),

    /**
     * The raceway itself — the EMT, the PVC, the flex.
     *
     * NULL for a cable type, where the cable IS the material and the conductor
     * link below holds it. `set null` on delete, like every other provenance
     * link: retiring a material must not change what a traced run says it is,
     * and `label` keeps it readable either way.
     */
    racewayMaterialId: int("racewayMaterialId").references(() => materials.id, {
      onDelete: "set null",
    }),
    /** The conductor — the #12 THHN, or the MC cable itself. */
    conductorMaterialId: int("conductorMaterialId").references(
      () => materials.id,
      { onDelete: "set null" }
    ),
    /**
     * How many conductors one circuit of this type carries.
     *
     * Entered, never derived (§ 2.1). NULL means the type does not say, which
     * is honest for a half-defined row and must not be read as zero.
     */
    conductorCount: int("conductorCount"),

    /**
     * The ground wire itself — the bare copper, or the green insulated one.
     *
     * Its own link rather than reusing `conductorMaterialId`, because that is
     * the whole point of separating it: a ground is frequently a size down from
     * the phases and frequently bare, and bare copper cannot be ordered as
     * THHN. A supplier list that cannot tell them apart asks for the wrong
     * thing in the right quantity.
     *
     * `set null` on delete like every other provenance link here: retiring a
     * material must not change what a traced run says it is.
     */
    groundMaterialId: int("groundMaterialId").references(() => materials.id, {
      onDelete: "set null",
    }),
    /**
     * How many grounds one circuit of this type carries. NULL is "not said".
     *
     * Same nullability reasoning as `takeoff_run_circuits.groundCount`, and
     * the same backfill guard (0064). "2 #12 + ground" is what an electrician
     * writes on a drawing, and as of 2026-09-20 it is what this stores: a
     * conductor count of 2 and a ground count of 1, rather than a 3 that has to
     * be explained.
     */
    groundCount: int("groundCount"),

    /** active / archived / deleted. See materials.status — same lifecycle. */
    status: mysqlEnum("status", LIBRARY_STATUSES).default("active").notNull(),
    archivedAt: timestamp("archivedAt"),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("takeoff_run_types_userId_idx").on(t.userId),
    index("takeoff_run_types_status_idx").on(t.status),
    index("takeoff_run_types_trade_idx").on(t.trade),
  ]
);

export type TakeoffRunType = typeof takeoffRunTypes.$inferSelect;
export type InsertTakeoffRunType = typeof takeoffRunTypes.$inferInsert;
export type RunPathType = (typeof RUN_PATH_TYPES)[number];

/** Draft = still being traced or autosaved; committed = the user finished. */
export const RUN_STATUSES = ["draft", "committed"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const takeoffRuns = mysqlTable(
  "takeoff_runs",
  {
    id: int("id").autoincrement().primaryKey(),
    bidId: int("bidId")
      .notNull()
      .references(() => bids.id, { onDelete: "cascade" }),
    sheetId: int("sheetId")
      .notNull()
      .references(() => bidPdfSheets.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    name: varchar("name", { length: 255 }).notNull(),
    /**
     * conduit — a pipe with wire pulled through it. Conduit is counted once
     *           for the run; wire is counted per circuit (see takeoff_run_circuits).
     * cable   — Romex/MC. The cable IS the raceway; there is no conduit line.
     */
    pathType: mysqlEnum("pathType", RUN_PATH_TYPES)
      .default("conduit")
      .notNull(),

    /**
     * The traced vertices, in PDF PAGE POINTS — never screen pixels, which
     * depend on zoom. `[{x,y}, …]`, in click order.
     */
    points: json("points").$type<{ x: number; y: number }[]>().notNull(),

    /** Cached from the points at save time. Recomputed on read; see header. */
    lengthInches: decimal("lengthInches", { precision: 14, scale: 4 }),
    /** The sheet scale this was measured against, to detect a later change. */
    scaleRatioUsed: decimal("scaleRatioUsed", { precision: 14, scale: 6 }),

    status: mysqlEnum("status", RUN_STATUSES).default("draft").notNull(),

    /** WHERE the raceway sits. Same axis as a stamp's; see TAKEOFF_LOCATIONS. */
    location: mysqlEnum("location", TAKEOFF_LOCATIONS),

    /**
     * This path was proposed by AI rather than traced by hand.
     *
     * Never treated as final: a suggested run stays visibly a suggestion until
     * the user accepts it, and accepting is what clears this. Nothing in the
     * bill of materials counts a suggestion.
     */
    isSuggestion: boolean("isSuggestion").default(false).notNull(),

    // ── Verticals (phase 5) ───────────────────────────────────────────────
    //
    // What is at each END of this run, and how far the pipe travels up or down
    // to reach it. A traced line measures flat overhead distance only; these
    // are the drops and rises it cannot see. See shared/takeoffHeights.ts and
    // references/plan-viewer-overhaul.md § 5d.
    //
    // THE KIND IS STORED, THE HEIGHT IS NOT. A run remembers WHAT is at each
    // end forever; how high that thing sits is resolved live through
    // run → job → company → shipped every time a number is shown. Copying the
    // height down at trace time would freeze forty runs at whatever the setting
    // happened to say that afternoon, and changing the setting would then
    // silently stop re-pricing them.

    /**
     * The height type at the start — "panel", "receptacle", "distribution".
     *
     * NULL means nobody has said, and nothing is counted. That is DIFFERENT
     * from "distribution", which means the pipe carries straight on at run
     * height — an answer rather than an absence. Collapsing the two would hide
     * every unanswered run among the deliberate ones.
     */
    /**
     * What KIND of run this is — the palette entry it was traced under.
     *
     * ── Read live, not frozen ───────────────────────────────────────────────
     * Editing a type updates every run still pointing at it. A traced run is
     * measured work rather than money, and the freeze in this app belongs at
     * the moment something becomes a bid line (see `bid_line_items`), exactly
     * as an assembly stays live in the library and is frozen onto a bid. So
     * fixing a typo in "3/4in EMT" fixes it everywhere it has not been priced,
     * and moves nothing that has.
     *
     * `set null` on delete rather than cascade, and the difference matters
     * here more than anywhere: a run's POINTS are measured work that somebody
     * traced by hand. Losing the specification is recoverable; losing the
     * footage is not. Retiring is the intended path anyway — see
     * `takeoff_run_types.status`.
     */
    runTypeId: int("runTypeId").references(() => takeoffRunTypes.id, {
      onDelete: "set null",
    }),
    /**
     * What the type was called when this was traced. The FALLBACK, not the
     * answer.
     *
     * Read only when `runTypeId` is null — the live label wins while there is
     * one, which is what makes a rename propagate. Same two-step the counted
     * marks use (`stampName` in shared/takeoffCounts.ts), and it exists for
     * the same reason: a row whose library entry is gone must still be able to
     * say what it was, or a finished takeoff becomes unreadable.
     *
     * Deliberately NOT updated on rename. It is a record of what was traced,
     * and the moment it chases the live value it stops being a fallback and
     * becomes a second copy that can disagree.
     */
    runTypeLabel: varchar("runTypeLabel", { length: 255 }),

    startKind: varchar("startKind", { length: 64 }),
    endKind: varchar("endKind", { length: 64 }),

    /** This run's own elevations, in inches. NULL follows the setting. */
    startHeightInches: int("startHeightInches"),
    endHeightInches: int("endHeightInches"),
    /** This run does not sit at the job's run height. NULL follows it. */
    distributionHeightInches: int("distributionHeightInches"),

    /**
     * The stamp at each end, once the estimator has linked them.
     *
     * THE DOUBLE-COUNT RULE READS THESE. A vertical belongs to either the run
     * or the stamp and never both: a stamp a run claims does not carry its own
     * drop, because the run already did. Ownership is CLAIMED by a person
     * accepting the one-tap suggestion, never inferred from how close the two
     * happen to be — proximity is right most of the time and silently wrong the
     * rest, with nothing on screen looking wrong.
     *
     * `set null`: deleting a stamp must not delete the run or its vertical. The
     * run keeps its own end kind and goes on counting its drop.
     */
    startStampId: int("startStampId").references(() => takeoffStamps.id, {
      onDelete: "set null",
    }),
    endStampId: int("endStampId").references(() => takeoffStamps.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("takeoff_runs_bidId_idx").on(t.bidId),
    index("takeoff_runs_runTypeId_idx").on(t.runTypeId),
    index("takeoff_runs_sheetId_idx").on(t.sheetId),
    index("takeoff_runs_userId_idx").on(t.userId),
  ]
);

export type TakeoffRun = typeof takeoffRuns.$inferSelect;
export type InsertTakeoffRun = typeof takeoffRuns.$inferInsert;

/**
 * A circuit pulled through a run. Many circuits may share one run.
 *
 * This is the shared-run mechanism: the RUN is traced once and carries the
 * conduit footage; each circuit here carries its own wire footage, which is
 * the full run length times its own conductor count.
 */
export const takeoffRunCircuits = mysqlTable(
  "takeoff_run_circuits",
  {
    id: int("id").autoincrement().primaryKey(),
    runId: int("runId")
      .notNull()
      .references(() => takeoffRuns.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** "Ckt 12", "Panel A-3" — the estimator's own label. */
    name: varchar("name", { length: 255 }).notNull(),
    /**
     * Conductors pulled for THIS circuit through the run.
     *
     * Entered, never derived. Whether a circuit is 2 wires and a ground or
     * three phases and a neutral is something the estimator knows and the app
     * does not, and guessing it would put a wrong wire quantity on a bid.
     */
    conductorCount: int("conductorCount").default(3).notNull(),

    /**
     * Grounds pulled for this circuit. Usually one; two on an isolated ground.
     *
     * ── NULL is "not yet split", and it is load-bearing ──────────────────────
     * Nullable with no default, deliberately. While this is NULL the ground is
     * still counted inside `conductorCount` — the pre-0063 meaning — and
     * `shared/takeoffQuantities.ts` treats an absent ground as ZERO, so such a
     * row comes to exactly the footage it always did. A `DEFAULT 0` would have
     * made "not yet split" and "deliberately no ground" the same value, and
     * left the backfill unable to tell them apart on a second run.
     *
     * Always written by the app on a new circuit. Read through `circuitWire`,
     * which is the only place that turns a stored row into the shape the
     * arithmetic takes: three routers used to hand-map it, and every one of
     * them reported a circuit a conductor SHORT the moment the ground came out
     * of the count.
     */
    groundCount: int("groundCount"),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("takeoff_run_circuits_runId_idx").on(t.runId),
    index("takeoff_run_circuits_userId_idx").on(t.userId),
  ]
);

export type TakeoffRunCircuit = typeof takeoffRunCircuits.$inferSelect;
export type InsertTakeoffRunCircuit = typeof takeoffRunCircuits.$inferInsert;

// ─── Mounting heights and verticals (takeoff phase 5) ─────────────────────────
/**
 * The elevation the raceway actually runs at, for one company.
 *
 * ── This one number is the gate on the whole feature ─────────────────────────
 * A vertical is the distance between two elevations. Until this is set, only
 * one of them is ever known, so no drop and no rise is counted anywhere, on any
 * run, whatever the device heights say. Nothing appears in a bid that nobody
 * asked for, and a company that never opens this screen keeps counting exactly
 * what it counted before Phase 5 existed.
 *
 * ── "Distribution height", never "ceiling height" ────────────────────────────
 * The pipe may run at the ceiling, above it, or at the deck, and three people
 * will enter three different numbers under an ambiguous label. Ceiling height
 * stays out of the model entirely.
 *
 * ── Its own table rather than columns on pricing_defaults ────────────────────
 * A height is a MEASURING setting, not a money one. Keeping them apart means a
 * mistake here cannot reach overhead and profit, and it keeps `pricing_defaults`
 * — which is per trade — from implying that a distribution height is too.
 *
 * Inches, like every elevation in this feature: `formatFeetInches` displays it,
 * and 18" typed as `1.5` is the obvious mistake to design out.
 */
export const takeoffHeightDefaults = mysqlTable(
  "takeoff_height_defaults",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** NULL means never set, which is what keeps the gate shut. Not 0 — a run
     * at floor level is a real answer and has to be distinguishable from one
     * nobody has given. */
    distributionHeightInches: int("distributionHeightInches"),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [unique("takeoff_height_defaults_user_uq").on(t.userId)]
);

export type TakeoffHeightDefaults = typeof takeoffHeightDefaults.$inferSelect;
export type InsertTakeoffHeightDefaults =
  typeof takeoffHeightDefaults.$inferInsert;

/**
 * A company's own mounting heights: overrides of the shipped types, types they
 * added themselves, and types they have retired.
 *
 * ── The shipped types are NOT rows here, and that is the design ──────────────
 * `SHIPPED_HEIGHT_TYPES` in `shared/takeoffHeights.ts` is the last layer of the
 * resolver, read from code. So this table holds only what a company has
 * actually decided, and three things follow that are worth having:
 *
 *   - **A new shipped type reaches every company with no migration and no
 *     seed.** It appears the moment the code deploys.
 *   - **"Reset to the shipped value" is deleting a row**, not remembering a
 *     number that could drift from the one the app ships.
 *   - **There is no NULL-owner row**, so `unique(userId, typeKey)` actually
 *     protects what it claims to — MySQL ignores NULLs in a unique index, and
 *     an app-owned row with a NULL `userId` would have left the same hole
 *     `dedupeBaselineRows` exists to plug for materials.
 *
 * Reading is still ONE path: `resolveMountingHeight` merges this table with the
 * shipped list, and a company's own type behaves exactly like a shipped one —
 * same picker, same inheritance to job and run, same live re-pricing.
 *
 * ── Retire, never delete ─────────────────────────────────────────────────────
 * A run stores a type's KEY and resolves its height live. Deleting a type would
 * silently shorten every run pointing at it — the footage falls, nothing says
 * why, and the bid gets quietly cheaper. `isActive = false` takes it out of
 * every picker and keeps it resolving for runs that already use it, which is
 * `retireBaselineMaterials` applied to the same problem.
 */
export const takeoffMountingHeights = mysqlTable(
  "takeoff_mounting_heights",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /**
     * Which type this is about. A shipped key (`receptacle`) when it overrides
     * or retires one; a slug of the label (`exit-sign`) for the company's own.
     *
     * Named `typeKey` rather than `key` because KEY is reserved in MySQL, and a
     * column that only works while every query remembers to quote it is a trap
     * for the first person who writes raw SQL against this table.
     *
     * A rename keeps the key, so renaming a type never breaks a run using it.
     */
    typeKey: varchar("typeKey", { length: 64 }).notNull(),

    /**
     * What it is called. Blank for a row that only overrides a shipped type's
     * height — the shipped label still applies, and storing a copy would let
     * the two disagree after the shipped one is reworded.
     */
    label: varchar("label", { length: 64 }).notNull().default(""),

    /**
     * Inches from the finished floor. NULL means "no height set", which counts
     * no vertical and says so on screen.
     *
     * Negative is below the floor and is ordinary — an underground stub-up. The
     * UI asks for a positive DEPTH on those and applies the sign itself, because
     * `18` typed for a stub-up below slab is an 11.5 ft error.
     */
    heightInches: int("heightInches"),

    /** Retire, never delete. See the header. */
    isActive: boolean("isActive").default(true).notNull(),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    // One row per type per company. Safe as a real unique index precisely
    // because `userId` is NOT NULL here — see the header.
    unique("takeoff_mounting_heights_user_type_uq").on(t.userId, t.typeKey),
  ]
);

export type TakeoffMountingHeight = typeof takeoffMountingHeights.$inferSelect;
export type InsertTakeoffMountingHeight =
  typeof takeoffMountingHeights.$inferInsert;

/**
 * One job's mounting heights, where the job does not match the company's.
 *
 * A row exists only for a type actually overridden on this bid; absent means
 * "follow the company", never "set to nothing". Rows die with the bid.
 *
 * A job can override a height. It cannot invent a TYPE — a one-off belongs on
 * the run that needs it, and a type that exists on one bid and nowhere else is
 * a picker entry nobody can find again.
 */
export const bidMountingHeights = mysqlTable(
  "bid_mounting_heights",
  {
    id: int("id").autoincrement().primaryKey(),
    bidId: int("bidId")
      .notNull()
      .references(() => bids.id, { onDelete: "cascade" }),
    /** Denormalised for one-query ownership checks, as on bid_pdfs. */
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    typeKey: varchar("typeKey", { length: 64 }).notNull(),
    /** NOT NULL: a row here IS an override, so it always carries a number. */
    heightInches: int("heightInches").notNull(),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    unique("bid_mounting_heights_bid_type_uq").on(t.bidId, t.typeKey),
    index("bid_mounting_heights_userId_idx").on(t.userId),
  ]
);

export type BidMountingHeight = typeof bidMountingHeights.$inferSelect;
export type InsertBidMountingHeight = typeof bidMountingHeights.$inferInsert;

// ─── Counted groups (takeoff phase 6) ─────────────────────────────────────────
/**
 * The four levels of counting, from a plain tally to a full assembly.
 *
 *   plain     A typed name and nothing else. "Exit signs: 14." Never reaches
 *             the bid — it is a count, and the count is the whole feature.
 *   typed     A name with a dollar amount, and optionally hours, typed onto
 *             this job. A price that lives OUTSIDE the materials library.
 *   material  The count is that part, priced from the library and re-priced
 *             when the library moves. Materials carry no hours, so nor does
 *             this.
 *   assembly  What the stamp tool has always done: a priced recipe with hours,
 *             a role and modifiers behind it.
 *
 * Deliberately an ENUM and not the varchar treatment `trade` gets. A trade is
 * content, unlocked at the app layer so a new one needs no migration; these
 * four are the product's own design, and a fifth would be a decision rather
 * than a row. See references/plan-viewer-overhaul.md § 5e.
 */
export const TAKEOFF_GROUP_KINDS = [
  "plain",
  "typed",
  "material",
  "assembly",
] as const;
export type TakeoffGroupKind = (typeof TAKEOFF_GROUP_KINDS)[number];

/**
 * One counted THING on one bid — "exit signs", "the 2x4 troffers", "receptacles".
 *
 * ── Why this is a row and not columns on the stamps ──────────────────────────
 * Because a price is the same kind of fact as a mounting height, and § 7 of the
 * plan-viewer document already settled that one: "a vertical belongs to the
 * GROUP, not each stamp. Thirty receptacles in a room share one height, and
 * storing it thirty times is thirty places for it to disagree with itself."
 * Fourteen exit signs at $38 stored on fourteen marks is one number in fourteen
 * homes, and the first time thirteen of them are edited the count and the price
 * disagree with nothing on screen to say which is right.
 *
 * It also buys the thing the four levels exist FOR: attaching a price to a
 * count made last week, with every click intact. On this table that is an edit
 * to one row. On per-stamp columns it is a rewrite of fourteen, and the
 * tempting shortcut becomes asking the estimator to count them again.
 *
 * ── Per BID, not per sheet ───────────────────────────────────────────────────
 * Exit signs are one priced thing on the job even when they are marked on five
 * sheets. A group per sheet would be the same disagree-with-itself problem one
 * level up — five prices for one product — and the per-sheet panel still groups
 * by sheet for DISPLAY, which is a choice about presentation over one set of
 * rows rather than a second set of rows.
 *
 * ── What is null, and what that means ────────────────────────────────────────
 * Every source column is nullable and `kind` is what says which one is in play.
 * A plain group has all four empty; that is not an unfinished row, it is the
 * whole of level 1. The columns for levels 2 and 3 ship with this table rather
 * than in a later migration because they are the same feature at different
 * settings, and a nullable column nothing writes costs nothing.
 *
 * ── No unique constraint on the label, deliberately ──────────────────────────
 * Two groups on one bid should not share a name, and the router refuses it. It
 * is NOT a database constraint because of the backfill: existing takeoffs are
 * grouped by the assembly behind them, and two different assemblies with the
 * same snapshot name on one bid would make the migration fail on production —
 * a deploy stopped by a data shape nobody can see beforehand. A duplicate label
 * is a confusing panel; a failed migration is a bad morning.
 */
export const takeoffGroups = mysqlTable(
  "takeoff_groups",
  {
    id: int("id").autoincrement().primaryKey(),
    bidId: int("bidId")
      .notNull()
      .references(() => bids.id, { onDelete: "cascade" }),
    /** Denormalised for one-query ownership checks, as on takeoff_stamps. */
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** What the estimator calls it. The identity of a plain or typed group. */
    label: varchar("label", { length: 255 }).notNull(),
    kind: mysqlEnum("kind", TAKEOFF_GROUP_KINDS).default("plain").notNull(),

    /**
     * Level 4. Provenance only, and `set null` on delete for the same reason
     * bid lines do it: removing a library assembly must not alter a takeoff
     * that counted it. `label` holds the name, so the group stays readable.
     */
    assemblyId: int("assemblyId").references(() => assemblies.id, {
      onDelete: "set null",
    }),
    /** Level 3. Same treatment, same reason. */
    materialId: int("materialId").references(() => materials.id, {
      onDelete: "set null",
    }),

    /**
     * Level 2 — a price typed onto this job, for one of these.
     *
     * NULL means no price, which is level 1 and is a supported resting state.
     * Zero does NOT mean that: it means somebody typed zero, and the
     * unpriced-material rule in CLAUDE.md applies here as everywhere — a
     * plausible number nobody chose is the dangerous kind.
     */
    unitCost: decimal("unitCost", { precision: 12, scale: 4 }),
    /** Level 2, optional. Hours for one of these, before any modifier. */
    unitHours: decimal("unitHours", { precision: 10, scale: 4 }),
    /**
     * Which role does those hours. Only meaningful when `unitHours` is set,
     * and required by the router when it is: hours with no rate behind them
     * price at nothing while the bid still looks finished, which is the failure
     * the Bids screen already warns about for assemblies.
     */
    laborRateId: int("laborRateId").references(() => laborRates.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("takeoff_groups_bidId_idx").on(t.bidId),
    index("takeoff_groups_userId_idx").on(t.userId),
  ]
);

export type TakeoffGroup = typeof takeoffGroups.$inferSelect;
export type InsertTakeoffGroup = typeof takeoffGroups.$inferInsert;

// ─── Stamps (takeoff phase 2c) ────────────────────────────────────────────────
/**
 * One placed instance of an assembly on a sheet — a single click of the stamp
 * tool.
 *
 * ── One row per drop, not a quantity field ───────────────────────────────────
 * The alternative would be one row per assembly carrying a count. A row per
 * drop is what makes each instance individually selectable and removable, which
 * a misclick requires, and it is what lets the drawing show WHERE each one is.
 * The quantity an estimator wants is then just how many rows there are, derived
 * rather than stored — so a count can never drift from the marks on the plan.
 *
 * ── The mark carries POSITION. The group carries meaning ────────────────────
 * Added in phase 6. What is being counted — its name, and its price if it has
 * one — belongs to `takeoff_groups`, and a mark points at one. Before that, a
 * mark carried a snapshot of the assembly's name and the count was derived by
 * grouping on it, which works only while every count has an assembly behind it.
 *
 * `assemblyName` and `assemblyId` stay for rows written before phase 6 and for
 * the provenance they record. **`assemblyName` is nullable from phase 6 on**:
 * a plain count has no assembly and inventing a name for one would put the
 * group's label in two places, which is the disagreement the group row exists
 * to prevent. Readers take the label from the group and fall back to this
 * snapshot, in that order.
 *
 * The snapshot is still the right shape for what it holds, for the same reason
 * bid lines snapshot theirs: archiving or renaming an assembly later must not
 * make an existing takeoff unreadable.
 */
export const takeoffStamps = mysqlTable(
  "takeoff_stamps",
  {
    id: int("id").autoincrement().primaryKey(),
    bidId: int("bidId")
      .notNull()
      .references(() => bids.id, { onDelete: "cascade" }),
    sheetId: int("sheetId")
      .notNull()
      .references(() => bidPdfSheets.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /**
     * What is being counted. Null only on rows written before phase 6 and
     * backfilled since — see drizzle/0055_backfill_takeoff_groups.sql.
     *
     * `cascade` on delete, unlike the provenance columns below: deleting the
     * group IS deleting the count, and leaving fourteen orphan marks on a
     * drawing with nothing to say what they are would be worse than removing
     * them. The screen asks before it happens.
     */
    groupId: int("groupId").references(() => takeoffGroups.id, {
      onDelete: "cascade",
    }),

    /** Provenance. Null once the library assembly is gone; the name remains. */
    assemblyId: int("assemblyId").references(() => assemblies.id, {
      onDelete: "set null",
    }),
    /**
     * What it was called when it was dropped. Never re-read from the library.
     *
     * Nullable from phase 6: a plain count has no assembly, and the label lives
     * on the group. See the header.
     */
    assemblyName: varchar("assemblyName", { length: 255 }),
    /**
     * The assembly's Category at drop time — the System layer this mark belongs
     * to. Snapshotted for the same reason the name is: an archived or deleted
     * assembly must not make an existing takeoff unfilterable.
     */
    assemblyCategory: varchar("assemblyCategory", { length: 64 }),
    /**
     * WHERE this one sits. Null means the user has not said yet, which the
     * Location filter shows as its own "Unassigned" band rather than hiding.
     */
    location: mysqlEnum("location", TAKEOFF_LOCATIONS),

    /** Where it sits, in PDF PAGE POINTS — never screen pixels, which zoom. */
    x: decimal("x", { precision: 12, scale: 4 }).notNull(),
    y: decimal("y", { precision: 12, scale: 4 }).notNull(),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("takeoff_stamps_bidId_idx").on(t.bidId),
    index("takeoff_stamps_sheetId_idx").on(t.sheetId),
    index("takeoff_stamps_userId_idx").on(t.userId),
    index("takeoff_stamps_groupId_idx").on(t.groupId),
  ]
);

export type TakeoffStamp = typeof takeoffStamps.$inferSelect;
export type InsertTakeoffStamp = typeof takeoffStamps.$inferInsert;

// ─── Symbol → assembly links (takeoff phase 2c) ───────────────────────────────
/**
 * "This symbol on the legend means that assembly."
 *
 * ── Scope: the user's own library, not one bid ───────────────────────────────
 * Deliberately keyed to the USER and not to a bid or a sheet. An electrician
 * meets the same legend symbols on job after job, and the point of linking one
 * is that the next set of plans costs nothing to interpret. Scoping this per
 * bid would mean re-linking every symbol on every job, which is most of the
 * work the feature exists to remove.
 *
 * ASSEMBLIES_PLAN.md § TAKEOFF PAGE REDESIGN anticipates going further —
 * "legend memory per architect", so links learned on one firm's drawings carry
 * to the next set from the same firm. That needs a notion of who drew the plans,
 * which nothing captures yet. Per user is the widest scope available today and
 * is a strict subset of that, so nothing here has to be undone to get there.
 *
 * ── Identity comes from the user, not from image recognition ─────────────────
 * Reading a symbol off a drawing is the AI phase's job. Here the user boxes a
 * symbol on the legend and names it, and that name is the key. The stored crop
 * is only so they recognise it again.
 */
export const symbolLinks = mysqlTable(
  "symbol_links",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** What the user calls the symbol. Matched case-insensitively via `key`. */
    label: varchar("label", { length: 255 }).notNull(),
    /** Lower-cased, collapsed label — the thing uniqueness is judged on. */
    lookupKey: varchar("lookupKey", { length: 255 }).notNull(),

    /**
     * The assembly it means. Nullable on purpose: a symbol can be captured from
     * a legend and left unlinked, which is exactly the "which assembly does
     * this match?" state the first click resolves.
     */
    assemblyId: int("assemblyId").references(() => assemblies.id, {
      onDelete: "set null",
    }),

    /**
     * A small PNG data URL of the boxed region, so the legend panel shows the
     * symbol rather than only its name. Nullable — a link is still useful
     * without a picture, and the picture must never be what makes it work.
     */
    thumbnail: text("thumbnail"),

    /** Where it was first captured, for reference. Not a scoping key. */
    capturedFromSheetId: int("capturedFromSheetId").references(
      () => bidPdfSheets.id,
      { onDelete: "set null" }
    ),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("symbol_links_userId_idx").on(t.userId),
    index("symbol_links_lookupKey_idx").on(t.lookupKey),
  ]
);

export type SymbolLink = typeof symbolLinks.$inferSelect;
export type InsertSymbolLink = typeof symbolLinks.$inferInsert;

// ─── Plan co-pilot (AI plan reading) ──────────────────────────────────────────
/**
 * One reading of one sheet by the plan co-pilot.
 *
 * ── A row per sheet, kept, because reading costs money ───────────────────────
 * The feature reads a page when the user opens it, never the whole plan set up
 * front — a forty-sheet submission would otherwise bill forty model calls
 * before the estimator had looked at anything. A stored run is what makes that
 * work: paging back to a sheet returns what was found the first time instead of
 * paying to find it again. Re-reading is an explicit button.
 *
 * ── It holds findings, not decisions ─────────────────────────────────────────
 * Nothing in this table or its children is on the bid. A finding becomes real
 * work only when the user confirms it and a takeoff_stamps row is written
 * through the ordinary stamp path — see planCopilotRouter.confirm. That is the
 * "no autonomous edits" boundary, and it is why `stampId` below is nullable and
 * starts null on every row.
 */
export const COPILOT_RUN_STATUSES = ["ok", "degraded", "failed"] as const;
export type CopilotRunStatus = (typeof COPILOT_RUN_STATUSES)[number];

/**
 * The three confidence tiers, as a column type.
 *
 * Restated here rather than imported from shared/copilotConfidence.ts because
 * this file is read by drizzle-kit as well as by the app, and it stays free of
 * app imports for that reason (TAKEOFF_LOCATIONS and the rest do the same).
 * server/planCopilot.test.ts asserts the two lists are identical, so a tier
 * added on one side cannot silently fail to exist on the other.
 */
export const CONFIDENCE_TIER_VALUES = ["high", "low", "unreadable"] as const;

export const planCopilotRuns = mysqlTable(
  "plan_copilot_runs",
  {
    id: int("id").autoincrement().primaryKey(),
    bidId: int("bidId")
      .notNull()
      .references(() => bids.id, { onDelete: "cascade" }),
    sheetId: int("sheetId")
      .notNull()
      .references(() => bidPdfSheets.id, { onDelete: "cascade" }),
    /** Denormalised for one-query ownership checks, as everywhere else here. */
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /**
     * ok       — the sheet was read and the findings below are its result.
     * degraded — it was reached but gave back little or nothing usable. The run
     *            is still stored, so the panel can say so instead of looking
     *            like it never ran.
     * failed   — no key, a refusal, a timeout. Same reason for storing it.
     */
    status: mysqlEnum("status", COPILOT_RUN_STATUSES).default("ok").notNull(),

    /** Scope of work in prose, for the user's trade. Never priced, never parsed. */
    summary: text("summary"),
    /** Why a degraded or failed run gave up, in the user's words. */
    message: text("message"),

    /** Which model answered, so a change in behaviour is traceable to one. */
    model: varchar("model", { length: 128 }),
    /**
     * Which plan set this sheet belongs to, as shared/planSource.ts derives it.
     * Corrections are filed under the same key — this is what carries a fix
     * from one architect's sheet to the next.
     */
    sourceKey: varchar("sourceKey", { length: 191 })
      .default("unknown")
      .notNull(),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("plan_copilot_runs_bidId_idx").on(t.bidId),
    index("plan_copilot_runs_sheetId_idx").on(t.sheetId),
    index("plan_copilot_runs_userId_idx").on(t.userId),
  ]
);

export type PlanCopilotRun = typeof planCopilotRuns.$inferSelect;
export type InsertPlanCopilotRun = typeof planCopilotRuns.$inferInsert;

/**
 * One mark the co-pilot found on a sheet, and what became of it.
 *
 * ── Three confidence tiers, stored, not derived at display time ──────────────
 * `high` / `low` / `unreadable` — see shared/copilotConfidence.ts for why the
 * third one exists. It is stored rather than recomputed from `score` because
 * the tier is not a pure function of the score: an unlinked symbol is capped at
 * `low` however sure the model was, and an illegible mark is `unreadable` at
 * any score. Recomputing from the number alone would quietly promote both.
 *
 * An `unreadable` row carries no assemblyId and no proposal. It is a place on
 * the drawing to go and look at, and there is no action in the allowed list
 * that turns one into a stamp.
 */
export const COPILOT_FINDING_STATUSES = [
  "proposed",
  "confirmed",
  "dismissed",
  "needs_review",
] as const;
export type CopilotFindingStatus = (typeof COPILOT_FINDING_STATUSES)[number];

export const planCopilotFindings = mysqlTable(
  "plan_copilot_findings",
  {
    id: int("id").autoincrement().primaryKey(),
    runId: int("runId")
      .notNull()
      .references(() => planCopilotRuns.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** What the model called the mark. Kept verbatim — the correction keys on it. */
    rawLabel: varchar("rawLabel", { length: 255 }).notNull(),
    /** The legend entry it resolved to. Null when the label matched nothing. */
    symbolLinkId: int("symbolLinkId").references(() => symbolLinks.id, {
      onDelete: "set null",
    }),
    /** The assembly behind that legend entry, snapshotted the way a stamp is. */
    assemblyId: int("assemblyId").references(() => assemblies.id, {
      onDelete: "set null",
    }),
    assemblyName: varchar("assemblyName", { length: 255 }),

    confidence: mysqlEnum("confidence", CONFIDENCE_TIER_VALUES)
      .default("low")
      .notNull(),
    /** The model's own certainty, 0–1. Ordering and tooltips only. */
    score: decimal("score", { precision: 5, scale: 4 }).default("0").notNull(),
    /** Why it landed in that tier, in the user's words. */
    reason: varchar("reason", { length: 512 }),
    /** Anything the model added, e.g. "obscured by a dimension line". */
    note: varchar("note", { length: 512 }),

    /** Where on the sheet, in PDF PAGE POINTS. Null when it could not be placed. */
    x: decimal("x", { precision: 12, scale: 4 }),
    y: decimal("y", { precision: 12, scale: 4 }),

    status: mysqlEnum("status", COPILOT_FINDING_STATUSES)
      .default("proposed")
      .notNull(),
    /**
     * The stamp this became, once the user confirmed it.
     *
     * Null on every row until a person says yes. Deleting the stamp afterwards
     * sets this back to null rather than deleting the finding, so the panel can
     * still show what was proposed on a sheet someone has since cleaned up.
     */
    stampId: int("stampId").references(() => takeoffStamps.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("plan_copilot_findings_runId_idx").on(t.runId),
    index("plan_copilot_findings_userId_idx").on(t.userId),
    index("plan_copilot_findings_status_idx").on(t.status),
  ]
);

export type PlanCopilotFinding = typeof planCopilotFindings.$inferSelect;
export type InsertPlanCopilotFinding = typeof planCopilotFindings.$inferInsert;

/**
 * "This mark is really that symbol" — remembered, per user, per plan source.
 *
 * ── Per account, never pooled ────────────────────────────────────────────────
 * Scoped by userId exactly as materials, labor rates and assemblies are. One
 * contractor's corrections are their own: two estimators can legitimately read
 * the same ambiguous mark differently, and averaging them across accounts would
 * mean a stranger's opinion changes what your plans say.
 *
 * ── Why sourceKey and not bidId ──────────────────────────────────────────────
 * The value is in the NEXT set of plans from the same architect, not in the
 * rest of this one bid. sourceKey (shared/planSource.ts) is the widest honest
 * grouping available today — a firm name off the title block, falling back to
 * the filename — and it is a heuristic on purpose: a key that misses simply
 * means the hint is not consulted, and the reading falls back to the legend.
 *
 * `timesApplied` breaks ties when a user has corrected the same label two
 * different ways: the one they keep choosing wins.
 */
export const planCopilotCorrections = mysqlTable(
  "plan_copilot_corrections",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Which plan set this was learned on. See shared/planSource.ts. */
    sourceKey: varchar("sourceKey", { length: 191 })
      .default("unknown")
      .notNull(),
    /** Normalised form of what the model called it — the lookup key. */
    rawLabelKey: varchar("rawLabelKey", { length: 255 }).notNull(),
    /** Exactly what the model called it, for showing the user what they fixed. */
    rawLabel: varchar("rawLabel", { length: 255 }).notNull(),

    /** What the user said it really is. */
    symbolLinkId: int("symbolLinkId")
      .notNull()
      .references(() => symbolLinks.id, { onDelete: "cascade" }),

    timesApplied: int("timesApplied").default(1).notNull(),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("plan_copilot_corrections_userId_idx").on(t.userId),
    index("plan_copilot_corrections_sourceKey_idx").on(t.sourceKey),
    unique("plan_copilot_corrections_unique").on(
      t.userId,
      t.sourceKey,
      t.rawLabelKey
    ),
  ]
);

export type PlanCopilotCorrection = typeof planCopilotCorrections.$inferSelect;
export type InsertPlanCopilotCorrection =
  typeof planCopilotCorrections.$inferInsert;

// ─── Bid Line Items ───────────────────────────────────────────────────────────
/**
 * One assembly placed into a bid, at a quantity, with its cost SNAPSHOT.
 *
 * The snapshot is the point of this table (ASSEMBLIES_PLAN.md § PROJECT
 * ESTIMATES): the four pricing inputs are frozen when the line is added, so a
 * submitted bid never changes because a material price or labor rate moved
 * afterwards. `assemblyId` is kept for provenance only and is `set null` on
 * delete — deleting a library assembly must never alter a bid that used it.
 *
 * Only the raw INPUTS are stored, never a computed total. Every figure the UI
 * shows is recomputed from these through shared/pricing.ts, so a line can never
 * disagree with the engine that priced it.
 */
export const bidLineItems = mysqlTable(
  "bid_line_items",
  {
    id: int("id").autoincrement().primaryKey(),
    bidId: int("bidId")
      .notNull()
      .references(() => bids.id, { onDelete: "cascade" }),
    /** Provenance only. Null once the source assembly is gone. */
    assemblyId: int("assemblyId").references(() => assemblies.id, {
      onDelete: "set null",
    }),

    /** Assembly name at add time — the bid reads the same after a rename. */
    name: varchar("name", { length: 255 }).notNull(),
    qty: decimal("qty", { precision: 10, scale: 4 }).default("1").notNull(),

    /**
     * Which repeating unit this line belongs to, e.g. "Room 101". NULL for a
     * one-off line. Mass-duplicate copies a whole unit's lines under new labels.
     */
    unitLabel: varchar("unitLabel", { length: 128 }),

    /**
     * The kit this line came from, by NAME at add time — provenance for display,
     * never a live link. Deliberately not a foreign key: a kit is a shortcut for
     * adding several assemblies at once, and once they are on the bid each line
     * stands on its own and is separately editable. Renaming or deleting the kit
     * afterwards must not touch the bid.
     */
    sourceKitName: varchar("sourceKitName", { length: 255 }),

    /**
     * The counted group on the plans that this line came from — the bridge.
     *
     * ── This link is LIVE, and it is the only live thing on the line ────────
     * Set means the line is "from plans", and two facts follow it for as long
     * as it is set: the line's QUANTITY is the number of marks on the drawing,
     * and its NAME is whatever the count is called. Everything to do with money
     * stays frozen in the snapshot below, exactly as on every other line.
     *
     * The rule in one sentence, and every behaviour here falls out of it:
     * **the plans own what it is and how many, the bid owns what it costs.**
     *
     * ── Why the name follows and an assembly's does not ─────────────────────
     * `name` above is snapshotted so that renaming something in the LIBRARY
     * cannot change a bid behind the estimator's back. A group is not the
     * library — it is their own row, on this bid, that they made and they
     * renamed. Freezing it would leave the counted-items panel and the bid
     * calling one thing two different names, with neither wrong.
     *
     * ── Why there is no `fromPlans` boolean beside it ───────────────────────
     * A line is from the plans precisely when this is set. Read from the
     * absence, the same convention `takeoffRunTypesRouter.needsSpecification`
     * uses for a type with no material. A second flag is a second thing that
     * can disagree with the first.
     *
     * ── RESTRICT, and the two obvious answers that are both wrong ───────────
     * `set null` would leave a line with frozen costs and a quantity that
     * follows nothing, looking exactly like a line that is fine. `cascade`
     * would take money off a bid because somebody tidied a drawing. So deleting
     * a counted group that is on the bid is REFUSED, by the router in words and
     * by the constraint underneath it. See drizzle/0060.
     *
     * The unique index in that migration is the other half: one group holds at
     * most one live line, so a count cannot be sent to the bid twice (R3).
     */
    takeoffGroupId: int("takeoffGroupId").references(() => takeoffGroups.id, {
      onDelete: "restrict",
    }),

    // ── The snapshot: four inputs, frozen ──
    /** Material cost for ONE of this assembly. */
    snapshotMaterialCost: decimal("snapshotMaterialCost", {
      precision: 12,
      scale: 4,
    })
      .default("0")
      .notNull(),
    /** Base labor hours before modifiers. */
    snapshotLaborHours: decimal("snapshotLaborHours", {
      precision: 10,
      scale: 4,
    })
      .default("0")
      .notNull(),
    /** Summed modifier fraction, e.g. 0.32 for +32%. Already added, not compounded. */
    snapshotModifierPct: decimal("snapshotModifierPct", {
      precision: 6,
      scale: 4,
    })
      .default("0")
      .notNull(),
    /** Hourly cost of the role assigned at add time. */
    snapshotLaborRate: decimal("snapshotLaborRate", { precision: 10, scale: 4 })
      .default("0")
      .notNull(),
    /** Modifier names at add time, for showing why the hours are what they are. */
    snapshotModifierNames: json("snapshotModifierNames").$type<string[]>(),
    snapshotAt: timestamp("snapshotAt").defaultNow().notNull(),

    sortOrder: int("sortOrder").default(0).notNull(),

    /**
     * When this line was archived, or NULL if it is live — same single-column
     * shape as `bids.archivedAt`, and the same reason: a flag plus a date can
     * disagree, one column cannot. `archivedAt IS NULL` is the live test.
     *
     * It exists because of ONE operation: archiving a template's linked copies
     * in bulk. Removing 40 rooms in a single click is the most destructive
     * thing this screen can do, and a hard delete there is unrecoverable — the
     * snapshot that made every copy price identically would be gone with it.
     *
     * Deleting a SINGLE line stays a hard delete (`deleteBidLineItem`). One
     * line is cheap to re-add and the estimator is looking straight at it;
     * softening that would only leave hidden rows behind every ordinary edit.
     */
    archivedAt: timestamp("archivedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("bid_line_items_bidId_idx").on(t.bidId),
    index("bid_line_items_unitLabel_idx").on(t.unitLabel),
    index("bid_line_items_archivedAt_idx").on(t.archivedAt),
    // R3's first half, in the database: one counted group, at most one line.
    // MySQL allows many NULLs here, which is what lets every hand-added line on
    // every bid share the index without colliding. See drizzle/0060.
    unique("bid_line_items_bid_group_uq").on(t.bidId, t.takeoffGroupId),
  ]
);

export type BidLineItem = typeof bidLineItems.$inferSelect;
export type InsertBidLineItem = typeof bidLineItems.$inferInsert;

// ─── Unit template links ──────────────────────────────────────────────────────
/**
 * One row per GENERATED unit, recording which template it came from and whether
 * it is still following that template.
 *
 * ── Why a side table rather than columns on bid_line_items ───────────────────
 * A "unit" is not an entity in this schema — it is every line sharing a
 * `unitLabel`. Link state belongs to the unit, not the line, so putting it on
 * the line would mean N copies of one fact that can drift apart: half of
 * "Room 105" linked and half forked is a state with no meaning. One row per
 * unit cannot express it.
 *
 * Templates get NO row. A unit is a template because other units point at it,
 * which is derived rather than declared — so a template can never disagree
 * about being one, and a one-off line with a label is simply absent from here.
 *
 * ── Groups are not a relationship type ───────────────────────────────────────
 * Generating "Standard Room" ×35 and "ADA Room" ×5 in one action writes 40 rows
 * pointing at two different `templateLabel`s. Nothing records that the two
 * groups were created together, because nothing needs to: pushing an edit from
 * "ADA Room" finds its 5 rows and stops. Grouping is a property of one generate
 * ACTION, not of the data it leaves behind.
 *
 * ── forkedAt is the whole fork state ─────────────────────────────────────────
 * NULL means still linked. Set means the copy was edited directly and now
 * stands alone. Same single-column reasoning as every other timestamp here, and
 * the same fork-not-multiply rule the material library uses: editing a shipped
 * row gives you your own copy rather than changing everyone's.
 *
 * The link row is kept after forking rather than deleted, so the UI can still
 * say where a forked copy CAME from. It just stops receiving pushes.
 */
export const bidUnitLinks = mysqlTable(
  "bid_unit_links",
  {
    id: int("id").autoincrement().primaryKey(),
    bidId: int("bidId")
      .notNull()
      .references(() => bids.id, { onDelete: "cascade" }),

    /** The generated copy's unit label, e.g. "Room 102". */
    unitLabel: varchar("unitLabel", { length: 128 }).notNull(),
    /** The unit it was generated from, e.g. "Room 101". */
    templateLabel: varchar("templateLabel", { length: 128 }).notNull(),

    /** NULL while the copy follows its template; set the moment it is edited. */
    forkedAt: timestamp("forkedAt"),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("bid_unit_links_bidId_idx").on(t.bidId),
    index("bid_unit_links_templateLabel_idx").on(t.bidId, t.templateLabel),
    // One link row per unit per bid. Regenerating over an existing label must
    // collide here rather than quietly create a second, contradictory link.
    unique("bid_unit_links_bid_unit_uq").on(t.bidId, t.unitLabel),
  ]
);

export type BidUnitLink = typeof bidUnitLinks.$inferSelect;
export type InsertBidUnitLink = typeof bidUnitLinks.$inferInsert;

// ─── Kits ─────────────────────────────────────────────────────────────────────
/**
 * A named bundle of assemblies at fixed quantities — "Bedroom package" being
 * 4 receptacles, a switch and a light.
 *
 * ── Scope, deliberately narrow ───────────────────────────────────────────────
 *  • A kit holds ASSEMBLIES only, never raw materials. One level of nesting:
 *    Kit → Assemblies → Materials. No kits inside kits.
 *  • Quantities are set BY HAND from the estimator's own judgement. Nothing
 *    here derives a count from square footage, room dimensions or code spacing
 *    — that is a separate, much larger feature and is not being built.
 *  • A kit is a shortcut for adding several assemblies to a bid at once. It is
 *    not a thing that lives on the bid: adding one produces ordinary line
 *    items, each snapshotted and each independently editable afterwards.
 *
 * Same baseline/fork ownership as every other library table.
 */
export const kits = mysqlTable(
  "kits",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").references(() => users.id, { onDelete: "cascade" }),
    baselineId: int("baselineId"),
    baselineVersion: int("baselineVersion"),
    version: int("version").default(1).notNull(),

    name: varchar("name", { length: 255 }).notNull(),
    description: varchar("description", { length: 512 }),

    /**
     * Which trade's library this kit belongs to. Same varchar-not-enum
     * treatment as `assemblies.trade`, for the same reason.
     *
     * Trade-gated rather than shared, and it follows from what a kit IS: a
     * bundle of assemblies, and every assembly in it already carries a trade.
     * A "Bedroom package" of receptacles and a switch is electrical work in the
     * same sense its contents are, so it belongs behind the same unlock. A kit
     * mixing trades is possible — the column names the shelf it is filed on,
     * not a constraint on its contents — which is the same latitude a bid gets
     * from `bids.trades`.
     */
    trade: varchar("trade", { length: 64 })
      .default(TRADE_DEFAULT_TRADE_GATED)
      .notNull(),

    /** active / archived / deleted. See materials.status — same lifecycle. */
    status: mysqlEnum("status", LIBRARY_STATUSES).default("active").notNull(),
    archivedAt: timestamp("archivedAt"),

    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("kits_userId_idx").on(t.userId),
    index("kits_baselineId_idx").on(t.baselineId),
    index("kits_status_idx").on(t.status),
    index("kits_trade_idx").on(t.trade),
  ]
);

export type Kit = typeof kits.$inferSelect;
export type InsertKit = typeof kits.$inferInsert;

/** Which assemblies are in a kit, and how many of each. */
export const kitAssemblies = mysqlTable(
  "kit_assemblies",
  {
    id: int("id").autoincrement().primaryKey(),
    kitId: int("kitId")
      .notNull()
      .references(() => kits.id, { onDelete: "cascade" }),
    assemblyId: int("assemblyId")
      .notNull()
      .references(() => assemblies.id, { onDelete: "cascade" }),
    qty: decimal("qty", { precision: 10, scale: 4 }).default("1").notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
  },
  t => [
    index("kit_assemblies_kitId_idx").on(t.kitId),
    index("kit_assemblies_assemblyId_idx").on(t.assemblyId),
  ]
);

export type KitAssembly = typeof kitAssemblies.$inferSelect;
export type InsertKitAssembly = typeof kitAssemblies.$inferInsert;

// ─── Early access signups (marketing landing page) ────────────────────────────
/**
 * Somebody asked to be told when early access opens.
 *
 * ── Why this is a table and not an email to the owner ───────────────────────
 * A signup form that sends a thank-you and keeps no record is a form that has
 * lost every address typed into it. The landing page is the first impression
 * for every prospective user, and the list it collects is the only asset it
 * produces — so the address is stored, and there is an admin screen and a CSV
 * export that read it back (see server/routers/earlyAccessRouter.ts and the
 * Early access section of AdminSettingsPage).
 *
 * ── Deliberately outside the user tree ──────────────────────────────────────
 * Every other table in this schema hangs off `users` with a cascade delete.
 * This one does not, and must not: the whole point is that these people do not
 * have accounts yet. There is no userId to scope it by, which is also why the
 * procedure that writes it is the app's only public write and carries its own
 * validation and rate limit.
 *
 * `email` is unique, so signing up twice is idempotent rather than an error —
 * someone who forgets they already asked should be told they are on the list,
 * not shown a failure.
 */
export const earlyAccessSignups = mysqlTable(
  "early_access_signups",
  {
    id: int("id").autoincrement().primaryKey(),

    /** Lower-cased and trimmed before insert. 320 is the RFC ceiling. */
    email: varchar("email", { length: 320 }).notNull().unique(),

    /**
     * Which trade's landing page they came from.
     *
     * Stored from the first signup so that when a second trade launches, the
     * list can say who was waiting for what. Matches the `trade` axis on
     * assemblies and the ids in client/src/content/trades.
     */
    tradeId: varchar("tradeId", { length: 64 }).default("electrical").notNull(),

    /**
     * When they have been contacted, so the list can be worked through rather
     * than only read. NULL means not yet invited.
     */
    notifiedAt: timestamp("notifiedAt"),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("early_access_signups_createdAt_idx").on(t.createdAt),
    index("early_access_signups_tradeId_idx").on(t.tradeId),
  ]
);

export type EarlyAccessSignup = typeof earlyAccessSignups.$inferSelect;
export type InsertEarlyAccessSignup = typeof earlyAccessSignups.$inferInsert;

// ─── Feature Flags (RETIRED — nothing reads this) ─────────────────────────────
//
// Admin-controlled toggles that once gated features for the Contractor role.
// Feature availability is decided by ACCESS TIER now: `users.accessTier` against
// the FEATURES map in shared/permissions.ts, handed to the client through
// `company.me`. The admin screen that wrote these rows, its router and its query
// functions are gone; no code path reads the table.
//
// The table itself is kept ONLY so drizzle-kit does not generate a DROP TABLE.
// Deleting these lines queues a destructive migration that runs on the next
// `pnpm db:push` in Manus — which is fine to do deliberately, and a bad way to
// find out. Drop it in its own change, or leave it: an unread table costs
// nothing.
export const featureFlags = mysqlTable("feature_flags", {
  id: int("id").autoincrement().primaryKey(),
  flagKey: varchar("flagKey", { length: 128 }).notNull().unique(),
  label: varchar("label", { length: 255 }).notNull(),
  description: text("description"),
  enabledForContractors: boolean("enabledForContractors")
    .default(false)
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FeatureFlag = typeof featureFlags.$inferSelect;
export type InsertFeatureFlag = typeof featureFlags.$inferInsert;

// ─── Companies, members and invitations ───────────────────────────────────────
/**
 * Multi-user access. Read this whole block before changing anything in it.
 *
 * ── The data-scoping decision, and why it is not a companyId column ──────────
 * Every table in this app is filed under `userId`. The obvious way to add
 * companies is to put a `companyId` on all forty of them and rewrite every
 * query — and that is exactly the change that produces a half-migrated schema
 * where some tables are company-scoped and some are still user-scoped, which is
 * a data leak wearing a refactor's clothes.
 *
 * So a company does not re-file the data. It names an OWNER, and every member
 * reads and writes under that owner's user id. `scope.dataUserId` is that id,
 * resolved once per request. A brand-new user owns a company of one, where
 * their own id is the owner id, so every existing row and every existing query
 * is already correct and the migration touches no data.
 *
 * The failure mode if a query is ever missed is that a member sees NOTHING —
 * their own id owns no rows — rather than seeing someone else's. That direction
 * is deliberate, and `server/scopeDiscipline.test.ts` enforces it mechanically
 * rather than by review.
 *
 * ── Roles live on the membership, tiers live on the user ─────────────────────
 * `company_members.role` says what you may do here. `users.accessTier` says
 * which build of the product you see anywhere. See shared/permissions.ts.
 */
export const COMPANY_ROLE_VALUES = [
  "owner",
  "admin",
  "estimator",
  "viewer",
] as const;
export const MEMBER_STATUS_VALUES = ["active", "suspended"] as const;
export const ACCESS_TIER_VALUES = ["standard", "internal"] as const;

export const companies = mysqlTable(
  "companies",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    /**
     * The user whose id every row of this company's data is filed under.
     *
     * Not a convenience field — it IS the scoping key, and the reason there is
     * no `companyId` on forty other tables. Changing it moves the whole
     * company's data, so ownership transfer updates this and the two
     * memberships together or not at all.
     */
    ownerUserId: int("ownerUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [index("companies_ownerUserId_idx").on(t.ownerUserId)]
);

export type Company = typeof companies.$inferSelect;
export type InsertCompany = typeof companies.$inferInsert;

/**
 * One person's place in one company.
 *
 * `unique(companyId, userId)` is what stops a second membership row quietly
 * granting a second, higher role — the resolver takes one row, and two rows
 * would make which one it takes an accident of insertion order.
 *
 * A user may belong to several companies; `companyId` is chosen per request
 * (see companyScope.ts), never inferred from the data being touched.
 */
export const companyMembers = mysqlTable(
  "company_members",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", COMPANY_ROLE_VALUES).default("estimator").notNull(),
    /**
     * `suspended` keeps the row and removes the access. Deleting a membership
     * instead would lose who was in the company when a bid was priced, which is
     * the question asked after something goes wrong.
     */
    status: mysqlEnum("status", MEMBER_STATUS_VALUES)
      .default("active")
      .notNull(),
    invitedByUserId: int("invitedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    joinedAt: timestamp("joinedAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    unique("company_members_company_user_unique").on(t.companyId, t.userId),
    // The hot path: one indexed lookup per request resolves a user's scope.
    // Without this, sign-in cost grows with the number of memberships in the
    // system rather than with the number this user has.
    index("company_members_userId_idx").on(t.userId),
    index("company_members_companyId_idx").on(t.companyId),
  ]
);

export type CompanyMember = typeof companyMembers.$inferSelect;
export type InsertCompanyMember = typeof companyMembers.$inferInsert;

/**
 * An outstanding invitation to join a company.
 *
 * ── The code is stored hashed ────────────────────────────────────────────────
 * `codeHash` is a SHA-256 of the code the inviter shares, never the code
 * itself. There is no mail sender in this app, so the code travels by whatever
 * channel the contractor uses — and a readable invite column would mean anyone
 * with database access, or a leaked backup, could walk into any company. The
 * plaintext exists exactly once, in the response that creates it.
 *
 * Looked up BY hash, which is why the hash is the unique index: a lookup by
 * company followed by a comparison would need the plaintext to compare against.
 */
export const companyInvites = mysqlTable(
  "company_invites",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    /** Who it was meant for. Advisory — the code is what admits, not this. */
    email: varchar("email", { length: 320 }),
    role: mysqlEnum("role", COMPANY_ROLE_VALUES).default("estimator").notNull(),
    codeHash: varchar("codeHash", { length: 64 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    acceptedAt: timestamp("acceptedAt"),
    acceptedByUserId: int("acceptedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    revokedAt: timestamp("revokedAt"),
    createdByUserId: int("createdByUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    unique("company_invites_codeHash_unique").on(t.codeHash),
    index("company_invites_companyId_idx").on(t.companyId),
  ]
);

export type CompanyInvite = typeof companyInvites.$inferSelect;
export type InsertCompanyInvite = typeof companyInvites.$inferInsert;

// ─── Job close-out ────────────────────────────────────────────────────────────
/**
 * What a finished job actually took, recorded against the bid that estimated it.
 *
 * ── Optional, and structurally so ────────────────────────────────────────────
 * A bid with no close-out row behaves exactly as it did before this table
 * existed. Nothing joins to it on a required path, nothing counts it, and no
 * query in the bid layer is aware of it. That is the promise "closing out is
 * optional" has to be kept by — a nullable column on `bids` would have made
 * every bid query carry the concept.
 *
 * ── Shaped for the analytics that comes later ────────────────────────────────
 * The eventual dashboard will ask two kinds of question — "how are we doing
 * over time" and "which assemblies do we misjudge" — so the figures needed to
 * answer both are stored on the rows rather than derived by joining back
 * through bids and line items at query time. `estimatedHours` in particular is
 * SNAPSHOTTED: re-deriving it later would mean an assembly edited today
 * silently rewrites what a job in 2024 was estimated at, which would make the
 * whole history unusable as evidence.
 *
 * The indexes are chosen for those two questions: (userId, closedAt) for a time
 * series, and (userId, assemblyId) on the lines for per-assembly performance.
 */
export const CLOSEOUT_MODE_VALUES = ["total", "byAssembly"] as const;
export const SUGGESTION_STATUS_VALUES = [
  "pending",
  "accepted",
  "dismissed",
] as const;

export const bidCloseouts = mysqlTable(
  "bid_closeouts",
  {
    id: int("id").autoincrement().primaryKey(),
    /**
     * One close-out per bid. The unique constraint is the rule: a job finishes
     * once, and two rows would make "what did this take" ambiguous.
     */
    bidId: int("bidId")
      .notNull()
      .references(() => bids.id, { onDelete: "cascade" }),
    /** The company scope, same as every other table. See companyScope.ts. */
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /**
     * `total` — one figure for the job. `byAssembly` — the lines are the
     * answer and this row's total is their sum.
     *
     * Explicit rather than inferred from whether lines exist, so there is never
     * a typed total sitting beside lines that disagree with it.
     */
    mode: mysqlEnum("mode", CLOSEOUT_MODE_VALUES).default("total").notNull(),

    /** The single figure, in `total` mode. Null in `byAssembly` mode. */
    totalActualHours: decimal("totalActualHours", {
      precision: 10,
      scale: 2,
    }),

    /**
     * What the bid estimated, frozen at close-out.
     *
     * Snapshotted for the reason in the header: a comparison whose baseline
     * moves is not a comparison. This is the figure the variance is computed
     * against forever.
     */
    estimatedHours: decimal("estimatedHours", { precision: 10, scale: 2 })
      .default("0")
      .notNull(),

    /** When the job finished — the date the contractor picks, not the row's. */
    closedAt: timestamp("closedAt").defaultNow().notNull(),
    /** Anything worth remembering about why it went the way it did. */
    notes: text("notes"),

    /** Who recorded it. Provenance for a figure that will drive suggestions. */
    enteredByUserId: int("enteredByUserId").references(() => users.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    unique("bid_closeouts_bidId_unique").on(t.bidId),
    // The time-series index the future dashboard wants.
    index("bid_closeouts_userId_closedAt_idx").on(t.userId, t.closedAt),
  ]
);

export type BidCloseout = typeof bidCloseouts.$inferSelect;
export type InsertBidCloseout = typeof bidCloseouts.$inferInsert;

/**
 * One assembly's actual hours within a close-out.
 *
 * `assemblyId` is provenance and goes null if the library assembly is deleted;
 * `assemblyName` is the snapshot that keeps an old close-out readable, exactly
 * as bid line items and takeoff stamps do.
 *
 * `userId` is repeated here rather than reached through the close-out. That is
 * denormalisation on purpose: every per-assembly analytics question filters by
 * company first, and making it a join would put the scoping key one table away
 * from the rows being scanned — which is how a scoping mistake becomes possible
 * in the first place.
 */
export const bidCloseoutLines = mysqlTable(
  "bid_closeout_lines",
  {
    id: int("id").autoincrement().primaryKey(),
    closeoutId: int("closeoutId")
      .notNull()
      .references(() => bidCloseouts.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Null once the library assembly is gone. The name survives. */
    assemblyId: int("assemblyId").references(() => assemblies.id, {
      onDelete: "set null",
    }),
    assemblyName: varchar("assemblyName", { length: 255 }).notNull(),

    /** How many of the assembly the bid carried, at close-out. */
    qty: decimal("qty", { precision: 10, scale: 4 }).default("1").notNull(),
    /** The bid's estimate for this line, at quantity, frozen. */
    estimatedHours: decimal("estimatedHours", { precision: 10, scale: 2 })
      .default("0")
      .notNull(),
    /** What it took. */
    actualHours: decimal("actualHours", { precision: 10, scale: 2 })
      .default("0")
      .notNull(),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    index("bid_closeout_lines_closeoutId_idx").on(t.closeoutId),
    // "How does this assembly perform for this company" — the query the
    // suggestion engine runs, and the one the dashboard will run per assembly.
    index("bid_closeout_lines_userId_assemblyId_idx").on(
      t.userId,
      t.assemblyId
    ),
  ]
);

export type BidCloseoutLine = typeof bidCloseoutLines.$inferSelect;
export type InsertBidCloseoutLine = typeof bidCloseoutLines.$inferInsert;

/**
 * A proposal to change an assembly's base hours, and what the user did about it.
 *
 * ── Never applied by anything but a person ──────────────────────────────────
 * Writing this row changes nothing about the assembly. Accepting it is a
 * separate, explicit action that requires `library.edit` — because it edits the
 * shared inputs every future bid is built from. The same suggest-then-confirm
 * shape the alias suggestions and the plan co-pilot use.
 *
 * ── Scoped by company, even for a SHARED assembly ───────────────────────────
 * This is the subtle one. Starter assemblies have `userId = NULL` and are
 * visible to every company, so two contractors' close-outs can both reference
 * assembly 412. The suggestion is keyed by (userId, assemblyId) so one
 * company's field data can never produce a suggestion for another, and the
 * unique constraint is on the PAIR rather than on the assembly alone. Keying it
 * by assembly would have leaked one contractor's crew performance into another
 * contractor's library.
 *
 * `dismissed` is kept rather than deleted: a suggestion the user has already
 * said no to must not come back the next time the numbers are recomputed, and
 * the record of having asked is what prevents that.
 */
export const assemblyHourSuggestions = mysqlTable(
  "assembly_hour_suggestions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assemblyId: int("assemblyId")
      .notNull()
      .references(() => assemblies.id, { onDelete: "cascade" }),

    /** Snapshot of the library at the time, so a stale card reads honestly. */
    currentHours: decimal("currentHours", { precision: 10, scale: 4 })
      .default("0")
      .notNull(),
    suggestedHours: decimal("suggestedHours", { precision: 10, scale: 4 })
      .default("0")
      .notNull(),
    /** How many closed-out jobs it rests on, and how strongly they agree. */
    sampleSize: int("sampleSize").default(0).notNull(),
    ratio: decimal("ratio", { precision: 8, scale: 4 }).default("1").notNull(),

    status: mysqlEnum("status", SUGGESTION_STATUS_VALUES)
      .default("pending")
      .notNull(),
    respondedAt: timestamp("respondedAt"),
    respondedByUserId: int("respondedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    unique("assembly_hour_suggestions_user_assembly_unique").on(
      t.userId,
      t.assemblyId
    ),
    index("assembly_hour_suggestions_userId_status_idx").on(t.userId, t.status),
  ]
);

export type AssemblyHourSuggestion =
  typeof assemblyHourSuggestions.$inferSelect;
export type InsertAssemblyHourSuggestion =
  typeof assemblyHourSuggestions.$inferInsert;

// ─── AI usage ─────────────────────────────────────────────────────────────────

/**
 * One row per user, per UTC day, per feature: how many AI calls and what they
 * cost.
 *
 * ── Why a table and not just a log line ──────────────────────────────────────
 * Two jobs, and the second is why this exists. The daily limit needs a counter
 * that survives a restart, and a log file is not a counter. Having paid for the
 * counter, the cost total rides along for nothing — which turns "what is this
 * costing?" from a grep through a hosting provider's log viewer into a number
 * on the admin screen.
 *
 * ── What is deliberately NOT here ────────────────────────────────────────────
 * No prompt, no question, no sheet image, no extracted drawing text, no reply.
 * The point of the table is arithmetic, and keeping the content out means a
 * spend report can never become an accidental archive of what contractors
 * asked about their jobs. Token counts describe size and nothing else.
 */
export const aiUsageDaily = mysqlTable(
  "ai_usage_daily",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** `2026-09-16`, UTC. A string because it is only ever grouped and compared. */
    day: varchar("day", { length: 10 }).notNull(),
    /** `plan-read`, `navigation`, … — see shared/aiLimits.ts. */
    feature: varchar("feature", { length: 40 }).notNull(),
    /** The model id as sent, so a cost can be re-derived if a rate changes. */
    model: varchar("model", { length: 80 }).notNull(),

    calls: int("calls").default(0).notNull(),
    /**
     * BIGINT because tokens accumulate. A busy month of plan reading is tens
     * of millions, which fits an INT — but the same mistake as bid_pdfs.byteSize
     * costs an insert that fails at the end of a month rather than the start,
     * and there is no reason to find out the hard way twice.
     */
    inputTokens: bigint("inputTokens", { mode: "number" }).default(0).notNull(),
    outputTokens: bigint("outputTokens", { mode: "number" })
      .default(0)
      .notNull(),
    /** Millionths of a dollar. See shared/aiPricing.ts for why. */
    costMicros: bigint("costMicros", { mode: "number" }).default(0).notNull(),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => [
    // One row per user/day/feature/model, so recording a call is an upsert
    // rather than a read-then-write that two concurrent calls could both win.
    unique("ai_usage_daily_unique").on(t.userId, t.day, t.feature, t.model),
    // The limit check reads exactly this.
    index("ai_usage_daily_user_day_idx").on(t.userId, t.day),
    // The admin total reads this.
    index("ai_usage_daily_day_idx").on(t.day),
  ]
);

export type AiUsageDaily = typeof aiUsageDaily.$inferSelect;
export type InsertAiUsageDaily = typeof aiUsageDaily.$inferInsert;
