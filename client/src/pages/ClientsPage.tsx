/**
 * ClientsPage — who the work is for (Workspace § Clients).
 *
 * ── Why Workspace and not Library ────────────────────────────────────────────
 * The Library is building blocks: materials, labor rates, assemblies, kits —
 * things a bid is assembled FROM, curated once and reused. A client is not a
 * building block, it is the other party. It belongs beside Bids, which is what
 * it is attached to, and that is where the nav puts it.
 *
 * ── Removal is archiving, as everywhere else ─────────────────────────────────
 * Same pattern as Materials, Assemblies, Modifiers and Kits: the working list
 * offers Archive, the Archived view offers Restore. There is deliberately no
 * Delete Forever here, unlike those screens — destroying a client row would
 * null `clientId` on every bid that pointed at it (the FK is `set null`), which
 * unpicks the quoting history the record exists to hold. Nothing expires
 * either: a client is a name and a phone number, so keeping one costs nothing.
 *
 * ── Responsiveness (CLAUDE.md § Responsiveness) ──────────────────────────────
 * Create, edit, archive and restore apply optimistically — the list updates on
 * commit and the mutation goes out behind it. The list is not paginated, which
 * is the same judgement `searchClients` documents: a contractor's customer list
 * is tens of rows. If that changes this needs a cursor query, not a `.slice()`.
 */
