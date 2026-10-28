// Two identities prove control in sequence: authenticate the destination without
// replacing the guest, then authorize the move while still authenticated as guest.
export async function signInPreservingGuest({api,auth,db,verifyCredentials},email,password) {
  const source = auth.currentUser;
  if (source?.isAnonymous) {
    const existing = await api.getDocsFromServer(api.query(api.collection(db,'feedbackThreads'),api.where('ownerId','==',source.uid),api.limit(1)));
    if (auth.currentUser?.uid !== source.uid) throw new Error('The account changed. Please sign in again.');
    if (!existing.empty) {
      const verified = await verifyCredentials(email,password);
      if (auth.currentUser?.uid !== source.uid || !auth.currentUser?.isAnonymous) throw new Error('The account changed. Please sign in again.');
      const targetId = verified.user.uid;
      const grant = api.doc(db,'feedbackTransfers',source.uid);
      // Server time bounds this authorization to conversations that already
      // exist. The source can refresh/revoke it only while still a guest.
      await api.setDoc(grant,{guestId:source.uid,targetId,createdAt:api.serverTimestamp()});
    }
  }
  if (auth.currentUser?.uid !== source?.uid) throw new Error('The account changed. Please sign in again.');
  return api.signInWithEmailAndPassword(auth,email,password);
}

export async function resumeGuestTransfers({api,auth,db}) {
  const target = auth.currentUser;
  if (!target || target.isAnonymous) return;
  const uid = target.uid;
  const unchanged = () => {
    if (auth.currentUser?.uid !== uid || auth.currentUser?.isAnonymous) throw new Error('The account changed. Conversation recovery paused.');
  };
  const grants = await api.getDocsFromServer(api.query(api.collection(db,'feedbackTransfers'),api.where('targetId','==',uid)));
  unchanged();
  for (const grant of grants.docs) {
    const data = grant.data();
    if (data.targetId !== uid || data.guestId !== grant.id || grant.id === uid) throw new Error('Invalid conversation transfer authorization.');
    while (true) {
      unchanged();
      const page = await api.getDocsFromServer(api.query(api.collection(db,'feedbackThreads'),api.where('ownerId','==',grant.id),api.where('createdAt','<=',data.createdAt),api.limit(200)));
      unchanged();
      if (page.empty) break;
      const batch = api.writeBatch(db);
      for (const thread of page.docs) batch.update(thread.ref,{ownerId:uid});
      unchanged();
      await batch.commit();
    }
  }
}
