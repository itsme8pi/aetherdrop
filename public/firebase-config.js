const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT_://firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_://appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

let auth = null;
let db = null;
let firebaseReady = false;

try {
  if (firebaseConfig.apiKey !== "YOUR_FIREBASE_API_KEY") {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    firebaseReady = true;
  }
} catch (e) {
  console.warn("Using instant local save mode.");
}

window.PlayerDB = {
  currentUser: null,
  stats: { level: 1, xp: 0, kills: 0, wins: 0, matches: 0 },

  async signup(username, password) {
    const cleanUser = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (cleanUser.length < 3) throw new Error("Username must be at least 3 characters.");
    if (password.length < 6) throw new Error("Password must be at least 6 characters.");

    if (firebaseReady) {
      const fakeEmail = `${cleanUser}@aetherdrop.game`;
      const cred = await auth.createUserWithEmailAndPassword(fakeEmail, password);
      const initialStats = { username: username.trim(), level: 1, xp: 0, kills: 0, wins: 0, matches: 0 };
      await db.collection('players').doc(cred.user.uid).set(initialStats);
      this.currentUser = { uid: cred.user.uid, username: username.trim() };
      this.stats = initialStats;
      return initialStats;
    } else {
      const key = 'ad_user_' + cleanUser;
      if (localStorage.getItem(key)) throw new Error("Username already taken!");
      const data = { username: username.trim(), password, level: 1, xp: 0, kills: 0, wins: 0, matches: 0 };
      localStorage.setItem(key, JSON.stringify(data));
      this.currentUser = { uid: cleanUser, username: username.trim() };
      this.stats = data;
      return data;
    }
  },

  async login(username, password) {
    const cleanUser = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (firebaseReady) {
      const fakeEmail = `${cleanUser}@aetherdrop.game`;
      const cred = await auth.signInWithEmailAndPassword(fakeEmail, password);
      const doc = await db.collection('players').doc(cred.user.uid).get();
      const data = doc.data() || { username: username.trim(), level: 1, xp: 0, kills: 0, wins: 0, matches: 0 };
      this.currentUser = { uid: cred.user.uid, username: data.username };
      this.stats = data;
      return data;
    } else {
      const key = 'ad_user_' + cleanUser;
      const raw = localStorage.getItem(key);
      if (!raw) throw new Error("Account not found. Click SIGN UP first!");
      const data = JSON.parse(raw);
      if (data.password !== password) throw new Error("Incorrect password!");
      this.currentUser = { uid: cleanUser, username: data.username };
      this.stats = data;
      return data;
    }
  },

  async recordMatchResult({ kills, isWin }) {
    if (!this.currentUser) return;
    const earnedXp = kills * 40 + (isWin ? 200 : 50);
    this.stats.kills += kills;
    this.stats.matches += 1;
    if (isWin) this.stats.wins += 1;
    this.stats.xp += earnedXp;
    this.stats.level = Math.floor(this.stats.xp / 500) + 1;

    if (firebaseReady) {
      await db.collection('players').doc(this.currentUser.uid).set(this.stats, { merge: true });
    } else {
      localStorage.setItem('ad_user_' + this.currentUser.uid, JSON.stringify(this.stats));
    }
    return earnedXp;
  }
};
