"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

export function Toaster() {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: "group toast group-[.toaster]:bg-ramrod-card group-[.toaster]:text-ramrod-foreground group-[.toaster]:border-ramrod-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-ramrod-muted-foreground",
          actionButton: "group-[.toast]:bg-ramrod-primary group-[.toast]:text-ramrod-primary-foreground",
          cancelButton: "group-[.toast]:bg-ramrod-muted group-[.toast]:text-ramrod-muted-foreground",
        },
      }}
    />
  );
}