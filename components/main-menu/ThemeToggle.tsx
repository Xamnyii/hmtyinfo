"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Cambiar entre modo claro y oscuro"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="relative flex h-8 w-16 shrink-0 items-center rounded-full bg-ramrod-primary px-1 shadow-inner transition-colors"
    >
      <Sun className="absolute left-1.5 h-4 w-4 text-ramrod-primary-foreground/70" />
      <Moon className="absolute right-1.5 h-4 w-4 text-ramrod-primary-foreground/70" />
      <span
        className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-md transition-transform duration-300${isDark ? " translate-x-8" : ""}`}
      >
        {isDark ? (
          <Moon className="h-3.5 w-3.5 text-ramrod-foreground" />
        ) : (
          <Sun className="h-3.5 w-3.5 text-ramrod-foreground" />
        )}
      </span>
    </button>
  );
}