import { Suspense } from "react";

import { EnterForm } from "./enter-form";

export default function EnterPage() {
  return (
    <Suspense>
      <EnterForm />
    </Suspense>
  );
}
