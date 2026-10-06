import { CheckCircle2, XCircle } from "lucide-react";
import { PASSWORD_RULES } from "@shared/passwordRules";
import { cn } from "@/lib/utils";

/**
 * The strength bar and rule checklist under a NEW-password field.
 *
 * Reads `shared/passwordRules.ts`, the same list the server enforces, so a
 * green tick here is a password the server will accept. Used by account
 * creation and by the reset page.
 */
export function PasswordStrengthBar({ password }: { password: string }) {
  const score = PASSWORD_RULES.filter(r => r.test(password)).length;
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  const colors = [
    "",
    "bg-red-500",
    "bg-orange-400",
    "bg-yellow-400",
    "bg-green-500",
  ];
  const textColors = [
    "",
    "text-red-400",
    "text-orange-400",
    "text-yellow-400",
    "text-green-400",
  ];

  if (!password) return null;

  return (
    <div className="space-y-2 mt-1">
      {/* Segmented bar */}
      <div className="flex gap-1">
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-all duration-300",
              i <= score ? colors[score] : "bg-muted/40"
            )}
          />
        ))}
      </div>
      <p
        className={cn(
          "text-xs font-medium",
          textColors[score] || "text-muted-foreground"
        )}
      >
        {score > 0 ? labels[score] : ""}
      </p>
      <ul className="space-y-1">
        {PASSWORD_RULES.map(rule => {
          const passed = rule.test(password);
          return (
            <li
              key={rule.id}
              className={cn(
                "flex items-center gap-1.5 text-xs transition-colors",
                passed ? "text-green-400" : "text-muted-foreground"
              )}
            >
              {passed ? (
                <CheckCircle2 size={11} className="shrink-0 text-green-400" />
              ) : (
                <XCircle
                  size={11}
                  className="shrink-0 text-muted-foreground/50"
                />
              )}
              {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
