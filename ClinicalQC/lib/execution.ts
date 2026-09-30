import {AsyncLocalStorage} from 'node:async_hooks';
export const execution=new AsyncLocalStorage<ExecutionContext>();
