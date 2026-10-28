
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./global.css"

const ibmPlexSansArabic = localFont({
  src: [
    {
      path: "./fonts/IBMPlexSansArabic-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/IBMPlexSansArabic-Medium.ttf",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/IBMPlexSansArabic-Bold.ttf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-ibm-plex-sans-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ورود به سامانه",
  description: "ورود امن به پنل مدیریت",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fa"
      dir="rtl"
      className={ibmPlexSansArabic.variable}
    >
      <body>{children}</body>
    </html>
  );
}
