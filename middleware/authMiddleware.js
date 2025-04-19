const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(400).json({ error: 'Invalid token' });
  }
};

 function authenticateRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  };
} 

module.exports = { authMiddleware, authenticateRole   }; 
/* const authMiddleware = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Ensure required fields exist
    if (!decoded.id || (!decoded.role && !decoded.clientType)) {
      return res.status(403).json({ error: 'Invalid token payload' });
    }

    // Attach user data to request
    req.user = {
      id: decoded.id,
      email: decoded.email,       // Optional but recommended
      role: decoded.role,         // For account managers
      clientType: decoded.clientType, // For buyers/suppliers
      managedClient: decoded.managedClient || [], // For account managers
    };

    next();
  } catch (error) {
    // Handle token expiration explicitly
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    res.status(400).json({ error: 'Invalid token' });
  }
};

// Enhanced role/clientType checker
function authenticateRole  (roles, clientTypes) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ error: 'User not authenticated' });
    }

    // Check if user matches either role OR clientType requirements
    const hasValidRole = roles.includes(req.user.role);
    const hasValidClientType = clientTypes.includes(req.user.clientType);

      if (hasValidRole || hasValidClientType) {
        return res.status(403).json({ 
          error: 'Access denied',
          details: `Requires: ${roles.join(', ')} roles OR ${clientTypes.join(', ')} clientTypes`
        });
      }

    next();
  };
}*/



