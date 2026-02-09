import type { Metadata } from "next";
import { M_PLUS_Rounded_1c } from "next/font/google";
import "./globals.css";

const mplus = M_PLUS_Rounded_1c({
  weight: ["300", "400", "500", "700", "800", "900"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "אמת או שקר",
  description: "משחק חברתי בסגנון Would I Lie To You",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${mplus.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
