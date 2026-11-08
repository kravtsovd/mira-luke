import { agentInstructions } from "../../../../lib/agent-instructions";

export function GET(request: Request) {
  return new Response(agentInstructions(new URL(request.url).origin), { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
