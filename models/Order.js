const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Order = sequelize.define('Order', {
  id: { 
    type: DataTypes.UUID, 
    defaultValue: DataTypes.UUIDV4, 
    allowNull: false, 
    primaryKey: true 
  },
  companyName: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false },
  location: { type: DataTypes.STRING, allowNull: false },
  product: { type: DataTypes.STRING, allowNull: false },
  capacity: { type: DataTypes.INTEGER, allowNull: false },
  pricePerTonne: { type: DataTypes.INTEGER, allowNull: false },
  supplier: { type: DataTypes.STRING, allowNull: false },
  supplierPrice: { type: DataTypes.INTEGER, allowNull: false },
  shippingCost: { type: DataTypes.INTEGER, allowNull: false },
  negotiatePrice: { type: DataTypes.BOOLEAN, allowNull: true },
  priceRange: { type: DataTypes.INTEGER, allowNull: true },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'pending' },

  userId: {  // Foreign key to User
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'Users', key: 'id' }
  }
});

// Associations
Order.associate = (models) => {
  Order.belongsTo(models.User, { foreignKey: 'userId', onDelete: 'CASCADE' });
};

module.exports = Order;
