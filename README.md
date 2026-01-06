# Articket Backend API

Backend API server for Articket application, handling authentication and business logic separately from the frontend.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file:
```bash
PORT=5000
FRONTEND_URL=http://localhost:5173
FIREBASE_PROJECT_ID=ticketing-9965a
FIREBASE_API_KEY=AIzaSyA5atsWG-tRpSJLMHSqiVUG5let0sb87Uo
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
```
**Important:** Change `JWT_SECRET` to a strong random string in production!

3. For production, set up Firebase Admin SDK service account:
   - Download service account key from Firebase Console
   - Place it in the backend directory as `serviceAccountKey.json`
   - Or set `GOOGLE_APPLICATION_CREDENTIALS` environment variable to the path

## Running

Development:
```bash
npm run dev
```

Production:
```bash
npm start
```

## API Endpoints

### POST /auth/login
Authenticates a user and returns a JWT token for API authentication.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "token": "jwt-token-here",
  "user": {
    "id": "userId",
    "role": "admin",
    "firstName": "John",
    "lastName": "Doe",
    "email": "user@example.com",
    "project": "ProjectName"
  },
  "redirectPath": "/admin"
}
```

### GET /auth/verify
Verifies JWT token and returns user info.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "userId",
    "role": "admin",
    "firstName": "John",
    "lastName": "Doe",
    "email": "user@example.com",
    "project": "ProjectName"
  }
}
```

### GET /auth/user
Gets current user info (requires token).

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "userId",
    "role": "admin",
    "firstName": "John",
    "lastName": "Doe",
    "email": "user@example.com",
    "project": "ProjectName",
    "status": "active"
  }
}
```

### POST /auth/forgot-password
Sends a password reset email to the user.

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password reset link has been sent to your email. Please check your inbox."
}
```

## Notes

- The backend uses Firebase Admin SDK for server-side operations
- Password reset emails are generated but need to be sent via an email service (EmailJS, SendGrid, etc.)
- For production, ensure CORS is properly configured for your frontend domain

