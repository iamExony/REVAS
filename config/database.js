const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');

dotenv.config();


const sequelize = new Sequelize(process.env.DB_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false, // Render uses self-signed SSL certificates
    },
  },
});

module.exports = sequelize;
