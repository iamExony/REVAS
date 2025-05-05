const { PDFDocument, rgb, StandardFonts, degrees } = require("pdf-lib");
const { v4: uuidv4 } = require("uuid");
const { Order, Document, Notification, User } = require("../models");
const cloudinary = require("cloudinary").v2;
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const logoPath = path.join(__dirname, "../assets/revas-logo.png");
const { generateInvoiceNumber } = require("../utils/invoiceGenerator");
const crypto = require("crypto");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const axios = require("axios");


dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function drawWrappedText(page, text, x, y, maxWidth, lineHeight, options) {
  const words = String(text).split(" ");
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
function getClauses(page, heading, fontBold, fontNormal, clauses) {
  page.drawText(heading, {
    x: 32,
    y: 740,
    size: 40,
    color: rgb(0, 0, 0),
    font: fontBold,
  });
  // Initialize Y position
  let currentY = 710;

  clauses.forEach((clause) => {
    // Draw Clause Title (bold)
    page.drawText(clause.title, {
      x: 32,
      y: currentY,
      size: 10,
      font: fontBold,
    });
    currentY -= 15;

    // Split content by newlines to preserve intentional line breaks
    const paragraphs = clause.content.split("\n");

    paragraphs.forEach((paragraph) => {
      currentY =
        drawWrappedText(
          page,
          paragraph,
          32, // Indent content
          currentY,
          550, // Max width
          15, // Line height
          {
            font: fontNormal,
            size: 10,
            color: rgb(0, 0, 0),
          }
        ) - 15; // Small space between paragraphs
    });

    // Extra space after each clause
    currentY -= 5;
  });
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
      const docUrl =
        typeof uploadResult === "object" ? uploadResult.url : uploadResult;
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
      const page3 = pdfDoc.addPage([612, 792]); // A4 (portrait)
      const page4 = pdfDoc.addPage([612, 792]); // A4 (portrait)

      // Load fonts
      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      page1.drawText(
        type === "sales_order" ? "SALES ORDER" : "PURCHASE ORDER",
        {
          x: 32,
          y: 720,
          size: 45,
          color: rgb(0, 0, 0),
          font: helveticaBold,
        }
      );

      const InvoiceInfo = ["Invoice Number", order.invoiceNumber || order.id];
      InvoiceInfo.forEach((line, i) => {
        page1.drawText(line, {
          x: 32,
          y: 680 - i * 15,
          size: i === 0 ? 14 : 13,
          font: i === 0 ? helveticaBold : helvetica,
        });
      });
      let newDate = new Date().toLocaleDateString();
      const DocDate = ["Document Date", newDate];
      DocDate.forEach((line, i) => {
        page1.drawText(line, {
          x: 468,
          y: 680 - i * 15,
          size: i === 0 ? 14 : 13,
          font: i === 0 ? helveticaBold : helvetica,
        });
      });

      const lineOne = 640;
      page1.drawLine({
        start: { x: 32, y: lineOne },
        end: { x: 578, y: lineOne },
        thickness: 0.5,
        color: rgb(0.5, 0.5, 0.5), // Gray color
      });

      // Buyer/Supplier Data with wrapped names and addresses
      const parties = {
        buyer: {
          name: order.buyerName,
          address: order.buyerLocation,
        },
        supplier: {
          name: order.supplierName,
          address: order.supplierLocation,
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
          y: 620,
          size: 14,
          font: helveticaBold,
        });
      });

      // Draw wrapped content for each column
      let buyerY = 590;
      let supplierY = 590;

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
        y: 590,
        size: 10,
        font: helvetica,
      });

      // Divider Line
      page1.drawLine({
        start: { x: 32, y: 530 },
        end: { x: 578, y: 530 },
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
          name: `${order.paymentTerms}% due immediately. Remainder due 0 days after collection from supplier`,
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
          y: 510,
          size: 14,
          font: helveticaBold,
        });
      });

      // Draw wrapped content for each column
      let transportY = 490;
      let incoTermY = 490;
      let paymentTermY = 490;

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
        start: { x: 32, y: 420 },
        end: { x: 578, y: 420 },
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
          y: 400,
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
        const yPos = 380 - rowIndex * 50;

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
      const deliveryY = 370 - processedItems.length * 20 - 50; // 30pt below last item
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
      const totalY = 370 - processedItems.length * 30 - 50; // 30pt below last item
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
      function Logo(page, logoImage) {
        if (logoImage) {
          page.drawImage(logoImage, {
            x: 32,
            y: 10, // Adjust position as needed
            width: 87.64, // Logo width in points (1/72 inch)
            height: 24, // Logo height
          });
          page.drawImage(logoImage, {
            x: 32,
            y: 10, // Adjust position as needed
            width: 87.64, // Logo width in points (1/72 inch)
            height: 24, // Logo height
          });
        } else {
          page.drawText("REVAS", { x: 450, y: 10, size: 24 }); // Fallback text
        }
        page.drawText("www.revas.com", {
          x: 450,
          y: 10,
          size: 10,
          font: helveticaBold,
        });
      }
      Logo(page1, logoImage);

      //==========================TERMS PAGE (1) ======================================
      // Terms Page 2 (unchanged)
      const heading = "Terms and Conditions";
      // Clauses (exact text from original)
      const clauses = [
        {
          title: "1. General Terms",
          content:
            "1.1. This purchase order constitutes a legally binding agreement under Nigeria law between the Buyer, Revas Plastic Exchange (trading as 'Revas'), and the Supplier.\n",
        },
        {
          title: "2. Quality",
          content:
            "2.1.The material purchased must conform to the specifications outlined in this order and be of equal or superior quality to the materials depicted in photographs and/or previously inspected samples. \n" +
            "2.2.The material must be free from any contaminants, except those specifically permitted as indicated herein.\n",
        },
        {
          title: "3. Compliance with EN643 Grade",
          content:
            "3.1. This Clause 3 is only applicable if the purchased material is Fibre based, including but not limited to board, newspaper, and sorted paper. \n" +
            "3.2. The purchased materials must be compliant with the EN643 grade as mutually agreed upon and specified above.\n",
        },
        {
          title: "4. Prohibited Materials",
          content:
            "4.1. This Clause 4 is only applicable if the purchased material is Fibre based, including but not limited to board, newspaper, and sorted paper. \n" +
            "4.2. The Supplier shall ensure that no materials falling within the scope of CEPI's revised EN643, which pose health, safety, or environmental hazards, are included. Such materials include but are not limited to medical waste, contaminated personal hygiene products, hazardous waste, organic waste (including foodstuffs), bitumen, toxic powders, and similar substances.\n",
        },
        {
          title: "5. Moisture Content",
          content:
            "5.1. This Clause 5 is only applicable if the purchased material is Fibre based, including but not limited to board, newspaper, and sorted paper.  \n" +
            "5.2. If the average moisture content of the purchased materials exceeds 12% at the time of unloading, the Buyer shall have the right to seek reimbursement. This shall be accomplished by deducting the weight of any moisture exceeding 12% from the payable tonnage. Additionally, the Buyer reserves the right to recover any reasonable costs incurred by the Buyer, their customers, partners, or subcontractors.\n",
        },
        {
          title: "6. Inspection Rights",
          content:
            "6.1. The Buyer retains the right to inspect the materials at loading, or up to 72 hours prior to loading. This includes the ability to conduct moisture readings, capture photographic evidence of bales, perform gravimetric sampling, and break open bales for further examination. The Buyer may choose to delegate this task to a subcontractor.\n" +
            "6.2. If the materials fail to meet the specified requirements, the loading process will be suspended, and all costs associated with the cancellation shall be borne by the Supplier.\n" +
            "6.3. In the event that the materials fail to meet the specified requirements, the Buyer reserves the right to cancel or reschedule the loading. All costs related to this will be borne by the Supplier.\n",
        },
        {
          title: "7. Warranty and Claims",
          content:
            "7.1. The Buyer reserves the right to initiate a claim against the materials at any time within 90 days following the purchase should they be deemed non-compliant with the agreed-upon specifications. This claim shall be provided in writing.\n",
        },
      ];

      getClauses(page2, heading, helveticaBold, helvetica, clauses);

      // Usage
      const logoImage2 = await addLogoToPDF(pdfDoc);

      Logo(page2, logoImage2);

      //==========================TERMS PAGE (2) ======================================
      // Terms Page 2 (unchanged)

      // Clauses (exact text from original)
      const clauses3 = [
        {
          title: "8. Packing",
          content:
            "8.1. The Supplier must make all reasonable efforts to fully load the designated vehicle. The pricing is based on the minimum volumes specified in the agreement. If a shipment is under-loaded by more than 1000kg, the Buyer reserves the right to proportionately reduce the payment. For instance, if a container is under-loaded by 10% beyond the 1000kg buffer, the Buyer shall be entitled to reduce the price per tonne by 10%, in addition to only paying for the loaded weight.\n",
        },
        {
          title: "9. Shipping",
          content:
            "9.1. Both parties shall mutually agree upon a collection schedule subsequent to the acceptance of this purchase order.\n" +
            "9.2. If the Supplier needs to modify any aspect of the collection schedule, they must provide the Buyer with a minimum notice period of 48 hours. Any changes made thereafter may result in additional charges.\n" +
            "9.3. The Supplier shall cooperate with the Buyer's designated transport partner and must not unduly delay the loading process. In the event that the transportation vehicle remains on-site for more than 2 hours beyond the scheduled or actual arrival time (whichever is later), the waiting charges shall be borne by the Supplier. The Supplier shall also be liable for any additional charges incurred due to vehicle damage during the loading process.\n" +
            "9.4. The Supplier shall provide photographs of the loading in the format specified by the Buyer.\n",
        },
        {
          title: "10. Termination for Non-Loading",
          content:
            "10.1. If the materials are not loaded before the specified cutoff date, this agreement shall be deemed terminated. In the event that the Supplier fails to make a good-faith effort to load the materials prior to the cutoff date, the Buyer reserves the right to charge the Supplier up to 25% of the total deal value as compensation. \n" +
            "10.2. If no cut-off date is listed, this agreement will be considered void 90 days after signature, unless both parties agree in writing to extend it.\n",
        },
        {
          title: "11. Licences",
          content:
            "11.1. Both parties warrant that they possess all necessary licences and legal authority required to carry out this transaction in compliance with applicable laws and regulations.\n" +
            "11.2. The Buyer shall be responsible for providing a valid weighbridge calibration certificate prior to delivery.\n" +
            "11.3. The Supplier shall be responsible for ensuring that all required legal documents specified by the Buyer travel with the materials. This includes but is not limited to the Annex VII.\n" +
            "11.4. The Supplier shall be responsible for obtaining and maintaining any specific licences or permits required for the sale, delivery, or transportation of the materials.\n" +
            "11.5. Should any licence or legal authority become invalid or revoked during the term of this agreement, both parties must promptly notify the other in writing.\n",
        },
        {
          title: "12. Payment",
          content:
            "12.1. The price stated in this order does not include any sales taxes, including VAT. It is the Supplier's sole responsibility to ensure the accurate calculation and payment of all applicable taxes related to this transaction.\n",
        },
      ];

      getClauses(page3, heading, helveticaBold, helvetica, clauses3);

      // Usage

      const logoImage3 = await addLogoToPDF(pdfDoc);
      Logo(page3, logoImage3);

      //==========================SIGNING PAGE (3) ======================================
      const clauses4 = [
        {
          title: "13. Non-solicitation",
          content:
            "13.1. The supplier agrees that for a period of 12 months from the date of this agreement, they shall not attempt to directly contact, solicit, or engage in any form of business communication with any of the Buyer’s customers, agents, or representatives, where they have not had a previous business relationship with these entities.\n" +
            "13.2. The Supplier further agrees that any inquiries, proposals, offers, or communication from the parties referenced in clause 13.1 shall be directed solely to the Buyer. The Supplier shall promptly notify the Buyer of any inquiries or attempts by the parties to contact them directly.\n",
        },
        {
          title: "14. Further terms",
          content:
            "14.1. In addition to this Purchase Order, the terms on userevas.com also apply. In the event of any conflict or inconsistency between the terms of this Agreement and the Website Terms, the terms of this Agreement shall take precedence.\n",
        },
        {
          title: "15. Entire Agreement",
          content:
            "15.1. This Purchase Order, along with any attachments or amendments duly signed by both parties, constitutes the entire agreement between the Buyer and the Supplier and supersedes any prior discussions, understandings, or agreements, whether written or oral, relating to the subject matter herein.\n",
        },
        {
          title: "16. Governing Law and Jurisdiction",
          content:
            "16.1. This agreement shall be governed by and construed in accordance with the laws of Nigeria. Any disputes arising out of or in connection with this agreement shall be subject to the exclusive jurisdiction of the courts of Nigeria.\n",
        },
        {
          title: "17. Severability",
          content:
            "17.1. If any provision of this agreement is determined to be invalid, illegal, or unenforceable, the remaining provisions shall remain in full force and effect to the extent permitted by law.\n",
        },
        {
          title: "18. Waiver",
          content:
            "18.1. The failure of either party to enforce any provision of this agreement shall not be construed as a waiver of such provision or the right to enforce it in the future.",
        },
      ];

      // Divider Line
      let divSize3 = 240;
      page1.drawLine({
        start: { x: 32, y: divSize3 },
        end: { x: 578, y: divSize3 },
        thickness: 0.5,
        color: rgb(0.5, 0.5, 0.5), // Gray color
      });

      getClauses(page4, heading, helveticaBold, helvetica, clauses4);
      // Signature Fields (centered at bottom)
      const sigY = 240;
      /* page4.drawText("Revas Plastic Exchange", { x: 32, y: sigY, size: 12, font: helveticaBold }); */
      page1.drawText("Name: Ololade Adeniyi", {
        x: 32,
        y: sigY - 20,
        size: 10,
        font: helveticaBold,
      });
      page1.drawText("Title: Operations Manager", {
        x: 32,
        y: sigY - 40,
        size: 10,
        font: helveticaBold,
      });
      page1.drawText(`Date: ${newDate}`, {
        x: 32,
        y: sigY - 60,
        size: 10,
        font: helveticaBold,
      });

      const buyer = await User.findByPk(order.buyerId, {
        attributes: ["id", "firstName", "lastName", "role"],
      });
      const supplier = await User.findByPk(order.supplierId, {
        attributes: ["id", "firstName", "lastName", "role"],
      });
      let userName =
        type === "sales_order"
          ? buyer.firstName + " " + buyer.lastName
          : supplier.firstName + " " + supplier.lastName;
      let userRole = type === "sales_order" ? buyer.role : supplier.role;
      //Users Signature (buyer/supplier)
      page1.drawText(`Name: ${userName}`, {
        x: 400,
        y: sigY - 20,
        size: 10,
        font: helveticaBold,
      });
      page1.drawText(`Title: ${userRole}`, {
        x: 400,
        y: sigY - 40,
        size: 10,
        font: helveticaBold,
      });
      page1.drawText(`Date: ${newDate}`, {
        x: 400,
        y: sigY - 60,
        size: 10,
        font: helveticaBold,
      });
      page1.drawText("Signature", {
        x: 400,
        y: sigY - 90,
        size: 10,
        font: helveticaBold,
      });

      const logoImage4 = await addLogoToPDF(pdfDoc);
      Logo(page4, logoImage4);

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
            public_id: filename.replace(".pdf", ""),
            format: "pdf",
            type: isPrivate ? "private" : "upload",
            invalidate: true,
            transformation: [{ flags: "attachment" }],
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
                expires_at: isPrivate
                  ? Math.floor(Date.now() / 1000) + 3600
                  : undefined,
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
        include: [{ model: Order, as: "order", required: true }], // Eager load the order
      });

      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      // 2. Verify order exists and has required fields
      if (
        !document.Order ||
        !document.Order.buyerId ||
        !document.Order.supplierId
      ) {
        return res.status(400).json({ error: "Invalid order data" });
      }

      // 3. Check user permissions
      const isAuthorized =
        user.id === document.Order.buyerId ||
        user.id === document.Order.supplierId;
      if (!isAuthorized) {
        return res.status(403).json({ error: "Not authorized" });
      }

      if (!document.fileUrl) {
        return res.status(404).json({ error: "Document URL missing" });
      }

      // 2. Verify user permissions - now safe because order is loaded
      if (
        ![document.Order.buyerId, document.Order.supplierId].includes(user.id)
      ) {
        return res.status(403).json({ error: "Not authorized" });
      }

      // 3. Extract public ID with multiple fallback methods
      let publicId;
      try {
        // Method 1: URL parsing
        const urlObj = new URL(document.fileUrl);
        publicId = urlObj.pathname
          .split("/")
          .slice(urlObj.pathname.includes("raw/upload") ? 4 : 2)
          .join("/")
          .replace(".pdf", "");
      } catch (e) {
        // Method 2: Simple split fallback
        const parts = document.fileUrl.split("/upload/");
        publicId = parts[1] ? parts[1].replace(".pdf", "") : null;
      }

      if (!publicId) {
        throw new Error("Could not extract public ID from URL");
      }

      // 4. Generate secure download URL
      const downloadUrl = cloudinary.url(publicId, {
        resource_type: "raw",
        secure: true,
        sign_url: true,
        expires_at: Math.floor(Date.now() / 1000) + 300,
        flags: "attachment",
        type: "authenticated",
      });

      // 5. Verify file exists on Cloudinary
      try {
        await cloudinary.api.resource(publicId, {
          resource_type: "raw",
          type: "authenticated",
        });
      } catch (err) {
        if (err.message.includes("404")) {
          throw new Error(`Document not found on Cloudinary: ${publicId}`);
        }
        throw err;
      }

      // 6. Create download notification
      await Notification.create({
        userId: user.id,
        orderId,
        message: `Downloaded ${document.type.replace("_", " ")} document`,
        type: "document_downloaded",
      });

      // 7. Stream the file
      const response = await axios.get(downloadUrl, {
        responseType: "stream",
        maxRedirects: 0,
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${document.type}_${orderId}.pdf"`
      );
      response.data.pipe(res);
    } catch (error) {
      console.error("Download error:", {
        message: error.message,
        documentUrl: document?.fileUrl,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      });

      const statusCode = error.message.includes("not found") ? 404 : 500;
      res.status(statusCode).json({
        error: "Download failed",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
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

      if (!req.file.mimetype.includes("pdf")) {
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

      await Document.update(
        {
          signingUrl: public_id,
          status: "fully_signed",
          signedById: user.id,
          signedAt: new Date(),
        },
        { where: { orderId } }
      );

      const otherPartyId =
        user.id === order.buyerId ? order.supplierId : order.buyerId;

      await Notification.bulkCreate([
        {
          userId: user.id,
          orderId,
          message: "You uploaded a signed document",
          type: "document_uploaded",
        },
        {
          userId: otherPartyId,
          orderId,
          message: `${user.name} uploaded a signed document`,
          type: "document_uploaded",
        },
      ]);

      res.json({ success: true });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Upload failed" });
    }
  }
// Add to the top with other imports



  // ... (keep existing methods)

  /**
   * Handle in-app document signing
   */
  static async signDocument(req, res) {
    try {
      const { documentId } = req.params;
      const { user } = req;
      const { signatureData, signaturePosition, signerRole } = req.body;

      // Validate input
      if (!signatureData || !signaturePosition || !signerRole) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Get document and associated order
      const document = await Document.findByPk(documentId, {
        include: [{ model: Order, as: 'order' }]
      });

      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      // Authorization check
      if (
        (signerRole === 'buyer' && user.id !== document.order.buyerId) ||
        (signerRole === 'supplier' && user.id !== document.order.supplierId)
      ) {
        return res.status(403).json({ error: "Not authorized to sign this document" });
      }

      // Check document status
      if (document.status !== 'pending_signatures' && 
          document.status !== 'partially_signed') {
        return res.status(400).json({ error: "Document not ready for signing" });
      }

      // Process the PDF
      const signedPdfBuffer = await DocumentController.addSignatureToPdf(
        document.fileUrl,
        signatureData,
        signaturePosition
      );

      // Upload signed version
      const filename = `signed_${documentId}_${Date.now()}.pdf`;
      const uploadResult = await DocumentController.uploadToStorage(
        signedPdfBuffer,
        filename,
        false
      );

      // Update document record
      const updateData = {
        fileUrl: uploadResult.url,
        status: this.getUpdatedStatus(document, signerRole),
        metadata: {
          ...(document.metadata || {}),
          signatures: [
            ...(document.metadata?.signatures || []),
            {
              signerRole,
              signedAt: new Date().toISOString(),
              signedById: user.id
            }
          ]
        }
      };

      // Set appropriate signedAt field
      if (signerRole === 'buyer') {
        updateData.signedByBuyerAt = new Date();
      } else {
        updateData.signedBySupplierAt = new Date();
      }

      await document.update(updateData);

      // Notify other party if partially signed
      if (updateData.status === 'partially_signed') {
        const otherPartyId = signerRole === 'buyer' 
          ? document.order.supplierId 
          : document.order.buyerId;
        
        await Notification.create({
          userId: otherPartyId,
          orderId: document.orderId,
          message: `Document requires your signature (${document.type})`,
          type: "signature_required"
        });
      }

      res.json({
        success: true,
        signedUrl: uploadResult.url,
        status: updateData.status
      });

    } catch (error) {
      console.error("Signing error:", error);
      res.status(500).json({ error: "Document signing failed" });
    }
  }

  /**
   * Helper to determine new document status
   */
  static getUpdatedStatus(document, signerRole) {
    if (document.status === 'fully_signed') return 'fully_signed';
    
    if (signerRole === 'buyer') {
      return document.signedBySupplierAt ? 'fully_signed' : 'partially_signed';
    } else {
      return document.signedByBuyerAt ? 'fully_signed' : 'partially_signed';
    }
  }

  /**
   * Add signature to PDF
   */
  static async addSignatureToPdf(pdfUrl, signatureData, position) {
    try {
      // Fetch the PDF
      const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
      const pdfBytes = response.data;

      // Load the PDF
      const pdfDoc = await PDFDocument.load(pdfBytes);
      pdfDoc.registerFontkit(fontkit);

      // Get the page
      const pages = pdfDoc.getPages();
      const page = pages[position.pageNumber - 1]; // Convert to 0-based index

      // Convert base64 signature to PNG image
      const signatureImage = await pdfDoc.embedPng(
        signatureData.replace(/^data:image\/\w+;base64,/, '')
      );

      // Draw the signature
      page.drawImage(signatureImage, {
        x: position.x,
        y: position.y,
        width: position.width,
        height: position.height,
        rotate: degrees(0),
        opacity: 1
      });

      // Flatten the PDF
      const flattenedBytes = await pdfDoc.save();

      return Buffer.from(flattenedBytes);
    } catch (error) {
      console.error("PDF processing error:", error);
      throw new Error("Failed to add signature to PDF");
    }
  }

  /**
   * Admin-only document access
   */
  static async getSignedDocument(req, res) {
    try {
      const { orderId } = req.params;

      if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const document = await Document.findOne({ where: { orderId } });
      if (!document?.signingUrl) {
        return res.status(404).json({ error: "Signed document not found" });
      }

      const signedUrl = cloudinary.url(document.signingUrl, {
        resource_type: "raw",
        secure: true,
        sign_url: true,
        expires_at: Math.floor(Date.now() / 1000) + 300, // 5 minute expiry
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
        resource_type: "raw",
        secure: true,
        sign_url: true,
        expires_at: Math.floor(Date.now() / 1000) + 300, // 5 min expiry
      });

      res.json({ url: signedUrl });
    } catch (error) {
      console.error("Access error:", error);
      res.status(500).json({ error: "Document access failed" });
    }
  }
}

module.exports = DocumentController;
