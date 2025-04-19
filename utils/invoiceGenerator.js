const { Op } = require("sequelize");
const { Order } = require("../models");

async function generateInvoiceNumber(order, docType) {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0"); // e.g., "09"
  const year = String(now.getFullYear()).slice(-2); // e.g., "24"

  // Determine prefix based on document type
  const prefix = docType === "purchase_order" ? "PO" : "SO";
  const name = docType === "purchase_order" ? order.supplierName : order.buyerName;
  const entityPrefix = name.slice(0, 3).toUpperCase(); // "SUP" or "BUY"

  // Fetch latest order for sequential numbering
  const latestOrder = await Order.findOne({
    where: { 
      invoiceNumber: { [Op.like]: `${prefix}-${month}${year}-${entityPrefix}-%` } 
    },
    order: [["createdAt", "DESC"]],
  });

  // Generate sequential number (001, 002...)
  let sequentialNumber = "001";
  if (latestOrder) {
    const lastNumber = parseInt(latestOrder.invoiceNumber.split("-").pop(), 10);
    sequentialNumber = String(lastNumber + 1).padStart(3, "0");
  }

  return `${prefix}-${month}${year}-${entityPrefix}-${sequentialNumber}`;
}

module.exports = { generateInvoiceNumber };