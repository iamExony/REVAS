const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const { v4: uuidv4 } = require("uuid");
const { Order, Document, Notification, User } = require("../models");
const cloudinary = require("cloudinary").v2;
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const logoPath = path.join(__dirname, "../assets/revas-logo.png");
const { generateInvoiceNumber } = require("../utils/invoiceGenerator");
const crypto = require("crypto");
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const axios = require('axios');


dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});



function drawWrappedText(page, text, x, y, maxWidth, lineHeight, options) {
  const words = text.split(" ");
  let currentLine = "";
  let currentY = y;

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = options.font.widthOfTextAtSize(testLine, options.size);

    if (testWidth > maxWidth && currentLine) {
      page.drawText(currentLine, { ...options, x, y: currentY });
      currentY -= lineHeight;
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    page.drawText(currentLine, { ...options, x, y: currentY });
  }
  return currentY; // Return final Y position
}

class DocumentController {
  static verifyWebhookSignature(payload, receivedSignature, secret) {
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(payload);
    const expectedSignature = hmac.digest("hex");

    console.log("Signature Verification:", {
      received: receivedSignature,
      expected: expectedSignature,
      match:
        receivedSignature.toLowerCase() === expectedSignature.toLowerCase(),
    });

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "utf8"),
      Buffer.from(receivedSignature, "utf8")
    );
  }
  /**
   * Generate sales order PDF
   */
  static async generateOrderDocument(req, res) {
    try {
      const { id } = req.params;
      const { user } = req;
      const order = await Order.findByPk(id);

      if (!order) return res.status(404).json({ message: "Order not found" });
      // Authorization
      const isSalesOrder = user.role === "buyer";
      const isPurchaseOrder = user.role === "supplier";

      if (!isSalesOrder && !isPurchaseOrder) {
        return res.status(403).json({
          message: "Access denied: Unauthorized role",
        });
      }
      if (order.status !== "matched") {
        return res
          .status(400)
          .json({ message: "Order must be in 'matched' status" });
      }

      // Generate appropriate document
      const docType = isSalesOrder ? "sales_order" : "purchase_order";

      // Generate dynamic invoice number
      const invoiceNumber = await generateInvoiceNumber(order, docType);

      const pdfBuffer = await DocumentController.generateOrderPDF(
        { ...order.get(), invoiceNumber },
        docType
      );
      const filename = `${docType}_${order.id}_${uuidv4()}.pdf`;
      const uploadResult = await DocumentController.uploadToStorage(
        pdfBuffer,
        filename,
        false
      );
          // Ensure we're using the string URL
    const docUrl = typeof uploadResult === 'object' ? uploadResult.url : uploadResult;
      const documentRecord = await Document.create({
        orderId: id,
        type: docType,
        fileUrl: docUrl,
        status: "pending_signatures",
        generatedById: user.id,
      });
      await order.update({
        invoiceNumber,
        status: "document_phase",
        docUrl,
        documentType: docType,
        documentGeneratedAt: new Date(),
        documentId: documentRecord.id,
      });

      // Notifications
      const notificationMessage = `${docType.replace(
        "_",
        " "
      )} generated - please sign`;
      await Notification.bulkCreate([
        {
          userId: order.buyerId,
          orderId: order.id,
          message: notificationMessage,
          type: "document_generated",
          metadata: { docType },
        },
        {
          userId: order.supplierId,
          orderId: order.id,
          message: notificationMessage,
          type: "document_generated",
          metadata: { docType },
        },
      ]);

      res.json({
        message: `${docType.replace("_", " ")} generated successfully`,
        docUrl,
      });
    } catch (error) {
      console.error("Sales order generation error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Generate PDF document
   */
  static async generateOrderPDF(order, type) {
    try {
      const pdfDoc = await PDFDocument.create();
      const page1 = pdfDoc.addPage([612, 792]); // A4 (portrait)
      const page2 = pdfDoc.addPage([612, 792]); // A4 (portrait)

      // Load fonts
      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      page1.drawText(
        type === "sales_order" ? "SALES ORDER" : "PURCHASE ORDER",
        {
          x: 32,
          y: 661,
          size: 45,
          color: rgb(0, 0, 0),
          font: helveticaBold,
        }
      );

      const InvoiceInfo = ["Invoice Number", order.invoiceNumber || order.id];
      InvoiceInfo.forEach((line, i) => {
        page1.drawText(line, {
          x: 32,
          y: 620 - i * 15,
          size: i === 0 ? 14 : 13,
          font: i === 0 ? helveticaBold : helvetica,
        });
      });
      const newDate = new Date().toLocaleDateString();
      const DocDate = ["Document Date", newDate];
      DocDate.forEach((line, i) => {
        page1.drawText(line, {
          x: 468,
          y: 620 - i * 15,
          size: i === 0 ? 14 : 13,
          font: i === 0 ? helveticaBold : helvetica,
        });
      });
      page1.drawLine({
        start: { x: 32, y: 580 },
        end: { x: 578, y: 580 },
        thickness: 0.5,
        color: rgb(0.5, 0.5, 0.5), // Gray color
      });

      // Buyer/Supplier Data with wrapped names and addresses
      const parties = {
        buyer: {
          name: order.buyerName,
          address: order.location,
        },
        supplier: {
          name: order.supplierName,
          address: "N/A",
        },
        collection: "Port Apapa in Nigeria [NGAPP]",
      };

      // Column setup
      const columns = [
        { x: 32, width: 200, title: "Buyer" },
        { x: 232, width: 200, title: "Supplier" },
        { x: 432, width: 100, title: "Collection Location" },
      ];

      // Draw section headers
      columns.forEach((col) => {
        page1.drawText(col.title, {
          x: col.x,
          y: 550,
          size: 14,
          font: helveticaBold,
        });
      });

      // Draw wrapped content for each column
      let buyerY = 530;
      let supplierY = 530;

      // Buyer Column
      buyerY = drawWrappedText(
        page1,
        parties.buyer.name,
        columns[0].x,
        buyerY,
        columns[0].width,
        15,
        {
          font: helvetica,
          size: 10,
          color: rgb(0, 0, 0),
        }
      );
      buyerY = drawWrappedText(
        page1,
        parties.buyer.address,
        columns[0].x,
        buyerY - 20,
        columns[0].width,
        15,
        {
          font: helvetica,
          size: 10,
          color: rgb(0, 0, 0),
        }
      );

      // Supplier Column
      supplierY = drawWrappedText(
        page1,
        parties.supplier.name,
        columns[1].x,
        supplierY,
        columns[1].width,
        15,
        {
          font: helvetica,
          size: 10,
          color: rgb(0, 0, 0),
        }
      );
      supplierY = drawWrappedText(
        page1,
        parties.supplier.address,
        columns[1].x,
        supplierY - 20,
        columns[1].width,
        15,
        {
          font: helvetica,
          size: 10,
          color: rgb(0, 0, 0),
        }
      );

      // Collection Column (single line)
      page1.drawText(parties.collection, {
        x: columns[2].x,
        y: 530,
        size: 10,
        font: helvetica,
      });

      // Divider Line
      page1.drawLine({
        start: { x: 32, y: 460 },
        end: { x: 578, y: 460 },
        thickness: 0.5,
        color: rgb(0.5, 0.5, 0.5), // Gray color
      });
      // Transportation Method and payment Terms data Data with wrapped names and addresses
      const terms = {
        transport: {
          name: "Container",
        },
        incoTerm: {
          name: "EXW",
        },
        payTerm: {
          name: `${order.paymentTerms} due immediately. Remainder due 0 days after collection from supplier`,
        },
      };

      // Column setup
      const termColumns = [
        { x: 32, width: 200, title: "Transport Method" },
        { x: 232, width: 200, title: "Inco Terms" },
        { x: 432, width: 200, title: "Payment Terms" },
      ];

      // Draw section headers
      termColumns.forEach((col) => {
        page1.drawText(col.title, {
          x: col.x,
          y: 440,
          size: 14,
          font: helveticaBold,
        });
      });

      // Draw wrapped content for each column
      let transportY = 420;
      let incoTermY = 420;
      let paymentTermY = 420;

      // Buyer Column
      transportY = drawWrappedText(
        page1,
        terms.transport.name,
        columns[0].x,
        transportY,
        columns[0].width,
        15,
        {
          font: helvetica,
          size: 10,
          color: rgb(0, 0, 0),
        }
      );

      // Supplier Column
      incoTermY = drawWrappedText(
        page1,
        terms.incoTerm.name,
        columns[1].x,
        incoTermY,
        columns[1].width,
        15,
        {
          font: helvetica,
          size: 10,
          color: rgb(0, 0, 0),
        }
      );

      // Payment Term Column (single line)
      incoTermY = drawWrappedText(
        page1,
        terms.payTerm.name,
        columns[2].x,
        paymentTermY,
        columns[2].width,
        15,
        {
          font: helvetica,
          size: 10,
          color: rgb(0, 0, 0),
        }
      );

      // Divider Line
      page1.drawLine({
        start: { x: 32, y: 350 },
        end: { x: 578, y: 350 },
        thickness: 0.5,
        color: rgb(0.5, 0.5, 0.5), // Gray color
      });

      // Table Headers
      const headers = [
        "Description",
        "Quantity",
        "Format",
        "Unit Price",
        "Amount",
      ];
      headers.forEach((text, i) => {
        page1.drawText(text, {
          x: 32 + i * 120,
          y: 330,
          size: 10,
          font: helveticaBold,
        });
      });

      // Table Rows
      const items = [
        {
          desc: order.product,
          qty: order.capacity, // Changed to number
          unit: "MT", // Added separate unit field
          format: "Baled",
          unitPrice: order.pricePerTonne, // Changed to number (without $/MT)
        },
      ];

      // Calculate amounts and total
      let grandTotal = 0;
      const processedItems = items.map((item) => {
        const amount = item.qty * item.unitPrice;
        grandTotal += amount;

        return {
          ...item,
          qtyDisplay: `${item.qty}${item.unit}`, // e.g. "22MT"
          priceDisplay: `$${item.unitPrice.toFixed(2)}/${item.unit}`, // e.g. "$700.00/MT"
          amountDisplay: `USD $${amount.toFixed(2)}`, // e.g. "USD $15,400.00"
        };
      });

      // Draw item rows
      processedItems.forEach((item, rowIndex) => {
        const yPos = 310 - rowIndex * 50;

        // Description (wrapped)
        drawWrappedText(page1, item.desc, 32, yPos, 100, 15, {
          font: helvetica,
          size: 10,
        });

        // Other columns
        page1.drawText(item.qtyDisplay, {
          x: 152,
          y: yPos,
          size: 10,
          font: helvetica,
        });
        page1.drawText(item.format, {
          x: 272,
          y: yPos,
          size: 10,
          font: helvetica,
        });
        page1.drawText(item.priceDisplay, {
          x: 392,
          y: yPos,
          size: 10,
          font: helvetica,
        });
        page1.drawText(item.amountDisplay, {
          x: 512,
          y: yPos,
          size: 10,
          font: helvetica,
        });
      });

      // Draw Delivery Total
      const deliveryY = 310 - processedItems.length * 20 - 50; // 30pt below last item
      page1.drawText("Delivery", {
        x: 392,
        y: deliveryY,
        size: 10,
        font: helveticaBold,
      });
      page1.drawText(`${terms.incoTerm.name}`, {
        x: 512,
        y: deliveryY,
        size: 10,
        font: helveticaBold,
      });

      // Draw Delivery Total
      const totalY = 310 - processedItems.length * 30 - 50; // 30pt below last item
      page1.drawText("Total (excl. VAT):", {
        x: 392,
        y: totalY,
        size: 10,
        font: helveticaBold,
      });
      page1.drawText(`USD $${grandTotal.toFixed(2)}`, {
        x: 512,
        y: totalY,
        size: 10,
        font: helveticaBold,
      });

      //Footer
      page1.drawText("www.revas.com", {
        x: 450,
        y: 10,
        size: 10,
        font: helveticaBold,
      });
      page2.drawText("www.revas.com", {
        x: 450,
        y: 10,
        size: 10,
        font: helveticaBold,
      });

      // Terms Page (unchanged)
      page2.drawText("Terms and Conditions", {
        x: 32,
        y: 740,
        size: 40,
        color: rgb(0, 0, 0),
        font: helveticaBold,
      });

      // Clauses (exact text from original)
      const clauses = [
        {
          title: "1. General Terms",
          content:
            "11.1. This purchase order constitutes a legally binding agreement under English law between the Buyer, Revas Plastic Exchange (trading as 'Revas'), and the Supplier.",
        },
        {
          title: "2. Quality",
          content:
            "2.1.The material purchased must conform to the specifications outlined in this order and be of equal or superior quality to the materials depicted in photographs and/or previously inspected samples. \n" +
            "2.2.The material must be free from any contaminants, except those specifically permitted as indicated herein.",
        },
        {
          title: "3. Compliance with EN643 Grade",
          content:
            "3.1. This Clause 3 is only applicable if the purchased material is Fibre based, including but not limited to board, newspaper, and sorted paper. \n" +
            "3.2. The purchased materials must be compliant with the EN643 grade as mutually agreed upon and specified above.",
        },
        {
          title: "4. Prohibited Materials",
          content:
            "4.1. This Clause 4 is only applicable if the purchased material is Fibre based, including but not limited to board, newspaper, and sorted paper. \n" +
            "4.2. The Supplier shall ensure that no materials falling within the scope of CEPI's revised EN643, which pose health, safety, or environmental hazards, are included. Such materials include but are not limited to medical waste, contaminated personal hygiene products, hazardous waste, organic waste (including foodstuffs), bitumen, toxic powders, and similar substances.",
        },
        {
          title: "5. Moisture Content",
          content:
            "5.1. This Clause 5 is only applicable if the purchased material is Fibre based, including but not limited to board, newspaper, and sorted paper.  \n" +
            "5.2. If the average moisture content of the purchased materials exceeds 12% at the time of unloading, the Buyer shall have the right to seek reimbursement. This shall be accomplished by deducting the weight of any moisture exceeding 12% from the payable tonnage. Additionally, the Buyer reserves the right to recover any reasonable costs incurred by the Buyer, their customers, partners, or subcontractors.",
        },
        {
          title: "6. Inspection Rights",
          content:
            "6.1. The Buyer retains the right to inspect the materials at loading, or up to 72 hours prior to loading. This includes the ability to conduct moisture readings, capture photographic evidence of bales, perform gravimetric sampling, and break open bales for further examination. The Buyer may choose to delegate this task to a subcontractor.",
        },
      ];
      // Initialize Y position
      let currentY = 710;

      clauses.forEach((clause) => {
        // Draw Clause Title (bold)
        page2.drawText(clause.title, {
          x: 32,
          y: currentY,
          size: 10,
          font: helveticaBold,
        });
        currentY -= 15;

        // Split content by newlines to preserve intentional line breaks
        const paragraphs = clause.content.split("\n");

        paragraphs.forEach((paragraph) => {
          currentY =
            drawWrappedText(
              page2,
              paragraph,
              32, // Indent content
              currentY,
              550, // Max width
              15, // Line height
              {
                font: helvetica,
                size: 10,
                color: rgb(0, 0, 0),
              }
            ) - 15; // Small space between paragraphs
        });

        // Extra space after each clause
        currentY -= 5;
      });
      // Draw Clause Content (wrapped)
      /*   */

      // Signature Fields (centered at bottom)
      const sigY = 200;
      page2.drawText("__________________________", {
        x: 50,
        y: sigY,
        size: 12,
      });
      page2.drawText("Buyer's Signature", { x: 50, y: sigY - 20, size: 10 });
      /* page2.drawText("Date: ____/____/____", { x: 50, y: sigY - 40, size: 10 }); */

      page2.drawText("__________________________", {
        x: 400,
        y: sigY,
        size: 12,
      });
      page2.drawText("Supplier's Signature", {
        x: 400,
        y: sigY - 20,
        size: 10,
      });
      /*    page2.drawText("Date: ____/____/____", { x: 450, y: sigY - 40, size: 10 }); */

      async function addLogoToPDF(pdfDoc) {
        try {
          const logoBytes = fs.readFileSync(logoPath);
          const logoImage = await pdfDoc.embedPng(logoBytes); // For PNG
          // const logoImage = await pdfDoc.embedJpg(logoBytes); // For JPG
          return logoImage;
        } catch (error) {
          console.error("Logo not found. Using text fallback:", error.message);
          return null;
        }
      }

      // Usage
      const logoImage = await addLogoToPDF(pdfDoc);
      if (logoImage) {
        page1.drawImage(logoImage, {
          x: 32,
          y: 10, // Adjust position as needed
          width: 87.64, // Logo width in points (1/72 inch)
          height: 24, // Logo height
        });
        page2.drawImage(logoImage, {
          x: 32,
          y: 10, // Adjust position as needed
          width: 87.64, // Logo width in points (1/72 inch)
          height: 24, // Logo height
        });
      } else {
        page1.drawText("REVAS", { x: 450, y: 10, size: 24 }); // Fallback text
      }

      return await pdfDoc.save();
    } catch (error) {
      console.error("PDF generation failed:", {
        error: error.message,
        stack: error.stack,
        orderId: order?.id,
      });
      throw new Error("Failed to generate document");
    }
  }

  /**
   * Upload to Cloudinary Storage
   */
  static async uploadToStorage(buffer, filename, isPrivate = false) {
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: "raw",
            public_id: filename.replace('.pdf', ''),
            format: "pdf",
            type: isPrivate ? "private" : "upload",
            invalidate: true,
            transformation: [
              { flags: "attachment" }
            ],
          },
          (error, result) => {
            if (error) {
              console.error("Upload error:", error);
              reject(new Error("Failed to upload document"));
            } else {
              const pdfUrl = cloudinary.url(result.public_id, {
                resource_type: "raw",
                secure: true,
                sign_url: isPrivate,
                expires_at: isPrivate ? Math.floor(Date.now() / 1000) + 3600 : undefined
              });
              resolve({ url: pdfUrl, public_id: result.public_id });
            }
          }
        )
        .end(buffer);
    });
  }

  /**
   * Download document endpoint
   */
