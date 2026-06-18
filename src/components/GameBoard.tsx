import { useState, useEffect, useRef } from "react";
import { doc, updateDoc, onSnapshot, arrayUnion, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { GameRoom, MatchHistoryItem } from "../types";
import { X, Circle, ArrowLeft, RefreshCw, Copy, Check, Users, Sparkles, UserCheck, LogOut, AlertTriangle, Volume2, VolumeX } from "lucide-react";
import { motion } from "motion/react";
import Chat from "./Chat";
import { sounds } from "../lib/sounds";

interface GameBoardProps {
  roomId: string;
  currentUserId: string;
  currentUserName: string;
  onLeaveRoom: () => void;
}

const WINNING_COMBOS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // linhas
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // colunas
  [0, 4, 8], [2, 4, 6]             // diagonais
];

export default function GameBoard({ roomId, currentUserId, currentUserName, onLeaveRoom }: GameBoardProps) {
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [copied, setCopied] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [muted, setMuted] = useState(sounds.getIsMuted());
  
  const recordedRoundHash = useRef<string>("");
  const prevBoardRef = useRef<(string | null)[]>([]);
  const prevStatusRef = useRef<string>("");

  useEffect(() => {
    const roomRef = doc(db, "rooms", roomId);

    const unsubscribe = onSnapshot(roomRef, async (snapshot) => {
      if (!snapshot.exists()) {
        alert("Esta sala foi encerrada.");
        onLeaveRoom();
        return;
      }

      const data = snapshot.data() as GameRoom;
      setRoom(data);

      // --- SOUND TRIGGER ENGINE ---
      // 1. Move played trigger: compare new board with previously tracked board representation
      if (prevBoardRef.current && prevBoardRef.current.length === 9) {
        let lastPlayedSymbol: "X" | "O" | null = null;
        for (let i = 0; i < 9; i++) {
          if (prevBoardRef.current[i] === null && data.board[i] !== null) {
            lastPlayedSymbol = data.board[i] as "X" | "O";
          }
        }
        if (lastPlayedSymbol) {
          sounds.playMove(lastPlayedSymbol);
        }
      }
      prevBoardRef.current = data.board;

      // 2. Victory or Draw transition sound triggers
      if (prevStatusRef.current && prevStatusRef.current === "playing" && data.status === "ended") {
        if (data.winnerId === "draw") {
          sounds.playDraw();
        } else {
          sounds.playWin(); // plays beautiful synthesizer sound effect
        }
      }
      prevStatusRef.current = data.status;

      // Handle self-registration as Guest if there is no Guest and we are not the Host
      if (data.status === "waiting" && !data.guestId && data.hostId !== currentUserId) {
        try {
          await updateDoc(roomRef, {
            guestId: currentUserId,
            guestName: currentUserName,
            status: "playing",
            turn: Math.random() > 0.5 ? data.hostId : currentUserId, // Random start turn
            symbols: {
              [data.hostId]: "X",
              [currentUserId]: "O"
            },
            updatedAt: Date.now()
          });
        } catch (error) {
          console.error("Erro ao registrar-se como adversário: ", error);
        }
      }
    }, (error) => {
      console.error("Erro ao ler dados da sala: ", error);
    });

    return () => unsubscribe();
  }, [roomId, currentUserId, currentUserName, onLeaveRoom]);

  // Check stats logging on match conclusion
  useEffect(() => {
    if (!room || room.status !== "ended" || !room.winnerId) return;

    // We build a unique hash for this round using board contents and updatedAt timestamp
    const roundHash = `${room.id}_${room.board.join("")}_${room.updatedAt}`;
    
    // Prevent double processing for same exact end state
    if (recordedRoundHash.current === roundHash) return;
    recordedRoundHash.current = roundHash;

    const recordStatsAndMatch = async () => {
      const isWinner = room.winnerId === currentUserId;
      const isDraw = room.winnerId === "draw";
      const isParticipant = currentUserId === room.hostId || currentUserId === room.guestId;

      if (!isParticipant) return; // Only actual players update their stats

      try {
        // 1. Update personal stats on Firestore
        const userRef = doc(db, "users", currentUserId);
        
        let statChanges: { wins?: number; losses?: number; draws?: number; score?: number } = {};

        if (isWinner) {
          statChanges = {
            wins: (window as any)._currentUserStats?.wins ? (window as any)._currentUserStats.wins + 1 : 1,
            score: (window as any)._currentUserStats?.score ? (window as any)._currentUserStats.score + 3 : 3
          };
        } else if (isDraw) {
          statChanges = {
            draws: (window as any)._currentUserStats?.draws ? (window as any)._currentUserStats.draws + 1 : 1,
            score: (window as any)._currentUserStats?.score ? (window as any)._currentUserStats.score + 1 : 1
          };
        } else {
          statChanges = {
            losses: (window as any)._currentUserStats?.losses ? (window as any)._currentUserStats.losses + 1 : 1
          };
        }

        await updateDoc(userRef, {
          ...statChanges,
          // Keep score from becoming negative, although it shouldn't
        }).catch(err => {
          console.warn("Erro ao salvar pontos individuais, tentando recriar documento do usuário...", err);
        });

        // 2. Only the client of the player who made the last move (or host, if last move unlogged) writes the match history entry to avoid duplication
        const isAuthorOfLog = room.lastMoveBy === currentUserId || (room.hostId === currentUserId && !room.lastMoveBy);
        
        if (isAuthorOfLog && room.guestId) {
          const matchId = `match_${room.id}_${Date.now()}`;
          const matchData: MatchHistoryItem = {
            id: matchId,
            roomId: room.id,
            player1Id: room.hostId,
            player1Name: room.hostName,
            player2Id: room.guestId,
            player2Name: room.guestName || "Instável",
            winnerId: room.winnerId,
            endedAt: Date.now()
          };
          
          await setDoc(doc(db, "matches", matchId), matchData);
        }
      } catch (err) {
        console.error("Erro no processamento do fim do jogo: ", err);
      }
    };

    recordStatsAndMatch();
  }, [room, currentUserId]);

  if (!room) {
    return (
      <div className="flex justify-center items-center h-[300px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  const isHost = room.hostId === currentUserId;
  const isGuest = room.guestId === currentUserId;
  const isPlayer = isHost || isGuest;
  const mySymbol = room.symbols[currentUserId] || (isHost ? "X" : "O");
  const opponentSymbol = mySymbol === "X" ? "O" : "X";
  const opponentName = isHost ? (room.guestName || "Aguardando jogador...") : room.hostName;
  const isMyTurn = room.status === "playing" && room.turn === currentUserId;

  const handleCellClick = async (index: number) => {
    if (!isPlayer || !isMyTurn || room.board[index] !== null || room.status !== "playing") {
      return;
    }

    const nextBoard = [...room.board];
    nextBoard[index] = mySymbol;

    let winnerId: string | null = null;
    let newStatus: GameRoom["status"] = "playing";

    // Win check
    for (const combo of WINNING_COMBOS) {
      const [a, b, c] = combo;
      if (nextBoard[a] && nextBoard[a] === nextBoard[b] && nextBoard[a] === nextBoard[c]) {
        winnerId = currentUserId;
        newStatus = "ended";
        break;
      }
    }

    // Draw check
    if (!winnerId && nextBoard.every((cell) => cell !== null)) {
      winnerId = "draw";
      newStatus = "ended";
    }

    // Prepare next turn player
    const opponentId = isHost ? room.guestId : room.hostId;
    const nextTurn = opponentId || room.hostId; // fallback in case guest left

    const roomRef = doc(db, "rooms", roomId);
    try {
      if (newStatus === "ended") {
        await updateDoc(roomRef, {
          board: nextBoard,
          status: "ended",
          winnerId,
          lastMoveBy: currentUserId,
          updatedAt: Date.now()
        });
      } else {
        await updateDoc(roomRef, {
          board: nextBoard,
          turn: nextTurn,
          lastMoveBy: currentUserId,
          updatedAt: Date.now()
        });
      }
    } catch (error) {
      console.error("Erro ao realizar jogada: ", error);
    }
  };

  const handlePlayAgainRequest = async () => {
    if (!isPlayer) return;

    const roomRef = doc(db, "rooms", roomId);
    let updatedPlayAgain = room.playAgain || [];
    
    if (updatedPlayAgain.includes(currentUserId)) return; // already voted

    updatedPlayAgain = [...updatedPlayAgain, currentUserId];

    try {
      // Both agreed -> Restart board
      if (updatedPlayAgain.length >= 2) {
        await updateDoc(roomRef, {
          board: Array(9).fill(null),
          status: "playing",
          winnerId: null,
          playAgain: [],
          turn: room.winnerId && room.winnerId !== "draw" ? room.winnerId : room.hostId, // winner plays first, or fallback
          lastMoveBy: "",
          updatedAt: Date.now()
        });
      } else {
        await updateDoc(roomRef, {
          playAgain: updatedPlayAgain,
          updatedAt: Date.now()
        });
      }
    } catch (error) {
      console.error("Erro ao votar para jogar novamente: ", error);
    }
  };

  const copyRoomLink = () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${room.id}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const getWinnerMessage = () => {
    if (room.winnerId === "draw") return "Velha! Empate técnico! 🤝";
    if (room.winnerId === currentUserId) return "Parabéns! Você venceu! 🎉🏆";
    return `Oponente (${opponentName}) venceu! 😭 Better luck next time!`;
  };

  const handleLeaveClick = () => {
    if (room && room.status === "playing") {
      setShowLeaveConfirm(true);
    } else {
      onLeaveRoom();
    }
  };

  const toggleMute = () => {
    const isNowMuted = sounds.toggleMute();
    setMuted(isNowMuted);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full text-dark-text">
      {/* Game Column */}
      <div className="lg:col-span-2 space-y-6">
        {/* Game State Header */}
        <div className="bg-[#0B0C10] rounded p-4 border border-dark-border flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <button
              id="game-leave-btn"
              type="button"
              onClick={handleLeaveClick}
              className="flex items-center gap-1.5 text-xs uppercase tracking-wider font-bold text-rose-400 hover:text-white bg-dark-card border border-dark-border hover:border-rose-500/50 hover:bg-rose-950/20 px-4 py-2 rounded transition cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-rose-500" /> Sair
            </button>

            <button
              id="game-volume-btn"
              type="button"
              onClick={toggleMute}
              className="flex items-center justify-center p-2 rounded bg-dark-card border border-dark-border hover:border-primary/50 text-slate-400 hover:text-white transition cursor-pointer"
              title={muted ? "Ativar som" : "Desativar som"}
            >
              {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-[#66FCF1]" />}
            </button>
          </div>

          <span className="font-mono text-[10px] uppercase tracking-wider text-secondary bg-dark-bg px-3 py-1 rounded border border-dark-border flex items-center gap-1.5">
            Sala ID: <b className="text-primary tracking-wider select-all">{room.id}</b>
            <button id="copy-room-id-btn" type="button" onClick={copyRoomLink} className="text-secondary hover:text-primary p-0.5 ml-1 transition cursor-pointer">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </span>
        </div>

        {/* Board & Players Dual Visualizer */}
        <div className="bg-[#0B0C10] rounded border border-dark-border p-6 flex flex-col items-center">
          
          {/* Players Indicators */}
          <div className="w-full grid grid-cols-2 gap-4 mb-8">
            {/* Host */}
            <div className={`p-4 rounded border transition duration-300 ${
              room.status === "playing" && room.turn === room.hostId
                ? "bg-dark-card border-primary ring-1 ring-primary/45 shadow-[0_0_12px_rgba(102,252,241,0.15)]"
                : "bg-dark-bg/40 border-dark-border"
            }`}>
              <div className="flex justify-between items-center">
                <span className="text-[9px] uppercase tracking-widest font-bold text-primary font-mono">Jogador X</span>
                {room.status === "playing" && room.turn === room.hostId && (
                  <span className="animate-pulse h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_#66FCF1]"></span>
                )}
              </div>
              <p className="text-sm font-bold text-white truncate mt-1">
                {room.hostName} {room.hostId === currentUserId ? "(Você)" : ""}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="bg-primary/10 text-primary p-1 rounded">
                  <X className="w-3.5 h-3.5" />
                </span>
                <span className="text-slate-500 text-[10px] uppercase tracking-wider font-mono">Símbolo Principal</span>
              </div>
            </div>

            {/* Guest */}
            <div className={`p-4 rounded border transition duration-300 ${
              room.status === "playing" && room.guestId && room.turn === room.guestId
                ? "bg-dark-card border-secondary ring-1 ring-secondary/45 shadow-[0_0_12px_rgba(69,162,158,0.12)]"
                : "bg-dark-bg/40 border-dark-border"
            }`}>
              <div className="flex justify-between items-center">
                <span className="text-[9px] uppercase tracking-widest font-bold text-secondary font-mono">Jogador O</span>
                {room.status === "playing" && room.guestId && room.turn === room.guestId && (
                  <span className="animate-pulse h-2 w-2 rounded-full bg-secondary shadow-[0_0_8px_#45A29E]"></span>
                )}
              </div>
              <p className="text-sm font-bold text-white truncate mt-1">
                {room.guestName || "Aguardando..."} {room.guestId === currentUserId ? "(Você)" : ""}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="bg-secondary/10 text-secondary p-1 rounded">
                  <Circle className="w-3.5 h-3.5" />
                </span>
                <span className="text-slate-500 text-[10px] uppercase tracking-wider font-mono">
                  {room.guestId ? "Símbolo Convidado" : "Disponível"}
                </span>
              </div>
            </div>
          </div>

          {/* Current Turn Banner */}
          {room.status === "playing" && (
            <div className="mb-6 w-full text-center">
              <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded text-xs font-mono uppercase tracking-widest border ${
                isMyTurn
                  ? "bg-primary/5 text-primary border-primary/30 glow-primary font-bold"
                  : "bg-dark-bg/50 text-slate-500 border-dark-border"
              }`}>
                {isMyTurn ? "🔔 É a sua vez de jogar!" : `Sopro de expectativa: Vez de ${room.turn === room.hostId ? room.hostName : room.guestName}`}
              </span>
            </div>
          )}

          {/* Waiting for competitor state */}
          {room.status === "waiting" ? (
            <div className="flex-1 min-h-[300px] flex flex-col items-center justify-center text-center p-8 border border-dashed border-dark-border rounded w-full">
              <Users className="w-10 h-10 text-secondary/40 animate-bounce mb-4" />
              <h3 className="text-sm uppercase tracking-widest font-display font-light text-white">Pronto para o Combate!</h3>
              <p className="text-dark-text text-xs max-w-sm mt-3 mb-6 leading-relaxed">
                Aguardando um oponente entrar na arena. Copie o link abaixo para convidar alguém diretamente!
              </p>

              {/* Share box */}
              <div className="flex items-center gap-2 bg-[#0a0a0c] border border-dark-border p-2 rounded w-full max-w-md">
                <span className="flex-1 text-slate-500 text-xs truncate max-w-[240px] pl-2 font-mono">
                  {`${window.location.origin}${window.location.pathname}?room=${room.id}`}
                </span>
                <button
                  id="game-copy-[url]-btn"
                  type="button"
                  onClick={copyRoomLink}
                  className="flex items-center gap-1 bg-primary hover:bg-[#5bc7bf] text-dark-bg font-bold px-3 py-1.5 rounded text-[10px] uppercase tracking-wider transition cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copiado" : "Copiar Link"}
                </button>
              </div>
            </div>
          ) : (
            /* Match Grid Canvas */
            <div className="grid grid-cols-3 gap-3 w-full max-w-[325px] aspect-square relative my-4">
              {room.board.map((cell, index) => {
                const canPlay = room.status === "playing" && isMyTurn && cell === null;
                return (
                  <button
                    key={index}
                    id={`board-cell-${index}`}
                    type="button"
                    onClick={() => handleCellClick(index)}
                    disabled={!canPlay}
                    className={`aspect-square w-full rounded flex items-center justify-center transition border text-4xl cursor-pointer ${
                      cell === "X"
                        ? "bg-dark-card border-primary/30 text-primary shadow-inner"
                        : cell === "O"
                        ? "bg-dark-card border-secondary/30 text-secondary shadow-inner"
                        : "bg-dark-bg/40 hover:bg-dark-card border-dark-border hover:border-primary/50 active:scale-95 disabled:scale-100 disabled:bg-dark-bg/10"
                    }`}
                  >
                    {cell === "X" && (
                      <motion.div
                        initial={{ scale: 0, rotate: -45 }}
                        animate={{ scale: 1, rotate: 0 }}
                        className="p-1"
                      >
                        <X className="w-12 h-12 stroke-[2.5]" />
                      </motion.div>
                    )}
                    {cell === "O" && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="p-1.5"
                      >
                        <Circle className="w-11 h-11 stroke-[2.5]" />
                      </motion.div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Ended Match Overlay/Summary */}
          {room.status === "ended" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 w-full text-center p-6 bg-dark-bg rounded border border-dark-border"
            >
              <h4 className="text-sm font-display uppercase tracking-wider font-bold text-white mb-2 flex items-center justify-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" /> {getWinnerMessage()}
              </h4>
              <p className="text-slate-500 text-[11px] mb-5 uppercase tracking-wide">
                {room.playAgain && room.playAgain.includes(currentUserId)
                  ? "Você concordou com a revanche. Aguardando oponente..."
                  : "Deseja realizar uma revanche estratégica com o oponente?"}
              </p>

              <div className="flex gap-3 justify-center">
                <button
                  id="game-replay-btn"
                  type="button"
                  onClick={handlePlayAgainRequest}
                  disabled={room.playAgain && room.playAgain.includes(currentUserId)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded font-bold uppercase tracking-wider text-[11px] transition duration-200 cursor-pointer ${
                    room.playAgain && room.playAgain.includes(currentUserId)
                      ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                      : "bg-primary hover:bg-[#5bc7bf] text-dark-bg shadow-lg shadow-primary/10"
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${room.playAgain && room.playAgain.includes(currentUserId) ? "" : "animate-spin-slow"}`} />
                  {room.playAgain && room.playAgain.includes(currentUserId)
                    ? "Aceito! Aguardando..."
                    : "Jogar Novamente"}
                </button>
              </div>

              {/* Shows how many voted */}
              <div className="flex justify-center items-center gap-1.5 mt-4">
                <UserCheck className="w-3.5 h-3.5 text-slate-600" />
                <span className="text-[10px] text-slate-600 font-mono uppercase tracking-wider">
                  Revanche: {room.playAgain?.length || 0}/2 prontos
                </span>
              </div>
            </motion.div>
          )}

        </div>
      </div>

      {/* Chat Column */}
      <div className="lg:col-span-1">
        <Chat
          roomId={room.id}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
        />
      </div>

      {/* Leave Confirmation Modal overlay */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in text-dark-text">
          <div className="bg-[#0B0C10] rounded border border-dark-border w-full max-w-sm p-6 relative shadow-2xl">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-rose-500/10 rounded border border-rose-500/20 text-rose-400 mb-4 select-none">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-display font-light uppercase tracking-widest text-white leading-relaxed">
                Abandonar Arena?
              </h3>
              <p className="text-[10px] text-slate-400 font-mono uppercase tracking-widest mt-1">
                Aviso de Capitulação
              </p>
              <p className="text-gray-400 text-xs font-light mt-3 leading-relaxed">
                Se você sair do jogo agora, a partida em andamento será descartada ou abandonada e suas estatísticas de derrota poderão ser impactadas.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                id="confirm-leave-btn"
                type="button"
                onClick={onLeaveRoom}
                className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-mono text-xs font-bold uppercase tracking-widest py-3 px-4 rounded transition cursor-pointer border-none"
              >
                Sim, Sair
              </button>
              <button
                id="cancel-leave-btn"
                type="button"
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 bg-[#1F2833] hover:bg-[#1f2833]/80 border border-dark-border text-white font-mono text-xs font-bold uppercase tracking-widest py-3 px-4 rounded transition cursor-pointer"
              >
                Não, Continuar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
