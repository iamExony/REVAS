const nodemailer = require('nodemailer');

const sendEmail = async (to, subject, text) => {
   const transporter = nodemailer.createTransport({
     service: 'gmail', // Use your email service (e.g., Gmail, Outlook)
     host: "smtp.ethereal.email",
     port: 587,
     secure: false, // true for port 465, false for other ports
     auth: {
       user: process.env.EMAIL_USER, // Your email address
       pass: process.env.EMAIL_APP_PASSWORD/* .replace(/^"|"$/g, '')  */
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

module.exports = { sendEmail };
