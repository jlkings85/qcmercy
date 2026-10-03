import {sqliteTable,text,integer,index,uniqueIndex} from 'drizzle-orm/sqlite-core';
import {oauthProvider} from '@better-auth/oauth-provider';
import {jwt} from 'better-auth/plugins';
import * as core from './auth-schema.ts';

// Derive the adapter and migration from the same pinned plugin schema.
export const pluginModels={...oauthProvider({loginPage:'/login',consentPage:'/consent'}).schema,...jwt().schema};
export const pluginSchema={};
for(const [key,model] of Object.entries(pluginModels)){
 const columns={id:text('id').primaryKey()};
 for(const [name,f] of Object.entries(model.fields)){
  let col=f.type==='date'?integer(name,{mode:'timestamp_ms'}):f.type==='boolean'?integer(name,{mode:'boolean'}):f.type==='number'?integer(name):text(name,{mode:f.type==='json'||f.type.endsWith('[]')?'json':'text'});
  if(f.required!==false)col=col.notNull();
  if(f.unique)col=col.unique();
  columns[name]=col;
 }
 pluginSchema[key]=sqliteTable('hub_'+key,columns,t=>Object.entries(model.fields).filter(([,f])=>f.index).map(([n])=>index('hub_'+key+'_'+n).on(t[n])).concat((model.indexes||[]).map((i,n)=>(i.unique?uniqueIndex:index)('hub_'+key+'_composite_'+n).on(...i.fields.map(f=>t[f])))));
}
export const schema={...core,...pluginSchema};
