import {redirect} from 'next/navigation';
import {getCurrentUser} from '@/lib/auth';
import {one} from '@/lib/server';
import Activation from './screen';
export const dynamic='force-dynamic';
export default async function Page(){const user=await getCurrentUser();if(!user)redirect('/login');if(await one('SELECT operator_id FROM qc_login_links WHERE auth_user_id=?',user.userId))redirect('/');return <Activation email={user.email}/>;}
