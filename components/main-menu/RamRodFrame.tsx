import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { AnimatedBackground } from "./AnimatedBackground";
import { MainHeader } from "./MainHeader";

export function RamRodFrame({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <div className="ramrod relative flex min-h-screen flex-col overflow-hidden">
        <AnimatedBackground />
        <MainHeader />
        <main className="relative z-10 flex flex-1 flex-col">{children}</main>
      </div>
      <Toaster />
    </ThemeProvider>
  );
}