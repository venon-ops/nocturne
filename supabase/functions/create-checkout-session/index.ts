import Stripe from 'npm:stripe@17.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

type Item={ticketTypeId:string;quantity:number};
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
 try{
  const auth=req.headers.get('Authorization');if(!auth)throw Error('Non authentifié');
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}}});
  const {data:{user}}=await db.auth.getUser();if(!user)throw Error('Non authentifié');
  const {data:profile}=await db.from('profiles').select('role').eq('id',user.id).single();
  if(profile?.role!=='user')throw Error('Les comptes organisation ne peuvent pas acheter de billets');
  const body=await req.json();const items:Item[]=Array.isArray(body.items)?body.items:[{ticketTypeId:body.ticketTypeId,quantity:body.quantity??1}];
  if(!items.length||items.some(item=>!item.ticketTypeId||!Number.isInteger(item.quantity)||item.quantity<1)||items.reduce((sum,item)=>sum+item.quantity,0)>10)throw Error('Sélection invalide');
  const ids=items.map(item=>item.ticketTypeId);const {data:types}=await db.from('ticket_types').select('id,name,price_cents,quantity,sold_quantity,event_id,events!inner(id,slug,title,organizer_id,status)').in('id',ids);
  if(!types||types.length!==items.length)throw Error('Billet indisponible');
  const firstEvent=(types[0] as any).events;if(types.some((type:any)=>type.event_id!==firstEvent.id||type.events.status!=='published'))throw Error('Sélection invalide');
  for(const item of items){const type:any=types.find(row=>row.id===item.ticketTypeId);if(!type||type.sold_quantity+item.quantity>type.quantity)throw Error('Une phase n’est plus disponible')}
  const stripeKey=Deno.env.get('STRIPE_SECRET_KEY');if(!stripeKey)throw Error('Configuration Stripe manquante : STRIPE_SECRET_KEY');const publishableKey=Deno.env.get('STRIPE_PUBLISHABLE_KEY');if(!publishableKey)throw Error('Configuration Stripe manquante : STRIPE_PUBLISHABLE_KEY');const appUrl=Deno.env.get('APP_URL');if(!appUrl)throw Error('Configuration Stripe manquante : APP_URL');const stripe=new Stripe(stripeKey);const {data:org}=await db.from('organizer_profiles').select('stripe_account_id').eq('profile_id',firstEvent.organizer_id).single();
  const total=items.reduce((sum,item)=>{const type:any=types.find(row=>row.id===item.ticketTypeId);return sum+type.price_cents*item.quantity},0);
  const session=await stripe.checkout.sessions.create({ui_mode:'embedded',redirect_on_completion:'if_required',return_url:appUrl+'/tickets?success=1',mode:'payment',customer_email:user.email,line_items:items.map(item=>{const type:any=types.find(row=>row.id===item.ticketTypeId);return{price_data:{currency:'eur',unit_amount:type.price_cents,product_data:{name:`${firstEvent.title} — ${type.name}`}},quantity:item.quantity}}),metadata:{items:JSON.stringify(items),buyerId:user.id,eventId:firstEvent.id},payment_intent_data:org?.stripe_account_id?{application_fee_amount:Math.round(total*.08),transfer_data:{destination:org.stripe_account_id}}:undefined});
  return Response.json({clientSecret:session.client_secret,publishableKey},{headers:corsHeaders});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Erreur de paiement'},{status:400,headers:corsHeaders})}
});


