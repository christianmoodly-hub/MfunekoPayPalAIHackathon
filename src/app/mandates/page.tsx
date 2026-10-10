import Link from "next/link";

import { MandateForm } from "./mandate-form";

export default function MandatesPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <p className="text-sm text-muted-foreground">
        <Link href="/" className="underline-offset-4 hover:underline">
          Mandate
        </Link>
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">Parse a mandate</h1>
      <p className="text-base leading-7 text-muted-foreground">
        The model proposes rules. You can edit them, then confirm. Amounts are integer USD cents.
      </p>
      <MandateForm />
    </main>
  );
}
