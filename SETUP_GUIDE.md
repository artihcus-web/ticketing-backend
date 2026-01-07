# Backend Setup Guide

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create `.env` file**:
   ```
   PORT=5000
   FRONTEND_URL=http://localhost:5173
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   MONGODB_URI=mongodb://localhost:27017/ticketing
   ```
   **Important:** Change `JWT_SECRET` to a strong random string in production!

3. **Set up MongoDB:**
   - Ensure MongoDB is running on your system
   - Update `MONGODB_URI` in `.env` with your MongoDB connection string
   - For production, use a connection string with authentication:
     ```
     MONGODB_URI=mongodb://username:password@host:27017/ticketing?authSource=admin
     ```

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

### Error: "MongoDB connection error"
- Check if MongoDB is running on your system
- Verify the `MONGODB_URI` in your `.env` file is correct
- Ensure MongoDB is accessible from your application

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





