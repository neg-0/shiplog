import { test, expect } from '@playwright/test';

test.describe('Public Changelog Page', () => {
  test('should render the changelog page', async ({ page }) => {
    await page.goto('/changelog');
    await expect(page).toHaveTitle(/Changelog/);
  });

  test('should display the changelog heading', async ({ page }) => {
    await page.goto('/changelog');
    await expect(page.getByRole('heading', { name: 'Changelog' })).toBeVisible();
  });

  test('should display the changelog description', async ({ page }) => {
    await page.goto('/changelog');
    await expect(page.getByText(/What's new in ShipLog/)).toBeVisible();
  });

  test('should display release versions', async ({ page }) => {
    await page.goto('/changelog');
    await expect(page.getByText('v1.1.0')).toBeVisible();
    await expect(page.getByText('v1.0.0')).toBeVisible();
  });

  test('should display change types with labels', async ({ page }) => {
    await page.goto('/changelog');
    // Check that feature and improvement labels appear
    const featureLabels = page.getByText('feature', { exact: true });
    expect(await featureLabels.count()).toBeGreaterThan(0);
  });

  test('should display specific changelog entries', async ({ page }) => {
    await page.goto('/changelog');
    await expect(page.getByText('AI-powered release notes generation')).toBeVisible();
    await expect(page.getByText('GitHub integration with webhook support')).toBeVisible();
  });
});
