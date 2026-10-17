/**
 * Field and Co-owner, as rules (references/field-and-coowner-plan.md).
 * Pure: the roles are not storable until FR-M1, but every rule that will read
 * them is written now and pinned here.
 */
import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  ROLE_RANK,
  capabilitiesFor,
  mayGrant,
  outranks,
} from "../shared/permissions";

describe("Field holds plans.view and nothing else", () => {
  it("has exactly one capability", () => {
    expect(capabilitiesFor("field")).toEqual(["plans.view"]);
  });

  it("every other role can see plans too, so opening a read takes nothing away", () => {
    for (const role of ROLE_RANK)
      expect(capabilitiesFor(role)).toContain("plans.view");
  });
});

describe("Co-owner", () => {
  it("can do everything the owner can", () => {
    expect([...capabilitiesFor("coowner")].sort()).toEqual(
      [...CAPABILITIES].sort()
    );
  });

  it("sits under the owner and over an admin; co-owners are equals", () => {
    expect(outranks("owner", "coowner")).toBe(true);
    expect(outranks("coowner", "owner")).toBe(false);
    expect(outranks("coowner", "admin")).toBe(true);
    expect(outranks("coowner", "coowner")).toBe(false);
    expect(outranks("viewer", "field")).toBe(true);
  });
});

describe("nobody hands out a role above their own", () => {
  it("an admin cannot make a co-owner; the owner and a co-owner can", () => {
    expect(mayGrant("admin", "coowner")).toBe(false);
    expect(mayGrant("owner", "coowner")).toBe(true);
    expect(mayGrant("coowner", "coowner")).toBe(true);
    expect(mayGrant("admin", "admin")).toBe(true);
    expect(mayGrant("admin", "field")).toBe(true);
  });

  it("nobody can hand out owner — that is a transfer", () => {
    for (const actor of ROLE_RANK) expect(mayGrant(actor, "owner")).toBe(false);
  });
});
