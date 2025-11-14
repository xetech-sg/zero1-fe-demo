// app/api/asr/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs"; // Ensure we run in Node.js environment

export async function POST(req: NextRequest) {
  try {
    const ASR_URL = process.env.ASR_SERVER_URL;
    if (!ASR_URL) {
      console.error("[/api/asr] ASR_SERVER_URL is not set in env");
      return NextResponse.json(
        { error: "ASR_SERVER_URL is not configured" },
        { status: 500 }
      );
    }

    console.log("[/api/asr] Forwarding audio to:", ASR_URL);

    // Read multipart/form-data from the incoming request
    const formData = await req.formData();
    const audio = formData.get("audio") as File | null;

    if (!audio) {
      console.error("[/api/asr] No 'audio' field found in form data");
      return NextResponse.json(
        { error: "Missing audio file" },
        { status: 400 }
      );
    }

    // Prepare new form-data to forward to the Python ASR backend
    // Python endpoint expects the field name to be "file"
    const forwardForm = new FormData();
    forwardForm.append("file", audio, "input.webm");

    // Forward the request to the ASR backend
    const res = await fetch(ASR_URL, {
      method: "POST",
      body: forwardForm,
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      console.error(
        "[/api/asr] ASR backend returned non-OK status:",
        res.status,
        errorText
      );
      // Return error detail to frontend so you can see it in browser console
      return NextResponse.json(
        {
          error: "ASR backend error",
          backendStatus: res.status,
          backendDetail: errorText,
        },
        { status: 500 }
      );
    }

    // Expecting JSON like { "text": "..." }
    const data = await res.json().catch((err) => {
      console.error("[/api/asr] Failed to parse ASR backend JSON:", err);
      return null;
    });

    if (!data || typeof data.text !== "string") {
      console.error("[/api/asr] ASR backend response missing 'text':", data);
      return NextResponse.json(
        { error: "Invalid response from ASR backend" },
        { status: 500 }
      );
    }

    const text = data.text.trim();

    console.log("[/api/asr] Transcription OK:", text);

    return NextResponse.json({ text });
  } catch (err) {
    console.error("[/api/asr] Internal error:", err);
    return NextResponse.json(
      { error: "Internal server error in /api/asr" },
      { status: 500 }
    );
  }
}