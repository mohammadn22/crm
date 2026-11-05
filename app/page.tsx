
"use client";
import { createClient } from "@/lib/supabase/client";
import { useState, useEffect } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  
async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();

  const supabase = createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: username,
    password,
  });

  if (error) {
    alert("ورود ناموفق بود: " + error.message);
    return;
  }

  window.location.href = "/dashboard";
}


  const [now, setNow] = useState(new Date());

useEffect(() => {
  const timer = setInterval(() => setNow(new Date()), 1000);
  return () => clearInterval(timer);
}, []);

  return (
    <main
      dir="rtl"
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F7F7FF] px-4 py-10 text-slate-800"
    >
      {/* Decorative background shapes */}
      <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-violet-300/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -left-20 h-80 w-80 rounded-full bg-orange-300/40 blur-3xl" />
      <div className="pointer-events-none absolute left-1/4 top-1/4 h-40 w-40 rounded-full bg-cyan-200/40 blur-3xl" />

      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[32px] border border-white/80 bg-white shadow-[0_24px_80px_-24px_rgba(79,70,229,0.22)] md:grid-cols-2">
        {/* Welcome panel */}
        <section className="relative hidden min-h-[590px] flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-10 text-white md:flex lg:p-12">
          <div className="absolute -left-20 top-32 h-64 w-64 rounded-full border border-white/10" />
          <div className="absolute -left-10 top-42 h-44 w-44 rounded-full border border-white/10" />
          <div className="absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-fuchsia-400/20 blur-2xl" />

          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-xl font-black text-indigo-600 shadow-lg">
              M
            </div>
            <div>
              <p className="text-lg font-extrabold">سامانه مدیریت دفتر بیمه</p>
            </div>
          </div>

          <div className="relative z-10 py-10">
            

            <h1 className="text-4xl font-black leading-[1.6] lg:text-5xl">
                {(() => {
                    const hour = new Date().getHours();

                    if (hour >= 5 && hour < 11) return "صبح بخیر";
                    if (hour >= 11 && hour < 13) return "ظهر بخیر";
                    if (hour >= 13 && hour < 19) return "عصر بخیر";
                    return "شب بخیر";
                })()}
                <br />
                <span className="text-amber-300">خوش آمدید!</span>
            </h1>
            <p className="mt-6 max-w-sm text-base leading-8 text-indigo-100">
            {now.toLocaleDateString("fa-IR", {
            weekday: "long",
            calendar: "persian",
            })}{" "}
            {now.toLocaleDateString("fa-IR", {
            day: "numeric",
            calendar: "persian",
            })}{" "}
            {now.toLocaleDateString("fa-IR", {
            month: "long",
            calendar: "persian",
            })}{" "}
            {now.toLocaleDateString("fa-IR", {
            year: "numeric",
            calendar: "persian",
            })}
            <br />
            <span className="text-2xl font-bold text-amber-300">
                {now.toLocaleTimeString("fa-IR", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
                })}
            </span>
            </p>

            <div className="mt-10 flex items-center gap-3">
              
            </div>
          </div>

          <p className="relative z-10 text-xs text-indigo-200">
            © ۱۴۰۵ — تمامی حقوق محفوظ است.
          </p>
        </section>

        {/* Login form */}
        <section className="flex items-center justify-center px-6 py-12 sm:px-10 lg:px-14">
          <div className="w-full max-w-md">
            <div className="mb-9 flex items-center gap-3 md:hidden">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-xl font-black text-white shadow-lg shadow-indigo-200">
                ن
              </div>
              <div>
                <p className="font-extrabold text-slate-800">بیمه ۴۶</p>
                <p className="text-xs text-slate-500">
                 سامانه آنلاین مدیریت دفتر بیمه
                </p>
              </div>
            </div>

            <div className="mb-8">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="h-7 w-7"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 6.75a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.25a7.5 7.5 0 0 1 15 0"
                  />
                </svg>
              </div>

              <h2 className="text-3xl font-black tracking-tight text-slate-900">
               ورود
              </h2>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label
                  htmlFor="username"
                  className="mb-2 block text-sm font-bold text-slate-700"
                >
                  نام کاربری
                </label>

                <div className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 transition-all focus-within:border-indigo-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-100">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    className="h-5 w-5 shrink-0 text-slate-400 transition-colors group-focus-within:text-indigo-600"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.75 6.75a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.25a7.5 7.5 0 0 1 15 0"
                    />
                  </svg>

                  <input
                    id="username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    placeholder="نام کاربری خود را وارد کنید"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    className="w-full bg-transparent py-4 text-sm text-slate-800 outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-bold text-slate-700"
                >
                  رمز عبور
                </label>

                <div className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 transition-all focus-within:border-indigo-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-100">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    className="h-5 w-5 shrink-0 text-slate-400 transition-colors group-focus-within:text-indigo-600"
                    aria-hidden="true"
                  >
                    <rect
                      x="5"
                      y="10"
                      width="14"
                      height="11"
                      rx="2.5"
                    />
                    <path
                      strokeLinecap="round"
                      d="M8 10V7a4 4 0 0 1 8 0v3"
                    />
                  </svg>

                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="رمز عبور خود را وارد کنید"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full bg-transparent py-4 text-sm text-slate-800 outline-none placeholder:text-slate-400"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="shrink-0 text-xs font-semibold text-slate-500 transition hover:text-indigo-600"
                    aria-label={
                      showPassword ? "مخفی کردن رمز عبور" : "نمایش رمز عبور"
                    }
                  >
                    {showPassword ? "مخفی کردن" : "نمایش"}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="group mt-3 flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-l from-indigo-600 via-violet-600 to-purple-600 px-5 py-4 font-bold text-white shadow-lg shadow-indigo-200/70 transition duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-indigo-200 active:translate-y-0"
              >
                ورود به حساب کاربری
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-5 w-5 transition-transform group-hover:-translate-x-1"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 12H5m7 7-7-7 7-7"
                  />
                </svg>
              </button>
            </form>

            <div className="mt-8 flex items-center gap-3 text-xs text-slate-400">
              <div className="h-px flex-1 bg-slate-100" />
              <span>ورود امن به سامانه</span>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
