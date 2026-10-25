import { expect, test } from '@playwright/test';
import { card, shot, signIn, uniqueEmail } from './helpers';

test('customer: register, browse, search, buy, see the order, stay signed in, sign out', async ({
  page,
}) => {
  const email = uniqueEmail('customer');
  const password = 'Customer-Pass-12345';

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await shot(page, '01-sign-in');

  await page.getByRole('link', { name: 'Create an account' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();

  await expect(card(page, 'Honda Civic')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Manage' })).toHaveCount(0);
  await shot(page, '02-inventory');

  await expect(card(page, 'Ford F-150').getByRole('button', { name: /sold out/i })).toBeDisabled();

  await page.getByLabel('Make').fill('honda');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(card(page, 'Honda Civic')).toBeVisible();
  await expect(card(page, 'Toyota Corolla')).toHaveCount(0);
  await expect(page).toHaveURL(/make=honda/);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByLabel('Min price ($)').fill('30000');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(card(page, 'Subaru Outback')).toBeVisible();
  await expect(card(page, 'Toyota Corolla')).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear filters' }).click();

  await card(page, 'Honda Civic')
    .getByRole('button', { name: /Purchase/ })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Confirm purchase' });
  await dialog.getByRole('button', { name: 'Increase quantity' }).click();
  await expect(dialog.getByTestId('total')).toHaveText('$48,980.00');
  await shot(page, '03-purchase-dialog');
  await dialog.getByRole('button', { name: 'Buy now' }).click();
  await expect(page.getByText(/Purchased 2 × Honda Civic for \$48,980.00/)).toBeVisible();
  await expect(card(page, 'Honda Civic').getByRole('img', { name: '3 in stock' })).toBeVisible();

  await card(page, 'Mazda MX-5 Miata')
    .getByRole('button', { name: /Purchase/ })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Buy now' }).click();
  await expect(
    card(page, 'Mazda MX-5 Miata').getByRole('button', { name: /sold out/i }),
  ).toBeDisabled();

  await card(page, 'Subaru Outback').getByRole('link', { name: 'Details' }).click();
  await expect(page.getByRole('heading', { name: 'Outback' })).toBeVisible();
  await shot(page, '04-vehicle-detail');

  await page.getByRole('link', { name: 'My orders' }).click();
  await expect(
    page.getByRole('row', { name: /Honda Civic.*2.*\$24,490.00.*\$48,980.00/ }),
  ).toBeVisible();
  await expect(page.getByRole('row', { name: /Mazda MX-5 Miata/ })).toBeVisible();
  await shot(page, '05-my-orders');

  // The session survives a full reload (HttpOnly refresh cookie -> new in-memory access token).
  await page.reload();
  await expect(page.getByRole('heading', { name: 'My orders' })).toBeVisible();
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(storage).not.toMatch(/eyJ/); // no JWT in web storage

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.goto('/orders');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await signIn(page, email, password);
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
});

test('customer on a phone: layout is usable and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'admin@e2e.test', 'E2e-Admin-Password-1');
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await shot(page, '06-inventory-mobile');
});
