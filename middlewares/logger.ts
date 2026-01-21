import Elysia from "elysia"

export const logger = new Elysia()
    .onRequest(({ request }) => {
        console.log(`[REQ] ${request.method} ${request.url}`)
    })
    .onAfterHandle(({ request, set }) => {
        console.log(`[RES] ${request.method} ${request.url} ${set.status}`)
    })
