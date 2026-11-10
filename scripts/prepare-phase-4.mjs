import {readFileSync,writeFileSync} from 'node:fs';
const files=['202611100009_goals.sql','202611100010_goal_snapshot.sql'];
const parts=files.map(name=>`-- SOURCE: ${name}\n${readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8').replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'').trim()}`);
writeFileSync(new URL('../supabase/update-phase-4.sql',import.meta.url),`-- FinAI PHASE 4. Requires completed phases 2 AND 3.\n-- Apply once, to the reviewed project. No existing financial entry is removed.\n-- Goal reservations earmark existing cash; spending reserved funds requires release.\nbegin;\n\n${parts.join('\n\n')}\n\ncommit;\n`);
console.log('Prepared phase 4 incremental SQL. No remote connection was made.');
