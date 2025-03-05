const { Order, User} = require("../models");


// ✅ Create Order (Only buyers & suppliers)
exports.createOrder = async (req, res) => {
    try {
      if (!["buyer", "supplier"].includes(req.user.role)) {
        return res.status(403).json({ message: "Access denied: Only buyers and suppliers can create orders." });
      }
  
      // Fetch the buyer/supplier details
      const accountManager = await User.findByPk(req.user.id, {
        attributes: ["firstName", "lastName"] // Only fetch first name and last name
      });
  
      if (!accountManager) {
        return res.status(404).json({ message: "Account manager not found" });
      }
  
      // Create order
      const order = await Order.create({ 
        ...req.body, 
        status: "confirmed", 
        userId: req.user.id 
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
      res.status(500).json({ error: error.message });
    }
  };

// ✅ Save Order as Draft (Only buyers & suppliers)
exports.saveOrderDraft = async (req, res) => {
  try {
    if (!["buyer", "supplier"].includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied: Only buyers and suppliers can save orders as drafts." });
    }

    const order = await Order.create({ ...req.body, status: "draft", userId: req.user.id });
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
    if (order.status !== "draft") {
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
        status: ["confirmed", "created"] // Only confirmed/created orders
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
        status: "draft",
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
