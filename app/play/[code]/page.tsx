"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import LogoLoader from "@/components/LogoLoader";

/* ===== Types ===== */

type Room = {
  id: string;
  code: string;
  status: string;
  host_user_id: string | null;
  current_round_id: string | null;
};

type Player = {
  id: string;
  room_id: string;
  display_name: string;
  truth_statement: string | null;
  has_spoken: boolean;
};

type Round = {
  id: string;
  room_id: string;
  speaker_player_id: string;
  revealed: boolean;
  reveal_truth: boolean | null;
};

type Vote = {
  id: string;
  round_id: string;
  voter_player_id: string;
  vote: "truth" | "lie";
};

/* ===== Component ===== */

export default function PlayPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = params.code;

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [roundsAll, setRoundsAll] = useState<Round[]>([]);
  const [votesAll, setVotesAll] = useState<Vote[]>([]);
  const [status, setStatus] = useState("");
  const [overlay, setOverlay] = useState<string | null>(null);

  /* ===== Fetch ===== */

  async function fetchAll() {
    if (!code) return;

    const { data: roomRow, error: roomErr } = await supabase
      .from("rooms")
      .select("id, code, status, host_user_id, current_round_id")
      .eq("code", code)
      .maybeSingle();

    if (roomErr || !roomRow) {
      setStatus("החדר לא נמצא");
      return;
    }

    setRoom(roomRow as Room);

    const { data: playersRows } = await supabase
      .from("players")
      .select("id, room_id, display_name, truth_statement, has_spoken")
      .eq("room_id", roomRow.id)
      .order("created_at", { ascending: true });

    setPlayers((playersRows ?? []) as Player[]);

    const { data: roundsRows } = await supabase
      .from("rounds")
      .select("id, room_id, speaker_player_id, revealed, reveal_truth")
      .eq("room_id", roomRow.id);

    const allRounds = (roundsRows ?? []) as Round[];
    setRoundsAll(allRounds);

    const roundIds = allRounds.map((r) => r.id);

    if (roundIds.length) {
      const { data: votesRows } = await supabase
        .from("votes")
        .select("id, round_id, voter_player_id, vote")
        .in("round_id", roundIds);

      setVotesAll((votesRows ?? []) as Vote[]);
    } else {
      setVotesAll([]);
    }

    setStatus("");
  }

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  /* ===== חישוב המצנח ===== */

  const matznach = useMemo(() => {
    const mistakesBySpeaker = new Map<string, number>();

    for (const r of roundsAll) {
      if (!r.revealed || r.reveal_truth === null) continue;

      const votesForRound = votesAll.filter((v) => v.round_id === r.id);

      let mistakes = 0;
      for (const v of votesForRound) {
        const voteIsTruth = v.vote === "truth";
        const correctIsTruth = r.reveal_truth === true;
        if (voteIsTruth !== correctIsTruth) mistakes++;
      }

      const prev = mistakesBySpeaker.get(r.speaker_player_id) ?? 0;
      mistakesBySpeaker.set(r.speaker_player_id, prev + mistakes);
    }

    if (mistakesBySpeaker.size === 0) return null;

    let bestId: string | null = null;
    let bestScore = -1;

    for (const [pid, score] of mistakesBySpeaker.entries()) {
      if (score > bestScore) {
        bestScore = score;
        bestId = pid;
      }
    }

    const winner = players.find((p) => p.id === bestId);

    return {
      playerId: bestId,
      name: winner?.display_name ?? "שחקן/ית",
      mistakes: bestScore,
    };
  }, [roundsAll, votesAll, players]);

  /* ===== מסך סיום ===== */

  if (room?.status === "finished") {
    return (
      <AppShell>
        <div className="game-card">
          <div className="card-inner">
            <div className="card-title text-center">המשחק נגמר 🎉</div>

            <div className="card-sub text-center mt-3">
              {matznach ? (
                <>
                  🏆 <b>{matznach.name}</b> הוא/היא המצנח!  
                  <br />
                  {matznach.mistakes} משתתפים טעו
                </>
              ) : (
                "תודה ששיחקתם!"
              )}
            </div>

            <button
              className="capsule capsule-dark w-full mt-4"
              onClick={() => {
                localStorage.removeItem("truth_or_lie_player_id");
                router.push("/");
              }}
            >
              משחק חדש
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  /* ===== טעינה / fallback ===== */

  if (!room) {
    return (
      <AppShell>
        {overlay && <LogoLoader label={overlay} />}
        <div className="game-card">
          <div className="card-inner">
            <div className="card-title text-center">טוען…</div>
            {status && <div className="card-sub text-center">{status}</div>}
          </div>
        </div>
      </AppShell>
    );
  }

  /* ===== המשך המשחק (כמו שהיה אצלך) ===== */

  return (
    <AppShell>
      {overlay && <LogoLoader label={overlay} />}
      <div className="game-card">
        <div className="card-inner">
          {/* כאן נשאר כל ה־UI והלוגיקה הקיימים שלך */}
          <div className="card-title text-center">המשחק בעיצומו…</div>
        </div>
      </div>
    </AppShell>
  );
}
