import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { isPasswordValid } from "@shared/passwordRules";
import { RESET_LINK_UNUSABLE } from "@shared/resetLinkMessages";
import { RESET_ADDRESS, resetTokenFromHash } from "@/lib/resetLink";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordStrengthBar } from "@/components/auth/PasswordStrengthBar";
import { FormError, SubmitButton } from "@/pages/LoginPage";

/**
 * Choose a new password, from the emailed link `#/reset-password?token=…`.
 *
 * The token is read ONCE, on arrival, and the address is replaced with
 * `#/reset-password` so the token is not left in the address bar, the tab's
 * history or a screenshot. Reloading afterwards therefore shows "open the
 * link again" — the price of not leaving a credential lying about.
 *
 * On success the server has ended every session this account had, this
 * browser's included (auth.resetPassword), and `onDone` takes the person to
 * the sign-in form to use the new password.
 */
export default function ResetPasswordPage({
  onDone,
}: {
  onDone: (outcome: "changed" | "cancelled") => void;
}) {
  const [token] = useState(() => resetTokenFromHash(window.location.hash));
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (window.location.hash !== RESET_ADDRESS)
      window.history.replaceState(null, "", RESET_ADDRESS);
  }, []);

  const utils = trpc.useUtils();
  const reset = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      onDone("changed");
    },
    onError: err => setErrorMsg(err.message),
  });

  const passwordOk = isPasswordValid(password);

  /*
    Asked AS THE PAGE OPENS (2026-10-06): a used or expired link used to show
    the full form and refuse only on Save, after somebody had chosen and typed
    a password. Same sentence as the server's refusal (shared). While the
    answer is on its way the form shows as before — a link that turns out
    dead swaps it for the message, and Save still refuses on the server.
  */
  const linkCheck = trpc.auth.checkResetToken.useQuery(
    { token: token ?? "" },
    { enabled: Boolean(token), retry: false, refetchOnWindowFocus: false }
  );
  if (token && linkCheck.data?.usable === false)
    return (
      <AuthShell>
        <div className="p-6 space-y-4">
          <h2 className="text-base font-semibold">Reset your password</h2>
          <p className="text-sm text-muted-foreground">{RESET_LINK_UNUSABLE}</p>
          <SignInLink onClick={() => onDone("cancelled")} />
        </div>
      </AuthShell>
    );

  if (!token)
    return (
      <AuthShell>
        <div className="p-6 space-y-4">
          <h2 className="text-base font-semibold">Reset your password</h2>
          <p className="text-sm text-muted-foreground">
            This page needs the link from your reset email. Open the link from
            the email again, or ask for a new one from the sign-in page.
          </p>
          <SignInLink onClick={() => onDone("cancelled")} />
        </div>
      </AuthShell>
    );

  return (
    <AuthShell>
      <form
        className="p-6 space-y-4"
        onSubmit={e => {
          e.preventDefault();
          setErrorMsg(null);
          setTouched(true);
          if (!passwordOk) return;
          reset.mutate({ token, newPassword: password });
        }}
      >
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Choose a new password</h2>
          <p className="text-sm text-muted-foreground">
            Saving it signs this account out everywhere else.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="new-password" className="text-sm font-medium">
            New password
          </Label>
          <div className="relative">
            <Input
              id="new-password"
              name="new-password"
              type={showPassword ? "text" : "password"}
              placeholder="Create a strong password"
              value={password}
              onChange={e => {
                setPassword(e.target.value);
                setTouched(false);
              }}
              required
              autoFocus
              autoComplete="new-password"
              disabled={reset.isPending}
              className={cn(
                "h-10 pr-10",
                touched &&
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
          {password.length > 0 && <PasswordStrengthBar password={password} />}
        </div>

        {errorMsg && <FormError message={errorMsg} />}

        <SubmitButton
          pending={reset.isPending}
          disabled={reset.isPending || (touched && !passwordOk)}
        >
          Save new password
        </SubmitButton>
        <SignInLink onClick={() => onDone("cancelled")} />
      </form>
    </AuthShell>
  );
}

function SignInLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      Back to sign in
    </button>
  );
}
