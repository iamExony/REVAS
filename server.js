const app = require('./app');
const sequelize = require('./config/database'); // Correct path
const dotenv = require("dotenv");
dotenv.config();

const PORT = process.env.PORT || 5000;





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