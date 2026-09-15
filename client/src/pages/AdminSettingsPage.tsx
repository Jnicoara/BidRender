/**
 * Platform administration — for whoever runs BidRender, not for a contractor.
 *
 * ── What used to be here, and why it went ────────────────────────────────────
 * This screen's main section was a Feature Flags panel: a list of toggles
 * writing `feature_flags.enabledForContractors`, described on screen as
 * controlling "which features are visible to the Contractor role".
 *
 * Nothing read that table. Feature availability is decided by ACCESS TIER now —
 * `users.accessTier` against the `FEATURES` map in shared/permissions.ts, handed
 * to the client through `company.me` as `scope.features`. The toggles changed
 * no user's experience, while claiming on the page that they took effect
 * immediately. A control that lies about doing something is worse than no
 * control: it gets trusted, and then a feature is "switched off" that is still
 * on for everybody.
 *
 * So the panel is gone rather than reworded. The equivalent lever is
 * `company.setAccessTier`, which has no UI yet — moving one account to
 * `internal` is a query against the `users` row today.
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { Shield, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import EarlyAccessSignups from "@/components/EarlyAccessSignups";

export default function AdminSettingsPage() {
  const { user } = useAuth();

  // Guard — only admins should ever reach this page, but double-check
  if (user?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
        <AlertTriangle className="w-12 h-12 text-destructive/60" />
        <p className="text-lg font-semibold">Admins only</p>
        <p className="text-sm text-muted-foreground">
          This screen is for whoever runs BidRender, not for your company's
          account.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Admin</h1>
            <p className="text-xs text-muted-foreground">
              Early access signups, and what each platform role can reach.
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {/* First, because it is the one section here with new information in it
            on any given day. */}
        <EarlyAccessSignups />

        {/* Role reference */}
        <div>
          <h2 className="text-sm font-semibold mb-3">Platform roles</h2>
          <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
            <div className="px-5 py-3 flex items-start gap-3">
              <Badge className="bg-primary/20 text-primary border-primary/30 shrink-0 mt-0.5">
                admin
              </Badge>
              <div>
                <p className="text-xs font-medium">Administrator</p>
                <p className="text-xs text-muted-foreground">
                  BidRender staff. Reaches this screen and the platform-wide
                  routes behind it.
                </p>
              </div>
            </div>
            <div className="px-5 py-3 flex items-start gap-3">
              <Badge variant="outline" className="shrink-0 mt-0.5">
                contractor
              </Badge>
              <div>
                <p className="text-xs font-medium">Contractor</p>
                <p className="text-xs text-muted-foreground">
                  A customer account. What they may do inside their own company
                  is their company role — owner, estimator or viewer — not this.
                </p>
              </div>
            </div>
            <div className="px-5 py-3 flex items-start gap-3">
              <Badge
                variant="outline"
                className="text-muted-foreground shrink-0 mt-0.5"
              >
                user
              </Badge>
              <div>
                <p className="text-xs font-medium">User (legacy)</p>
                <p className="text-xs text-muted-foreground">
                  Treated identically to Contractor. New signups still default
                  to this role.
                </p>
              </div>
            </div>
          </div>
          {/* The axis people reach for this screen looking for, and the one
              place it is honest to point them at. */}
          <p className="text-xs text-muted-foreground mt-2">
            Unreleased features are a separate axis — an account's access tier,
            standard or internal, against the feature list in
            shared/permissions.ts. There is no control for it here yet.
          </p>
        </div>

        {/* Signed-in admin info */}
        <div className="rounded-xl border border-border bg-card px-5 py-4">
          <p className="text-xs text-muted-foreground">
            Signed in as{" "}
            <strong className="text-foreground">
              {user?.email ?? user?.name}
            </strong>{" "}
            <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">
              admin
            </Badge>
          </p>
        </div>
      </div>
    </div>
  );
}
