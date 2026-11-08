export const BUILD_NAME_PROMPT = "Собери имя по слогам";
export const SYLLABLES_GAME = "huntrix-syllables";

export const NAME_CARDS = [
  { id: "rumi", category: "kpop", name: "Руми", description: "Лисёнок Руми", image: "/games/huntrix/rumi-portrait.svg", syllables: ["РУ", "МИ"] },
  { id: "mira", category: "kpop", name: "Мира", description: "Зайка Мира", image: "/games/huntrix/mira-portrait.svg", syllables: ["МИ", "РА"] },
  { id: "zoey", category: "kpop", name: "Зои", description: "Мишка Зои", image: "/games/huntrix/zoey-portrait.svg", syllables: ["ЗО", "И"] },
  { id: "mama", category: "family", name: "Мама", description: "Мама", image: "/games/huntrix/family/mama-v2.svg", syllables: ["МА", "МА"] },
  { id: "papa", category: "family", name: "Папа", description: "Папа", image: "/games/huntrix/family/papa-v2.svg", syllables: ["ПА", "ПА"] },
  { id: "luke", category: "family", name: "Люк", description: "Люк", image: "/games/huntrix/family/luke-v2.svg", syllables: ["ЛЮ", "К"] },
  { id: "leo", category: "cartoon", name: "Лео", description: "Лев Лео", image: "/games/huntrix/cartoon/leo.svg", syllables: ["ЛЕ", "О"] },
] as const;
export type NameCard = (typeof NAME_CARDS)[number];
export type NameId = NameCard["id"];
export const ROUND_SIZE = 3;

const DISTRACTORS: Record<NameId, readonly [string, string]> = {
  rumi: ["РА", "МА"],
  mira: ["РУ", "МА"],
  zoey: ["ЛЕ", "О"],
  mama: ["МИ", "ПА"],
  papa: ["МА", "РА"],
  luke: ["ЛЕ", "О"],
  leo: ["ЛЮ", "К"],
};
export const NAME_GAME_ANALYTICS = { game_variant: "build-name-v3-reset", launch_date: "2026-10-05" };

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function nameTiles(card: NameCard, random = Math.random): string[] {
  return shuffled([...card.syllables, ...DISTRACTORS[card.id]], random);
}
