import Elysia from "elysia"
import crypto from "crypto"

export const logger = new Elysia()
    .onRequest(({ request, store }) => {
        const s = store as any
        const reqId = crypto.randomUUID()
        s.reqId = reqId
        console.log(`[REQ][${reqId}] ${request.method} ${request.url}`)
    })
    .onAfterHandle(({ request, set, store }) => {
        const s = store as any
        console.log(`[RES][${s.reqId}] ${request.method} ${request.url} ${set.status}`)
    })
