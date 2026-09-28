import { test, expect } from '@playwright/test';

test.describe('Release harbor landing page', () => {
  test('shows the product and routes visitors to free signup', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/ShipLog/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('You ship code.');
    await expect(page.getByRole('link', { name: /Connect GitHub — start free/ })).toHaveAttribute('href', '/login');
    await expect(page.getByText(/14-day Pro trial from Settings when you upgrade/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Explore Team' })).toHaveAttribute('href', '/login');
  });

  test('compares audience drafts and pauses the animated harbor', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Pause harbor animation' }).click();
    await expect(page.getByRole('button', { name: 'Play harbor animation' })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.locator('svg[aria-labelledby="harbor-title harbor-desc"] use').first().evaluate(el => getComputedStyle(el.parentElement!).animationPlayState)).toBe('paused');
    await page.getByRole('link', { name: 'Take a look at the cargo' }).click();
    await expect(page).toHaveURL(/#example$/);
    await page.getByRole('button', { name: 'Developers', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'PDF export is here.' })).toBeVisible();
    await page.getByRole('button', { name: 'Stakeholders', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Less friction in reporting.' })).toBeVisible();
  });

  test('fits mobile and respects reduced motion', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Get started' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.locator('svg[aria-labelledby="harbor-title harbor-desc"] use').first().evaluate(el => getComputedStyle(el.parentElement!).animationName)).toBe('none');
    await page.getByRole('link', { name: 'Take a look at the cargo' }).click();
    await expect(page.getByRole('button', { name: 'Customers', exact: true })).toBeVisible();
  });

  test('hydrates returning visitors without mismatched server markup', async ({ page, context }) => {
    await context.addCookies([{ name: 'shiplog_logged_in', value: '1', url: new URL('/', test.info().project.use.baseURL as string).origin }]);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Dashboard' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('keeps public navigation available', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');
    for (const label of ['Docs', 'Changelog', 'Privacy', 'Terms']) await expect(footer.getByRole('link', { name: label, exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '#pricing');
  });
});
