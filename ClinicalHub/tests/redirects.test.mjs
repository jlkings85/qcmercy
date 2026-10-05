import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../redirects.mjs';
test('legacy links retain paths and queries while Evals uses authenticated Shifts',()=>{
 assert.equal(worker.fetch(new Request('https://qc.mercyems.net/login?token=example')).headers.get('Location'),'https://qc.clinicalapps.app/login?token=example');
 assert.equal(worker.fetch(new Request('https://clinicalshifts.app/suite-login')).headers.get('Location'),'https://shifts.clinicalapps.app/suite-login');
 assert.equal(worker.fetch(new Request('https://evals.clinicalapps.app/?area=training')).headers.get('Location'),'https://shifts.clinicalapps.app/evaluations/?area=training');
 assert.equal(worker.fetch(new Request('https://unknown.example/')).status,404);
 assert.equal(worker.fetch(new Request('https://qc.mercyems.net/api/qc',{method:'POST',body:'example'})).status,409);
});
