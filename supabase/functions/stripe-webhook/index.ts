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
 if(event.type!=='checkout.session.completed')return new Response('ok');
 const session=event.data.object as Stripe.Checkout.Session;const meta=session.metadata;if(!meta?.buyerId||!meta.items)return new Response('Missing metadata',{status:400});
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const {error}=await db.rpc('fulfill_checkout',{p_session_id:session.id,p_buyer_id:meta.buyerId,p_items:JSON.parse(meta.items)});
 if(error){console.error(error);return new Response('Fulfillment error',{status:409})}
 return new Response('ok');
});

