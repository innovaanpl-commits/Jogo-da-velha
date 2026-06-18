import { useState, useEffect, FormEvent } from "react";
import { collection, query, where, getDocs, doc, setDoc, limit, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { GameRoom, UserProfile } from "../types";
import { Play, LogIn, Users, Plus, Shield, Globe2, Sparkles, Copy, Check, Eye } from "lucide-react";

interface LobbyProps {
  currentUserId: string;
  currentUserName: string;
  onJoinRoom: (roomId: string) => void;
}

export default function Lobby({ currentUserId, currentUserName, onJoinRoom }: LobbyProps) {
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [availableRooms, setAvailableRooms] = useState<GameRoom[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [actionError, setActionError] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [allOnlineUsers, setAllOnlineUsers] = useState<UserProfile[]>([]);
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);

  // Load available waiting and playing rooms
  useEffect(() => {
    const q = query(
      collection(db, "rooms"),
      where("status", "in", ["waiting", "playing"]),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const roomsList: GameRoom[] = [];
      snapshot.forEach((doc) => {
        roomsList.push({ id: doc.id, ...doc.data() } as GameRoom);
      });
      // Filter out room where current user is host (since they wants to join OTHER rooms)
      const otherRooms = roomsList.filter(r => r.hostId !== currentUserId);
      setAvailableRooms(otherRooms);
      setLoadingRooms(false);
    }, (error) => {
      console.error("Erro ao escutar salas disponíveis: ", error);
      setLoadingRooms(false);
    });

    return () => unsubscribe();
  }, [currentUserId]);

  // Listen to players currently online (active within 5 minutes or flagged online)
  useEffect(() => {
    const qOnline = query(
      collection(db, "users"),
      where("online", "==", true),
      limit(25)
    );

    const unsubscribeOnline = onSnapshot(qOnline, (snapshot) => {
      const users: UserProfile[] = [];
      snapshot.forEach((doc) => {
        users.push({ uid: doc.id, ...doc.data() } as UserProfile);
      });
      // Filter out current user from online listing to simplify challenging
      const filtered = users.filter(u => u.uid !== currentUserId);
      setAllOnlineUsers(filtered);
    }, (error) => {
      console.error("Erro ao escutar duelistas online:", error);
    });

    return () => unsubscribeOnline();
  }, [currentUserId]);

  // Handle prefix search on users collection prefix matching
  useEffect(() => {
    const term = searchTerm.trim();
    if (!term) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const qSearch = query(
      collection(db, "users"),
      where("username", ">=", term),
      where("username", "<=", term + "\uf8ff"),
      limit(15)
    );

    const unsubscribeSearch = onSnapshot(qSearch, (snapshot) => {
      const results: UserProfile[] = [];
      snapshot.forEach((doc) => {
        results.push({ uid: doc.id, ...doc.data() } as UserProfile);
      });
      // Filter out current user if they search themselves
      const filtered = results.filter(u => u.uid !== currentUserId);
      setSearchResults(filtered);
      setSearching(false);
    }, (error) => {
      console.error("Erro ao pesquisar jogadores:", error);
      setSearching(false);
    });

    return () => unsubscribeSearch();
  }, [searchTerm, currentUserId]);

  // Generate 5-character code
  const generateRoomCode = () => {
    const chars = "ABCDEFGHIJKLMNPQRSTUVWXYZ123456789"; // No O or 0 to avoid confusion
    let result = "";
    for (let i = 0; i < 5; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const handleCreateRoom = async () => {
    if (creating) return;
    setCreating(true);
    setActionError("");

    try {
      const code = generateRoomCode();
      const roomRef = doc(db, "rooms", code);

      const newRoom: GameRoom = {
        id: code,
        hostId: currentUserId,
        hostName: currentUserName,
        guestId: null,
        guestName: null,
        status: "waiting",
        board: Array(9).fill(null),
        // Randomize who goes first: host or guest
        turn: currentUserId, // starts with host, can randomize in board
        winnerId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        symbols: {
          [currentUserId]: "X"
        },
        playAgain: []
      };

      await setDoc(roomRef, newRoom);
      onJoinRoom(code);
    } catch (error) {
      console.error("Erro ao criar sala: ", error);
      setActionError("Falha ao criar sala. Tente novamente.");
    } finally {
      setCreating(false);
    }
  };

  const handleJoinByCode = async (e: FormEvent) => {
    e.preventDefault();
    const cleanCode = roomCodeInput.trim().toUpperCase();
    if (!cleanCode) return;

    setJoining(true);
    setActionError("");

    try {
      const roomRef = doc(db, "rooms", cleanCode);
      const roomSnap = await getDocs(query(collection(db, "rooms"), where("id", "==", cleanCode)));

      if (roomSnap.empty) {
        setActionError("Sala não encontrada. Verifique o código.");
        setJoining(false);
        return;
      }

      const roomData = roomSnap.docs[0].data() as GameRoom;

      // Allow joining any room, either as player (waiting) or as spectator (playing/ended/etc)
      onJoinRoom(cleanCode);
    } catch (error) {
      console.error("Erro ao buscar sala pelo código: ", error);
      setActionError("Erro de rede ao entrar na sala.");
    } finally {
      setJoining(false);
    }
  };

  const handleJoinQuickRoom = async (room: GameRoom) => {
    setActionError("");
    onJoinRoom(room.id);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full text-dark-text">
      {/* Play Options */}
      <div className="space-y-6 flex flex-col justify-between lg:col-span-1">
        {/* Play Card */}
        <div className="bg-[#0B0C10] rounded p-6 border border-dark-border flex-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Sparkles className="w-5 h-5 text-primary" />
              <h2 className="text-base font-display font-light uppercase tracking-widest text-white">Criar Nova Partida</h2>
            </div>
            <p className="text-dark-text text-xs leading-relaxed mb-6">
              Inicie uma sala exclusiva e convide um amigo compartilhando o código de acesso ou o link de combate direto.
            </p>
          </div>

          <div>
            {actionError && (
              <div className="mb-4 text-xs font-semibold bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded">
                {actionError}
              </div>
            )}

            <button
              id="lobby-create-room-btn"
              type="button"
              onClick={handleCreateRoom}
              disabled={creating}
              className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-[#5bc7bf] text-dark-bg font-bold py-3.5 px-6 rounded uppercase tracking-widest text-xs transition duration-200 cursor-pointer border-none animate-pulse-subtle"
            >
              <Plus className="w-4 h-4 text-dark-bg" />
              {creating ? "Iniciando Sala..." : "Criar Sala Amistosa"}
            </button>
          </div>
        </div>

        {/* Enter Code Card */}
        <div className="bg-[#0B0C10] rounded p-6 border border-dark-border">
          <div className="flex items-center gap-3 mb-4">
            <LogIn className="w-5 h-5 text-secondary" />
            <h2 className="text-base font-display font-light uppercase tracking-widest text-white">Entrar por Código</h2>
          </div>
          <p className="text-dark-text text-xs leading-relaxed mb-4">
            Seu oponente lhe enviou um código? Insira-o abaixo para entrar na arena.
          </p>

          <form onSubmit={handleJoinByCode} className="flex gap-2">
            <input
              id="lobby-join-code-input"
              type="text"
              value={roomCodeInput}
              onChange={(e) => setRoomCodeInput(e.target.value.slice(0, 5))}
              placeholder="Ex: AB12C"
              className="flex-1 bg-[#0B0C10] border border-dark-border outline-none rounded px-4 py-3 text-white focus:border-primary transition text-center font-mono font-bold tracking-widest text-base uppercase"
            />
            <button
              id="lobby-join-by-code-submit"
              type="submit"
              disabled={joining || roomCodeInput.trim().length !== 5}
              className="bg-primary hover:bg-[#5bc7bf] disabled:bg-[#111216] hover:text-[#0B0C10] disabled:text-slate-600 text-dark-bg font-bold px-5 rounded transition duration-200 cursor-pointer flex items-center justify-center border-none"
            >
              <LogIn className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Available Lobby Rooms */}
      <div className="bg-[#0B0C10] rounded p-6 border border-dark-border flex flex-col h-[400px] lg:h-auto justify-between lg:col-span-1">
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center gap-2.5 mb-4 shrink-0">
            <Globe2 className="w-5 h-5 text-primary" />
            <h2 className="text-base font-display font-light uppercase tracking-widest text-white">Partidas Públicas</h2>
          </div>
          <p className="text-dark-text text-xs leading-relaxed mb-4 shrink-0">
            Combata contra outros duelistas que estão aguardando oponentes públicos em canais abertos.
          </p>

          {loadingRooms ? (
            <div className="flex-1 flex justify-center items-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : availableRooms.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-500 py-6">
              <Users className="w-8 h-8 opacity-25 mb-2" />
              <p className="text-[10px] font-mono uppercase tracking-widest">Sem salas abertas</p>
              <p className="text-[9px] text-slate-600 mt-1 uppercase tracking-wider">Inicie sua sala acima e aguarde!</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
              {availableRooms.map((room) => (
                <div
                  key={room.id}
                  className="flex items-center justify-between p-4 rounded bg-dark-card border border-dark-border hover:border-secondary/40 transition duration-200"
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white text-xs truncate max-w-[140px]">
                        {room.status === "playing" ? `${room.hostName} vs ${room.guestName || "?"}` : room.hostName}
                      </span>
                      {room.status === "waiting" ? (
                        <span className="text-[9px] uppercase tracking-widest font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded shrink-0">
                          Disponível
                        </span>
                      ) : (
                        <span className="text-[9px] uppercase tracking-widest font-bold bg-[#6875F5]/10 text-[#6875F5] border border-[#6875F5]/20 px-1.5 py-0.5 rounded shrink-0 animate-pulse">
                          Em Jogo
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] text-secondary font-mono">Código: {room.id}</span>
                  </div>
                  <button
                    id={`lobby-join-room-btn-${room.id}`}
                    type="button"
                    onClick={() => handleJoinQuickRoom(room)}
                    className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-4 py-2 rounded transition cursor-pointer border-none ${
                      room.status === "waiting"
                        ? "bg-primary hover:bg-[#5bc7bf] text-dark-bg"
                        : "bg-dark-bg border border-dark-border text-secondary hover:text-white hover:border-[#66FCF1]/50"
                    }`}
                  >
                    {room.status === "waiting" ? (
                      <>
                        <Play className="w-3 h-3 fill-current" />
                        Duelar
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        Assistir
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Duelos & Duelistas (Jogadores Online & Busca) */}
      <div className="bg-[#0B0C10] rounded p-6 border border-dark-border flex flex-col h-[400px] lg:h-auto justify-between lg:col-span-1">
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center gap-2.5 mb-4 shrink-0">
            <Users className="w-5 h-5 text-[#6875F5]" />
            <h2 className="text-base font-display font-light uppercase tracking-widest text-white">Jogadores Ativos</h2>
          </div>
          
          <p className="text-dark-text text-xs leading-relaxed mb-4 shrink-0">
            Veja quem está online no momento ou utilize o campo de busca para checar status e stats de rivais.
          </p>

          {/* Search box */}
          <div className="mb-4 shrink-0 relative">
            <input
              id="player-search-input"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Pesquisar jogador..."
              className="w-full bg-[#0B0C10] border border-dark-border outline-none rounded pl-10 pr-8 py-2.5 text-white focus:border-[#6875F5] transition text-xs font-mono uppercase"
            />
            <div className="absolute left-3.5 top-3 text-slate-500">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-white text-xs font-mono cursor-pointer border-none bg-transparent"
              >
                X
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
            {searching ? (
              <div className="flex-1 flex justify-center items-center py-6">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#6875F5]"></div>
              </div>
            ) : searchTerm.trim().length > 0 ? (
              searchResults.length === 0 ? (
                <div className="text-center py-6 text-slate-500 font-mono text-[10px] uppercase tracking-widest">
                  Nenhum jogador encontrado
                </div>
              ) : (
                searchResults.map((player) => {
                  const isOnline = player.online === true && player.lastActive && player.lastActive > Date.now() - 5 * 60 * 1000;
                  return (
                    <div
                      key={player.uid}
                      className="flex items-center justify-between p-3 rounded bg-dark-card border border-dark-border hover:border-[#6875F5]/30 transition duration-200"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? "bg-[#66FCF1] shadow-[0_0_8px_rgba(102,252,241,0.6)] animate-pulse" : "bg-slate-700"}`}></span>
                        <div className="min-w-0">
                          <p className="font-bold text-white text-xs truncate max-w-[120px] uppercase font-mono">{player.username}</p>
                          <p className="text-[9px] text-[#6875F5] font-mono uppercase tracking-tight">{player.score || 0} XP</p>
                        </div>
                      </div>
                      <div className="text-right text-[9px] text-slate-500 font-mono">
                        <span className={isOnline ? "text-[#66FCF1] font-bold" : ""}>
                          {isOnline ? "ONLINE" : "OFFLINE"}
                        </span>
                        <p className="mt-0.5 tracking-tighter uppercase">{player.wins}W • {player.losses}L</p>
                      </div>
                    </div>
                  );
                })
              )
            ) : allOnlineUsers.length === 0 ? (
              <div className="text-center py-8 text-slate-500 font-mono text-[10px] uppercase tracking-widest">
                Nenhum outro jogador online
              </div>
            ) : (
              allOnlineUsers.map((player) => {
                return (
                  <div
                    key={player.uid}
                    className="flex items-center justify-between p-3 rounded bg-[#010203]/40 border border-dark-border hover:border-[#66FCF1]/30 transition duration-200"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-[#66FCF1] shadow-[0_0_8px_rgba(102,252,241,0.6)] shrink-0 animate-pulse"></span>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-200 text-xs truncate max-w-[120px] uppercase font-mono">{player.username}</p>
                        <p className="text-[9px] text-[#6875F5] font-mono uppercase tracking-tight">{player.score || 0} XP</p>
                      </div>
                    </div>
                    
                    <div className="text-right text-[9px] font-mono text-slate-500">
                      <span className="text-[#66FCF1] font-bold tracking-wider">ONLINE</span>
                      <p className="mt-0.5 tracking-tighter uppercase">{player.wins}W • {player.losses}L</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
