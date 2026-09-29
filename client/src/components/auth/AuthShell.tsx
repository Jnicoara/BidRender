/**
 * The frame around every signed-out form — sign in, create account, forgot
 * password, reset password: the grid background, the wordmark and the card.
 *
 * One component rather than a copy per screen, so the reset page cannot drift
 * from the sign-in page it is reached from (CLAUDE.md, "Copying a layout does
 * not copy the behaviour with it").
 */
export function AuthShell({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-4">
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
            <span className="text-[#F5C518]">Ridge</span>
          </h1>
          <p className="text-muted-foreground text-sm">
            Electrical estimating for the field
          </p>
        </div>

        <div className="rounded-xl border border-border/50 bg-card shadow-xl overflow-hidden">
          {children}
        </div>

        {footer && (
          <p className="text-center text-xs text-muted-foreground mt-5">
            {footer}
          </p>
        )}
      </div>
    </div>
  );
}
