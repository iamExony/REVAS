const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Order = sequelize.define("Order", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  // Order Details
  companyName: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false },
  location: { type: DataTypes.STRING, allowNull: false },
  product: { type: DataTypes.STRING, allowNull: false },
  capacity: { type: DataTypes.INTEGER, allowNull: false },
  pricePerTonne: { type: DataTypes.INTEGER, allowNull: false },
  supplierName: { type: DataTypes.STRING, allowNull: true },
  supplierPrice: { type: DataTypes.INTEGER, allowNull: false },
  shippingCost: { type: DataTypes.INTEGER, allowNull: false },
  negotiatePrice: { type: DataTypes.BOOLEAN, allowNull: true },
  priceRange: { type: DataTypes.INTEGER, allowNull: true },
  
  // Status Tracking
  savedStatus: {
    type: DataTypes.STRING,
    defaultValue: "pending",
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM(
      "not_matched",
      "matched",
      "document_phase",
      "processing",
      "completed"
    ),
    defaultValue: "not_matched",
    allowNull: false
  },
   documentType: {
  type: DataTypes.ENUM("purchase_order", "sales_order", "supply_order"),
  allowNull: true
},
  
  // Document Management
  docUrl: { type: DataTypes.STRING },
  buyerDocuSignId: { type: DataTypes.STRING },
  supplierDocuSignId: { type: DataTypes.STRING },
  documentGeneratedAt: { type: DataTypes.DATE },
  
  // Signatures
  buyerSigned: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: false 
  },
  supplierSigned: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: false 
  },
  lastSignedAt: { type: DataTypes.DATE },
  
  // Relationships
  buyerId: {
    type: DataTypes.UUID,
    references: { model: "Users", key: "id" }
  },
  supplierId: {
    type: DataTypes.UUID,
    allowNull: true,  // Can be null initially
    references: { model: "Users", key: "id" }
  },
  buyerAccountManagerId: {
    type: DataTypes.UUID,
    references: { model: "Users", key: "id" }
  },
  supplierAccountManagerId: {
    type: DataTypes.UUID,
    references: { model: "Users", key: "id" }
  },
  createdById: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: "Users", key: "id" }
  }
});

// Corrected Associations
Order.associate = (models) => {
  Order.belongsTo(models.User, { 
    as: 'buyer',
    foreignKey: 'buyerId'
  });
  
  Order.belongsTo(models.User, {
    as: 'supplier',
    foreignKey: 'supplierId'
  });
  
  Order.belongsTo(models.User, {
    as: 'buyerAccountManager',
    foreignKey: 'buyerAccountManagerId'
  });
  
  Order.belongsTo(models.User, {
    as: 'supplierAccountManager',
    foreignKey: 'supplierAccountManagerId'
  });
  
  Order.belongsTo(models.User, {
    as: 'creator',
    foreignKey: 'createdById'
  });

  Order.hasMany(models.Notification, {
    foreignKey: 'orderId',
    as: 'notifications'
  });

  Order.hasMany(models.Document, {
    foreignKey: 'orderId',
    as: 'documents'
  });
};

module.exports = Order;