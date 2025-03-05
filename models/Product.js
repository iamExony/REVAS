const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Product = sequelize.define('Product', {
  companyName: { type: DataTypes.STRING, allowNull: false },
  product: { type: DataTypes.STRING, allowNull: false },
  capacity: { type: DataTypes.INTEGER, allowNull: false },
  price: { type: DataTypes.FLOAT, allowNull: false },
  location: { type: DataTypes.STRING, allowNull: false },
  imageUrl: { 
    type: DataTypes.STRING, 
    allowNull: true, 
  },
  userId: { 
    type: DataTypes.UUID, 
    allowNull: false, 
    unique: true 
  }
});

Product.associate = (models) => {
  Product.belongsTo(models.User, { foreignKey: 'userId', onDelete: 'CASCADE' });
};

module.exports = Product;
