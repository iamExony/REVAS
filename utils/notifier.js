// utils/notifier.js
const { Notification, Order, User } = require('../models');

class Notifier {
  static async createNotification({ userId, orderId, type, triggeredById, metadata }) {
    return Notification.create({
      userId,
      orderId,
      type,
      triggeredById,
      metadata,
      isRead: false
    });
  }

  static async handleStatusChange(orderId, oldStatus, newStatus, actorId) {
    const order = await Order.findByPk(orderId, {
      include: [
        { association: 'buyerManager' },
        { association: 'orderSupplier' }
      ]
    });

    // Determine recipients
    const recipients = [];
    if (order.buyerManager) recipients.push(order.buyerManager.id);
    if (order.orderSupplier) recipients.push(order.orderSupplier.userId);

    // Create notifications
    return Promise.all(recipients.map(userId => 
      this.createNotification({
        userId,
        orderId,
        type: 'status_changed',
        triggeredById: actorId,
        metadata: { oldStatus, newStatus }
      })
    ))
  }

  // Add other notification types as needed
  static async handleDocumentGenerated(orderId, documentUrl, actorId) {
    const order = await Order.findByPk(orderId, {
        include: [
          { 
            association: 'orderBuyer', // Buyer user who placed the order
            attributes: ['id']
          },
          {
            association: 'buyerManager', // Buyer's account manager
            attributes: ['id']
          },
          {
            association: 'orderSupplier', // Supplier user
            attributes: ['id']
          }
        ]
      });
    
      if (!order) {
        throw new Error('Order not found');
      }
    
      // 2. Determine recipients (both the supplier user and buyer account manager)
      const recipients = new Set();
      
      // Always notify the supplier user
      if (order.orderSupplier) {
        recipients.add(order.orderSupplier.id);
      }
    
      // Notify buyer account manager if exists
      if (order.buyerManager) {
        recipients.add(order.buyerManager.id);
      }
    
      // 3. Create notifications
      const notifications = await Promise.all(
        Array.from(recipients).map(userId => 
          this.createNotification({
            userId,
            orderId,
            type: 'document_generated',
            triggeredById: actorId,
            metadata: {
              documentUrl,
              generatedAt: new Date().toISOString(),
              nextAction: order.orderSupplier ? 
                'supplier_signature_required' : 
                'awaiting_supplier_assignment'
            }
          })
      ))
    
      // 4. Return created notifications (useful for real-time updates)
      return notifications;
  }
}

module.exports = Notifier;