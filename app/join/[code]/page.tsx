"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ensureAnonAuth, supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import LogoLoader from "@/components/LogoLoader";

export default function JoinPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = (params.code || "").toString();

  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  async function join() {
    const trimmed = name.trim();
    if (code.length !== 4) return setStatus("קוד חדר לא תקין");
    if (trimmed.length < 2) return setStatus("נא להכניס שם (לפחות 2 תווים)");

    try {
      setLoading("מצטרף לחדר…");
      setStatus("");
      await ensureAnonAuth();

      const { data, error } = await supabase.rpc("join_room", {
        room_code: code,
        player_name: trimmed,
      });

      if (error) {
        setStatus("שגיאה: " + error.message);
        return;
      }

      // נשמור את ה-player_id במכשיר כדי לזהות את המשתתף בהמשך
      const playerId = data?.[0]?.player_id;
      if (playerId) localStorage.setItem("truth_or_lie_player_id", playerId);

      setStatus("הצטרפת! עכשיו נכניס משפט אמת...");
      router.push(`/truth/${code}`);
    } catch (e: any) {
      setStatus("שגיאה כללית: " + (e?.message ?? String(e)));
    } finally {
      setLoading(null);
    }
  }

  return (
    <AppShell>
      {loading ? <LogoLoader label={loading} /> : null}

      <div className="game-card">
        <div className="card-inner flex flex-col gap-3">
          <div className="card-title text-center">הצטרפות לחדר {code}</div>

          <input
            className="capsule text-center text-xl"
            placeholder="שם"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <button onClick={join} className="capsule capsule-dark">
            הצטרף
          </button>

          {status ? <div className="card-sub text-center">{status}</div> : null}
        </div>
      </div>
    </AppShell>
  );
}
