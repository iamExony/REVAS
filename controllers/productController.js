const { Op } = require("sequelize");
const { User, Product } = require("../models");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { sendEmail } = require("../utils/emailService");
const cloudinary = require("../config/cloudinary"); // Cloudinary configuration

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
  try {
    let {
      firstName,
      lastName,
      email,
      role,
      companyName,
      product,
      capacity,
      price,
      location,
    } = req.body;

    if (!["buyer", "supplier"].includes(role)) {
      return res.status(403).json({
        message: "Only account managers (buyer or supplier) can create a user.",
      });
    }

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res
        .status(409)
        .json({ message: "User with this email already exists." });
    }

    const randomPassword = crypto.randomBytes(8).toString("hex");
    const hashedPassword = await bcrypt.hash(randomPassword, 10);

    const newUser = await User.create({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      role,
    });

    // Upload image to Cloudinary
    let imageUrl = "";
    if (req.file) {
      const uploadResult = await cloudinary.uploader.upload(req.file.path);
      imageUrl = uploadResult.secure_url;
    }

    // Register the product
    const newProduct = await Product.create({
      companyName,
      product,
      capacity,
      price,
      location,
      image: imageUrl,
      userId: newUser.id,
    });

    // Send login details via email
    await sendEmail(
      email,
      "Your Account Details",
      `
          Hello ${firstName},
          
          An account has been created for your company (${companyName}).

          Here are your details:
          - Company Name: ${companyName}
          - Email: ${email}
          - Product: ${product}
          - Capacity: ${capacity}
          - Price: ${price}
          - Location: ${location}
          - Image: ${imageUrl}

          Your login password: ${randomPassword}

          Please log in and update your password.

          Regards,
          Reavas Team
      `
    );

    return res.status(201).json({
      message:
        "User created and product registered successfully. Login details sent to email.",
      user: { firstName, lastName, email, role },
      product: newProduct,
    });
  } catch (error) {
    console.error("Error in createUserAndProduct:", error);
    return res.status(500).json({
      message: "An error occurred while creating the user and product.",
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
    if (updates.product && typeof updates.product === 'string') {
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
      product
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

module.exports = {
  registerProduct,
  getProductsByCompany,
  createUserAndProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct
};
