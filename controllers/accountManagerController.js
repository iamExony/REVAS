const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Validate Role
exports.validateAccountManagerRole = (role) => {
  if (!['buyer', 'supplier'].includes(role.toLowerCase())) {
    throw new Error('Account manager role must be either "buyer" or "supplier".');
  }
};

// Register Account Manager
exports.registerAccountManager = async (req, res) => {
  try {
    const { firstName, lastName, email, password, role } = req.body;

    // Validate role
    try {
      exports.validateAccountManagerRole(role);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    // Check if email is already taken
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email is already in use' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

      // Generate token
   

    // Create user
    const user = await User.create({ firstName, lastName, email, password: hashedPassword, role });

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' }); 

    // Remove password before sending response
    const userResponse = { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role };

    res.status(201).json({ message: 'Account Manager created successfully', user: userResponse, token: token });
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while registering the account manager' });
  }
};

// Login Account Manager
exports.loginAccountManager = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate token
    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });

    // Remove password before sending response
    const userResponse = { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role };

    res.json({ message: 'Login successful', token, user: userResponse });
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while logging in' });
  }
};
