import { expect, test } from '@playwright/test';
import { card, shot, signIn } from './helpers';

test('admin: add, edit, restock and delete a vehicle', async ({ page }) => {
  await signIn(page, 'admin@e2e.test', 'E2e-Admin-Password-1');
  await page.getByRole('link', { name: 'Manage' }).click();
  await expect(page.getByRole('heading', { name: 'Manage inventory' })).toBeVisible();

  await page.getByRole('button', { name: 'Add vehicle' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add vehicle' });
  await dialog.getByRole('button', { name: 'Add vehicle' }).click();
  await expect(dialog.getByText('Enter the make.')).toBeVisible();
  await dialog.getByLabel('Make').fill('Tesla');
  await dialog.getByLabel('Model').fill('Model Y');
  await dialog.getByLabel('Category').selectOption('SUV');
  await dialog.getByLabel('Price ($)').fill('48990');
  await dialog.getByLabel('Initial stock').fill('2');
  await shot(page, '07-admin-add-vehicle');
  await dialog.getByRole('button', { name: 'Add vehicle' }).click();
  const row = page.getByRole('row', { name: /Tesla Model Y/ });
  await expect(row).toBeVisible();
  await shot(page, '08-admin-table');

  await page.getByRole('button', { name: 'Edit Tesla Model Y' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit vehicle' });
  await edit.getByLabel('Price ($)').fill('45990.50');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('row', { name: /Tesla Model Y.*\$45,990.50/ })).toBeVisible();

  await page.getByRole('button', { name: 'Restock Tesla Model Y' }).click();
  const restock = page.getByRole('dialog', { name: 'Restock' });
  await restock.getByLabel('Units to add').fill('3');
  await restock.getByRole('button', { name: 'Add stock' }).click();
  await expect(page.getByRole('row', { name: /Tesla Model Y.*5/ })).toBeVisible();

  await page.getByRole('tab', { name: 'sales' }).click();
  await expect(page.getByRole('tabpanel')).toBeVisible();
  await page.getByRole('tab', { name: 'vehicles' }).click();

  await page.getByRole('button', { name: 'Delete Tesla Model Y' }).click();
  await page
    .getByRole('dialog', { name: 'Delete vehicle?' })
    .getByRole('button', { name: 'Delete vehicle' })
    .click();
  await expect(page.getByRole('row', { name: /Tesla Model Y/ })).toHaveCount(0);
  await page.getByRole('link', { name: 'Inventory' }).click();
  await expect(card(page, 'Honda Civic').or(card(page, 'Toyota Corolla')).first()).toBeVisible();
  await expect(card(page, 'Tesla Model Y')).toHaveCount(0);
});

test('API enforcement: a customer token is refused by admin endpoints even when called directly', async ({
  page,
  request,
}) => {
  const email = `direct+${Date.now()}@e2e.test`;
  const reg = await request.post('/api/auth/register', {
    data: { email, password: 'Direct-Pass-12345' },
  });
  expect(reg.status()).toBe(201);
  const { accessToken } = await reg.json();
  const headers = { Authorization: `Bearer ${accessToken}` };

  const create = await request.post('/api/vehicles', {
    headers,
    data: { make: 'X', model: 'Y', category: 'SUV', price: '1.00' },
  });
  expect(create.status()).toBe(403);
  const escalate = await request.post('/api/auth/register', {
    data: { email: `esc+${Date.now()}@e2e.test`, password: 'Direct-Pass-12345', role: 'ADMIN' },
  });
  expect(escalate.status()).toBe(400);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});
