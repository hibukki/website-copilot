import { doc, getDoc, setDoc, Timestamp, onSnapshot } from "firebase/firestore";
import type { Unsubscribe } from "firebase/firestore";
import { db } from "./firebaseConfig"; // Your Firebase db instance
import type { JSONContent } from "@tiptap/react"; // Changed to type-only import

const DOCUMENT_COLLECTION = "documents";
const SHARED_DOCUMENT_ID = "sharedDoc";

interface FirestoreDoc {
  content: JSONContent;
  lastUpdated: Timestamp;
}

/**
 * Loads the shared document from Firestore.
 * @returns The document content (JSONContent) or null if not found or error.
 */
export const loadDocumentFromFirestore =
  async (): Promise<JSONContent | null> => {
    try {
      const docRef = doc(db, DOCUMENT_COLLECTION, SHARED_DOCUMENT_ID);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data() as FirestoreDoc;
        console.log("[FirestoreService] Document loaded:", data);
        return data.content;
      } else {
        console.log("[FirestoreService] No such document!");
        return null;
      }
    } catch (error) {
      console.error("[FirestoreService] Error loading document:", error);
      return null;
    }
  };

/**
 * Sets up a real-time listener for the shared document in Firestore.
 * @param onUpdate A callback function that will be invoked with the JSONContent
 *                 when the document changes, or null if it doesn't exist.
 * @returns An unsubscribe function to detach the listener.
 */
export const listenToDocumentInFirestore = (
  onUpdate: (content: JSONContent | null) => void
): Unsubscribe => {
  const docRef = doc(db, DOCUMENT_COLLECTION, SHARED_DOCUMENT_ID);

  const unsubscribe = onSnapshot(
    docRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as FirestoreDoc;
        console.log("[FirestoreService] Document snapshot received:", data);
        onUpdate(data.content);
      } else {
        console.log("[FirestoreService] Document snapshot: No such document!");
        onUpdate(null); // Document doesn't exist or was deleted
      }
    },
    (error) => {
      console.error("[FirestoreService] Error listening to document:", error);
      // Optionally, call onUpdate with an error indicator or null
      onUpdate(null);
    }
  );

  return unsubscribe;
};

/**
 * Saves the document content to Firestore.
 * @param content The Tiptap document content (JSONContent).
 */
export const saveDocumentToFirestore = async (
  content: JSONContent
): Promise<void> => {
  try {
    const docRef = doc(db, DOCUMENT_COLLECTION, SHARED_DOCUMENT_ID);
    const dataToSave: FirestoreDoc = {
      content,
      lastUpdated: Timestamp.now(),
    };
    await setDoc(docRef, dataToSave); // Using setDoc without merge should be fine as we replace the whole content
    console.log("[FirestoreService] Document saved.");
  } catch (error) {
    console.error("[FirestoreService] Error saving document:", error);
    // Potentially re-throw or handle error state in UI
  }
};
