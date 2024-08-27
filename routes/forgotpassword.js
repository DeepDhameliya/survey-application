import { Router } from "express";
import bcrypt from "bcrypt";
import db from "../config/db.js";
import nodemailer from "nodemailer";

const router1 = new Router();
const router2 = new Router();
const router3 = new Router();
const router4 = new Router();

const saltRounds = 10;

// Setup the nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    secure: false,
    auth: {
        user: process.env.ADMIN_EMAIL,
        pass: process.env.EMAIL_PASSWORD,
    },
});

// Router1: Handle the forgot password GET request
router1.get('/', (req, res) => {
    res.render('forgotpassword.ejs', { showResetForm: false, error: null });
});

router4.get('/', (req, res) => {
    const alertMessage = req.query.alert;
    res.render('forgotpassword.ejs', { showResetForm: false, error: null, alert: alertMessage });
});

// Router2: Handle password reset request (send reset token)
router2.post('/', async (req, res) => {
    const email = req.body.email;
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
        return res.render('forgotpassword.ejs', { showResetForm: false, error: 'Email not found', alert: 'Email not registered' });
    } else {
        const randomString = generateRandomString();
        const tokenTimestamp = new Date(); // Current timestamp
        await db.query('UPDATE users SET token_no = $1, token_timestamp = $2 WHERE email = $3', [randomString, tokenTimestamp, email]);

        const mailOptions = {
            from: process.env.ADMIN_EMAIL,
            to: email,
            subject: 'Password Reset',
            text: `To reset your password, enter this token number ${randomString}`,
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Error sending email:', error);
                return res.send('Error sending reset email');
            } else {
                console.log('Reset email sent:', info.response);
                return res.send('Reset email sent. Check your inbox.');
            }
        });

        return res.render('forgotpassword.ejs', { showResetForm: true, email, error: null });
    }
});

// Router3: Handle password update request (verify token and update password)
router3.post('/', async (req, res) => {
    const email = req.body.email;
    const newPassword = req.body.newPassword;
    const confirmPassword = req.body.confirmPassword;
    const token = req.body.resetToken;

    try {
        const result = await db.query("SELECT token_no, token_timestamp FROM users WHERE email = $1", [email]);

        if (result.rows.length === 0) {
            return res.render('forgotpassword.ejs', { showResetForm: true, email, error: null, alert: 'Email not found. Please try again.' });
        }

        const storedToken = result.rows[0].token_no;
        const tokenTimestamp = result.rows[0].token_timestamp;
        const currentTime = new Date();
        const tokenAge = (currentTime - new Date(tokenTimestamp)) / 1000; // Token age in seconds

        if (tokenAge > 30) { // Token is older than 30 seconds
            return res.redirect(`/resetpassword?alert=Token expired. Please request a new token.`);
        }

        if (storedToken !== token) {
            return res.render('forgotpassword.ejs', { showResetForm: true, email, error: null, alert: 'Invalid token. Please enter the correct token.' });
        }

        if (newPassword !== confirmPassword) {
            return res.render('forgotpassword.ejs', { showResetForm: true, email, error: null, alert: 'Passwords do not match. Please try again.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
        const updateResult = await db.query('UPDATE users SET password = $1, token_no = NULL, token_timestamp = NULL WHERE email = $2', [hashedPassword, email]);

        if (updateResult.rowCount > 0) {
            return res.redirect('/?alert=Password changed successfully. Please log in with your new password.');
        } else {
            return res.render('forgotpassword.ejs', { showResetForm: true, email, error: null, alert: 'Failed to update password. Please try again.' });
        }
    } catch (error) {
        console.error('Error updating password:', error);
        return res.status(500).send('Internal server error');
    }
});

// Helper function to generate a random string for the token
function generateRandomString() {
    const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const getRandomSymbol = () => {
        const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
        return symbols.charAt(getRandomInt(0, symbols.length - 1));
    };

    const getRandomLetter = () => {
        const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        return letters.charAt(getRandomInt(0, letters.length - 1));
    };

    const integerPart = getRandomInt(0, 9);
    const symbolPart = getRandomSymbol();
    const letterPart = Array.from({ length: 4 }, () => getRandomLetter()).join('');

    return `${integerPart}${symbolPart}${letterPart}`;
}

export default { router1, router2, router3, router4 };
