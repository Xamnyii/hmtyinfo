import { Mic } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function Index() {
  const [query, setQuery] = useState("");
  const [isListening, setIsListening] = useState(false);

  const handleMicClick = () => {
    setIsListening((prev) => {
      const next = !prev;
      toast(next ? "Escuchando..." : "Micrófono desactivado");
      return next;
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    toast(`Investigando: "${trimmed}"`);
    setQuery("");
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-10 sm:gap-12">
      <div className="relative flex items-center justify-center">
        <div
          className={cn(
            "animate-orb-glow absolute h-64 w-64 rounded-full blur-3xl sm:h-80 sm:w-80",
            isListening && "animate-none opacity-100",
          )}
          style={{
            background:
              "radial-gradient(circle, hsl(var(--brand-orb-edge)) 0%, transparent 72%)",
          }}
        />
        <div
          className="animate-orb-breathe relative h-56 w-56 rounded-full shadow-2xl sm:h-72 sm:w-72"
          style={{
            background:
              "radial-gradient(circle at 50% 38%, #050505 0%, #050505 52%, hsl(var(--brand-orb-edge)) 100%)",
          }}
        />
      </div>

      <button
        type="button"
        onClick={handleMicClick}
        aria-pressed={isListening}
        aria-label={isListening ? "Detener escucha" : "Activar micrófono"}
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all",
          isListening
            ? "scale-110 bg-primary text-primary-foreground ring-4 ring-primary/30"
            : "bg-foreground/80 text-background hover:bg-foreground",
        )}
      >
        <Mic className="h-6 w-6" />
      </button>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xl"
        aria-label="Buscar o investigar"
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          type="text"
          placeholder="Investiga..."
          className="w-full rounded-full border border-foreground/25 bg-card/60 px-5 py-3 text-sm text-foreground placeholder:text-muted-foreground shadow-sm outline-none backdrop-blur transition-colors focus:border-primary"
        />
      </form>
    </div>
  );
}
