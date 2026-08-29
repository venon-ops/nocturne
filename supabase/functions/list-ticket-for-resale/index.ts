import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  try{
    const authorization=req.headers.get('Authorization');if(!authorization)throw Error('Non authentifié');
    const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}}});const {data:{user}}=await db.auth.getUser();if(!user)throw Error('Non authentifié');
    const {ticketId}=await req.json(),{data:ticket}=await db.from('tickets').select('ticket_type_id').eq('id',ticketId).single();if(!ticket)throw Error('Billet introuvable');
    const {data,error}=await db.rpc('list_ticket_for_resale',{p_ticket:ticketId});if(error)throw error;
    const internalSecret=Deno.env.get('INTERNAL_FUNCTION_SECRET');if(internalSecret)await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/process-resale-waitlist`,{method:'POST',headers:{'Content-Type':'application/json','x-internal-secret':internalSecret},body:JSON.stringify({ticketTypeId:ticket.ticket_type_id})});
    return Response.json({listingId:data},{headers:corsHeaders});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Revente indisponible'},{status:400,headers:corsHeaders})}
});
