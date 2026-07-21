import { initializeApp } from "firebase/app";
    import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    } from "firebase/auth";

    const firebaseConfig = {
    apiKey:            "AIzaSyAwZz4Uh-58zkZaCngm5gbhFbFDoTBq9Xc",
    authDomain:        "numcha-ace43.firebaseapp.com",
    projectId:         "numcha-ace43",
    storageBucket:     "numcha-ace43.firebasestorage.app",
    messagingSenderId: "1049771982197",
    appId:             "1:1049771982197:web:ff1132faefe7b4dc80273c",
    };

    export const firebaseApp   = initializeApp(firebaseConfig);
    export const firebaseAuth  = getAuth(firebaseApp);
    export const googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({ prompt: "select_account" });

    /**
    * Connexion Google — retourne le token OAuth Google (pas le token Firebase)
    * C'est ce token que Supabase attend dans signInWithIdToken
    */
    export async function signInWithGoogle(): Promise<string> {
    const result     = await signInWithPopup(firebaseAuth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const idToken    = credential?.idToken;
    if (!idToken) throw new Error("Impossible d'obtenir le token Google OAuth");
    return idToken;
    }

    /** Connexion email/mot de passe Firebase */
    export async function signInWithEmail(email: string, password: string): Promise<string> {
    const result  = await signInWithEmailAndPassword(firebaseAuth, email, password);
    const idToken = await result.user.getIdToken();
    return idToken;
    }

    /** Inscription email/mot de passe Firebase */
    export async function registerWithEmail(email: string, password: string): Promise<string> {
    const result  = await createUserWithEmailAndPassword(firebaseAuth, email, password);
    const idToken = await result.user.getIdToken();
    return idToken;
    }
    