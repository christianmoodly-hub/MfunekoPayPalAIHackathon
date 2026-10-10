import { Suspense } from "react";

import { WalletScreen } from "@/components/wallet/wallet-screen";

export default function Page() {
  return (
    <Suspense fallback={<p className="px-8 py-6 font-mono text-[11px] text-[#545f73]">Checking the PayPal sandbox vault…</p>}>
      <WalletScreen />
    </Suspense>
  );
}
