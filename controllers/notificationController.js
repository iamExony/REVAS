const Notification = require("../models/Notification");
const { Op } = require("sequelize");

/**
 * @route GET /notifications
 * @description Get all notifications for a user (with pagination & filters)
 */
exports.getUserNotifications = async (req, res) => {
  try {
    const { userId, isRead, type, page = 1, limit = 10 } = req.query;

    // Validate userId format (UUID)
    if (!userId || !/^[0-9a-f-]{36}$/.test(userId)) {
      return res.status(400).json({
        success: false,
        error: "Valid userId (UUID) is required",
      });
    }

    const where = { userId };
    if (isRead) where.isRead = isRead === "true";
    if (type) where.type = type;

    const notifications = await Notification.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset: (page - 1) * limit,
      include: [
        {
          association: "recipient",
          attributes: ["id", "email"],
          required: false,
        },
        {
          association: "order",
          attributes: ["id"],
          required: false,
        },
      ],
      logging: console.log, // 👈 Debug SQL
    });

    res.json({
      success: true,
      data: notifications.rows,
      total: notifications.count,
      currentPage: parseInt(page),
      totalPages: Math.ceil(notifications.count / limit),
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * @route PATCH /notifications/:id/mark-read
 * @description Mark a notification as read
 */
exports.markAsRead = async (req, res) => {
  try {
    // Add ownership verification (in markAsRead/delete)
    const notification = await Notification.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id, // Ensure user owns the notification
      },
    });
    if (!notification) {
      return res
        .status(404)
        .json({ success: false, error: "Notification not found" });
    }

    // Add date range filtering (in getUserNotifications)
    const { startDate, endDate } = req.query;
    if (startDate) where.createdAt = { [Op.gte]: new Date(startDate) };
    if (endDate)
      where.createdAt = { ...where.createdAt, [Op.lte]: new Date(endDate) };

    notification.isRead = true;
    await notification.save();

    res.json({ success: true, message: "Notification marked as read" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * @route PATCH /notifications/mark-all-read
 * @description Mark all notifications as read for a user
 */
exports.markAllAsRead = async (req, res) => {
  try {
    const { userId } = req.body;

    // Return count of updated notifications
    const [affectedCount] = await Notification.update(
      { isRead: true },
      {
        where: { userId, isRead: false },
        returning: true, // For PostgreSQL
      }
    );

    res.json({
      success: true,
      message: `${affectedCount} notifications marked as read`,
    });
  } catch (error) {
    // ... error handling
  }
};

/**
 * @route DELETE /notifications/:id
 * @description Delete a notification
 */
exports.deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findByPk(req.params.id);
    if (!notification) {
      return res
        .status(404)
        .json({ success: false, error: "Notification not found" });
    }

    await notification.destroy();
    res.json({ success: true, message: "Notification deleted" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * @route POST /notifications
 * @description Create a new notification (for testing or admin use)
 */
/* exports.createNotification = async (req, res) => {
  try {
    const { userId, message, type, triggeredById, metadata } = req.body;

    const notification = await Notification.create({
      userId,
      message,
      type,
      triggeredById,
      metadata,
    });

    res.status(201).json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}; */
