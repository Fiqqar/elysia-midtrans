import { isProduction } from "elysia/error"
import midtransClient from "midtrans-client"

export const snap = new midtransClient.Snap({
    isProduction : false,
    serverKey : process.env.MIDTRANS_SERVER_KEY
})