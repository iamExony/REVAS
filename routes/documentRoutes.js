const express = require('express');
const router = express.Router();
const documentController = require('../controllers/documentController');
const { authMiddleware, authenticateRole } = require('../middleware/authMiddleware');
const multer = require('multer');


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

// ======================
// DOCUMENT DOWNLOAD/UPLOAD
// ======================



/**
 * @swagger
 * /documents/orders/{orderId}/upload:
 *   post:
 *     summary: Upload signed document
 *     description: Uploads a signed version of the document
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
 *       400:
 *         description: Invalid file format or no file uploaded
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Server error
 */
router.post('/documents/orders/:orderId/upload',
  authMiddleware,
  upload.single('signedDocument'),
  documentController.uploadSignedDocument
);

// ======================
// DOCUMENT ACCESS
// ======================

/**
 * @swagger
 * /documents/orders/{orderId}/signed:
 *   get:
 *     summary: Get signed document (User)
 *     description: Returns a temporary access URL for the signed document
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Returns signed document URL
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DocumentResponse'
 *       403:
 *         description: Forbidden - user not authorized
 *       404:
 *         description: Signed document not found
 *       500:
 *         description: Server error
 */
router.get('/documents/orders/:orderId/signed',
  authMiddleware,
  documentController.getUserSignedDocument
);

/**
 * @swagger
 * /documents/admin/orders/{orderId}/signed:
 *   get:
 *     summary: Get signed document (Admin)
 *     description: Admin access to signed documents
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Returns signed document URL
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DocumentResponse'
 *       403:
 *         description: Forbidden - admin access required
 *       404:
 *         description: Signed document not found
 *       500:
 *         description: Server error
 */
router.get('/documents/admin/orders/:orderId/signed',
  authMiddleware,
  authenticateRole(['admin']),
  documentController.getSignedDocument
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