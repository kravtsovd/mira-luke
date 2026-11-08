import { fetchCatalogSnapshot } from "../../../../lib/catalog-store";
import { addLibraryVideo } from "../../../../lib/library-service";
import { LibraryError } from "../../../../lib/library-input";
import { agentContext, agentFailure, agentHeaders, readAgentBody, removeVideoFromChild, requireChild, videoIdFrom } from "../../../../lib/agent-api";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function GET(request: Request) {
  try {
    const { children } = await agentContext(request);
    const child = requireChild(children, new URL(request.url).searchParams.get("child"));
    const snapshot = await fetchCatalogSnapshot();
    const videos = snapshot.videos.filter(video => !video.profiles?.length || video.profiles.includes(child)).map(video => ({
      id: video.id, title: video.title, channel: video.channel, topicId: video.topicId, language: video.language,
      own: !!video.profiles?.length, url: `https://www.youtube.com/watch?v=${video.id}`,
    }));
    return Response.json({ child, count: videos.length, videos }, { headers: agentHeaders });
  } catch (error) { return agentFailure(error); }
}

export async function POST(request: Request) {
  try {
    const { familyId, children } = await agentContext(request);
    const body = await readAgentBody(request);
    const child = requireChild(children, body.child);
    const result = await addLibraryVideo({ profile: child, videoId: body.video ?? body.videoId ?? body.url, topicId: body.topicId, tags: body.tags }, familyId);
    console.info(JSON.stringify({ event: `agent_library_${result.status}`, family: familyId, videoId: result.video.id }));
    return Response.json({ status: result.status, video: { id: result.video.id, title: result.video.title, topicId: result.video.topicId } }, { status: result.status === "added" ? 201 : 200, headers: agentHeaders });
  } catch (error) { return agentFailure(error); }
}

export async function DELETE(request: Request) {
  try {
    const { familyId, children } = await agentContext(request);
    const body = await readAgentBody(request);
    const child = requireChild(children, body.child);
    const videoId = videoIdFrom(body.video ?? body.videoId ?? body.url);
    const outcome = await removeVideoFromChild(videoId, child);
    if (outcome === "shared") throw new LibraryError("shared_video", "Это общий мультик из приложения, его нельзя убрать у одного ребёнка.", 409);
    if (outcome === "missing" || outcome === "not_member") throw new LibraryError("not_found", "У этого ребёнка нет такого мультика.", 404);
    console.info(JSON.stringify({ event: "agent_library_removed", family: familyId, videoId }));
    return Response.json({ status: "removed", videoId }, { headers: agentHeaders });
  } catch (error) { return agentFailure(error); }
}
