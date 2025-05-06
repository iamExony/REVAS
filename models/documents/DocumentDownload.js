// models/Document.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const DocumentDownload = sequelize.define('Document', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  downloadedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  userAgent: DataTypes.STRING, // Track browser/device
  ipAddress: DataTypes.STRING  // For security auditing
});

DocumentDownload.associate = (models) => {
  DocumentDownload.belongsTo(models.Document, {
    foreignKey: 'documentId',
    as: 'document'
  });
  DocumentDownload.belongsTo(models.User, {
    foreignKey: 'userId',
    as: 'user'
  });
};

module.exports = DocumentDownload;