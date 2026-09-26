/**
 * The crew: who is in this company and what they can do.
 *
 * ── An invitation code is shown once ─────────────────────────────────────────
 * The server returns it exactly once, at creation, and stores only a hash. So
 * this screen keeps it on screen until dismissed and says plainly that it will
 * not be shown again — a code that quietly disappears from a list the user
 * assumed they could come back to is a support conversation.
 *
 * There is no mail sender in this app, so the code is copied and passed on
 * however the contractor already talks to their crew. That limitation is stated
 * rather than hidden behind a "Send invite" button that does not send anything.
 *
 * ── Everything here is also enforced server-side ─────────────────────────────
 * The role picker omits owner, an admin sees no controls against the owner, and
 * the whole management section is hidden without `members.manage`. None of that
 * is protection — see useCompany — it is the UI agreeing with what the server
 * will actually allow.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Check,
  Copy,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import {
  INVITABLE_ROLES,
  capabilitiesFor,
  type CompanyRole,
} from "@shared/permissions";

const ROLE_BLURB: Record<CompanyRole, string> = {
  owner: "Everything, including who else is here.",
  admin: "Everything except acting on the owner.",
  estimator: "Builds bids and the library. Cannot change pricing or people.",
  viewer: "Read-only.",
};

export default function TeamPage({ onBack }: { onBack?: () => void }) {
  const utils = trpc.useUtils();
  const access = useCompany();
  const canManage = access.can("members.manage");

  const { data: members = [], isLoading } = trpc.company.members.useQuery();
  const { data: invites = [] } = trpc.company.invites.useQuery(undefined, {
    enabled: canManage,
  });
  const { data: seats } = trpc.company.seats.useQuery();

  const [inviteRole, setInviteRole] = useState<CompanyRole>("estimator");
  const [inviteEmail, setInviteEmail] = useState("");
  /** The one moment the code exists in the clear. */
  const [freshCode, setFreshCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");

  // Every mutation on this screen goes through here, so the seat count is in
  // it: inviting, revoking, suspending and restoring all move it, and a count
  // left out of this list would state yesterday's number (CLAUDE.md § "A test
  // that calls the server cannot see a screen showing yesterday's answer").
  const refresh = () => {
    void utils.company.members.invalidate();
    void utils.company.invites.invalidate();
    void utils.company.seats.invalidate();
  };

  const invite = trpc.company.invite.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: data => {
      setFreshCode(data.code);
      setInviteEmail("");
      refresh();
    },
  });

  const revoke = trpc.company.revokeInvite.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: () => {
      toast.success("Invitation revoked.");
      refresh();
    },
  });

  const setRole = trpc.company.setRole.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: () => {
      toast.success("Role updated.");
      refresh();
    },
  });

  const setStatus = trpc.company.setStatus.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: () => refresh(),
  });

  /** The server's own refusal, shown before anyone clicks. Null while a seat is free. */
  const seatsFull = seats?.fullMessage ?? null;

  const accept = trpc.company.acceptInvite.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: data => {
      toast.success(`You have joined ${data.companyName}.`);
      setJoinCode("");
      // The whole app is now showing a different company's data.
      void utils.invalidate();
    },
  });

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-xs"
              onClick={onBack}
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </Button>
          )}
          <Users className="w-5 h-5 text-primary" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold">
              Crew{access.companyName ? ` — ${access.companyName}` : ""}
            </h1>
            <p className="text-xs text-muted-foreground">
              Who can get into this company's bids, library and pricing.
            </p>
          </div>
          {access.role && (
            <span className="text-xs text-muted-foreground shrink-0">
              You are {access.isOwner ? "the owner" : `an ${access.role}`}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 max-w-3xl">
        {/* ── The code, shown once ── */}
        {freshCode && (
          <div className="rounded-lg border border-[#F5C518]/40 bg-[#F5C518]/5 p-4 space-y-2">
            <div className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-[#F5C518] mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  Invitation code — copy it now
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  This is the only time it is shown. It is stored scrambled, so
                  nobody, including this screen, can read it back. Pass it on
                  however you normally reach your crew.
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 shrink-0"
                onClick={() => setFreshCode(null)}
                aria-label="Dismiss code"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-sm bg-background rounded px-3 py-2 border border-border select-all">
                {freshCode}
              </code>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 shrink-0"
                onClick={() => {
                  void navigator.clipboard.writeText(freshCode);
                  toast.success("Code copied.");
                }}
              >
                <Copy className="w-3.5 h-3.5" /> Copy
              </Button>
            </div>
          </div>
        )}

        {/* ── Invite ── */}
        {canManage && (
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold">Invite someone</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Creates a code that works once, for 14 days.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[12rem]">
                <label className="text-xs text-muted-foreground">
                  Email (optional — a note to yourself)
                </label>
                <Input
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="mike@example.com"
                  className="h-8 text-sm mt-1"
                />
              </div>
              <div className="w-44">
                <label className="text-xs text-muted-foreground">Role</label>
                <Select
                  value={inviteRole}
                  onValueChange={v => setInviteRole(v as CompanyRole)}
                >
                  <SelectTrigger className="h-8 text-sm mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INVITABLE_ROLES.map(role => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                className="h-8 gap-1.5"
                disabled={invite.isPending || seatsFull !== null}
                onClick={() =>
                  invite.mutate({
                    role: inviteRole as Exclude<CompanyRole, "owner">,
                    ...(inviteEmail.trim()
                      ? { email: inviteEmail.trim() }
                      : {}),
                  })
                }
              >
                <UserPlus className="w-3.5 h-3.5" /> Create code
              </Button>
            </div>
            {seatsFull ? (
              <p className="text-xs text-amber-500" role="status">
                {seatsFull}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {inviteRole}
                </span>{" "}
                — {ROLE_BLURB[inviteRole]}
              </p>
            )}
          </section>
        )}

        {/* ── Crew ── */}
        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold">
              In this company ({members.length})
            </h2>
            {/* Members plus pending invitations; suspended people hold no
                seat. The rule is shared/seats.ts. */}
            {seats && (
              <span
                className={cn(
                  "text-xs shrink-0",
                  seatsFull ? "text-amber-500" : "text-muted-foreground"
                )}
              >
                {seats.summary}
              </span>
            )}
          </div>
          {isLoading ? (
            <div className="h-20 rounded bg-muted/40 animate-pulse" />
          ) : (
            <div className="border border-border rounded-lg divide-y divide-border/60">
              {members.map(member => {
                // Your own row carries no controls: the server refuses a
                // self role change or self suspend, and showing the controls
                // anyway would just produce an error on click.
                const isSelf = member.userId === access.userId;
                return (
                  <div
                    key={member.id}
                    className="flex flex-wrap items-center gap-3 px-3 py-2.5"
                  >
                    <div className="flex-1 min-w-[10rem]">
                      <p className="text-sm">
                        {member.name ?? member.email ?? `User ${member.userId}`}
                        {member.accessTier === "internal" && (
                          <span className="ml-2 text-[0.65rem] uppercase tracking-wide text-[#F5C518]">
                            internal
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {member.email ?? "—"}
                      </p>
                    </div>

                    <span
                      className={cn(
                        "text-xs px-2 py-0.5 rounded border shrink-0",
                        member.status === "suspended"
                          ? "border-destructive/40 text-destructive"
                          : "border-border text-muted-foreground"
                      )}
                    >
                      {member.status === "suspended"
                        ? "suspended"
                        : member.role}
                    </span>

                    {canManage && member.role !== "owner" && !isSelf && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Select
                          value={member.role}
                          onValueChange={v =>
                            setRole.mutate({
                              userId: member.userId,
                              role: v as Exclude<CompanyRole, "owner">,
                            })
                          }
                        >
                          <SelectTrigger className="h-7 w-32 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {INVITABLE_ROLES.map(role => (
                              <SelectItem key={role} value={role}>
                                {role}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() =>
                            setStatus.mutate({
                              userId: member.userId,
                              status:
                                member.status === "suspended"
                                  ? "active"
                                  : "suspended",
                            })
                          }
                        >
                          {member.status === "suspended"
                            ? "Restore"
                            : "Suspend"}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Outstanding invitations ── */}
        {canManage && invites.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Invitations</h2>
            <div className="border border-border rounded-lg divide-y divide-border/60">
              {invites.map(item => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-3 py-2 text-sm"
                >
                  <span className="flex-1 min-w-0 truncate">
                    {item.email ?? "(no email noted)"}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {item.role}
                  </span>
                  <span className="text-xs shrink-0">
                    {item.acceptedAt ? (
                      <span className="text-emerald-400 inline-flex items-center gap-1">
                        <Check className="w-3 h-3" /> joined
                      </span>
                    ) : item.usable ? (
                      <span className="text-muted-foreground">
                        expires {new Date(item.expiresAt).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">expired</span>
                    )}
                  </span>
                  {item.usable && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs shrink-0"
                      onClick={() => revoke.mutate({ id: item.id })}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Join someone else's company ── */}
        <section className="space-y-2 pt-2 border-t border-border">
          <h2 className="text-sm font-semibold">Been given a code?</h2>
          <p className="text-xs text-muted-foreground">
            Joining another company switches what you see. Your own company and
            its bids stay exactly as they are.
          </p>
          <div className="flex items-center gap-2 max-w-md">
            <Input
              value={joinCode}
              onChange={e => setJoinCode(e.target.value)}
              placeholder="ABCDE-FGHJK-MNPQR-STVWX"
              className="h-8 text-sm font-mono"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={!joinCode.trim() || accept.isPending}
              onClick={() => accept.mutate({ code: joinCode.trim() })}
            >
              Join
            </Button>
          </div>
        </section>

        {/* ── What your role covers ── */}
        {access.role && (
          <section className="space-y-1.5 pt-2 border-t border-border">
            <h2 className="text-sm font-semibold">What your role covers</h2>
            <ul className="text-xs text-muted-foreground grid grid-cols-2 gap-x-6 gap-y-0.5">
              {capabilitiesFor(access.role).map(capability => (
                <li key={capability} className="font-mono">
                  {capability}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
