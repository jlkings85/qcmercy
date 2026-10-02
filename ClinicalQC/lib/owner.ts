import {identity,operator,Problem} from './server';
import {authRuntime} from './auth';
export const isOwnerEmail=(email:string)=>email.trim().toLowerCase()===authRuntime().ownerEmail.trim().toLowerCase();
export async function requireOwner(){const auth=await identity(),me=await operator();if(me.role!=='admin'||!isOwnerEmail(auth.email))throw new Problem('Only the owner administrator can manage trash.',403);return me;}
