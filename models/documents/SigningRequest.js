// models/Document.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const SigningRequest = sequelize.define('SigningRequest', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'completed', 'expired', 'revoked'),
    defaultValue: 'pending'
  },
  initiatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  completedAt: DataTypes.DATE,
  signatureData: DataTypes.TEXT // Store signature image/coordinates
});

SigningRequest.associate = (models) => {
  SigningRequest.belongsTo(models.Document, {
    foreignKey: 'documentId',
    as: 'document'
  });
  SigningRequest.belongsTo(models.User, {
    foreignKey: 'userId',
    as: 'user'
  });
};

module.exports = SigningRequest;