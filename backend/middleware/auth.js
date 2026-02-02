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
      // Trust the external API's "OK" even if the object structure is slightly different
      req.user = {
        id: user.id || user._id || user.empId || user.employeeId || user.username || user.email,
        email: user.email || user.username,
        role: user.role,
        userName: user.username || user.userName || user.empId,
        fullName: user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || user.email,
        employeeId: user.employeeId || user.empId
      };
      console.log(`[AUTH] 👤 User identified: ${req.user.email} (${req.user.role})`);
      return next();
    } else if (responseStatus === 429) {
      console.warn(`[AUTH] ⏳ External API Rate Limited (Status 429)`);
      return res.status(503).json({
        success: false,
        error: 'Authentication service busy, please try again'
      });
    } else if (responseStatus >= 500) {
      console.error(`[AUTH] 🛑 External API Error (Status ${responseStatus})`);
      return res.status(503).json({
        success: false,
        error: 'Authentication service temporarily unavailable'
      });
    } else if (responseStatus === 401 || responseStatus === 403) {
      console.warn(`[AUTH] 🚫 External verification rejected (Status ${responseStatus})`);
      // If unauthorized by external API, we definitely shouldn't fall back to local
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }
  } catch (error) {
    console.error('[AUTH] 💥 Crash during external token verification:', error.message);
    // If the external API call crashes (e.g. ECONNREFUSED), 
    // it's a server-side issue, not a token issue.
    return res.status(503).json({
      success: false,
      error: 'Authentication service connection failed'
    });
  }

  // 2. Fallback to local JWT verification (ONLY if external check didn't even happen)
  // This part is practically unreachable now for external users, 
  // which is safer than accidental logouts.
  try {
    console.log('🔄 Checking local token verification...');
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





