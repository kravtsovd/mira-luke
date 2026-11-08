import { expect, test } from '@playwright/test';
import { NAME_CARDS } from '../../app/lib/huntrix';

for (const game of ['mira-addition', 'huntrix-letters']) {
 test(`${game} works without a family session and restores device progress`, async ({ page }) => {
  let posts = 0;
  await page.route('**/api/mira-learning', route => {
   if (route.request().method() === 'POST') posts++;
   return route.fulfill({ status: 403, json: { error: 'Недоступно' } });
  });
  await page.goto(`/games/${game}`);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Прогресс сохраняется на этом устройстве.')).toBeVisible();
  if (game === 'mira-addition') {
   const equation = await page.locator('.mira-sum').getAttribute('aria-label');
   const [a, b] = equation!.match(/\d+/g)!.map(Number);
   await page.locator('.mira-number-choices button').filter({ hasNot: page.locator(`[data-quantity="${a + b}"]`) }).first().click();
  } else {
   const alt = await page.locator('.mira-word-portrait').getAttribute('alt');
   const card = NAME_CARDS.find(card => card.description === alt)!;
   const wrong = [...card.name.toUpperCase()].find(letter => letter !== card.name[0].toUpperCase())!;
   await page.locator('.mira-number-choices button').filter({ hasText: new RegExp(`^${wrong}$`) }).first().click();
  }
  await expect(dialog.getByText('Неправильно. Попробуй ещё раз.')).toBeVisible();
  await expect(page.locator('#game-voice-audio')).toHaveAttribute('data-voice-path', '/audio/ru-jessica-v1/mira-learning/incorrect.mp3');
  await expect(dialog.getByText('Без ошибки подряд: 0 из 3')).toBeVisible();
  for (let i = 0; i < 3; i++) {
   await expect(dialog.getByRole('button').first()).toBeEnabled();
   if (game === 'mira-addition') {
    const equation = await page.locator('.mira-sum').getAttribute('aria-label');
    const [a, b] = equation!.match(/\d+/g)!.map(Number);
    await page.locator('.mira-number-choices button').filter({ has: page.locator(`[data-quantity="${a + b}"]`) }).click();
   } else {
    const alt = await page.locator('.mira-word-portrait').getAttribute('alt');
    const card = NAME_CARDS.find(card => card.description === alt)!;
    for (const letter of card.name.toUpperCase()) {
     await page.locator('.mira-number-choices button:enabled').filter({ hasText: new RegExp(`^${letter}$`) }).first().click();
    }
   }
   if (i < 2) await expect(dialog.getByText(`Без ошибки подряд: ${i + 1} из 3`)).toBeVisible();
  }
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: 'Продолжить смотреть' })).toHaveCount(0);
  expect(posts).toBe(0);
  await page.goto(`/games/${game}`);
  await expect(dialog.getByText(game === 'mira-addition' ? 'Сложение · шаг 2 из 3' : 'Три имени подряд без ошибки - цель упражнения.')).toBeVisible();
  await expect(dialog.getByText('Без ошибки подряд: 0 из 3')).toBeVisible();
 });
}
