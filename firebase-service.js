// Firebase web SDK, без npm и сборщика: подходит для GitHub Pages.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, collection, doc, getDocs, setDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js';
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
        const storage = firebaseConfig.storageBucket && !firebaseConfig.storageBucket.includes('PASTE_')
            ? getStorage(app)
            : null;
        const provider = new GoogleAuthProvider();

        function userRef(uid, kind, id) {
            if (!kinds.has(kind) || !uid || !id) throw new Error('Некорректный путь документа');
            if (auth.currentUser?.uid !== uid) throw new Error('Сессия пользователя изменилась');
            return doc(db, 'users', uid, kind, id);
        }

        async function getCollection(uid, kind) {
            if (auth.currentUser?.uid !== uid) throw new Error('Сессия пользователя изменилась');
            const snapshot = await getDocs(collection(db, 'users', uid, kind));
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
            async uploadImage(file) {
                const user = auth.currentUser;
                if (!user) throw new Error('Сначала войди через Google');
                if (!storage) throw new Error('Cloud Storage не настроен. Используй ссылку на изображение либо подключи Storage.');
                if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
                    throw new Error('Допустимы только JPG, PNG, WebP и GIF');
                }
                if (file.size > 1.5 * 1024 * 1024) throw new Error('Изображение должно быть не больше 1,5 МБ');
                const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[file.type];
                const path = ref(storage, `users/${user.uid}/images/${crypto.randomUUID()}.${extension}`);
                await uploadBytes(path, file, { contentType: file.type });
                return getDownloadURL(path);
            },
            async uploadDataUrl(dataUrl) {
                const response = await fetch(dataUrl);
                if (!response.ok) throw new Error('Не удалось прочитать старое изображение');
                return this.uploadImage(await response.blob());
            }
        };

        onAuthStateChanged(auth, user => window.applyCloudAuthState(user), error => {
            window.cloudStartupError(error.message || 'Не удалось проверить авторизацию');
        });
    } catch (error) {
        window.cloudStartupError(error.message || 'Не удалось подключиться к Firebase');
    }
}
