/**
 * Resolving, once per request, whose data this request may touch.
 *
 * ── This file is the access-control boundary ─────────────────────────────────
 * Everything downstream trusts `scope.dataUserId` completely. If it is wrong,
 * every ownership check in the app is wrong at the same time, in the same
 * direction, silently. So the rules here are absolute:
 *
 *   • It is derived from the AUTHENTICATED user id and nothing else. No
 *     header, no query parameter, no request body, and no id the client sent
 *     ever reaches it. A client-supplied company id would be an
 *     access-control bypass with a friendly name.
 *
 *   • It fails CLOSED. A user with no usable membership gets an error, never a
 *     fallback to their own id. A fallback would look like it worked and would
 *     silently split a company's data in two.
 *
 *   • A suspended membership resolves to nothing. Suspension has to bite on the
 *     next request, not the next login, or removing someone's access means
 *     asking them to log out.
 *
 * ── Why a lazy create is here as well as in the migration ────────────────────
 * The migration gives every existing account a company. This handles the
 * accounts that do not exist yet: `sdk.authenticateRequest` provisions a user
 * row on first OAuth login, and that user needs a company before their first
 * query. Doing it here rather than in the SDK keeps the platform scaffolding
 * untouched.
 *
 * The create is racy by nature — a brand-new session's first screen sends
 * several requests together — so it runs under a per-user named lock and
 * re-checks inside it. It used to "tolerate the duplicate" instead, but there
 * was no key to collide on, and one live user got five companies
 * (createPersonalCompany, 2026-10-14).
 *
 * ── Cost at scale ────────────────────────────────────────────────────────────
 * One indexed lookup per request on `company_members(userId)`, joined to
 * `companies`. It does not scan, and it does not grow with the number of
 * companies in the system — only with the number this user belongs to, which
 * is one for almost everybody. There is no per-request scan of members, and
 * nothing here loads a company's member list to answer a question about one
 * person.
 */
import { and, eq, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  companies,
  companyMembers,
  users,
  type User,
} from "../../drizzle/schema";
import {
  capabilitiesFor,
  featuresFor,
  type AccessTier,
  type Capability,
  type CompanyRole,
  type FeatureId,
} from "../../shared/permissions";
import { getDb, withNamedLock } from "../db";
import { AI_FEATURE_IDS, aiFeaturesEnabled } from "../aiFeatures";
import { isStarterEditor } from "../starterEditor/role";

/**
 * Everything a request is allowed to do, resolved from the session alone.
 *
 * `dataUserId` is the only field that decides WHICH rows; the rest decide
 * WHETHER. Keeping them in one object makes it hard to check one and forget
 * the other.
 */
export type RequestScope = {
  companyId: number;
  companyName: string;
  /** The user id every data query filters on. See the schema block. */
  dataUserId: number;
  /** The acting user's id. Differs from dataUserId for anyone but the owner. */
  actorUserId: number;
  role: CompanyRole;
  accessTier: AccessTier;
  capabilities: readonly Capability[];
  features: readonly FeatureId[];
  /** True when the actor is the company owner — the only single-seat role. */
  isOwner: boolean;
};

/**
 * The membership this user acts under.
 *
 * A user can belong to more than one company — a sub who joined a GC's company
 * still has their own — so something has to choose. The choice is
 * `users.activeCompanyId`, a stored preference on the USER, and never anything
 * the client sends: a company id off the request would let a member name
 * someone else's company and be authorised against their own role in their own.
 *
 * Ordered by id so the fallback is stable rather than an accident of row order.
 */
async function findMembership(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select({
      companyId: companies.id,
      companyName: companies.name,
      ownerUserId: companies.ownerUserId,
      role: companyMembers.role,
      status: companyMembers.status,
      // Read here, from the database, rather than taken from the session
      // object. The session was built when the request arrived and may predate
      // a company switch made moments ago; joining it into the same query keeps
      // the preference fresh at no extra round trip. It also means no caller
      // can influence which company is chosen by handing over a stale user.
      preferredCompanyId: users.activeCompanyId,
    })
    .from(companyMembers)
    .innerJoin(companies, eq(companyMembers.companyId, companies.id))
    .innerJoin(users, eq(users.id, companyMembers.userId))
    .where(
      and(
        eq(companyMembers.userId, userId),
        eq(companyMembers.status, "active")
      )
    )
    .orderBy(asc(companyMembers.id))
    .limit(50);

  if (rows.length === 0) return undefined;
  // The user's chosen company wins when they still have access to it. Falling
  // back to the oldest membership rather than erroring means losing access to
  // the company you were last in drops you back to your own, instead of
  // locking you out of the app entirely.
  const preferred = rows[0].preferredCompanyId;
  return rows.find(row => row.companyId === preferred) ?? rows[0];
}

