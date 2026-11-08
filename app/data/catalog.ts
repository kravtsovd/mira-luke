import researchVideos from "./research-videos.json";
import { ProfileId } from "../lib/profiles";

export type TopicId = "stories" | "learning" | "vehicles" | "songs" | "adventures";

export type TopicTone = "berry" | "sun" | "sky" | "mint" | "violet";

export interface CartoonTopic {
  id: TopicId;
  title: string;
  shortTitle: string;
  description: string;
  icon: "heart" | "sparkles" | "truck" | "music" | "rocket";
  tone: TopicTone;
}

export interface CartoonVideo {
  id: string;
  playbackId?: string;
  title: string;
  channel: string;
  language: "ru" | "en" | "unknown";
  topicId: TopicId;
  durationLabel?: string;
  sourceUrl?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  publishedAt?: string;
  addedAt?: string;
  tags?: string[];
  searchTerms?: string[];
  source?: "youtube-search";
  // Empty or missing means both children see it. A named list keeps a pick on one child's shelf.
  profiles?: ProfileId[];
}

export const TOPICS: CartoonTopic[] = [
  {
    id: "stories",
    title: "Любимые истории",
    shortTitle: "Истории",
    description: "My Little Pony, Peppa Pig, русские мультики и сказки",
    icon: "heart",
    tone: "berry",
  },
  {
    id: "learning",
    title: "Учимся и узнаём",
    shortTitle: "Учимся",
    description: "Буквы, числа, природа, животные и развивающие игры",
    icon: "sparkles",
    tone: "sun",
  },
  {
    id: "vehicles",
    title: "Машинки и техника",
    shortTitle: "Машинки",
    description: "Поезда, тракторы, грузовики и строительные машины",
    icon: "truck",
    tone: "sky",
  },
  {
    id: "songs",
    title: "Песенки и танцы",
    shortTitle: "Песенки",
    description: "Frozen, My Little Pony, музыка, танцы и любимые песни",
    icon: "music",
    tone: "mint",
  },
  {
    id: "adventures",
    title: "Приключения и спасатели",
    shortTitle: "Приключения",
    description: "Spidey, Черепашки-ниндзя, спасатели и супергерои",
    icon: "rocket",
    tone: "violet",
  },
];

