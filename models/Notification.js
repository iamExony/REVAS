const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Notification = sequelize.define('Notification', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {  // 👈 Add this field (must match your DB column name)
    type: DataTypes.UUID,
    references: { model: 'Users', key: 'id' },
    allowNull: false  // or true if optional
  },
  orderId: {  // 👈 Also add this for consistency
    type: DataTypes.UUID,
    references: { model: 'Orders', key: 'id' },
    allowNull: true
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM(
      'order_created',       // When buyer AM creates order
      'status_changed',      // When supplier changes status (matched→document_phase)
      'document_generated',  // When buyer AM generates supplier order
      'signature_requested', // When buyer/supplier needs to sign
      'signature_completed', // When counterparty completes signing
      'order_processing',    // When status moves to processing
      'order_completed',      // Final completion
      'submission_declined',
      'submission_expired',
    ),
    allowNull: false
  },
  isRead: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  triggeredById: {  // User who triggered the notification
    type: DataTypes.UUID,
    references: { model: 'Users', key: 'id' },
    allowNull: true
  },
  metadata: {  // Stores dynamic data like { status: "matched", documentUrl: "..." }
    type: DataTypes.JSONB,
    allowNull: true
  },
  createdAt: {  // Explicit timestamp for sorting
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
});

Notification.associate = (models) => {
  Notification.belongsTo(models.User, {
    foreignKey: 'userId',
    as: 'recipient'
  });
  
  Notification.belongsTo(models.User, {
    foreignKey: 'triggeredById',
    as: 'triggeredBy'
  });

  Notification.belongsTo(models.Order, {
    foreignKey: 'orderId',
    as: 'order'
  });
};

module.exports = Notification;