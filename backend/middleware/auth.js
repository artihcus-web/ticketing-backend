import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Middleware to verify JWT token via external API or local secret (for Admins)
 */
export const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1] || req.headers['x-access-token'];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'No token provided'
    });
  }

  // 1. Try external verification first
  try {
    const apiBase = process.env.EMPLOYEES_API_URL || process.env.VITE_EMPLOYEES_API_URL || 'https://api.artihcus.com:8443/';
    const verifyUrl = `${apiBase.replace(/\/+$/, '')}/api/auth/me`;

    console.log(`[AUTH] 🛡️ Middleware: Verifying token for endpoint: ${req.originalUrl}`);
    console.log(`[AUTH] 🔍 Target: ${verifyUrl}`);
    console.log(`[AUTH] 🎫 Token Prefix: ${token.substring(0, 15)}...`);

    const response = await fetch(verifyUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'User-Agent': 'Artihcus-Ticketing-Backend/1.0'
      }
    });

    const responseStatus = response.status;
    console.log(`[AUTH] 📥 External API Response Status: ${responseStatus}`);

    if (response.ok) {
      const data = await response.json();
      console.log('[AUTH] ✅ External verification success');

      const user = data.user || data;
      if (user && (user.id || user._id || user.email)) {
        req.user = {
          id: user.id || user._id,
          email: user.email,
          role: user.role,
          userName: user.username || user.userName,
          fullName: user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim()
        };
        console.log(`[AUTH] 👤 User identified: ${req.user.email} (${req.user.role})`);
        return next();
      } else {
        console.warn('[AUTH] ⚠️ External API success but missing user data fields:', JSON.stringify(data));
      }
    } else {
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch (e) {
        errorBody = 'Could not read response body';
      }
      console.error(`[AUTH] ❌ External verification failed (Status ${responseStatus}):`, errorBody);
    }
  } catch (error) {
    console.error('[AUTH] 💥 Crash during external token verification:', error.message);
    console.error(error.stack);
  }

  // 2. Fallback to local JWT verification (for Admins)
  try {
    console.log('🔄 Falling back to local token verification...');
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    console.log('✅ Local verification success');
    next();
  } catch (error) {
    console.error('❌ Local token verification failed:', error.message);
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token'
    });
  }
};

/**
 * Generate JWT token
 */
export const generateToken = (userData) => {
  return jwt.sign(
    {
      id: userData.id,
      email: userData.email,
      role: userData.role,
    },
    JWT_SECRET,
    {
      expiresIn: '7d', // Token expires in 7 days
    }
  );
};





