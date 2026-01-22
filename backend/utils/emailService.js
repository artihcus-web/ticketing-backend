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
      <p>You can login directly using the link below:</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="https://ticket.artihcus.com/login" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Login to Articket</a>
      </p>
      <p style="margin-top: 20px;">Or copy this link: <a href="https://ticket.artihcus.com/login">https://ticket.artihcus.com/login</a></p>
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

/**
 * Send an email notification when a user's email is updated
 * @param {string} newEmail - The new email address
 * @param {string} oldEmail - The old email address
 * @param {string} role - Member role (for context)
 */
export const sendEmailUpdateNotification = async (newEmail, oldEmail, role) => {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
        console.warn('Email credentials not found in environment variables. Skipping email send.');
        return false;
    }

    const subject = `Articket - Login Email Updated`;

    const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Email Update Notification</h2>
      <p>Hello,</p>
      <p>Your login email address has been updated for your Articket account.</p>
      <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Old Email:</strong> ${oldEmail}</p>
        <p style="margin: 5px 0;"><strong>New Email:</strong> ${newEmail}</p>
        <p style="margin: 10px 0 5px 0;"><strong>Role:</strong> ${role.replace('_', ' ')}</p>
      </div>
      <p><strong>Important:</strong> Your password remains the same. Please use your new email address to login.</p>
      <p>You can login using the link below:</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="https://ticket.artihcus.com/login" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Login to Articket</a>
      </p>
      <p style="margin-top: 20px;">Or copy this link: <a href="https://ticket.artihcus.com/login">https://ticket.artihcus.com/login</a></p>
      <p>If you did not request this change, please contact your administrator immediately.</p>
      <p>Best regards,<br>The Articket Team</p>
    </div>
  `;

    const mailOptions = {
        from: process.env.MAIL_FROM || process.env.GMAIL_USER || 'contact@pdsatech.com', // Default sender
        to: newEmail,
        subject: subject,
        html: htmlContent,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Email update notification sent: ' + info.response);
        return true;
    } catch (error) {
        console.error('Error sending email update notification:', error);
        return false;
    }
};