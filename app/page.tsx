// app/page.tsx
"use client";

import { useState, useRef } from "react";

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

// Frontend will call /api/asr, which will proxy to the VM ASR backend
const ASR_ROUTE = "/api/asr";

export default function HomePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState("auto");
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingError, setRecordingError] = useState("");
  const [volumeLevel, setVolumeLevel] = useState(0); // 0–1 range for visual meter

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Send message to backend API
  const sendMessage = async (overrideText?: string) => {
    const content = (overrideText ?? input).trim();
    if (!content || loading) return;

    const userMessage: ChatMessage = {
      role: "user",
      content,
    };

    // Optimistically add user message to chat list
    setMessages((prev) => [...prev, userMessage]);
    if (!overrideText) {
      setInput("");
    }
    setErrorText("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: content,
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

  // Call ASR backend with an audio blob and return the transcribed text
  async function transcribeAudio(blob: Blob): Promise<string> {
    setRecordingError("");
    setIsTranscribing(true);

    try {
      const formData = new FormData();
      // IMPORTANT: field name must be "audio" to match /api/asr route.ts
      formData.append("audio", blob, "audio.webm");

      const res = await fetch(ASR_ROUTE, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("ASR /api/asr non-OK:", res.status, text);
        throw new Error("ASR request failed");
      }

      const data = (await res.json()) as { text?: string };
      const text = data.text?.trim() || "";

      if (!text) {
        throw new Error("Empty transcription");
      }

      return text;
    } catch (err) {
      console.error("transcribeAudio error", err);
      setRecordingError(
        "Voice recognition failed. Please try again or type your message."
      );
      return "";
    } finally {
      setIsTranscribing(false);
    }
  }

  // Handle the final audio blob after recording stops
  async function handleAudioBlob(blob: Blob) {
    const text = await transcribeAudio(blob);
    if (!text) return;

    // Automatically send transcribed text as a user message
    await sendMessage(text);
  }

  // Start visual volume analysis using Web Audio API
  function startVolumeVisualization(stream: MediaStream) {
    try {
      const AudioContextClass =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      const analyser = audioContext.createAnalyser();

      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const update = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(dataArray);

        // Compute a simple RMS-like value to represent volume
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const value = dataArray[i] - 128;
          sum += value * value;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        // Normalize between 0 and ~1
        const normalized = Math.min(1, rms / 50);
        setVolumeLevel(normalized);

        animationFrameRef.current = requestAnimationFrame(update);
      };

      update();
    } catch (err) {
      console.error("startVolumeVisualization error", err);
    }
  }

  // Stop the volume visualization
  function stopVolumeVisualization() {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setVolumeLevel(0);
  }

  // Start recording from the microphone
  const startRecording = async () => {
    try {
      setRecordingError("");

      // Check if the page is in a secure context
      if (typeof window !== "undefined" && window.isSecureContext === false) {
        // On non-secure origins (not https and not localhost),
        // browsers will block getUserMedia even if the user clicks "Allow".
        setRecordingError(
          "Browser requires HTTPS or localhost for microphone access. Please open this demo on http://localhost:3000 or via HTTPS."
        );
        console.warn("[recording] Insecure context: microphone access is blocked.");
        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setRecordingError("Microphone is not supported in this browser.");
        console.warn("[recording] navigator.mediaDevices.getUserMedia is not available");
        return;
      }

      console.log("[recording] Requesting microphone...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("[recording] Got audio stream:", stream);

      mediaStreamRef.current = stream;

      // Start volume visualization
      startVolumeVisualization(stream);

      // Reset chunks
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event: any) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        console.log("[recording] Recorder stopped");

        // Stop all tracks to release the microphone
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
        }

        // Stop volume visualization
        stopVolumeVisualization();

        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        audioChunksRef.current = [];

        console.log("[recording] Collected audio blob:", audioBlob);
        await handleAudioBlob(audioBlob);
      };

      recorder.start();
      console.log("[recording] Recorder started");
      setIsRecording(true);
    } catch (err: any) {
      console.error(
        "startRecording error",
        err,
        err?.name,
        err?.message
      );
      setRecordingError(
        `Could not access microphone (${err?.name || "error"}). Please check permissions and try again.`
      );
    }
  };

  // Stop recording if currently active
  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  // Toggle recording state when the microphone button is clicked
  const handleToggleRecording = async () => {
    if (isRecording) {
      stopRecording();
    } else {
      await startRecording();
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

  const showThinking = loading || isTranscribing;

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
              Type or speak in English, Singlish, Mandarin, Cantonese, Hokkien or
              Teochew. The AI will try to reply in a matching language or dialect.
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Prototype
            </p>
            <p className="text-xs text-emerald-400">
              Backend: GPU-enabled local LLM + ASR
            </p>
          </div>
        </header>

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {/* Loading / thinking indicator at the top of the chat area */}
          {showThinking && (
            <div className="flex items-center gap-2 text-xs text-emerald-300 mb-1">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                Zero1 Dialect AI is thinking of a better solution...
              </span>
            </div>
          )}

          {messages.length === 0 && !showThinking && (
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
                Teochew text. Or tap the microphone to speak.
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

        {/* Error messages */}
        {errorText && (
          <div className="px-6 pb-1 text-xs text-red-400">
            {errorText}
          </div>
        )}
        {recordingError && (
          <div className="px-6 pb-1 text-xs text-amber-400">
            {recordingError}
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
            {/* Microphone button for voice input + volume visualization */}
            <div className="flex flex-col items-start gap-1">
              <button
                type="button"
                onClick={handleToggleRecording}
                disabled={loading || isTranscribing}
                className={`flex items-center justify-center rounded-full px-3 py-2 text-xs font-medium border transition-colors ${
                  isRecording
                    ? "border-red-400 text-red-300 bg-red-950/40"
                    : "border-emerald-400/70 text-emerald-300 bg-slate-900"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <span
                  className={`w-2 h-2 rounded-full mr-2 ${
                    isRecording ? "bg-red-400 animate-pulse" : "bg-emerald-400"
                  }`}
                />
                {isRecording
                  ? "Listening... Tap to stop"
                  : isTranscribing
                  ? "Transcribing..."
                  : "Tap to speak"}
              </button>
              {/* Simple volume bar (only meaningful while recording) */}
              <div className="h-2 w-24 bg-slate-800 rounded-full overflow-hidden ml-1">
                <div
                  className="h-full bg-emerald-400 transition-[width] duration-75"
                  style={{
                    width: `${Math.round(
                      Math.min(1, volumeLevel) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>

            <textarea
              className="flex-1 resize-none rounded-2xl border border-slate-600 bg-slate-900/80 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-emerald-400/70 max-h-32 min-h-[48px]"
              placeholder="Type your question here, for example: Why is my bill higher this month? You can also try Singlish or dialect phrases."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              onClick={() => sendMessage()}
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