const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Order = sequelize.define("Order", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false,
  },
  // Order Details
  buyerName: { type: DataTypes.STRING, allowNull: false },
  buyerLocation: { type: DataTypes.STRING, allowNull: false },
  product: {
    type: DataTypes.ARRAY(DataTypes.STRING), // Array of strings
    allowNull: false,
    defaultValue: []
  },
  capacity: { type: DataTypes.INTEGER, allowNull: false },
  pricePerTonne: { type: DataTypes.INTEGER, allowNull: false },
  paymentTerms: { type: DataTypes.INTEGER, allowNull: false },
  shippingType: { type: DataTypes.STRING, allowNull: false },
  supplierName: { type: DataTypes.STRING, allowNull: false },
  supplierLocation: { type: DataTypes.STRING, allowNull: false },
  supplierPrice: { type: DataTypes.INTEGER, allowNull: false },
  shippingCost: { type: DataTypes.INTEGER, allowNull: false },
  negotiatePrice: { type: DataTypes.BOOLEAN, allowNull: true },
  priceRange: { type: DataTypes.INTEGER, allowNull: true },

  // Status Tracking
  savedStatus: {
    type: DataTypes.STRING,
    defaultValue: "pending",
    allowNull: false,
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
    allowNull: false,
  },
  documentType: {
    type: DataTypes.ENUM("purchase_order", "sales_order", "supply_order"),
    allowNull: true,
  },

  // Document Management
  docUrl: { type: DataTypes.STRING },
  documentGeneratedAt: { type: DataTypes.DATE },

  // Signatures
  buyerSigned: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  supplierSigned: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  lastSignedAt: { type: DataTypes.DATE },

  // Relationships
  buyerId: {
    type: DataTypes.UUID,
    references: { model: "Users", key: "id" },
  },
  invoiceNumber: {
    type: DataTypes.STRING,
    allowNull: true, // Change to false if required
  },
  supplierId: {
    type: DataTypes.UUID,
    allowNull: true, // Can be null initially
    references: { model: "Users", key: "id" },
  },
  buyerAccountManagerId: {
    type: DataTypes.UUID,
    references: { model: "Users", key: "id" },
  },
  supplierAccountManagerId: {
    type: DataTypes.UUID,
    references: { model: "Users", key: "id" },
  },
  matchedById: {
    type: DataTypes.UUID,
    references: { model: "Users", key: "id" },
    allowNull: true
  }
});

// Corrected Associations
Order.associate = (models) => {
  Order.belongsTo(models.User, {
    as: "buyer",
    foreignKey: "buyerId",
    hooks: true
  });

  Order.belongsTo(models.User, {
    as: "supplier",
    foreignKey: "supplierId",
    hooks: true
  });
  Order.belongsTo(models.User, {
    as: "matchedBy",
    foreignKey: "matchedById",
    hooks: true
  });

  Order.belongsTo(models.User, {
    as: "buyerAccountManager",
    foreignKey: "buyerAccountManagerId",
  });

  Order.belongsTo(models.User, {
    as: "supplierAccountManager",
    foreignKey: "supplierAccountManagerId",
  });

  Order.hasMany(models.Notification, {
    foreignKey: "orderId",
    as: "notifications",
  });

  Order.hasMany(models.Document, {
    foreignKey: "orderId",
    as: "documents",
  });
};

module.exports = Order;
