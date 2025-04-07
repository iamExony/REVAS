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
  router.get('/api/orders/dashboard',
    authMiddleware,
    orderController.getDashboardOrders
  );
  
  /**
   * @swagger
   * /api/orders/{id}/generate-supplier-order:
   *   post:
   *     summary: Generate supplier order document
   *     tags: [Orders]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Document generated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 docUrl:
   *                   type: string
   *                   example: "https://storage.example.com/documents/order_123.pdf"
   *       400:
   *         description: Order not in correct status
   *       403:
   *         description: Forbidden - Account manager access required
   *       404:
   *         description: Order not found
   */
  router.post('/api/orders/:id/generate-supplier-order',
    authMiddleware,
    authenticateRole(['buyer', 'seller']),
    orderController.generateSupplierOrder
  );
  
  /**
   * @swagger
   * /api/orders/{id}/initiate-signing:
   *   post:
   *     summary: Initiate document signing process
   *     tags: [Orders]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Signing initiated
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 signingUrl:
   *                   type: string
   *                   example: "https://docusign.example.com/sign/123"
   *       400:
   *         description: Document not ready for signing
   *       403:
   *         description: Forbidden
   *       404:
   *         description: Order not found
   */

  //here is for the signing
/*   router.post('/api/orders/:id/initiate-signing',
    authMiddleware,
    authenticateRole(['buyer', 'supplier', 'account_manager_buyer', 'account_manager_supplier']),
    orderController.initiateSigning
  ); */
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
 *         supplierName:
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
