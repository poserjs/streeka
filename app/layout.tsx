import type { ReactNode } from "react";

export const metadata = {
  title: "Streeka",
  description: "A starter Next.js application.",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
