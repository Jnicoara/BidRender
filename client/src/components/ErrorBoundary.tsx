/**
 * The screen shown when something in the app throws.
 *
 * ── It apologises in English and keeps the evidence out of sight ─────────────
 * This used to print `error.stack` in a grey box, which is the wrong output for
 * everyone who sees it: a contractor cannot act on a stack trace, and the
 * developer who could is not the one holding the laptop. Worse, it read as the
 * app having broken so badly it was showing its own guts — on a screen whose
 * only job is to say "this is recoverable".
 *
 * So the detail is captured rather than displayed (see @/lib/crashLog: console,
 * localStorage, and a Copy button that produces something pasteable), and the
 * screen itself says what happened, what it means for the user's work, and
 * offers the two ways out.
 *
 * ── Why "Back to the Dashboard" reloads ─────────────────────────────────────
 * This boundary wraps the whole app, and a class component holds `hasError`
 * until it is remounted. Changing the hash alone would leave the apology on
 * screen while the address bar claimed to be somewhere else — so both buttons
 * reload, and the only difference is where the reload lands. The Dashboard is
 * offered first because the crashed screen is the one place least likely to
 * work on a second try.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  LayoutDashboard,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildCrash,
  formatCrash,
  recordCrash,
  type CrashRecord,
} from "@/lib/crashLog";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  crash: CrashRecord | null;
  copied: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, crash: null, copied: false };
  }

  static getDerivedStateFromError(): Partial<State> {
    // Only flips the switch. The record is built in componentDidCatch, which is
    // the one that gets the component stack.
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const crash = buildCrash(
      error,
      info.componentStack ?? "",
      window.location.hash || window.location.pathname || "/",
      new Date()
    );
    recordCrash(crash);
    this.setState({ crash });
  }

  private copyDetails = async () => {
    const { crash } = this.state;
    if (!crash) return;
    try {
      await navigator.clipboard.writeText(formatCrash(crash));
      this.setState({ copied: true });
    } catch {
      // Clipboard denied (it needs a secure context). Nothing to do about it
      // here, and an error message about failing to copy an error message is
      // not a useful thing to show anybody.
    }
  };

  private goToDashboard = () => {
    window.location.hash = "#/dashboard";
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { crash, copied } = this.state;

    return (
      <div className="flex items-center justify-center min-h-dvh p-6 bg-background">
        <div className="w-full max-w-md">
          <div className="rounded-xl border border-border bg-card p-6">
            <AlertTriangle className="w-8 h-8 text-[#F5C518] mb-4" />

            <h1 className="text-lg font-semibold">
              This screen stopped working
            </h1>

            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Something went wrong while drawing this page. It is not something
              you did, and nothing you had already saved is affected — your
              bids, pricing and library are on the server and were not touched.
            </p>

            <div className="flex flex-wrap items-center gap-2 mt-5">
              <Button className="gap-2" onClick={this.goToDashboard}>
                <LayoutDashboard className="w-4 h-4" />
                Back to the Dashboard
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => window.location.reload()}
              >
                <RotateCcw className="w-4 h-4" />
                Try again
              </Button>
            </div>
          </div>

          {/*
            Under the card and quiet, because it is for the rare occasion the
            user is reporting this rather than just getting on with their day.
            The detail itself stays off the screen — this hands it over instead.
          */}
          {crash && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 px-1">
              <button
                onClick={this.copyDetails}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-[#F5C518]" />
                    Copied — paste it into your message
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    Copy the details for support
                  </>
                )}
              </button>
              <span className="text-xs text-muted-foreground/60">
                {new Date(crash.at).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
