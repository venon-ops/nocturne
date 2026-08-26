import { describe, expect, it } from 'vitest'; import { canBuy, qrPayload } from './ticketing';
describe('ticketing',()=>{it('refuses invalid stock requests',()=>{expect(canBuy(1,2)).toBe(false);expect(canBuy(10,0)).toBe(false);expect(canBuy(10,1.5)).toBe(false)});it('uses a namespaced QR payload',()=>expect(qrPayload('abc')).toBe('nocturne:ticket:abc'))});
