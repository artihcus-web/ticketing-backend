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

    console.log(`🔍 Backend verifying token at: ${verifyUrl}`);

    const response = await fetch(verifyUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ External verification success');
      if (data.user) {
        // Map for consistency with the rest of the application
        req.user = {
          id: data.user.id || data.user._id,
          email: data.user.email,
          role: data.user.role,
          userName: data.user.username,
          fullName: data.user.fullName
        };
        return next();
      }
    } else {
      const errorData = await response.json().catch(() => ({}));
      console.error(`❌ External verification failed: Status ${response.status}`, errorData);
    }
  } catch (error) {
    console.error('❌ External token verification crash:', error.message);
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





