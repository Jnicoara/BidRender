import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "login" | "signup";

// ── Password strength rules ────────────────────────────────────────────────────
const PASSWORD_RULES = [
  {
    id: "length",
    label: "At least 8 characters",
    test: (p: string) => p.length >= 8,
  },
  {
    id: "upper",
    label: "One uppercase letter (A–Z)",
    test: (p: string) => /[A-Z]/.test(p),
  },
  {
    id: "number",
    label: "One number (0–9)",
    test: (p: string) => /[0-9]/.test(p),
  },
  {
    id: "special",
    label: "One special character (!@#$%^&*…)",
    test: (p: string) => /[^A-Za-z0-9]/.test(p),
  },
] as const;

function passwordStrength(p: string): number {
  return PASSWORD_RULES.filter(r => r.test(p)).length;
}

function PasswordStrengthBar({ password }: { password: string }) {
  const score = passwordStrength(password);
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
      {/* Rule checklist — only shown during signup */}
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

// ── Validate password meets all rules ─────────────────────────────────────────
function isPasswordValid(p: string): boolean {
  return PASSWORD_RULES.every(r => r.test(p));
}

interface LoginPageProps {
  onSuccess?: () => void;
}

export default function LoginPage({ onSuccess }: LoginPageProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const utils = trpc.useUtils();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      onSuccess?.();
    },
    onError: err => setErrorMsg(err.message),
  });

  const signupMutation = trpc.auth.signup.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      onSuccess?.();
    },
    onError: err => setErrorMsg(err.message),
  });

  const isPending = loginMutation.isPending || signupMutation.isPending;
  const passwordOk = mode === "login" || isPasswordValid(password);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setTouched(true);
    if (mode === "signup" && !passwordOk) return;
    if (mode === "login") {
      loginMutation.mutate({ email, password });
    } else {
      signupMutation.mutate({
        email,
        password,
        name: name.trim() || undefined,
      });
    }
  };

  const toggleMode = () => {
    setMode(m => (m === "login" ? "signup" : "login"));
    setErrorMsg(null);
    setTouched(false);
    setPassword("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      {/* Subtle grid background */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(245,197,24,0.06) 1px, transparent 0)`,
          backgroundSize: "32px 32px",
        }}
      />

      <div className="w-full max-w-sm relative z-10">
        {/* Brand header */}
        <div className="text-center mb-10">
          <h1
            className="text-4xl font-bold tracking-tight mb-2"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            <span className="text-foreground">Bid</span>
            <span className="text-[#F5C518]">Render</span>
          </h1>
          <p className="text-muted-foreground text-sm">
            Electrical estimating for the field
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-border/50 bg-card shadow-xl overflow-hidden">
          {/* Tab switcher */}
          <div className="grid grid-cols-2 border-b border-border/50">
            {(["login", "signup"] as Mode[]).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  if (mode !== m) toggleMode();
                }}
                className={cn(
                  "py-3.5 text-sm font-semibold transition-colors",
                  mode === m
                    ? "bg-background text-foreground border-b-2 border-[#F5C518]"
                    : "bg-muted/30 text-muted-foreground hover:text-foreground"
                )}
              >
                {m === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          {/* Form body */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-sm font-medium">
                  Name{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </Label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoComplete="name"
                  disabled={isPending}
                  className="h-10"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium">
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete={mode === "login" ? "username" : "email"}
                disabled={isPending}
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <Input
                  // Remounted when the mode changes, so a password manager sees
                  // a fresh field rather than one whose autocomplete quietly
                  // turned from "current-password" into "new-password" beneath
                  // it — which is how a manager ends up offering to save the
                  // password you are signing in with, or filling the old one
                  // into a "create account" box.
                  key={mode}
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={
                    mode === "signup"
                      ? "Create a strong password"
                      : "Your password"
                  }
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value);
                    setTouched(false);
                  }}
                  required
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  disabled={isPending}
                  className={cn(
                    "h-10 pr-10",
                    touched &&
                      mode === "signup" &&
                      !passwordOk &&
                      "border-destructive focus-visible:ring-destructive"
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>

              {/* Strength indicator — only during signup */}
              {mode === "signup" && password.length > 0 && (
                <PasswordStrengthBar password={password} />
              )}
            </div>

            {/* Error message */}
            {errorMsg && (
              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-sm text-destructive">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={
                isPending || (mode === "signup" && touched && !passwordOk)
              }
              className={cn(
                "w-full h-10 rounded-md font-semibold text-sm transition-all mt-2",
                "bg-[#F5C518] hover:bg-[#F5C518]/90 active:scale-[0.98] text-black",
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
                "flex items-center justify-center gap-2"
              )}
            >
              {isPending ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Please wait…
                </>
              ) : mode === "login" ? (
                "Sign In"
              ) : (
                "Create Account"
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-5">
          Your data is private and never shared with other users.
        </p>
      </div>
    </div>
  );
}