// Stable fallback used if the database cannot be reached. Research additions live in
// a separate JSON file so they can also be reviewed and re-seeded independently.
const CORE_VIDEOS: CartoonVideo[] = [
  {
    "id": "eUs3h7-jKIk",
    "title": "Caillou and the School Test",
    "channel": "Caillou - WildBrain",
    "language": "en",
    "topicId": "stories"
  },
  {
    "id": "Jg9jztRqyTQ",
    "title": "Peppa Pig - Muddy Puddles",
    "channel": "Peppa Pig and Friends",
    "language": "en",
    "topicId": "stories"
  },
  {
    "id": "xy589Tyo3Go",
    "title": "Peppa Pig - Muddy Puddle Adventures",
    "channel": "Peppa Pig - Official Channel",
    "language": "en",
    "topicId": "stories"
  },
  {
    "id": "EJkn-r-rJJY",
    "title": "Bluey - Keepy Uppy and Friends",
    "channel": "Disney Jr.",
    "language": "en",
    "topicId": "stories"
  },
  {
    "id": "9qShcQMq1cA",
    "title": "Peppa Pig - The Longest Water Slide Ever",
    "channel": "Peppa Pig - Official Channel",
    "language": "en",
    "topicId": "stories",
    "searchTerms": ["пеппа", "свинка пеппа", "водная горка"]
  },
  {
    "id": "IOtFxP2JJqI",
    "title": "Bluey - Three Full Episodes",
    "channel": "Disney Jr.",
    "language": "en",
    "topicId": "stories",
    "searchTerms": ["блуи", "семья", "истории"]
  },
  {
    "id": "ZGO2It1eQF8",
    "title": "Caillou the Policeman",
    "channel": "Caillou - WildBrain",
    "language": "en",
    "topicId": "stories",
    "searchTerms": ["кайю", "полицейский", "истории"]
  },
  {
    "id": "_pWhx7l_48g",
    "title": "Blippi - Sink or Float",
    "channel": "Blippi - Educational Videos for Kids",
    "language": "en",
    "topicId": "learning"
  },
  {
    "id": "Hs0fNvQ0qaQ",
    "title": "Elmo's World - Back to School",
    "channel": "Sesame Street",
    "language": "en",
    "topicId": "learning"
  },
  {
    "id": "VHwlKl5SsHc",
    "title": "DJ Count - Count to 100",
    "channel": "Jack Hartmann Kids Music Channel",
    "language": "en",
    "topicId": "learning"
  },
  {
    "id": "vDXdg7Mmt_U",
    "title": "Counting Is Fun with Elmo",
    "channel": "Sesame Street",
    "language": "en",
    "topicId": "learning",
    "searchTerms": ["элмо", "счет", "цифры"]
  },
  {
    "id": "G_jUWIonMcU",
    "title": "Sesame Street - All About the Letter A",
    "channel": "Sesame Street",
    "language": "en",
    "topicId": "learning",
    "searchTerms": ["улица сезам", "буква а", "алфавит"]
  },
  {
    "id": "Z00u4mu5Iz4",
    "title": "Blippi Learns Science at the Children's Museum",
    "channel": "Blippi - Educational Videos for Kids",
    "language": "en",
    "topicId": "learning",
    "searchTerms": ["блиппи", "наука", "музей", "эксперименты"]
  },
  {
    "id": "7XseVrmpkUU",
    "title": "Blippi Learns the Solar System",
    "channel": "Blippi - Educational Videos for Kids",
    "language": "en",
    "topicId": "learning",
    "searchTerms": ["блиппи", "космос", "планеты", "солнечная система"]
  },
  {
    "id": "V3wzuwVWeoE",
    "title": "Leo the Truck - Planes and Boats",
    "channel": "KidsFirstTV",
    "language": "en",
    "topicId": "vehicles",
    "searchTerms": ["лео", "грузовичок", "самолет", "лодка"]
  },
  {
    "id": "qlmAp8kYJyY",
    "title": "Leo the Truck - Tow Truck and Bulldozer",
    "channel": "KidsFirstTV",
    "language": "en",
    "topicId": "vehicles",
    "searchTerms": ["лео", "грузовичок", "эвакуатор", "бульдозер"]
  },
  {
    "id": "XkcB93Tm-EY",
    "title": "Big Trucks in the Sand",
    "channel": "KidsFirstTV",
    "language": "en",
    "topicId": "vehicles",
    "durationLabel": "23:16",
    "searchTerms": ["машинки", "грузовики", "песок", "стройка"]
  },
  {
    "id": "I7YyvO95wSQ",
    "title": "Helper Cars - Cars and Trucks",
    "channel": "KidsFirstTV",
    "language": "en",
    "topicId": "vehicles",
    "durationLabel": "18:21",
    "searchTerms": ["машинки помощники", "грузовики", "спецтехника"]
  },
  {
    "id": "a-dv3HUjU74",
    "title": "Gecko's Garage - Excavator Rescue and Repair",
    "channel": "Gecko's Garage",
    "language": "en",
    "topicId": "vehicles",
    "durationLabel": "1:00:58",
    "searchTerms": ["гекко", "экскаватор", "ремонт", "спасатели"]
  },
  {
    "id": "630bt_YUrNU",
    "title": "Dirty Diggers and Dump Trucks Car Wash",
    "channel": "Gecko's Garage",
    "language": "en",
    "topicId": "vehicles",
    "durationLabel": "24:41",
    "searchTerms": ["гекко", "самосвал", "автомойка", "стройка"]
  },
  {
    "id": "8ZIC3KuTd-E",
    "title": "Formula E Racing Cars for Children",
    "channel": "Toddler Fun Learning",
    "language": "en",
    "topicId": "vehicles",
    "durationLabel": "10:06",
    "searchTerms": ["гонки", "гоночные машины", "формула", "электромобиль"]
  },
  {
    "id": "E2mQhr5V2xE",
    "title": "Blippi Learns About Diggers",
    "channel": "Blippi - Educational Videos for Kids",
    "language": "en",
    "topicId": "vehicles",
    "durationLabel": "58:02",
    "searchTerms": ["блиппи", "экскаватор", "стройка", "техника"],
    "profiles": []
  },
  {
    "id": "AwQjZA-zKU0",
    "title": "Blippi Learns Construction Vehicles",
    "channel": "Blippi - Educational Videos for Kids",
    "language": "en",
    "topicId": "vehicles",
    "durationLabel": "14:37",
    "searchTerms": ["блиппи", "строительные машины", "экскаватор", "техника"]
  },
  {
    "id": "H-6AX5GbAYo",
    "title": "Thomas and the Emergency Cable",
    "channel": "Thomas & Friends",
    "language": "en",
    "topicId": "vehicles",
    "durationLabel": "10:56",
    "searchTerms": ["томас", "паровоз", "поезд", "железная дорога"]
  },
  {
    "id": "LrAtBtQnvCE",
    "title": "Five Little Ducks and More",
    "channel": "Super Simple Songs - Kids Songs",
    "language": "en",
    "topicId": "songs"
  },
  {
    "id": "VkL0PQ3WYs0",
    "title": "Baby Shark Dance",
    "channel": "Baby Shark - Pinkfong Kids’ Songs & Stories",
    "language": "en",
    "topicId": "songs"
  },
  {
    "id": "wk4KHNJjpjQ",
    "title": "Twinkle Twinkle Little Star and More",
    "channel": "Super Simple Songs - Kids Songs",
    "language": "en",
    "topicId": "songs"
  },
  {
    "id": "frN3nvhIHUk",
    "title": "Do You Like Broccoli Ice Cream?",
    "channel": "Super Simple Songs - Kids Songs",
    "language": "en",
    "topicId": "songs"
  },
  {
    "id": "-Z95SxV8PZc",
    "title": "Rain Rain Go Away and More",
    "channel": "ChuChu TV Nursery Rhymes & Kids Songs",
    "language": "en",
    "topicId": "songs"
  },
  {
    "id": "XhpGp9d9jSA",
    "title": "Badanamu - Super Hits",
    "channel": "Badanamu",
    "language": "en",
    "topicId": "songs"
  },
  {
    "id": "8deypue7SdQ",
    "title": "Ball Pit Party",
    "channel": "Bounce Patrol - Kids Songs",
    "language": "en",
    "topicId": "songs"
  },
  {
    "id": "1XPgV_Z71M0",
    "title": "Sofia the First - We Have to Be Friends",
    "channel": "Disney Jr.",
    "language": "en",
    "topicId": "songs",
    "durationLabel": "1:52"
  },
  {
    "id": "NI1Itabkzqc",
    "title": "Gabby's Dollhouse - Cat of the Day",
    "channel": "Netflix Jr.",
    "language": "en",
    "topicId": "songs",
    "durationLabel": "13:19"
  },
  {
    "id": "Zkd88Aa94ac",
    "title": "Sing and Sing 2 - Pop Songs",
    "channel": "Mini Moments",
    "language": "en",
    "topicId": "songs",
    "durationLabel": "14:56"
  },
  {
    "id": "fT-ciS7dk-U",
    "title": "PAW Patrol - Rocky's Runaway Box Fort",
    "channel": "PAW Patrol Official & Friends",
    "language": "en",
    "topicId": "adventures"
  },
  {
    "id": "bdNbUw5FIQo",
    "title": "Baby Shark and 99 Friends",
    "channel": "Baby Shark Official",
    "language": "en",
    "topicId": "adventures"
  },
  {
    "id": "RIWRqjcbJcs",
    "title": "Morphle - Colors",
    "channel": "Morphle’s Magic Universe - Kids Cartoon",
    "language": "en",
    "topicId": "adventures"
  },
  {
    "id": "DoULakpoynA",
    "title": "Talking Tom and Friends - Unusual Events",
    "channel": "Talking Tom & Friends TV",
    "language": "en",
    "topicId": "adventures"
  },
  {
    "id": "hc4hH7JMV_g",
    "title": "PAW Patrol - Pups and the Pirate Treasure",
    "channel": "PAW Patrol Official & Friends",
    "language": "en",
    "topicId": "adventures",
    "searchTerms": ["щенячий патруль", "пираты", "сокровища", "спасатели"]
  },
  {
    "id": "z1vXJVI2L5M",
    "title": "PAW Patrol - Pups Save the Penguins",
    "channel": "Nick Jr.",
    "language": "en",
    "topicId": "adventures",
    "searchTerms": ["щенячий патруль", "пингвины", "спасатели"]
  },
  {
    "id": "ZAlYpNfFcx0",
    "title": "SuperKitties - The Great Yarn Caper",
    "channel": "Disney Jr.",
    "language": "en",
    "topicId": "adventures",
    "searchTerms": ["суперкотята", "котята", "приключения"]
  }
];

