const { Order, User, Notification} = require("../models");
/* const Notification = require("../models/Notification"); */


exports.updateOrderStatus = async (req, res) => {
  try {
    // Authorization
    if (!["buyer", "supplier"].includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const order = await Order.findByPk(req.params.id, {
      include: [
        { association: 'orderBuyer' },
        { association: 'orderSupplier' }
      ]
    });
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Validate state transition
    const validTransitions = {
      not_matched: ['matched'],
      matched: ['document_phase'],
      document_phase: ['processing'],
      processing: ['completed']
    };

    if (!validTransitions[order.status]?.includes(req.body.status)) {
      return res.status(400).json({ 
        message: `Invalid status transition from ${order.status}` 
      });
    }

    const oldStatus = order.status;
    await order.update({ status: req.body.status });

    // Enhanced notification
    await Notifier.handleStatusChange(
      order.id, 
      oldStatus, 
      req.body.status, 
      req.user.id
    );

    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ================== Document Generation ================== //
exports.generateSupplierOrder = async (req, res) => {
  try {
    // Authorization
    if (!["buyer", "supplier"].includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const order = await Order.findByPk(req.params.id, {
      include: [
        { association: 'orderBuyer' },
        { association: 'orderSupplier' }
      ]
    });
    
    // Validation
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.status !== 'matched') {
      return res.status(400).json({ message: "Order must be in 'matched' status" });
    }

    // 1. Generate document
    const docUrl = await generatePDF(order); 
    
    // 2. Create Document record
    const document = await Document.create({
      type: 'supplier_order',
      fileUrl: docUrl,
      orderId: order.id,
      generatedById: req.user.id
    });

    // 3. Update order
    await order.update({ 
      status: 'document_phase',
      docUrl
    });

    // 4. Notify parties
    await Notifier.handleDocumentGenerated(
      order.id,
      docUrl,
      req.user.id
    );

    res.json({ 
      message: "Document generated successfully",
      document 
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
// Generate supplier order document
exports.generateSupplierOrder = async (req, res) => {
  try {
    // Only account managers can generate documents
    if (!["buyer", "supplier"].includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied: Only account managers can generate documents" });
    }

    const order = await Order.findByPk(req.params.id, {
      include: [
        { model: User, as: 'buyer' },
        { model: User, as: 'supplier' }
      ]
    });

    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.status !== 'matched') {
      return res.status(400).json({ message: "Order must be in 'matched' status" });
    }

    // Generate document (pseudo-code - implement based on your doc generator)
    const docUrl = await generateOrderDocument(order);
    
    // Update order
    await order.update({ 
      status: 'document_phase',
      docUrl,
      documentGeneratedAt: new Date() 
    });

    // Create notifications
    await Notification.bulkCreate([
      {
        userId: order.buyerId,
        orderId: order.id,
        message: 'Supplier order document generated - please sign',
        type: 'document_ready'
      },
      {
        userId: order.supplierId,
        orderId: order.id,
        message: 'Supplier order document generated - please sign',
        type: 'document_ready'
      }
    ]);

    res.status(200).json({ 
      message: "Supplier order generated successfully",
      docUrl 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
// Get orders for buyer/supplier dashboard
exports.getDashboardOrders = async (req, res) => {
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
};
// Update order status (for account managers)
/* exports.updateOrderStatus = async (req, res) => {
  try {
    // Only account managers can update status
    if (!["buyer", "supplier"].includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied: Only account managers can update order status" });
    }

    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Validate status transition
    const validTransitions = {
      not_matched: ['matched'],
      matched: ['document_phase'],
      document_phase: ['processing'],
      processing: ['completed']
    };

    if (!validTransitions[order.status]?.includes(req.body.status)) {
      return res.status(400).json({ 
        message: `Invalid status transition from ${order.status} to ${req.body.status}` 
      });
    }

    // Update status
    await order.update({ status: req.body.status });

    // Create notification for the other party
    const notificationRecipient = order.buyerId === req.user.id ? 
      order.supplierId : order.buyerId;

    await Notification.create({
      userId: notificationRecipient,
      orderId: order.id,
      message: `Order status changed to ${req.body.status}`,
      type: 'status_change'
    });

    res.status(200).json({ 
      message: "Order status updated successfully", 
      order 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}; */

// ✅ Create Order (Only buyers & suppliers)
exports.createOrder = async (req, res) => {
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
  };

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

// ✅ Get All Confirmed/Created Orders (Accessible to all users)
exports.getAllOrders = async (req, res) => {
  try {
    const orders = await Order.findAll({
      where: {
        savedStatus: ["confirmed", "created"] // Only confirmed/created orders
      }
    });

    res.status(200).json(orders);
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
