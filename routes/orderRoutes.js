const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { authMiddleware, authenticateRole } = require('../middleware/authMiddleware');


/**
 * @swagger
 * /api/orders/{id}/status:
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
router.patch('/api/orders/:id/status', 
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
 *           example: "c3707139-7d78-4802-b8c8-fe526bbcf313"
 *         supplierId:
 *           type: string
 *           example: "0d4c98ed-6f7a-4fb0-b2a0-addb0b1dbd06"
 *         buyerName:
 *           type: string
 *           example: "Rivers State Plastic"
 *         location:
 *           type: string
 *           example: "Ebonyi State, Nigeria"
 *         product:
 *           type: string
 *           example:  "YUP"
 *         capacity:
 *           type: integer
 *           example: 4000
 *         pricePerTonne:
 *           type: integer
 *           example: 600
 *         shippingType:
 *           type: string
 *           example: "FOB"
 *         paymentTerms:
 *           type: integer
 *           example: 50
 *         supplierName:
 *           type: string
 *           example: "PET Flakes Inc."
 *         supplierPrice:
 *           type: integer
 *           example: 500
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
router.post('/create-order', authMiddleware, authenticateRole(['buyer', 'supplier']), orderController.createOrder);


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
router.post('/save-order', authMiddleware, authenticateRole(['buyer', 'supplier']), orderController.saveOrderDraft);

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
router.put('/update-orders/:id', authMiddleware, authenticateRole(['buyer', 'supplier ']), orderController.updateOrder);

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

module.exports = router;
