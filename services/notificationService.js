const { Notification, User } = require('../models');

/**
 * Send notifications to users/account managers
 * @param {Object} options - { userId, orderId, message, type }
 */
exports.sendNotification = async ({ userId, orderId, message, type }) => {
  const user = await User.findByPk(userId);
  if (!user) return;

  await Notification.create({
    userId,
    orderId,
    message,
    type,
    isRead: false
  });

  // Real-world: Add email/SMS here (e.g., via SendGrid/Twilio)
};