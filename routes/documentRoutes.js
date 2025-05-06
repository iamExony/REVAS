const express = require('express');
const router = express.Router();
const documentController = require('../controllers/documentController');
const { authMiddleware, authenticateRole } = require('../middleware/authMiddleware');
const multer = require('multer');
const jwt = require('jsonwebtoken');


// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

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
 *         signedFileRef:
 *           type: string
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
 *     DocumentResponse:
 *       type: object
 *       properties:
 *         url:
 *           type: string
 *           format: url
 *         public_id:
 *           type: string
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
/**
 * @swagger
 * /documents/orders/{orderId}/upload:
 *   post:
 *     summary: Upload signed document (Client)
 *     description: Upload a signed version of the document (for clients only)
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               signedDocument:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Document uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 signedUrl:
 *                   type: string
 *                   format: url
 *                   example: "https://cloudinary.com/signed_document.pdf"
 *       400:
 *         description: Invalid file format or no file uploaded
 *       403:
 *         description: Forbidden (not authorized for this order)
 *       404:
 *         description: Order not found
 *       500:
 *         description: Internal server error
 */
router.post('/documents/orders/:orderId/upload',
  authMiddleware,
  upload.single('signedDocument'),
  documentController.uploadSignedDocument
);
// Client Documents Endpoint
/**
 * @swagger
 * /documents/client:
 *   get:
 *     summary: Get documents requiring client signature
 *     description: Returns all documents that need to be signed by the authenticated client (Buyer/Supplier)
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of documents requiring signature
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ClientDocument'
 *       403:
 *         description: Forbidden (account managers cannot access this endpoint)
 *       500:
 *         description: Server error
 */
router.get('/documents/client',
  authMiddleware,
  documentController.getClientDocuments
);
/**
 * @swagger
 * /documents/:orderId/regenerate-url:
 *   get:
 *     summary: Re-generate document URL (PDF)
 *     description: Re-generate URL
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *     responses:
 *       200:
 *         description: PDF document
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       403:
 *         description: Forbidden (not authorized for this order)
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal server error
 */
router.get('/documents/:orderId/regenerate-url',
  authMiddleware,
  documentController.regenerateSignedUrl
);
/**
 * @swagger
 * /documents/:orderId/document-status:
 *   get:
 *     summary: Get signed document status
 *     description: Get signed document status
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *     responses:
 *       200:
 *         description: PDF document
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       403:
 *         description: Forbidden (not authorized for this order)
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal server error
 */
router.get('/documents/:orderId/document-status',
  authMiddleware,
  documentController.getSigningStatus
);

/**
 * @swagger
 * /documents/signed:
 *   get:
 *     summary: Get signed documents
 *     description: Returns all documents signed Account Managers
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of signed documents
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   orderId:
 *                     type: string
 *                   type:
 *                     type: string
 *                   status:
 *                     type: string
 *                   signedAt:
 *                     type: string
 *                     format: date-time
 *                   signedDocumentUrl:
 *                     type: string
 *                     format: url
 *                   requiresCounterSignature:
 *                     type: boolean
 *                   fullySigned:
 *                     type: boolean
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Server error
 */
router.get('/documents/signed',
  authMiddleware,
  documentController.getSignedDocuments
);

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