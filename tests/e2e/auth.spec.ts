import {test,expect} from '@playwright/test';
test('espaço pessoal exige login e não mistura dados da demonstração',async({page})=>{
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading',{name:'Seu dinheiro, seu espaço.'})).toBeVisible();
  await expect(page.getByLabel('E-mail',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Senha',{exact:true})).toHaveAttribute('type','password');
  await expect(page.getByRole('button',{name:'Entrar no meu espaço'})).toBeVisible();
  await expect(page.locator('table')).toHaveCount(0);
  await page.screenshot({path:test.info().outputPath('login.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
