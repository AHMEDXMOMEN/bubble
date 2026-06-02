// /api/chat.js
import OpenAI from "openai";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  // --- CORS ---
  const origin = req.headers.origin || "";
  const allowList = ["https://www.ghalirealty.com", "https://ghalirealty.com" ,"http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
  ];
  if (allowList.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Preflight + GET test
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method === "GET") return res.status(200).json({ status: "ok" });

  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { message } = req.body || {};
    const assistantId = process.env.ASSISTANT_ID;
    if (!message) return res.status(400).json({ error: "Missing 'message' in body" });
    if (!assistantId) return res.status(500).json({ error: "ASSISTANT_ID is not set" });

    // --- OpenAI Assistants API flow ---
    const thread = await client.beta.threads.create();
    await client.beta.threads.messages.create(thread.id, { role: "user", content: message });
    const run = await client.beta.threads.runs.create(thread.id, { assistant_id: assistantId });

let status;
const start = Date.now();

do {
  status = await client.beta.threads.runs.retrieve(thread.id, run.id);

  console.log("RUN STATUS:", status.status);
  console.log("LAST ERROR:", status.last_error);
  console.log("REQUIRED ACTION:", status.required_action);

  if (["failed", "cancelled", "expired"].includes(status.status)) {
    return res.status(500).json({
      error: "Run failed",
      status: status.status,
      last_error: status.last_error
    });
  }

  if (status.status === "requires_action") {
    return res.status(500).json({
      error: "Run requires action",
      required_action: status.required_action
    });
  }

  if (Date.now() - start > 60000) {
    return res.status(504).json({
      error: "OpenAI run timeout after 60 seconds",
      status: status.status
    });
  }

  await new Promise(r => setTimeout(r, 1000));

} while (status.status !== "completed");

    const messages = await client.beta.threads.messages.list(thread.id);
    const reply = messages.data[0]?.content?.[0]?.text?.value || "No response received.";
    return res.status(200).json({ reply });
  } catch (error) {
    console.error("❌ Error:", error);
    return res.status(500).json({ error: error.message || "Internal error" });
  }
}
