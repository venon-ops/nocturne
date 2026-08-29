import Stripe from 'npm:stripe@17.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  try{
    const authorization=req.headers.get('Authorization');if(!authorization)throw Error('Non authentifié');
    const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}}}),admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const {data:{user}}=await client.auth.getUser();if(!user)throw Error('Non authentifié');
    const {waitlistId,returnPath}=await req.json();const safeReturnPath=typeof returnPath==='string'&&returnPath.startsWith('/')&&!returnPath.startsWith('//')?returnPath:'/tickets?waitlist=ready';const {data:waitlist}=await admin.from('ticket_resale_waitlist').select('id,buyer_id,status,stripe_customer_id').eq('id',waitlistId).eq('buyer_id',user.id).eq('status','setup_required').maybeSingle();if(!waitlist)throw Error('Inscription indisponible');
    const stripeKey=Deno.env.get('STRIPE_SECRET_KEY'),publishableKey=Deno.env.get('STRIPE_PUBLISHABLE_KEY'),appUrl=Deno.env.get('APP_URL');if(!stripeKey||!publishableKey||!appUrl)throw Error('Configuration Stripe incomplète');const stripe=new Stripe(stripeKey);
    const customer=waitlist.stripe_customer_id??(await stripe.customers.create({email:user.email,metadata:{nocturneUserId:user.id}})).id;
    await admin.from('ticket_resale_waitlist').update({stripe_customer_id:customer}).eq('id',waitlist.id);
    const session=await stripe.checkout.sessions.create({mode:'setup',ui_mode:'embedded',payment_method_types:['card'],customer,return_url:`${appUrl}${safeReturnPath}`,metadata:{kind:'waitlist_setup',waitlistId:waitlist.id,buyerId:user.id}});
    await admin.from('ticket_resale_waitlist').update({stripe_setup_session_id:session.id}).eq('id',waitlist.id);
    return Response.json({clientSecret:session.client_secret,publishableKey},{headers:corsHeaders});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Configuration indisponible'},{status:400,headers:corsHeaders})}
});
