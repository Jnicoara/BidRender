/**
 * "Where do I…?" — guide mode's help search (client/src/lib/helpTopics.ts).
 *
 * Local and instant: no AI, no network, so it works with AI off and on a job
 * site with one bar. Opened from the guide strip, the sidebar's Help entry and
 * the phone's More menu. Picking an answer opens the screen it names.
 */
import { useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { HELP_TOPICS, searchHelp, type HelpTopic } from "@/lib/helpTopics";

/** Shown before anything is typed: the questions a new user asks first. */
const STARTERS = [
  "Upload a drawing set",
  "Set the scale on a sheet",
  "Count devices on the plans",
  "Set my labor rates",
  "Print or send a proposal",
];

export function HelpSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const typed = query.trim().length > 0;
  const results: HelpTopic[] = typed
    ? searchHelp(query)
    : HELP_TOPICS.filter(t => STARTERS.includes(t.question));

  const go = (topic: HelpTopic) => {
    onOpenChange(false);
    setQuery("");
    window.location.hash = topic.path;
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        onOpenChange(next);
        if (!next) setQuery("");
      }}
    >
      <DialogContent className="max-w-lg max-h-[85dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Where do I…?</DialogTitle>
          <DialogDescription>
            Type what you want to do — "labor rate", "logo", "undo delete".
          </DialogDescription>
        </DialogHeader>
        <div className="relative shrink-0">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && results[0]) go(results[0]);
            }}
            placeholder="e.g. set the scale"
            aria-label="What do you want to do?"
            className="pl-9"
            maxLength={120}
          />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
          {!typed && (
            <p className="text-xs text-muted-foreground mb-1.5">Most asked</p>
          )}
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nothing matches “{query.trim()}”. Try one word — “price”, “crew”,
              “scale”.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {results.map(topic => (
                <li key={topic.question}>
                  <button
                    type="button"
                    onClick={() => go(topic)}
                    className="w-full text-left px-3 py-2.5 hover:bg-accent flex items-start gap-2"
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium">
                        {topic.question}
                      </span>
                      <span className="block text-xs text-muted-foreground mt-0.5">
                        {topic.answer}
                      </span>
                    </span>
                    <ArrowRight className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
