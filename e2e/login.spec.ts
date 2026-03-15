import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test('should render the login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('Welcome aboard')).toBeVisible();
  });

  test('should display the ShipLog brand', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('ShipLog')).toBeVisible();
  });

  test('should display the GitHub login button', async ({ page }) => {
    await page.goto('/login');
    const githubButton = page.getByRole('link', { name: /Continue with GitHub/i });
    await expect(githubButton).toBeVisible();
    await expect(githubButton).toHaveAttribute('href', '/api/auth/github');
  });

  test('should describe what GitHub access is requested', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('What we\'ll access:')).toBeVisible();
    await expect(page.getByText('Read access to your repositories')).toBeVisible();
    await expect(page.getByText('Webhook creation for release events')).toBeVisible();
    await expect(page.getByText('Your GitHub profile (name, email)')).toBeVisible();
  });

  test('should have links to Terms and Privacy', async ({ page }) => {
    await page.goto('/login');
    const termsLink = page.getByRole('link', { name: 'Terms of Service' });
    const privacyLink = page.getByRole('link', { name: 'Privacy Policy' });
    await expect(termsLink).toBeVisible();
    await expect(termsLink).toHaveAttribute('href', '/terms');
    await expect(privacyLink).toBeVisible();
    await expect(privacyLink).toHaveAttribute('href', '/privacy');
  });

  test('should show demo login button when demo query param is set', async ({ page }) => {
    await page.goto('/login?demo=true');
    await expect(page.getByRole('button', { name: /Demo Login/i })).toBeVisible();
  });

  test('should not show demo login button by default', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /Demo Login/i })).not.toBeVisible();
  });
});