/*    static async downloadDocument(req, res) {
    let document;
    
    try {
      const { orderId } = req.params;
      const { user } = req;
  
      // 1. Validate document exists in database
      document = await Document.findOne({ where: { orderId } });
      if (!document || !document.fileUrl) {
        return res.status(404).json({ error: "Document not found in database" });
      }
  
      // 2. Verify user permissions
      const order = await Order.findByPk(orderId);
      if (!order || ![order.buyerId, order.supplierId].includes(user.id)) {
        return res.status(403).json({ error: "Not authorized" });
      }
  
      // 3. Extract public ID more reliably
      let publicId;
      try {
        const urlObj = new URL(document.fileUrl);
        publicId = urlObj.pathname
          .split('/')
          .slice(4) // Skip '/raw/upload/' parts
          .join('/')
          .replace('.pdf', '');
      } catch (e) {
        // Fallback for older URL formats
        const parts = document.fileUrl.split('/upload/');
        publicId = parts[1]?.replace('.pdf', '') || '';
      }
  
      if (!publicId) {
        throw new Error('Could not extract public ID from document URL');
      }
  
      // 4. Generate secure download URL
      const downloadUrl = cloudinary.url(publicId, {
        resource_type: 'raw',
        secure: true,
        sign_url: true,
        expires_at: Math.floor(Date.now() / 1000) + 300, // 5 minute expiry
        flags: 'attachment',
        type: 'authenticated' // Ensures proper access to private files
      });
  
      // 5. Verify the file exists on Cloudinary
      try {
        await cloudinary.api.resource(publicId, {
          resource_type: 'raw',
          type: 'authenticated'
        });
      } catch (cloudinaryError) {
        if (cloudinaryError.message.includes('404')) {
          throw new Error('Document not found on Cloudinary');
        }
        throw cloudinaryError;
      }
  
      // 6. Create notification
      await Notification.create({
        userId: user.id,
        orderId,
        message: `Downloaded ${document.type.replace('_', ' ')} document`,
        type: "document_downloaded"
      });
  
      // 7. Stream the file through the server
      const response = await axios.get(downloadUrl, {
        responseType: 'stream',
        maxRedirects: 0 // Important for signed URLs
      });
  
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="document_${orderId}.pdf"`);
      response.data.pipe(res);
  
    } catch (error) {
      console.error("Download error:", {
        message: error.message,
        documentUrl: document?.fileUrl,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
      
      const statusCode = error.message.includes('not found') ? 404 : 500;
      return res.status(statusCode).json({ 
        error: "Download failed",
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }  */

  /**
   * Secure document upload with private storage
   */

   static async downloadDocument(req, res) {
    let document;
    
    try {
      const { orderId } = req.params;
      const { user } = req;
  
      // 1. Validate document exists in database
      document = await Document.findOne({ 
        where: { orderId },
        include: [{ model: Order, as: 'order', required: true  }] // Eager load the order
      });
  
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
  
      // 2. Verify order exists and has required fields
      if (!document.Order || 
          !document.Order.buyerId || 
          !document.Order.supplierId) {
        return res.status(400).json({ error: "Invalid order data" });
      }
  
      // 3. Check user permissions
      const isAuthorized = user.id === document.Order.buyerId || 
                          user.id === document.Order.supplierId;
      if (!isAuthorized) {
        return res.status(403).json({ error: "Not authorized" });
      }
  
      if (!document.fileUrl) {
        return res.status(404).json({ error: "Document URL missing" });
      }
  
      // 2. Verify user permissions - now safe because order is loaded
      if (![document.Order.buyerId, document.Order.supplierId].includes(user.id)) {
        return res.status(403).json({ error: "Not authorized" });
      }
  
      // 3. Extract public ID with multiple fallback methods
      let publicId;
      try {
        // Method 1: URL parsing
        const urlObj = new URL(document.fileUrl);
        publicId = urlObj.pathname.split('/')
          .slice(urlObj.pathname.includes('raw/upload') ? 4 : 2)
          .join('/')
          .replace('.pdf', '');
      } catch (e) {
        // Method 2: Simple split fallback
        const parts = document.fileUrl.split('/upload/');
        publicId = parts[1] ? parts[1].replace('.pdf', '') : null;
      }
  
      if (!publicId) {
        throw new Error('Could not extract public ID from URL');
      }
  
      // 4. Generate secure download URL
      const downloadUrl = cloudinary.url(publicId, {
        resource_type: 'raw',
        secure: true,
        sign_url: true,
        expires_at: Math.floor(Date.now() / 1000) + 300,
        flags: 'attachment',
        type: 'authenticated'
      });
  
      // 5. Verify file exists on Cloudinary
      try {
        await cloudinary.api.resource(publicId, {
          resource_type: 'raw',
          type: 'authenticated'
        });
      } catch (err) {
        if (err.message.includes('404')) {
          throw new Error(`Document not found on Cloudinary: ${publicId}`);
        }
        throw err;
      }
  
      // 6. Create download notification
      await Notification.create({
        userId: user.id,
        orderId,
        message: `Downloaded ${document.type.replace('_', ' ')} document`,
        type: "document_downloaded"
      });
  
      // 7. Stream the file
      const response = await axios.get(downloadUrl, {
        responseType: 'stream',
        maxRedirects: 0
      });
  
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${document.type}_${orderId}.pdf"`);
      response.data.pipe(res);
  
    } catch (error) {
      console.error("Download error:", {
        message: error.message,
        documentUrl: document?.fileUrl,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
  
      const statusCode = error.message.includes('not found') ? 404 : 500;
      res.status(statusCode).json({ 
        error: "Download failed",
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  } 

  static async uploadSignedDocument(req, res) {
    try {
      const { orderId } = req.params;
      const { user } = req;
      
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      if (!req.file.mimetype.includes('pdf')) {
        return res.status(400).json({ error: "Only PDF files are allowed" });
      }

      const order = await Order.findByPk(orderId);
      if (![order.buyerId, order.supplierId].includes(user.id)) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const filename = `signed_docs/${orderId}_${Date.now()}`;
      const { public_id } = await DocumentController.uploadToStorage(
        req.file.buffer,
        filename,
        true // Mark as private
      );

      await Document.update({
        signingUrl: public_id,
        status: "fully_signed",
        signedById: user.id,
        signedAt: new Date()
      }, { where: { orderId } });

      const otherPartyId = user.id === order.buyerId ? order.supplierId : order.buyerId;
      
      await Notification.bulkCreate([
        {
          userId: user.id,
          orderId,
          message: "You uploaded a signed document",
          type: "document_uploaded"
        },
        {
          userId: otherPartyId,
          orderId,
          message: `${user.name} uploaded a signed document`,
          type: "document_uploaded"
        }
      ]);

      res.json({ success: true });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Upload failed" });
    }
  }

  /**
   * Admin-only document access
   */
  static async getSignedDocument(req, res) {
    try {
      const { orderId } = req.params;
      
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }

      const document = await Document.findOne({ where: { orderId } });
      if (!document?.signingUrl) {
        return res.status(404).json({ error: "Signed document not found" });
      }

      const signedUrl = cloudinary.url(document.signingUrl, {
        resource_type: 'raw',
        secure: true,
        sign_url: true,
        expires_at: Math.floor(Date.now() / 1000) + 300 // 5 minute expiry
      });

      res.json({ url: signedUrl });
    } catch (error) {
      console.error("Access error:", error);
      res.status(500).json({ error: "Document access failed" });
    }
  }
  static async getUserSignedDocument(req, res) {
    try {
      const { orderId } = req.params;
      const { user } = req;
  
      const order = await Order.findByPk(orderId);
      if (![order.buyerId, order.supplierId].includes(user.id)) {
        return res.status(403).json({ error: "Not authorized" });
      }
  
      const document = await Document.findOne({ where: { orderId } });
      if (!document?.signingUrl) {

        return res.status(404).json({ error: "No signed document found" });
      }
  
      const signedUrl = cloudinary.url(document.signingUrl, {
        resource_type: 'raw',
        secure: true,
        sign_url: true,
        expires_at: Math.floor(Date.now() / 1000) + 300 // 5 min expiry
      });
  
      res.json({ url: signedUrl });
    } catch (error) {
      console.error("Access error:", error);
      res.status(500).json({ error: "Document access failed" });
    }
  }
}

module.exports = DocumentController;
