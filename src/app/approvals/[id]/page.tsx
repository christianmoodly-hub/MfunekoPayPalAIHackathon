import { Suspense } from "react";

import { ApprovalScreen } from "@/components/approvals/approval-screen";

export default function Page(props: PageProps<"/approvals/[id]">) {
  return (
    <Suspense fallback={<p className="px-8 py-6 font-mono text-[11px] text-[#545f73]">Loading the approval…</p>}>
      <ApprovalRoute params={props.params} />
    </Suspense>
  );
}

async function ApprovalRoute({ params }: { params: PageProps<"/approvals/[id]">["params"] }) {
  const { id } = await params;
  return <ApprovalScreen id={id} />;
}
