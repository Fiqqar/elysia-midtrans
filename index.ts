import Elysia from "elysia"
import cors from "@elysiajs/cors"
import { logger } from "./middlewares/logger"
import { rateLimiter } from "./middlewares/rateLimiter"
import { jsonGuard } from "./middlewares/jsonGuard"
import { snap } from "./midtrans"
import { db } from "./firebase"
import crypto from "crypto"

function verifySignature(body: any) {
    if (!body.order_id || !body.status_code || !body.gross_amount || !body.signature_key) {
        return false
    }

    const payload =
        body.order_id +
        body.status_code +
        body.gross_amount +
        process.env.MIDTRANS_SERVER_KEY

    const hash = crypto
        .createHash("sha512")
        .update(payload)
        .digest("hex")

    return hash === body.signature_key
}

const app = new Elysia()
    .use(logger)
    .use(rateLimiter)
    .use(jsonGuard)
    .use(cors())

    .post("/transaction", async ({ body, set }) => {
        try {
            const { orderId, amount, name, email } = body as {
                orderId: string
                amount: number
                name: string
                email: string
            }

            if (!orderId || !amount || amount <= 0 || !name || !email) {
                set.status = 400
                return { message: "invalid payload" }
            }

            const trx = await snap.createTransaction({
                transaction_details: {
                    order_id: orderId,
                    gross_amount: amount
                },
                customer_details: {
                    first_name: name,
                    email
                }
            })

            await db.collection("transactions").doc(orderId).set({
                orderId,
                amount,
                status: "pending",
                createdAt: new Date()
            })

            return { token: trx.token }

        } catch (err) {
            console.error("create transaction failed", err)
            set.status = 500
            return { message: "failed to create transaction" }
        }
    })


    .post("/midtrans/callback", async ({ body, set }) => {
        try {
            if (!verifySignature(body)) {
                set.status = 403
                return { message: "invalid signature" }
            }

            const {
                order_id,
                transaction_status,
                payment_type,
                transaction_time
            } = body as {
                order_id: string
                transaction_status: string
                payment_type?: string
                transaction_time?: string
            }

            const ref = db.collection("transactions").doc(order_id)
            const snapDoc = await ref.get()

            const data = {
                status: transaction_status,
                paymentType: payment_type ?? null,
                transactionTime: transaction_time ?? null,
                updatedAt: new Date()
            }

            if (!snapDoc.exists) {
                await ref.set({
                    orderId: order_id,
                    ...data,
                    createdAt: new Date()
                })
            } else {
                await ref.update(data)
            }

            return { message: "success" }

        } catch (err) {
            console.error("midtrans callback failed", err)
            set.status = 500
            return { message: "internal server error" }
        }
    })


    .listen(3000)

console.log(`Server running at http://localhost:${app.server?.port}`)
