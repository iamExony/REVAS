const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const sequelize = require('../config/database'); // Make sure this path is correct
const { templates, sendEmail } = require("../utils/emailService");

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
      { id: user.id, role: user.role, managedClient: user.managedClient },
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

// controllers/userApprovalController.js
exports.getPendingUsers = async (req, res) => {
  try {
    const accountManager = req.user;
    
    // Get users matching the account manager's role (buyer/supplier)
    const users = await User.findAll({
      where: {
        clientType: accountManager.role.charAt(0).toUpperCase() + accountManager.role.slice(1),
        status: 'pending'
      },
      attributes: { exclude: ['password'] }
    });

    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pending users' });
  }
};

exports.getUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    const accountManager = req.user;
    
    const user = await User.findOne({
      where: {
        id: userId,
        clientType: accountManager.role.charAt(0).toUpperCase() + accountManager.role.slice(1)
      },
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
};

/* exports.approveUser = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { userId } = req.params;
    const accountManager = req.user;

    const user = await User.findOne({
      where: {
        id: userId,
        clientType: accountManager.role.charAt(0).toUpperCase() + accountManager.role.slice(1),
        status: 'pending'
      },
      transaction
    });

    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Pending user not found' });
    }

    // Update user status
    await user.update({
      status: 'approved',
      approvedAt: new Date(),
      approvedById: accountManager.id
    }, { transaction });

    // Add to managed clients if not already there
    if (!accountManager.managedClient.includes(user.id)) {
      await accountManager.update({
        managedClient: sequelize.fn(
          'array_append',
          sequelize.col('managedClient'),
          user.id
        )
      }, { transaction });
    }

    // Send approval email
    await sendEmail(
      user.email,
      templates.userApproved(user).subject,
      templates.userApproved(user).text
    );

    await transaction.commit();
    res.json({ message: 'User approved successfully' });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ error: 'Failed to approve user' });
  }
}; */

exports.approveUser = async (req, res) => {
  let transaction;
  try {
    transaction = await sequelize.transaction();
    const { userId } = req.params;
    const accountManager = req.user;

    // Validate account manager role
    if (!['buyer', 'supplier'].includes(accountManager.role)) {
      throw new Error('Invalid account manager role');
    }

    const clientType = accountManager.role.charAt(0).toUpperCase() + 
                      accountManager.role.slice(1);

    const user = await User.findOne({
      where: {
        id: userId,
        clientType,
        status: 'pending'
      },
      transaction
    });

    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ 
        error: 'Pending user not found or already processed',
        details: `No pending ${clientType} user found with ID ${userId}`
      });
    }

    // Update user status
    await user.update({
      status: 'approved',
      approvedAt: new Date(),
      approvedById: accountManager.id
    }, { transaction });

    // Update manager's client list
    let managedClients = accountManager.managedClient || [];
    if (!managedClients.includes(user.id)) {
      managedClients = [...managedClients, user.id];
      await accountManager.update({
        managedClient: managedClients
      }, { transaction });
    }

    // Commit transaction before sending email
    await transaction.commit();

    // Send email (non-critical operation)
    try {
      await sendEmail(
        user.email,
        templates.userApproved(user).subject,
        templates.userApproved(user).text
      );
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Don't fail the request because email failed
    }

    res.json({ 
      message: 'User approved successfully',
      userId: user.id,
      approvedBy: accountManager.id
    });

  } catch (error) {
    console.error('Approval process failed:', error);
    if (transaction) await transaction.rollback();
    
    res.status(500).json({ 
      error: 'Failed to approve user',
      ...(process.env.NODE_ENV === 'development' && {
        details: error.message,
        stack: error.stack
      })
    });
  }
};
exports.rejectUser = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    const accountManager = await User.findByPk(req.user.id, { transaction });

    if (!reason) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const user = await User.findOne({
      where: {
        id: userId,
        clientType: accountManager.role.charAt(0).toUpperCase() + accountManager.role.slice(1),
        status: 'pending'
      },
      transaction
    });

    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Pending user not found' });
    }

    // Send rejection email before deleting
    await sendEmail(
      user.email,
      'Account Registration Rejected',
      `Dear ${user.firstName},\n\n` +
      `We regret to inform you that your account registration has been rejected.\n\n` +
      `Reason: ${reason}\n\n` +
      `If you believe this was in error, please contact support.`
    );

    // Delete the user
    await user.destroy({ transaction });

    await transaction.commit();
    return res.json({ message: 'User rejected and deleted successfully' });

  } catch (error) {
    await transaction.rollback();
    console.error('Rejection error:', error);
    return res.status(500).json({ 
      error: 'Failed to reject user',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};