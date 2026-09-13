"use client";

import { Mic } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

export function RamRod() {
  const [query, setQuery] = useState("");
  const [isListening, setIsListening] = useState(false);

  const handleMicClick = () => {
    setIsListening((previousValue) => {
      const nextValue = !previousValue;
      toast(nextValue ? "Escuchando..." : "Micrófono desactivado");
      return nextValue;
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedQuery = query.trim();

    if (!trimmedQuery) return;

    toast(`Investigando: "${trimmedQuery}"`);
    setQuery("");
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-10 sm:gap-12">
      <div className="relative flex items-center justify-center">
        <div className={`ramrod-orb-glow${isListening ? " ramrod-orb-glow-active" : ""}`} />
        <div className="ramrod-orb" />
      </div>

      <button
        type="button"
        onClick={handleMicClick}
        aria-pressed={isListening}
        aria-label={isListening ? "Detener escucha" : "Activar micrófono"}
        className={`flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all${isListening ? " scale-110 bg-ramrod-primary text-ramrod-primary-foreground ring-4 ring-ramrod-primary/30" : " bg-ramrod-foreground/80 text-ramrod-card hover:bg-ramrod-foreground"}`}
      >
        <Mic className="h-6 w-6" />
      </button>

      <form onSubmit={handleSubmit} className="w-full max-w-xl" aria-label="Buscar o investigar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          type="text"
          placeholder="Investiga..."
          className="w-full rounded-full border border-ramrod-foreground/25 bg-ramrod-card/60 px-5 py-3 text-sm text-ramrod-foreground placeholder:text-ramrod-muted-foreground shadow-sm outline-none backdrop-blur transition-colors focus:border-ramrod-primary"
        />
      </form>
    </div>
  );
}