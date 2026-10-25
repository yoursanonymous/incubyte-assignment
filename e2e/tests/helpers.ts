import { resolve } from 'node:path';
import type { Page } from '@playwright/test';

export const SHOTS = resolve(import.meta.dirname, '../../docs/screenshots');
export const shot = (page: Page, name: string, fullPage = false) =>
  page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });
export const uniqueEmail = (prefix: string) => `${prefix}+${Date.now()}@e2e.test`;
export const card = (page: Page, name: string) => page.getByRole('article', { name });

export async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}
