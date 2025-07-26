// utils/syncGoogleAvatar.ts
import { getAuth } from "firebase/auth";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getFirestore, doc, getDoc, updateDoc } from "firebase/firestore";

export const syncGoogleAvatar = async () => {
  const auth = getAuth();
  const storage = getStorage();
  const db = getFirestore();

  const user = auth.currentUser;
  if (!user || !user.photoURL) return;

  try {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;

    const userData = userSnap.data();
    const currentAvatar = userData?.avatarUrl || "";

    // If Firestore avatar matches Google photoURL, skip update
    if (currentAvatar.includes(user.photoURL)) return;

    // Download the Google avatar
    const response = await fetch(user.photoURL);
    const blob = await response.blob();

    // Upload to Storage
    const avatarRef = ref(storage, `avatars/${user.uid}/profile.jpg`);
    await uploadBytes(avatarRef, blob);

    // Get the hosted URL
    const newUrl = await getDownloadURL(avatarRef);

    // Only update if actually different
    if (newUrl !== currentAvatar) {
      await updateDoc(userRef, { avatarUrl: newUrl });
      console.log(`Synced new avatar for ${user.uid}`);
    }
  } catch (err) {
    console.error("Error syncing Google avatar:", err);
  }
};
