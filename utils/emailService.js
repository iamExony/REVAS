const nodemailer = require('nodemailer');
require('dotenv').config();


const sendEmail = async (to, subject, text) => {
   const transporter = nodemailer.createTransport({
     host: "smtp.zoho.com",
     port: 465,
     secure: true, // use SSL
     auth: {
       user: process.env.EMAIL_USER, // systems@userevas.com
       pass: process.env.EMAIL_APP_PASSWORD, 
     },
   });

   const mailOptions = {
     from: process.env.EMAIL_USER,
     to,
     subject,
     text
   };

   try {
     await transporter.sendMail(mailOptions);
     console.log('Email sent to:', to);
   } catch (error) {
     console.error('Email sending failed:', error);
   }
};

// Email templates
const templates  = {
  userRegistered: (user) => ({
    subject: 'Account Registration Successful',
    text:
     `
Dear ${user.firstName},\n
Thank you for signing up on the Revas platform!

We are excited to have you on board. Revas is committed to connecting you with the best procurement solutions, ensuring you receive top-quality materials efficiently.

What's Next?
An account manager will reach out to you shortly to schedule a meeting. During this meeting, we'll discuss how Revas can best serve your needs and ensure a smooth onboarding process.

We look forward to speaking with you soon!

Best regards,
The Revas Team
Thank you!`
  }),

  newUserNotification: (user, manager) => ({
    subject: 'New User Registration',
    text: `Hello ${manager.firstName},\n\nA new ${user.clientType} user has registered:\n\nName: ${user.firstName} ${user.lastName}\nEmail: ${user.email}\nRole: ${user.role}\n\n WhatsApp: ${user.whatsappNumber || "Not provided"}\n\nPlease review and approve/reject in your dashboard.`
  }),

  userApproved: (user) => ({
    subject: 'Account Approved',
    text: `Dear ${user.firstName},\n\nYour account has been approved. You can now login to the application.\n\nThank you!`
  }),

  userRejected: (user, reason) => ({
    subject: 'Account Rejected',
    text: `Dear ${user.firstName},\n\nYour account has been rejected for the following reason:\n\n${reason}\n\nPlease contact support if you have questions.`
  })
};

module.exports = { templates, sendEmail };
