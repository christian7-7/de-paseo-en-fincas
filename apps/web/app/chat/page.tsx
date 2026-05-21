"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Smile, TreePine, X, RefreshCw } from "lucide-react";
import { Button, Input, FincaCard } from "@repo/ui";

interface Message {
  id: string;
  role: "user" | "bot" | "system";
  content: string;
  timestamp: Date;
  fincaCards?: Array<{
    id: string;
    slug: string;
    name: string;
    municipality: string;
    department: string;
    capacity: number;
    bedrooms: number;
    pricePerNight: number;
    amenities: string[];
    imageUrl?: string;
    avgRating?: number;
  }>;
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="h-2 w-2 rounded-full bg-[#E8832A]"
          animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </div>
  );
}

const QUICK_ACTIONS = [
  "Buscar finca en Guatapé",
  "Fincas con piscina cerca de Bogotá",
  "Finca para 10 personas este fin de semana",
  "¿Cuáles son las políticas de cancelación?",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "bot",
      content: "¡Hola! 👋 Soy **Paseo**, tu asistente de De Paseo en Fincas. ¿A dónde quieres escaparte esta vez? Puedo ayudarte a encontrar la finca perfecta para tu descanso 🌿",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [socketReady, setSocketReady] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  // WebSocket connection to gateway
  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_GATEWAY_WS_URL || "ws://localhost:3001/ws";
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setSocketReady(true);
        // Register as web channel
        ws.send(JSON.stringify({ type: "REGISTER", channel: "WEB" }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);

          if (data.type === "SESSION_ID") {
            setSessionId(data.sessionId);
          } else if (data.type === "BOT_RESPONSE") {
            setIsTyping(false);
            const botMessage: Message = {
              id: `bot_${Date.now()}`,
              role: "bot",
              content: data.text,
              timestamp: new Date(),
              fincaCards: data.fincas,
            };
            setMessages((prev) => [...prev, botMessage]);
          } else if (data.type === "TYPING") {
            setIsTyping(true);
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        setSocketReady(false);
      };

      ws.onerror = () => {
        setSocketReady(false);
      };
    } catch {
      setSocketReady(false);
    }

    return () => {
      wsRef.current?.close();
    };
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      const userMessage: Message = {
        id: `user_${Date.now()}`,
        role: "user",
        content: text,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setIsTyping(true);

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "MESSAGE",
            text,
            sessionId,
            channel: "WEB",
          })
        );
      } else {
        // Fallback: HTTP API
        try {
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, sessionId, channel: "WEB" }),
          });
          const data = await res.json() as { text?: string; sessionId?: string };
          if (data.sessionId) setSessionId(data.sessionId);
          setIsTyping(false);
          setMessages((prev) => [
            ...prev,
            {
              id: `bot_${Date.now()}`,
              role: "bot",
              content: data.text || "Lo siento, tuve un problema. ¿Puedes intentar de nuevo?",
              timestamp: new Date(),
            },
          ]);
        } catch {
          setIsTyping(false);
          setMessages((prev) => [
            ...prev,
            {
              id: `err_${Date.now()}`,
              role: "bot",
              content: "Ups, tuve un problema de conexión. ¿Puedes intentar de nuevo? 🙏",
              timestamp: new Date(),
            },
          ]);
        }
      }
    },
    [sessionId]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  function renderMessageContent(content: string) {
    // Simple markdown-ish rendering
    return content
      .split("**")
      .map((part, i) =>
        i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>
      );
  }

  return (
    <div className="flex flex-col h-screen bg-background max-w-2xl mx-auto border-x border-border">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border bg-card">
        <div className="relative">
          <div className="h-10 w-10 rounded-full bg-[#E8832A]/20 flex items-center justify-center">
            <TreePine className="h-5 w-5 text-[#E8832A]" />
          </div>
          <div
            className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${
              socketReady ? "bg-green-500" : "bg-yellow-500"
            }`}
          />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-sm">Paseo</div>
          <div className="text-xs text-muted-foreground">
            {socketReady ? "En línea" : "Conectando..."}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setMessages([{
          id: "welcome",
          role: "bot",
          content: "¡Hola de nuevo! ¿En qué te puedo ayudar?",
          timestamp: new Date(),
        }])}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {message.role === "bot" && (
                <div className="mr-2 shrink-0">
                  <div className="h-7 w-7 rounded-full bg-[#E8832A]/20 flex items-center justify-center">
                    <TreePine className="h-3.5 w-3.5 text-[#E8832A]" />
                  </div>
                </div>
              )}
              <div className={`max-w-[80%] space-y-2`}>
                <div
                  className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    message.role === "user"
                      ? "bg-[#E8832A] text-white rounded-tr-sm"
                      : "bg-muted text-foreground rounded-tl-sm"
                  }`}
                >
                  {renderMessageContent(message.content)}
                </div>

                {/* Finca cards in message */}
                {message.fincaCards && message.fincaCards.length > 0 && (
                  <div className="space-y-2">
                    {message.fincaCards.map((finca) => (
                      <FincaCard
                        key={finca.id}
                        {...finca}
                        weekendPrice={undefined}
                        className="text-xs"
                      />
                    ))}
                  </div>
                )}

                <div className="text-xs text-muted-foreground px-1">
                  {message.timestamp.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing indicator */}
        {isTyping && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-end gap-2"
          >
            <div className="h-7 w-7 rounded-full bg-[#E8832A]/20 flex items-center justify-center shrink-0">
              <TreePine className="h-3.5 w-3.5 text-[#E8832A]" />
            </div>
            <div className="bg-muted rounded-2xl rounded-tl-sm">
              <TypingIndicator />
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick actions (show if few messages) */}
      {messages.length <= 2 && (
        <div className="px-4 pb-2">
          <div className="flex flex-wrap gap-2">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action}
                onClick={() => sendMessage(action)}
                className="text-xs px-3 py-1.5 rounded-full border border-[#E8832A]/30 text-[#E8832A] hover:bg-[#E8832A]/10 transition-colors"
              >
                {action}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <Smile className="h-5 w-5" />
          </button>
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe tu mensaje..."
            className="flex-1 rounded-full border-muted-foreground/30 focus-visible:ring-[#E8832A]"
            disabled={isTyping}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isTyping}
            className="rounded-full shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <p className="text-xs text-muted-foreground text-center mt-2">
          Paseo puede cometer errores. Verifica información importante.
        </p>
      </div>
    </div>
  );
}
