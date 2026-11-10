import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
async function navigate(page:Page,module:string){await page.goto('/demo');await expect(page.locator('.recharts-surface')).toBeVisible();if(await page.getByLabel('Navegar para').isVisible())await page.getByLabel('Navegar para').selectOption(module);else await page.getByRole('button',{name:module,exact:true}).click();}
test('metas mostram reservas, progresso e simulação sem duplicar saldo',async({page})=>{
 await navigate(page,'Metas');await expect(page.getByRole('heading',{name:'Dê um destino ao seu dinheiro.'})).toBeVisible();await expect(page.getByRole('progressbar',{name:'Progresso de Reserva de emergência'})).toHaveAttribute('aria-valuenow','20');
 await page.getByLabel('Contribuição mensal em R$').fill('2000,00');await expect(page.locator('.simulation-result')).toContainText('4 meses');await page.screenshot({path:test.info().outputPath('goals.png'),fullPage:true});
 await page.getByRole('button',{name:'Reservar',exact:true}).first().click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('button',{name:'Confirmar e salvar'})).toBeDisabled();await page.keyboard.press('Escape');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('relatório filtra despesas e exporta CSV e PDF válidos',async({page})=>{
 await navigate(page,'Relatórios');await page.getByLabel('Categoria do relatório').selectOption('Moradia');await expect(page.locator('.report-transactions tbody tr')).toHaveCount(2);await page.screenshot({path:test.info().outputPath('reports.png'),fullPage:true});
 const csvDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar CSV'}).click();const csv=await csvDownload;expect(csv.suggestedFilename()).toBe('finai-demo-2026-11.csv');const text=await readFile((await csv.path())!,'utf8');expect(text).toContain('Aluguel');expect(text).toContain('Internet residencial');expect(text).not.toContain('Supermercado');
 const pdfDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar PDF'}).click();const pdf=await pdfDownload;expect(pdf.suggestedFilename()).toBe('finai-demo-2026-11.pdf');const bytes=await readFile((await pdf.path())!);expect(bytes.subarray(0,5).toString()).toBe('%PDF-');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('endpoint de exportação exige autenticação',async({request})=>{
 const response=await request.get('/api/reports/export?format=csv&period=2026-11&workspace=11111111-1111-4111-8111-111111111111');expect(response.status()).toBe(401);expect(response.headers()['cache-control']).toContain('no-store');
});
