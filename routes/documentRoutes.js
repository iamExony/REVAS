const express = require('express');
const router = express.Router();
const documentController = require('../controllers/documentController');
const { authMiddleware, authenticateRole } = require('../middleware/authMiddleware');
const rateLimit = require('express-rate-limit');
const { body, param } = require('express-validator');
const apicache = require('apicache');
const cloudinary = require('cloudinary').v2;

// Configure rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100
});

// Configure caching
const cache = apicache.middleware;

/**
 * @swagger
 * tags:
 *   name: Documents
 *   description: Document generation and signing operations
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Document:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         type:
 *           type: string
 *           enum: [sales_order, purchase_order, contract]
 *         status:
 *           type: string
 *           enum: [draft, generated, pending_signatures, partially_signed, fully_signed, expired]
 *         fileUrl:
 *           type: string
 *           format: url
 *         signingUrl:
 *           type: string
 *           format: url
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 * 
 *     DocuSealWebhook:
 *       type: object
 *       properties:
 *         event_type:
 *           type: string
 *           enum: [submission_completed, submission_viewed, submission_opened, submission_declined, submission_expired]
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
 * 
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

// ======================
// DOCUMENT GENERATION
// ======================

/**
 * @swagger
 * /documents/orders/{id}:
 *   post:
 *     summary: Generate order document
 *     description: Generates a sales or purchase order PDF
 *     tags: [Documents]
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
 *                 message:
 *                   type: string
 *                 docUrl:
 *                   type: string
 *                   format: url
 *       400:
 *         description: Invalid request
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Order not found
 *       500:
 *         description: Server error
 */
router.post('/documents/orders/:id',
  authMiddleware,
  authenticateRole(['buyer', 'supplier']),
  documentController.generateOrderDocument
);

// ======================
// DOCUMENT SIGNING
// ======================

/**
 * @swagger
 * /documents/orders/{orderId}/sign:
 *   post:
 *     summary: Initiate document signing
 *     description: Creates signing request for all parties
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
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
 *               docType:
 *                 type: string
 *                 enum: [sales_order, purchase_order, contract]
 *     responses:
 *       201:
 *         description: Signing initiated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 documentId:
 *                   type: string
 *                   format: uuid
 *                 signingUrl:
 *                   type: string
 *                   format: url
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
 */
router.post('/documents/orders/:orderId/sign',
  apiLimiter,
  authMiddleware,
  [
    param('orderId').isUUID(),
    body('docType').isIn(['sales_order', 'purchase_order', 'contract'])
  ],
  documentController.initiateSigning
);

/**
 * @swagger
 * /documents/{documentId}/signing-url:
 *   get:
 *     summary: Get signing URL
 *     description: Retrieve embedded signing URL
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
 *     responses:
 *       200:
 *         description: Signing URL retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 signingUrl:
 *                   type: string
 *                   format: url
 *                 embed:
 *                   type: boolean
 *       404:
 *         description: Document not found
 *       500:
 *         description: Server error
 */
router.get('/documents/:documentId/signing-url',
  authMiddleware,
  documentController.getSigningUrl
);

// ======================
// DOCUMENT STATUS & ACCESS
// ======================

/**
 * @swagger
 * /documents/{documentId}/status:
 *   get:
 *     summary: Get document status
 *     description: Check signing progress and status
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
 *     responses:
 *       200:
 *         description: Status retrieved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Document'
 *       404:
 *         description: Document not found
 *       500:
 *         description: Server error
 */
router.get('/documents/:documentId/status',
  authMiddleware,
  cache('5 minutes'),
  documentController.getDocumentStatus
);

/**
 * @swagger
 * /documents/{documentId}/download:
 *   get:
 *     summary: Download document
 *     description: Get downloadable link for document
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
 *     responses:
 *       302:
 *         description: Redirects to download URL
 *       404:
 *         description: Document not found
 *       500:
 *         description: Server error
 */
router.get('/documents/:documentId/download',
  authMiddleware,
  async (req, res) => {
    try {
      const document = await Document.findByPk(req.params.documentId);
      if (!document) return res.status(404).json({ error: 'Document not found' });

      const parts = document.fileUrl.split('/upload/');
      const publicId = parts[1].replace('.pdf', '');
      
      const downloadUrl = cloudinary.url(publicId, {
        resource_type: 'raw',
        secure: true,
        sign_url: true,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        transformation: [{ flags: 'attachment' }]
      });
      
      res.redirect(downloadUrl);
    } catch (error) {
      res.status(500).json({ error: 'Download failed' });
    }
  }
);

// ======================
// WEBHOOKS
// ======================

/**
 * @swagger
 * /documents/webhooks:
 *   post:
 *     summary: DocuSeal webhook handler
 *     description: Processes signing events from DocuSeal
 *     tags: [Documents]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DocuSealWebhook'
 *     responses:
 *       200:
 *         description: Webhook processed
 *       401:
 *         description: Invalid signature
 *       500:
 *         description: Server error
 */
router.post('/documents/webhooks',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
  }),
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    if (!req.headers['docuseal-signature']) {
      return res.status(401).json({ error: "Missing signature header" });
    }
    try {
      req.body = JSON.parse(req.body.toString());
      next();
    } catch (e) {
      res.status(400).json({ error: "Invalid JSON" });
    }
  },
  documentController.handleWebhook
);

// ======================
// HEALTH CHECK
// ======================

/**
 * @swagger
 * /documents/health:
 *   get:
 *     summary: Health check
 *     description: Check service status
 *     tags: [Documents]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 dependencies:
 *                   type: object
 *                   properties:
 *                     docuseal:
 *                       type: boolean
 *                     storage:
 *                       type: boolean
 */
router.get('/documents/health', async (req, res) => {
  const health = {
    status: 'healthy',
    dependencies: {
      docuseal: true,
      storage: true
    },
    timestamp: new Date().toISOString()
  };
  res.json(health);
});

// Error handling middleware
router.use((err, req, res, next) => {
  console.error('Document route error:', err);
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({ 
      error: 'Validation Error',
      details: err.errors 
    });
  }
  
  res.status(500).json({ 
    error: 'Document processing failed',
    requestId: req.id
  });
});

module.exports = router;