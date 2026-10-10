import { Suspense } from "react";

import { RunScreen } from "@/components/runs/run-screen";

export default function Page(props: PageProps<"/runs/[id]">) {
  return (
    <Suspense fallback={<p className="px-8 py-6 font-mono text-[11px] text-[#545f73]">Loading the execution trace…</p>}>
      <RunRoute params={props.params} />
    </Suspense>
  );
}

async function RunRoute({ params }: { params: PageProps<"/runs/[id]">["params"] }) {
  const { id } = await params;
  return <RunScreen id={id} />;
}
