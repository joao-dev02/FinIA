import {test,expect,type Page} from '@playwright/test';
async function navigate(page:Page,module:string){
 await page.goto('/demo');await expect(page.locator('.recharts-surface')).toBeVisible();
 if(await page.getByLabel('Navegar para').isVisible())await page.getByLabel('Navegar para').selectOption(module);
 else await page.getByRole('button',{name:module,exact:true}).click();
}
test('cartão mostra dívida e parcelas; prévia preserva os centavos',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await navigate(page,'Cartões');
 await expect(page.getByRole('heading',{name:'Faturas de Cartão principal'})).toBeVisible();
 await expect(page.getByText('R$ 6.800,00',{exact:true})).toBeVisible();
 await page.getByText('Ver parcelas desta fatura',{exact:true}).first().click();
 await expect(page.getByText('1 de 3',{exact:true})).toBeVisible();
 await page.screenshot({path:test.info().outputPath('cards.png'),fullPage:true});
 await page.getByRole('button',{name:'Nova compra',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.getByLabel('Valor em R$',{exact:true}).fill('100,00');await dialog.getByLabel('Número de parcelas').fill('3');
 await expect(dialog.getByText(/Primeira:.*33,34.*Última:.*33,33/)).toBeVisible();
 await dialog.getByLabel('Data',{exact:true}).fill('');await dialog.getByLabel('Data',{exact:true}).fill('2026-11-05');
 await expect(dialog.getByText('Primeiro vencimento: 15/11/2026')).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Confirmar e salvar'})).toBeDisabled();
 await page.keyboard.press('Escape');expect(errors).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('agenda de assinaturas filtra status e apresenta recorrência anual',async({page})=>{
 await navigate(page,'Contas e assinaturas');
 await expect(page.getByRole('heading',{name:'Agenda de compromissos'})).toBeVisible();
 await expect(page.locator('.bill-row')).toHaveCount(3);
 await page.getByLabel('Status dos compromissos').selectOption('paid');
 await expect(page.getByText('Nenhum compromisso neste status.')).toBeVisible();
 await page.getByLabel('Status dos compromissos').selectOption('pending');
 await page.screenshot({path:test.info().outputPath('commitments.png'),fullPage:true});
 await page.getByRole('button',{name:'Nova recorrência',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await page.getByLabel('Frequência').selectOption('12');
 await expect(page.getByLabel('Frequência')).toHaveValue('12');
 await page.getByRole('button',{name:'Cancelar',exact:true}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
