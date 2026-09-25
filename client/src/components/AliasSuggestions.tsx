/**
 * AliasSuggestions — the second alias layer, for a material added by hand.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Search reliability has two layers: the shared dictionary every search box
 * uses (ALIAS_MAP in @/lib/smartSearch), and per-item trade slang stored on the
 * row. Seeded materials get curated layer-2 aliases; before this, a material
 * added by hand got none at all — the form never even collected the field. So
 * "the strut nut I added myself" was findable by generic words and invisible to
 * "spring nut", while the shipped rows were not.
 *
 * ── Suggested, never applied ─────────────────────────────────────────────────
 * Terms arrive as chips, all switched OFF. The user ticks what is right. An
 * alias is a claim about what a thing is called, and a wrong one silently
 * mis-ranks every future search for it — so nothing is stored on the user's
 * behalf, and the free-text field beside it is always usable on its own.
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectOnFocus } from "@/lib/selectOnFocus";
import { mergeAliases } from "@shared/aliasSuggestions";

/**
 * What asking for suggestions came back with.
 *
 * `available: false` means the AI could not be asked — switched off, no key,
 * the daily allowance used, or a failed call — which is a different thing to
 * say from "it was asked and had nothing to add" (2026-09-25).
 */
export type AliasSuggestionResult = {
  suggestions: string[];
  available: boolean;
};

export function AliasSuggestions({
  value,
  onChange,
  onRequest,
  disabled,
}: {
  /** The alias text as it will be saved. */
  value: string;
  onChange: (next: string) => void;
  /** Ask for suggestions. Never throws — failure is `available: false`. */
  onRequest: () => Promise<AliasSuggestionResult>;
  disabled?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [available, setAvailable] = useState(true);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const request = async () => {
    setLoading(true);
    try {
      const found = await onRequest();
      setSuggestions(found.suggestions);
      setAvailable(found.available);
      setAccepted(new Set());
    } finally {
      setLoading(false);
    }
  };

  const toggle = (term: string) => {
    const next = new Set(accepted);
    if (next.has(term)) next.delete(term);
    else next.add(term);
    setAccepted(next);
  };

  const apply = () => {
    onChange(mergeAliases(value || null, Array.from(accepted)));
    // Keep only what was not taken, so the list shows what is left to consider
    // rather than re-offering terms already on the row.
    setSuggestions((suggestions ?? []).filter(term => !accepted.has(term)));
    setAccepted(new Set());
  };

  return (
    <div className="w-full space-y-1.5">
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={selectOnFocus}
          placeholder="Trade slang — what people actually type"
          className="h-8 flex-1 text-sm"
          aria-label="Search aliases"
          disabled={disabled}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-xs shrink-0"
          onClick={request}
          disabled={disabled || loading}
          title="Suggest the terms electricians use for this"
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" /> Suggest
            </>
          )}
        </Button>
      </div>

      {suggestions !== null && suggestions.length === 0 && (
        <p className="text-[0.7rem] text-muted-foreground">
          {available
            ? "No suggestions this time"
            : "Suggestions aren't available right now"}{" "}
          — type the terms people use for it yourself. Search still works either
          way; the shared abbreviation list covers the common trade words.
        </p>
      )}

      {suggestions !== null && suggestions.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/20 p-2 space-y-2">
          <p className="text-[0.7rem] text-muted-foreground">
            Tick the ones that are right for this material. Nothing is added
            until you apply.
          </p>
          <div className="flex flex-wrap gap-1">
            {suggestions.map(term => {
              const on = accepted.has(term);
              return (
                <button
                  key={term}
                  onClick={() => toggle(term)}
                  className={cn(
                    "px-2 py-0.5 rounded-full text-xs border transition-colors",
                    on
                      ? "bg-[#F5C518]/20 text-[#F5C518] border-[#F5C518]/40"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                  aria-pressed={on}
                >
                  {on && <Check className="w-3 h-3 inline mr-1" />}
                  {term}
                </button>
              );
            })}
          </div>
          <Button
            size="sm"
            className="h-6 gap-1 text-xs"
            onClick={apply}
            disabled={accepted.size === 0}
          >
            <Check className="w-3 h-3" />
            Add {accepted.size} {accepted.size === 1 ? "term" : "terms"}
          </Button>
        </div>
      )}
    </div>
  );
}
