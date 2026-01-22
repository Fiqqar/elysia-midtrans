import Elysia from "elysia"
import cors from "@elysiajs/cors"
import { logger } from "./middlewares/logger"
import { rateLimiter } from "./middlewares/rateLimiter"
import { jsonGuard } from "./middlewares/jsonGuard"
import { snap } from "./midtrans"
import { db } from "./firebase"
import crypto from "crypto"

const ALLOWED_STATUS = [
    "pending",
    "capture",
    "settlement",
    "deny",
    "cancel",
    "expire",
    "refund"
]

if (!process.env.MIDTRANS_SERVER_KEY) throw new Error("MIDTRANS_SERVER_KEY not set")
if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY not set")

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

    .post("/transaction", async ({ body, set, store, request }) => {
        try {
            const s = store as any

            console.log(
                `[TRANSACTION][START][${s.reqId}] ${request.method} ${request.url}`
            )

            const payload = body as {
                orderId: string
                amount: number
                name: string
                email: string
            }

            console.log(
                `[TRANSACTION][PAYLOAD][${s.reqId}]`,
                {
                    orderId: payload.orderId,
                    amount: payload.amount
                }
            )

            const { orderId, amount, name, email } = payload

            if (!orderId || !amount || amount <= 0 || !name || !email) {
                console.warn(
                    `[TRANSACTION][INVALID_PAYLOAD][${s.reqId}]`,
                    payload
                )
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

            console.log(
                `[TRANSACTION][CREATED][${s.reqId}]`,
                orderId
            )

            return { token: trx.token }

        } catch (err) {
            console.error(
                `[TRANSACTION][ERROR]`,
                err
            )
            set.status = 500
            return { message: "failed to create transaction" }
        }
    })



    .post("/midtrans/callback", async ({ body, set, store, request }) => {
        try {
            const s = store as any

            console.log(
                `[MIDTRANS][CALLBACK][${s.reqId}] ${request.method} ${request.url}`
            )

            const payload = body as {
                order_id: string
                transaction_status: string
                payment_type?: string
                transaction_time?: string
                status_code?: string
                gross_amount?: string
                signature_key?: string
            }

            console.log(
                `[MIDTRANS][PAYLOAD][${s.reqId}]`,
                {
                    order_id: payload.order_id,
                    transaction_status: payload.transaction_status,
                    payment_type: payload.payment_type
                }
            )

            if (!verifySignature(payload)) {
                console.warn(
                    `[MIDTRANS][INVALID_SIGNATURE][${s.reqId}]`,
                    payload.order_id
                )
                set.status = 403
                return { message: "invalid signature" }
            }

            const {
                order_id,
                transaction_status,
                payment_type,
                transaction_time
            } = payload

            if (!ALLOWED_STATUS.includes(transaction_status)) {
                console.warn(
                    `[MIDTRANS][INVALID_STATUS][${s.reqId}]`,
                    transaction_status
                )
                set.status = 400
                return { message: "invalid transaction status" }
            }

            const ref = db.collection("transactions").doc(order_id)
            const snapDoc = await ref.get()

            const data = {
                status: transaction_status,
                paymentType: payment_type ?? null,
                transactionTime: transaction_time ?? null,
                updatedAt: new Date()
            }

            if (snapDoc.exists) {
                const currentStatus = snapDoc.data()?.status
                if (currentStatus === transaction_status) {
                    console.log(
                        `[MIDTRANS][DUPLICATE][${s.reqId}]`,
                        order_id,
                        transaction_status
                    )
                    return { message: "ignored duplicate callback" }
                }

                await ref.update(data)

                console.log(
                    `[MIDTRANS][UPDATED][${s.reqId}]`,
                    order_id,
                    transaction_status
                )
            } else {
                await ref.set({
                    orderId: order_id,
                    ...data,
                    createdAt: new Date()
                })

                console.log(
                    `[MIDTRANS][CREATED][${s.reqId}]`,
                    order_id,
                    transaction_status
                )
            }

            return { message: "success" }

        } catch (err) {
            console.error("[MIDTRANS][ERROR]", err)
            set.status = 500
            return { message: "internal server error" }
        }
    })



    .onError((err) => {
        console.error("[GLOBAL ERROR]", err)
        return { message: "internal server error" }
    })

    .listen(3000)

console.log(`Server running at http://localhost:${app.server?.port}`)
