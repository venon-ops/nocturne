import Stripe from 'npm:stripe@17.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async req=>{
  try{
    const secret=req.headers.get('x-internal-secret');if(!secret||secret!==Deno.env.get('INTERNAL_FUNCTION_SECRET'))return new Response('Unauthorized',{status:401});
    const body=await req.json().catch(()=>({})) as {ticketTypeId?:string};
    const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!),stripe=new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
    let ticketTypeIds:string[];
    if(body.ticketTypeId)ticketTypeIds=[body.ticketTypeId];
    else{
      const {data,error}=await admin.from('ticket_resale_waitlist').select('ticket_type_id').in('status',['active','reserved','action_required']);
      if(error)throw error;
      ticketTypeIds=[...new Set((data??[]).map(row=>row.ticket_type_id as string))];
    }
    let processed=0;
    for(const ticketTypeId of ticketTypeIds){
      while(true){
        const {data,error}=await admin.rpc('reserve_next_waitlist_batch',{p_ticket_type:ticketTypeId});if(error)throw error;const batch=Array.isArray(data)?data[0]:null;if(!batch)break;
        processed++;
        if(batch.mode==='notification')continue;
        try{
          const intent=await stripe.paymentIntents.create({amount:batch.price_cents,currency:'eur',customer:batch.stripe_customer_id,payment_method:batch.stripe_payment_method_id,off_session:true,confirm:true,application_fee_amount:batch.fee_cents,transfer_data:{destination:batch.organizer_stripe_account_id},metadata:{kind:'waitlist_auto_pay',waitlistId:batch.waitlist_id,buyerId:batch.buyer_id,resaleListings:JSON.stringify(batch.listing_ids)}},{idempotencyKey:`waitlist-${batch.waitlist_id}-${batch.listing_ids.join('-')}`});
          await admin.rpc('attach_waitlist_payment',{p_waitlist:batch.waitlist_id,p_payment_intent:intent.id});
          if(intent.status==='requires_action'||intent.status==='requires_payment_method')await admin.rpc('mark_waitlist_action_required',{p_waitlist:batch.waitlist_id});
        }catch(paymentError){
          const intent=(paymentError as {payment_intent?:{id?:string}}).payment_intent;if(intent?.id)await admin.rpc('attach_waitlist_payment',{p_waitlist:batch.waitlist_id,p_payment_intent:intent.id});await admin.rpc('mark_waitlist_action_required',{p_waitlist:batch.waitlist_id});
        }
      }
    }
    return Response.json({ok:true,ticketTypes:ticketTypeIds.length,processed});
  }catch(error){console.error(error);return new Response('Waitlist processing error',{status:409})}
});
