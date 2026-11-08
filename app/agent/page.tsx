import type { Metadata } from "next";
import { agentInstructions } from "../lib/agent-instructions";

export const metadata: Metadata = { title: "ИИ-агент · Мира и Люк" };

export default function AgentPage() {
  return <main style={{ maxWidth: 820, margin: "0 auto", padding: "32px 20px", lineHeight: 1.55 }}>
    <p><a href="/">← К мультикам</a></p>
    <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 16 }}>{agentInstructions("https://localhost")}</pre>
  </main>;
}
