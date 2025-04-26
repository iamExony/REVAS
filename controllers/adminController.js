const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Admin Login
const loginAdmin =  (req, res) => {
  const { email, password } = req.body;
  if (email === 'hello@adminrevas.com' && password === '@Adminrevas1') {
    const token = jwt.sign({ email, role: 'Super Admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    return res.status(200).json({ token });
  }
  res.status(401).json({ error: 'Invalid admin credentials' });
};

module.exports = {loginAdmin};