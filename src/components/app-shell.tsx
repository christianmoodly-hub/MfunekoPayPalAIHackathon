import Link from "next/link";
import { ChevronDown, FlaskConical, ShieldCheck, UserRound } from "lucide-react";
import type { ReactNode } from "react";

const links = [
  { href: "/mandates", label: "Mandates" },
  { href: "/ledger", label: "Ledger" },
  { href: "/wallet", label: "Wallet" },
] as const;

export function AppShell({
  children,
  walletLinked = null,
  activeNav = "/mandates",
}: {
  children: ReactNode;
  walletLinked?: boolean | null;
  activeNav?: "/mandates" | "/ledger" | "/wallet";
}) {
  return (
    <div className="flex min-h-full min-w-0 flex-col overflow-x-clip bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <div className="flex min-w-0 flex-wrap items-center gap-3 lg:gap-6">
            <Link href="/mandates" className="flex flex-col">
              <span className="flex items-baseline gap-1">
                <span className="text-lg font-bold tracking-tight text-primary">MANDATE</span>
                <span className="font-mono text-[11px] text-muted-foreground">v1.4-active</span>
              </span>
              <span className="text-[11px] font-bold tracking-[0.06em] text-[#545f73] uppercase">
                Deterministic Agent Control
              </span>
            </Link>
            <span className="hidden items-center gap-1.5 rounded-full border border-[#fcd34d] bg-[#fef3c7] px-2.5 py-1 font-mono text-[11px] text-[#92400e] sm:inline-flex">
              <FlaskConical className="size-3.5" />
              Sandbox: no real money
            </span>
            <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
              {links.map((item) => {
                const active = item.href === activeNav;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={
                      active
                        ? "rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm"
                        : "rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-[#eff4ff] hover:text-foreground"
                    }
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {walletLinked === null ? null : (
              <span className="hidden items-center gap-1.5 rounded-full border border-border bg-[#d5e0f8]/50 px-2.5 py-1 font-mono text-[11px] text-[#111c2d] lg:inline-flex">
                <span className={`size-2 rounded-full ${walletLinked ? "bg-[#00402a]" : "bg-[#ba1a1a]"}`} />
                {walletLinked ? "Wallet linked" : "Wallet unlinked"}
                {walletLinked ? <ShieldCheck className="size-3.5 text-[#00402a]" /> : null}
              </span>
            )}
            <span className="hidden items-center gap-1 rounded-lg border border-border bg-[#eff4ff] px-2.5 py-1 font-mono text-[11px] sm:inline-flex">
              us-east-1 // sim
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </span>
            <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <UserRound className="size-4" />
            </span>
          </div>
        </div>
        <div className="border-t border-border/70 bg-[#eff4ff]">
          <div className="mx-auto flex h-7 w-full max-w-[1440px] items-center justify-between px-4 font-mono text-[11px] text-muted-foreground sm:px-8">
            <span>The AI proposes. Deterministic rules decide.</span>
            <span className="text-[11px] font-bold tracking-[0.06em] text-[#545f73] uppercase">
              Policy Engine Veto Active
            </span>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full min-w-0 max-w-[1440px] flex-1 flex-col px-4 py-6 sm:px-8">{children}</main>
      <footer className="mt-10 border-t border-border bg-card">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col items-start justify-between gap-3 px-4 py-6 sm:px-8 md:flex-row md:items-center">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
            <span className="text-lg font-bold tracking-tight text-primary">MANDATE</span>
            <span className="text-xs text-muted-foreground">
              Autonomous agent governance. Deterministic execution layer.
            </span>
          </div>
          <div className="flex items-center gap-4 font-mono text-[11px] text-muted-foreground">
            <span>Core Protocol: ACTIVE</span>
            <span>ISO-4217 Compliant</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
