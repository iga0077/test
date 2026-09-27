// Публичные настройки веб-приложения: Firebase console → Project settings → Your apps → Web app.
// Это НЕ приватный ключ и НЕ service account. Доступ к данным ограничивают Security Rules.
export const firebaseConfig = {
    apiKey: "PASTE_API_KEY",
    authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
    projectId: "PASTE_PROJECT_ID",
    storageBucket: "PASTE_PROJECT_ID.firebasestorage.app",
    messagingSenderId: "PASTE_MESSAGING_SENDER_ID",
    appId: "PASTE_APP_ID"
};
