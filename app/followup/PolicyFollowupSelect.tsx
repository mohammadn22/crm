
"use client";

import { useState, useTransition } from "react";
import {
  savePolicyFollowup,
  type PolicyFollowupStatus,
} from "./policy-actions";

const options: {
  value: PolicyFollowupStatus;
  label: string;
}[] = [
  { value: "first", label: "پیگیری اول" },
  { value: "second", label: "پیگیری دوم" },
  { value: "third", label: "پیگیری سوم" },
  { value: "done", label: "انجام شد" },
];

type Props = {
  policyId: string;
  currentStatus: PolicyFollowupStatus | null;
};

export default function PolicyFollowupSelect({
  policyId,
  currentStatus,
}: Props) {
  const [status, setStatus] = useState<
  PolicyFollowupStatus | ""
>(currentStatus ?? ""); 
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

function handleChange(nextStatus: PolicyFollowupStatus | "") {
  const previousStatus = status;

  setStatus(nextStatus);
  setErrorMessage("");

  if (nextStatus === "") return;

  startTransition(async () => {
    const result = await savePolicyFollowup(policyId, nextStatus);

    if (result?.error) {
      setStatus(previousStatus);
      setErrorMessage(result.error);
    }
  });
}

  return (
    <div className="min-w-32">
      <select
        value={status}
        disabled={isPending}
        onChange={(event) =>
          handleChange(event.target.value as PolicyFollowupStatus)
        }
        aria-label="وضعیت پیگیری تمدید بیمه‌نامه"
        className={`w-full rounded-xl border px-3 py-2 text-sm font-semibold outline-none transition-colors focus:ring-2 focus:ring-secondary/30 disabled:cursor-wait disabled:opacity-60 ${
          status === "done"
            ? "border-secondary/40 bg-secondary/10 text-foreground"
            : "border-primary/15 bg-background text-foreground hover:border-secondary/50"
        }`}
      >
        <option value="">انتخاب وضعیت</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {isPending && (
        <p className="mt-1 text-xs text-foreground/50">در حال ذخیره…</p>
      )}

      {errorMessage && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
