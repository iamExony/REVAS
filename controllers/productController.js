const { Op } = require("sequelize");
const { User, Product } = require("../models");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { sendEmail } = require("../utils/emailService");
const cloudinary = require("../config/cloudinary"); // Cloudinary configuration
const sequelize = require("../config/database");

const registerProduct = async (req, res) => {
  let { companyName, product, capacity, price, location } = req.body;
  const userId = req.user.id; // Get authenticated user ID

  try {
    // Parse product if it's a string
    if (typeof product === "string") {
      try {
        product = JSON.parse(product);
      } catch (e) {
        return res.status(400).json({ error: "Invalid product array format" });
      }
    }
    // Validate product is an array
    if (!Array.isArray(product)) {
      return res
        .status(400)
        .json({ error: "Product must be an array of items" });
    }

    if (product.some((item) => typeof item !== "string")) {
      return res
        .status(400)
        .json({ error: "All product items must be strings" });
    }

    const user = await User.findByPk(userId);
    if (user.hasRegisteredProduct) {
      return res.status(400).json({ error: "Product already registered" });
    }

    let imageUrl = null;
    if (req.file) {
      const uploadResult = await cloudinary.uploader.upload(req.file.path);
      imageUrl = uploadResult.secure_url;
    } else {
      return res.status(400).json({ message: "Image upload is required" });
    }

    // Create the product with items array
    const newProduct = await Product.create({
      companyName,
      product,
      capacity,
      price,
      location,
      imageUrl,
      userId,
    });

    user.hasRegisteredProduct = true;
    await user.save();

    res.status(201).json({
      message: "Product registered successfully",
      product: newProduct,
    });
  } catch (error) {
    console.error("Error in registerProduct:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get Products by Company
const getProductsByCompany = async (req, res) => {
  try {
    const { companyName } = req.query;

    let whereCondition = {};
    if (companyName) {
      whereCondition.companyName = { [Op.iLike]: `%${companyName}%` };
    }

    const products = await Product.findAll({
      where: whereCondition,
      order: [["companyName", "ASC"]],
    });

    res.status(200).json({ products });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Create User and Product
const createUserAndProduct = async (req, res) => {
  const transaction = await sequelize.transaction();
  let transactionCompleted = false;
  let emailError = null;

  try {
    // Validate request data
    const {
      firstName,
      lastName,
      email,
      clientType,
      companyName,
      product,
      capacity,
      role,
      price,
      location,
    } = req.body;

    // Authorization check
    if (!["buyer", "supplier"].includes(req.user.role)) {
      await transaction.rollback();
      transactionCompleted = true;
      return res.status(403).json({
        success: false,
        message: "Only account managers (buyer or supplier) can create a user.",
      });
    }

    // Validate required fields
    const requiredFields = ["firstName", "email", "companyName", "product"];
    const missingFields = requiredFields.filter((field) => !req.body[field]);
    if (missingFields.length > 0) {
      await transaction.rollback();
      transactionCompleted = true;
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
        missingFields,
      });
    }

    // Check for existing user
    const existingUser = await User.findOne({ where: { email }, transaction });
    if (existingUser) {
      await transaction.rollback();
      transactionCompleted = true;
      return res.status(409).json({
        success: false,
        message: "Email already exists",
        suggestion: "Try password reset if this is your account",
      });
    }

    // Create user with hashed password
    const randomPassword = crypto.randomBytes(8).toString("hex");
    const hashedPassword = await bcrypt.hash(randomPassword, 10);
    const formattedClientType =
      clientType.charAt(0).toUpperCase() + clientType.slice(1);

    const newUser = await User.create(
      {
        firstName,
        lastName,
        email,
        password: hashedPassword,
        role: role,
        clientType: formattedClientType,
      },
      { transaction }
    );

    // Handle image upload
    let imageUrl = "";
    if (req.file) {
      try {
        const uploadResult = await cloudinary.uploader.upload(req.file.path, {
          folder: "products",
          quality: "auto:good",
          format: "webp",
        });
        imageUrl = uploadResult.secure_url;
      } catch (uploadError) {
        console.error("Cloudinary upload failed:", uploadError);
        await transaction.rollback();
        transactionCompleted = true;
        return res.status(500).json({
          success: false,
          message: "Product image upload failed",
          error:
            process.env.NODE_ENV === "development"
              ? uploadError.message
              : undefined,
        });
      }
    }

    // Process product array
    let processedProduct = product;
    if (typeof product === "string") {
      try {
        processedProduct = JSON.parse(product);
      } catch (e) {
        processedProduct = product.split(",").map((item) => item.trim());
      }
    }

    if (!Array.isArray(processedProduct)) {
      processedProduct = [processedProduct];
    }

    // Create product
    const newProduct = await Product.create(
      {
        companyName,
        product: processedProduct,
        capacity,
        price,
        location,
        imageUrl: imageUrl, // Changed from 'image' to match model
        userId: newUser.id,
      },
      { transaction }
    );

    // Assign to account manager if needed
    if (clientType) {
      const accountManagerRole = clientType.toLowerCase();
      const accountManager = await User.findOne({
        where: {
          role: accountManagerRole,
          clientType: null,
        },
        transaction,
      });

      if (accountManager) {
        await accountManager.update(
          {
            managedClient: sequelize.fn(
              "array_append",
              sequelize.col("managedClient"),
              newUser.id
            ),
          },
          { transaction }
        );
      }
    }

    // Send welcome email (non-blocking for transaction)
    try {
      await sendEmail(
        email,
        `Welcome to Revas - ${companyName} Account`,
        `Hello ${firstName},
        
        An account has been created for your company (${companyName}).

        Account Details:
        Email: ${email}
        Temporary Password: ${randomPassword}

        Product Registered:
        - Product: ${processedProduct.join(", ")}
        - Capacity: ${capacity}
        - Price: ${price}
        - Location: ${location}

        Please login and:
        1. Change your password
        2. Complete your profile
        3. Verify your contact details

        Login here: ${process.env.FRONTEND_URL}/sign-in

        Regards,
        Reavas Team
        Support: ${process.env.SUPPORT_EMAIL}`
      );
    } catch (err) {
      console.error("Email sending failed:", err);
      emailError = err;
    }

    // Commit transaction if everything succeeded
    await transaction.commit();
    transactionCompleted = true;

    // Return success response
    return res.status(201).json({
      success: true,
      message:
        "Account and product created successfully. Login details sent to email.",
      user: {
        id: newUser.id,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
        role: newUser.role,
      },
      product: {
        id: newProduct.id,
        companyName: newProduct.companyName,
        product: newProduct.product,
        price: newProduct.price,
      },
      emailSent: !emailError,
    });
  } catch (error) {
    // Only rollback if transaction hasn't been committed
    if (!transactionCompleted) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Error during rollback:", rollbackError);
      }
    }

    console.error("Error in createUserAndProduct:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create account",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
      retrySuggestion: true,
    });
  }
};

