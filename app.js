const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const swaggerSetup = require('./swagger/swagger');
const helmet = require('helmet');
const orderRoutes = require("./routes/orderRoutes");
require('dotenv').config()
/* const rateLimit = require('express-rate-limit'); */


const app = express();



/* const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 login attempts per windowMs
  message: "Too many login attempts. Try again later."
}); */

app.use(helmet());
app.use(cors());
/* app.use(cors({
  origin: 'https://yourfrontend.com', // Only allow your frontend
  credentials: true
})); */
app.use(express.json());

app.use('/api', authRoutes);
app.use('/api', productRoutes); 
app.use("/api", orderRoutes);

swaggerSetup(app);

app.use((req, res, next) => {
    console.log(`Incoming request: ${req.method} ${req.url}`);
    next();
  });

module.exports = app;