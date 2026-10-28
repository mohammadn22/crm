"use client";

import { useTransition } from "react";
import { updatePaymentFollowup } from "./payment-actions";  

type PaymentFollowupSelectProps = {
  paymentScheduleId: string;
  currentStatus: "first" | "second" | "third" | "paid" | null;
};

export default function PaymentFollowupSelect({
  paymentScheduleId,
  currentStatus,
}: PaymentFollowupSelectProps) {
  const [isPending, startTransition] = useTransition();

  function handleChange(
    event: React.ChangeEvent<HTMLSelectElement>
  ) {
    const status = event.target.value as
      | "first"
      | "second"
      | "third"
      | "paid";

    startTransition(async () => {
      await updatePaymentFollowup(
        paymentScheduleId,
        status
      );
    });
  }

  return (
    <select
      defaultValue={currentStatus ?? ""}
      onChange={handleChange}
      disabled={isPending}
      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-gray-500 disabled:cursor-wait disabled:opacity-60"
    >
      <option value="" disabled>
        انتخاب وضعیت
      </option>

      <option value="first">
        پیگیری اول
      </option>

      <option value="second">
        پیگیری دوم
      </option>

      <option value="third">
        پیگیری سوم
      </option>

      <option value="paid">
        پرداخت شد
      </option>
    </select>
  );
}