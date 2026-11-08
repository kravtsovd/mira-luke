import { handleYoutubeCallback } from "../../../lib/youtube-callback";

export const runtime = "nodejs";
export const maxDuration = 60;

export const GET = (request: Request) => handleYoutubeCallback(request, "/api/youtube/callback");
