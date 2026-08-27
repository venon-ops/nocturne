import Stripe from 'npm:stripe@17.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

type Item={ticketTypeId:string;quantity:number};
Deno.serve(async req=>{
 const stripe=new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);const signature=req.headers.get('stripe-signature');let event:Stripe.Event;
 try{event=stripe.webhooks.constructEvent(await req.text(),signature!,Deno.env.get('STRIPE_WEBHOOK_SECRET')!)}catch{return new Response('Bad signature',{status:400})}
 if(event.type!=='checkout.session.completed')return new Response('ok');
 const session=event.data.object as Stripe.Checkout.Session;const meta=session.metadata;if(!meta?.buyerId||!meta.items)return new Response('Missing metadata',{status:400});
 const items:Item[]=JSON.parse(meta.items);const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const {data:existing}=await db.from('orders').select('id').eq('stripe_checkout_session_id',session.id).maybeSingle();if(existing)return new Response('ok');
 const ids=items.map(item=>item.ticketTypeId);const {data:types}=await db.from('ticket_types').select('id,event_id,price_cents,quantity,sold_quantity').in('id',ids);if(!types||types.length!==items.length)return new Response('Ticket type missing',{status:409});
 for(const item of items){const type=types.find(row=>row.id===item.ticketTypeId);if(!type||type.sold_quantity+item.quantity>type.quantity)return new Response('Stock conflict',{status:409})}
 const total=items.reduce((sum,item)=>{const type=types.find(row=>row.id===item.ticketTypeId)!;return sum+type.price_cents*item.quantity},0);
 const {data:order,error:orderError}=await db.from('orders').insert({buyer_id:meta.buyerId,stripe_checkout_session_id:session.id,status:'paid',total_cents:total}).select().single();if(orderError)return new Response('Order error',{status:500});
 for(const item of items){const type=types.find(row=>row.id===item.ticketTypeId)!;const {data:updated}=await db.from('ticket_types').update({sold_quantity:type.sold_quantity+item.quantity}).eq('id',type.id).eq('sold_quantity',type.sold_quantity).select('id').maybeSingle();if(!updated){await db.from('orders').delete().eq('id',order.id);return new Response('Stock conflict',{status:409})}const {error:ticketError}=await db.from('tickets').insert(Array.from({length:item.quantity},()=>({order_id:order.id,ticket_type_id:type.id,event_id:type.event_id})));if(ticketError)return new Response('Ticket error',{status:500})}
 return new Response('ok');
});

