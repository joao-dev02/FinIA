import { readFileSync,writeFileSync } from 'node:fs';
const names=['202611090001_foundation.sql','202611090002_commands.sql','202611090003_snapshot.sql'];
const parts=names.map(name=>{
  const source=readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8');
  return `-- SOURCE: ${name}\n${source.replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'').trim()}`;
});
const content=`-- FinAI phase 2. Review target project and existing objects before running.\n-- New schema only: no DROP, no existing data removal, no user creation.\n-- Entire bundle is atomic. Do not rerun on an already migrated project.\nbegin;\n\n${parts.join('\n\n')}\n\ncommit;\n`;
writeFileSync(new URL('../supabase/setup-finai.sql',import.meta.url),content);
console.log('Prepared supabase/setup-finai.sql from 3 versioned migrations. No database connection was made.');
