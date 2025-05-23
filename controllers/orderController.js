const { Order, Notification, User } = require("../models");
const { Op } = require("sequelize");
const { sendEmail } = require("../utils/emailService");
const sequelize = require("../config/database");
const Document = require("../models/Document");

// ================== CREATE ORDERS  ================== //
exports.createOrder = async (req, res) => {
  try {
    // Authorization check
    if (!["buyer", "supplier"].includes(req.user.role)) {
      return res.status(403).json({
        message: "Access denied: Only account managers can create orders",
      });
    }

    // Validate required fields
    const requiredFields = [
      "buyerName",
      "product",
      "capacity",
      "pricePerTonne",
      "buyerId",
      "supplierId",
      "shippingType",
      "paymentTerms",
      "supplierName",
      "supplierPrice",
      "shippingCost",
      "negotiatePrice",
    ];

    const missingFields = requiredFields.filter((field) => !req.body[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({
        message: `Missing fields: ${missingFields.join(", ")}`,
      });
    }

    // Get account manager details
    const accountManager = await User.findByPk(req.user.id, {
      attributes: ["id", "firstName", "lastName", "email"],
    });

    // Find counterpart account manager
    const counterpartRole = req.user.role === "buyer" ? "supplier" : "buyer";
    const counterpartUserId =
      req.user.role === "buyer" ? req.body.supplierId : req.body.buyerId;

    const counterpartAccountManager = await User.findOne({
      where: {
        managedClient: { [Op.contains]: [counterpartUserId] },
        role: counterpartRole,
      },
      attributes: ["id", "firstName", "lastName", "email"],
    });

    if (!counterpartAccountManager) {
      return res.status(400).json({
        message: `${counterpartRole} account manager not found`,
      });
    }

    // Create order with both account managers
    const orderData = {
      ...req.body,
      createdById: req.user.id,
      savedStatus: "confirmed",
      status: "pending_approval",
      buyerAccountManagerId:
        req.user.role === "buyer" ? req.user.id : counterpartAccountManager.id,
      supplierAccountManagerId:
        req.user.role === "supplier"
          ? req.user.id
          : counterpartAccountManager.id,
    };

    const order = await Order.create(orderData);

    // Get all users involved (buyer, supplier)
    const [buyer, supplier] = await Promise.all([
      User.findByPk(order.buyerId, { attributes: ["id", "email"] }),
      User.findByPk(order.supplierId, { attributes: ["id", "email"] }),
    ]);

    // Create notifications
    const notificationPromises = [];

    // Notification for counterpart account manager
    notificationPromises.push(
      Notification.create({
        userId: counterpartAccountManager.id,
        orderId: order.id,
        message: `New order created by ${accountManager.firstName} ${accountManager.lastName}`,
        type: "order_created",
        metadata: {
          createdBy: req.user.id,
          product: order.product,
          quantity: order.capacity,
        },
      })
    );

    // Notifications for buyer and supplier users
    if (buyer?.id) {
      notificationPromises.push(
        Notification.create({
          userId: buyer.id,
          orderId: order.id,
          message: `New order created for ${order.product.join(", ")}`,
          type: "order_created",
          metadata: {
            accountManagerId: req.user.id,
            product: order.product,
          },
        })
      );
    }

    if (supplier?.id) {
      notificationPromises.push(
        Notification.create({
          userId: supplier.id,
          orderId: order.id,
          message: `New order created for ${order.product.join(", ")}`,
          type: "order_created",
          metadata: {
            accountManagerId: req.user.id,
            product: order.product,
          },
        })
      );
    }

    await Promise.all(notificationPromises);

    // Prepare response with both account managers
    const response = {
      message: "Order created successfully",
      order: {
        ...order.toJSON(),
        buyerAccountManager: {
          id: orderData.buyerAccountManagerId,
          fullName:
            req.user.role === "buyer"
              ? `${accountManager.firstName} ${accountManager.lastName}`
              : counterpartAccountManager
              ? `${counterpartAccountManager.firstName} ${counterpartAccountManager.lastName}`
              : null,
        },
        supplierAccountManager: {
          id: orderData.supplierAccountManagerId,
          fullName:
            req.user.role === "supplier"
              ? `${accountManager.firstName} ${accountManager.lastName}`
              : counterpartAccountManager
              ? `${counterpartAccountManager.firstName} ${counterpartAccountManager.lastName}`
              : null,
        },
      },
      notifications: {
        sentTo: [
          counterpartAccountManager.email,
          buyer?.email,
          supplier?.email,
        ].filter(Boolean),
      },
    };

    res.status(201).json(response);
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({
      error: error.message,
      details: "Failed to create order",
    });
  }
};

// ================== APPROVE ORDER ================== //
exports.approveOrder = async (req, res) => {
  try {
    // Find order with relationships
    const order = await Order.findByPk(req.params.id, {
      include: [
        { model: User, as: "buyerAccountManager" },
        { model: User, as: "supplierAccountManager" },
      ],
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check if order is in correct state for approval
    console.log("user role: ", req.user.role);
    if (order.createdById === req.user.id) {
      return res.status(403).json({
        message: "You cannot approve your own created orders",
      });
    }


    // Update order status and set approver
    await order.update({
      status: "matched",
      matchedById: req.user.id,
      approvedAt: new Date(),
    });

    // Notify relevant parties
    const creatorId =
      order.buyerAccountManagerId === req.user.id
        ? order.supplierAccountManagerId
        : order.buyerAccountManagerId;

    await Notification.create({
      userId: creatorId,
      orderId: order.id,
      message: `Your order has been approved by ${req.user.firstName} ${req.user.lastName}`,
      type: "order_approved",
    });

    res.json({
      message: "Order approved successfully",
      order: order.toJSON(),
    });
  } catch (error) {
    console.error("Error approving order:", error);
    res.status(500).json({
      error: error.message,
      details: "Failed to approve order",
    });
  }
};
// ================== UPDATE STATUS ORDERS  ================== //
 exports.updateOrderStatus = async (req, res) => {
  try {
    // Authorization check
    if (!["buyer", "supplier"].includes(req.user.role)) {
      return res.status(403).json({
        message: "Access denied: Only account managers can update status",
      });
    }

    // Find order with all related users
    const order = await Order.findByPk(req.params.id, {
      include: [
        { model: User, as: 'buyer', attributes: ['id'] },
        { model: User, as: 'supplier', attributes: ['id'] },
        { model: User, as: 'buyerAccountManager', attributes: ['id', 'firstName', 'lastName'] },
        { model: User, as: 'supplierAccountManager', attributes: ['id', 'firstName', 'lastName'] }
      ]
    });
    
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Validate status transition
    const validTransitions = {
      not_matched: ["matched"],
      matched: ["document_phase"],
      document_phase: ["processing"],
      processing: ["completed"],
    };

    if (!validTransitions[order.status]?.includes(req.body.status)) {
      return res.status(400).json({
        message: `Invalid status transition from ${order.status}`,
      });
    }

    if (req.body.status === 'matched') {
      req.body.matchedById = req.user.id;
    }

    const oldStatus = order.status;
    await order.update({ 
      status: req.body.status,
      matchedById: req.body.matchedById 
    });

    // Include matchedBy details in the response
    const matchedByUser = req.body.status === 'matched' 
      ? await User.findByPk(req.user.id, {
          attributes: ['id', 'firstName', 'lastName', 'email']
        })
      : null;

    

    // Determine who should be notified
    const notificationRecipients = [];
    
    // Always notify the counterpart account manager
    if (req.user.role === 'buyer' && order.supplierAccountManager) {
      notificationRecipients.push({
        userId: order.supplierAccountManager.id,
        role: 'supplierAccountManager'
      });
    } else if (order.buyerAccountManager) {
      notificationRecipients.push({
        userId: order.buyerAccountManager.id,
        role: 'buyerAccountManager'
      });
    }

    // Also notify the buyer and supplier users
    if (order.buyer) notificationRecipients.push({ userId: order.buyer.id, role: 'buyer' });
    if (order.supplier) notificationRecipients.push({ userId: order.supplier.id, role: 'supplier' });

    // Create notifications in transaction
    const transaction = await sequelize.transaction();
    try {
      await Promise.all(
        notificationRecipients.map(recipient => 
          Notification.create({
            userId: recipient.userId,
            orderId: order.id,
            message: `Order status changed from ${oldStatus} to ${req.body.status}`,
            type: "status_changed",
            metadata: {
              oldStatus,
              newStatus: req.body.status,
              changedBy: req.user.id,
              recipientRole: recipient.role
            }
          }, { transaction })
        )
      );
      
      await transaction.commit();
    } catch (notificationError) {
      await transaction.rollback();
      console.error('Failed to create notifications:', notificationError);
      throw notificationError;
    }

    // Prepare response with all manager details
    const response = {
      message: "Order status updated successfully",
      ...order.toJSON(),
      matchedBy: matchedByUser ? {
        id: matchedByUser.id,
        name: `${matchedByUser.firstName} ${matchedByUser.lastName}`,
        email: matchedByUser.email
      } : null,
      notifications: {
        sentTo: notificationRecipients.map(r => r.role),
        count: notificationRecipients.length
      }
    };

    res.json(response);
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({ 
      error: error.message,
      details: "Failed to update order status",
      suggestion: "Please check the order ID and try again"
    });
  }
}; 
// ================== GET ORDERS (DASHBOARD) ================== //
exports.getDashboardOrders = async (req, res) => {
  try {
    const { role, clientType, id } = req.user;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Enhanced filtering options
    const { status, product, startDate, endDate } = req.query;
    let whereClause = {
      savedStatus: "confirmed", // Simplified from array to single value
    };

    // Date range filter
    if (startDate && endDate) {
      whereClause.createdAt = {
        [Op.between]: [new Date(startDate), new Date(endDate)],
      };
    }

    // Status filter
    if (status) {
      whereClause.status = status;
    }

    // Product filter
    if (product) {
      whereClause.product = {
        [Op.contains]: [product],
      };
    }

    // Access control logic
    if (role.toLowerCase().includes("account manager")) {
      if (role.toLowerCase().includes("buyer")) {
        whereClause.buyerAccountManagerId = id;
      } else {
        whereClause.supplierAccountManagerId = id;
      }
    } else {
      if (clientType === "Buyer") {
        whereClause.buyerId = id;
      } else if (clientType === "Supplier") {
        whereClause.supplierId = id;
      }
    }

    // Get total count and orders in parallel
    const [totalOrders, orders] = await Promise.all([
      Order.count({ where: whereClause }),
      Order.findAll({
        where: whereClause,
        include: [
          {
            model: User,
            as: "buyer",
            attributes: ["id", "firstName", "lastName", "email", "clientType"],
          },
          {
            model: User,
            as: "supplier",
            attributes: ["id", "firstName", "lastName", "email", "clientType"],
          },
          {
            model: User,
            as: "buyerAccountManager",
            attributes: ["id", "firstName", "lastName", "email", "role"],
          },
          {
            model: User,
            as: "supplierAccountManager",
            attributes: ["id", "firstName", "lastName", "email", "role"],
          },
          {
            model: User,
            as: "matchedBy",
            attributes: ["id", "firstName", "lastName", "email"],
            required: false,
          },
          {
            model: Document,
            as: "documents",
            attributes: ["id", "status"],
            required: false,
          },
          {
            model: Notification,
            as: "notifications",
            attributes: ["id", "type", "message", "createdAt"],
            where: {
              userId: id, // Only show notifications relevant to current user
            },
            required: false,
          },
        ],
        order: [
          ["status", "ASC"],
          ["updatedAt", "DESC"],
        ],
        limit,
        offset,
        subQuery: false, // Better performance for pagination
      }),
    ]);

    const totalPages = Math.ceil(totalOrders / limit);

    const formattedOrders = orders.map((order) => ({
      ...order.toJSON(),
      matchedBy: order.matchedBy
        ? {
            id: order.matchedBy.id,
            name: `${order.matchedBy.firstName} ${order.matchedBy.lastName}`,
            email: order.matchedBy.email,
          }
        : null,
      documents: {
        id: order.documents.id,
        status: order.documents.status,
      },
    }));

    // Enhanced response format
    res.status(200).json({
      success: true,
      pagination: {
        currentPage: page,
        itemsPerPage: limit,
        totalItems: totalOrders,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      filters: {
        status: status || "all",
        product: product || "any",
        dateRange: startDate && endDate ? `${startDate} to ${endDate}` : "all",
      },
      data: formattedOrders,
    });
  } catch (err) {
    console.error("Error fetching dashboard orders:", err);
    res.status(500).json({
      success: false,
      error: "Server Error",
      message: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
};

// ================== GET SINGLE ORDER ================== //
/* exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Authorization: Only involved users/account managers can view
    const isInvolvedUser =
      order.buyerId === req.user.id || order.supplierId === req.user.id;
    const isAccountManager =
      order.buyerAccountManagerId === req.user.id ||
      order.supplierAccountManagerId === req.user.id;

    if (!isInvolvedUser && !isAccountManager) {
      return res
        .status(403)
        .json({ message: "Access denied: Not authorized to view this order" });
    }

    res.status(200).json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}; */

// ✅ Save Order as Draft (Only buyers & suppliers)
exports.saveOrderDraft = async (req, res) => {
  try {
    if (!["buyer", "supplier"].includes(req.user.role)) {
      return res.status(403).json({
        message:
          "Access denied: Only buyers and suppliers can save orders as drafts.",
      });
    }

    const order = await Order.create({
      ...req.body,
      savedStatus: "draft",
      userId: req.user.id,
    });
    res.status(201).json({ message: "Order saved as draft", order });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ✅ Update Order (Only buyers & suppliers, and only their own "draft" orders)
exports.updateOrder = async (req, res) => {
  try {
    if (!["buyer", "supplier"].includes(req.user.role)) {
      return res.status(403).json({
        message: "Access denied: Only buyers and suppliers can update orders.",
      });
    }

    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Ensure only the creator can edit & order status is 'draft'
    /*     if (order.userId !== req.user.id) {
      return res
        .status(403)
        .json({ message: "Access denied: You can only edit your own orders." });
    } */
    if (order.savedStatus !== "draft") {
      return res
        .status(403)
        .json({ message: "Only draft orders can be edited." });
    }

    await order.update(req.body);
    res.status(200).json({ message: "Order updated successfully", order });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ✅ Delete Order (Only buyers & suppliers, and only their own orders)
exports.deleteOrder = async (req, res) => {
  try {
    if (!["buyer", "supplier"].includes(req.user.role)) {
      return res.status(403).json({
        message: "Access denied: Only buyers and suppliers can delete orders.",
      });
    }

    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Ensure only the creator can delete
    if (order.userId !== req.user.id) {
      return res.status(403).json({
        message: "Access denied: You can only delete your own orders.",
      });
    }

    await order.destroy();
    res.status(200).json({ message: "Order deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ✅ Get All Saved (Draft) Orders (Only for the order owner)
exports.getAllSavedOrders = async (req, res) => {
  try {
    if (!["buyer", "supplier"].includes(req.user.role)) {
      return res.status(403).json({
        message:
          "Access denied: Only buyers and suppliers can view saved orders.",
      });
    }

    const orders = await Order.findAll({
      where: {
        savedStatus: "draft",
        /* userId: req.user.id, */ // Only show drafts belonging to the logged-in user
      },
    });

    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ✅ Get Single Order (Accessible to all users)
exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    res.status(200).json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Search and Filter Orders
exports.searchOrders = async (req, res) => {
  try {
    const { companyName, product, status, startDate, endDate } = req.query;
    const whereClause = {};

    if (companyName) {
      whereClause[Op.or] = [
        { buyerName: { [Op.iLike]: `%${companyName}%` } },
        { supplierName: { [Op.iLike]: `%${companyName}%` } },
      ];
    }

    if (product) {
      whereClause.product = { [Op.contains]: [product] };
    }

    if (status) {
      whereClause.status = status;
    }

    if (startDate && endDate) {
      whereClause.createdAt = {
        [Op.between]: [new Date(startDate), new Date(endDate)],
      };
    }

    const orders = await Order.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: "buyerAccountManager",
          attributes: ["firstName", "lastName"],
        },
        {
          model: User,
          as: "supplierAccountManager",
          attributes: ["firstName", "lastName"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

//Price update
exports.updateOrderPrice = async (req, res) => {
  try {
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.savedStatus !== "confirmed") {
      return res
        .status(400)
        .json({ message: "Only confirmed orders can be updated" });
    }

    const { pricePerTonne } = req.body;

    await order.update({
      pricePerTonne,
      updatedAt: new Date(),
    });

    res.status(200).json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

//Get Order Analytics
exports.getOrderAnalytics = async (req, res) => {
  try {
    const totalOrders = await Order.count();
    const pendingOrders = await Order.count({
      where: {
        status: { [Op.ne]: "completed" },
      },
    });
    const completedOrders = await Order.count({
      where: {
        status: "completed",
      },
    });

    res.status(200).json({
      totalOrders,
      pendingOrders,
      completedOrders,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
