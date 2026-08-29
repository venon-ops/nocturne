import Stripe from 'npm:stripe@17.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  try{
    const authorization=req.headers.get('Authorization');if(!authorization)throw Error('Non authentifié');
    const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}}}),admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const {data:{user}}=await client.auth.getUser();if(!user)throw Error('Non authentifié');
    const {waitlistId}=await req.json(),{data:waitlist}=await admin.from('ticket_resale_waitlist').select('id,buyer_id,mode,status,requested_quantity,reserved_listing_ids,reserved_until,ticket_type_id').eq('id',waitlistId).eq('buyer_id',user.id).gt('reserved_until',new Date().toISOString()).maybeSingle();
    const canPay=waitlist&&((waitlist.mode==='notification'&&waitlist.status==='reserved')||(waitlist.mode==='auto_pay'&&waitlist.status==='action_required'));if(!canPay||!Array.isArray(waitlist.reserved_listing_ids)||waitlist.reserved_listing_ids.length!==waitlist.requested_quantity)throw Error('Ce lot n’est plus disponible');
    const {data:listings,error:listingsError}=await admin.from('ticket_resale_listings').select('id,price_cents,fee_cents,status,buyer_id,stripe_checkout_session_id').in('id',waitlist.reserved_listing_ids);if(listingsError||!listings||listings.length!==waitlist.requested_quantity||listings.some(item=>item.status!=='reserved'||item.buyer_id!==user.id))throw Error('Ce lot n’est plus disponible');
    const {data:type}=await admin.from('ticket_types').select('name,event:events(title,organizer:organizer_profiles(stripe_account_id))').eq('id',waitlist.ticket_type_id).single();const event=Array.isArray(type?.event)?type.event[0]:type?.event,organizer=Array.isArray(event?.organizer)?event.organizer[0]:event?.organizer;if(!type||!event||!organizer?.stripe_account_id)throw Error('Le paiement de cette organisation est indisponible');
    const stripeKey=Deno.env.get('STRIPE_SECRET_KEY'),publishableKey=Deno.env.get('STRIPE_PUBLISHABLE_KEY'),appUrl=Deno.env.get('APP_URL');if(!stripeKey||!publishableKey||!appUrl)throw Error('Configuration Stripe incomplète');const stripe=new Stripe(stripeKey),fee=listings.reduce((sum,item)=>sum+item.fee_cents,0),previousPayment=listings.find(item=>item.stripe_checkout_session_id?.startsWith('pi_'))?.stripe_checkout_session_id;if(previousPayment){const intent=await stripe.paymentIntents.retrieve(previousPayment);if(intent.status!=='succeeded'&&intent.status!=='canceled')await stripe.paymentIntents.cancel(previousPayment)}
    const session=await stripe.checkout.sessions.create({mode:'payment',ui_mode:'embedded',return_url:`${appUrl}/tickets?resale=success`,line_items:[{quantity:waitlist.requested_quantity,price_data:{currency:'eur',unit_amount:listings[0].price_cents,product_data:{name:`${type.name} — ${event.title}`}}}],payment_intent_data:{application_fee_amount:fee,transfer_data:{destination:organizer.stripe_account_id}},metadata:{kind:'waitlist_manual',waitlistId:waitlist.id,buyerId:user.id,resaleListings:JSON.stringify(waitlist.reserved_listing_ids)}});
    await admin.from('ticket_resale_listings').update({stripe_checkout_session_id:session.id}).in('id',waitlist.reserved_listing_ids).eq('buyer_id',user.id).eq('status','reserved');
    return Response.json({clientSecret:session.client_secret,publishableKey},{headers:corsHeaders});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Paiement indisponible'},{status:400,headers:corsHeaders})}
});
