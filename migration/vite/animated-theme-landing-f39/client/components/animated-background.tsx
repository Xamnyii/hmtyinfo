export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-[linear-gradient(135deg,hsl(var(--brand-bg-from)),hsl(var(--brand-bg-to)))] transition-colors duration-700">
      <div
        className="animate-blob-1 absolute -left-1/4 -top-1/4 h-[70vmax] w-[70vmax] rounded-full opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, hsl(var(--brand-blob-1)) 0%, transparent 70%)",
        }}
      />
      <div
        className="animate-blob-2 absolute -bottom-1/3 -right-1/4 h-[65vmax] w-[65vmax] rounded-full opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, hsl(var(--brand-blob-2)) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}
