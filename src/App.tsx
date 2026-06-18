import { useState, useEffect, FormEvent } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, setDoc, onSnapshot, collection, query, orderBy, limit } from "firebase/firestore";
import { auth, db, signInAnonymously, updateProfile, GoogleAuthProvider, signInWithPopup } from "./lib/firebase";
import { UserProfile } from "./types";
import { Trophy, LogOut, Swords, CircleUser, Zap, Sparkles, MessageSquare, Flame } from "lucide-react";
import Lobby from "./components/Lobby";
import GameBoard from "./components/GameBoard";
import Leaderboard from "./components/Leaderboard";
import MatchHistory from "./components/MatchHistory";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userStats, setUserStats] = useState<UserProfile | null>(null);
  const [nickname, setNickname] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [signError, setSignError] = useState("");
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [editingNickname, setEditingNickname] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState<"play" | "login" | null>(null);
  const [top5Players, setTop5Players] = useState<UserProfile[]>([]);
  const [loadingTop5, setLoadingTop5] = useState(true);

  // Monitor Auth Status
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        
        // Match Deep-Link check (e.g., /?room=CODE)
        const params = new URLSearchParams(window.location.search);
        const urlRoom = params.get("room");
        if (urlRoom) {
          setCurrentRoomId(urlRoom.toUpperCase());
          // clean url without full refresh
          const newUrl = window.location.pathname;
          window.history.replaceState({}, "", newUrl);
        }
      } else {
        setUser(null);
        setUserStats(null);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Load Top 5 Players for landing page leaderboard
  useEffect(() => {
    const qTop = query(
      collection(db, "users"),
      orderBy("score", "desc"),
      limit(5)
    );
    
    const unsubscribe = onSnapshot(qTop, (snapshot) => {
      const list: UserProfile[] = [];
      snapshot.forEach((doc) => {
        list.push({ uid: doc.id, ...doc.data() } as UserProfile);
      });
      setTop5Players(list);
      setLoadingTop5(false);
    }, (error) => {
      console.error("Erro ao carregar top 5 jogadores: ", error);
      setLoadingTop5(false);
    });

    return () => unsubscribe();
  }, []);

  // Sync Current User Profile Stats & Real-time Presence
  useEffect(() => {
    if (!user) return;

    const userDocRef = doc(db, "users", user.uid);
    
    // Set online on mount/auth change
    setDoc(userDocRef, { online: true, lastActive: Date.now() }, { merge: true })
      .catch(err => console.error("Error setting online status:", err));

    // Keep active periodic ping
    const interval = setInterval(() => {
      setDoc(userDocRef, { online: true, lastActive: Date.now() }, { merge: true })
        .catch(err => console.error("Error updating online status ping:", err));
    }, 20000);

    // Unload listener for browser close/navigate
    const handleUnload = () => {
      setDoc(userDocRef, { online: false }, { merge: true })
        .catch(err => console.error("Error setting offline on unload:", err));
    };
    window.addEventListener("beforeunload", handleUnload);

    const unsubscribe = onSnapshot(userDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const stats = snapshot.data() as UserProfile;
        setUserStats(stats);
        (window as any)._currentUserStats = stats;
      }
    });

    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", handleUnload);
      // set offline on component clean up/logout
      setDoc(userDocRef, { online: false }, { merge: true })
        .catch(err => console.error("Error setting offline on logout cleanup:", err));
      unsubscribe();
    };
  }, [user]);

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    const cleanNick = nickname.trim();
    if (cleanNick.length < 3 || cleanNick.length > 15) {
      setSignError("O apelido deve ter entre 3 e 15 caracteres.");
      return;
    }

    setSigningIn(true);
    setSignError("");

    try {
      // 1. Sign in anonymously with Firebase Auth
      const credentials = await signInAnonymously(auth);
      const firebaseUser = credentials.user;

      // 2. Set Profile Display Name
      await updateProfile(firebaseUser, {
        displayName: cleanNick
      });

      // 3. Register or Check User stats doc in Firestore
      const userDocRef = doc(db, "users", firebaseUser.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        const initialProfile: UserProfile = {
          uid: firebaseUser.uid,
          username: cleanNick,
          wins: 0,
          losses: 0,
          draws: 0,
          score: 100, // starting rating/points
          joinedAt: Date.now()
        };
        await setDoc(userDocRef, initialProfile);
        setUserStats(initialProfile);
        (window as any)._currentUserStats = initialProfile;
      }

      setUser(firebaseUser);
    } catch (error) {
      console.error("Erro no login: ", error);
      setSignError("Erro ao criar perfil. Tente novamente mais tarde.");
    } finally {
      setSigningIn(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    setSignError("");
    try {
      const provider = new GoogleAuthProvider();
      const credentials = await signInWithPopup(auth, provider);
      const firebaseUser = credentials.user;

      // Register or Check User stats doc in Firestore
      const userDocRef = doc(db, "users", firebaseUser.uid);
      const userDocSnap = await getDoc(userDocRef);

      const displayName = firebaseUser.displayName || `ArenaGuest_${firebaseUser.uid.slice(0, 4)}`;

      if (!userDocSnap.exists()) {
        const initialProfile: UserProfile = {
          uid: firebaseUser.uid,
          username: displayName,
          wins: 0,
          losses: 0,
          draws: 0,
          score: 100, // starting rating/points
          joinedAt: Date.now()
        };
        await setDoc(userDocRef, initialProfile);
        setUserStats(initialProfile);
        (window as any)._currentUserStats = initialProfile;
      } else {
        const existingData = userDocSnap.data() as UserProfile;
        setUserStats(existingData);
        (window as any)._currentUserStats = existingData;
      }

      setUser(firebaseUser);
    } catch (error: any) {
      console.error("Erro no login com Google: ", error);
      if (error?.code === "auth/popup-blocked") {
        setSignError("A janela popup foi bloqueada pelo navegador. Permita popups ou entre usando um apelido.");
      } else if (error?.code === "auth/popup-closed-by-user") {
        setSignError("O login foi cancelado ao fechar a janela da Conta Google.");
      } else {
        setSignError("Erro ao autenticar com Google. Tente usar a opção rápida por apelido.");
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handleUpdateNickname = async (e: FormEvent) => {
    e.preventDefault();
    const cleanNick = nickname.trim();
    if (!user || cleanNick.length < 3 || cleanNick.length > 15) {
      alert("O apelido deve ter entre 3 e 15 caracteres.");
      return;
    }

    try {
      await updateProfile(user, { displayName: cleanNick });
      await setDoc(doc(db, "users", user.uid), {
        username: cleanNick
      }, { merge: true });
      setEditingNickname(false);
    } catch (err) {
      console.error(err);
      alert("Erro ao alterar apelido.");
    }
  };

  const handleSignOut = async () => {
    if (confirm("Tem certeza que deseja sair? Seus dados/pontuação serão mantidos na nuvem!")) {
      await auth.signOut();
      setCurrentRoomId(null);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-dark-bg flex flex-col items-center justify-center text-dark-text">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-4 font-mono"></div>
        <p className="font-display font-medium text-secondary uppercase tracking-widest text-xs">Conectando à Arena Elite...</p>
      </div>
    );
  }

  // Not Authenticated -> Show beautiful onboarding form matching attached mockup
  if (!user) {
    return (
      <div className="min-h-screen bg-dark-bg flex flex-col justify-between px-4 py-8 relative overflow-hidden text-dark-text">
        {/* Decorative ambient background lights */}
        <div className="absolute inset-0 bg-[#0B0C10] z-0"></div>
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-[#66FCF1]/5 blur-[120px] rounded-full pointer-events-none select-none z-0"></div>
        <div className="absolute bottom-10 left-1/4 w-[300px] h-[300px] bg-[#6875F5]/3 blur-[100px] rounded-full pointer-events-none select-none z-0"></div>

        <div className="w-full max-w-3xl mx-auto relative z-10 flex-1 flex flex-col justify-center items-center py-12">
          {/* Tagline Badge */}
          <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-dark-border bg-[#0B0C10] text-[9px] md:text-[10px] font-mono tracking-[0.25em] text-[#66FCF1] shadow-[0_0_15px_rgba(102,252,241,0.04)] uppercase mb-6 md:mb-8">
            MULTIPLAYER • REAL-TIME
          </div>

          {/* Epic Brand Title */}
          <h1 className="flex items-center justify-center gap-2 select-none">
            <span className="text-7xl md:text-8xl font-black text-[#F5C563] tracking-tighter leading-none hover:scale-105 transition duration-300">X</span>
            <span className="text-3xl md:text-5xl text-white font-extralight italic mx-3 lowercase leading-none align-middle select-none">vs</span>
            <span className="text-7xl md:text-8xl font-black text-[#66FCF1] tracking-tighter leading-none hover:scale-105 transition duration-300">O</span>
          </h1>

          {/* Subtitle */}
          <p className="text-gray-400 text-xs md:text-sm font-light mt-8 max-w-md md:max-w-xl leading-relaxed tracking-wide text-center">
            O jogo clássico — agora com partidas ranqueadas, XP e placar global. Conecte-se, jogue, suba no ranking.
          </p>

          {/* Auth Button Row */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-center mt-10 w-full max-w-sm">
            <button
              id="landing-play-now-btn"
              type="button"
              onClick={() => setShowAuthModal("play")}
              className="w-full bg-[#6875F5] hover:bg-[#5b68e0] text-white font-mono text-xs font-bold uppercase tracking-[0.2em] py-4 px-8 rounded transition duration-200 cursor-pointer shadow-[0_4px_20px_rgba(104,117,245,0.25)] flex items-center justify-center border-none"
            >
              Play Now
            </button>
            <button
              id="landing-login-btn"
              type="button"
              onClick={() => setShowAuthModal("login")}
              className="w-full bg-transparent hover:bg-white/[0.04] border border-dark-border text-white font-mono text-xs font-bold uppercase tracking-[0.2em] py-4 px-8 rounded transition duration-200 cursor-pointer flex items-center justify-center"
            >
              Log In
            </button>
          </div>

          {/* Bottom Table: Top Players */}
          <div className="w-full max-w-xl mt-16 md:mt-24">
            <div className="flex items-center justify-between mb-4 border-b border-dark-border/40 pb-2">
              <h3 className="text-sm font-display font-light uppercase tracking-widest text-[#F5C563] flex items-center gap-2">
                <Trophy className="w-4 h-4 text-[#F5C563]" /> Top Players
              </h3>
              <button
                type="button"
                onClick={() => setShowAuthModal("play")}
                className="text-[10px] uppercase tracking-widest text-[#6875F5] font-bold hover:underline bg-none border-none cursor-pointer"
              >
                See all →
              </button>
            </div>

            {loadingTop5 ? (
              <div className="flex justify-center items-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : top5Players.length === 0 ? (
              <div className="text-center py-6 text-slate-500 font-mono text-xs uppercase tracking-widest">
                Sem duelistas ativos
              </div>
            ) : (
              <div className="space-y-2.5">
                {top5Players.map((player, index) => {
                  return (
                    <div
                      key={player.uid}
                      className="flex items-center justify-between p-4 rounded bg-[#0B0C10] border border-dark-border/60 hover:border-[#6875F5]/30 transition duration-300"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono font-semibold text-slate-500 w-5">
                          {index + 1}
                        </span>
                        <div className="p-1.5 bg-[#1F2833]/30 rounded text-slate-400">
                          <CircleUser className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                          {player.username}
                        </span>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-xs text-[#6875F5] font-extrabold uppercase tracking-wide">
                          {player.score || 0} xp
                        </p>
                        <p className="text-[9px] text-slate-500 font-mono mt-0.5 tracking-tight uppercase">
                          {player.wins || 0}W • {player.losses || 0}L • {player.draws || 0}D
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="w-full max-w-3xl mx-auto mt-12 pt-6 border-t border-dark-border/40 text-center relative z-10 font-mono text-[10px] tracking-wider text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-4 select-none">
          <div>
            Este jogo foi desenvolvido pela{" "}
            <a
              href="https://www.innovamz.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#66FCF1] hover:text-[#66FCF1]/80 hover:underline transition font-bold"
            >
              'innova'
            </a>
          </div>
          <div>
            <a
              href="https://www.innovamz.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#6875F5] hover:text-[#6875F5]/80 hover:underline transition"
            >
              www.innovamz.com
            </a>
          </div>
        </footer>

        {/* Floating Modal for Authentication (Signup / Login) */}
        {showAuthModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-[#0B0C10] rounded border border-dark-border w-full max-w-sm p-6 relative shadow-2xl">
              {/* Close Button */}
              <button
                type="button"
                onClick={() => {
                  setShowAuthModal(null);
                  setSignError("");
                }}
                className="absolute top-4 right-4 text-slate-400 hover:text-white transition text-xs font-mono bg-none border-none cursor-pointer"
              >
                ESC (X)
              </button>

              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-10 h-10 bg-[#6875F5]/10 rounded border border-[#6875F5]/20 text-[#6875F5] mb-3">
                  <Swords className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-display font-light uppercase tracking-widest text-white">
                  {showAuthModal === "play" ? "Ingressar no Combate" : "Autenticar Conta"}
                </h3>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1 font-mono">
                  Selecione sua identificação
                </p>
              </div>

              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-[#66FCF1] font-bold mb-2 font-mono">
                    Apelido de Combate
                  </label>
                  <input
                    id="modal-nickname"
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="Ex: SPECTRE_99"
                    maxLength={15}
                    className="w-full bg-[#0B0C10] border border-dark-border outline-none rounded px-4 py-3 text-white focus:border-primary transition font-mono text-xs"
                    autoFocus
                  />
                </div>

                {signError && (
                  <p className="text-[11px] font-semibold text-rose-400 bg-rose-500/10 p-3 rounded border border-rose-500/20 font-mono">
                    ⚠️ {signError}
                  </p>
                )}

                <button
                  id="modal-signin-btn"
                  type="submit"
                  disabled={signingIn || nickname.trim().length < 3}
                  className="w-full flex items-center justify-center gap-2 bg-[#6875F5] hover:bg-[#5b68e0] text-white disabled:bg-slate-900 disabled:text-slate-600 font-bold uppercase tracking-widest text-[10px] py-3.5 px-6 rounded transition duration-200 cursor-pointer border-none"
                >
                  {signingIn ? "Processando..." : "Batalhar Rápido"}
                  <Swords className="w-3.5 h-3.5" />
                </button>

                <div className="relative my-4 flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-dark-border"></div>
                  </div>
                  <div className="relative bg-[#0B0C10] px-3">
                    <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold font-mono">ou login seguro</span>
                  </div>
                </div>

                <button
                  id="modal-google-signin-btn"
                  type="button"
                  onClick={async () => {
                    await handleGoogleSignIn();
                    setShowAuthModal(null);
                  }}
                  disabled={signingIn}
                  className="w-full flex items-center justify-center gap-2 border border-dark-border bg-dark-card hover:bg-dark-border hover:border-primary/50 text-white disabled:opacity-50 font-bold uppercase tracking-widest text-[9px] py-3.5 px-6 rounded transition duration-200 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                  </svg>
                  {signingIn ? "Autenticando..." : "Entrar via Conta Google"}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Authenticated Screen
  return (
    <div className="min-h-screen bg-dark-bg text-dark-text font-sans pb-12">
      {/* Arena Navigation/Header */}
      <header className="h-20 border-b border-dark-border bg-dark-bg flex items-center sticky top-0 z-50">
        <div className="max-w-6xl w-full mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer select-none" onClick={() => setCurrentRoomId(null)}>
            <div className="w-8 h-8 bg-primary flex items-center justify-center rounded">
              <span className="text-dark-bg font-black text-sm">XO</span>
            </div>
            <span className="font-display font-light tracking-widest uppercase text-primary text-base">
              Elite Arena
            </span>
          </div>

          {/* User Score Stats Badge */}
          <div className="flex items-center gap-4">
            {editingNickname ? (
              <form onSubmit={handleUpdateNickname} className="flex gap-2">
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="bg-dark-bg border border-dark-border rounded px-2.5 py-1 text-xs text-white outline-none focus:border-primary font-mono"
                  maxLength={15}
                />
                <button type="submit" className="text-[10px] border border-primary text-primary px-2 py-1 rounded hover:bg-primary hover:text-dark-bg transition">Ok</button>
              </form>
            ) : (
              <div 
                className="flex items-center gap-2.5 border border-dark-border bg-dark-card/50 px-3.5 py-1.5 rounded cursor-pointer hover:border-secondary transition"
                onClick={() => {
                  setNickname(user.displayName || "");
                  setEditingNickname(true);
                }}
                title="Clique para alterar apelido"
              >
                <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_8px_#66FCF1]"></div>
                <span className="text-xs font-mono tracking-tight text-white">{user.displayName}</span>
                {userStats && (
                  <span className="text-[10px] font-mono text-secondary px-1 py-0.5 font-bold">
                    [{userStats.score || 0} PTS]
                  </span>
                )}
              </div>
            )}

            <button
              id="header-signout-btn"
              type="button"
              onClick={handleSignOut}
              className="p-2 border border-dark-border hover:border-rose-950 hover:bg-rose-950/10 text-slate-500 hover:text-rose-400 rounded transition cursor-pointer"
              title="Sair da Arena"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-6 mt-8">
        
        {currentRoomId ? (
          /* ACTIVE GAME ZONE */
          <GameBoard
            roomId={currentRoomId}
            currentUserId={user.uid}
            currentUserName={user.displayName || "Guerreiro Anônimo"}
            onLeaveRoom={() => setCurrentRoomId(null)}
          />
        ) : (
          /* LOBBY / SOCIAL HUB */
          <div className="space-y-8">


            {/* Main Interactive Lobby Grid */}
            <Lobby
              currentUserId={user.uid}
              currentUserName={user.displayName || "Jogador"}
              onJoinRoom={(roomId) => setCurrentRoomId(roomId)}
            />

            {/* Scoreboard and History Widgets under the Lobby */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
              <Leaderboard currentUserId={user.uid} />
              <MatchHistory currentUserId={user.uid} />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-6 mt-16 pt-6 border-t border-dark-border/40 text-center font-mono text-[10px] tracking-wider text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-4 select-none pb-8">
        <div>
          Este jogo foi desenvolvido pela{" "}
          <a
            href="https://www.innovamz.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#66FCF1] hover:text-[#66FCF1]/80 hover:underline transition font-bold"
          >
            'innova'
          </a>
        </div>
        <div>
          <a
            href="https://www.innovamz.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#6875F5] hover:text-[#6875F5]/80 hover:underline transition"
          >
            www.innovamz.com
          </a>
        </div>
      </footer>
    </div>
  );
}
