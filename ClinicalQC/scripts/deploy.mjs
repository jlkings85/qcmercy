import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
const binding=config.d1_databases?.find(x=>x.binding==='DB');
if(config.name!=='clinicalqc'||binding?.database_name!=='mercyqc'||!binding.database_id||binding.database_id==='00000000-0000-4000-8000-000000000000')throw Error('Create the separate mercyqc D1 database and set its real database_id in wrangler.jsonc. Never use the ClinicalShifts database.');
function run(args){const r=spawnSync('node',args,{stdio:'inherit',env:process.env});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1);}
run(['node_modules/typescript/bin/tsc','--noEmit']);
run(['tests/auth.integration.mjs']);
run(['tests/migration.integration.mjs']);
run(['tests/bulk-invitations.integration.mjs']);
run(['node_modules/vinext/dist/cli.js','build']);
run(['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply',binding.database_name,'--remote']);
run(['node_modules/wrangler/bin/wrangler.js','deploy','--config','dist/server/wrangler.json']);
