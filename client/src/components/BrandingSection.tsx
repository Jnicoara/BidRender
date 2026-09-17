/**
 * Company branding — the letterhead every proposal is sent under.
 *
 * ── This is the user's company, never a default ──────────────────────────────
 * Nothing here ships pre-filled. There is no sample company name, no stock
 * logo, no placeholder address that could survive to a client's desk. A
 * proposal carrying somebody else's details is worse than one carrying none,
 * because none is obviously unfinished and wrong-but-plausible is not.
 *
 * ── Blank is flagged, not hidden ─────────────────────────────────────────────
 * An empty field is called out the same way an unpriced material is
 * (shared/materialPricing.ts): the app says what is missing, at the place the
 * user would fix it, and keeps saying it until it is filled in. The document
 * itself does the same — every missing field prints a visible bracketed prompt
 * rather than blank space, so a half-finished letterhead cannot be sent by
 * accident. `needsBranding` in shared/proposal.ts is the one rule both read.
 *
 * ── Editing rules ────────────────────────────────────────────────────────────
 * Text fields, so not InlineNumberField — but the same contract
 * (CLAUDE.md § Editing fields): select on focus, commit on Enter AND on blur,
 * Escape reverts to the last saved value, and a real save flashes green while
 * an unchanged one stays quiet.
 */
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ImageUp, Trash2, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { selectOnFocus } from "@/lib/selectOnFocus";
import { needsBranding, missingBrandingFields } from "@shared/proposal";

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

/** One self-saving text field. Multi-line for the address. */
function BrandingField({
  label,
  hint,
  value,
  placeholder,
  multiline,
  missing,
  onSave,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder: string;
  multiline?: boolean;
  /** True when this field is one of the ones a proposal needs. */
  missing: boolean;
  onSave: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [flash, setFlash] = useState(false);
  const editing = useRef(false);
  const timer = useRef<number | null>(null);

  // A save that lands from elsewhere must not clobber what is being typed.
  useEffect(() => {
    if (editing.current) return;
    setDraft(value);
  }, [value]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );

  const commit = () => {
    const next = draft.trim();
    if (next === value.trim()) return; // nothing moved: no write, no flash
    onSave(next);
    setFlash(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFlash(false), 1100);
  };

  const shared = {
    value: draft,
    placeholder,
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      editing.current = true;
      selectOnFocus(e);
    },
    onBlur: () => {
      editing.current = false;
      commit();
    },
    "aria-label": label,
    className: cn(
      "text-sm transition-colors duration-200",
      flash && "border-emerald-500 bg-emerald-500/10 text-emerald-300",
      !flash && missing && "border-[#F5C518]/40"
    ),
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Label className="text-xs">{label}</Label>
        {missing && (
          <span className="inline-flex items-center gap-1 text-[10px] text-[#F5C518]">
            <TriangleAlert className="w-3 h-3" aria-hidden />
            Needed
          </span>
        )}
      </div>
      {multiline ? (
        <textarea
          {...shared}
          rows={2}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            // Enter commits rather than adding a line: an address of two or
            // three lines is typed with Shift+Enter, and every other field on
            // this form commits on Enter.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setDraft(value);
              editing.current = false;
              (e.target as HTMLTextAreaElement).blur();
            }
          }}
          className={cn(
            "flex w-full rounded-md border border-input bg-transparent px-3 py-2 shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] resize-none",
            shared.className
          )}
        />
      ) : (
        <Input
          {...shared}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setDraft(value);
              editing.current = false;
              (e.target as HTMLInputElement).blur();
            }
          }}
          className={cn("h-9", shared.className)}
        />
      )}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      <span className="sr-only" role="status" aria-live="polite">
        {flash ? `${label} saved` : ""}
      </span>
    </div>
  );
}

