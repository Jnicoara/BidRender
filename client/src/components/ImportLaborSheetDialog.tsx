/**
 * Import the labor-unit sheet (pricing/labor-units-starter.xlsx), one tab at
 * a time: paste it, read EVERY change, then Apply.
 *
 * The preview is the server's own plan (`materials.importLaborSheet` with
 * `apply: false`, shared/laborImport.ts), and Apply sends the same text, so
 * the list shown is the list written. Only hours are written; a row it
 * cannot place is listed with the reason and never written; a blank MY
 * HOURS changes nothing.
 */
import { useState } from "react";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type Result = Awaited<
  ReturnType<
    ReturnType<
      typeof trpc.useUtils
    >["client"]["materials"]["importLaborSheet"]["mutate"]
  >
>;

const hours = (n: number | null) => (n === null ? "not set" : `${n} h`);

export function ImportLaborSheetDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Result | null>(null);
  const [applied, setApplied] = useState<number | null>(null);

  const run = trpc.materials.importLaborSheet.useMutation({
    onError: e => toast.error(e.message),
  });

  const doPreview = async () => {
    setApplied(null);
    setPreview(await run.mutateAsync({ text, apply: false }));
  };
  const doApply = async () => {
    const r = await run.mutateAsync({ text, apply: true });
    setPreview(r);
    if (r.kind !== "unreadable") {
      setApplied(r.applied);
      toast.success(
        `${r.applied} ${r.applied === 1 ? "change" : "changes"} written — hours only.`
      );
      onDone();
    }
  };

  const plan = preview && preview.kind !== "unreadable" ? preview.plan : null;
  const changeCount = plan?.changes.length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl max-h-[90dvh] flex flex-col rounded-xl border border-border bg-card p-5 gap-3">
        <div className="shrink-0">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4" /> Import the labor-unit sheet
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            In the sheet, select one tab from its header row down and copy it,
            then paste it here. Only <strong>MY HOURS</strong> is read — a blank
            cell changes nothing, and SUGGESTED is never imported. Hours are
            written; prices and names never are, and no material is added.
          </p>
        </div>

        <textarea
          value={text}
          onChange={e => {
            setText(e.target.value);
            setPreview(null);
            setApplied(null);
          }}
          rows={5}
          placeholder={"ID\tName\tUnit\tMY HOURS\t…"}
          aria-label="Pasted labor-unit sheet"
          className="shrink-0 w-full rounded-md border border-border bg-background p-2 text-xs font-mono"
        />

        {preview?.kind === "unreadable" && (
          <p className="text-xs text-[#F5C518]">{preview.reason}</p>
        )}

        {plan && (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 text-xs">
            <p>
              <strong>{changeCount}</strong>{" "}
              {changeCount === 1 ? "change" : "changes"} · {plan.unchanged}{" "}
              already the same · {plan.blank} blank, left as they are ·{" "}
              {plan.unmatched.length} not placed
              {applied !== null && (
                <span className="text-emerald-500"> — {applied} written.</span>
              )}
            </p>
            {changeCount > 0 && (
              <table className="w-full">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-left font-normal py-1">Line</th>
                    <th className="text-left font-normal">
                      {preview?.kind === "assemblies" ? "Assembly" : "Material"}
                    </th>
                    <th className="text-right font-normal">Now</th>
                    <th className="text-right font-normal">Becomes</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {preview?.kind === "assemblies"
                    ? preview.plan.changes.map(c => (
                        <tr key={c.line} className="border-t border-border/50">
                          <td className="py-0.5">{c.line}</td>
                          <td className="font-sans">{c.name}</td>
                          <td className="text-right">{hours(c.from)}</td>
                          <td className="text-right">{hours(c.to)}</td>
                        </tr>
                      ))
                    : preview?.kind === "materials" &&
                      preview.plan.changes.map(c => (
                        <tr
                          key={`${c.line}-${c.field}`}
                          className="border-t border-border/50"
                        >
                          <td className="py-0.5">{c.line}</td>
                          <td className="font-sans">
                            {c.name}
                            {c.field === "fieldBendLaborHours" && (
                              <span className="text-muted-foreground">
                                {" "}
                                · one field bend
                              </span>
                            )}
                          </td>
                          <td className="text-right">{hours(c.from)}</td>
                          <td
                            className="text-right"
                            title={`Sheet: ${c.typed}`}
                          >
                            {hours(c.to)}
                            {c.field === "laborHours" &&
                            c.typed.includes("100 ft")
                              ? " /ft"
                              : ""}
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            )}
            {plan.unmatched.length > 0 && (
              <div>
                <p className="font-medium text-[#F5C518]">
                  Not placed — nothing is written for these:
                </p>
                <ul className="mt-1 space-y-0.5">
                  {plan.unmatched.map(u => (
                    <li key={u.line}>
                      Line {u.line}, {u.name || "(no name)"}:{" "}
                      <span className="text-muted-foreground">{u.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="shrink-0 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {applied !== null ? "Done" : "Cancel"}
          </Button>
          {!plan || applied !== null ? (
            <Button
              size="sm"
              disabled={!text.trim() || run.isPending || applied !== null}
              onClick={() => void doPreview()}
            >
              Preview
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={changeCount === 0 || run.isPending}
              onClick={() => void doApply()}
            >
              Apply {changeCount} {changeCount === 1 ? "change" : "changes"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
