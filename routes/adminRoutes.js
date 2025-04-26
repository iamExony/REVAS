const express = require('express');
const  {loginAdmin}  = require('../controllers/adminController');


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
 * /admin:
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

router.post('/admin', loginAdmin);


module.exports = router;