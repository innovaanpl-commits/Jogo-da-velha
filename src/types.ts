export interface UserProfile {
  uid: string;
  username: string;
  wins: number;
  losses: number;
  draws: number;
  score: number;
  joinedAt: number;
  online?: boolean;
  lastActive?: number;
}

export interface GameRoom {
  id: string;
  hostId: string;
  hostName: string;
  guestId: string | null;
  guestName: string | null;
  status: 'waiting' | 'playing' | 'ended' | 'abandoned';
  board: (string | null)[];
  turn: string; // UID of the active player
  winnerId: string | null; // UID, or 'draw', or null
  createdAt: number;
  updatedAt: number;
  symbols: {
    [uid: string]: 'X' | 'O';
  };
  playAgain: string[]; // array of player uids who clicked "Play Again"
  lastMoveBy?: string; // UID of player who made the last move
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: number;
}

export interface MatchHistoryItem {
  id: string;
  roomId: string;
  player1Id: string;
  player1Name: string;
  player2Id: string;
  player2Name: string;
  winnerId: string | null; // UID of winner, or 'draw'
  endedAt: number;
}
