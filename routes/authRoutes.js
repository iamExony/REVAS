const express = require('express');
const { 
  register, 
  login, 
  forgotPassword, 
  resetPassword, 
  updatePassword,
  setInitialPassword
} = require('../controllers/authController');
const { 
  registerAccountManager, 
  loginAccountManager, 
  validateAccountManagerRole,
  getManagedClients,
  assignClients,
  removeClient
} = require('../controllers/accountManagerController');
const { authMiddleware, authenticateRole } = require('../middleware/authMiddleware');

const router = express.Router();

// Account Manager Registration and Login
/**
 * @swagger
 * tags:
 *   - name: Account Managers
 *     description: Account Manager endpoints
 *   - name: Users
 *     description: User endpoints
 *   - name: Authentication
 *     description: Authentication endpoints for both users and account managers
 */

/**
 * @swagger
 * /account-managers/register:
 *   post:
 *     summary: Register as Account Manager
 *     tags: [Account Managers] 
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: Onyemaechi
 *               lastName:
 *                 type: string
 *                 example: Eze
 *               email:
 *                 type: string
 *                 example: ezeonymaechimanager@gmail.com
 *               password:
 *                 type: string
 *                 example: "@iamExony2024"
 *               confirmPassword:
 *                 type: string
 *                 example: "@iamExony2024"
 *               role:
 *                 type: string
 *                 enum: [buyer, supplier]
 *                 example: buyer
 *     responses:
 *       201:
 *         description: Account Manager registered successfully
 *       400:
 *         description: Bad request (e.g., passwords do not match, email already exists, invalid role)
 *       500:
 *         description: Internal server error
 */
router.post('/account-managers/register', async (req, res) => {
  try {
    const { role } = req.body;
    validateAccountManagerRole(role);
    await registerAccountManager(req, res);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /account-managers/login:
 *   post:
 *     summary: Login an Account Manager
 *     tags: [Account Managers] 
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: ezeonymaechimanager@gmail.com
 *               password:
 *                 type: string
 *                 example: "@iamExony2024"
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 *       500:
 *         description: Internal server error
 */
router.post('/account-managers/login', loginAccountManager);

// Account Manager Client Management
/**
 * @swagger
 * /account-managers/clients:
 *   get:
 *     summary: Get all clients managed by the account manager
 *     tags: [Account Managers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of managed clients
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not an account manager)
 *       500:
 *         description: Internal server error
 */
router.get('/account-managers/clients', 
  authMiddleware, 
  authenticateRole(['buyer', 'supplier']),
  getManagedClients
);

/**
 * @swagger
 * /account-managers/clients:
 *   post:
 *     summary: Assign clients to the account manager
 *     tags: [Account Managers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - clientIds
 *             properties:
 *               clientIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 example: ["550e8400-e29b-41d4-a716-446655440000"]
 *                 description: Array of client IDs to assign
 *     responses:
 *       200:
 *         description: Clients assigned successfully
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not an account manager)
 *       500:
 *         description: Internal server error
 */
router.post('/account-managers/clients', 
  authMiddleware, 
  authenticateRole(['buyer', 'supplier']),
  assignClients
);

/**
 * @swagger
 * /account-managers/clients/{clientId}:
 *   delete:
 *     summary: Remove a client from the account manager's managed clients
 *     tags: [Account Managers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clientId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: UUID of the client to remove
 *     responses:
 *       200:
 *         description: Client removed successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not an account manager)
 *       404:
 *         description: Client not found in managed clients
 *       500:
 *         description: Internal server error
 */
router.delete('/account-managers/clients/:clientId', 
  authMiddleware, 
  authenticateRole(['buyer', 'supplier']),
  removeClient
);

// User Registration and Login
/**
 * @swagger
 * /register:
 *   post:
 *     summary: Register a new user
 *     tags: [Users] 
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: Onyemaechi
 *               lastName:
 *                 type: string
 *                 example: Eze
 *               email:
 *                 type: string
 *                 example: ezeonyemaechianthony@gmail.com
 *               password:
 *                 type: string
 *                 example: "@iamExony2024"
 *               confirmPassword:
 *                 type: string
 *                 example: "@iamExony2024"
 *               role:
 *                 type: string
 *                 example: Manager
 *               clientType:
 *                 type: string
 *                 enum: [Buyer, Supplier]
 *                 example: Buyer
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Bad request (e.g., passwords do not match, email already exists)
 *       500:
 *         description: Internal server error
 */
router.post('/register', register);

/**
 * @swagger
 * /login:
 *   post:
 *     summary: Login a user
 *     tags: [Users] 
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: ezeonyemaechianthony@gmail.com
 *               password:
 *                 type: string
 *                 example: "@iamExony2024"
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 *       500:
 *         description: Internal server error
 */
router.post('/login', login);

// Password Reset (for both users and account managers)
/**
 * @swagger
 * /forgot-password:
 *   post:
 *     summary: Request a password reset link
 *     tags: [Authentication] 
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: Password reset email sent
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.post('/forgot-password', forgotPassword);

/**
 * @swagger
 * /reset-password:
 *   post:
 *     summary: Reset password using either token or code
 *     tags: [Authentication]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: false
 *         schema:
 *           type: string
 *       - in: query
 *         name: code
 *         required: false
 *         schema:
 *           type: integer
 *           format: int32
 *           example: 123456
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               password:
 *                 type: string
 *                 example: newpassword123
 *               confirmPassword:
 *                 type: string
 *                 example: newpassword123
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid or expired token/code or passwords don't match
 *       500:
 *         description: Internal server error
 */
router.post('/reset-password', resetPassword);

/**
 * @swagger
 * /update-password:
 *   post:
 *     summary: Update user password
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 example: newpassword123
 *               newPassword:
 *                 type: string
 *                 example: newpassword123
 *     responses:
 *       200:
 *         description: Password updated successfully
 *       401:
 *         description: Invalid current password
 *       400:
 *         description: New password same as current
 */
router.post('/update-password', authMiddleware, updatePassword);

/**
 * @swagger
 * /initial-password:
 *   post:
 *     summary: Set initial password (first login)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newPassword
 *             properties:
 *               newPassword:
 *                 type: string
 *                 example: newpassword123
 *               confirmPassword:
 *                 type: string
 *                 example: newpassword123
 *     responses:
 *       200:
 *         description: Password set successfully
 *       400:
 *         description: Password already changed
 */
router.post('/initial-password', authMiddleware, setInitialPassword);

module.exports = router;