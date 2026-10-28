
import { createClient } from "@/lib/supabase-server";
import { toGregorian, toJalaali } from "jalaali-js";
import AppShell from "../components/AppShell";
import PaymentFollowupSelect from "./PaymentFollowupSelect";
import PolicyFollowupSelect from "./PolicyFollowupSelect";

type Relation<T> = T | T[] | null;

type Customer = {
  full_name: string;
  mobile: string;
};

type Policy = {
  id?: string;
  policy_number: string;
  policy_type: string;
  customers: Relation<Customer>;
};

type Allocation = {
  allocated_amount: number | string;
};

type PaymentSchedule = {
  id: string;
  amount_due: number | string;
  due_date: string;
  description: string;
  paid: boolean;
  policies: Relation<Policy>;
  transaction_allocations: Allocation[] | null;
};

type RenewalPolicy = {
  id: string;
  policy_number: string;
  policy_type: string;
  end_date: string;
  customers: Relation<Customer>;
};

type FollowupStatus = {
  payment_schedule_id: string;
  status: "first" | "second" | "third" | "paid";
};

type RenewalFollowupStatus = "first" | "second" | "third" | "done";

type RenewalFollowupRecord = {
  policy_id: string;
  status: RenewalFollowupStatus;
};

function getRelation<T>(value: Relation<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function getToday(): string {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return makeJalaliDate(get("year"), get("month"), get("day"));
}

function makeJalaliDate(
  year: number,
  month: number,
  day: number,
): string {
  return `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}

function addDays(value: string, days: number): string {
  const [jy, jm, jd] = value.split("/").map(Number);
  const { gy, gm, gd } = toGregorian(jy, jm, jd);

  const date = new Date(Date.UTC(gy, gm - 1, gd + days));
  const result = toJalaali(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );

  return makeJalaliDate(result.jy, result.jm, result.jd);
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("/").map(Number);

  return new Intl.DateTimeFormat("fa-IR", {
    calendar: "persian",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(
    ...(() => {
      const { gy, gm, gd } = toGregorian(year, month, day);
      return [gy, gm - 1, gd] as [number, number, number];
    })(),
  )));
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("fa-IR", {
    maximumFractionDigits: 0,
  }).format(value);
}

function getCustomer(policy: Policy | RenewalPolicy | null) {
  return policy ? getRelation(policy.customers) : null;
}

const tableHead =
  "px-5 py-4 text-xs font-bold text-foreground/60 whitespace-nowrap";

const tableCell =
  "px-5 py-4 text-sm align-middle";

export default async function FollowUpPage() {
  const supabase = await createClient();

  const today = getToday();
  const paymentEndDate = addDays(today, 3);
  const renewalEndDate = addDays(today, 10);

  const { data: paymentData, error: paymentError } = await supabase
    .from("payment_schedule")
    .select(`
      id,
      amount_due,
      due_date,
      description,
      paid,
      policies!inner (
        policy_number,
        policy_type,
        customers!inner (
          full_name,
          mobile
        )
      ),
      transaction_allocations (
        allocated_amount
      )
    `)
    .gte("due_date", today)
    .lte("due_date", paymentEndDate)
    .order("due_date", { ascending: true });

  const { data: renewalData, error: renewalError } = await supabase
    .from("policies")
    .select(`
      id,
      policy_number,
      policy_type,
      end_date,
      customers!inner (
        full_name,
        mobile
      )
    `)
    .gte("end_date", today)
    .lte("end_date", renewalEndDate)
    .order("end_date", { ascending: true });

  if (paymentError) {
    console.error("Payment follow-up query:", paymentError.message);
  }

  if (renewalError) {
    console.error("Renewal follow-up query:", renewalError.message);
  }

  const paymentSchedules =
    (paymentData ?? []) as unknown as PaymentSchedule[];

  const renewalPoliciesBase =
  (renewalData ?? []) as unknown as RenewalPolicy[];

const renewalPolicyIds = renewalPoliciesBase.map((policy) => policy.id);

let renewalStatuses: RenewalFollowupRecord[] = [];

if (renewalPolicyIds.length > 0) {
  const { data, error } = await supabase
    .from("policy_followups")
    .select("policy_id, status")
    .in("policy_id", renewalPolicyIds);

  if (error) {
    console.error("Policy follow-up statuses:", error.message);
  } else if (data) {
    renewalStatuses = data as RenewalFollowupRecord[];
  }
}

const renewalStatusById = new Map(
  renewalStatuses.map((item) => [item.policy_id, item.status]),
);

const renewalPolicies = renewalPoliciesBase
  .map((policy) => ({
    ...policy,
    savedStatus: renewalStatusById.get(policy.id) ?? null,
  }))
  .filter((policy) => policy.savedStatus !== "done");

  const scheduleIds = paymentSchedules.map((item) => item.id);

  let statuses: FollowupStatus[] = [];

  if (scheduleIds.length > 0) {
    const { data, error } = await supabase
      .from("payment_followups")
      .select("payment_schedule_id, status")
      .in("payment_schedule_id", scheduleIds);

    if (!error && data) {
      statuses = data as FollowupStatus[];
    }
  }

  const statusById = new Map(
    statuses.map((item) => [
      item.payment_schedule_id,
      item.status,
    ]),
  );

  const outstandingPayments = paymentSchedules
    .map((schedule) => {
      const policy = getRelation(schedule.policies);
      const customer = getCustomer(policy);

      const amountDue = Number(schedule.amount_due) || 0;
      const allocated = (schedule.transaction_allocations ?? []).reduce(
        (sum, item) => sum + (Number(item.allocated_amount) || 0),
        0,
      );

      return {
        ...schedule,
        policy,
        customer,
        outstanding: Math.max(0, amountDue - allocated),
        savedStatus: statusById.get(schedule.id) ?? null,
      };
    })
    .filter(
      (item) =>
        !item.paid &&
        item.outstanding > 0 &&
        item.savedStatus !== "paid",
    );

  const totalOutstanding = outstandingPayments.reduce(
    (sum, item) => sum + item.outstanding,
    0,
  );

  const sectionClass =
    "overflow-hidden rounded-2xl border border-primary/10 bg-background shadow-sm";

  return (
    <AppShell>
      <main
        dir="rtl"
        className="min-h-full bg-background p-4 text-foreground sm:p-6 lg:p-8"
      >
        <div className="mx-auto w-full max-w-7xl space-y-8">

          {/* Page heading */}
          <header className="relative overflow-hidden rounded-2xl bg-primary p-6 text-primary-foreground sm:p-8">
            <div className="absolute -left-10 -top-16 h-48 w-48 rounded-full bg-secondary/15 blur-2xl" />
            <div className="absolute -bottom-20 right-1/3 h-40 w-40 rounded-full bg-accent/15 blur-2xl" />

            <div className="relative">
              <div className="mb-3 flex items-center gap-2 text-sm text-primary-foreground/70">
                <span className="h-2 w-2 rounded-full bg-secondary" />
                مدیریت و پیگیری
              </div>

              <h1 className="text-2xl font-bold sm:text-3xl">
                مرکز پیگیری بیمه‌نامه‌ها
              </h1>
            </div>
          </header>

          {/* Summary cards */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl border border-primary/10 bg-background p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-foreground/60">
                    اقساط نیازمند پیگیری
                  </p>
                  <p className="mt-3 text-3xl font-bold tabular-nums">
                    {formatMoney(outstandingPayments.length)}
                  </p>
                  <p className="mt-2 text-xs text-foreground/50">
                    سررسید تا سه روز آینده
                  </p>
                </div>

                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-accent">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-6 w-6"
                    aria-hidden="true"
                  >
                    <rect x="3" y="5" width="18" height="16" rx="2" />
                    <path d="M16 3v4M8 3v4M3 10h18M8 15h3" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-primary/10 bg-background p-5 shadow-sm sm:col-span-2 xl:col-span-1">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-foreground/60">
                    بیمه‌نامه‌های نزدیک به تمدید
                  </p>
                  <p className="mt-3 text-3xl font-bold tabular-nums">
                    {formatMoney(renewalPolicies.length)}
                  </p>
                  <p className="mt-2 text-xs text-foreground/50">
                    انقضا تا ده روز آینده
                  </p>
                </div>

                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/15 text-secondary">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-6 w-6"
                    aria-hidden="true"
                  >
                    <path d="M12 3 20 6v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3Z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </div>
              </div>
            </div>
          </section>

          {/* Payment follow-up table */}
          <section className={sectionClass}>
            <div className="flex flex-col gap-4 border-b border-primary/10 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 h-10 w-1 shrink-0 rounded-full bg-accent" />
                <div>
                  <h2 className="text-lg font-bold">
                    پیگیری پرداخت‌ها
                  </h2>
                  <p className="mt-1 text-sm text-foreground/60">
                    اقساط پرداخت‌نشده با سررسید امروز تا سه روز آینده
                  </p>
                </div>
              </div>

              <span className="inline-flex w-fit items-center gap-2 rounded-lg bg-accent/15 px-3 py-2 text-sm font-semibold text-foreground">
                <span className="h-2 w-2 rounded-full bg-accent" />
                {formatMoney(outstandingPayments.length)} مورد
              </span>
            </div>

            {outstandingPayments.length === 0 ? (
              <div className="flex flex-col items-center px-5 py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary/15 text-secondary">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-7 w-7"
                    aria-hidden="true"
                  >
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                </div>
                <h3 className="mt-4 font-bold">
                  پرداختی برای پیگیری وجود ندارد
                </h3>
                <p className="mt-2 text-sm text-foreground/60">
                  در این بازه قسط پرداخت‌نشده‌ای پیدا نشد.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-right">
                  <thead className="bg-primary/[0.035]">
                    <tr className="border-b border-primary/10">
                      <th className={tableHead}>مشتری</th>
                      <th className={tableHead}>بیمه‌نامه</th>
                      <th className={tableHead}>سررسید</th>
                      <th className={tableHead}>مانده پرداخت</th>
                      <th className={tableHead}>وضعیت پیگیری</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-primary/10">
                    {outstandingPayments.map((item) => (
                      <tr
                        key={item.id}
                        className="transition-colors hover:bg-secondary/[0.045]"
                      >
                        <td className={tableCell}>
                          <div className="font-semibold">
                            {item.customer?.full_name ?? "—"}
                          </div>
                          <div className="mt-1 text-xs text-foreground/55">
                            {item.customer?.mobile ?? "شماره ثبت نشده"}
                          </div>
                        </td>

                        <td className={tableCell}>
                          <div className="font-medium">
                            {item.policy?.policy_number ?? "—"}
                          </div>
                          <div className="mt-1 text-xs text-foreground/55">
                            {item.policy?.policy_type ?? ""}
                          </div>
                        </td>

                        <td className={tableCell}>
                          <span className="inline-flex whitespace-nowrap rounded-lg bg-accent/15 px-3 py-1.5 text-xs font-semibold">
                            {formatDate(item.due_date)}
                          </span>
                        </td>

                        <td className={tableCell}>
                          <div className="whitespace-nowrap font-bold tabular-nums text-danger">
                            {formatMoney(item.outstanding)}
                          </div>
                          <div className="mt-1 text-xs text-foreground/50">
                            تومان
                          </div>
                        </td>

                        <td className={tableCell}>
                          <PaymentFollowupSelect
                            paymentScheduleId={item.id}
                            currentStatus={item.savedStatus}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Renewal follow-up table */}
          <section className={sectionClass}>
            <div className="flex flex-col gap-4 border-b border-primary/10 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 h-10 w-1 shrink-0 rounded-full bg-secondary" />
                <div>
                  <h2 className="text-lg font-bold">
                    پیگیری تمدید بیمه‌نامه‌ها
                  </h2>
                  <p className="mt-1 text-sm text-foreground/60">
                    بیمه‌نامه‌هایی که تا ده روز آینده به تاریخ انقضا می‌رسند
                  </p>
                </div>
              </div>

              <span className="inline-flex w-fit items-center gap-2 rounded-lg bg-secondary/15 px-3 py-2 text-sm font-semibold">
                <span className="h-2 w-2 rounded-full bg-secondary" />
                {formatMoney(renewalPolicies.length)} مورد
              </span>
            </div>

            {renewalPolicies.length === 0 ? (
              <div className="flex flex-col items-center px-5 py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary/15 text-secondary">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-7 w-7"
                    aria-hidden="true"
                  >
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                </div>
                <h3 className="mt-4 font-bold">
                  تمدیدی در این بازه وجود ندارد
                </h3>
                <p className="mt-2 text-sm text-foreground/60">
                  در حال حاضر بیمه‌نامه‌ای برای تمدید در این بازه پیدا نشد.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-right">
                  <thead className="bg-primary/[0.035]">
                    <tr className="border-b border-primary/10">
                      <th className={tableHead}>مشتری</th>
                      <th className={tableHead}>بیمه‌نامه</th>
                      <th className={tableHead}>تاریخ انقضا</th>
                      <th className={tableHead}>تلفن تماس</th>
                      <th className={tableHead}>وضعیت پیگیری</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-primary/10">
                    {renewalPolicies.map((policy) => {
                      const customer = getCustomer(policy);

                      return (
                        <tr
                          key={policy.id}
                          className="transition-colors hover:bg-secondary/[0.045]"
                        >
                          <td className={tableCell}>
                            <span className="font-semibold">
                              {customer?.full_name ?? "—"}
                            </span>
                          </td>

                          <td className={tableCell}>
                            <div className="font-medium">
                              {policy.policy_number}
                            </div>
                            <div className="mt-1 text-xs text-foreground/55">
                              {policy.policy_type}
                            </div>
                          </td>

                          <td className={tableCell}>
                            <span className="inline-flex whitespace-nowrap rounded-lg bg-secondary/15 px-3 py-1.5 text-xs font-semibold">
                              {formatDate(policy.end_date)}
                            </span>
                          </td>

                          <td className={tableCell}>
                            {customer?.mobile ? (
                              <a
                                href={`tel:${customer.mobile}`}
                                className="inline-flex items-center gap-2 font-semibold text-foreground underline-offset-4 transition-colors hover:text-secondary hover:underline"
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                >
                                  <path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 11.2 19a19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z" />
                                </svg>
                                {customer.mobile}
                              </a>
                            ) : (
                              <span className="text-foreground/40">—</span>
                            )}
                          </td>
                          <td className={tableCell}>
  <PolicyFollowupSelect
    policyId={policy.id}
    currentStatus={policy.savedStatus}
  />
</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

        </div>
      </main>
    </AppShell>
  );
}
