import { test, expect } from '@playwright/test';

test.describe('Home / Landing Page', () => {
  test('lets visitors compare the same release across audiences', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'See it in action' }).click();
    await expect(page).toHaveURL(/#example$/);
    await page.getByRole('button', { name: 'Developers', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'PDF export and a CSV fix' })).toBeVisible();
    await page.getByRole('button', { name: 'Stakeholders', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Easier reporting outside the product' })).toBeVisible();
  });

  test('keeps the mobile navigation and example within the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('nav').getByRole('link', { name: 'Connect GitHub' })).toBeVisible();
    await page.getByRole('link', { name: 'See it in action' }).click();
    await expect(page.getByRole('button', { name: 'Customers', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('hydrates a returning visitor without replacing mismatched server markup', async ({ page, context }) => {
    await context.addCookies([{ name: 'shiplog_logged_in', value: '1', domain: 'localhost', path: '/' }]);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('nav').getByRole('link', { name: 'Dashboard' })).toBeVisible();
    expect(errors.filter(error => /hydrat|Minified React error/i.test(error))).toEqual([]);
  });

  test('should render the landing page with correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/ShipLog/);
  });

  test('should display the ShipLog brand in the navbar', async ({ page }) => {
    await page.goto('/');
    const brand = page.locator('nav').getByText('ShipLog');
    await expect(brand).toBeVisible();
  });

  test('should display the hero headline', async ({ page }) => {
    await page.goto('/');
    const headline = page.getByRole('heading', { level: 1 });
    await expect(headline).toContainText('Release notes that');
    await expect(headline).toContainText('ship themselves');
  });

  test('should display the hero tagline', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('One release. Three audiences. Ready to share.')).toBeVisible();
  });

  test('should have a CTA button linking to login for unauthenticated users', async ({ page }) => {
    await page.goto('/');
    const ctaLink = page.getByRole('link', { name: /Connect GitHub/i }).first();
    await expect(ctaLink).toBeVisible();
    await expect(ctaLink).toHaveAttribute('href', '/login');
  });

  test('should have a "See it in action" button linking to the example', async ({ page }) => {
    await page.goto('/');
    const actionLink = page.getByRole('link', { name: /See it in action/i });
    await expect(actionLink).toBeVisible();
    await expect(actionLink).toHaveAttribute('href', '#example');
  });

  test('should display the "How it works" section', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('How it works')).toBeVisible();
    await expect(page.getByText('Connect GitHub', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Publish a release')).toBeVisible();
    await expect(page.getByText('Notes ship everywhere')).toBeVisible();
  });

  test('should display the features section with three audience cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Customer Changelog')).toBeVisible();
    await expect(page.getByText('Developer Changelog')).toBeVisible();
    await expect(page.getByText('Stakeholder Brief')).toBeVisible();
  });

  test('should display the pricing section with three plans', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Simple pricing')).toBeVisible();
    await expect(page.getByText('$0')).toBeVisible();
    await expect(page.getByText('$29')).toBeVisible();
    await expect(page.getByText('$79')).toBeVisible();
  });

  test('should display footer with navigation links', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');
    await expect(footer.getByRole('link', { name: 'Docs' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Changelog' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Privacy' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Terms' })).toBeVisible();
  });

  test('should have navigation links in the navbar', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('nav');
    await expect(nav.getByRole('link', { name: 'Features' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Pricing' })).toBeVisible();
  });
});
