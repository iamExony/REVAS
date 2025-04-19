const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: User notification management
 */

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: Get paginated notifications for a user
 *     tags: [Notifications]
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: ID of the user to fetch notifications for
 *       - in: query
 *         name: isRead
 *         schema:
 *           type: boolean
 *         description: Filter by read status (true/false)
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [order_created, status_changed, document_generated, signature_requested, signature_completed, order_processing, order_completed]
 *         description: Filter by notification type
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page
 *     responses:
 *       200:
 *         description: List of notifications with pagination info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Notification'
 *                 total:
 *                   type: integer
 *                 currentPage:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 */
router.get('/', notificationController.getUserNotifications);

/**
 * @swagger
 * /notifications:
 *   post:
 *     summary: Create a new notification (Admin/Testing)
 *     tags: [Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateNotification'
 *     responses:
 *       201:
 *         description: Notification created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Notification'
 */
router.post('/', notificationController.createNotification);

/**
 * @swagger
 * /notifications/{id}/mark-read:
 *   patch:
 *     summary: Mark a notification as read
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
router.patch('/:id/mark-read', notificationController.markAsRead);

/**
 * @swagger
 * /notifications/mark-all-read:
 *   patch:
 *     summary: Mark all user notifications as read
 *     tags: [Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *             required:
 *               - userId
 *     responses:
 *       200:
 *         description: All notifications marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
router.patch('/mark-all-read', notificationController.markAllAsRead);

/**
 * @swagger
 * /notifications/{id}:
 *   delete:
 *     summary: Delete a notification
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
router.delete('/:id', notificationController.deleteNotification);

// Swagger components (reusable schemas)
/**
 * @swagger
 * components:
 *   schemas:
 *     Notification:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         message:
 *           type: string
 *         type:
 *           type: string
 *           enum: [order_created, status_changed, document_generated, signature_requested, signature_completed, order_processing, order_completed]
 *         isRead:
 *           type: boolean
 *         triggeredById:
 *           type: string
 *           format: uuid
 *         metadata:
 *           type: object
 *         createdAt:
 *           type: string
 *           format: date-time
 *     CreateNotification:
 *       type: object
 *       required:
 *         - userId
 *         - message
 *         - type
 *       properties:
 *         userId:
 *           type: string
 *           format: uuid
 *         message:
 *           type: string
 *         type:
 *           type: string
 *           enum: [order_created, status_changed, document_generated, signature_requested, signature_completed, order_processing, order_completed]
 *         triggeredById:
 *           type: string
 *           format: uuid
 *         metadata:
 *           type: object
 */

module.exports = router;