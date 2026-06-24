const firebaseConfig = {
  apiKey: 'AIzaSyAuQwp3hKi5L44dA-jCPsh_-HBFgDhSokU',
  authDomain: 'trip-planner-acd00.firebaseapp.com',
  projectId: 'trip-planner-acd00',
  storageBucket: 'trip-planner-acd00.firebasestorage.app',
  messagingSenderId: '205753906389',
  appId: '1:205753906389:web:d867cafbddf9ef8be39e5c'
};

firebase.initializeApp(firebaseConfig);

const FirebaseApp = {
  db: firebase.firestore()
};
