/**
 * The starter editor's sign-in (baseline-screen-plan.md § 1): password, then
 * the 6-digit authenticator code or one recovery code. Its own page and its
 * own cookie (server/routers/starterAuthRouter.ts) — a company login is
 * refused here, and this login is refused by the company app.
 *
 * No enrolment screen, on purpose: the QR code is shown once in a terminal by
 * scripts/createStarterEditor.mts. A web enrol step would let anybody holding
 * the password enrol their own phone (Track A's note, track-b-handoff.md).
 */
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth/AuthShell";
import { selectOnFocus } from "@/lib/selectOnFocus";
import { FormError, SubmitButton } from "@/pages/LoginPage";

type Step = "password" | "code";

export default function StarterSignInPage({
  notice,
  onSignedIn,
}: {
  /** Said above the form, e.g. after a session ended. */
  notice?: string;
  onSignedIn: () => void;
}) {
  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const signIn = trpc.starterAuth.signIn.useMutation({
    onSuccess: () => {
      setPassword("");
      setCode("");
      setStep("code");
    },
    onError: err => setErrorMsg(err.message),
  });

  const verify = trpc.starterAuth.verifyCode.useMutation({
    onSuccess: () => onSignedIn(),
    onError: err => {
      // The password step lasts 5 minutes. Past it the only way on is back.
      if (
        err.data?.code === "UNAUTHORIZED" &&
        err.message === "Sign in again."
      ) {
        setStep("password");
        setErrorMsg("That took longer than 5 minutes. Sign in again.");
        return;
      }
      setErrorMsg(err.message);
      setCode("");
    },
  });

  const pending = signIn.isPending || verify.isPending;

  return (
    <AuthShell footer="Use a separate browser profile for this sign-in: one browser holds one session.">
      <div className="border-b border-border/50 px-6 py-3.5">
        <p className="text-sm font-semibold">Starter editor</p>
        <p className="text-xs text-muted-foreground">
          The shipped starter library. Not a company login.
        </p>
      </div>

      {step === "password" ? (
        <form
          className="p-6 space-y-4"
          onSubmit={e => {
            e.preventDefault();
            setErrorMsg(null);
            signIn.mutate({ email, password });
          }}
        >
          {notice && !errorMsg && (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm">
              {notice}
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="starter-email" className="text-sm font-medium">
              Email
            </Label>
            <Input
              id="starter-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="username"
              disabled={pending}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="starter-password" className="text-sm font-medium">
              Password
            </Label>
            <Input
              id="starter-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={pending}
              className="h-10"
            />
          </div>
          {errorMsg && <FormError message={errorMsg} />}
          <SubmitButton pending={pending} disabled={pending}>
            Continue
          </SubmitButton>
        </form>
      ) : (
        <form
          className="p-6 space-y-4"
          onSubmit={e => {
            e.preventDefault();
            setErrorMsg(null);
            verify.mutate({ code });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="starter-code" className="text-sm font-medium">
              {recovery ? "Recovery code" : "Authenticator code"}
            </Label>
            <Input
              // Remounted on the switch, so the keyboard changes with it.
              key={recovery ? "recovery" : "code"}
              id="starter-code"
              value={code}
              onChange={e => setCode(e.target.value)}
              onFocus={selectOnFocus}
              required
              autoFocus
              autoComplete="one-time-code"
              inputMode={recovery ? "text" : "numeric"}
              autoCapitalize={recovery ? "characters" : "off"}
              spellCheck={false}
              placeholder={recovery ? "XXXX-XXXX-XXXX-XXXX" : "6 digits"}
              disabled={pending}
              className="h-10 font-mono tracking-wider"
            />
            <p className="text-xs text-muted-foreground">
              {recovery
                ? "One of the 10 codes printed when the account was made. Each works once."
                : "The 6 digits your authenticator app shows for BidRidge starter."}
            </p>
          </div>
          {errorMsg && <FormError message={errorMsg} />}
          <SubmitButton pending={pending} disabled={pending}>
            Sign in
          </SubmitButton>
          <div className="flex items-center justify-between gap-3 text-xs">
            <button
              type="button"
              onClick={() => {
                setStep("password");
                setErrorMsg(null);
              }}
              className="inline-flex items-center gap-1 py-1 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft size={12} /> Back
            </button>
            <button
              type="button"
              onClick={() => {
                setRecovery(r => !r);
                setCode("");
                setErrorMsg(null);
              }}
              className="py-1 text-muted-foreground hover:text-[#F5C518]"
            >
              {recovery
                ? "Use the authenticator code"
                : "Use a recovery code instead"}
            </button>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
