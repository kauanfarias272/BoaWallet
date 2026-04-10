const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.tsx');
const content = fs.readFileSync(filePath, 'utf8');

const regex = /const handleLogin = async \(\) => \{[\s\S]*?\};(\s*const handleLogout)/;

const newContent = content.replace(regex, `const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential && credential.accessToken) {
        setGoogleAccessToken(credential.accessToken);
        localStorage.setItem('googleAccessToken', credential.accessToken);
      }
    } catch (error) {
      console.error("Error signing in with Google", error);
    }
  };$1`);

fs.writeFileSync(filePath, newContent);
console.log("App.tsx login replaced");
