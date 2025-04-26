const { Order, Notification, User } = require("../models");
const { Op } = require('sequelize');


// Helper function for notification creation
const createStatusNotification = async (order, recipientId, statusChange) => {
  const messageMap = {
    'not_matched': 'New order requires matching',
    'matched': 'Order has been matched with a supplier',
    'document_phase': 'Documents are ready for review',
    'processing': 'Order is now being processed',
    'completed': 'Order has been completed'
  };

  await Notification.create({
    userId: recipientId,
    orderId: order.id,
    message: messageMap[statusChange] || `Order status changed to ${statusChange}`,
    type: "status_changed",
    metadata: {
      oldStatus: order.previous('status'),
      newStatus: statusChange
    }
  });
};

exports.updateOrderStatus = async (req, res) => {
  try {
    // Authorization check
    if (!["buyer", "supplier"].includes(req.user.role)) {
      return res.status(403).json({
        message: "Access denied: Only account managers can update status",
      });
    }

    const order = await Order.findByPk(req.params.id);
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

    const oldStatus = order.status;
    await order.update({ status: req.body.status });

    // Determine notification recipients
    const notificationRecipients = [];
    if (req.user.role === "buyer") {
      notificationRecipients.push(order.supplierId);
    } else {
      notificationRecipients.push(order.buyerId);
    }

    // Create notifications for all recipients
    await Promise.all(notificationRecipients.map(recipientId => 
      createStatusNotification(order, recipientId, req.body.status)
    ));

    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

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
      "buyerName", "product", "capacity", "pricePerTonne", 
      "buyerId", "supplierId", "shippingType", "paymentTerms",
      "supplierName", "supplierPrice", "shippingCost", "negotiatePrice"
    ];

    const missingFields = requiredFields.filter(field => !req.body[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({
        message: `Missing fields: ${missingFields.join(", ")}`,
      });
    }

    // Create order
    const orderData = {
      ...req.body,
      createdById: req.user.id,
      savedStatus: "confirmed",
      status: "not_matched" // Initial status
    };

    if (req.user.role.toLowerCase().includes('buyer')) {
      orderData.buyerAccountManagerId = req.user.id;
    } else if (req.user.role.toLowerCase().includes('supplier')) {
      orderData.supplierAccountManagerId = req.user.id;
    }

    const order = await Order.create(orderData);

    // Create initial notification for the counterparty
    const recipientId = req.user.role === "buyer" ? order.supplierId : order.buyerId;
    await Notification.create({
      userId: recipientId,
      orderId: order.id,
      message: `New order created for ${order.product}`,
      type: "order_created",
      metadata: {
        initiator: req.user.id,
        product: order.product,
        quantity: order.capacity
      }
    });

    res.status(201).json({
      message: "Order created successfully",
      order,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ================== GET ORDERS (DASHBOARD) ================== //
exports.getDashboardOrders = async (req, res) => {
  try {
    const { role, clientType, id } = req.user;
    
    // Define what constitutes a "confirmed" order in your system
    const confirmedStatuses = ["confirmed"] ;
    
    let whereClause = {
      savedStatus: { [Op.in]: confirmedStatuses }
    };

    // For account managers (buyer or supplier type)
    if (role.toLowerCase().includes('account manager')) {
      if (role.toLowerCase().includes('buyer')) {
        whereClause.buyerAccountManagerId = id;
      } else if (role.toLowerCase().includes('supplier')) {
        whereClause.supplierAccountManagerId = id;
      }
    } 
    // For regular users (buyers/suppliers)
    else {
      if (clientType === 'Buyer') {
        whereClause.buyerId = id;
      } else if (clientType === 'Supplier') {
        whereClause.supplierId = id;
      }
    }

    const orders = await Order.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'buyer',
          attributes: ['id', 'firstName', 'lastName', 'email', 'clientType']
        },
        {
          model: User,
          as: 'supplier',
          attributes: ['id', 'firstName', 'lastName', 'email', 'clientType']
        },
        {
          model: User,
          as: 'buyerAccountManager',
          attributes: ['id', 'firstName', 'lastName', 'email', 'role']
        },
        {
          model: User,
          as: 'supplierAccountManager',
          attributes: ['id', 'firstName', 'lastName', 'email', 'role']
        },
   /*    {
            model: User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName', 'email']
        }  */
      ],
      order: [
        ['status', 'ASC'],  // Orders by status progression
        ['lastSignedAt', 'DESC']  // Most recent signed first
      ]
    });

    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders
    });

  } catch (err) {
    console.error('Error fetching confirmed orders:', err);
    res.status(500).json({
      success: false,
      error: 'Server Error',
      message: err.message
    });
  }
};

// ================== GET SINGLE ORDER ================== //
exports.getOrderById = async (req, res) => {
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
};

// ================== UPDATE ORDER STATUS ================== //
exports.updateOrderStatus = async (req, res) => {
  try {
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Authorization: Only account managers can update status
    const isBuyerAccountManager =
      req.user.role === "buyer" && order.buyerAccountManagerId === req.user.id;
    const isSupplierAccountManager =
      req.user.role === "supplier" &&
      order.supplierAccountManagerId === req.user.id;

    if (!isBuyerAccountManager && !isSupplierAccountManager) {
      return res
        .status(403)
        .json({
          message:
            "Access denied: Only assigned account managers can update status",
        });
    }

    // Validate status transition (same as before)
    const validTransitions = {
      not_matched: ["matched"],
      matched: ["document_phase"],
      document_phase: ["processing"],
      processing: ["completed"],
    };

    if (!validTransitions[order.status]?.includes(req.body.status)) {
      return res.status(400).json({
        message: `Invalid transition from ${order.status}`,
      });
    }

    await order.update({ status: req.body.status });
    res.status(200).json({ message: "Status updated", order });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ✅ Save Order as Draft (Only buyers & suppliers)
exports.saveOrderDraft = async (req, res) => {
  try {
    if (!["buyer", "supplier"].includes(req.user.role)) {
      return res
        .status(403)
        .json({
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
      return res
        .status(403)
        .json({
          message:
            "Access denied: Only buyers and suppliers can update orders.",
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
      return res
        .status(403)
        .json({
          message:
            "Access denied: Only buyers and suppliers can delete orders.",
        });
    }

    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Ensure only the creator can delete
    if (order.userId !== req.user.id) {
      return res
        .status(403)
        .json({
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
      return res
        .status(403)
        .json({
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
