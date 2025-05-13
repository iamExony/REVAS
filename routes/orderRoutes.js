const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { authMiddleware, authenticateRole } = require('../middleware/authMiddleware');
const parseArrays = require("../middleware/arrayParserMiddleware");


/**
 * @swagger
 * /orders/{id}/status:
 *   patch:
 *     summary: Update order status (Account Managers only)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
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
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [matched, document_phase, processing, completed]
 *                 example: "matched"
 *     responses:
 *       200:
 *         description: Order status updated
 *       400:
 *         description: Invalid status transition
 *       403:
 *         description: Forbidden - Account manager access required
 *       404:
 *         description: Order not found
 */
router.patch('orders/:id/status', 
    authMiddleware, 
    authenticateRole(['buyer', 'supplier']),
    orderController.updateOrderStatus
  );
  
  /**
   * @swagger
   * /api/orders/dashboard:
   *   get:
   *     summary: Get orders for dashboard view
   *     tags: [Orders]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Orders retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/Order'
   *       403:
   *         description: Forbidden
   */
  router.get('/api/orders/dashboard',authMiddleware,
    orderController.getDashboardOrders);
  
/**
 * @swagger
 * components:
 *   schemas:
 *     Order:
 *       type: object
 *       properties:
 *         buyerId:
 *           type: string
 *           example: "9e1a3407-12ca-4236-bedf-e6b470961ead"
 *         supplierId:
 *           type: string
 *           example: "7a8ac7df-df38-4ed1-b4bf-798121bd1bc4"
 *         buyerName:
 *           type: string
 *           example: "DANIELELOMA Production Inc."
 *         buyerLocation:
 *           type: string
 *           example: "Abuja, Nigeria"
 *         supplierLocation:
 *           type: string
 *           example: "Lagos, Nigeria"
 *         product:
 *           type: string
 *           example:  "PET"
 *         capacity:
 *           type: integer
 *           example: 3000
 *         pricePerTonne:
 *           type: integer
 *           example: 400
 *         shippingType:
 *           type: string
 *           example: "FOB"
 *         paymentTerms:
 *           type: integer
 *           example: 40
 *         supplierName:
 *           type: string
 *           example: "JUDITHEJIA Flakes Inc."
 *         supplierPrice:
 *           type: integer
 *           example: 2000
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
 * /create-order:
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
router.post('/create-order', authMiddleware, authenticateRole(['buyer', 'supplier']), parseArrays, orderController.createOrder);


/**
 * @swagger
 * /save-order:
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
router.post('/save-order', authMiddleware, authenticateRole(['buyer', 'supplier']), parseArrays, orderController.saveOrderDraft);

/**
 * @swagger
 * /single-orders/{id}:
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
router.get('/single-orders/:id', orderController.getOrderById);

/**
 * @swagger
 * /saved-orders:
 *   get:
 *     summary: Get saved orders
 *     tags: [Orders]
 *     responses:
 *       200:
 *         description: List of all saved orders
 */
router.get('/saved-orders', authMiddleware, authenticateRole(['buyer', 'supplier']), orderController.getAllSavedOrders);

/**
 * @swagger
 * /update-orders/{id}:
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
router.put('/update-orders/:id', authMiddleware, authenticateRole(['buyer', 'supplier ']), parseArrays, orderController.updateOrder);

/**
 * @swagger
 * /delete-orders/{id}:
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
router.delete('/delete-orders/:id', authMiddleware, authenticateRole(['buyer', 'supplier']), orderController.deleteOrder);

// Add these to your orderRouter.js

/**
 * @swagger
 * /orders/search:
 *   get:
 *     summary: Search and filter orders
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: companyName
 *         schema:
 *           type: string
 *       - in: query
 *         name: product
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [not_matched, matched, document_phase, processing, completed]
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Orders matching criteria
 */
router.get('/orders/search', authMiddleware, orderController.searchOrders);

/**
 * @swagger
 * /orders/{id}/price:
 *   patch:
 *     summary: Update order price
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
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
 *             type: object
 *             properties:
 *               pricePerTonne:
 *                 type: number
 *     responses:
 *       200:
 *         description: Price updated
 */
router.patch('/orders/:id/price', authMiddleware, orderController.updateOrderPrice);

/**
 * @swagger
 * /orders/analytics:
 *   get:
 *     summary: Get order analytics
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
 *                 totalOrders:
 *                   type: integer
 *                 pendingOrders:
 *                   type: integer
 *                 completedOrders:
 *                   type: integer
 */
router.get('/orders/analytics', authMiddleware, orderController.getOrderAnalytics);
module.exports = router;
