const jwt = require('jsonwebtoken');

/**
 * Middleware: Verify JWT token from Authorization header
 * Usage: router.get('/admin-route', auth, handler)
 */
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided. Please sign in.' });
  }

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;  // { id, username, role }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }
    return res.status(401).json({ error: 'Invalid token.' });
  }
}

/**
 * Middleware: Require owner role
 */
function ownerOnly(req, res, next) {
  if (req.admin.role !== 'owner') {
    return res.status(403).json({ error: 'Owner access required.' });
  }
  next();
}

module.exports = { auth, ownerOnly };
