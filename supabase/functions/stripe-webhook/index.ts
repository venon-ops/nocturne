import Stripe from 'npm:stripe@17.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async req=>{
 const stripeSecret=Deno.env.get('STRIPE_SECRET_KEY');
 const webhookSecret=Deno.env.get('STRIPE_WEBHOOK_SECRET')?.trim();
 const signature=req.headers.get('stripe-signature');
 if(!stripeSecret||!webhookSecret)return new Response('Missing Stripe configuration',{status:500});
 if(!signature)return new Response('Missing Stripe signature',{status:400});
 const stripe=new Stripe(stripeSecret);let event:Stripe.Event;
 try{event=await stripe.webhooks.constructEventAsync(await req.text(),signature,webhookSecret)}catch(error){console.error('Stripe signature verification failed',error);return new Response('Bad signature',{status:400})}
 if(event.type==='payment_intent.succeeded'){
  const intent=event.data.object as Stripe.PaymentIntent,meta=intent.metadata;if(meta.kind!=='waitlist_auto_pay')return new Response('ok');
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!),listingIds=JSON.parse(meta.resaleListings??'[]') as string[];
  try{
   for(const listingId of listingIds){const {data,error}=await db.rpc('fulfill_ticket_resale',{p_listing:listingId,p_session:intent.id,p_buyer:meta.buyerId});if(error)throw error;const resale=Array.isArray(data)?data[0]:null;if(!resale?.original_checkout_session_id)throw Error('Original payment missing');const original=await stripe.checkout.sessions.retrieve(resale.original_checkout_session_id,{expand:['payment_intent.latest_charge']});const originalIntent=original.payment_intent as Stripe.PaymentIntent|null,charge=typeof originalIntent?.latest_charge==='string'?originalIntent.latest_charge:originalIntent?.latest_charge?.id;if(!charge)throw Error('Original charge missing');const refund=await stripe.refunds.create({charge,amount:resale.seller_refund_cents,reverse_transfer:true},{idempotencyKey:`ticket-resale-${listingId}`});const {error:refundError}=await db.rpc('mark_ticket_resale_refunded',{p_listing:listingId,p_refund:refund.id});if(refundError)throw refundError}
   const {error:waitlistError}=await db.rpc('mark_waitlist_fulfilled',{p_waitlist:meta.waitlistId});if(waitlistError)throw waitlistError;return new Response('ok');
  }catch(error){console.error('Waitlist fulfillment error',error);return new Response('Waitlist fulfillment error',{status:409})}
 }
 if(event.type!=='checkout.session.completed')return new Response('ok');
 const session=event.data.object as Stripe.Checkout.Session;const meta=session.metadata;if(!meta?.buyerId)return new Response('Missing metadata',{status:400});
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 if(meta.kind==='waitlist_setup'){
  const setupId=typeof session.setup_intent==='string'?session.setup_intent:session.setup_intent?.id;if(!meta.waitlistId||!setupId)return new Response('Missing waitlist setup metadata',{status:400});
  const setup=await stripe.setupIntents.retrieve(setupId);const paymentMethod=typeof setup.payment_method==='string'?setup.payment_method:setup.payment_method?.id;if(!paymentMethod||typeof session.customer!=='string')return new Response('Missing payment method',{status:409});
  const {error}=await db.rpc('activate_auto_pay_waitlist',{p_waitlist:meta.waitlistId,p_buyer:meta.buyerId,p_customer:session.customer,p_payment_method:paymentMethod,p_setup_session:session.id});if(error){console.error(error);return new Response('Waitlist setup error',{status:409})}return new Response('ok');
 }
 async function fulfillResale(listingId:string){
  const {data,error}=await db.rpc('fulfill_ticket_resale',{p_listing:listingId,p_session:session.id,p_buyer:meta!.buyerId});if(error)throw error;
  const resale=Array.isArray(data)?data[0]:null;if(!resale?.original_checkout_session_id)throw Error('Original payment missing');
  const original=await stripe.checkout.sessions.retrieve(resale.original_checkout_session_id,{expand:['payment_intent.latest_charge']});
  const intent=original.payment_intent as Stripe.PaymentIntent|null,charge=typeof intent?.latest_charge==='string'?intent.latest_charge:intent?.latest_charge?.id;if(!charge)throw Error('Original charge missing');
  const refund=await stripe.refunds.create({charge,amount:resale.seller_refund_cents,reverse_transfer:true},{idempotencyKey:`ticket-resale-${listingId}`});
  const {error:refundError}=await db.rpc('mark_ticket_resale_refunded',{p_listing:listingId,p_refund:refund.id});if(refundError)throw refundError;
 }
 if(meta.kind==='ticket_resale'){
  if(!meta.resaleListingId)return new Response('Missing resale metadata',{status:400});
  try{await fulfillResale(meta.resaleListingId);return new Response('ok')}catch(resaleError){console.error('Resale fulfillment error',resaleError);return new Response('Resale fulfillment error',{status:409})}
 }
 if(meta.kind==='waitlist_manual'){
  if(!meta.waitlistId||!meta.resaleListings)return new Response('Missing waitlist metadata',{status:400});
  try{for(const listingId of JSON.parse(meta.resaleListings) as string[])await fulfillResale(listingId);const {error}=await db.rpc('mark_waitlist_fulfilled',{p_waitlist:meta.waitlistId});if(error)throw error;return new Response('ok')}catch(resaleError){console.error('Waitlist fulfillment error',resaleError);return new Response('Waitlist fulfillment error',{status:409})}
 }
 if(!meta.items)return new Response('Missing checkout items',{status:400});
 const items=JSON.parse(meta.items),resaleListings=meta.resaleListings?JSON.parse(meta.resaleListings) as string[]:[];
 if(items.length){const {error}=await db.rpc('fulfill_checkout',{p_session_id:session.id,p_buyer_id:meta.buyerId,p_items:items});if(error){console.error(error);return new Response('Fulfillment error',{status:409})}}
 try{for(const listingId of resaleListings)await fulfillResale(listingId)}catch(resaleError){console.error('Resale fulfillment error',resaleError);return new Response('Resale fulfillment error',{status:409})}
 return new Response('ok');
});

