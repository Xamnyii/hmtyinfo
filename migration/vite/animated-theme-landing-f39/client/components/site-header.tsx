import { BarChart3, Bell, History, SlidersHorizontal } from "lucide-react";
import { Link } from "react-router-dom";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return (
    <header className="relative z-10 overflow-hidden">
      <div
        className="pointer-events-none absolute right-0 top-0 h-28 w-28 sm:h-32 sm:w-32"
        style={{
          background: "hsl(var(--brand-corner))",
          clipPath: "polygon(100% 0, 100% 100%, 0 0)",
        }}
      />

      <div className="relative flex items-center justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-5">
        <div className="flex items-center gap-2">
          <Link
            to="/estadisticas"
            aria-label="Estadísticas"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-foreground/25 text-foreground transition-colors hover:bg-foreground/10"
          >
            <BarChart3 className="h-4 w-4" />
          </Link>
          <Link
            to="/historial"
            aria-label="Historial"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-foreground/25 text-foreground transition-colors hover:bg-foreground/10"
          >
            <History className="h-4 w-4" />
          </Link>
        </div>

        <h1 className="text-lg font-extrabold tracking-tight text-foreground sm:text-xl">
          RamRod
        </h1>

        <div className="flex items-center gap-3">
          <Link
            to="/notificaciones"
            aria-label="Notificaciones"
            className="text-foreground transition-opacity hover:opacity-70"
          >
            <Bell className="h-5 w-5" />
          </Link>

          <Link
            to="/perfil"
            className="hidden text-right leading-tight sm:block"
          >
            <span className="block text-xs font-bold text-foreground">
              Usuario
            </span>
            <span className="block text-[11px] font-medium text-primary">
              Activo
            </span>
          </Link>

          <Link
            to="/perfil"
            aria-label="Perfil"
            className="h-8 w-8 overflow-hidden rounded-full border border-foreground/25"
          >
            <img
              src="https://api.dicebear.com/7.x/thumbs/svg?seed=ramrod&backgroundColor=transparent"
              alt="Avatar de usuario"
              className="h-full w-full object-cover"
            />
          </Link>

          <Link
            to="/ajustes"
            aria-label="Ajustes"
            className="text-foreground transition-opacity hover:opacity-70"
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
