// app/page.tsx
"use client";

import { useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const languageOptions = [
  { value: "auto", label: "Auto detect" },
  { value: "english", label: "English / Singlish" },
  { value: "mandarin", label: "Mandarin" },
  { value: "cantonese", label: "Cantonese" },
  { value: "hokkien", label: "Hokkien" },
  { value: "teochew", label: "Teochew" },
];

export default function HomePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState("auto");
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  // Send message to backend API
  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: input.trim(),
    };

    // Optimistically add user message to chat list
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setErrorText("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMessage.content,
          language: language === "auto" ? undefined : language,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorText(
          data?.error || "Server is busy. Please try again later."
        );
        setLoading(false);
        return;
      }

      const data = (await res.json()) as { reply?: string };
      const replyText =
        data.reply ||
        "Sorry, I am temporarily unable to respond. Please try again later.";

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: replyText,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error("sendMessage error", err);
      setErrorText(
        "Network request failed. Please check your connection or try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    // Use Enter to send, Shift + Enter for a new line
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-slate-100 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-4xl bg-slate-900/70 border border-slate-700/60 rounded-3xl shadow-2xl backdrop-blur-xl overflow-hidden flex flex-col h-[80vh]">
        {/* Header */}
        <header className="border-b border-slate-700/60 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Zero1 Multilingual Dialect Support Demo
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Type in English, Singlish, Mandarin, Cantonese, Hokkien or
              Teochew. The AI will try to reply in a matching language or
              dialect.
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Prototype
            </p>
            <p className="text-xs text-emerald-400">
              Backend: GPU-enabled local LLM
            </p>
          </div>
        </header>

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {/* Loading indicator at the top of the chat area */}
          {loading && (
            <div className="flex items-center gap-2 text-xs text-emerald-300 mb-1">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Zero1 Dialect AI is thinking of a better solution...</span>
            </div>
          )}

          {messages.length === 0 && !loading && (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 text-sm">
              <p className="mb-2">
                👋 Welcome to the Zero1 Dialect AI prototype.
              </p>
              <p className="mb-1">You can try messages like:</p>
              <p className="italic text-slate-300">
                "Why my bill so high one?" or "Why did my data finish so
                fast this month?"
              </p>
              <p className="mt-2 text-xs text-slate-500">
                You can also mix languages or use Cantonese / Hokkien /
                Teochew text.
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-emerald-500 text-slate-900 rounded-br-sm"
                    : "bg-slate-800/80 text-slate-100 rounded-bl-sm border border-slate-700/70"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
        </div>

        {/* Error message */}
        {errorText && (
          <div className="px-6 pb-1 text-xs text-red-400">
            {errorText}
          </div>
        )}

        {/* Input area */}
        <div className="border-t border-slate-700/60 px-6 py-4 space-y-2 bg-slate-900/80">
          <div className="flex items-center justify-between gap-3 mb-1">
            <label className="text-xs text-slate-300 flex items-center gap-2">
              <span>Preferred reply language:</span>
              <select
                className="bg-slate-800 border border-slate-600 text-xs rounded-full px-3 py-1 outline-none focus:ring-1 focus:ring-emerald-400/70"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {languageOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-[10px] text-slate-500">
              Press Enter to send, Shift + Enter for a new line
            </p>
          </div>

          <div className="flex items-end gap-3">
            <textarea
              className="flex-1 resize-none rounded-2xl border border-slate-600 bg-slate-900/80 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-emerald-400/70 max-h-32 min-h-[48px]"
              placeholder="Type your question here, for example: Why is my bill higher this month? You can also try Singlish or dialect phrases."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="rounded-2xl px-4 py-2 text-sm font-medium bg-emerald-500 text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-400 transition-colors"
            >
              {loading
                ? "Thinking of a better solution..."
                : "Send"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}