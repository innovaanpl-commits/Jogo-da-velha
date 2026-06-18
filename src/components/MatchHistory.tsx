import { useState, useEffect } from "react";
import { collection, query, orderBy, limit, onSnapshot, where, or } from "firebase/firestore";
import { db } from "../lib/firebase";
import { MatchHistoryItem } from "../types";
import { History, Calendar, Award, Minus } from "lucide-react";

interface MatchHistoryProps {
  currentUserId?: string;
  globalOnly?: boolean;
}

export default function MatchHistory({ currentUserId, globalOnly = false }: MatchHistoryProps) {
  const [matches, setMatches] = useState<MatchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let q;
    if (globalOnly || !currentUserId) {
      q = query(
        collection(db, "matches"),
        orderBy("endedAt", "desc"),
        limit(10)
      );
    } else {
      // Show games where current user played
      q = query(
        collection(db, "matches"),
        or(
          where("player1Id", "==", currentUserId),
          where("player2Id", "==", currentUserId)
        ),
        orderBy("endedAt", "desc"),
        limit(10)
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const mList: MatchHistoryItem[] = [];
      snapshot.forEach((doc) => {
        mList.push({ id: doc.id, ...doc.data() } as MatchHistoryItem);
      });
      // Sort in-memory just in case Firestore composite indexes aren't immediate
      mList.sort((a, b) => b.endedAt - a.endedAt);
      setMatches(mList);
      setLoading(false);
    }, (error) => {
      console.warn("Retrying match query due to index or missing matches...", error);
      // Fallback to global matches without where clause in case composite index isn't ready
      const fallbackQuery = query(
        collection(db, "matches"),
        orderBy("endedAt", "desc"),
        limit(10)
      );
      const fallbackUnsub = onSnapshot(fallbackQuery, (fallbackSnap) => {
        const mList: MatchHistoryItem[] = [];
        fallbackSnap.forEach((doc) => {
          mList.push({ id: doc.id, ...doc.data() } as MatchHistoryItem);
        });
        setMatches(mList);
        setLoading(false);
      }, (err) => {
        console.error("Erro total ao carregar histórico: ", err);
        setLoading(false);
      });
      return () => fallbackUnsub();
    });

    return () => unsubscribe();
  }, [currentUserId, globalOnly]);

  const formatDate = (timestamp: number) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " - " + date.toLocaleDateString([], { day: "2-digit", month: "2-digit" });
    } catch {
      return "Há pouco";
    }
  };

  return (
    <div id="match-history" className="bg-[#0B0C10] rounded p-6 border border-dark-border flex flex-col h-full text-dark-text">
      <div className="flex items-center gap-3 mb-4">
        <History className="w-5 h-5 text-secondary" />
        <h2 className="text-base font-display font-light uppercase tracking-widest text-white">
          {globalOnly || !currentUserId ? "Histórico Global" : "Seu Histórico"}
        </h2>
      </div>

      {loading ? (
        <div className="flex-1 flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary font-mono"></div>
        </div>
      ) : matches.length === 0 ? (
        <div className="text-center py-8 text-slate-500 text-xs font-mono uppercase tracking-widest flex-1 flex flex-col justify-center">
          Sem partidas disputadas ainda
        </div>
      ) : (
        <div className="space-y-3 overflow-y-auto max-h-[300px] pr-1">
          {matches.map((match) => {
            const isUserP1 = match.player1Id === currentUserId;
            const isUserP2 = match.player2Id === currentUserId;
            const isDraw = match.winnerId === "draw";
            const won = (match.winnerId === match.player1Id && isUserP1) || (match.winnerId === match.player2Id && isUserP2);
            const lost = !isDraw && !won && (isUserP1 || isUserP2);

            let rowBgClass = "bg-dark-card border-dark-border";
            if (isUserP1 || isUserP2) {
              if (won) rowBgClass = "bg-dark-card border-emerald-500/20";
              else if (lost) rowBgClass = "bg-dark-card border-rose-500/10";
              else if (isDraw) rowBgClass = "bg-dark-card border-amber-500/20";
            }

            return (
              <div
                key={match.id}
                className={`p-3 rounded border transition hover:border-secondary/40 ${rowBgClass}`}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[9px] text-slate-500 uppercase tracking-widest font-mono flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {formatDate(match.endedAt)}
                  </span>
                  {isUserP1 || isUserP2 ? (
                    <span className={`text-[9px] uppercase font-bold tracking-widest px-2 py-0.5 rounded border ${
                      won ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                      lost ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    }`}>
                      {won ? "Vitória" : lost ? "Derrota" : "Empate"}
                    </span>
                  ) : null}
                </div>

                <div className="flex items-center justify-between text-xs">
                  {/* Player 1 */}
                  <div className={`flex items-center gap-1.5 max-w-[42%] truncate ${
                    match.winnerId === match.player1Id ? "font-bold text-primary" : "text-slate-300"
                  }`}>
                    <span className="font-mono text-slate-400 bg-dark-bg border border-dark-border px-1 rounded text-[9px] font-bold">X</span>
                    <span className="truncate">{match.player1Name}</span>
                    {match.winnerId === match.player1Id && <Award className="w-3.5 h-3.5 text-primary shrink-0" />}
                  </div>

                  <span className="text-[10px] text-slate-600 font-mono px-2 uppercase tracking-tight">vs</span>

                  {/* Player 2 */}
                  <div className={`flex items-center gap-1.5 max-w-[42%] truncate text-right justify-end ${
                    match.winnerId === match.player2Id ? "font-bold text-secondary" : "text-slate-300"
                  }`}>
                    {match.winnerId === match.player2Id && <Award className="w-3.5 h-3.5 text-secondary shrink-0" />}
                    <span className="truncate">{match.player2Name}</span>
                    <span className="font-mono text-slate-400 bg-dark-bg border border-dark-border px-1 rounded text-[9px] font-bold">O</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
