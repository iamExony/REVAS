const express = require('express');
const { registerProduct, getProductsByCompany, createUserAndProduct } = require('../controllers/productController');
const { authMiddleware, authenticateRole } = require('../middleware/authMiddleware');
const multer = require('multer');
const upload = require("../middleware/uploadMiddleware");

const router = express.Router();

// Set up multer storage configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // Save images in the "uploads" directory
    },
    filename: function (req, file, cb) {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

// File filter to accept only images
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};

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
 * /api/register-product:
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
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Product registered successfully
 */
router.post('/api/register-product', authMiddleware, upload.single('image'), registerProduct);

/**
 * @swagger
 * /api/products:
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
router.get('/api/products', authMiddleware, authenticateRole(['buyer', 'seller']), getProductsByCompany);

/**
 * @swagger
 * /api/create-user-product:
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
 *               password:
 *                 type: string
 *                 format: password
 *                 example: securepassword
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
router.post('/api/create-user-product', authMiddleware, authenticateRole(['buyer', 'supplier']), createUserAndProduct);
  

module.exports = router;
