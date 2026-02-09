"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ensureAnonAuth, supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import LogoLoader from "@/components/LogoLoader";

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
  prompt_type: "truth" | "lie";
  prompt_text: string;
  revealed: boolean;
  reveal_truth: boolean | null;
};

type Vote = {
  id: string;
  round_id: string;
  voter_player_id: string;
  vote: "truth" | "lie";
};

export default function PlayPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code || "").toString();
  const router = useRouter();

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [votes, setVotes] = useState<Vote[]>([]);

  // NEW: all rounds + votes for local winner calculation
  const [roundsAll, setRoundsAll] = useState<Round[]>([]);
  const [votesAll, setVotesAll] = useState<Vote[]>([]);

  const [meUserId, setMeUserId] = useState<string | null>(null);
  const [mePlayerId, setMePlayerId] = useState<string | null>(null);

  const [status, setStatus] = useState<string>("");
  const [overlay, setOverlay] = useState<string | null>(null);
  const [stampKey, setStampKey] = useState<number>(0);

  const isHost = useMemo(() => !!room?.host_user_id && room.host_user_id === meUserId, [room, meUserId]);

  const missingTruths = useMemo(
    () => players.filter((p) => !p.truth_statement || !p.truth_statement.trim()).length,
    [players]
  );

  const canStart = useMemo(() => players.length >= 2 && missingTruths === 0, [players.length, missingTruths]);

  const speaker = useMemo(() => {
    if (!round) return null;
    return players.find((p) => p.id === round.speaker_player_id) || null;
  }, [round, players]);

  const iAmSpeaker = useMemo(() => !!round && !!mePlayerId && round.speaker_player_id === mePlayerId, [round, mePlayerId]);

  const voteCounts = useMemo(() => {
    const t = votes.filter((v) => v.vote === "truth").length;
    const l = votes.filter((v) => v.vote === "lie").length;
    return { truth: t, lie: l };
  }, [votes]);

  const expectedVotes = useMemo(() => {
    if (!players.length) return 0;
    if (!round) return 0;
    return Math.max(players.length - 1, 0); // כולם חוץ מהקורא
  }, [players.length, round]);

  const myVote = useMemo(() => {
    if (!mePlayerId) return null;
    return votes.find((v) => v.voter_player_id === mePlayerId)?.vote ?? null;
  }, [votes, mePlayerId, stampKey]);

  // NEW: local matznach calculation
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

  async function fetchAll() {
    if (!code || code.length !== 4) {
      setRoom(null);
      setRound(null);
      setVotes([]);
      setPlayers([]);
      setRoundsAll([]);
      setVotesAll([]);
      setStatus(code ? "קוד חדר לא תקין" : "טוען…");
      return;
    }

    const { data: roomRow, error: roomErr } = await supabase
      .from("rooms")
      .select("id,code,status,host_user_id,current_round_id")
      .eq("code", code)
      .maybeSingle();

    if (roomErr) {
      setStatus("שגיאה בטעינת חדר: " + roomErr.message);
      return;
    }
    if (!roomRow) {
      setStatus("חדר לא נמצא");
      return;
    }
    setRoom(roomRow as Room);

    // players
    const { data: ps, error: pErr } = await supabase
      .from("players")
      .select("id,room_id,display_name,truth_statement,has_spoken")
      .eq("room_id", roomRow.id)
      .order("created_at", { ascending: true });

    if (pErr) {
      setStatus("שגיאה בטעינת שחקנים: " + pErr.message);
      return;
    }
    setPlayers((ps || []) as Player[]);

    // me player id from localStorage
    const stored = localStorage.getItem("truth_or_lie_player_id");
    if (stored) setMePlayerId(stored);

    // current round
    if (roomRow.current_round_id) {
      const { data: rd, error: rErr } = await supabase
        .from("rounds")
        .select("id,room_id,speaker_player_id,prompt_type,prompt_text,revealed,reveal_truth")
        .eq("id", roomRow.current_round_id)
        .maybeSingle();

      if (rErr) {
        setStatus("שגיאה בטעינת סבב: " + rErr.message);
        return;
      }
      setRound((rd as Round) || null);

      const { data: vs, error: vErr } = await supabase
        .from("votes")
        .select("id,round_id,voter_player_id,vote")
        .eq("round_id", roomRow.current_round_id);

      if (vErr) {
        setStatus("שגיאה בטעינת הצבעות: " + vErr.message);
        return;
      }
      setVotes((vs || []) as Vote[]);
    } else {
      setRound(null);
      setVotes([]);
    }

    // NEW: load all rounds for this room (for matznach)
    const { data: allRounds, error: allRoundsErr } = await supabase
      .from("rounds")
      .select("id,room_id,speaker_player_id,prompt_type,prompt_text,revealed,reveal_truth")
      .eq("room_id", roomRow.id);

    if (!allRoundsErr) {
      const rs = (allRounds || []) as Round[];
      setRoundsAll(rs);

      const ids = rs.map((r) => r.id);
      if (ids.length) {
        const { data: allVotes, error: allVotesErr } = await supabase
          .from("votes")
          .select("id,round_id,voter_player_id,vote")
          .in("round_id", ids);

        if (!allVotesErr) setVotesAll((allVotes || []) as Vote[]);
        else setVotesAll([]);
      } else {
        setVotesAll([]);
      }
    } else {
      // if this fails we can still play; just no matznach
      setRoundsAll([]);
      setVotesAll([]);
    }

    setStatus("");
  }

  useEffect(() => {
    (async () => {
      await ensureAnonAuth();
      const { data } = await supabase.auth.getUser();
      setMeUserId(data.user?.id ?? null);
      await fetchAll();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Realtime: rooms + players + rounds
  useEffect(() => {
    if (!room?.id) return;

    const ch = supabase
      .channel(`room:${room.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${room.id}` },
        () => fetchAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_id=eq.${room.id}` },
        () => fetchAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rounds", filter: `room_id=eq.${room.id}` },
        () => fetchAll()
      )
      .subscribe((s) => {
        console.log("[realtime]", s, "room", room.id);
      });

    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id]);

  // Realtime: votes for current round
  useEffect(() => {
    if (!room?.current_round_id) return;

    const chVotes = supabase
      .channel(`votes:${room.current_round_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "votes", filter: `round_id=eq.${room.current_round_id}` },
        () => fetchAll()
      )
      .subscribe((s) => {
        console.log("[realtime votes]", s, "round", room.current_round_id);
      });

    return () => {
      supabase.removeChannel(chVotes);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.current_round_id]);

  async function startGame() {
    if (!room) return;
    try {
      setOverlay("מתחיל משחק…");
      const { error } = await supabase.rpc("start_game", { room_code: code });
      if (error) setStatus("שגיאה: " + error.message);
    } finally {
      setOverlay(null);
    }
  }

  async function cast(v: "truth" | "lie") {
    try {
      setStampKey((k) => k + 1);
      setOverlay("שולח הצבעה…");
      const { error } = await supabase.rpc("cast_vote", { room_code: code, vote_value: v });
      if (error) setStatus("שגיאה: " + error.message);
      else setStatus("");
    } finally {
      setOverlay(null);
    }
  }

  async function reveal() {
    try {
      setOverlay("חושף…");
      const { error } = await supabase.rpc("reveal_round", { room_code: code });
      if (error) setStatus("שגיאה: " + error.message);
      else setStatus("");
    } finally {
      setOverlay(null);
    }
  }

  async function next() {
    try {
      setOverlay("סבב הבא…");
      const { error } = await supabase.rpc("next_round", { room_code: code });
      if (error) setStatus("שגיאה: " + error.message);
      else setStatus("");
    } finally {
      setOverlay(null);
    }
  }

  // FINISH SCREEN
  if (room?.status === "finished") {
    return (
      <AppShell>
        {overlay ? <LogoLoader label={overlay} /> : null}
        <div className="game-card">
          <div className="card-inner">
            <div className="card-title text-center">המשחק נגמר 🎉</div>

            <div className="card-sub text-center mt-3">
              {matznach ? (
                <>
                  🏆 <span className="font-extrabold">{matznach.name}</span> הוא/היא המצנח!
                  <br />
                  <span className="font-bold">{matznach.mistakes}</span> משתתפים טעו
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

            {status ? <div className="mt-3 card-sub text-center">{status}</div> : null}
          </div>
        </div>
      </AppShell>
    );
  }

  if (!room) {
    return (
      <AppShell>
        {overlay ? <LogoLoader label={overlay} /> : null}
        <div className="game-card">
          <div className="card-inner">
            <div className="card-title text-center">טוען…</div>
            {status ? <div className="card-sub text-center">{status}</div> : null}
          </div>
        </div>
      </AppShell>
    );
  }

  // LOBBY
  if (room.status === "lobby" || !room.current_round_id) {
    return (
      <AppShell>
        {overlay ? <LogoLoader label={overlay} /> : null}

        <div className="game-card">
          <div className="card-inner">
            <div className="card-title text-center">חדר {room.code}</div>
            <div className="card-sub text-center">ממתינים להתחלת המשחק…</div>

            <div className="mt-4 flex items-center justify-between">
              <div className="pill text-sm font-bold">משתתפים: {players.length}</div>
              <div className="pill text-sm font-bold">חסר אמת: {missingTruths}</div>
            </div>

            <div className="mt-4 max-h-56 overflow-auto pr-1">
              <ul className="space-y-2">
                {players.map((p) => {
                  const ok = !!p.truth_statement && !!p.truth_statement.trim();
                  return (
                    <li key={p.id} className="pill justify-between w-full">
                      <span className="font-extrabold">{p.display_name}</span>
                      <span className="text-xs font-bold opacity-80">{ok ? "מוכן" : "מחכה לאמת"}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {isHost ? (
              <button onClick={startGame} disabled={!canStart} className={`mt-4 capsule ${canStart ? "capsule-dark" : "opacity-60"}`}>
                התחל משחק
              </button>
            ) : (
              <div className="mt-4 card-sub text-center">המנהל יתחיל עוד רגע…</div>
            )}

            {status ? <div className="mt-3 card-sub text-center">{status}</div> : null}
          </div>
        </div>
      </AppShell>
    );
  }

  // IN GAME
  const allVoted = votes.length >= expectedVotes && expectedVotes > 0;

  return (
    <AppShell>
      {overlay ? <LogoLoader label={overlay} /> : null}

      <div className={`game-card ${iAmSpeaker ? "floaty" : ""}`}>
        <div className="card-inner">
          <div className="pill w-full justify-between">
            <span className="font-extrabold">בתור: {speaker?.display_name ?? "—"}</span>
            <span className="font-bold">
              {votes.length}/{expectedVotes} הצביעו
            </span>
          </div>

          <div className="mt-5 prompt-text">
            {iAmSpeaker ? (round?.prompt_text ?? "") : "הקורא מקריא משפט…"}
          </div>

          {!round?.revealed ? (
            <>
              {!iAmSpeaker ? (
                <div className="mt-6 space-y-3" key={stampKey}>
                  <button className={`capsule w-full ${myVote === "truth" ? "capsule-dark" : ""}`} disabled={!!myVote} onClick={() => cast("truth")}>
                    אמת
                  </button>
                  <button className={`capsule w-full ${myVote === "lie" ? "capsule-dark" : ""}`} disabled={!!myVote} onClick={() => cast("lie")}>
                    שקר
                  </button>
                  {myVote ? <div className="card-sub text-center mt-2">הצבעת: <b>{myVote === "truth" ? "אמת" : "שקר"}</b></div> : null}
                </div>
              ) : (
                <div className="mt-6 card-sub text-center">כולם מצביעים עכשיו…</div>
              )}

              <div className="mt-6 flex items-center justify-between">
                <div className="pill text-sm font-bold">אמת: {voteCounts.truth}</div>
                <div className="pill text-sm font-bold">שקר: {voteCounts.lie}</div>
              </div>

              {isHost ? (
                <button onClick={reveal} disabled={!allVoted} className={`mt-4 capsule ${allVoted ? "capsule-dark" : "opacity-60"}`}>
                  חשוף תוצאה
                </button>
              ) : (
                <div className="mt-4 card-sub text-center">ממתינים שהמנהל יחשוף…</div>
              )}
            </>
          ) : (
            <>
              <div className="mt-6 card-title text-center">
                {round.reveal_truth ? "זה היה אמת ✅" : "זה היה שקר 🤥"}
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="pill text-sm font-bold">אמת: {voteCounts.truth}</div>
                <div className="pill text-sm font-bold">שקר: {voteCounts.lie}</div>
              </div>

              {isHost ? (
                <button onClick={next} className="mt-4 capsule capsule-dark w-full">
                  סבב הבא
                </button>
              ) : (
                <div className="mt-4 card-sub text-center">המנהל יעבור לסבב הבא…</div>
              )}
            </>
          )}

          {status ? <div className="mt-3 card-sub text-center">{status}</div> : null}
        </div>
      </div>
    </AppShell>
  );
}
