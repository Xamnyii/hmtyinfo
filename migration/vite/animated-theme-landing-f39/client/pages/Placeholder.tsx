import { Compass } from "lucide-react";

export default function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Compass className="h-7 w-7" />
      </div>
      <h2 className="text-2xl font-extrabold text-foreground">{title}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Esta sección todavía no está lista. Sigue conversando con Fusion para
        pedir el contenido de esta página y la construiremos juntos.
      </p>
    </div>
  );
}
