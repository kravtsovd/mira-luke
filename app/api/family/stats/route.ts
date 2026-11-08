import { getSession } from "../../../lib/auth";
import { familyChildIds } from "../../../lib/family-store";
import { readFamilyStats, StatsUnavailable } from "../../../lib/family-stats";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
const json = (body: object, status = 200) => Response.json(body, { status, headers });

export async function GET(request: Request) {
  const session = getSession(request);
  if (!session) return json({ error: "Войдите, чтобы увидеть статистику семьи." }, 401);
  try {
    return json(await readFamilyStats(session.familyId, await familyChildIds(session.familyId)));
  } catch (error) {
    if (error instanceof StatsUnavailable && error.reason === "not_configured") {
      return json({ error: "Статистика ещё не подключена.", reason: "not_configured" }, 503);
    }
    return json({ error: "Не удалось получить статистику. Попробуйте позже." }, 503);
  }
}
