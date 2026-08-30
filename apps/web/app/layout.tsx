import type { Metadata } from "next";
import "./styles.css";
import "./profile-responsive.css";
import { Suspense } from "react";
import RoleRouteGuard from "./components/RoleRouteGuard";
import MobileHomeNav from "./components/MobileHomeNav";
import NavigationTransitions from "./components/NavigationTransitions";
import WebThemeProvider from "./components/WebThemeProvider";
export const metadata: Metadata = {
  title: "NOCTURNE — live differently",
  description: "Billetterie sociale pour la nuit.",
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <WebThemeProvider>
          <Suspense>
            <RoleRouteGuard />
            <MobileHomeNav />
            <NavigationTransitions />
          </Suspense>
          {children}
        </WebThemeProvider>
      </body>
    </html>
  );
}
