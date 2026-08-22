import { test, expect } from '@playwright/test';

test('未登录时页面跳转登录页并显示标题', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('wxread 控制面板');
});

test('登录页有 GitHub 授权按钮', async ({ page }) => {
  await page.goto('/#/login');
  await expect(page.getByRole('button', { name: /GitHub 授权登录/ })).toBeVisible();
});

test('登录页有手动 Token 输入框', async ({ page }) => {
  await page.goto('/#/login');
  await expect(page.getByPlaceholder('ghp_xxxxxxxxxxxx')).toBeVisible();
});
