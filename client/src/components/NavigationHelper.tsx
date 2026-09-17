/**
 * "Where do I go?" — ask in plain language, get pointed at a screen.
 *
 * ── The answer is offered, not executed ──────────────────────────────────────
 * When the helper identifies a screen it shows a button rather than navigating
 * on its own. Being moved somewhere you did not ask to go is disorienting even
 * when the destination is right, and this exists for people who are already
 * unsure where they are. One click keeps the user driving.
 *
 * The set of destinations is fixed and validated on the server — see
 * shared/navigationTargets.ts. Anything the model invents arrives here as a
 * text-only answer with no button, so there is no path from a confused model
 * to a broken link.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Compass, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Answer = {
  message: string;
  target: { id: string; label: string; path: string } | null;
};

export function NavigationHelper({ className }: { className?: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);

  const ask = trpc.navigation.ask.useMutation({
    onSuccess: setAnswer,
    // A failed lookup is a missing convenience, not a broken screen — the
    // sidebar is right there. Say so quietly rather than raising an error.
    onError: () =>
      setAnswer({
        message:
          "Could not reach the helper just now. The sidebar has everything too.",
        target: null,
      }),
  });

  const submit = () => {
    const trimmed = question.trim();
    if (!trimmed || ask.isPending) return;
    setAnswer(null);
    ask.mutate({ question: trimmed });
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Compass className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") submit();
            }}
            placeholder="Where do I edit labor rates?"
            aria-label="Ask where to find something"
            className="h-9 pl-9 text-sm"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-9 text-xs shrink-0"
          onClick={submit}
          disabled={ask.isPending || !question.trim()}
        >
          {ask.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            "Ask"
          )}
        </Button>
      </div>

      {answer && (
        <div className="mt-2 rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-sm">{answer.message}</p>
          {answer.target && (
            <Button
              size="sm"
              className="h-7 mt-2 gap-1.5 text-xs"
              onClick={() => {
                window.location.hash = answer.target!.path;
              }}
            >
              Go to {answer.target.label}
              <ArrowRight className="w-3 h-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
