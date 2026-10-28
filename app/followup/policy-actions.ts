"use server";

import { createClient } from "@/lib/supabase-server";

export type PolicyFollowupStatus =
  | "first"
  | "second"
  | "third"
  | "done";

export async function savePolicyFollowup(
  policyId: string,
  status: PolicyFollowupStatus,
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("policy_followups")
    .upsert(
      {
        policy_id: policyId,
        status,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "policy_id",
      },
    );

  if (error) {
    console.error("Policy follow-up update error:", error);
    return {
      success: false as const,
      error: "خطا در ذخیره وضعیت پیگیری تمدید.",
    };
  }

  return { success: true as const };
}