import {readFileSync,writeFileSync} from 'node:fs';
const names=['202611100004_credit_schema.sql','202611100005_credit_commands.sql','202611100006_bills_commands.sql','202611100007_credit_snapshot.sql','202611100008_cancellations.sql'];
const parts=names.map(name=>`-- SOURCE: ${name}\n${readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8').replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'').trim()}`);
const content=`-- FinAI PHASE 3 INCREMENTAL UPDATE. Requires completed phase 2.\n-- Review target project and take a backup first. Do NOT rerun setup-finai.sql.\n-- No existing account or transaction is deleted. New constraints support card liabilities.\n-- All five migrations are applied in a single transaction; run once only.\nbegin;\n\n${parts.join('\n\n')}\n\ncommit;\n`;
writeFileSync(new URL('../supabase/update-phase-3.sql',import.meta.url),content);
console.log('Prepared incremental phase 3 SQL bundle. No database connection was made.');
