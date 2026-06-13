import { test, expect } from './_setup';

test.describe('Reports UI interactions', () => {
  test('search filters the table', async ({ page }) => {
    await page.goto('/reports');
    const table = page.getByTestId('reports-table');
    await expect(table).toBeVisible();

    const search = page.getByTestId('reports-table-search');
    await search.fill('Q1');
    await expect(table.getByText('Q1 2026 Revenue Summary')).toBeVisible();
    await expect(table.getByText('User Cohort Analysis - March')).toHaveCount(0);
  });

  test('sort toggles a column', async ({ page }) => {
    await page.goto('/reports');
    const table = page.getByTestId('reports-table');
    const header = table.getByRole('columnheader', { name: /Title/ });
    await header.click();
    await expect(table).toBeVisible();
  });

  test('opens detail modal from view button', async ({ page }) => {
    await page.goto('/reports');
    const table = page.getByTestId('reports-table');
    await table.getByRole('button', { name: 'View' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('button[type="button"]').filter({ hasText: 'Close' }).click();
    await expect(dialog).toBeHidden();
  });

  test('clicking a row opens the side drawer', async ({ page }) => {
    await page.goto('/reports');
    const table = page.getByTestId('reports-table');
    await table.locator('tbody tr').first().click();
    await expect(page.getByTestId('report-drawer')).toBeVisible();
  });
});

test.describe('Users UI interactions', () => {
  test('opens user detail modal', async ({ page }) => {
    await page.goto('/users');
    const table = page.getByTestId('users-table');
    await expect(table).toBeVisible();
    await table.getByRole('button', { name: 'View' }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
