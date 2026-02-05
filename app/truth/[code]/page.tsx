"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ensureAnonAuth, supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import LogoLoader from "@/components/LogoLoader";

export default function TruthPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = (params.code || "").toString();

  const [truth, setTruth] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  async function saveTruth() {
    const t = truth.trim();
    if (t.length < 6) return setStatus("נא לכתוב משפט אמת (לפחות 6 תווים)");

    try {
      setLoading("שומר...");
      setStatus("");
      await ensureAnonAuth();

      const { error } = await supabase.rpc("set_truth", {
        room_code: code,
        truth: t,
      });

      if (error) return setStatus("שגיאה: " + error.message);

      setStatus("נשמר! עוברים למשחק...");
      router.push(`/play/${code}`);
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
          <div className="card-title text-center">משפט אמת (חדר {code})</div>

          <textarea
            className="capsule min-h-44 text-right text-lg leading-relaxed"
            placeholder="כתוב משפט אמת מעניין ויוצא דופן עליך..."
            value={truth}
            onChange={(e) => setTruth(e.target.value)}
          />

          <button onClick={saveTruth} className="capsule capsule-dark">
            שמור והמשך
          </button>

          {status ? <div className="card-sub text-center">{status}</div> : null}
        </div>
      </div>
    </AppShell>
  );
}
