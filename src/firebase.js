import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onIdTokenChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getFirestore, onSnapshot, runTransaction } from 'firebase/firestore';
import { applyChange, emptyWorkshop } from '../shared/planner.js';
import { projectId } from '../shared/firebase-project.js';

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
if (!apiKey) throw new Error('cloudUnavailable');
const app = initializeApp({ apiKey, projectId, authDomain: projectId + '.firebaseapp.com', appId: '1:72537579906:web:3879ad391367eea4c92f9b' });
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });
const workshopRef = uid => doc(db, 'workshops', uid);
function unpack(snapshot) {
  return snapshot.exists() ? { ...emptyWorkshop(), ...JSON.parse(snapshot.data().payload) } : emptyWorkshop();
}

export const login = () => signInWithPopup(auth, provider);
export const logout = () => signOut(auth);
export function watchAccount(update) {
  let generation = 0, stopMember, stopWorkshop;
  const clear = () => { generation++; stopMember?.(); stopWorkshop?.(); stopMember = stopWorkshop = null; };
  const stopAuth = onIdTokenChanged(auth, user => {
    clear();
    const version = generation;
    if (!user) { update({ user: null, busy: false }); return; }
    const fail = reason => {
      if (version !== generation) return;
      clear();
      update({ user: null, busy: false, error: reason });
      if (reason === 'accessDenied') void logout().catch(() => {});
    };
    const onError = error => fail(error.code === 'permission-denied' ? 'accessDenied' : 'cloudUnavailable');
    if (!user.emailVerified || !user.email) { fail('accessDenied'); return; }
    update({ pendingUid: user.uid, busy: true });
    stopMember = onSnapshot(doc(db, 'members', user.email.toLowerCase()), { includeMetadataChanges: true }, member => {
      if (version !== generation || member.metadata.fromCache) return;
      if (member.data()?.enabled !== true) { fail('accessDenied'); return; }
      if (stopWorkshop) return;
      stopWorkshop = onSnapshot(workshopRef(user.uid), { includeMetadataChanges: true }, snapshot => {
        if (version !== generation || snapshot.metadata.fromCache) return;
        try { update({ user, cloudState: unpack(snapshot), busy: false }); }
        catch { fail('cloudUnavailable'); }
      }, onError);
    }, onError);
  });
  return () => { clear(); stopAuth(); };
}

export function writeCloud(user, action, catalog) {
  const ref = workshopRef(user.uid);
  return runTransaction(db, async transaction => {
    if (auth.currentUser?.uid !== user.uid) throw new Error('accessDenied');
    const snapshot = await transaction.get(ref);
    const next = applyChange(unpack(snapshot), action, catalog);
    const payload = JSON.stringify(next);
    if (new TextEncoder().encode(payload).length > 950000) throw new Error('cloudFull');
    transaction.set(ref, { payload });
  });
}
