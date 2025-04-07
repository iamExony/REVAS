const { Order, Notification} = require("../models");

/* const Notification = require("../models/Notification"); */

exports.updateOrderStatus = async (req, res) => {
  try {
    // Only account managers can update status
    if (!["buyer", "supplier"].includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied: Only account managers can update status" });
    }

    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Validate status transition
    const validTransitions = {
      not_matched: ["matched"],
      matched: ["document_phase"],
      document_phase: ["processing"],
      processing: ["completed"]
    };

    if (!validTransitions[order.status]?.includes(req.body.status)) {
      return res.status(400).json({ 
        message: `Invalid status transition from ${order.status}` 
      });
    }

    const oldStatus = order.status;
    await order.update({ status: req.body.status });

    // Notify buyer/supplier
    const recipientId = req.user.role === "buyer" 
      ? order.supplierId 
      : order.buyerId;

    await Notification.create({
      oldStatus: oldStatus,
      userId: recipientId,
      orderId: order.id,
      message: `Order status changed to ${req.body.status}`,
      type: "status_change"
    });

    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ================== Document Generation ================== //
exports.generatePurchaseOrder = async (req, res) => {
  try {
    // Only supplier account managers can generate purchase orders
    if (req.user.role !== "supplier") {
      return res.status(403).json({ message: "Access denied: Only supplier account managers can generate purchase orders" });
    }

    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.status !== "matched") {
      return res.status(400).json({ message: "Order must be in 'matched' status" });
    }

    // Generate document (implement your PDF logic)
    const docUrl = await generatePDF(order, "purchase_order");

    // Update order
    await order.update({ 
      status: "document_phase",
      docUrl,
      documentType: "purchase_order",
      documentGeneratedAt: new Date()
    });

    // Notify buyer and supplier
    await Notification.bulkCreate([
      {
        userId: order.buyerId,
        orderId: order.id,
        message: "Purchase order generated - please sign",
        type: "document_ready",
        metadata: { docType: "purchase_order" }
      },
      {
        userId: order.supplierId,
        orderId: order.id,
        message: "Purchase order generated - please sign",
        type: "document_ready",
        metadata: { docType: "purchase_order" }
      }
    ]);

    res.json({ 
      message: "Purchase order generated successfully",
      docUrl 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.generateSalesOrder = async (req, res) => {
  try {
    // Only buyer account managers can generate sales orders
    if (req.user.role !== "buyer") {
      return res.status(403).json({ message: "Access denied: Only buyer account managers can generate sales orders" });
    }

    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.status !== "matched") {
      return res.status(400).json({ message: "Order must be in 'matched' status" });
    }

    // Generate document (implement your PDF logic)
    const docUrl = await generatePDF(order, "sales_order");

    // Update order
    await order.update({ 
      status: "document_phase",
      docUrl,
      documentType: "sales_order",
      documentGeneratedAt: new Date()
    });

    // Notify buyer and supplier
    await Notification.bulkCreate([
      {
        userId: order.buyerId,
        orderId: order.id,
        message: "Sales order generated - please sign",
        type: "document_ready",
        metadata: { docType: "sales_order" }
      },
      {
        userId: order.supplierId,
        orderId: order.id,
        message: "Sales order generated - please sign",
        type: "document_ready",
        metadata: { docType: "sales_order" }
      }
    ]);

    res.json({ 
      message: "Sales order generated successfully",
      docUrl 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ================== Helper Function ================== //
const generatePDF = async (order) => {
  // Implement your PDF generation logic here
  return `https://storage.example.com/orders/${order.id}.pdf`;
};

exports.createOrder = async (req, res) => {
  try {
    // Only account managers can create orders
    if (!["buyer", "supplier"].includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied: Only account managers can create orders" });
    }

    // Validate required fields
    const requiredFields = ["companyName", "product", "capacity", "pricePerTonne"];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        message: `Missing fields: ${missingFields.join(", ")}` 
      });
    }

    // Create order
    const order = await Order.create({
      ...req.body,
      createdById: req.user.id,
      // Set buyerId/supplierId based on account manager type
      ...(req.user.role === "buyer" 
        ? { buyerId: req.body.userId, buyerAccountManagerId: req.user.id}  // Assign to a buyer user
        : { supplierId: req.body.userId, supplierAccountManagerId: req.user.id  }), // Assign to a supplier user
      savedStatus: "confirmed"
    });

    res.status(201).json({ 
      message: "Order created successfully",
      order 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ================== GET ORDERS (DASHBOARD) ================== //
exports.getDashboardOrders = async (req, res) => {
  try {
    let whereClause = {};

    // 1. Regular Users (buyer/supplier): Only see THEIR orders
    if (["Buyer", "Supplier"].includes(req.user.clientType)) {
      whereClause = {
        ...whereClause,
        [req.user.clientType === "buyer" ? "buyerId" : "supplierId"]: req.user.id
      };
    } 
    // 2. Account Managers: See orders they manage
    else if (req.user.role === "buyer" || req.user.role === "supplier") {
      whereClause.savedStatus= "confirmed" // Only confirmed/created orders
      
    } 
    // 3. Unauthorized roles
    else {
      return res.status(403).json({ message: "Access denied" });
    }

    const orders = await Order.findAll({
      where: whereClause,
    /*   include: [
        {
          model: User,
          as: "buyer", // Must match the alias in your Order model
          attributes: ["id", "email"],
        },
        {
          model: User,
          as: "supplier",
          attributes: ["id", "email"],
        }
      ], */
      order: [["createdAt", "DESC"]]
    });

    console.log("where", whereClause)
    console.log("Orders", orders)

    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ================== GET SINGLE ORDER ================== //
exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Authorization: Only involved users/account managers can view
    const isInvolvedUser = 
      order.buyerId === req.user.id || 
      order.supplierId === req.user.id;
    const isAccountManager = 
      order.buyerAccountManagerId === req.user.id || 
      order.supplierAccountManagerId === req.user.id;

    if (!isInvolvedUser && !isAccountManager) {
      return res.status(403).json({ message: "Access denied: Not authorized to view this order" });
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
      req.user.role === "buyer" && 
      order.buyerAccountManagerId === req.user.id;
    const isSupplierAccountManager = 
      req.user.role === "supplier" && 
      order.supplierAccountManagerId === req.user.id;

    if (!isBuyerAccountManager && !isSupplierAccountManager) {
      return res.status(403).json({ message: "Access denied: Only assigned account managers can update status" });
    }

    // Validate status transition (same as before)
    const validTransitions = {
      not_matched: ["matched"],
      matched: ["document_phase"],
      document_phase: ["processing"],
      processing: ["completed"]
    };

    if (!validTransitions[order.status]?.includes(req.body.status)) {
      return res.status(400).json({ 
        message: `Invalid transition from ${order.status}` 
      });
    }

    await order.update({ status: req.body.status });
    res.status(200).json({ message: "Status updated", order });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
// Get orders for buyer/supplier dashboard
/* exports.getDashboardOrders = async (req, res) => {
  try {
    let whereClause = { savedStatus: 'confirmed' };
    
    // Buyer dashboard sees orders they created
    if (req.user.clientType === 'buyer') {
      whereClause.buyerId = req.user.id;
    } 
    // Supplier dashboard sees orders assigned to them
    else if (req.user.clientType === 'supplier') {
      whereClause.supplierId = req.user.id;
    }
    // Account manager dashboard sees all orders
    else  if (["buyer", "supplier"].includes(req.user.role)) {
      // No additional where clause - show all confirmed orders
    } else {
      return res.status(403).json({ message: "Access denied" });
    }

    const orders = await Order.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: req.user.clientType === 'buyer' ? 'supplier' : 'buyer',
          attributes: ['firstName', 'lastName', 'email']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}; */
// ✅ Create Order (Only buyers & suppliers)
/* exports.createOrder = async (req, res) => {
    try {
      if (!["buyer", "supplier"].includes(req.user.role)) {
        return res.status(403).json({ message: "Access denied: Only buyers and suppliers can create orders." });
      }
      // Add validation for required fields
      const requiredFields = ['companyName', 'product', 'capacity', 'pricePerTonne'];
      const missingFields = requiredFields.filter(field => !req.body[field]);
      
      if (missingFields.length > 0) {
        return res.status(400).json({ 
          message: `Missing required fields: ${missingFields.join(', ')}` 
        });
      }
      // Fetch the buyer/supplier details
      const accountManager = await User.findByPk(req.user.id, {
        attributes: ["firstName", "lastName"] // Only fetch first name and last name
      });
  
      if (!accountManager) {
        return res.status(404).json({ message: "Account manager not found" });
      }

      const existingUser = await User.findOne({where: {email: req.body.email}})
      if(!existingUser){
        return res.status(400).json({error: "User does not exist"})
      }
  
      // Create order with createdById
      const order = await Order.create({ 
        ...req.body,
        supplierName: req.body.supplierName || null,
        createdById: req.user.id,  // Critical fix
        savedStatus: "confirmed"
      });
  
      // Return order details along with account manager's first and last name
      res.status(201).json({ 
        message: "Order created successfully", 
        order: {
          ...order.toJSON(),
          accountManagerName: accountManager.firstName + " " + accountManager.lastName,
        }
      });
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(400).json({ message: "Order with these details already exists" });
      }
      res.status(500).json({ error: error.message });
    }
  }; */

// ✅ Save Order as Draft (Only buyers & suppliers)
exports.saveOrderDraft = async (req, res) => {
  try {
    if (!["buyer", "supplier"].includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied: Only buyers and suppliers can save orders as drafts." });
    }

    const order = await Order.create({ ...req.body, savedStatus: "draft", userId: req.user.id });
    res.status(201).json({ message: "Order saved as draft", order });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ✅ Update Order (Only buyers & suppliers, and only their own "draft" orders)
exports.updateOrder = async (req, res) => {
  try {
    if (!["buyer", "supplier"].includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied: Only buyers and suppliers can update orders." });
    }
    
    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Ensure only the creator can edit & order status is 'draft'
    if (order.userId !== req.user.id) {
      return res.status(403).json({ message: "Access denied: You can only edit your own orders." });
    }
    if (order.savedStatus !== "draft") {
      return res.status(403).json({ message: "Only draft orders can be edited." });
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
      return res.status(403).json({ message: "Access denied: Only buyers and suppliers can delete orders." });
    }

    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Ensure only the creator can delete
    if (order.userId !== req.user.id) {
      return res.status(403).json({ message: "Access denied: You can only delete your own orders." });
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
      return res.status(403).json({ message: "Access denied: Only buyers and suppliers can view saved orders." });
    }

    const orders = await Order.findAll({
      where: {
        savedStatus: "draft",
        userId: req.user.id // Only show drafts belonging to the logged-in user
      }
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
