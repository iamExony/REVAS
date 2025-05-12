const express = require("express");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const logoPath = path.join(__dirname, "../assets/revas-logo.png");

/**
 * @swagger
 * /pdf-test:
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

router.get("/pdf-test", async (req, res) => {
  try {
    const pdfDoc = await PDFDocument.create();
    const page1 = pdfDoc.addPage([612, 792]); // A4 (portrait)
    const page2 = pdfDoc.addPage([612, 792]); // A4 (portrait)
    const page3 = pdfDoc.addPage([612, 792]); // A4 (portrait)
    const page4 = pdfDoc.addPage([612, 792]); // A4 (portrait)

    // Load fonts
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    // Header
    page1.drawText("Purchase Order", {
      x: 32,
      y: 720,
      size: 64,
      color: rgb(0, 0, 0),
      font: helveticaBold,
    });

    const InvoiceInfo = ["Invoice Number", "PO-0924-SUP-001"];
    InvoiceInfo.forEach((line, i) => {
      page1.drawText(line, {
        x: 32,
        y: 680 - i * 15,
        size: i === 0 ? 14 : 13,
        font: i === 0 ? helveticaBold : helvetica,
      });
    });

    const DocDate = ["Document Date", "25 / 02 / 2025"];
    DocDate.forEach((line, i) => {
      page1.drawText(line, {
        x: 468,
        y: 680 - i * 15,
        size: i === 0 ? 14 : 13,
        font: i === 0 ? helveticaBold : helvetica,
      });
    });
    page1.drawLine({
      start: { x: 32, y: 640 },
      end: { x: 578, y: 640 },
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
    let divSize = 530
    page1.drawLine({
      start: { x: 32, y: divSize },
      end: { x: 578, y: divSize },
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
        y: 510,
        size: 14,
        font: helveticaBold,
      });
    });

    // Draw wrapped content for each column
    let nsize = 490
    let transportY = nsize;
    let incoTermY = nsize;
    let paymentTermY = nsize;

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
    let divSize2 = 420
    page1.drawLine({
      start: { x: 32, y: divSize2 },
      end: { x: 578, y: divSize2 },
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
    const currencyValue = (value) =>{
      
      const formattedAmount = value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });

      return formattedAmount
    }
    const processedItems = items.map((item) => {
      const amount = item.qty * item.unitPrice;
      grandTotal += amount;

      const unitPriceValue = `${item.unitPrice}/${item.unit}`
      return {
        ...item,
        qtyDisplay: `${item.qty}${item.unit}`, // e.g. "22MT"
        priceDisplay: `$${currencyValue(unitPriceValue)}`, // e.g. "$700.00/MT"
        amountDisplay: `USD $${currencyValue(amount)}`, // e.g. "USD $15,400.00"
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
    const deliveryY = 390 - processedItems.length * 20 - 50; // 30pt below last item
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
    const totalY = 390 - processedItems.length * 30 - 50; // 30pt below last item
    page1.drawText("Total (excl. VAT):", {
      x: 392,
      y: totalY,
      size: 10,
      font: helveticaBold,
    });
    page1.drawText(`USD $${currencyValue(grandTotal)}`, {
      x: 512,
      y: totalY,
      size: 10,
      font: helveticaBold,
    });
    // Draw Delivery Amount Due
    const subTotalY = 390 - processedItems.length * 40 - 50; // 30pt below last item
    page1.drawText("Amount due (50%):", {
      x: 392,
      y: subTotalY,
      size: 10,
      font: helveticaBold,
    });
    const amountDue = 0.5 * grandTotal
    page1.drawText(`USD $${(currencyValue(amountDue))}`, {
      x: 512,
      y: subTotalY,
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
          "9.4. The Supplier shall provide photographs of the loading in the format specified by the Buyer.\n"
      },
      {
        title: "10. Termination for Non-Loading",
        content:
          "10.1. If the materials are not loaded before the specified cutoff date, this agreement shall be deemed terminated. In the event that the Supplier fails to make a good-faith effort to load the materials prior to the cutoff date, the Buyer reserves the right to charge the Supplier up to 25% of the total deal value as compensation. \n" +
          "10.2. If no cut-off date is listed, this agreement will be considered void 90 days after signature, unless both parties agree in writing to extend it.\n"
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
        let divSize3 = 240
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
    page1.drawText("Name: Ololade Adeniyi", { x: 32, y: sigY - 20, size: 10, font: helveticaBold });
    page1.drawText("Title: Operations Manager", { x: 32, y: sigY - 40, size: 10, font: helveticaBold });
    page1.drawText("Date: 25 / 02 / 2025", { x: 32, y: sigY - 60, size: 10, font: helveticaBold }); 
    
    //Users Signature (buyer/supplier)
    page1.drawText("Name: Daniel Eloma", { x: 392, y: sigY - 20, size: 10, font: helveticaBold });
    page1.drawText("Title: Sales Manager", { x: 392, y: sigY - 40, size: 10, font: helveticaBold });
    page1.drawText("Date: 25 / 02 / 2025", { x: 392, y: sigY - 60, size: 10, font: helveticaBold }); 
    page1.drawText("Signature", { x: 392, y: sigY - 90, size: 10, font: helveticaBold }); 
    
    const logoImage4 = await addLogoToPDF(pdfDoc);
    Logo(page4, logoImage4);


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
