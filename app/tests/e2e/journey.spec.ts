import { test, expect } from './_setup';

test.describe('User Journey', () => {
  test('Dashboard → Reports → Analytics → Settings', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    await expect(page.getByTestId('kpi-total-users')).toBeVisible();

    await page.getByRole('link', { name: 'Reports' }).first().click();
    await expect(page.getByTestId('reports-page')).toBeVisible();
    await expect(page.getByTestId('reports-table')).toBeVisible();

    await page.getByRole('link', { name: 'Analytics' }).first().click();
    await expect(page.getByTestId('analytics-page')).toBeVisible();

    await page.getByRole('link', { name: 'Settings' }).first().click();
    await expect(page.getByTestId('settings-page')).toBeVisible();
  });
});
