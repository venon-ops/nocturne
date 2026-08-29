import { describe, expect, it } from 'vitest';
import { isManifestPreparationDue, isTicketEntryOpen, MANIFEST_PREPARATION_LEAD_MS, mergePendingScans, type CachedEvent, type ManifestTicket } from './manifest';

const NOW=Date.parse('2026-08-28T18:00:00.000Z');

function event(startsAt:number,endsAt=startsAt+6*60*60*1000):CachedEvent{
  return {id:'event-1',title:'NOCTURNE',city:'Paris',starts_at:new Date(startsAt).toISOString(),ends_at:new Date(endsAt).toISOString(),status:'published'};
}

describe('automatic manifest preparation',()=>{
  it('starts exactly three hours before the event',()=>{
    expect(isManifestPreparationDue(event(NOW+MANIFEST_PREPARATION_LEAD_MS),NOW)).toBe(true);
    expect(isManifestPreparationDue(event(NOW+MANIFEST_PREPARATION_LEAD_MS+1),NOW)).toBe(false);
  });

  it('keeps preparing while the event is in progress',()=>{
    expect(isManifestPreparationDue(event(NOW-60_000,NOW+60_000),NOW)).toBe(true);
  });

  it('stops after the event and rejects invalid dates',()=>{
    expect(isManifestPreparationDue(event(NOW-120_000,NOW-1),NOW)).toBe(false);
    expect(isManifestPreparationDue({...event(NOW),starts_at:'invalid'},NOW)).toBe(false);
  });
});

describe('manifest refresh with pending offline scans',()=>{
  const tickets:ManifestTicket[]=[
    {ticket_hash:'pending',ticket_id:'1',public_code:'ONE',attendee_name:'Ada',ticket_status:'valid',entry_cutoff_at:null},
    {ticket_hash:'fresh',ticket_id:'2',public_code:'TWO',attendee_name:'Grace',ticket_status:'valid',entry_cutoff_at:null},
    {ticket_hash:'refunded',ticket_id:'3',public_code:'THREE',attendee_name:'Linus',ticket_status:'refunded',entry_cutoff_at:null},
  ];

  it('keeps locally scanned tickets used without changing the others',()=>{
    const merged=mergePendingScans(tickets,['pending']);
    expect(merged.map(ticket=>ticket.ticket_status)).toEqual(['used','valid','refunded']);
    expect(tickets[0].ticket_status).toBe('valid');
  });
});

describe('ticket entry cutoff',()=>{
  const ticket:ManifestTicket={ticket_hash:'hash',ticket_id:'1',public_code:'ONE',attendee_name:'Ada',ticket_status:'valid',entry_cutoff_at:new Date(NOW).toISOString()};
  it('closes entry exactly at the configured cutoff',()=>{
    expect(isTicketEntryOpen(ticket,NOW-1)).toBe(true);
    expect(isTicketEntryOpen(ticket,NOW)).toBe(false);
  });
});
