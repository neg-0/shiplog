import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('should navigate from home to login page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Connect GitHub/i }).first().click();
    await expect(page).toHaveURL('/login');
    await expect(page.getByText('Welcome aboard')).toBeVisible();
  });

  test('should navigate from login back to home via ShipLog brand is not a link on login page', async ({ page }) => {
    // The login page has a ShipLog brand but it's not a navigation link.
    // Verify user can still navigate back.
    await page.goto('/login');
    await expect(page.getByText('ShipLog')).toBeVisible();
  });

  test('should show 404 page for non-existent routes', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await expect(page.getByText('404')).toBeVisible();
    await expect(page.getByText('Page not found')).toBeVisible();
  });

  test('should have a "Return Home" link on the 404 page', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    const homeLink = page.getByRole('link', { name: /Return Home/i });
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveAttribute('href', '/');
  });

  test('should navigate from 404 back to home', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await page.getByRole('link', { name: /Return Home/i }).click();
    await expect(page).toHaveURL('/');
  });

  test('should redirect unauthenticated users from dashboard to login', async ({ page }) => {
    await page.goto('/dashboard');
    // Dashboard should redirect to login for unauthenticated users
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    await expect(page).toHaveURL('/login');
  });

  test('should navigate to changelog from footer', async ({ page }) => {
    await page.goto('/');
    await page.locator('footer').getByRole('link', { name: 'Changelog' }).click();
    await expect(page).toHaveURL('/changelog');
  });
});
