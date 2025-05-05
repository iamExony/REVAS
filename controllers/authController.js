const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { Op } = require("sequelize");
const sequelize = require("../config/database");

const register = async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    password,
    confirmPassword,
    role,
    clientType,
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

    // Validate clientType
    if ((role !== "buyer" || role !== "supplier") && !clientType) {
      return res
        .status(400)
        .json({ error: "Client type is required for users" });
    }

    if ((role === "buyer" || role === "supplier") && clientType) {
      return res
        .status(400)
        .json({ error: "Account Managers should not have a client type" });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the user
    const user = await User.create({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      role,
      clientType: role === "buyer" || role === "supplier" ? null : clientType, // Allow null for account managers
    });

    // Generate a JWT token
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );

    // Return the response
    res.status(201).json({
      message: "User registered successfully",
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        companyName: user.companyName,
        email: user.email,
        role: user.role,
        clientType: user.clientType,
        hasRegisteredProduct: user.hasRegisteredProduct,
      },
      token,
    });

    // After user creation, assign to account manager if it's a regular user
    if (clientType) {
      const accountManagerRole = clientType.toLowerCase(); // "Buyer" -> "buyer"
      const accountManager = await User.findOne({
        where: {
          role: accountManagerRole,
          clientType: null, // Ensure it's an account manager
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
    }
  } catch (error) {
    console.error("Error in register function:", error);
    res.status(500).json({ error: error.message });
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

    // Track login
    await user.update({ lastLogin: new Date() });

    // Check if first login (password never changed)
    const isFirstLogin = !user.passwordChangedAt;

    const token = jwt.sign(
      { id: user.id, role: user.role },
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
// Create a transporter for sending emails
const transporter = nodemailer.createTransport({
  service: "gmail", // Use your email service (e.g., Gmail, Outlook)
  host: "smtp.ethereal.email",
  port: 587,
  secure: false, // true for port 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER, // Your email address
    pass: process.env.EMAIL_APP_PASSWORD /* .replace(/^"|"$/g, '')  */,
  },
});

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
    const resetUrl = `${process.env.FRONTEND_URL}/change-password/${resetToken}`;
    const mailOptions = {
      to: user.email,
      from: process.env.EMAIL_USER,
      subject: "Password Reset",
      text: `You are receiving this because you (or someone else) have requested a password reset for your account.\n\n
             Please copy this token and paste on your password recovery portal to complete the process:\n\n
             ${code}\n\n
             OR copy this link and paste on your browser to complete the process:\n\n
             ${resetUrl}\n\n
             If you did not request this, please ignore this email and your password will remain unchanged.\n`,
    };

    await transporter.sendMail(mailOptions);

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
