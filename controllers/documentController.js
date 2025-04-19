const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const { v4: uuidv4 } = require("uuid");
const { Order, Document, Notification, User } = require("../models");
const docuseal = require("@docuseal/api");
const cloudinary = require("cloudinary").v2;
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const logoPath = path.join(__dirname, "../assets/revas-logo.png");
const { generateInvoiceNumber } = require("../utils/invoiceGenerator");

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Initialize DocuSeal client
docuseal.configure({
  apiKey: process.env.DOCUSEAL_API_KEY,
  baseUrl: process.env.DOCUSEAL_BASE_URL || "https://api.docuseal.com",
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
  /**
   * Generate sales order PDF
   */
  static async generateSalesOrder(req, res) {
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
      const docUrl = await DocumentController.uploadToStorage(
        pdfBuffer,
        filename
      );

      await order.update({
        invoiceNumber,
        status: "document_phase",
        docUrl,
        documentType: docType,
        documentGeneratedAt: new Date(),
      });

      // Notifications
      const notificationMessage = `${docType.replace("_"," ")} generated - please sign`;
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
   * Upload to Firebase Storage
   */
  static async uploadToStorage(buffer, filename) {
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: "raw",
            public_id: `documents/${filename.replace(".pdf", "")}`,
            format: "pdf",
            type: "upload",
            invalidate: true,
            transformation: [
              { flags: "attachment" }, // Forces download instead of browser preview
            ],
          },
          (error, result) => {
            if (error) {
              console.error("Upload error:", error);
              reject(new Error("Failed to upload document"));
            } else {
              // Build a direct access URL
              const pdfUrl = cloudinary.url(result.public_id, {
                resource_type: "raw",
                secure: true,
                sign_url: true, // Recommended for raw files
                expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour expiry
              });
              resolve(pdfUrl);
            }
          }
        )
        .end(buffer);
    });
  }
  /**
   * Initiate signing process
   */
  static async initiateSigning(req, res) {
    try {
      const { orderId, docType } = req.params;
      const order = await Order.findByPk(orderId, {
        include: [
          { model: User, as: "buyerUser" },
          { model: User, as: "supplierUser" },
        ],
      });

      if (!order) return res.status(404).json({ error: "Order not found" });

      const pdfBuffer = await this.generateOrderPDF(order, docType);
      const filename = `${docType}_${orderId}_${uuidv4()}.pdf`;
      const fileUrl = await this.uploadToStorage(pdfBuffer, filename);

      const submission = await docuseal.submissions.create({
        template_id: null,
        document: { file: pdfBuffer, name: filename },
        signers: [
          {
            email: order.buyerEmail,
            name: order.buyerName,
            role: "buyer",
            fields: [
              {
                type: "signature",
                page: 0,
                x: 100,
                y: 200,
                width: 120,
                height: 50,
              },
            ],
          },
          {
            email: order.supplierEmail,
            name: order.supplierName,
            role: "supplier",
            fields: [
              {
                type: "signature",
                page: 0,
                x: 100,
                y: 100,
                width: 120,
                height: 50,
              },
            ],
          },
        ],
        metadata: { orderId, documentType: docType },
        send_email: true,
        redirect_url: `${process.env.FRONTEND_URL}/orders/${orderId}`,
        expires_in: 7,
      });

      const document = await Document.create({
        id: uuidv4(),
        type: docType,
        orderId,
        fileUrl,
        docuSealId: submission.id,
        signingUrl: submission.url,
        status: "pending_signatures",
        generatedById: req.user.id,
      });

      await Notification.bulkCreate([
        {
          id: uuidv4(),
          type: "document_generated",
          message: `${docType.replace("_", " ")} document has been generated`,
          orderId,
          userId: req.user.id,
          metadata: { documentUrl: fileUrl },
        },
        {
          id: uuidv4(),
          type: "signature_requested",
          message: `Please sign the ${docType.replace("_", " ")}`,
          orderId,
          userId: order.buyerUser.id,
          metadata: { signingUrl: submission.url },
        },
        {
          id: uuidv4(),
          type: "signature_requested",
          message: `Please sign the ${docType.replace("_", " ")}`,
          orderId,
          userId: order.supplierUser.id,
          metadata: { signingUrl: submission.url },
        },
      ]);

      return res.status(201).json({
        success: true,
        documentId: document.id,
        signingUrl: submission.url,
        fileUrl,
      });
    } catch (error) {
      console.error("Signing initiation error:", error);
      return res.status(500).json({
        error: "Failed to initiate signing",
        details: error.message,
      });
    }
  }

  /**
   * Handle webhook events
   */
  static async handleWebhook(req, res) {
    try {
      if (!req.is("application/json")) {
        return res.status(400).send("Invalid content type");
      }

      if (process.env.DOCUSEAL_WEBHOOK_SECRET) {
        const signature = req.headers["docuseal-signature"];
        if (
          !signature ||
          !docuseal.webhooks.verify(
            req.body,
            signature,
            process.env.DOCUSEAL_WEBHOOK_SECRET
          )
        ) {
          return res.status(401).send("Invalid signature");
        }
      }

      const event = req.body;
      switch (event.event_type) {
        case "submission_completed":
          await this.handleSubmissionCompleted(event);
          break;
        case "submission_viewed":
          await this.handleSubmissionViewed(event);
          break;
        case "submission_opened":
          await this.handleSubmissionOpened(event);
          break;
      }

      res.status(200).send("Webhook processed");
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(500).send("Error processing webhook");
    }
  }

  static async handleSubmissionCompleted(event) {
    try {
      const { submission } = event.data;
      const document = await Document.findOne({
        where: { docuSealId: submission.id },
      });
      if (!document) return;

      const pdfBuffer = await docuseal.submissions.download(submission.id);
      const filename = `signed_${document.type}_${
        document.orderId
      }_${uuidv4()}.pdf`;
      const signedUrl = await this.uploadToStorage(pdfBuffer, filename);

      await document.update({
        fileUrl: signedUrl,
        status: "fully_signed",
        signedAt: new Date(),
      });

      const order = await Order.findByPk(document.orderId, {
        include: [
          { model: User, as: "buyerUser" },
          { model: User, as: "supplierUser" },
        ],
      });

      await Notification.bulkCreate([
        {
          id: uuidv4(),
          type: "signature_completed",
          message: `${document.type.replace("_", " ")} has been fully signed`,
          orderId: document.orderId,
          userId: document.generatedById,
          metadata: { documentUrl: signedUrl },
        },
        {
          id: uuidv4(),
          type: "signature_completed",
          message: `${document.type.replace("_", " ")} has been completed`,
          orderId: document.orderId,
          userId: order.buyerUser.id,
          metadata: { documentUrl: signedUrl },
        },
        {
          id: uuidv4(),
          type: "signature_completed",
          message: `${document.type.replace("_", " ")} has been completed`,
          orderId: document.orderId,
          userId: order.supplierUser.id,
          metadata: { documentUrl: signedUrl },
        },
      ]);
    } catch (error) {
      console.error("Submission completion error:", error);
    }
  }

  static async handleSubmissionViewed(event) {
    try {
      const { submission } = event.data;
      const document = await Document.findOne({
        where: { docuSealId: submission.id },
      });
      if (!document) return;

      await Notification.create({
        id: uuidv4(),
        type: "signature_requested",
        message: `${document.type.replace(
          "_",
          " "
        )} has been viewed by recipient`,
        orderId: document.orderId,
        userId: document.generatedById,
        metadata: { submissionId: submission.id },
      });
    } catch (error) {
      console.error("Submission viewed error:", error);
    }
  }

  static async handleSubmissionOpened(event) {
    try {
      const { submission } = event.data;
      const document = await Document.findOne({
        where: { docuSealId: submission.id },
      });
      if (!document) return;

      await document.update({ status: "pending_signatures" });
    } catch (error) {
      console.error("Submission opened error:", error);
    }
  }

  /**
   * Get document status
   */
  static async getDocumentStatus(req, res) {
    try {
      const document = await Document.findByPk(req.params.id);
      if (!document)
        return res.status(404).json({ error: "Document not found" });

      let statusDetails = {
        status: document.status,
        fileUrl: document.fileUrl,
      };

      if (
        document.docuSealId &&
        ["pending_signatures", "partially_signed"].includes(document.status)
      ) {
        try {
          const submission = await docuseal.submissions.get(
            document.docuSealId
          );
          statusDetails.docuSealStatus = submission.status;
          if (submission.status === "completed") {
            await document.update({ status: "fully_signed" });
            statusDetails.status = "fully_signed";
          }
        } catch (e) {
          console.error("DocuSeal status check error:", e);
        }
      }

      return res.json(statusDetails);
    } catch (error) {
      console.error("Status check error:", error);
      return res.status(500).json({ error: "Failed to get status" });
    }
  }
}

module.exports = DocumentController;
