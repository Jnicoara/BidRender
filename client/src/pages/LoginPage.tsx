import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  MailCheck,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isPasswordValid } from "@shared/passwordRules";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordStrengthBar } from "@/components/auth/PasswordStrengthBar";

type Mode = "login" | "signup" | "forgot";

interface LoginPageProps {
  onSuccess?: () => void;
  /** Open on this form rather than sign-in — the reset page sends people back here. */
  initialMode?: Mode;
  /** A line shown above the form, e.g. "Password changed — sign in with it." */
  notice?: string;
}

export default function LoginPage({
  onSuccess,
  initialMode = "login",
  notice,
}: LoginPageProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
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

  const switchTo = (next: Mode) => {
    setMode(next);
    setErrorMsg(null);
    setTouched(false);
    setPassword("");
  };

  if (mode === "forgot")
    return (
      <ForgotPasswordForm
        email={email}
        onEmailChange={setEmail}
        onBack={() => switchTo("login")}
      />
    );

  return (
    <AuthShell footer="Your data is private and never shared with other users.">
      {/* Tab switcher */}
      <div className="grid grid-cols-2 border-b border-border/50">
        {(["login", "signup"] as const).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => {
              if (mode !== m) switchTo(m);
            }}
            className={cn(
              "py-3.5 text-sm font-semibold transition-colors",
              mode === m
                ? "bg-background text-foreground border-b-2 border-[#F5C518]"
                : "bg-muted/30 text-muted-foreground hover:text-foreground"
            )}
          >
            {m === "login" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      {/* Form body */}
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {notice && mode === "login" && (
          <div className="flex items-start gap-2 rounded-lg bg-green-500/10 border border-green-500/25 px-3 py-2.5 text-sm text-green-400">
            <MailCheck size={14} className="shrink-0 mt-0.5" />
            <span>{notice}</span>
          </div>
        )}

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
          <div className="flex items-baseline justify-between">
            <Label htmlFor="password" className="text-sm font-medium">
              Password
            </Label>
            {mode === "login" && (
              <button
                type="button"
                onClick={() => switchTo("forgot")}
                className="text-xs text-muted-foreground hover:text-[#F5C518] transition-colors"
              >
                Forgot password?
              </button>
            )}
          </div>
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
                mode === "signup" ? "Create a strong password" : "Your password"
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

        {errorMsg && <FormError message={errorMsg} />}

        <SubmitButton
          pending={isPending}
          disabled={isPending || (mode === "signup" && touched && !passwordOk)}
        >
          {mode === "login" ? "Sign in" : "Create account"}
        </SubmitButton>
      </form>
    </AuthShell>
  );
}

/**
 * "Forgot password?" — ask for a reset link.
 *
 * What it says afterwards is the same for every address, because the server's
 * answer is (`auth.requestPasswordReset`): the screen cannot reveal whether an
 * account exists when the server never told it. The one different answer is
 * "this server cannot send email", which is true for everybody alike and is
 * said plainly rather than pretending a message went.
 */
function ForgotPasswordForm({
  email,
  onEmailChange,
  onBack,
}: {
  email: string;
  onEmailChange: (email: string) => void;
  onBack: () => void;
}) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const request = trpc.auth.requestPasswordReset.useMutation({
    onError: err => setErrorMsg(err.message),
  });
  const answered = request.data;

  return (
    <AuthShell>
      <div className="p-6 space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Reset your password</h2>
          {!answered && (
            <p className="text-sm text-muted-foreground">
              Enter the email you sign in with. We will send a link to choose a
              new password.
            </p>
          )}
        </div>

        {answered?.emailing === true && (
          <div className="flex items-start gap-2 rounded-lg bg-green-500/10 border border-green-500/25 px-3 py-2.5 text-sm text-green-400">
            <MailCheck size={14} className="shrink-0 mt-0.5" />
            <span>
              If an account uses <strong>{email}</strong>, a reset link is on
              its way. It works once, for one hour. Check your spam folder if it
              has not arrived in a few minutes.
            </span>
          </div>
        )}
        {answered?.emailing === false && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/25 px-3 py-2.5 text-sm text-amber-400">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>
              Password reset by email is not set up on this server yet, so no
              email was sent.
            </span>
          </div>
        )}

        {!answered && (
          <form
            onSubmit={e => {
              e.preventDefault();
              setErrorMsg(null);
              request.mutate({ email });
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="reset-email" className="text-sm font-medium">
                Email
              </Label>
              <Input
                id="reset-email"
                name="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => onEmailChange(e.target.value)}
                required
                autoComplete="username"
                autoFocus
                disabled={request.isPending}
                className="h-10"
              />
            </div>
            {errorMsg && <FormError message={errorMsg} />}
            <SubmitButton
              pending={request.isPending}
              disabled={request.isPending}
            >
              Send reset link
            </SubmitButton>
          </form>
        )}

        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} /> Back to sign in
        </button>
      </div>
    </AuthShell>
  );
}

export function FormError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-sm text-destructive">
      <AlertCircle size={14} className="shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

export function SubmitButton({
  pending,
  disabled,
  children,
}: {
  pending: boolean;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={cn(
        "w-full h-10 rounded-md font-semibold text-sm transition-all mt-2",
        "bg-[#F5C518] hover:bg-[#F5C518]/90 active:scale-[0.98] text-black",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
        "flex items-center justify-center gap-2"
      )}
    >
      {pending ? (
        <>
          <Loader2 size={15} className="animate-spin" /> Please wait…
        </>
      ) : (
        children
      )}
    </button>
  );
}