/**
 * Does this user have ANY membership, active or not?
 *
 * Asked before creating a personal company, and the distinction matters: a
 * SUSPENDED member has a membership. Without this check they would fall
 * through to the create path and be handed a brand-new empty company of their
 * own — which looks like the app working, so nobody reports it, and the
 * suspension has quietly done nothing. Found by an adversarial test.
 */
async function hasAnyMembership(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [row] = await db
    .select({ id: companyMembers.id })
    .from(companyMembers)
    .where(eq(companyMembers.userId, userId))
    .limit(1);
  return Boolean(row);
}

/**
 * Give a brand-new account the company of one it needs before its first query
 * — exactly ONE, however many first requests arrive at once.
 *
 * The guard is a MySQL named lock per user, and the membership check is asked
 * again INSIDE it. The first request to get the lock creates the company; every
 * request queued behind it finds that membership on its re-check and creates
 * nothing. One database, so the lock holds across app instances too.
 *
 * This used to catch a duplicate key and say "another request for the same new
 * user got there first". No key could collide: the only unique index is
 * (companyId, userId), and each racing request inserted its OWN company, so
 * every insert succeeded. User 3036 got five companies in one second on live
 * (2026-10-14). server/personalCompanyRace.test.ts fires eight first requests
 * at once and fails without the lock.
 *
 * Company and membership go in one transaction, so a failure between them
 * cannot leave a company with nobody in it.
 *
 * Lock timeout: the holder's work is two inserts, so 10 s is only reached if
 * the database is in trouble. Then this creates nothing and returns whatever
 * membership exists — none means the caller fails closed, and the next request
 * tries again. It never creates without the lock.
 */
async function createPersonalCompany(user: User) {
  const name = user.name?.trim() ? user.name.trim() : "My company";
  await withNamedLock(`personal-company:${user.id}`, 10, async lockedDb => {
    const [existing] = await lockedDb
      .select({ id: companyMembers.id })
      .from(companyMembers)
      .where(eq(companyMembers.userId, user.id))
      .limit(1);
    if (existing) return;
    await lockedDb.transaction(async tx => {
      const [inserted] = await tx
        .insert(companies)
        .values({ name, ownerUserId: user.id });
      await tx.insert(companyMembers).values({
        companyId: inserted.insertId,
        userId: user.id,
        role: "owner",
        status: "active",
      });
    });
  });
  return findMembership(user.id);
}

/**
 * The scope for an authenticated user, or an error.
 *
 * Takes the User ROW rather than an id, so there is no path where a caller
 * passes an id it merely believes is authenticated.
 */
export async function resolveScope(user: User): Promise<RequestScope> {
  // The starter editor never works inside a company. Without this it would
  // be PROVISIONED one below (it has never belonged anywhere), which is the
  // opposite of failing closed. Asked first, before any query.
  if (isStarterEditor(user)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "The starter editor account has no company.",
    });
  }

  let membership = await findMembership(user.id);

  // Only provision for someone who has never belonged anywhere. A suspended
  // member HAS a membership, and must be refused rather than handed a fresh
  // company that would make the suspension a no-op.
  if (!membership && !(await hasAnyMembership(user.id))) {
    membership = await createPersonalCompany(user);
  }

  if (!membership) {
    // Fail closed. The alternative — falling back to the user's own id — would
    // hand them a private, invisible copy of the app and look like success.
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "This account is not part of a company yet, or its access has been suspended. Ask whoever runs the company to check.",
    });
  }

  const role = membership.role as CompanyRole;
  const accessTier = user.accessTier as AccessTier;

  return {
    companyId: membership.companyId,
    companyName: membership.companyName,
    dataUserId: membership.ownerUserId,
    actorUserId: user.id,
    role,
    accessTier,
    capabilities: capabilitiesFor(role),
    // AI-backed features are withheld while this server has AI switched off,
    // so the client never offers something that cannot work.
    features: featuresFor(accessTier).filter(
      id =>
        aiFeaturesEnabled() ||
        !(AI_FEATURE_IDS as readonly string[]).includes(id)
    ),
    isOwner: membership.ownerUserId === user.id && role === "owner",
  };
}
