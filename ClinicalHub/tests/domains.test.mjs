import test from 'node:test';
import assert from 'node:assert/strict';
import {MODULES,moduleDestinations} from '../access.mjs';
test('staged cutover retains current destinations until explicitly activated',()=>{
 const pending=moduleDestinations();
 assert.equal(pending.length,7);
 for(const m of pending){assert.equal(m.url,MODULES.find(x=>x.id===m.id).url);assert.equal(m.domainReady,false);}
 const active=moduleDestinations({CLINICALAPPS_LIVE_MODULES:'qc, forms'});
 assert.equal(active.find(m=>m.id==='qc').url,'https://qc.clinicalapps.app');
 assert.equal(active.find(m=>m.id==='forms').url,'https://forms.clinicalapps.app');
 assert.equal(active.find(m=>m.id==='narcs').url,pending.find(m=>m.id==='narcs').url);
 assert.equal(moduleDestinations({CLINICALAPPS_LIVE_MODULES:''}).find(m=>m.id==='qc').domainReady,false);
});
test('activation cannot supply an arbitrary URL or unknown hostname',()=>{
 for(const value of ['https://evil.example','qc.evil.example','unknown'])assert.throws(()=>moduleDestinations({CLINICALAPPS_LIVE_MODULES:value}),/Unknown ClinicalApps module/);
});
