# Backend Setup Guide

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create `.env` file** (already created with default values):
   ```
   PORT=5000
   FRONTEND_URL=http://localhost:5173
   FIREBASE_PROJECT_ID=ticketing-9965a
   FIREBASE_API_KEY=AIzaSyA5atsWG-tRpSJLMHSqiVUG5let0sb87Uo
   ```

3. **Set up Firebase Admin SDK credentials** (Required for production):

   **Option A: Service Account Key (Recommended)**
   - Go to Firebase Console → Project Settings → Service Accounts
   - Click "Generate New Private Key"
   - Save the JSON file as `serviceAccountKey.json` in the `backend/` folder
   - Add to `.env`:
     ```
     GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
     ```

   **Option B: Application Default Credentials (For local development)**
   - Install Google Cloud SDK
   - Run: `gcloud auth application-default login`
   - This will use your Google account credentials

4. **Run the server:**
   ```bash
   # Development (with auto-reload)
   npm run dev

   # Production
   npm start
   ```

## Testing

Once the server is running, test it:

```bash
# Health check
curl http://localhost:5000/health

# Should return: {"status":"ok","message":"Backend is running"}
```

## Troubleshooting

### Error: "Cannot find package 'express'"
- Run `npm install` in the `backend/` directory

### Error: "Firebase Admin initialization error"
- You need to set up Firebase service account credentials (see step 3 above)
- For quick testing, you can use Application Default Credentials

### Error: "Cannot connect to server"
- Check if port 5000 is already in use
- Change PORT in `.env` file if needed
- Make sure the server started successfully (check console output)

## Frontend Configuration

In your `frontend/.env` file, add:
```
VITE_API_BASE_URL=http://localhost:5000
```

This tells the frontend where to find the backend API.



