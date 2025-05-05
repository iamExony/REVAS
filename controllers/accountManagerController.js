const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const sequelize = require('../config/database'); // Make sure this path is correct

// Validate Role
exports.validateAccountManagerRole = (role) => {
  if (!['buyer', 'supplier'].includes(role.toLowerCase())) {
    throw new Error('Account manager role must be either "buyer" or "supplier"');
  }
};

// Register Account Manager
exports.registerAccountManager = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { firstName, lastName, email, password, role } = req.body;

    // Validate input
    if (!firstName || !lastName || !email || !password || !role) {
      await transaction.rollback();
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate role
    try {
      exports.validateAccountManagerRole(role);
    } catch (error) {
      await transaction.rollback();
      return res.status(400).json({ error: error.message });
    }

    // Check email
    const existingUser = await User.findOne({ where: { email }, transaction });
    if (existingUser) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Email already in use' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await User.create({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      role: role.toLowerCase(),
      managedClient: [] // Initialize empty array
    }, { transaction });

    // Assign existing matching users
    const matchingUsers = await User.findAll({
      where: {
        clientType: role.charAt(0).toUpperCase() + role.slice(1),
        id: { [Op.ne]: user.id } // Exclude self
      },
      transaction
    });

    if (matchingUsers.length > 0) {
      await user.update({
        managedClient: matchingUsers.map(u => u.id)
      }, { transaction });
    }

    // Generate token
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    await transaction.commit();

    return res.status(201).json({
      message: 'Account Manager registered successfully',
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role
      },
      token
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Registration error:', error);
    return res.status(500).json({
      error: 'Registration failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Login Account Manager - (No changes needed, already good)
exports.loginAccountManager = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
};

// Get managed clients - Improved with pagination
exports.getManagedClients = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const accountManager = await User.findByPk(req.user.id);
    if (!accountManager) {
      return res.status(404).json({ error: 'Account manager not found' });
    }

    const { count, rows } = await User.findAndCountAll({
      where: {
        id: {
          [Op.in]: accountManager.managedClient || []
        }
      },
      attributes: { exclude: ['password', 'resetToken', 'resetTokenExpiry', 'managedClient'] },
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    return res.json({
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      clients: rows
    });

  } catch (error) {
    console.error('Get clients error:', error);
    return res.status(500).json({ error: 'Failed to fetch clients' });
  }
};

// Assign clients - Improved with validation
exports.assignClients = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { clientIds } = req.body;

    if (!Array.isArray(clientIds)) {
      await transaction.rollback();
      return res.status(400).json({ error: 'clientIds must be an array' });
    }

    const accountManager = await User.findByPk(req.user.id, { transaction });
    if (!accountManager) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Account manager not found' });
    }

    // Verify clients exist
    const existingClients = await User.findAll({
      where: { id: { [Op.in]: clientIds } },
      attributes: ['id'],
      transaction
    });

    const existingClientIds = existingClients.map(c => c.id);
    const newClients = clientIds.filter(id => 
      !accountManager.managedClient.includes(id) && 
      existingClientIds.includes(id)
    );

    if (newClients.length > 0) {
      await accountManager.update({
        managedClient: [...accountManager.managedClient, ...newClients]
      }, { transaction });
    }

    await transaction.commit();
    return res.json({ 
      message: 'Clients assigned successfully',
      assignedCount: newClients.length
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Assign clients error:', error);
    return res.status(500).json({ error: 'Failed to assign clients' });
  }
};

// Remove client - Improved with transaction
exports.removeClient = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { clientId } = req.params;

    const accountManager = await User.findByPk(req.user.id, { transaction });
    if (!accountManager) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Account manager not found' });
    }

    if (!accountManager.managedClient.includes(clientId)) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Client not in managed list' });
    }

    await accountManager.update({
      managedClient: accountManager.managedClient.filter(id => id !== clientId)
    }, { transaction });

    await transaction.commit();
    return res.json({ message: 'Client removed successfully' });

  } catch (error) {
    await transaction.rollback();
    console.error('Remove client error:', error);
    return res.status(500).json({ error: 'Failed to remove client' });
  }
};