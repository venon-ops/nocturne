import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as Network from 'expo-network';
import { supabase } from './supabase';
import { isManifestPreparationDue, isTicketEntryOpen, mergePendingScans, type CachedEvent, type ManifestTicket } from './manifest';

export { isManifestPreparationDue, MANIFEST_PREPARATION_LEAD_MS, type CachedEvent, type ManifestTicket } from './manifest';
export type OfflineScan={id:string;eventId:string;sessionId:string;ticketHash:string;scannedAt:string};
export type ActiveScanSession={id:string;eventId:string;eventTitle:string;label:string;startedAt:string;scannerId:string};
type EventCache={event:CachedEvent;tickets:ManifestTicket[];downloadedAt:string;baseCount:number};

const EVENTS_KEY='nocturne-scan:events';
const QUEUE_KEY='nocturne-scan:queue';
const ACTIVE_SESSION_KEY='nocturne-scan:active-session';
const eventKey=(eventId:string)=>`nocturne-scan:manifest:${eventId}`;
let syncInFlight:Promise<SyncResult>|null=null;

type SyncResult={synced:number;conflicts:number;pending:number;error:string|null};

async function readJson<T>(key:string,fallback:T):Promise<T>{const value=await AsyncStorage.getItem(key);if(!value)return fallback;try{return JSON.parse(value) as T}catch{return fallback}}

export async function isOnline(){const state=await Network.getNetworkStateAsync();return Boolean(state.isConnected&&state.isInternetReachable===true)}
export async function cacheEvents(events:CachedEvent[]){await AsyncStorage.setItem(EVENTS_KEY,JSON.stringify(events))}
export async function getCachedEvents(){return readJson<CachedEvent[]>(EVENTS_KEY,[])}
export async function getEventCache(eventId:string){return readJson<EventCache|null>(eventKey(eventId),null)}
export async function getCachedActiveSession(scannerId:string){const session=await readJson<ActiveScanSession|null>(ACTIVE_SESSION_KEY,null);return session?.scannerId===scannerId?session:null}
export async function cacheActiveSession(session:ActiveScanSession){await AsyncStorage.setItem(ACTIVE_SESSION_KEY,JSON.stringify(session))}
export async function clearActiveSession(){await AsyncStorage.removeItem(ACTIVE_SESSION_KEY)}

export async function downloadManifest(event:CachedEvent){
  const [{data,error},{count}]=await Promise.all([supabase.rpc('get_offline_ticket_manifest',{p_event:event.id}),supabase.from('check_ins').select('id',{count:'exact',head:true}).eq('event_id',event.id)]);
  if(error)throw error;
  const pending=await readJson<OfflineScan[]>(QUEUE_KEY,[]);
  const tickets=mergePendingScans((data??[]) as ManifestTicket[],pending.filter(item=>item.eventId===event.id).map(item=>item.ticketHash));
  const cache:EventCache={event,tickets,downloadedAt:new Date().toISOString(),baseCount:count??0};
  await AsyncStorage.setItem(eventKey(event.id),JSON.stringify(cache));
  return cache;
}

export async function prepareDueManifests(events:CachedEvent[],now=Date.now()){
  const due=events.filter(event=>isManifestPreparationDue(event,now));
  const results=await Promise.allSettled(due.map(event=>downloadManifest(event)));
  return results.reduce<{prepared:EventCache[];failed:string[]}>((summary,result,index)=>{
    if(result.status==='fulfilled')summary.prepared.push(result.value);
    else summary.failed.push(due[index].id);
    return summary;
  },{prepared:[],failed:[]});
}

export async function hashToken(token:string){return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,token)}

async function validateCachedTicket(cache:EventCache,eventId:string,sessionId:string,ticket:ManifestTicket|undefined){
  if(!ticket)return {type:'invalid' as const,name:null};
  if(!isTicketEntryOpen(ticket))return {type:'entry_closed' as const,name:ticket.attendee_name};
  if(ticket.ticket_status==='used')return {type:'already_used' as const,name:ticket.attendee_name};
  if(ticket.ticket_status!=='valid')return {type:'invalid' as const,name:ticket.attendee_name};
  ticket.ticket_status='used';await AsyncStorage.setItem(eventKey(eventId),JSON.stringify(cache));
  const queue=await readJson<OfflineScan[]>(QUEUE_KEY,[]);queue.push({id:`${eventId}:${ticket.ticket_hash}`,eventId,sessionId,ticketHash:ticket.ticket_hash,scannedAt:new Date().toISOString()});await AsyncStorage.setItem(QUEUE_KEY,JSON.stringify(queue));
  return {type:'accepted' as const,name:ticket.attendee_name};
}

export async function validateOffline(eventId:string,sessionId:string,token:string){
  const cache=await getEventCache(eventId);if(!cache)return {type:'offline_unavailable' as const,name:null};
  const ticketHash=await hashToken(token);
  return validateCachedTicket(cache,eventId,sessionId,cache.tickets.find(item=>item.ticket_hash===ticketHash));
}

export async function validateOfflinePublicCode(eventId:string,sessionId:string,publicCode:string){
  const cache=await getEventCache(eventId);if(!cache)return {type:'offline_unavailable' as const,name:null};
  return validateCachedTicket(cache,eventId,sessionId,cache.tickets.find(item=>item.public_code===publicCode));
}

export async function pendingCount(eventId?:string){const queue=await readJson<OfflineScan[]>(QUEUE_KEY,[]);return eventId?queue.filter(item=>item.eventId===eventId).length:queue.length}

async function runPendingSync():Promise<SyncResult>{
  const queue=await readJson<OfflineScan[]>(QUEUE_KEY,[]);
  if(!queue.length)return {synced:0,conflicts:0,pending:0,error:null as string|null};
  const {data:{session}}=await supabase.auth.getSession();
  if(!session)return {synced:0,conflicts:0,pending:queue.length,error:'Session expirée'};
  const remaining:OfflineScan[]=[];let synced=0;let conflicts=0;let lastError:string|null=null;
  for(const item of queue){
    const {data,error}=item.sessionId
      ?await supabase.rpc('sync_offline_ticket_scan_for_session',{p_ticket_hash:item.ticketHash,p_event:item.eventId,p_session:item.sessionId,p_scanned_at:item.scannedAt})
      :await supabase.rpc('sync_offline_ticket_scan',{p_ticket_hash:item.ticketHash,p_event:item.eventId,p_scanner:session.user.id,p_scanned_at:item.scannedAt});
    if(error){remaining.push(item);lastError=error.message;continue}
    const response=Array.isArray(data)?data[0]:null;
    if(response?.result==='accepted')synced++;else conflicts++;
  }
  await AsyncStorage.setItem(QUEUE_KEY,JSON.stringify(remaining));
  return {synced,conflicts,pending:remaining.length,error:lastError};
}

export function syncPending(){
  if(syncInFlight)return syncInFlight;
  syncInFlight=runPendingSync().finally(()=>{syncInFlight=null});
  return syncInFlight;
}
