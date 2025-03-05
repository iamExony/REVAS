const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { authMiddleware, authenticateRole } = require('../middleware/authMiddleware');

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (email === 'hello@adminrevas.com' && password === '@Adminrevas1') {
    const token = jwt.sign({ email, role: 'admin' }, process.env.JWT_SECRET);
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

router.get('/dashboard', authMiddleware, authenticateRole(['admin']), (req, res) => {
  res.send('Admin Dashboard - Accessible with hello@adminrevas.com');
});
module.exports = router;
