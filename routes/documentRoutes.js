const express = require('express');
const router = express.Router();
const documentController = require('../controllers/documentController');
const { authMiddleware, authenticateRole } = require('../middleware/authMiddleware');


/**
 * @swagger
 * /api/documents/download:
 *   get:
 *     summary: Download a generated PDF
 *     tags: [Documents]
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         schema:
 *           type: string
 *           format: uri
 *     responses:
 *       302:
 *         description: Redirects to downloadable PDF
 *       404:
 *         description: PDF not found
 */
router.get('/api/documents/download', async (req, res) => {
    try {
      const docUrl = req.query.url;
      
      // Extract public ID from Cloudinary URL
      const parts = docUrl.split('/upload/');
      const publicId = parts[1].replace('.pdf', '');
      
      // Generate signed download URL
      const downloadUrl = cloudinary.url(publicId, {
        resource_type: 'raw',
        secure: true,
        sign_url: true,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        transformation: [{ flags: 'attachment' }]
      });
      
      res.redirect(downloadUrl);
    } catch (error) {
      res.status(400).json({ error: 'Invalid document URL' });
    }
  });



 /* @swagger
 * /orders/{orderId}/documents/{docType}/sign:
 *   post:
 *     summary: Initiate document signing process
 *     description: Generates a document and initiates the signing process via DocuSeal
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the order
 *       - in: path
 *         name: docType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [sales_order, purchase_order, contract]
 *         description: Type of document to generate
 *     responses:
 *       201:
 *         description: Signing process initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 documentId:
 *                   type: string
 *                   format: uuid
 *                   example: "a1b2c3d4-e5f6-7890-g1h2-i3j4k5l6m7n8"
 *                 signingUrl:
 *                   type: string
 *                   format: url
 *                   example: "https://docuseal.co/d/abc123"
 *                 fileUrl:
 *                   type: string
 *                   format: url
 *                   example: "https://storage.googleapis.com/your-bucket/documents/order_123.pdf"
 *       400:
 *         description: Invalid document type or order status
 *       403:
 *         description: Forbidden - User doesn't have permission
 *       404:
 *         description: Order not found
 *       500:
 *         description: Internal server error
 */
router.post('/orders/:orderId/documents/:docType/sign', 
  authMiddleware, 
  documentController.initiateSigning
);

/**
 * @swagger
 * /docuseal/webhook:
 *   post:
 *     summary: DocuSeal webhook endpoint
 *     description: Receives webhook events from DocuSeal (signing completions, etc.)
 *     tags: [Documents]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DocuSealWebhook'
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       401:
 *         description: Invalid webhook signature
 *       500:
 *         description: Error processing webhook
 */
router.post('/docuseal/webhook', 
  express.json(), 
  documentController.handleWebhook
);

/**
 * @swagger
 * /documents/{documentId}/status:
 *   get:
 *     summary: Get document signing status
 *     description: Returns the current status of a document including signing progress
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID of the document
 *     responses:
 *       200:
 *         description: Document status retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [draft, generated, pending_signatures, partially_signed, fully_signed, expired]
 *                   example: "pending_signatures"
 *                 docuSealStatus:
 *                   type: string
 *                   description: Current status from DocuSeal (if available)
 *                   example: "waiting_for_signers"
 *                 fileUrl:
 *                   type: string
 *                   description: URL to access the document
 *                   example: "https://storage.googleapis.com/your-bucket/documents/signed_contract_123.pdf"
 *       404:
 *         description: Document not found
 *       500:
 *         description: Error retrieving status
 */
router.get('/documents/:documentId/status', 
  authMiddleware, 
  documentController.getDocumentStatus
);

/**
 * @swagger
 * /{id}/generate-order-document:
 *   post:
 *     summary: Generate sales order document
 *     description: Generates a sales order PDF and stores it in Firebase Storage
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the order
 *     responses:
 *       200:
 *         description: Sales order generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Sales order generated successfully"
 *                 docUrl:
 *                   type: string
 *                   format: url
 *                   example: "https://storage.googleapis.com/your-bucket/documents/sales_order_123.pdf"
 *       400:
 *         description: Order must be in 'matched' status
 *       403:
 *         description: Forbidden - Only buyer account managers can generate sales orders
 *       404:
 *         description: Order not found
 *       500:
 *         description: Error generating document
 */
router.post('/:id/generate-order-document',
  authMiddleware,
  authenticateRole(['buyer', 'supplier']),
  documentController.generateSalesOrder
);

/**
 * @swagger
 * components:
 *   schemas:
 *     DocuSealWebhook:
 *       type: object
 *       properties:
 *         event_type:
 *           type: string
 *           enum: [submission_completed, submission_viewed, submission_opened]
 *           example: "submission_completed"
 *         data:
 *           type: object
 *           properties:
 *             submission:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 status:
 *                   type: string
 *                 documents:
 *                   type: array
 *                   items:
 *                     type: object
 *               required: [id]
 *           required: [submission]
 *       required: [event_type, data]
 */

module.exports = router;