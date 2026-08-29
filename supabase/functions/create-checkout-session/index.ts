import Stripe from 'npm:stripe@17.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

type Item={ticketTypeId:string;quantity:number};
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
 let reservations:{listingId:string;buyerId:string}[]=[],admin:ReturnType<typeof createClient>|undefined;
 try{
  const auth=req.headers.get('Authorization');if(!auth)throw Error('Non authentifié');
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}}});
  const {data:{user}}=await db.auth.getUser();if(!user)throw Error('Non authentifié');
  const {data:profile}=await db.from('profiles').select('role').eq('id',user.id).single();
  if(profile?.role!=='user')throw Error('Les comptes organisation ne peuvent pas acheter de billets');
  const body=await req.json();const items:Item[]=Array.isArray(body.items)?body.items:[{ticketTypeId:body.ticketTypeId,quantity:body.quantity??1}];
  if(!items.length||items.some(item=>!item.ticketTypeId||!Number.isInteger(item.quantity)||item.quantity<1)||items.reduce((sum,item)=>sum+item.quantity,0)>10)throw Error('Sélection invalide');
  const ids=items.map(item=>item.ticketTypeId);let {data:types}=await db.from('ticket_types').select('id,name,price_cents,quantity,sold_quantity,sales_cutoff_at,event_id,events!inner(id,slug,title,organizer_id,status)').in('id',ids);
  if(!types||types.length!==items.length)throw Error('Billet indisponible');
  const firstEvent=(types[0] as any).events;if(types.some((type:any)=>type.event_id!==firstEvent.id||type.events.status!=='published'))throw Error('Sélection invalide');
  admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const {error:rolloverError}=await admin.rpc('rollover_expired_ticket_phase_capacity',{p_event:firstEvent.id});if(rolloverError)throw rolloverError;
  const refreshed=await db.from('ticket_types').select('id,name,price_cents,quantity,sold_quantity,sales_cutoff_at,event_id,events!inner(id,slug,title,organizer_id,status)').in('id',ids);if(refreshed.error||!refreshed.data)throw Error('Billet indisponible');types=refreshed.data;
  if(types.some((type:any)=>new Date(type.sales_cutoff_at)<=new Date()))throw Error('La vente de cette phase est terminée');
  const primaryItems:Item[]=[],resaleListings:{listingId:string;feeCents:number}[]=[];
  for(const item of items){const type:any=types.find(row=>row.id===item.ticketTypeId);const {data:reserved,error:reserveError}=await admin.rpc('reserve_public_ticket_resales',{p_ticket_type:item.ticketTypeId,p_buyer:user.id,p_quantity:item.quantity});if(reserveError)throw reserveError;for(const listing of reserved??[]){resaleListings.push({listingId:listing.listing_id,feeCents:listing.fee_cents});reservations.push({listingId:listing.listing_id,buyerId:user.id})}const remaining=item.quantity-(reserved?.length??0);if(type.sold_quantity+remaining>type.quantity)throw Error('Une phase n’est plus disponible');if(remaining)primaryItems.push({ticketTypeId:item.ticketTypeId,quantity:remaining})}
  const stripeKey=Deno.env.get('STRIPE_SECRET_KEY');if(!stripeKey)throw Error('Configuration Stripe manquante : STRIPE_SECRET_KEY');const publishableKey=Deno.env.get('STRIPE_PUBLISHABLE_KEY');if(!publishableKey)throw Error('Configuration Stripe manquante : STRIPE_PUBLISHABLE_KEY');const appUrl=Deno.env.get('APP_URL');if(!appUrl)throw Error('Configuration Stripe manquante : APP_URL');const stripe=new Stripe(stripeKey);const {data:org}=await admin.from('organizer_profiles').select('stripe_account_id,onboarding_complete,primary_fee_bps,primary_fee_min_cents').eq('profile_id',firstEvent.organizer_id).single();if(!org?.stripe_account_id||!org.onboarding_complete)throw Error('Le compte Stripe de l’organisation n’est pas opérationnel');
  const primaryFee=primaryItems.reduce((sum,item)=>{const type:any=types.find(row=>row.id===item.ticketTypeId),feePerTicket=Math.min(type.price_cents,Math.max(Math.round(type.price_cents*(org.primary_fee_bps??350)/10000),org.primary_fee_min_cents??49));return sum+feePerTicket*item.quantity},0),applicationFee=primaryFee+resaleListings.reduce((sum,item)=>sum+item.feeCents,0);
  const session=await stripe.checkout.sessions.create({ui_mode:'embedded',redirect_on_completion:'if_required',return_url:appUrl+'/tickets?success=1',mode:'payment',payment_method_types:['card'],customer_email:user.email,line_items:items.map(item=>{const type:any=types.find(row=>row.id===item.ticketTypeId);return{price_data:{currency:'eur',unit_amount:type.price_cents,product_data:{name:`${firstEvent.title} — ${type.name}`}},quantity:item.quantity}}),metadata:{items:JSON.stringify(primaryItems),resaleListings:JSON.stringify(resaleListings.map(item=>item.listingId)),buyerId:user.id,eventId:firstEvent.id},payment_intent_data:{application_fee_amount:applicationFee,transfer_data:{destination:org.stripe_account_id}}});
  for(const reservation of reservations){const {error:attachError}=await admin.rpc('attach_resale_checkout',{p_listing:reservation.listingId,p_buyer:user.id,p_session:session.id});if(attachError){await stripe.checkout.sessions.expire(session.id);throw attachError}}
  return Response.json({clientSecret:session.client_secret,publishableKey},{headers:corsHeaders});
 }catch(error){if(admin)for(const reservation of reservations)await admin.rpc('release_resale_reservation',{p_listing:reservation.listingId,p_buyer:reservation.buyerId});return Response.json({error:error instanceof Error?error.message:'Erreur de paiement'},{status:400,headers:corsHeaders})}
});


