import { VEHICLES } from "./toddler-cars";
import matchingSpeech from "../data/luke-matching-speech.json";

export interface LukePicture {
  id: string;
  name: string;
  image: string;
  big: string;
  small: string;
}

// a parent's selected everyday objects. Both sizes use the very same image.
export const OBJECTS: LukePicture[] = [
  { id: "apple", name: "Яблоко", image: "/images/luke-objects/apple.svg", big: "Найди большое яблоко", small: "Найди маленькое яблоко" },
  { id: "banana", name: "Банан", image: "/images/luke-objects/banana.svg", big: "Найди большой банан", small: "Найди маленький банан" },
  { id: "ball", name: "Мяч", image: "/images/luke-objects/ball.svg", big: "Найди большой мяч", small: "Найди маленький мяч" },
  { id: "teddy", name: "Мишка", image: "/images/luke-objects/teddy.svg", big: "Найди большого мишку", small: "Найди маленького мишку" },
  { id: "cup", name: "Чашка", image: "/images/luke-objects/cup.svg", big: "Найди большую чашку", small: "Найди маленькую чашку" },
  { id: "chair", name: "Стул", image: "/images/luke-objects/chair.svg", big: "Найди большой стул", small: "Найди маленький стул" },
  { id: "tree", name: "Дерево", image: "/images/luke-objects/tree.svg", big: "Найди большое дерево", small: "Найди маленькое дерево" },
  { id: "flower", name: "Цветок", image: "/images/luke-objects/flower.svg", big: "Найди большой цветок", small: "Найди маленький цветок" },
];
const vehicleWords = {
  fire: ["большую пожарную машину", "маленькую пожарную машину"],
  bus: ["большой автобус", "маленький автобус"],
  truck: ["большой грузовик", "маленький грузовик"],
  digger: ["большой экскаватор", "маленький экскаватор"],
};
export const VEHICLE_PICTURES: LukePicture[] = VEHICLES.map(vehicle => ({
  id: vehicle.id, name: vehicle.name, image: `/images/luke-cars/${vehicle.id}.svg`,
  big: `Найди ${vehicleWords[vehicle.id][0]}`, small: `Найди ${vehicleWords[vehicle.id][1]}`,
}));
export const SIZE_PICTURES = [...OBJECTS, ...VEHICLE_PICTURES];
const animals = [
  ["cow", "Корова"], ["dog", "Собака"], ["cat", "Кошка"], ["duck", "Утка"],
] as const;
export type MatchPicture = Pick<LukePicture, "id" | "name" | "image"> & { praise: string; hint: string };
export const MATCH_PICTURES: MatchPicture[] = [...SIZE_PICTURES,
  ...animals.map(([id, name]) => ({ id, name, image: `/images/english-farm/${id}.svg` })),
].map(item => ({ ...item, ...matchingSpeech[item.id as keyof typeof matchingSpeech] }));
