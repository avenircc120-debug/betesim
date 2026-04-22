import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPopup,
  signInWithPhoneNumber,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
  type ConfirmationResult,
} from "firebase/auth";

// Firebase config — clés publiques par nature (sécurisées par les règles Firebase + domaines autorisés)
const firebaseConfig = {
  apiKey: "AIzaSyCjUOf5xmNlAB4vqbKmSy9wZxR24PqoKmE",
  authDomain: "pireel-91ff2.firebaseapp.com",
  projectId: "pireel-91ff2",
  storageBucket: "pireel-91ff2.firebasestorage.app",
  messagingSenderId: "348625671997",
  appId: "1:348625671997:web:2ad544f6f8bc20fbdf1754",
  measurementId: "G-RMZ7P98J7G",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("email");
googleProvider.addScope("profile");

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function sendPhoneOTP(
  phone: string,
  recaptchaVerifier: RecaptchaVerifier
): Promise<ConfirmationResult> {
  return signInWithPhoneNumber(auth, phone, recaptchaVerifier);
}

export async function signOutUser(): Promise<void> {
  await firebaseSignOut(auth);
}

export { onAuthStateChanged, RecaptchaVerifier };
export type { User, ConfirmationResult };
