const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const User = sequelize.define("User", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    allowNull: false,
    primaryKey: true,
  },
  firstName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
    },
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  role: {
    type: DataTypes.STRING,
    allowNull: false,
    comment:
      "For users: any job title. For account managers: buyer or supplier only.",
  },
  clientType: {
    type: DataTypes.ENUM("Buyer", "Supplier"),
    allowNull: true, // Allows null for account managers
    validate: {
      isIn: [["Buyer", "Supplier"]],
    },
    comment:
      "Only required for users (Buyer, Supplier); account managers can have null.",
  },
  resetToken: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  resetTokenExpiry: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  resetCode: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  resetCodeExpiry: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  hasRegisteredProduct: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  },
  passwordChangedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  lastLogin: {
    type: DataTypes.DATE,
    allowNull: true
  },
  managedClient: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    allowNull: true,
    defaultValue: [],
  },
});
// In your User model definition
User.beforeUpdate(async (user, options) => {
  if (user.changed('password')) {
    user.passwordChangedAt = new Date();
  }
});
// Associations
User.associate = (models) => {
  User.hasOne(models.Product, {
    foreignKey: "userId",
    onDelete: "CASCADE",
  });
  User.hasMany(models.Order, {
    as: "buyerOrders",
    foreignKey: "buyerId",
  });
  User.hasMany(models.Order, {
    as: "supplierOrders",
    foreignKey: "supplierId",
  });
  User.hasMany(models.Order, {
    as: "managedBuyerOrders",
    foreignKey: "buyerAccountManagerId",
    scope: {
      role: "buyer",
    },
  });
  User.hasMany(models.Order, {
    as: "managedSupplierOrders",
    foreignKey: "supplierAccountManagerId",
    scope: {
      role: "supplier", // Filters orders where user is a supplier account manager
    },
  });
  // Add to User.associate
   User.hasMany(models.Notification, {
    foreignKey: "userId",
    as: "notifications",
  }); 

    // Documents
     User.hasMany(models.Document, {
      foreignKey: "generatedById",
      as: "generatedDocuments",
    });
    User.hasMany(models.Document, {
      foreignKey: "signedById",
      as: "signedDocuments",
    }); 
    User.hasMany(models.Order, {
      as: "matchedOrders",
      foreignKey: "matchedById"
    });
};

module.exports = User;
