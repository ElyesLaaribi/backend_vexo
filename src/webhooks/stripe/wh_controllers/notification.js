const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const FCM = require("../../../models/fcmToken.model");

const DEFAULT_KEY_PATH = path.join(
  __dirname,
  "../../../utils/firebase-key/push-notification-key.json",
);

let firebaseReady = false;
let attemptedInit = false;
let initError = null;

const loadServiceAccount = () => {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    if (!fs.existsSync(filePath)) {
      throw new Error(`Firebase key file not found at ${filePath}`);
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  }

  if (fs.existsSync(DEFAULT_KEY_PATH)) {
    return JSON.parse(fs.readFileSync(DEFAULT_KEY_PATH, "utf8"));
  }

  throw new Error("Firebase service account credentials not provided");
};

const initializeFirebase = () => {
  if (firebaseReady || attemptedInit) return;
  attemptedInit = true;

  try {
    const serviceAccount = loadServiceAccount();
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    firebaseReady = true;
    initError = null;
    console.log("[Notifications] Firebase Admin initialized");
  } catch (error) {
    firebaseReady = false;
    initError = error;
    console.error(
      "[Notifications] Failed to initialize Firebase Admin SDK:",
      error.message,
    );
  }
};

initializeFirebase();

async function sendNotification(token, title, body, data = {}) {
  if (!firebaseReady) {
    if (!attemptedInit) {
      initializeFirebase();
    }
    if (!firebaseReady) {
      console.warn(
        "[Notifications] Firebase unavailable. Skipping push send. Reason:",
        initError ? initError.message : "credentials missing",
      );
      return null;
    }
  }

  const message = {
    token,
    notification: { title, body },
    data: {
      ...data,
      click_action: "FLUTTER_NOTIFICATION_CLICK",
    },
    apns: {
      payload: {
        aps: { sound: "default", badge: 1, mutableContent: 1 },
      },
      headers: { "apns-priority": "10" },
    },
    android: {
      priority: "high",
      notification: { channel_id: "high_importance_channel", sound: "default" },
    },
  };

  try {
    const response = await admin.messaging().send(message);
    console.log("[Notifications] Successfully sent message:", response);
    return response;
  } catch (error) {
    console.error("[Notifications] Error sending message:", error.message);

    if (
      error.code === "messaging/invalid-registration-token" ||
      error.code === "messaging/registration-token-not-registered"
    ) {
      await FCM.findOneAndUpdate(
        { fcmToken: token },
        { $unset: { fcmToken: 1 } },
      );
    }
  }

  return null;
}

module.exports = sendNotification;
