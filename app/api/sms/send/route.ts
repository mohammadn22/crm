import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

function normalizeIranianMobile(value: string): string | null {
  let phone = value.replace(/[\s()-]/g, "");

  if (phone.startsWith("0098")) {
    phone = `+98${phone.slice(4)}`;
  } else if (phone.startsWith("98")) {
    phone = `+${phone}`;
  } else if (phone.startsWith("09")) {
    phone = `+98${phone.slice(1)}`;
  } else if (phone.startsWith("9")) {
    phone = `+98${phone}`;
  }

  return /^\+989\d{9}$/.test(phone) ? phone : null;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "لطفاً ابتدا وارد حساب کاربری شوید." },
        { status: 401 },
      );
    }

    const { phone, message, rowType, rowId } = await request.json();

    if (
      typeof phone !== "string" ||
      typeof message !== "string" ||
      !message.trim() ||
      !["payment", "renewal", "debtor"].includes(rowType) ||
      typeof rowId !== "string"
    ) {
      return NextResponse.json(
        { error: "اطلاعات پیامک معتبر نیست." },
        { status: 400 },
      );
    }

    const recipient = normalizeIranianMobile(phone);

    if (!recipient) {
      return NextResponse.json(
        { error: "شماره موبایل معتبر نیست." },
        { status: 400 },
      );
    }

    const apiKey = process.env.TEXTBEE_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "کلید API پیامک تنظیم نشده است..." },
        { status: 500 },
      );
    }

    const response = await fetch(
      "https://api.textbee.dev/api/v1/gateway/send-sms",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          recipients: [recipient],
          message: message.trim(),
        }),
      },
    );

    const result = await response.json();

    if (!response.ok || result?.success === false || result?.data?.success === false) {
      return NextResponse.json(
        {
          error: result?.message || result?.error || "ارسال پیامک ناموفق بود.",
        },
        { status: 502 },
      );
    }

    const batchId = result?.data?.smsBatchId ?? null;

    const { error: saveError } = await supabase
      .from("sms_history")
      .insert({
        row_type: rowType,
        row_id: rowId,
        recipient,
        message: message.trim(),
        sms_batch_id: batchId,
        status: "accepted",
      });

    if (saveError) {
      console.error("SMS history save error:", saveError);

      return NextResponse.json(
        {
          error: "پیامک پذیرفته شد، اما ذخیره سابقه آن ناموفق بود.",
          accepted: true,
          smsBatchId: batchId,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      recipient,
      smsBatchId: batchId,
      status: "accepted",
    });
  } catch (error) {
    console.error("SMS sending error:", error);

    return NextResponse.json(
      { error: "در ارسال پیامک خطایی رخ داد." },
      { status: 500 },
    );
  }
}