import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <p className="text-sm font-medium text-muted-foreground">Mandate</p>
      <h1 className="text-3xl font-semibold tracking-tight">Spending rules for an AI shopping agent</h1>
      <p className="max-w-xl text-base leading-7 text-muted-foreground">
        Sandbox only. The model can propose a purchase. Deterministic code decides whether money moves.
      </p>
      <div>
        <Button variant="outline" disabled>
          Checkout is not wired up yet
        </Button>
      </div>
    </main>
  );
}
