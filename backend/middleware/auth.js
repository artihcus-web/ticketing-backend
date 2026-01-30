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
    const apiBase = process.env.VITE_EMPLOYEES_API_URL || 'https://api.artihcus.com:8443/';
    const verifyUrl = `${apiBase.endsWith('/') ? apiBase : apiBase + '/'}api/auth/me`;

    console.log(`[AUTH] 🔍 Verifying token at: ${verifyUrl}`);

    const response = await fetch(verifyUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('[AUTH] ✅ External verification success');
      if (data.user || data.id || data.email) {
        // Map for consistency with the rest of the application
        const user = data.user || data;
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
        console.warn('[AUTH] ⚠️ External API returned success but no user data:', data);
      }
    } else {
      let errorData = {};
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = { raw: await response.text().catch(() => 'No text content') };
      }
      console.error(`[AUTH] ❌ External verification failed: Status ${response.status}`, JSON.stringify(errorData));
    }
  } catch (error) {
    console.error('[AUTH] ❌ External token verification crash:', error.message);
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





