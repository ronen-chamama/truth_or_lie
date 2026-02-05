"use client";

import { ReactNode } from "react";

export default function AppShell({
  children,
  showLogo = true,
}: {
  children: ReactNode;
  showLogo?: boolean;
}) {
  return (
    <div className="app-screen">
      <div className="app-wrap">
        {showLogo ? (
          <div className="app-top">
            <img className="app-logo" src="/logo.png" alt="אמת או שקר" />
          </div>
        ) : null}

        {children}
      </div>
    </div>
  );
}
