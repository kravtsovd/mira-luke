import { TOPICS } from "../../../../data/catalog";
import { availableGames } from "../../../../lib/profiles";
import { agentContext, agentFailure, agentHeaders, DOCS_URL } from "../../../../lib/agent-api";
import { familyName } from "../../../../lib/family-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { familyId, children } = await agentContext(request);
    return Response.json({
      family: { id: familyId, name: await familyName(familyId).catch(() => "") },
      children: children.map(row => ({ id: row.profile, name: row.name, avatar: row.avatar, kind: row.kind, settings: row.settings, availableGames: availableGames(row.profile, row.kind) })),
      topics: TOPICS.map(topic => ({ id: topic.id, title: topic.title })),
      docs: DOCS_URL,
    }, { headers: agentHeaders });
  } catch (error) { return agentFailure(error); }
}
