import AppShell from "@/components/AppShell";

export default function Loading() {
  return (
    <AppShell>
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/25 backdrop-blur-sm">
        <div className="game-card">
          <div className="card-inner flex flex-col items-center gap-4">
            <img src="/logo-small.png" alt="טוען" className="w-20 h-20 logo-spin" />
            <div className="card-title">מכין את השקרים…</div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
