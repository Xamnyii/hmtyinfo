import Link from "next/link";
import { BarChart3, Bell, History, SlidersHorizontal } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

export function MainHeader() {
  return (
    <header className="relative z-10 overflow-hidden">
      <div aria-hidden="true" className="ramrod-corner" />

      <div className="relative flex items-center justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-5">
        <div className="flex items-center gap-2">
          <Link
            href="/estadisticas"
            aria-label="Estadísticas"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-ramrod-foreground/25 text-ramrod-foreground transition-colors hover:bg-ramrod-foreground/10"
          >
            <BarChart3 className="h-4 w-4" />
          </Link>
          <Link
            href="/historial"
            aria-label="Historial"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ramrod-foreground/25 text-ramrod-foreground transition-colors hover:bg-ramrod-foreground/10"
          >
            <History className="h-4 w-4" />
          </Link>
        </div>

        <h1 className="text-lg font-extrabold text-ramrod-foreground sm:text-xl">
          RamRod
        </h1>

        <div className="flex items-center gap-3">
          <Link
            href="/notificaciones"
            aria-label="Notificaciones"
            className="text-ramrod-foreground transition-opacity hover:opacity-70"
          >
            <Bell className="h-5 w-5" />
          </Link>

          <Link href="/perfil" className="hidden text-right leading-tight sm:block">
            <span className="block text-xs font-bold text-ramrod-foreground">
              Usuario
            </span>
            <span className="block text-[11px] font-medium text-ramrod-primary">
              Activo
            </span>
          </Link>

          <Link
            href="/perfil"
            aria-label="Perfil"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-ramrod-foreground/25 bg-ramrod-primary/15 text-xs font-bold text-ramrod-foreground"
          >
            U
          </Link>

          <Link
            href="/ajustes"
            aria-label="Ajustes"
            className="text-ramrod-foreground transition-opacity hover:opacity-70"
          >
            <SlidersHorizontal className="h-5 w-5" />
          </Link>
        </div>
      </div>

      <div className="relative flex justify-end px-4 pt-3 sm:px-6">
        <ThemeToggle />
      </div>
    </header>
  );
}