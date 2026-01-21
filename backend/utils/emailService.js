import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Create transporter
const transporter = nodemailer.createTransport({
    service: 'gmail', // You can change this if using another provider
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
    },
});

/**
 * Send an email with credentials to a new member
 * @param {string} toEmail - Recipient email
 * @param {string} role - Member role (for context)
 * @param {string} password - The auto-generated password
 * @param {string} projectName - The project name they were added to
 */
export const sendCredentialsEmail = async (toEmail, role, password, projectName) => {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
        console.warn('Email credentials not found in environment variables. Skipping email send.');
        return false;
    }

    const subject = `Welcome to Articket - Login Credentials`;

    const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Welcome to Articket!</h2>
      <p>Hello,</p>
      <p>You have been added to the project <strong>${projectName}</strong> as a <strong>${role.replace('_', ' ')}</strong>.</p>
      <p>Here are your login credentials:</p>
      <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Email:</strong> ${toEmail}</p>
        <p style="margin: 5px 0;"><strong>Password:</strong> ${password}</p>
      </div>
      <p>Please login and change your password if desired.</p>
      <p>Best regards,<br>The Articket Team</p>
    </div>
  `;

    const mailOptions = {
        from: process.env.MAIL_FROM || process.env.GMAIL_USER || 'contact@pdsatech.com', // Default sender
        to: toEmail,
        subject: subject,
        html: htmlContent,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent: ' + info.response);
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
};
