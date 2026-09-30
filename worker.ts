import handler from 'vinext/server/fetch-handler';
import {execution} from './lib/execution';
export default {fetch(request:Request,env:unknown,ctx:ExecutionContext){return execution.run(ctx,()=>handler.fetch(request,env,ctx));}};