import { useCallback, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Archive,
  ArchiveRestore,
  Building2,
  Check,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  User,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { searchClients, isCreatableClient } from "@/lib/clientPicker";

type ClientKind = "company" | "individual";

type Draft = {
  name: string;
  kind: ClientKind;
  contactName: string;
  address: string;
  phone: string;
  email: string;
  notes: string;
};

const emptyDraft: Draft = {
  name: "",
  kind: "company",
  contactName: "",
  address: "",
  phone: "",
  email: "",
  notes: "",
};

/** "" and null both mean "not entered" — collapse before sending. */
const orNull = (value: string) => value.trim() || null;

/**
 * The create / edit form.
 *
 * One component for both so a client cannot be creatable with fields that are
 * not editable afterwards, or the reverse — the drift that produces a record
 * you can set up but never correct.
 */
function ClientForm({
  draft,
  setDraft,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  draft: Draft;
  setDraft: (draft: Draft) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const patch = (part: Partial<Draft>) => setDraft({ ...draft, ...part });
  const canSubmit = isCreatableClient(draft);

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={draft.kind}
          onValueChange={kind => patch({ kind: kind as ClientKind })}
        >
          <SelectTrigger className="h-8 w-36 text-sm" aria-label="Client type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="company">Company</SelectItem>
            <SelectItem value="individual">Individual</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={draft.name}
          onChange={e => patch({ name: e.target.value })}
          className="h-8 flex-1 min-w-[14rem] text-sm"
          placeholder={
            draft.kind === "company"
              ? "Company name — e.g. Harbour Construction Group"
              : "Name — e.g. Sam Whitfield"
          }
          aria-label="Client name"
          autoFocus
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {/* Meaningless for an individual, whose name is already the name. */}
        {draft.kind === "company" && (
          <Input
            value={draft.contactName}
            onChange={e => patch({ contactName: e.target.value })}
            className="h-8 text-sm"
            placeholder="Contact person (optional)"
            aria-label="Contact person"
          />
        )}
        <Input
          value={draft.phone}
          onChange={e => patch({ phone: e.target.value })}
          className="h-8 text-sm"
          placeholder="Phone (optional)"
          aria-label="Phone"
        />
        <Input
          value={draft.email}
          onChange={e => patch({ email: e.target.value })}
          className="h-8 text-sm"
          placeholder="Email (optional)"
          aria-label="Email"
          type="email"
        />
      </div>

      <Textarea
        value={draft.address}
        onChange={e => patch({ address: e.target.value })}
        className="text-sm min-h-[3.5rem]"
        placeholder={"Address (optional)\n88 Water St, Unit 4"}
        aria-label="Address"
      />
      {/* Said plainly, because the two addresses are easy to conflate and
          getting it wrong is what would put the wrong tax on a bid later. */}
      <p className="text-xs text-muted-foreground -mt-1">
        Where the client is. The job address is set per bid — one client can
        have work in several places.
      </p>

      <Textarea
        value={draft.notes}
        onChange={e => patch({ notes: e.target.value })}
        className="text-sm min-h-[3rem]"
        placeholder="Notes for yourself (optional). Never printed on a proposal."
        aria-label="Notes"
      />

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={onSubmit}
          disabled={!canSubmit}
        >
          <Check className="w-3 h-3" /> {submitLabel}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5 text-xs"
          onClick={onCancel}
        >
          <X className="w-3 h-3" /> Cancel
        </Button>
        {!canSubmit && (
          <span className="text-xs text-muted-foreground">
            A name is all that is required.
          </span>
        )}
      </div>
    </div>
  );
}

export default function ClientsPage() {
  const utils = trpc.useUtils();
  const [view, setView] = useState<"active" | "archived">("active");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newDraft, setNewDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);
  const [pendingArchive, setPendingArchive] = useState<{
    id: number;
    name: string;
    bidCount: number;
  } | null>(null);

  /**
   * One page of clients, searched by the SERVER.
   *
   * This screen used to fetch every client and filter in the browser — noted
   * at the time as acceptable until someone had hundreds. Both halves are now
   * the query's job: the term goes to SQL, and the result is a keyset page
   * that loads more as you reach the end.
   *
   *  keeps the previous page on screen while the next term
   * is fetched, so typing does not flash an empty list.
   */
  const listQuery = trpc.clients.list.useInfiniteQuery(
    {
      term: query.trim() || undefined,
      archived: view === "archived",
      pageSize: 50,
    },
    {
      getNextPageParam: page => page.nextCursor,
      placeholderData: previous => previous,
    }
  );

  const invalidate = useCallback(() => {
    void utils.clients.list.invalidate();
  }, [utils]);

  const createClient = trpc.clients.create.useMutation({
    onSuccess: created => {
      toast.success(`${created?.name} added.`);
      setAdding(false);
      setNewDraft(emptyDraft);
      invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const updateClient = trpc.clients.update.useMutation({
    onSuccess: () => {
      setEditingId(null);
      invalidate();
    },
    onError: e => {
      toast.error(e.message);
      invalidate();
    },
  });

  const archiveClient = trpc.clients.archive.useMutation({
    onSuccess: () => invalidate(),
    onError: e => {
      toast.error(e.message);
      invalidate();
    },
  });

  const restoreClient = trpc.clients.restore.useMutation({
    onSuccess: () => invalidate(),
    onError: e => {
      toast.error(e.message);
      invalidate();
    },
  });

  // Flattened pages. Already filtered and ordered by the database — nothing
  // here re-filters, which is the whole point of the change.
  const visible = useMemo(
    () => (listQuery.data?.pages ?? []).flatMap(page => page.items),
    [listQuery.data]
  );

  // Typed on the fields it reads rather than on the live row, because the
  // archived list carries the same client without the bid count.
  const beginEdit = (row: {
    id: number;
    name: string;
    kind: ClientKind;
    contactName: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    notes: string | null;
  }) => {
    setEditingId(row.id);
    setEditDraft({
      name: row.name,
      kind: row.kind,
      contactName: row.contactName ?? "",
      address: row.address ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      notes: row.notes ?? "",
    });
  };

  const submitEdit = () => {
    if (editingId == null) return;
    updateClient.mutate({
      id: editingId,
      name: editDraft.name.trim(),
      kind: editDraft.kind,
      contactName: orNull(editDraft.contactName),
      address: orNull(editDraft.address),
      phone: orNull(editDraft.phone),
      email: orNull(editDraft.email),
      notes: orNull(editDraft.notes),
    });
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-primary" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold">Clients</h1>
            <p className="text-xs text-muted-foreground">
              Who the work is for. Attach one to a bid and its details fill in
              the proposal — the bid keeps whatever you type on it directly.
            </p>
          </div>
          {view === "active" && !adding && (
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs shrink-0"
              onClick={() => setAdding(true)}
            >
              <Plus className="w-3.5 h-3.5" /> Add client
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <div className="flex items-center gap-1">
            {(["active", "archived"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setView(tab)}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                  view === tab
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                {tab === "active" ? "Working list" : "Archived"}
                <span className="ml-1.5 text-muted-foreground/70">
                  {view === tab ? visible.length : ""}
                </span>
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[12rem] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search name, contact, address, phone…"
              className="h-8 pl-9 text-sm"
              aria-label="Search clients"
            />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
        {adding && view === "active" && (
          <ClientForm
            draft={newDraft}
            setDraft={setNewDraft}
            submitLabel="Add client"
            onCancel={() => {
              setAdding(false);
              setNewDraft(emptyDraft);
            }}
            onSubmit={() =>
              createClient.mutate({
                name: newDraft.name.trim(),
                kind: newDraft.kind,
                contactName: orNull(newDraft.contactName),
                address: orNull(newDraft.address),
                phone: orNull(newDraft.phone),
                email: orNull(newDraft.email),
                notes: orNull(newDraft.notes),
              })
            }
          />
        )}

        {listQuery.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map(n => (
              <div
                key={n}
                className="h-16 rounded-xl border border-border bg-card animate-pulse"
              />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              {query
                ? `Nothing matches “${query}”.`
                : view === "archived"
                  ? "Nothing archived."
                  : "No clients yet. Add one and its details fill in the proposal."}
            </p>
            {!query && view === "active" && (
              <p className="text-xs text-muted-foreground/70 mt-1">
                Add the companies and people you bid for, then attach one to a
                bid. A bid never has to have one.
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {visible.map(row => {
              const isEditing = editingId === row.id;
              const bidCount =
                "bidCount" in row ? (row.bidCount as number) : null;

              if (isEditing) {
                return (
                  <div
                    key={row.id}
                    className="p-4 border-b border-border last:border-0"
                  >
                    <ClientForm
                      draft={editDraft}
                      setDraft={setEditDraft}
                      submitLabel="Save"
                      onCancel={() => setEditingId(null)}
                      onSubmit={submitEdit}
                    />
                  </div>
                );
              }

              return (
                <div
                  key={row.id}
                  className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                >
                  <div className="mt-0.5 shrink-0 text-muted-foreground">
                    {row.kind === "company" ? (
                      <Building2 className="w-4 h-4" />
                    ) : (
                      <User className="w-4 h-4" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {row.name}
                      </span>
                      {row.kind === "individual" && (
                        <Badge variant="outline" className="text-xs">
                          Individual
                        </Badge>
                      )}
                      {bidCount != null && bidCount > 0 && (
                        <Badge
                          variant="outline"
                          className="text-xs gap-1 text-muted-foreground"
                        >
                          <FileText className="w-3 h-3" />
                          {bidCount} bid{bidCount === 1 ? "" : "s"}
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                      {row.contactName && <span>{row.contactName}</span>}
                      {row.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {row.phone}
                        </span>
                      )}
                      {row.email && (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {row.email}
                        </span>
                      )}
                      {row.address && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {row.address.split("\n")[0]}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    {view === "active" ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => beginEdit(row)}
                          aria-label={`Edit ${row.name}`}
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            setPendingArchive({
                              id: row.id,
                              name: row.name,
                              bidCount: bidCount ?? 0,
                            })
                          }
                          aria-label={`Archive ${row.name}`}
                          title="Archive"
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => restoreClient.mutate({ id: row.id })}
                      >
                        <ArchiveRestore className="w-3.5 h-3.5" /> Restore
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* The list is a page now, so it has to say so. Without this a
                contractor with 400 customers sees 50 and concludes the rest
                are gone. */}
            {listQuery.hasNextPage && (
              <div className="pt-2 flex justify-center">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={listQuery.isFetchingNextPage}
                  onClick={() => void listQuery.fetchNextPage()}
                >
                  {listQuery.isFetchingNextPage
                    ? "Loading…"
                    : "Load more clients"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Archiving says what it does NOT do, because the fear is losing the
          bids — and that is exactly what does not happen. */}
      <AlertDialog
        open={pendingArchive !== null}
        onOpenChange={open => !open && setPendingArchive(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {pendingArchive?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They come off the working list and can be restored at any time.
              {pendingArchive && pendingArchive.bidCount > 0 ? (
                <>
                  {" "}
                  {pendingArchive.bidCount === 1
                    ? "The 1 bid attached to them is not touched, and it keeps showing this client."
                    : `The ${pendingArchive.bidCount} bids attached to them are not touched, and they keep showing this client.`}
                </>
              ) : (
                " Nothing is deleted."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingArchive) {
                  archiveClient.mutate({ id: pendingArchive.id });
                  toast.success(`${pendingArchive.name} archived.`);
                }
                setPendingArchive(null);
              }}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
