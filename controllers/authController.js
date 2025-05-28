const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const crypto = require("crypto");
const { Op } = require("sequelize");
const sequelize = require("../config/database");
const { templates, sendEmail } = require("../utils/emailService");

const register = async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    password,
    confirmPassword,
    role,
    clientType,
    whatsappNumber,
  } = req.body;

  // Validate confirmPassword
  if (password !== confirmPassword) {
    return res.status(400).json({ error: "Passwords do not match" });
  }

  try {
    // Check if the email already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "Email already exists" });
    }

    // FIXED: Correct clientType validation logic
    if (!['buyer', 'supplier'].includes(role.toLowerCase()) && !clientType) {
      return res.status(400).json({ error: "Client type is required for users" });
    }

    if (['buyer', 'supplier'].includes(role.toLowerCase()) && clientType) {
      return res.status(400).json({ 
        error: "Account Managers should not have a client type" 
      });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // WhatsApp number validation
    if (whatsappNumber && !/^\+?[0-9]{10,15}$/.test(whatsappNumber)) {
      return res.status(400).json({
        error: "Invalid WhatsApp number format. Use numbers only with country code",
      });
    }

    // Create the user
    const user = await User.create({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      role,
      clientType: ['buyer', 'supplier'].includes(role.toLowerCase()) ? null : clientType,
      whatsappNumber,
      status: 'pending'
    });

    // Send email to user
    try {
      await sendEmail(
        user.email,
        templates.userRegistered(user).subject,
        templates.userRegistered(user).text
      );
    } catch (emailError) {
      console.error('Failed to send user email:', emailError);
    }

    // Notify account managers if this is a client user
    if (clientType) {
      try {
        const accountManagers = await User.findAll({
          where: {
            role: clientType.toLowerCase(),
            status: "pending",
          },
        });

        // Send notification to each account manager
        for (const manager of accountManagers) {
          try {
            await sendEmail(
              manager.email,
              templates.newUserNotification(user, manager).subject,
              templates.newUserNotification(user, manager).text
            );
            console.log(`Notification sent to manager: ${manager.email}`);
          } catch (managerEmailError) {
            console.error(`Failed to send email to manager ${manager.email}:`, managerEmailError);
          }
        }

        // Assign to account manager
        const accountManager = await User.findOne({
          where: {
            role: clientType.toLowerCase(),
            clientType: null,
          },
        });

        if (accountManager) {
          await accountManager.update({
            managedClient: sequelize.fn(
              "array_append",
              sequelize.col("managedClient"),
              user.id
            ),
          });
        }
      } catch (managerError) {
        console.error('Error in account manager notification:', managerError);
      }
    }

    // Return response
    res.status(201).json({
      message: "User registered successfully. Account pending approval.",
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        clientType: user.clientType,
        status: user.status,
      },
    });

  } catch (error) {
    console.error("Error in register function:", error);
    res.status(500).json({ 
      error: "Registration failed",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid password" });
    }
    // Check if user is approved
    if (user.status !== "approved") {
      return res.status(403).json({
        error:
          "Account pending approval. Please wait for administrator approval.",
      });
    }

    // Track login
    await user.update({ lastLogin: new Date() });

    // Check if first login (password never changed)
    const isFirstLogin = !user.passwordChangedAt;

    const token = jwt.sign(
      { id: user.id, clientType: user.clientType, role: user.role },
      process.env.JWT_SECRET,
      {
        expiresIn: "24h",
      }
    );

    res.status(200).json({
      message: "Login successful",
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        clientType: user.clientType,
        hasRegisteredProduct: user.hasRegisteredProduct,
        requiresPasswordChange: isFirstLogin,
      },
      token,
    });

    //update Last login
    if (user) {
      await user.update({ lastLogin: new Date() });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    // Find the user by email
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    // Generate a reset token
    const resetToken = crypto.randomBytes(20).toString("hex");

    // Generate a 6-digit numeric code for frontend input
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Set the reset token and expiry (e.g., 1 hour from now)
    user.resetToken = resetToken;
    user.resetCode = code;
    user.resetCodeExpiry = Date.now() + 3600000;
    user.resetTokenExpiry = Date.now() + 3600000; // 1 hour
    await user.save();

    // Send the reset email
        // Send email to user
    const resetUrl = `${process.env.FRONTEND_URL}/change-password/${resetToken}`;
    try {
      await sendEmail(
        user.email,
        templates.forgotPasswordMail(code, resetUrl).subject,
        templates.forgotPasswordMail(code, resetUrl).text
      );
    } catch (emailError) {
      console.error('Failed to send user email:', emailError);
    }

    res.status(200).json({ message: "Password reset email sent" });
  } catch (error) {
    console.error("Error in forgotPassword:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const resetPassword = async (req, res) => {
  let { token, code } = req.query;
  const { password, confirmPassword } = req.body;

  try {
    // Validate password and confirmPassword
    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }
    // Check that at least one method is provided
    if (!token && !code) {
      return res
        .status(400)
        .json({ error: "Either token or code is required" });
    }

    // Convert code to number if it's a string
    if (code && typeof code === "string") {
      code = parseInt(code, 10);
      if (isNaN(code)) {
        return res.status(400).json({ error: "Invalid code format" });
      }
    }
    // Find the user by either reset token or code (and check expiry)
    const whereClause = {
      [Op.or]: [
        ...(token
          ? [
              {
                resetToken: token,
                resetTokenExpiry: { [Op.gt]: Date.now() },
              },
            ]
          : []),
        ...(code
          ? [
              {
                resetCode: code,
                resetCodeExpiry: { [Op.gt]: Date.now() },
              },
            ]
          : []),
      ],
    };

    const user = await User.findOne({ where: whereClause });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired token/code" });
    }

    // Additional validation
    if (
      (token && user.resetToken !== token) ||
      (code && user.resetCode !== code)
    ) {
      return res.status(400).json({ error: "Invalid token/code" });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update the user's password and clear the reset token
    user.password = hashedPassword;
    user.resetToken = null;
    user.resetCode = null;
    user.resetTokenExpiry = null;
    user.resetCodeExpiry = null;
    await user.save();

    res.status(200).json({ message: "Password reset successful" });
  } catch (error) {
    console.error("Error in resetPassword:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findByPk(req.user.id);

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    // Check if new password is different
    if (currentPassword === newPassword) {
      return res.status(400).json({ error: "New password must be different" });
    }

    // Update password (model hook will set passwordChangedAt)
    await user.update({
      password: await bcrypt.hash(newPassword, 12),
    });

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    res.status(500).json({ error: "Password update failed" });
  }
};
const setInitialPassword = async (req, res) => {
  try {
    const { newPassword, confirmPassword } = req.body;
    const user = await User.findByPk(req.user.id);

    // Validate confirmPassword
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    if (user.passwordChangedAt) {
      return res.status(400).json({ error: "Password already changed" });
    }

    await user.update({
      password: await bcrypt.hash(newPassword, 12),
    });

    res.json({ message: "Password set successfully" });
  } catch (error) {
    res.status(500).json({ error: "Password setup failed" });
  }
};

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
  updatePassword,
  setInitialPassword,
};
