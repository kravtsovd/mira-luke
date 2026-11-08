import { GameType } from "./settings";

export const GAME_LABELS: Record<GameType, { title: string; description: string }> = {
  "car-voices": { title: "Найди машинку", description: "Слушаем название и выбираем из двух машин" },
  "car-workshop": { title: "Автомастерская", description: "Помогаем машинке: находим колесо, дверь и фару" },
  "car-hide": { title: "Где машинка?", description: "Смотрим, запоминаем и открываем гараж" },
  "animal-voices": { title: "Кто как говорит?", description: "Слышим «му-у» и находим корову: четыре животных, два задания" },
  "big-small": { title: "Большая и маленькая", description: "Яблоко, мишка, автобус и другие предметы: находим большой или маленький" },
  "same-car": { title: "Найди такую же картинку", description: "Предметы, животные и машины: выбираем картинку как у образца" },
  "car-puzzle": { title: "Собери машинку", description: "Собираем автобус, грузовик или другую машину из двух крупных половинок" },
  "english-find": { title: "Find it! Английский на слух", description: "Слышим английское слово и находим его на ферме. Четыре уровня, пять звёзд на каждый" },
  "mira-addition": { title: "Складываем героев", description: "Прибавляем 1, затем 1 или 2, затем от 1 до 4" },
  "huntrix-letters": { title: "Собери имя из букв", description: "Нажимай буквы имени по порядку" },
  huntrix: { title: "Собери имя из слогов", description: "Ставим слоги по порядку: люди и зверята" },
  cars: { title: "Машинки и гаражи", description: "Две машинки, три гаража по цветам. Только для Luke" },
  "luke-count": { title: "Люки и машинки", description: "Две группы Люков, две группы машинок: сажаем каждого в свою" },
  "car-people": { title: "Найди столько же машинок", description: "Два раунда: сравниваем группы от одного до трёх предметов" },
  letters: { title: "Буквы", description: "Узнать и услышать букву" },
  counting: { title: "Счёт", description: "Посчитать от 2 до 6" },
  colors: { title: "Цвета", description: "Найти названный цвет" },
  words: { title: "Картинка и слово", description: "Соединить картинку со словом" },
  syllables: { title: "Слоги", description: "Собрать простое слово" },
};
