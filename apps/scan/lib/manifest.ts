export type CachedEvent={id:string;title:string;city:string;starts_at:string;ends_at:string;status:string};
export type ManifestTicket={ticket_hash:string;ticket_id:string;public_code:string;attendee_name:string|null;ticket_status:'valid'|'used'|'cancelled'|'refunded';entry_cutoff_at:string|null};

export const MANIFEST_PREPARATION_LEAD_MS=3*60*60*1000;

export function isManifestPreparationDue(event:CachedEvent,now=Date.now()){
  const startsAt=new Date(event.starts_at).getTime();
  const endsAt=new Date(event.ends_at).getTime();
  return Number.isFinite(startsAt)&&Number.isFinite(endsAt)&&startsAt<=now+MANIFEST_PREPARATION_LEAD_MS&&endsAt>=now;
}

export function mergePendingScans(tickets:ManifestTicket[],pendingTicketHashes:Iterable<string>){
  const locallyUsed=new Set(pendingTicketHashes);
  return tickets.map(ticket=>locallyUsed.has(ticket.ticket_hash)?{...ticket,ticket_status:'used' as const}:ticket);
}

export function isTicketEntryOpen(ticket:ManifestTicket,now=Date.now()){
  return !ticket.entry_cutoff_at||new Date(ticket.entry_cutoff_at).getTime()>now;
}
