const express = require('express');
const { register, login, forgotPassword, resetPassword } = require('../controllers/authController');
const { registerAccountManager, loginAccountManager, validateAccountManagerRole} = require('../controllers/accountManagerController');
const { authMiddleware, authenticateRole } = require('../middleware/authMiddleware');
const { loginAdmin } = require('../controllers/adminController');


const router = express.Router();
/**
 * @swagger
 * tags:
 *   - name: Account Managers
 *     description: Authentication endpoints
 */

//Admin
/**
 * @swagger
 * /admin/login:
 *   post:
 *     summary: Login an Admin
 *     tags: [Admin] 
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: hello@adminrevas.com
 *               password:
 *                 type: string
 *                 example: "@Adminrevas1"
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 *       500:
 *         description: Internal server error
 */

router.post('/admin/login', loginAdmin);

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
 *                 enum: [Super Admin, Account Manager, Buyer, Supplier]
 *                 example: buyer
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Bad request (e.g., passwords do not match, email already exists)
 *       500:
 *         description: Internal server error
 */
/* router.post('/account-managers/register', registerAccountManager); */
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

// Secure route example for account managers
router.get('/account-managers/dashboard', authMiddleware, authenticateRole(['Account Manager Buyer', 'Account Manager Supplier']), (req, res) => {
  res.json({ message: 'Welcome to Account Manager Dashboard' });
});

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

// Protected route example
router.get('/profile', authMiddleware, (req, res) => {
  res.json({ message: 'This is a protected route', user: req.user });
});

/**
 * @swagger
 * /forgot-password:
 *   post:
 *     summary: Request a password reset link
 *     tags: [Users, Account Managers] 
 *     description: Sends a password reset link to the user's email address.
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
 *                 example: ezeonyemaechianthony@gmail.com
 *                 description: The email address of the user requesting a password reset.
 *     responses:
 *       200:
 *         description: Password reset email sent successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Password reset email sent
 *       404:
 *         description: User not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: User not found
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Internal server error
 */
router.post('/forgot-password', forgotPassword);

/**
 * @swagger
 * /reset-password/{token}:
 *   post:
 *     summary: Reset user password
 *     tags: [Users, Account Managers] 
 *     description: Resets the user's password using a valid reset token.
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: The reset token sent to the user's email.
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
 *                 description: The new password.
 *               confirmPassword:
 *                 type: string
 *                 example: newpassword123
 *                 description: The new password confirmation.
 *     responses:
 *       200:
 *         description: Password reset successful.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Password reset successful
 *       400:
 *         description: Invalid or expired token, or passwords do not match.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Invalid or expired token
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Internal server error
 */
router.post('/reset-password/:token', resetPassword);

module.exports = router;