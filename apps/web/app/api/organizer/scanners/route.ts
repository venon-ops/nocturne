import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service=process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function authorize(request:NextRequest){
  const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  if(!token||!url||!anon||!service)return null;
  const verifier=createClient(url,anon,{auth:{persistSession:false}});
  const {data:{user}}=await verifier.auth.getUser(token);
  if(!user)return null;
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:profile}=await admin.from('profiles').select('role').eq('id',user.id).single();
  if(!profile||!['organizer','admin'].includes(profile.role))return null;
  return {user,admin};
}

export async function GET(request:NextRequest){
  const auth=await authorize(request);if(!auth)return NextResponse.json({error:'unauthorized'},{status:401});
  const {data,error}=await auth.admin.from('scanner_accounts').select('profile_id,username,active,created_at').eq('organizer_id',auth.user.id).order('created_at');
  if(error)return NextResponse.json({error:error.message},{status:400});
  const accounts=data??[],ids=accounts.map(account=>account.profile_id);
  const {data:sessions}=ids.length?await auth.admin.from('scan_sessions').select('id,scanner_id,label,started_at,ended_at,ended_reason,events(title)').in('scanner_id',ids).order('started_at',{ascending:false}).limit(200):{data:[]};
  const sessionIds=(sessions??[]).map(session=>session.id);
  const {data:checkIns}=sessionIds.length?await auth.admin.from('check_ins').select('scan_session_id').in('scan_session_id',sessionIds):{data:[]};
  const scanCounts=(checkIns??[]).reduce<Record<string,number>>((counts,row)=>{if(row.scan_session_id)counts[row.scan_session_id]=(counts[row.scan_session_id]??0)+1;return counts},{});
  const {data:authEvents}=ids.length?await auth.admin.from('scanner_auth_events').select('id,scanner_id,event_type,occurred_at').in('scanner_id',ids).order('occurred_at',{ascending:false}).limit(200):{data:[]};
  const users=await Promise.all(accounts.map(account=>auth.admin.auth.admin.getUserById(account.profile_id)));
  return NextResponse.json({scanners:accounts.map((account,index)=>{const accountSessions=(sessions??[]).filter(session=>session.scanner_id===account.profile_id).map(session=>({...session,scan_count:scanCounts[session.id]??0}));return {...account,last_sign_in_at:users[index].data.user?.last_sign_in_at??null,active_session:accountSessions.find(session=>!session.ended_at)??null,sessions:accountSessions,auth_events:(authEvents??[]).filter(event=>event.scanner_id===account.profile_id)}})});
}

export async function POST(request:NextRequest){
  const auth=await authorize(request);if(!auth)return NextResponse.json({error:'unauthorized'},{status:401});
  const body=await request.json().catch(()=>null) as {username?:string,password?:string}|null;
  const username=body?.username?.trim().toLowerCase()??'';const password=body?.password??'';
  if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username))return NextResponse.json({error:'invalid_username'},{status:400});
  if(password.length<8)return NextResponse.json({error:'weak_password'},{status:400});
  const email=`${username}@scan.nocturne.app`;
  const {data:created,error:createError}=await auth.admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:username,account_type:'scanner'}});
  if(createError||!created.user)return NextResponse.json({error:createError?.message??'creation_failed'},{status:400});
  const profileId=created.user.id;
  const {error:profileError}=await auth.admin.from('profiles').update({display_name:username,role:'scanner'}).eq('id',profileId);
  const {error:accountError}=profileError?{error:profileError}:await auth.admin.from('scanner_accounts').insert({profile_id:profileId,organizer_id:auth.user.id,username});
  if(accountError){await auth.admin.auth.admin.deleteUser(profileId);return NextResponse.json({error:accountError.message},{status:400})}
  return NextResponse.json({scanner:{profile_id:profileId,username,active:true}},{status:201});
}

export async function PATCH(request:NextRequest){
  const auth=await authorize(request);if(!auth)return NextResponse.json({error:'unauthorized'},{status:401});
  const body=await request.json().catch(()=>null) as {profileId?:string;active?:boolean;password?:string;closeSession?:boolean}|null;
  if(!body?.profileId)return NextResponse.json({error:'invalid_request'},{status:400});
  const {data:account}=await auth.admin.from('scanner_accounts').select('profile_id').eq('profile_id',body.profileId).eq('organizer_id',auth.user.id).maybeSingle();
  if(!account)return NextResponse.json({error:'not_found'},{status:404});
  if(typeof body.active==='boolean'){const {error}=await auth.admin.from('scanner_accounts').update({active:body.active}).eq('profile_id',body.profileId);if(error)return NextResponse.json({error:error.message},{status:400})}
  if(body.password!==undefined){if(body.password.length<8)return NextResponse.json({error:'weak_password'},{status:400});const {error}=await auth.admin.auth.admin.updateUserById(body.profileId,{password:body.password});if(error)return NextResponse.json({error:error.message},{status:400})}
  if(body.closeSession){const {error}=await auth.admin.from('scan_sessions').update({ended_at:new Date().toISOString(),ended_reason:'organizer'}).eq('scanner_id',body.profileId).is('ended_at',null);if(error)return NextResponse.json({error:error.message},{status:400})}
  return NextResponse.json({ok:true});
}
