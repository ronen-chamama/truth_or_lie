"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ensureAnonAuth, supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import LogoLoader from "@/components/LogoLoader";

type Room = {
  id: string;
  code: string;
  name: string;
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

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [votes, setVotes] = useState<Vote[]>([]);
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

  async function fetchAll() {
    if (!code || code.length !== 4) return;

    // חדר לפי קוד
    const { data: roomRow, error: roomErr } = await supabase
      .from("rooms")
      .select("id,code,name,status,host_user_id,current_round_id")
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

    // שחקנים
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

    // מי אני (player_id מה-localStorage)
    const stored = localStorage.getItem("truth_or_lie_player_id");
    if (stored) setMePlayerId(stored);

    // סבב נוכחי
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

      // קולות לסבב
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

  // Realtime
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
    .subscribe((status) => {
      // חשוב: לראות בקונסול אם זה באמת SUBSCRIBED ב-Prod
      console.log("[realtime]", status, "room", room.id);
    });

  return () => {
    supabase.removeChannel(ch);
  };
// שים לב: תלות רק ב-room.id כדי לא “למחוק” channel בגלל שינויי state אחרים
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [room?.id]);

// Subscription נוסף ל-votes שמסונן לפי round (ונוצר מחדש כשה-round משתנה)
useEffect(() => {
  if (!room?.current_round_id) return;

  const chVotes = supabase
    .channel(`votes:${room.current_round_id}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "votes", filter: `round_id=eq.${room.current_round_id}` },
      () => fetchAll()
    )
    .subscribe((status) => {
      console.log("[realtime votes]", status, "round", room.current_round_id);
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
  return (
    <AppShell>
      {overlay ? <LogoLoader label={overlay} /> : null}

      <div className={`game-card ${iAmSpeaker ? "floaty" : ""}`}>
        <div className="card-inner">
          <div className="pill w-full justify-between">
            <span className="font-extrabold">בתור: {speaker?.display_name ?? "—"}</span>
            <span className="font-bold">{votes.length}/{expectedVotes} הצביעו</span>
          </div>

          <div className="mt-5 prompt-text">
            {iAmSpeaker ? (round?.prompt_text ?? "") : "הקורא מקריא משפט…"}
          </div>

          {!iAmSpeaker ? (
            <div className="mt-3 card-sub text-center">
              המשפט לא נחשף למצביעים. שואלים שאלות בעולם האמיתי ואז מצביעים.
            </div>
          ) : (
            <div className="mt-3 card-sub text-center">תקרא את המשפט בקול ותנסה לעבוד עליהם 😈</div>
          )}

          {(room.status === "voting_closed" || room.status === "revealed") && (
            <div className="mt-4 pill w-full justify-between">
              <span className="font-extrabold">אמת: {voteCounts.truth}</span>
              <span className="font-extrabold">שקר: {voteCounts.lie}</span>
            </div>
          )}

          {room.status === "revealed" && round && round.reveal_truth !== null && (
  <div className="mt-4 card-title text-center">
    זה היה: {round.reveal_truth ? "אמת ✅" : "שקר ❌"}
  </div>
)}


          {iAmSpeaker && room.status === "voting_closed" ? (
            <button onClick={reveal} className="mt-4 capsule capsule-dark">
              חשוף אמת/שקר
            </button>
          ) : null}

          {room.status === "revealed" ? (
            <button onClick={next} className="mt-4 capsule capsule-dark">
              סבב הבא
            </button>
          ) : null}

          {status ? <div className="mt-3 card-sub text-center">{status}</div> : null}
        </div>
      </div>

      {/* action bar */}
      {!iAmSpeaker && room.status !== "revealed" ? (
        <div className="action-bar">
          <div className="action-row">
            <button className="choice-btn" onClick={() => cast("lie")} aria-label="שקר">
              <img key={`lie-${stampKey}`} className={`choice-img ${stampKey ? "stamp" : ""}`} src="/lie_button.png" alt="שקר" />
            </button>
            <button className="choice-btn" onClick={() => cast("truth")} aria-label="אמת">
              <img key={`truth-${stampKey}`} className={`choice-img ${stampKey ? "stamp" : ""}`} src="/truth_button.png" alt="אמת" />
            </button>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
