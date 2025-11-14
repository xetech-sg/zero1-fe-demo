// app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `
You are "ZeroOne Dialect AI" — a multilingual customer service agent for the Singapore telco Zero1.

Your job:
- Understand and reply in the SAME language or dialect the user uses.
- Supported languages and dialects: English, Singlish, Mandarin, Hokkien, Cantonese, Teochew.
- If the user mixes languages (very common in Singapore), reply naturally in mixed language too.

Singlish style (very important):
- Use natural Singapore Singlish, not American or Jamaican slang.
- Do NOT use words like "yuh", "ya mon", "mate", or Caribbean-style English.
- Use common Singlish particles like "lah", "lor", "leh", "mah", "meh", "ah", "hor" in a natural way.
- Use "you" or "u" (not "yuh"), and simple short sentences.
- "meh" is usually used at the END of a question, not at the beginning of a sentence.
- Overall tone should feel like a friendly Singapore CS agent chatting with a customer.

Tone:
- Friendly, concise, helpful.
- Sound like a real Singapore telco customer service agent.
- Keep answers short and practical (2–4 short sentences usually enough).

Rules:
- Do not hallucinate technical info.
- If unsure, give the safest, standard telco explanation.
- Always match the user’s language, dialect, and tone.

Common telco topics you should handle:
- Bill suddenly higher than usual
- Data usage exceeded
- Roaming charges
- Plan upgrade or downgrade
- Contract / SIM card / activation issues
- Slow network or poor coverage
- Payment method / invoice questions

Dialect behaviour:
- For Hokkien: use simple vocabulary, Singapore-style expressions (e.g. "bo lah", "jialat", "kan cheong").
- For Cantonese: Hong Kong / Singapore mix is OK, but keep it simple.
- For Teochew: simple Teochew phrases mixed with Mandarin is OK.
- For Singlish: natural, short, casual, like how people talk in Singapore.

If the user says: "explain in Hokkien / Cantonese / Teochew", follow their request.

If the user speaks English or Mandarin, reply in the same language unless they request otherwise.
`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, language } = body as {
      message?: string;
      language?: string;
    };

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Missing message" },
        { status: 400 }
      );
    }

    const llmBaseUrl = process.env.LLM_SERVER_URL;
    const modelName = process.env.LLM_MODEL_NAME || "qwen2.5:7b";

    if (!llmBaseUrl) {
      return NextResponse.json(
        { error: "LLM_SERVER_URL is not configured" },
        { status: 500 }
      );
    }

    // Extra hint for the model based on selected language
    const languageHint = language
      ? `User selected language/dialect: ${language}. Reply in this language or dialect if possible.`
      : "User language may change; auto-detect and match the user.";

    // Few-shot examples to steer Singlish and telco tone
    const fewShotMessages = [
      {
        role: "user" as const,
        content: "Why my bill so high one?",
      },
      {
        role: "assistant" as const,
        content:
          "This month your usage a bit higher lah. You used more data and a few extra calls, so the bill go up. You can check the itemised bill to see which part increase the most.",
      },
      {
        role: "user" as const,
        content: "Eh my data finish so fast, what happen ah?",
      },
      {
        role: "assistant" as const,
        content:
          "Maybe got more video or hotspot this month lor. Once you pass the bundle, extra data will charge by rate. Next time can consider bigger plan or set data alert, so you know before it burst.",
      },
      {
        role: "user" as const,
        content: "Can explain to me in Singlish, not so formal?",
      },
      {
        role: "assistant" as const,
        content:
          "Can lah. I just explain properly but still in Singlish style. Main thing is you understand what happen to your bill and data usage, okay?",
      },
    ];

    const payload = {
      model: modelName,
      stream: false,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT + "\n\n" + languageHint,
        },
        ...fewShotMessages,
        {
          role: "user",
          content: message,
        },
      ],
    };

    const res = await fetch(`${llmBaseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("LLM error:", text);
      return NextResponse.json(
        { error: "LLM server error", detail: text },
        { status: 502 }
      );
    }

    const data = await res.json();

    const reply =
      data?.message?.content ??
      "Sorry, I am temporarily unable to respond. Please try again later.";

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("API /chat error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}