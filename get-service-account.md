# How to Get Firebase Service Account Key

## Step-by-Step Instructions

1. **Go to Firebase Console:**
   - Visit: https://console.firebase.google.com/
   - Select your project: **ticketing-9965a**

2. **Navigate to Service Accounts:**
   - Click the gear icon (⚙️) next to "Project Overview"
   - Select **"Project settings"**
   - Go to the **"Service accounts"** tab

3. **Generate Private Key:**
   - Click **"Generate new private key"** button
   - A confirmation dialog will appear
   - Click **"Generate key"**
   - A JSON file will be downloaded automatically

4. **Save the File:**
   - Rename the downloaded file to: `serviceAccountKey.json`
   - Move it to the `backend/` folder

5. **Update .env file:**
   Add this line to your `backend/.env` file:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
   ```

6. **Restart the server:**
   ```bash
   npm start
   ```

## Alternative: Use Application Default Credentials

If you have Google Cloud SDK installed:

```bash
gcloud auth application-default login
```

This will use your Google account credentials instead of a service account file.

## Security Note

⚠️ **Never commit `serviceAccountKey.json` to Git!**
- It's already in `.gitignore`
- Keep it secure and private
- Rotate keys if accidentally exposed




