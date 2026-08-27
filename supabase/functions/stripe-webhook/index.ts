import Stripe from 'npm:stripe@17.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async req=>{
 const stripe=new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);const signature=req.headers.get('stripe-signature');let event:Stripe.Event;
 try{event=stripe.webhooks.constructEvent(await req.text(),signature!,Deno.env.get('STRIPE_WEBHOOK_SECRET')!)}catch{return new Response('Bad signature',{status:400})}
 if(event.type!=='checkout.session.completed')return new Response('ok');
 const session=event.data.object as Stripe.Checkout.Session;const meta=session.metadata;if(!meta?.buyerId||!meta.items)return new Response('Missing metadata',{status:400});
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const {error}=await db.rpc('fulfill_checkout',{p_session_id:session.id,p_buyer_id:meta.buyerId,p_items:JSON.parse(meta.items)});
 if(error){console.error(error);return new Response('Fulfillment error',{status:409})}
 return new Response('ok');
});