export function BrandingSection() {
  const utils = trpc.useUtils();
  const { data: branding } = trpc.proposals.branding.useQuery();
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const invalidate = () => {
    void utils.proposals.branding.invalidate();
    // Any proposal on screen is built from these fields server-side.
    void utils.proposals.document.invalidate();
  };

  const save = trpc.proposals.setBranding.useMutation({
    onError: e => toast.error(e.message),
    onSettled: invalidate,
  });
  const ticket = trpc.proposals.createLogoUploadTicket.useMutation();
  const confirmLogo = trpc.proposals.confirmLogo.useMutation({
    onError: e => toast.error(e.message),
    onSettled: invalidate,
  });
  const clearLogo = trpc.proposals.clearLogo.useMutation({
    onError: e => toast.error(e.message),
    onSettled: invalidate,
  });

  if (!branding) return null;

  const missing = missingBrandingFields(branding);
  const missingKeys = new Set(missing.map(f => f.key));
  const incomplete = needsBranding(branding);

  /** Presign, PUT the bytes straight to S3, then record the key. */
  const uploadLogo = async (file: File) => {
    if (!LOGO_TYPES.includes(file.type)) {
      toast.error("Use a PNG, JPG, WebP or SVG for your logo.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("Keep the logo under 5 MB.");
      return;
    }

    setUploading(true);
    try {
      const { uploadUrl, storageKey } = await ticket.mutateAsync({
        filename: file.name,
        contentType: file.type as (typeof LOGO_TYPES)[number] as never,
        byteSize: file.size,
      });
      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error(`Upload failed (${response.status})`);
      await confirmLogo.mutateAsync({ storageKey });
      toast.success("Logo saved — it is on every proposal from now on.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "That logo did not upload. Your current logo is unchanged."
      );
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Branding</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Your company as it appears on every proposal you send. Nothing here is
          filled in for you — a document that goes out under your name should
          carry your details, not a default.
        </p>
      </div>

      {/*
        The same prompt the material library uses for unpriced rows, for the
        same reason: an empty field is not an error, it is work still to do, and
        saying so where the user can act on it beats discovering it on a client's
        desk. It names what is missing rather than saying "incomplete".
      */}
      {incomplete && (
        <div className="flex items-start gap-2 rounded-lg border border-[#F5C518]/30 bg-[#F5C518]/10 p-3 text-xs text-[#F5C518]">
          <TriangleAlert className="w-4 h-4 shrink-0 mt-px" aria-hidden />
          <div>
            <div className="font-medium">Your letterhead is not finished.</div>
            <div className="mt-0.5 text-[#F5C518]/85">
              Still needed: {missing.map(f => f.label).join(", ")}. Until then a
              proposal prints a visible prompt in place of each one, so nothing
              can be sent looking blank by mistake.
            </div>
          </div>
        </div>
      )}

      {/* ── Logo ───────────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div>
          <Label className="text-sm">Logo</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            PNG, JPG, WebP or SVG, under 5 MB. Printed at about 1.5 inches wide.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div
            className={cn(
              "w-36 h-20 rounded-md border flex items-center justify-center overflow-hidden shrink-0",
              branding.logoUrl
                ? "border-border bg-white"
                : "border-dashed border-[#F5C518]/50 bg-[#F5C518]/10"
            )}
          >
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt="Your company logo"
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <span className="text-[11px] text-[#F5C518] italic px-2 text-center">
                No logo yet
              </span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <input
              ref={fileInput}
              type="file"
              accept={LOGO_TYPES.join(",")}
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) void uploadLogo(file);
              }}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
            >
              <ImageUp className="w-3.5 h-3.5" />
              {uploading
                ? "Uploading…"
                : branding.logoUrl
                  ? "Replace logo"
                  : "Upload logo"}
            </Button>
            {branding.logoUrl && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                onClick={() => clearLogo.mutate()}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Details ────────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <BrandingField
          label="Company name"
          value={branding.companyName}
          placeholder="e.g. Ridgeline Electric LLC"
          missing={missingKeys.has("companyName")}
          onSave={companyName => save.mutate({ companyName })}
        />
        <BrandingField
          label="License number"
          hint="Stated on the proposal — on most electrical work it has to be."
          value={branding.licenseNumber}
          placeholder="e.g. EC-118240"
          missing={missingKeys.has("licenseNumber")}
          onSave={licenseNumber => save.mutate({ licenseNumber })}
        />
        <BrandingField
          label="Address"
          hint="Shift+Enter for a second line."
          value={branding.address}
          placeholder={"1420 Foundry Rd\nAsheville, NC 28801"}
          multiline
          missing={missingKeys.has("address")}
          onSave={address => save.mutate({ address })}
        />
        <BrandingField
          label="Phone"
          value={branding.phone}
          placeholder="(828) 555-0148"
          missing={missingKeys.has("phone")}
          onSave={phone => save.mutate({ phone })}
        />
        <BrandingField
          label="Email"
          hint="Optional — left off the document when empty."
          value={branding.email}
          placeholder="estimating@example.com"
          missing={false}
          onSave={email => save.mutate({ email })}
        />
        <BrandingField
          label="Website"
          hint="Optional."
          value={branding.website}
          placeholder="ridgelineelectric.com"
          missing={false}
          onSave={website => save.mutate({ website })}
        />
      </div>
    </section>
  );
}
