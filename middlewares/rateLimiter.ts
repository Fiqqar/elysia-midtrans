import Elysia from "elysia";

const hitMap = new Map<string, number>()

export const rateLimiter = new Elysia().onRequest(({ request, set }) => {
    if (request.url.includes("/midtrans/callback")) return
    
    const ip = 
        request.headers.get("x-forwarded-for") ??
        request.headers.get("x-real-ip") ??
        "local"

    const now = Date.now()
    const lastHit = hitMap.get(ip) ?? 0

    if (now - lastHit < 800) {
        set.status = 429
        return { message: "too many requests" }
    }

    hitMap.set(ip, now)
})