"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** Re-renders the server page, which fetches a live quote from Arq. */
export default function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="btn"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      {pending ? "Actualizando…" : "Refrescar"}
    </button>
  );
}
