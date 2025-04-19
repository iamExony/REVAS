const express = require("express");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const logoPath = path.join(__dirname, "../assets/revas-logo.png");

/**
 * @swagger
 * /api/pdf-test:
 *   get:
 *     summary: Generate a test PDF
 *     tags: [PDF]
 *     responses:
 *       200:
 *         description: PDF file
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 */

// Helper function to wrap text
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

router.get("/api/pdf-test", async (req, res) => {
  try {
    const pdfDoc = await PDFDocument.create();
    const page1 = pdfDoc.addPage([612, 792]); // A4 (portrait)
    const page2 = pdfDoc.addPage([612, 792]); // A4 (portrait)
  

    // Load fonts
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    // Header
    page1.drawText("Purchase Order", {
      x: 32,
      y: 661,
      size: 64,
      color: rgb(0, 0, 0),
      font: helveticaBold,
    });

    const InvoiceInfo = ["Invoice Number", "PO-0924-SUP-001"];
    InvoiceInfo.forEach((line, i) => {
      page1.drawText(line, {
        x: 32,
        y: 620 - i * 15,
        size: i === 0 ? 14 : 13,
        font: i === 0 ? helveticaBold : helvetica,
      });
    });

    const DocDate = ["Document Date", "25 / 02 / 2025"];
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
        name: "Revas Plastic Exchange International Trading Limited",
        address:
          "15, Road 12, Peace Estate, Baruwa, Ipaja, Lagos State, Nigeria",
      },
      supplier: {
        name: "Atunlo Sustainability and Technologies Limited (Western Africa Branch)",
        address:
          "Oriwu Street, Lekki Phase 1, Eti-Osa Local Government, Lagos State, Nigeria",
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
        name: "50.00% due immediately. Remainder due 0 days after collection from supplier",
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
        desc: "PET Hot-washed Flakes International Presbytrye of council",
        qty: 22, // Changed to number
        unit: "MT", // Added separate unit field
        format: "Baled",
        unitPrice: 700.0, // Changed to number (without $/MT)
      },
      {
        desc: "HDPE Pellets Premium Grade",
        qty: 15,
        unit: "MT",
        format: "Bags",
        unitPrice: 850.0,
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
          "6.1. The Buyer retains the right to inspect the materials at loading, or up to 72 hours prior to loading. This includes the ability to conduct moisture readings, capture photographic evidence of bales, perform gravimetric sampling, and break open bales for further examination. The Buyer may choose to delegate this task to a subcontractor." 
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

      paragraphs.forEach(paragraph => {
        currentY = drawWrappedText(
          page2,
          paragraph,
          32, // Indent content
          currentY,
          550, // Max width
          15,  // Line height
          {
            font: helvetica,
            size: 10,
            color: rgb(0, 0, 0)
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
    page2.drawText("__________________________", { x: 50, y: sigY, size: 12 });
    page2.drawText("Buyer's Signature", { x: 50, y: sigY - 20, size: 10 });
    /* page2.drawText("Date: ____/____/____", { x: 50, y: sigY - 40, size: 10 }); */

    page2.drawText("__________________________", { x: 400, y: sigY, size: 12 });
    page2.drawText("Supplier's Signature", { x: 400, y: sigY - 20, size: 10 });
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


    // 3. Save as binary
    const pdfBytes = await pdfDoc.save();

    // 4. Send as raw binary
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="test.pdf"');
    res.send(Buffer.from(pdfBytes)); // Force binary response
  } catch (error) {
    console.error("PDF error:", error);
    res.status(500).send("PDF generation failed");
  }
});

module.exports = router;
