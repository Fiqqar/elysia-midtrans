import Elysia from "elysia";

export const jsonGuard = new Elysia().onRequest(({request, set}) => {
    if (request.url.includes("/midtrans/callback")) return
    if (request.method === "POST" && !request.headers.get("content-type")?.includes("application/json")) {
        set.status = 415
        return { message: "invalid content type" }
    }
})