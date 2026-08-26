export function canBuy(stock: number, requested: number) { return Number.isInteger(requested) && requested > 0 && requested <= 10 && stock >= requested; }
export function qrPayload(token: string) { return `nocturne:ticket:${token}`; }
