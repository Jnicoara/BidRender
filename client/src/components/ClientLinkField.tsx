/**
 * The client control on a bid: attach a record, make one, or take it off.
 *
 * ── It shows what the DOCUMENT will say, not what is attached ────────────────
 * A bid can name its client twice — a linked `clients` row, and the free text
 * typed onto the bid itself — and the rule is that the bid's own text wins
 * (@shared/bidClient). That produces one genuinely confusing state: a client is
 * attached and yet a different name prints. So this control never just shows
 * the link; it shows the resolved name and, when the two differ, says which one
 * the proposal uses and why.
 *
 * The judgement about which state is which lives in @/lib/clientPicker, which
 * calls the same resolver the proposal does. This component renders that
 * answer and does not compute its own.
 *
 * ── Optional, and it says so ─────────────────────────────────────────────────
 * `bids.clientId` is nullable and always will be. Nothing here nags, nothing
 * gates a bid on having one, and "No client" is a perfectly finished state
 * rather than an empty slot with a warning on it.
 */
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Building2,
  Check,
  ChevronDown,
  Plus,
  Search,
  User,
  UserPlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  clientSubtitle,
  describeClientLink,
  isCreatableClient,
  searchClients,
  type PickableClient,
} from "@/lib/clientPicker";
import { errorText } from "@/lib/errorText";

export function ClientLinkField({
  bid,
  client,
  onLink,
  disabled,
}: {
  bid: {
    id: number;
    clientId: number | null;
    clientName: string | null;
    siteAddress: string | null;
  };
  /** The linked record, or null. Comes from bids.get. */
  client: PickableClient | null;
  /** Attach a client, or pass null to take one off. */
  onLink: (clientId: number | null) => void;
  disabled?: boolean;
}) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  /**
   * The matches for what has been typed, found by the SERVER.
   *
   * This used to fetch every client and filter in the browser. It now sends the
   * term and takes one page back, so a contractor with two thousand customers
   * pays for the twenty rows shown rather than for all of them on every
   * keystroke. `keepPreviousData` stops the list flashing empty between
   * keystrokes, which is what makes a server-side picker feel like a local one.
   */
  const clients = trpc.clients.list.useQuery(
    { term: query.trim() || undefined, archived: false, pageSize: 20 },
    {
      // Only fetched once the picker is opened — a bid screen that never
      // touches the client field should not pull a customer list at all.
      enabled: open,
      placeholderData: previous => previous,
    }
  );

  const createClient = trpc.clients.create.useMutation({
    onSuccess: created => {
      if (!created) return;
      void utils.clients.list.invalidate();
      onLink(created.id);
      toast.success(`${created.name} added and attached.`);
      reset();
    },
    onError: e => toast.error(errorText(e)),
  });

  const reset = () => {
    setOpen(false);
    setQuery("");
    setCreating(false);
    setNewName("");
  };

  const description = useMemo(
    () => describeClientLink(bid, client),
    [bid, client]
  );

  // Already filtered and ordered by the query. `searchClients` is still used
  // by its own tests as the definition of what a match IS; the ranking it did
  // here is now the database's ORDER BY.
  const matches = clients.data?.items ?? [];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Client
        </span>
        {client && !disabled && (
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => onLink(null)}
          >
            Remove
          </button>
        )}
      </div>

      <Popover
        open={open}
        onOpenChange={next => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            className="h-auto w-full justify-between gap-2 px-3 py-2 text-left"
          >
            <span className="flex items-center gap-2 min-w-0">
              {client ? (
                client.kind === "company" ? (
                  <Building2 className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <User className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                )
              ) : (
                <UserPlus className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0">
                <span className="block text-sm truncate">
                  {client ? client.name : "No client attached"}
                </span>
                {client && clientSubtitle(client) && (
                  <span className="block text-xs text-muted-foreground truncate">
                    {clientSubtitle(client)}
                  </span>
                )}
              </span>
            </span>
            <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-80 p-0" align="start">
          {creating ? (
            <div className="p-3 space-y-2">
              <div className="text-xs font-medium">New client</div>
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Company or person's name"
                className="h-8 text-sm"
                aria-label="New client name"
                autoFocus
                onKeyDown={e => {
                  if (e.key === "Enter" && isCreatableClient({ name: newName }))
                    createClient.mutate({ name: newName.trim() });
                  if (e.key === "Escape") setCreating(false);
                }}
              />
              <p className="text-xs text-muted-foreground">
                A name is enough to start. Fill in the rest on the Clients
                screen whenever you like.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  disabled={
                    !isCreatableClient({ name: newName }) ||
                    createClient.isPending
                  }
                  onClick={() => createClient.mutate({ name: newName.trim() })}
                >
                  <Check className="w-3 h-3" /> Add and attach
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => setCreating(false)}
                >
                  <X className="w-3 h-3" /> Back
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="relative border-b border-border">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search clients…"
                  className="h-9 pl-9 border-0 focus-visible:ring-0 text-sm"
                  aria-label="Search clients"
                  autoFocus
                />
              </div>

              <div className="max-h-64 overflow-y-auto">
                {clients.isLoading ? (
                  <div className="px-3 py-4 text-xs text-muted-foreground">
                    Loading…
                  </div>
                ) : matches.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-muted-foreground">
                    {query
                      ? `Nothing matches “${query}”.`
                      : "No clients yet — add the first one below."}
                  </div>
                ) : (
                  matches.map(candidate => (
                    <button
                      key={candidate.id}
                      onClick={() => {
                        onLink(candidate.id);
                        reset();
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors flex items-center gap-2",
                        candidate.id === client?.id && "bg-muted/40"
                      )}
                    >
                      {candidate.kind === "company" ? (
                        <Building2 className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <User className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm truncate">
                          {candidate.name}
                        </span>
                        {clientSubtitle(candidate) && (
                          <span className="block text-xs text-muted-foreground truncate">
                            {clientSubtitle(candidate)}
                          </span>
                        )}
                      </span>
                      {candidate.id === client?.id && (
                        <Check className="w-3.5 h-3.5 shrink-0 text-[#F5C518]" />
                      )}
                    </button>
                  ))
                )}
              </div>

              <div className="border-t border-border p-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-full justify-start gap-2 text-xs"
                  onClick={() => {
                    // Carry whatever was typed into the search across — it is
                    // almost always the name they were looking for and did not
                    // find.
                    setNewName(query);
                    setCreating(true);
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  {query
                    ? `Add “${query}” as a new client`
                    : "Add a new client"}
                </Button>
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>

      {/* The one state worth explaining: a record is attached, and something
          else prints. Said in terms of what to DO about it. */}
      {description.status === "overridden" && description.supersededName && (
        <p className="text-xs text-muted-foreground">
          This bid prints{" "}
          <span className="text-foreground">{description.effectiveName}</span>,
          typed on the Proposal screen. Clear that field to use{" "}
          {description.supersededName}.
        </p>
      )}
      {description.status === "filling" && (
        <p className="text-xs text-muted-foreground">
          The proposal will be addressed to this client.
        </p>
      )}
      {description.status === "typed-only" && (
        <p className="text-xs text-muted-foreground">
          This bid prints{" "}
          <span className="text-foreground">{description.effectiveName}</span>,
          typed on the Proposal screen. Attaching a client does not change that.
        </p>
      )}
    </div>
  );
}
