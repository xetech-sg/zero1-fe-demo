// app/api/asr/route.ts
import { NextRequest, NextResponse } from "next/server";

// Ensure this route runs on the Node.js runtime (not edge)
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const asrServerUrl = process.env.ASR_SERVER_URL;
    if (!asrServerUrl) {
      return NextResponse.json(
        { error: "ASR_SERVER_URL is not configured" },
        { status: 500 }
      );
    }

    // Parse multipart/form-data from the frontend
    const incomingForm = await req.formData();
    const file = incomingForm.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "Missing audio file in 'file' field" },
        { status: 400 }
      );
    }

    // Prepare a new FormData to forward to the ASR backend
    const forwardForm = new FormData();
    forwardForm.append("file", file, "audio.webm");

    // Forward the request to the ASR backend (Python + Faster-Whisper)
    const res = await fetch(asrServerUrl, {
      method: "POST",
      body: forwardForm,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("ASR backend error:", text);
      return NextResponse.json(
        { error: "ASR backend error", detail: text || undefined },
        { status: 502 }
      );
    }

    // Expecting JSON: { "text": "..." }
    const data = await res.json().catch(() => null);

    if (!data || typeof data.text !== "string") {
      return NextResponse.json(
        { error: "Invalid ASR response format" },
        { status: 502 }
      );
    }

    return NextResponse.json({ text: data.text });
  } catch (err) {
    console.error("API /asr error:", err);
    return NextResponse.json(
      { error: "Internal server error in /api/asr" },
      { status: 500 }
    );
  }
}