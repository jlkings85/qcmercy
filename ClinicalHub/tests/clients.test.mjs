import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withEvaluationsLogin} from '../clients/shifts.mjs';
test('Evals launch uses a fixed callback and preserves existing Worker handlers',async()=>{
 let nativeRequest;
 const scheduled=()=>{},native={scheduled,fetch:async req=>{nativeRequest=req;return Response.json({url:'https://clinicalapps.app/api/auth/oauth2/authorize?state=test'},{headers:{'Set-Cookie':'native-state=test; HttpOnly; Secure; SameSite=Lax'}});}};
 const wrapped=withEvaluationsLogin(native),env={BETTER_AUTH_URL:'https://shifts.clinicalapps.app',HUB_ORIGIN:'https://clinicalapps.app',HUB_LOGIN_ENABLED:'true'};
 const response=await wrapped.fetch(new Request(env.BETTER_AUTH_URL+'/suite-login/evaluations?next=https://evil.test'),env,{});
 assert.equal(response.status,302);assert.equal(new URL(response.headers.get('location')).origin,env.HUB_ORIGIN);
 assert.equal(nativeRequest.url,env.BETTER_AUTH_URL+'/api/auth/sign-in/social');
 assert.deepEqual(await nativeRequest.json(),{provider:'mercy-hub',callbackURL:'/evaluations/'});
 assert.equal(wrapped.scheduled,scheduled);assert.match(response.headers.get('Set-Cookie'),/HttpOnly/);
 const disabled=await wrapped.fetch(new Request(env.BETTER_AUTH_URL+'/suite-login/evaluations'),{...env,HUB_LOGIN_ENABLED:'false'},{});
 assert.equal(disabled.headers.get('location'),env.BETTER_AUTH_URL+'/evaluations/');
});
