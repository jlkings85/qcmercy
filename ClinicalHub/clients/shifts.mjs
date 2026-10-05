import {startSharedLogin} from './start-login.mjs';
// Preserve the current app, Evals bridge and scheduled tasks. Only add a fixed
// sign-in destination for the dashboard's Evals card; no arbitrary return URLs.
export function withEvaluationsLogin(native){return {...native,async fetch(request,env,context){
 const url=new URL(request.url);
 if(url.origin===env.BETTER_AUTH_URL&&url.pathname==='/suite-login/evaluations'&&request.method==='GET'){
  if(env.HUB_LOGIN_ENABLED!=='true')return Response.redirect(new URL('/evaluations/',env.BETTER_AUTH_URL),302);
  return startSharedLogin(request,env,req=>native.fetch(req,env,context),'/evaluations/');
 }
 return native.fetch(request,env,context);
}};}
