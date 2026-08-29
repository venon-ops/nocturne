import Stripe from 'npm:stripe@17.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  try{
    const authorization=req.headers.get('Authorization');if(!authorization)throw Error('Non authentifié');
    const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}}}),admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const {data:{user}}=await client.auth.getUser();if(!user)throw Error('Non authentifié');
    const {data:profile}=await admin.from('profiles').select('role,display_name').eq('id',user.id).single();if(profile?.role!=='organizer')throw Error('Compte organisateur requis');
    let {data:organization}=await admin.from('organizer_profiles').select('name,stripe_account_id').eq('profile_id',user.id).maybeSingle();if(!organization){const fallbackName=profile.display_name?.trim()||user.user_metadata?.organization_name||'Organisation';const {data:created,error:createError}=await admin.from('organizer_profiles').insert({profile_id:user.id,name:fallbackName,onboarding_complete:false}).select('name,stripe_account_id').single();if(createError||!created)throw Error(createError?.message||'Impossible de créer l’organisation');organization=created}
    const stripeKey=Deno.env.get('STRIPE_SECRET_KEY'),appUrl=Deno.env.get('APP_URL');if(!stripeKey||!appUrl)throw Error('Configuration Stripe incomplète');const stripe=new Stripe(stripeKey);
    const body=await req.json().catch(()=>({})),action=body?.action??'status';let accountId=organization.stripe_account_id as string|null;
    if(!accountId&&action!=='onboard')return Response.json({connected:false,onboardingComplete:false,chargesEnabled:false,payoutsEnabled:false},{headers:corsHeaders});
    if(!accountId){const account=await stripe.accounts.create({type:'express',country:'FR',email:user.email,business_profile:{name:organization.name},capabilities:{card_payments:{requested:true},transfers:{requested:true}},metadata:{nocturneOrganizerId:user.id}});accountId=account.id;await admin.from('organizer_profiles').update({stripe_account_id:accountId,onboarding_complete:false}).eq('profile_id',user.id)}
    const account=await stripe.accounts.retrieve(accountId),complete=Boolean(account.details_submitted&&account.charges_enabled&&account.payouts_enabled);await admin.from('organizer_profiles').update({onboarding_complete:complete}).eq('profile_id',user.id);
    if(action==='onboard'){const link=await stripe.accountLinks.create({account:accountId,refresh_url:`${appUrl}/organizer/settings?stripe=refresh`,return_url:`${appUrl}/organizer/settings?stripe=return`,type:'account_onboarding'});return Response.json({url:link.url},{headers:corsHeaders})}
    if(action==='dashboard'){if(!complete)throw Error('Terminez d’abord l’activation Stripe');const login=await stripe.accounts.createLoginLink(accountId);return Response.json({url:login.url},{headers:corsHeaders})}
    return Response.json({connected:true,onboardingComplete:complete,detailsSubmitted:account.details_submitted,chargesEnabled:account.charges_enabled,payoutsEnabled:account.payouts_enabled,requirements:account.requirements?.currently_due??[]},{headers:corsHeaders});
  }catch(error){console.error('Stripe Connect error',error);return Response.json({error:error instanceof Error?error.message:'Connexion Stripe indisponible'},{status:400,headers:corsHeaders})}
});
