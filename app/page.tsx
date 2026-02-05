"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import LogoLoader from "@/components/LogoLoader";
import { ensureAnonAuth, supabase } from "@/lib/supabase";

function cleanCode(s: string) {
  return s.replace(/\D/g, "").slice(0, 4);
}

function makeCode() {
  return Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
}

export default function HomePage() {
  const router = useRouter();

  const [joinCode, setJoinCode] = useState("");
  const [roomName, setRoomName] = useState("");
  const [overlay, setOverlay] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const canJoin = useMemo(() => joinCode.length === 4, [joinCode]);

  async function createRoom() {
    try {
      setStatus("");
      setOverlay("פותח חדר חדש…");

      await ensureAnonAuth();
      const { data: u, error: uErr } = await supabase.auth.getUser();
      if (uErr) throw uErr;

      const hostUserId = u.user?.id;
      if (!hostUserId) throw new Error("לא הצלחתי לזהות משתמש אנונימי");

      const name = roomName.trim() || "אמת או שקר";

      // נסה כמה פעמים כדי להימנע מהתנגשות קוד
      let lastErr: any = null;
      for (let i = 0; i < 12; i++) {
        const code = makeCode();

        const { error } = await supabase.from("rooms").insert({
          code,
          name,
          status: "lobby",
          host_user_id: hostUserId,
          current_round_id: null,
        });

        if (!error) {
          // המנהל גם שחקן: ממשיכים ל-join כדי שיכניס שם
          router.push(`/join/${code}`);
          return;
        }

        lastErr = error;
        const msg = String(error?.message ?? "").toLowerCase();
        if (!msg.includes("duplicate") && !msg.includes("unique")) break;
      }

      throw lastErr ?? new Error("לא הצלחתי ליצור חדר");
    } catch (e: any) {
      setStatus("שגיאה בפתיחת חדר: " + (e?.message ?? String(e)));
    } finally {
      setOverlay(null);
    }
  }

  function goJoin() {
    setStatus("");
    router.push(`/join/${joinCode}`);
  }

  return (
    <AppShell>
      {overlay ? <LogoLoader label={overlay} /> : null}

      <div className="game-card">
        <div className="card-inner">
          <div className="card-title text-center">אמת או שקר</div>
          <div className="card-sub text-center">פתח משחק חדש או הצטרף עם קוד</div>

          {/* יצירת חדר */}
          <div className="mt-5 pill w-full flex-col gap-2">
            <div className="font-extrabold text-center">פתח משחק חדש</div>

            <input
              className="w-full pill text-center"
              placeholder="שם החדר (לא חובה)"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
            />

            <button className="capsule capsule-dark w-full" onClick={createRoom}>
              פתח חדר חדש
            </button>
          </div>

          {/* הצטרפות */}
          <div className="mt-4 pill w-full flex-col gap-2">
            <div className="font-extrabold text-center">הצטרף למשחק קיים</div>

            <input
              className="w-full pill text-center text-2xl tracking-widest"
              inputMode="numeric"
              placeholder="____"
              value={joinCode}
              onChange={(e) => setJoinCode(cleanCode(e.target.value))}
            />

            <button className="capsule capsule-dark w-full" disabled={!canJoin} onClick={goJoin}>
              הצטרפות עם קוד
            </button>
          </div>

          {status ? <div className="mt-3 card-sub text-center">{status}</div> : null}
        </div>
      </div>
    </AppShell>
  );
}
