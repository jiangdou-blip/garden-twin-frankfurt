(() => {
  const FIREBASE_VERSION = "10.12.5";
  const config = window.GARDEN_TWIN_FIREBASE_CONFIG || {};
  const configured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
  let auth;
  let db;
  let provider;
  let currentUser = null;
  let cloudReady = false;
  let onStatus = () => {};
  let onRemote = () => {};
  let initialData = null;

  function publicUser(user) {
    if (!user) return null;
    return {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
    };
  }

  function status(next) {
    onStatus({ configured, ...next });
  }

  async function loadFirebase() {
    const appMod = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`);
    const authMod = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`);
    const storeMod = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`);
    const app = appMod.initializeApp(config);
    auth = authMod.getAuth(app);
    db = storeMod.getFirestore(app);
    provider = new authMod.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    return { authMod, storeMod };
  }

  async function userDoc(storeMod, uid) {
    return storeMod.doc(db, "gardenUsers", uid);
  }

  window.gardenCloud = {
    configured,
    async init(options = {}) {
      onStatus = options.onStatus || onStatus;
      onRemote = options.onRemote || onRemote;
      initialData = options.initialData || null;
      if (!configured) {
        status({ status: "local", user: null, message: "本地保存" });
        return;
      }
      status({ status: "loading", user: null, message: "正在连接 Google" });
      const { authMod, storeMod } = await loadFirebase();
      cloudReady = true;
      authMod.onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        if (!user) {
          status({ status: "signed-out", user: null, message: "登录后云同步" });
          return;
        }
        status({ status: "loading", user: publicUser(user), message: "正在读取云端菜园" });
        const ref = await userDoc(storeMod, user.uid);
        const snap = await storeMod.getDoc(ref);
        if (snap.exists() && snap.data()?.garden) {
          onRemote(snap.data().garden);
          status({ status: "synced", user: publicUser(user), message: "云端已同步" });
          return;
        }
        await storeMod.setDoc(ref, {
          garden: initialData,
          email: user.email || "",
          displayName: user.displayName || "",
          updatedAt: storeMod.serverTimestamp(),
        }, { merge: true });
        status({ status: "synced", user: publicUser(user), message: "已为此账号创建菜园" });
      });
    },
    async signIn() {
      if (!configured) throw new Error("请先填写 Firebase 配置");
      if (!cloudReady) throw new Error("云同步还在初始化");
      const authMod = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`);
      await authMod.signInWithPopup(auth, provider);
    },
    async signOut() {
      if (!auth) return;
      const authMod = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`);
      await authMod.signOut(auth);
    },
    async save(garden) {
      if (!configured || !currentUser || !db) return;
      const storeMod = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`);
      const ref = await userDoc(storeMod, currentUser.uid);
      await storeMod.setDoc(ref, {
        garden,
        email: currentUser.email || "",
        displayName: currentUser.displayName || "",
        updatedAt: storeMod.serverTimestamp(),
      }, { merge: true });
    },
  };
})();
