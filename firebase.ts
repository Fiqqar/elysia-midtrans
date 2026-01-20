import admin from "firebase-admin";

admin.initializeApp({
    credential: admin.credential.cert(
        await Bun.file("./elysia-midtrans-firebase-adminsdk-fbsvc-7d71769c1b.json").json()
    )
})

export const db = admin.firestore();