// Get all products
const getAllProducts = async (req, res) => {
  try {
    const products = await Product.findAll();
    res.status(200).json(products);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
};

// Get product by ID
const getProductById = async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.status(200).json(product);
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ error: "Failed to fetch product" });
  }
};

// Update product
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    let updates = req.body;

    // Handle product array if provided
    if (updates.product && typeof updates.product === "string") {
      try {
        updates.product = JSON.parse(updates.product);
      } catch (e) {
        return res.status(400).json({ error: "Invalid product array format" });
      }
    }

    const product = await Product.findByPk(id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Handle image update if provided
    if (req.file) {
      const uploadResult = await cloudinary.uploader.upload(req.file.path);
      updates.imageUrl = uploadResult.secure_url;
    }

    await product.update(updates);
    res.status(200).json({
      message: "Product updated successfully",
      product,
    });
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ error: "Failed to update product" });
  }
};

// Delete product
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    await product.destroy();
    res.status(200).json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ error: "Failed to delete product" });
  }
};

//Get managed Users
const getManagedUsers = async (req, res) => {
  try {
    const accountManager = await User.findByPk(req.user.id);

    const managedUsers = await User.findAll({
      where: {
        id: { [Op.in]: accountManager.managedClient || [] },
      },
      attributes: [
        "id",
        "firstName",
        "lastName",
        "email",
        "clientType",
        "hasRegisteredProduct",
        "lastLogin",
        "passwordChangedAt",
      ],
    });

    // Categorize users
    const analytics = {
      totalUsers: managedUsers.length,
      registeredUsers: managedUsers.filter((u) => u.passwordChangedAt).length,
      unregisteredUsers: managedUsers.filter((u) => !u.passwordChangedAt)
        .length,
      byType: {
        buyer: {
          total: managedUsers.filter((u) => u.clientType === "Buyer").length,
          registered: managedUsers.filter(
            (u) => u.clientType === "Buyer" && u.passwordChangedAt
          ).length,
        },
        supplier: {
          total: managedUsers.filter((u) => u.clientType === "Supplier").length,
          registered: managedUsers.filter(
            (u) => u.clientType === "Supplier" && u.passwordChangedAt
          ).length,
        },
      },
    };

    res.json(analytics);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
};

//Get Unregistered Users
const getUnregisteredUsers = async (req, res) => {
  try {
    const accountManager = await User.findByPk(req.user.id);

    const unregisteredUsers = await User.findAll({
      where: {
        id: { [Op.in]: accountManager.managedClient || [] },
        passwordChangedAt: null,
      },
      attributes: [
        "id",
        "firstName",
        "lastName",
        "email",
        "clientType",
        "createdAt",
      ],
    });

    res.json(unregisteredUsers);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch unregistered users" });
  }
};

module.exports = {
  registerProduct,
  getProductsByCompany,
  createUserAndProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  getManagedUsers,
  getUnregisteredUsers,
};