export const VIDEOS: CartoonVideo[] = [
  ...CORE_VIDEOS,
  ...(researchVideos as CartoonVideo[]),
];

export const getTopic = (topicId: string | null): CartoonTopic | undefined =>
  TOPICS.find((topic) => topic.id === topicId);

export const isTopicId = (value: string | null): value is TopicId =>
  TOPICS.some((topic) => topic.id === value);

export const getVideosForTopic = (topicId: TopicId, videos: CartoonVideo[] = VIDEOS): CartoonVideo[] =>
  videos.filter((video) => video.topicId === topicId);

export const getVideo = (videoId: string | null, videos: CartoonVideo[] = VIDEOS): CartoonVideo | undefined =>
  videos.find((video) => video.id === videoId);

// Shared picks stay on both shelves; a video listing profiles belongs only to those children.
export const getVideosForProfile = (profile: ProfileId, videos: CartoonVideo[] = VIDEOS): CartoonVideo[] =>
  videos.filter((video) => !video.profiles?.length || video.profiles.includes(profile)).sort((a, b) => {
    const personalA = a.profiles?.length === 1;
    const personalB = b.profiles?.length === 1;
    if (personalA !== personalB) return personalA ? -1 : 1;
    if (!personalA) return 0;
    return (Date.parse(b.addedAt ?? "") || 0) - (Date.parse(a.addedAt ?? "") || 0);
  });

export const getPlaybackId = (video: CartoonVideo): string =>
  video.playbackId ?? video.id;

export const isValidYouTubeId = (value: string | null): value is string =>
  Boolean(value && /^[A-Za-z0-9_-]{11}$/.test(value));

export const getThumbnailUrl = (videoId: string): string =>
  `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
