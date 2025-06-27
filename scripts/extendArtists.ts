import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as serviceAccount from './serviceAccountKey.json';

initializeApp({
  credential: cert(serviceAccount as any),
});

const db = getFirestore();

async function extendArtistDocs() {
  const snapshot = await db.collection('users').where('role', '==', 'artist').get();

  if (snapshot.empty) {
    console.log('❌ No artist users found.');
    return;
  }

  const batch = db.batch();

  snapshot.docs.forEach((doc) => {
    const userRef = db.collection('users').doc(doc.id);
    const data = doc.data();

    const updates: any = {
      paymentType: data.paymentType ?? 'external',
      finalPaymentTiming: data.finalPaymentTiming ?? 'before',
      depositPolicy: data.depositPolicy ?? {
        depositRequired: true,
        amount: 100,
        nonRefundable: true,
      },
    };

    // Upgrade flat field to structured object if it exists
    if (data.externalPaymentMethod && typeof data.externalPaymentMethod === 'string') {
      updates.externalPaymentDetails = {
        method: data.externalPaymentMethod,
        handle: "", // optional: migrate from another known field
      };
      updates.externalPaymentMethod = FieldValue.delete(); // delete old string field
    }

    // Ensure new structure exists if not already set
    if (!data.externalPaymentDetails) {
      updates.externalPaymentDetails = {
        method: "",
        handle: "",
      };
    }

    batch.update(userRef, updates);
  });

  await batch.commit();
  console.log(`✅ Successfully updated ${snapshot.docs.length} artist documents.`);
}

extendArtistDocs().catch(console.error);
