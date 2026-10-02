import handler from 'vinext/server/fetch-handler';
import {execution} from './lib/execution';
export default {fetch(request:Request,env:unknown,ctx:ExecutionContext){
 const url=new URL(request.url);
 if(url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname)){
  url.protocol='https:';
  return Response.redirect(url.toString(),308);
 }
 return execution.run(ctx,()=>handler.fetch(request,env,ctx));
}};
