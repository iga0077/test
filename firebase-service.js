// Firebase web SDK, без npm и сборщика: подходит для GitHub Pages.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, collection, doc, getDocs, setDoc, deleteDoc, writeBatch } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const kinds = new Set(['tests', 'results', 'progress']);
const configured = ['apiKey', 'authDomain', 'projectId', 'appId'].every(
    key => typeof firebaseConfig[key] === 'string'
        && firebaseConfig[key].trim()
        && !firebaseConfig[key].includes('PASTE_')
);

if (!configured) {
    window.cloudStartupError('Укажи firebaseConfig в firebase-config.js (инструкция в README).');
} else {
    try {
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const db = getFirestore(app);
        const provider = new GoogleAuthProvider();

        function userRef(uid, kind, id) {
            if (!kinds.has(kind) || !uid || !id) throw new Error('Некорректный путь документа');
            if (auth.currentUser?.uid !== uid) throw new Error('Сессия пользователя изменилась');
            return doc(db, 'testAppUsers', uid, kind, id);
        }

        async function getCollection(uid, kind) {
            if (auth.currentUser?.uid !== uid) throw new Error('Сессия пользователя изменилась');
            const snapshot = await getDocs(collection(db, 'testAppUsers', uid, kind));
            return snapshot.docs;
        }

        window.cloud = {
            signIn() { return signInWithPopup(auth, provider); },
            signOut() { return signOut(auth); },
            async load(uid) {
                const [testDocs, resultDocs, progressDocs] = await Promise.all([
                    getCollection(uid, 'tests'),
                    getCollection(uid, 'results'),
                    getCollection(uid, 'progress')
                ]);
                return {
                    tests: testDocs.map(item => ({ ...item.data(), id: item.id })),
                    results: Object.fromEntries(resultDocs.map(item => [item.id, item.data()])),
                    progress: Object.fromEntries(progressDocs.map(item => [item.id, item.data()]))
                };
            },
            put(uid, kind, id, value) {
                return setDoc(userRef(uid, kind, id), value);
            },
            remove(uid, kind, id) {
                return deleteDoc(userRef(uid, kind, id));
            },
            // Import replaces the current user's dataset as one atomic Firestore batch.
            async replaceBackup(uid, existing, backup) {
                if (auth.currentUser?.uid !== uid) throw new Error('Аккаунт изменился');
                const incoming = {
                    tests: Object.fromEntries(backup.tests.map(t => [t.id, t])),
                    results: backup.results || {},
                    progress: backup.progress || {}
                };
                const batch = writeBatch(db);
                let operationCount = 0;
                let totalBytes = 0;
                for (const kind of kinds) {
                    const oldIds = Object.keys(existing[kind] || {});
                    const newIds = Object.keys(incoming[kind]);
                    for (const id of oldIds) {
                        if (!(id in incoming[kind])) {
                            batch.delete(userRef(uid, kind, id));
                            operationCount++;
                        }
                    }
                    for (const id of newIds) {
                        const value = incoming[kind][id];
                        const bytes = new TextEncoder().encode(JSON.stringify(value)).length;
                        if (bytes > 900000) {
                            throw new Error('Документ ' + kind + '/' + id + ' слишком большой для Firestore (возможно, встроенные изображения). Используй внешние URL.');
                        }
                        totalBytes += bytes;
                        batch.set(userRef(uid, kind, id), value);
                        operationCount++;
                    }
                }
                // Firestore's 500-write and 10-MiB request ceilings: leave headroom.
                if (operationCount > 400 || totalBytes > 8000000) {
                    throw new Error('Резервная копия слишком большая для одного безопасного импорта. Облачные данные не изменены.');
                }
                await batch.commit();
            }
        };

        onAuthStateChanged(auth, user => window.applyCloudAuthState(user), error => {
            window.cloudStartupError(error.message || 'Не удалось проверить авторизацию');
        });
    } catch (error) {
        window.cloudStartupError(error.message || 'Не удалось подключиться к Firebase');
    }
}
