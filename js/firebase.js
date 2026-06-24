const firebaseConfig = {
  apiKey: 'AIzaSyAuQwp3hKi5L44dA-jCPsh_-HBFgDhSokU',
  authDomain: 'trip-planner-acd00.firebaseapp.com',
  projectId: 'trip-planner-acd00',
  storageBucket: 'trip-planner-acd00.firebasestorage.app',
  messagingSenderId: '205753906389',
  appId: '1:205753906389:web:d867cafbddf9ef8be39e5c'
};

const FirebaseApp = {
  db: null,
  loaded: false,
  error: null
};

try {
  if (typeof firebase === 'undefined') {
    FirebaseApp.error = 'Firebase SDK failed to load. Check your network or disable ad blockers.';
  } else {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    FirebaseApp.db = firebase.firestore();
    FirebaseApp.loaded = true;
  }
} catch (err) {
  FirebaseApp.error = err.message || 'Firebase failed to initialize';
  console.error('Firebase init error:', err);
}
