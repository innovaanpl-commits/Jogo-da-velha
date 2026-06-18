import { useState, useEffect, useRef, FormEvent } from "react";
import { collection, addDoc, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { ChatMessage } from "../types";
import { Send, MessageSquare, Clock } from "lucide-react";

interface ChatProps {
  roomId: string;
  currentUserId: string;
  currentUserName: string;
}

const PRESET_MESSAGES = [
  "Boa sorte! 🍀",
  "Bom jogo! 👍",
  "Nossa, essa foi perto! 😱",
  "Opa, erro meu! 😅",
  "Excelente jogada! ⚔️",
  "De novo? 🔄",
  "Valeu pela partida! 🤝"
];

export default function Chat({ roomId, currentUserId, currentUserName }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query(
      collection(db, "rooms", roomId, "chats"),
      orderBy("createdAt", "asc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgList: ChatMessage[] = [];
      snapshot.forEach((doc) => {
        msgList.push({ id: doc.id, ...doc.data() } as ChatMessage);
      });
      setMessages(msgList);
    });

    return () => unsubscribe();
  }, [roomId]);

  useEffect(() => {
    // Scroll to bottom on updates
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    try {
      await addDoc(collection(db, "rooms", roomId, "chats"), {
        roomId,
        senderId: currentUserId,
        senderName: currentUserName,
        text: trimmed,
        createdAt: Date.now()
      });
    } catch (error) {
      console.error("Erro ao enviar mensagem: ", error);
    }
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage(inputValue);
    setInputValue("");
  };

  return (
    <div id="chat-component" className="bg-[#0B0C10] rounded border border-dark-border flex flex-col h-[400px] text-dark-text">
      {/* Title */}
      <div className="flex items-center gap-2.5 p-4 border-b border-dark-border shrink-0">
        <MessageSquare className="w-4 h-4 text-primary" />
        <h3 className="text-xs font-display font-light text-white uppercase tracking-widest">Chat da Arena</h3>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-600 text-xs">
            <MessageSquare className="w-8 h-8 opacity-20 mb-2" />
            <span className="font-mono uppercase text-[9px] tracking-widest">Silêncio sepulcral</span>
            <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wide">Mande provocações usando presets abaixo</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === currentUserId;
            return (
              <div
                key={msg.id}
                className={`flex flex-col max-w-[85%] ${isMe ? "ml-auto items-end" : "mr-auto items-start"}`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`text-[9px] font-mono uppercase tracking-wider font-semibold ${isMe ? "text-primary" : "text-secondary"}`}>
                    {isMe ? "Você" : msg.senderName}
                  </span>
                  <span className="text-[8px] text-slate-600 font-mono">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div
                  className={`p-2.5 rounded text-xs break-words border ${
                    isMe
                      ? "bg-primary/10 border-primary/20 text-white rounded-tr-none"
                      : "bg-dark-card border-dark-border text-slate-100 rounded-tl-none"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Preset Phrases */}
      <div className="px-4 py-2 bg-[#06070a] border-t border-dark-border overflow-x-auto whitespace-nowrap scrollbar-none shrink-0 flex gap-1.5">
        {PRESET_MESSAGES.map((phrase) => (
          <button
            key={phrase}
            id={`preset-chat-${phrase.replace(/\s+/g, '-').toLowerCase()}`}
            type="button"
            onClick={() => sendMessage(phrase)}
            className="text-[10px] bg-dark-bg hover:bg-dark-card border border-dark-border text-secondary px-2.5 py-1 rounded transition duration-200 cursor-pointer"
          >
            {phrase}
          </button>
        ))}
      </div>

      {/* Form Input */}
      <form onSubmit={handleFormSubmit} className="p-3 border-t border-dark-border bg-[#06070a] flex gap-2 shrink-0">
        <input
          id="chat-input-field"
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Digite sua provocação..."
          maxLength={100}
          className="flex-1 text-xs bg-dark-bg border border-dark-border outline-none rounded px-3 py-2 text-white focus:border-primary transition font-mono"
        />
        <button
          id="chat-send-btn"
          type="submit"
          disabled={!inputValue.trim()}
          className="bg-primary hover:bg-[#5bc7bf] disabled:bg-[#111] disabled:text-slate-600 text-dark-bg p-2.5 rounded transition cursor-pointer border-none flex items-center justify-center"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}
