import { CartoonVideo, getTopic } from "../data/catalog";

const normalize = (value: string): string =>
  value.normalize("NFKD").toLocaleLowerCase("ru-RU").replace(/\s+/g, " ").trim();

export function filterCatalog(videos: CartoonVideo[], query: string): CartoonVideo[] {
  const terms = normalize(query).split(" ").filter(Boolean);
  if (terms.length === 0) return videos;

  return videos.map((video, index) => {
    const topic = getTopic(video.topicId);
    const directIndex = normalize([
      video.title,
      video.channel,
      ...(video.tags ?? []),
      ...(video.searchTerms ?? []),
    ].join(" "));
    const topicIndex = normalize([
      topic?.title ?? "",
      topic?.shortTitle ?? "",
    ].join(" "));
    const directMatch = terms.every((term) => directIndex.includes(term));
    const broadMatch = terms.every((term) => `${directIndex} ${topicIndex}`.includes(term));
    return { video, index, score: directMatch ? 2 : broadMatch ? 1 : 0 };
  }).filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((result) => result.video);
}
