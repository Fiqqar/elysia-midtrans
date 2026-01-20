import Elysia from "elysia"
import cors from "@elysiajs/cors"
import { snap } from "./midtrans"
import { db } from "./firebase"

const app = new Elysia()
    .use(cors())

    .post("/transaction", async ({ body, set }) => {
        const { orderId, amount, name, email } = body as {
            orderId: string
            amount: number
            name: string
            email: string
        }

        if (!orderId || !amount || amount <= 0) {
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

        db.collection("transactions").doc(orderId).set({
            orderId,
            amount,
            status: "pending",
            createdAt: new Date()
        }).catch(console.error)

        return {
            token: trx.token
        }
    })

    .post("/midtrans/callback", async ({ body }) => {
        const { order_id, transaction_status } = body as {
            order_id: string
            transaction_status: string
        }

        const ref = db.collection("transactions").doc(order_id)
        const snapDoc = await ref.get()

        if (!snapDoc.exists) {
            await ref.set({
                orderId: order_id,
                status: transaction_status,
                createdAt: new Date()
            })
            return "ok"
        }

        await ref.update({
            status: transaction_status,
            updatedAt: new Date()
        })

        return "ok"
    })

    .listen(3000)

console.log(`Server running at http://localhost:${app.server?.port}`)
