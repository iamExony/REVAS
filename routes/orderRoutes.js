const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { authMiddleware, authenticateRole } = require('../middleware/authMiddleware');

/**
 * @swagger
 * components:
 *   schemas:
 *     Order:
 *       type: object
 *       properties:
 *         companyName:
 *           type: string
 *           example: "Revas Exchange"
 *         email:
 *           type: string
 *           example: "abc@company.com"
 *         location:
 *           type: string
 *           example: "United Kingdom"
 *         product:
 *           type: string
 *           example: "PET"
 *         capacity:
 *           type: integer
 *           example: 100
 *         pricePerTonne:
 *           type: integer
 *           example: 1000
 *         supplier:
 *           type: string
 *           example: "Franko Recycling"
 *         supplierPrice:
 *           type: integer
 *           example: 800
 *         shippingCost:
 *           type: integer
 *           example: 100
 *         negotiatePrice:
 *           type: boolean
 *           example: true
 *         priceRange:
 *           type: integer
 *           example: 800
 *         savedStatus:
 *           type: string
 *           example: "confirmed"
 */

/**
 * @swagger
 * /api/create-order:
 *   post:
 *     summary: Create a new order
 *     tags: [Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Order'
 *     responses:
 *       201:
 *         description: Order created successfully
 *       400:
 *         description: Bad request
 */
router.post('/api/create-order', authMiddleware, authenticateRole(['buyer', 'seller']), orderController.createOrder);


/**
 * @swagger
 * /api/save-order:
 *   post:
 *     summary: Save order as draft
 *     tags: [Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Order'
 *     responses:
 *       201:
 *         description: Order saved as draft
 *       400:
 *         description: Bad request
 */
router.post('/api/save-order', authMiddleware, authenticateRole(['buyer', 'seller']), orderController.saveOrderDraft);

/**
 * @swagger
 * /api/orders/{id}:
 *   get:
 *     summary: Get an order by ID
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order retrieved successfully
 *       404:
 *         description: Order not found
 */
router.get('/api/orders/:id', orderController.getOrderById);

/**
 * @swagger
 * /api/orders:
 *   get:
 *     summary: Get all orders
 *     tags: [Orders]
 *     responses:
 *       200:
 *         description: List of all orders
 */
router.get('/api/orders', orderController.getAllOrders);
/**
 * @swagger
 * /api/saved-orders:
 *   get:
 *     summary: Get saved orders
 *     tags: [Orders]
 *     responses:
 *       200:
 *         description: List of all saved orders
 */
router.get('/api/saved-orders', authMiddleware, authenticateRole(['buyer', 'seller']), orderController.getAllSavedOrders);

/**
 * @swagger
 * /api/orders/{id}:
 *   put:
 *     summary: Update an order by ID
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Order'
 *     responses:
 *       200:
 *         description: Order updated successfully
 *       404:
 *         description: Order not found
 */
router.put('/api/orders/:id', authMiddleware, authenticateRole(['buyer', 'seller']), orderController.updateOrder);

/**
 * @swagger
 * /api/orders/{id}:
 *   delete:
 *     summary: Delete an order by ID
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order deleted successfully
 *       404:
 *         description: Order not found
 */
router.delete('/api/orders/:id', authMiddleware, authenticateRole(['buyer', 'seller']), orderController.deleteOrder);

module.exports = router;
