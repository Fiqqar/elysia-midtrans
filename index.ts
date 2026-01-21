import Elysia from "elysia"
import cors from "@elysiajs/cors"
import { snap } from "./midtrans"
import { db } from "./firebase"
import crypto from "crypto"

function verifySignature(body: any) {
    if (!body.order_id || !body.status_code || !body.gross_amount || !body.signature_key) {
        console.warn("Signature verification failed: missing fields", body)
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

async function safeSetDoc(ref: any, data: any, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            await ref.set(data)
            return true
        } catch (err) {
            console.error(`Firestore set attempt ${i + 1} failed`, err)
            if (i === retries - 1) throw err
        }
    }
}

async function safeUpdateDoc(ref: any, data: any, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            await ref.update(data)
            return true
        } catch (err) {
            console.error(`Firestore update attempt ${i + 1} failed`, err)
            if (i === retries - 1) throw err
        }
    }
}

const app = new Elysia()
    .use(cors())

    .post("/transaction", async ({ body, set }) => {
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

        try {
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

            const ref = db.collection("transactions").doc(orderId)
            await safeSetDoc(ref, {
                orderId,
                amount,
                status: "pending",
                createdAt: new Date()
            })

            return {
                token: trx.token
            }
        } catch (err) {
            console.error("Transaction creation failed", err)
            set.status = 500
            return { message: "failed to create transaction" }
        }
    })

    .post("/midtrans/callback", async ({ body, set }) => {
        if (!verifySignature(body)) {
            set.status = 403
            return "invalid signature"
        }

        const { order_id, transaction_status } = body as {
            order_id: string
            transaction_status: string
        }

        const ref = db.collection("transactions").doc(order_id)
        try {
            const snapDoc = await ref.get()

            if (!snapDoc.exists) {
                await safeSetDoc(ref, {
                    orderId: order_id,
                    status: transaction_status,
                    createdAt: new Date()
                })
            } else {
                const prevStatus = snapDoc.data()?.status
                if (prevStatus !== transaction_status) {
                    console.log(`Transaction ${order_id} status changed: ${prevStatus} → ${transaction_status}`)
                }
                await safeUpdateDoc(ref, {
                    status: transaction_status,
                    updatedAt: new Date()
                })
            }
            return "ok"
        } catch (err) {
            console.error("Failed to update transaction", err)
            set.status = 500
            return "error"
        }
    })

    .listen(3000)

console.log(`Server running at http://localhost:${app.server?.port}`)
