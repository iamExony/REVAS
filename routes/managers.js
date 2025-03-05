const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { authMiddleware, authenticateRole } = require('../middleware/authMiddleware');

router.post('/register', (req, res) => {
  const { firstName, lastName, email, password, confirmPassword, role } = req.body;
  if (password !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match' });
  res.status(201).json({ message: 'Account Manager created' });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (email && password) {
    const token = jwt.sign({ email, role: email.includes('supplier') ? 'supplier_manager' : 'buyer_manager' }, process.env.JWT_SECRET);
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

router.get('/dashboard', authMiddleware, authenticateRole(['buyer_manager', 'supplier_manager']), (req, res) => {
  res.send('Account Manager Dashboard');
});

module.exports = router;