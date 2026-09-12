import { Outlet } from "react-router-dom";
import { AnimatedBackground } from "@/components/animated-background";
import { SiteHeader } from "@/components/site-header";

export function Layout() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <AnimatedBackground />
      <SiteHeader />
      <main className="relative z-10 flex flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}
