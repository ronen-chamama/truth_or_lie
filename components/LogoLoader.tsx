"use client";

const LOGO_SRC = "/logo-small.png";

export default function LogoLoader({ label = "טוען..." }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm">
      <div className="game-card">
        <div className="card-inner flex flex-col items-center gap-3">
        <img src={LOGO_SRC} alt="אמת או שקר" className="w-20 h-20 logo-spin" />
        <div className="text-lg font-extrabold tracking-tight">{label}</div>
        <div className="text-sm opacity-70">רגע…</div>
        </div>
      </div>
    </div>
  );
}
