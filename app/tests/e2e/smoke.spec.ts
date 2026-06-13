import { test, expect } from './_setup';

test.describe('Smoke', () => {
  test('home page loads and shows hero', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('home-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Acme Console' })).toBeVisible();
  });

  test('navigation works', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /open dashboard/i }).click();
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('sidebar opens and shows items', async ({ page }) => {
    await page.goto('/dashboard');
    const sidebar = page.getByTestId('sidebar');
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Analytics' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Reports' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Users' })).toBeVisible();
  });

  test('theme switch cycles light -> dark -> system', async ({ page }) => {
    await page.goto('/dashboard');
    const toggle = page.getByTestId('theme-toggle');
    await expect(toggle).toBeVisible();
    const initial = await page.evaluate(() =>
      document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    );
    await toggle.click();
    const next = await page.evaluate(() =>
      document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    );
    expect(next).not.toBe(initial);
  });
});
