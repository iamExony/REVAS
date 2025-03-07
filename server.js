const app = require('./app');
const sequelize = require('./config/database'); // Correct path
const managerRoutes = require('./routes/managers');
const adminRoutes = require('./routes/admin');
const dotenv = require("dotenv");
dotenv.config();

const PORT = process.env.PORT || 3000;


app.use('/api/managers', managerRoutes);
app.use('/api/admin', adminRoutes);



sequelize
  .sync()
  .then(() => {
    console.log('Database synced');
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Unable to sync database:', error);
  });