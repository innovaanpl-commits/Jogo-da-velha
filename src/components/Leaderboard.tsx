import { useState, useEffect } from "react";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { UserProfile } from "../types";
import { Trophy, Medal, Award, User } from "lucide-react";

interface LeaderboardProps {
  currentUserId?: string;
}

export default function Leaderboard({ currentUserId }: LeaderboardProps) {
  const [leaders, setLeaders] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, "users"),
      orderBy("score", "desc"),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const uList: UserProfile[] = [];
      snapshot.forEach((doc) => {
        uList.push({ uid: doc.id, ...doc.data() } as UserProfile);
      });
      setLeaders(uList);
      setLoading(false);
    }, (error) => {
      console.error("Erro ao carregar ranking: ", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0:
        return <Trophy className="w-5 h-5 text-amber-400" />;
      case 1:
        return <Medal className="w-5 h-5 text-slate-300" />;
      case 2:
        return <Award className="w-5 h-5 text-amber-600" />;
      default:
        return <span className="font-mono text-sm text-gray-400 font-bold w-5 text-center">{index + 1}</span>;
    }
  };

  return (
    <div id="leaderboard-panel" className="bg-[#0B0C10] rounded p-6 border border-dark-border flex flex-col h-full text-dark-text">
      <div className="flex items-center gap-3 mb-4">
        <Trophy className="w-5 h-5 text-primary" />
        <h2 className="text-base font-display font-light uppercase tracking-widest text-white">Classificação Geral</h2>
      </div>

      {loading ? (
        <div className="flex-1 flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary font-mono"></div>
        </div>
      ) : leaders.length === 0 ? (
        <div className="text-center py-8 text-slate-500 text-xs font-mono uppercase tracking-widest">
          Sem duelistas ativos
        </div>
      ) : (
        <div className="space-y-2 overflow-y-auto max-h-[300px] pr-1">
          {leaders.map((leader, index) => {
            const isCurrentUser = leader.uid === currentUserId;
            return (
              <div
                key={leader.uid}
                className={`flex items-center justify-between p-3 rounded transition duration-200 border ${
                  isCurrentUser
                    ? "bg-dark-card border-primary ring-1 ring-primary/20"
                    : "bg-dark-bg/30 border-dark-border hover:border-secondary/40"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8">
                    {getRankIcon(index)}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded ${isCurrentUser ? 'bg-primary/20 text-primary' : 'bg-[#1F2833]/40 text-slate-400'}`}>
                      <User className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <p className={`text-xs font-semibold truncate max-w-[120px] ${isCurrentUser ? "text-primary font-bold" : "text-white"}`}>
                        {leader.username}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                        V: {leader.wins || 0} | E: {leader.draws || 0} | D: {leader.losses || 0}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="font-mono text-xs text-primary font-bold">{leader.score || 0} PTS</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
