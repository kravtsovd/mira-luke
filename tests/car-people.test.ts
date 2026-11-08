import { expect, it } from "vitest";
import { CAR_PEOPLE_CHOICES, CAR_PEOPLE_COUNTS, CAR_PEOPLE_ROUNDS, createCarPeopleOrder } from "../app/lib/car-people";
import { LUKE_TASKS_PER_GAME } from "../app/lib/luke-tasks";

it("plays two different counts per game, in a pair and order that change between games", () => {
  expect(CAR_PEOPLE_ROUNDS).toBe(LUKE_TASKS_PER_GAME);
  expect(CAR_PEOPLE_ROUNDS).toBe(2);
  const seen = new Set<string>();
  let seed = 7;
  const random = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
  for (let game = 0; game < 200; game++) {
    const order = createCarPeopleOrder(random);
    expect(order).toHaveLength(CAR_PEOPLE_ROUNDS);
    expect(new Set(order).size).toBe(CAR_PEOPLE_ROUNDS);
    for (const count of order) expect(CAR_PEOPLE_COUNTS).toContain(count);
    seen.add(order.join(""));
  }
  // Every ordered pair of two distinct counts out of three.
  expect(seen.size).toBe(6);
  expect(createCarPeopleOrder(() => 0.99)).toEqual([1, 2]);
  expect(createCarPeopleOrder(() => 0)).toEqual([2, 3]);
});

it("always offers the right number of cars among the choices", () => {
  for (const [people, choices] of Object.entries(CAR_PEOPLE_CHOICES)) {
    expect(choices).toContain(Number(people));
    expect(new Set(choices).size).toBe(choices.length);
  }
});
