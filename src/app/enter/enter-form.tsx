"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";

export function EnterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passcode }),
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(body.error ?? "Could not sign in.");
      setPending(false);
      return;
    }
    const next = params.get("next");
    const destination = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    router.push(destination);
    router.refresh();
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-24">
      <p className="text-sm font-medium text-muted-foreground">Mandate</p>
      <h1 className="text-2xl font-semibold tracking-tight">Enter the demo</h1>
      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        <label className="text-sm" htmlFor="passcode">
          Passcode
        </label>
        <input
          id="passcode"
          name="passcode"
          type="password"
          autoComplete="current-password"
          required
          value={passcode}
          onChange={(event) => setPasscode(event.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={pending}>
          Continue
        </Button>
      </form>
    </main>
  );
}
