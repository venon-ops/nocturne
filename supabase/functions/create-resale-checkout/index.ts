import Stripe from 'npm:stripe@17.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  let listingId:string|undefined,buyerId:string|undefined,admin:ReturnType<typeof createClient>|undefined;
  try{
    const authorization=req.headers.get('Authorization');if(!authorization)throw Error('Non authentifié');
    const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}}});
    const {data:{user}}=await client.auth.getUser();if(!user)throw Error('Non authentifié');buyerId=user.id;
    const {token}=await req.json();if(typeof token!=='string'||token.length<20)throw Error('Lien invalide');
    admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const {data,error}=await admin.rpc('reserve_private_ticket_resale',{p_token:token,p_buyer:user.id});if(error)throw error;
    const offer=Array.isArray(data)?data[0]:null;if(!offer)throw Error('Cette offre n’est plus disponible');listingId=offer.listing_id;
    if(!offer.organizer_stripe_account_id)throw Error('Le paiement de cet événement est indisponible');
    const stripeKey=Deno.env.get('STRIPE_SECRET_KEY'),publishableKey=Deno.env.get('STRIPE_PUBLISHABLE_KEY'),appUrl=Deno.env.get('APP_URL');
    if(!stripeKey||!publishableKey||!appUrl)throw Error('Configuration Stripe incomplète');
    const stripe=new Stripe(stripeKey);
    const session=await stripe.checkout.sessions.create({ui_mode:'embedded',redirect_on_completion:'if_required',return_url:`${appUrl}/tickets?resale=success`,mode:'payment',payment_method_types:['card'],customer_email:user.email,line_items:[{price_data:{currency:'eur',unit_amount:offer.price_cents,product_data:{name:`${offer.event_title} — ${offer.ticket_type_name}`,description:'Transfert sécurisé NOCTURNE'}},quantity:1}],metadata:{kind:'ticket_resale',resaleListingId:offer.listing_id,buyerId:user.id},payment_intent_data:{application_fee_amount:offer.fee_cents,transfer_data:{destination:offer.organizer_stripe_account_id}}});
    const {error:attachError}=await admin.rpc('attach_resale_checkout',{p_listing:offer.listing_id,p_buyer:user.id,p_session:session.id});if(attachError){await stripe.checkout.sessions.expire(session.id);throw attachError}
    return Response.json({clientSecret:session.client_secret,publishableKey},{headers:corsHeaders});
  }catch(error){if(admin&&listingId&&buyerId)await admin.rpc('release_resale_reservation',{p_listing:listingId,p_buyer:buyerId});return Response.json({error:error instanceof Error?error.message:'Paiement indisponible'},{status:400,headers:corsHeaders})}
});
