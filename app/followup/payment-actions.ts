
"use server";

import { createClient } from "@/lib/supabase-server";

export async function updatePaymentFollowup(
  paymentScheduleId: string,
  status: "first" | "second" | "third" | "paid",
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("payment_followups")
    .upsert(
      {
        payment_schedule_id: paymentScheduleId,
        status,
      },
      {
        onConflict: "payment_schedule_id",
      },
    );

if (error) {
  console.error("Payment follow-up update error:", error);
  throw new Error(error.message);
}
}
