const express = require("express");
const {
  registerProduct,
  createUserAndProduct,
  getAllProducts,
  getProductById,
  deleteProduct,
  updateProduct,
  getUnregisteredUsers,
  getManagedUsers,
  getProductsByBuyerCompany,
  getProductsBySupplierCompany,
} = require("../controllers/productController");
const {
  authMiddleware,
  authenticateRole,
} = require("../middleware/authMiddleware");
/* const multer = require("multer"); */
const upload = require("../middleware/uploadMiddleware");
const parseArrays = require("../middleware/arrayParserMiddleware");

const router = express.Router();

/**
 * @swagger
 * /managed-users:
 *   get:
 *     summary: Get analytics for managed users
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Analytics data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalUsers:
 *                   type: integer
 *                 registeredUsers:
 *                   type: integer
 *                 unregisteredUsers:
 *                   type: integer
 *                 byType:
 *                   type: object
 *                   properties:
 *                     buyer:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         registered:
 *                           type: integer
 *                     supplier:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         registered:
 *                           type: integer
 */
router.get("/managed-users", authMiddleware, getManagedUsers);

/**
 * @swagger
 * /unregistered-users-analytics:
 *   get:
 *     summary: Get unregistered users
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of unregistered users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 */
router.get(
  "/unregistered-users-analytics",
  authMiddleware,
  getUnregisteredUsers
);

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
 * tags:
 *   name: Products
 *   description: Product search by company name (Buyers/Suppliers)
 */

/**
 * @swagger
 * /products/suppliers:
 *   get:
 *     summary: Search products by company name (Suppliers only)
 *     tags: [Account Managers]
 *     parameters:
 *       - in: query
 *         name: companyName
 *         schema:
 *           type: string
 *         description: Company name or partial name to search for
 *     responses:
 *       200:
 *         description: List of products from suppliers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 products:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Product'
 *       500:
 *         description: Internal server error
 */
router.get("/products/suppliers", getProductsBySupplierCompany);

/**
 * @swagger
 * /products/buyers:
 *   get:
 *     summary: Search products by company name (Buyers only)
 *     tags: [Account Managers]
 *     parameters:
 *       - in: query
 *         name: companyName
 *         schema:
 *           type: string
 *         description: Company name or partial name to search for
 *     responses:
 *       200:
 *         description: List of products from buyers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 products:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Product'
 *       500:
 *         description: Internal server error
 */
router.get("/products/buyers", getProductsByBuyerCompany);

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
 *           example: "123e4567-e89b-12d3-a456-426614174000"
 *         companyName:
 *           type: string
 *           example: "ABC Corp"
 *          #Add other Product fields as needed
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         firstName:
 *           type: string
 *         lastName:
 *           type: string
 *         clientType:
 *           type: string
 *           enum: [Buyer, Supplier]
 */

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
 *               clientType:
 *                 type: string
 *                 enum: [Buyer, Supplier]
 *                 example: Buyer
 *               role:
 *                 type: string
 *                 example: Sales Executive
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
  parseArrays,
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
router.get(
  "/products/all",
  authMiddleware,
  authenticateRole(["buyer", "seller"]),
  getAllProducts
);

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
router.get(
  "/products/:id",
  authMiddleware,
  authenticateRole(["buyer", "seller"]),
  getProductById
);

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
router.put(
  "/products/:id",
  authMiddleware,
  upload.single("image"),
  parseArrays,
  updateProduct
);

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
router.delete(
  "/products/:id",
  authMiddleware,
  authenticateRole(["buyer", "seller"]),
  deleteProduct
);

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
