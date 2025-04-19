const express = require("express");
const {
  registerProduct,
  getProductsByCompany,
  createUserAndProduct,
  getAllProducts,
  getProductById,
  deleteProduct,
  updateProduct,
} = require("../controllers/productController");
const {
  authMiddleware,
  authenticateRole,
} = require("../middleware/authMiddleware");
/* const multer = require("multer"); */
const upload = require("../middleware/uploadMiddleware");
const parseArrays = require("../middleware/arrayParserMiddleware");

const router = express.Router();

// Set up multer storage configuration
/* const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); // Save images in the "uploads" directory
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
}); */

// File filter to accept only images
/* const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"), false);
  }
}; */

// Initialize multer
/* const upload = multer({ storage, fileFilter }); */

/**
 * @swagger
 * tags:
 *   - name: Users
 *     description: Product management endpoints
 */
/**
 * @swagger
 * /register-product:
 *   post:
 *     summary: Register a product with an image
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               companyName:
 *                 type: string
 *                 example: PET Flakes Inc.
 *               product:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["PET", "FET", "RET"]
 *               capacity:
 *                 type: integer
 *                 example: 1000
 *               price:
 *                 type: number
 *                 format: float
 *                 example: 500.50
 *               location:
 *                 type: string
 *                 example: Lagos, Nigeria
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Product registered successfully
 */
router.post(
  "/register-product",
  authMiddleware,
  upload.single("image"),
  parseArrays,
  registerProduct
);

/**
 * @swagger
 * /products:
 *   get:
 *     summary: Get products by company name (Buyers & Sellers only)
 *     tags: [Account Managers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: companyName
 *         schema:
 *           type: string
 *         required: true
 *         description: Company name to search products for
 *     responses:
 *       200:
 *         description: List of products from the given company
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   companyName:
 *                     type: string
 *                   product:
 *                     type: string
 *                   capacity:
 *                     type: integer
 *                   price:
 *                     type: number
 *                     format: float
 *                   location:
 *                     type: string
 *       400:
 *         description: Company name is required
 *       403:
 *         description: Access denied (Only Buyers & Sellers)
 *       404:
 *         description: No products found
 */
router.get(
  "/products",
  authMiddleware,
  authenticateRole(["buyer", "seller"]),
  getProductsByCompany
);

/**
 * @swagger
 * /create-user-product:
 *   post:
 *     summary: Create a new user and register a product
 *     description: Only account managers (buyers or suppliers) can create a user and register a product.
 *     tags: [Account Managers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: John
 *               lastName:
 *                 type: string
 *                 example: Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: uchegodswill823@gmail.com
 *               role:
 *                 type: string
 *                 enum: [buyer, supplier]
 *                 example: buyer
 *               companyName:
 *                 type: string
 *                 example: POT Flukes Inc.
 *               product:
 *                 type: string
 *                 example: PET Washed Flakes
 *               capacity:
 *                 type: integer
 *                 example: 1000
 *               price:
 *                 type: number
 *                 format: float
 *                 example: 500.50
 *               location:
 *                 type: string
 *                 example: Lagos, Nigeria
 *     responses:
 *       201:
 *         description: New user created and product registered
 *       400:
 *         description: Bad request - Missing required fields or invalid input
 *       403:
 *         description: Access denied - Only account managers (buyers or suppliers) can create users
 *       409:
 *         description: Conflict - User with this email already exists
 */
router.post(
  "/create-user-product",
  authMiddleware,
  authenticateRole(["buyer", "supplier"]),
  createUserAndProduct
);

/**
 * @swagger
 * /products/all:
 *   get:
 *     summary: Get all products
 *     tags: [Account Managers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all products
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Product'
 */
router.get('/products/all', authMiddleware, authenticateRole(["buyer", "seller"]), getAllProducts);

/**
 * @swagger
 * /products/{id}:
 *   get:
 *     summary: Get a product by ID
 *     tags: [Account Managers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *     responses:
 *       200:
 *         description: Product details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Product'
 *       404:
 *         description: Product not found
 */
router.get('/products/:id', authMiddleware, authenticateRole(["buyer", "seller"]), getProductById);

/**
 * @swagger
 * /products/{id}:
 *   put:
 *     summary: Update a product
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               companyName:
 *                 type: string
 *               product:
 *                 type: array
 *                 items:
 *                   type: string
 *               capacity:
 *                 type: integer
 *               price:
 *                 type: number
 *               location:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Product updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Product'
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Product not found
 */
router.put('/products/:id', authMiddleware, upload.single('image'), parseArrays, updateProduct);

/**
 * @swagger
 * /products/{id}:
 *   delete:
 *     summary: Delete a product
 *     tags: [Account Managers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *     responses:
 *       200:
 *         description: Product deleted successfully
 *       404:
 *         description: Product not found
 */
router.delete('/products/:id', authMiddleware, authenticateRole(["buyer", "seller"]), deleteProduct);

// Make sure to update your Swagger components
/**
 * @swagger
 * components:
 *   schemas:
 *     Product:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         companyName:
 *           type: string
 *         product:
 *           type: array
 *           items:
 *             type: string
 *         capacity:
 *           type: integer
 *         price:
 *           type: number
 *         location:
 *           type: string
 *         imageUrl:
 *           type: string
 *         userId:
 *           type: string
 *           format: uuid
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

module.exports = router;
