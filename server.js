
import express from 'express';
import cors from 'cors';
import sgMail from '@sendgrid/mail';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: './.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Log all requests
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

app.post('/api/send-email', async (req, res) => {
    const { to, subject, text, html } = req.body;
    const apiKey = process.env.VITE_SENDGRID_API_KEY;

    if (!apiKey) {
        console.error("CRITICAL: VITE_SENDGRID_API_KEY is missing in backend .env.local!");
        return res.status(500).json({ error: "Server misconfiguration: Missing API Key" });
    }

    sgMail.setApiKey(apiKey);

    const msg = {
        to: to,
        from: 'Ganeshgouli204@gmail.com', // User verified sender
        subject: subject,
        text: text,
        html: html,
    };

    try {
        console.log(`Attempting to send email from Ganeshgouli204@gmail.com to ${to}...`);
        await sgMail.send(msg);
        console.log("Email sent successfully!");
        res.status(200).json({ message: "Email sent successfully" });
    } catch (error) {
        console.error("SendGrid Error:", error);
        if (error.response) {
            console.error(error.response.body);
        }
        res.status(500).json({ error: "Failed to send email", details: error.message });
    }
});

// In-memory store for users and their daily activity
const users = {}; // Format: { "email": { registeredAt: Date, logs: { "YYYY-MM-DD": { breakfast: bool, lunch: bool, dinner: bool, anyLog: bool } }, sentReminders: { "YYYY-MM-DD": { breakfastStart: bool, breakfastMissed: bool, ... } } } }

// Helper to get today's date string YYYY-MM-DD
const getToday = () => new Date().toISOString().split('T')[0];

const sendEmail = async (to, subject, text) => {
    const apiKey = process.env.VITE_SENDGRID_API_KEY;
    if (!apiKey) return console.error("Missing API Key");
    sgMail.setApiKey(apiKey);
    const msg = {
        to,
        from: 'Ganeshgouli204@gmail.com',
        subject,
        text,
        html: `<div style="font-family: Arial, sans-serif; padding: 20px;"><h2>Health Hub AI Reminder</h2><p>${text}</p></div>`
    };
    try {
        await sgMail.send(msg);
        console.log(`Notification sent to ${to}: ${subject}`);
    } catch (error) {
        console.error(`Failed to send email to ${to}`, error);
    }
};

app.post('/api/register-user', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    // Initialize user if not exists
    if (!users[email]) {
        users[email] = { registeredAt: new Date(), logs: {}, sentReminders: {} };
        console.log(`User registered for notifications: ${email}`);
    }

    // Check for Lunch Login Trigger (1:00 PM - 2:30 PM)
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const today = getToday();
    const totalMinutes = hour * 60 + minute;

    // 13:00 is 780 minutes, 14:30 is 870 minutes
    if (totalMinutes >= 780 && totalMinutes <= 870) {
        const userLogs = users[email].logs[today];
        const userReminders = users[email].sentReminders[today] || {};

        // If not logged lunch and haven't been reminded recently (prevent spam on page refresh)
        if ((!userLogs || !userLogs.lunch) && !userReminders.loginLunchReminder) {
            sendEmail(email, "Don't forget Lunch!", "We noticed you just logged in. Have you had lunch yet? Snap a pic!");

            // Mark as sent so we don't spam on every page reload/navigation
            if (!users[email].sentReminders[today]) users[email].sentReminders[today] = {};
            users[email].sentReminders[today].loginLunchReminder = true;
            console.log(`Login trigger: Sent lunch reminder to ${email}`);
        }
    }

    res.status(200).json({ message: "Registered" });
});

app.post('/api/log-food', (req, res) => {
    const { email } = req.body;
    if (!email || !users[email]) return res.status(404).json({ error: "User not found or not registered" });

    const today = getToday();
    if (!users[email].logs[today]) users[email].logs[today] = { breakfast: false, lunch: false, dinner: false, anyLog: false };

    // Mark activity
    users[email].logs[today].anyLog = true;

    // Heuristic for meal types based on current time (optional, can be improved with explicit types)
    const hour = new Date().getHours();
    if (hour < 11) users[email].logs[today].breakfast = true;
    else if (hour < 16) users[email].logs[today].lunch = true;
    else users[email].logs[today].dinner = true;

    console.log(`Activity logged for ${email} at ${hour}:00`);
    res.status(200).json({ message: "Logged" });
});

// Scheduler for Reminders
setInterval(() => {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const today = getToday();

    // Check every registered user
    Object.keys(users).forEach(email => {
        const user = users[email];
        if (!user.sentReminders[today]) user.sentReminders[today] = {};
        const reminders = user.sentReminders[today];
        const logs = user.logs[today] || { breakfast: false, lunch: false, dinner: false, anyLog: false };

        // 1. Breakfast (9:00 AM Reminder, 10:00 AM Missed Check)
        if (hour === 9 && minute === 0 && !reminders.breakfastStart) {
            sendEmail(email, "Good Morning! Time for Breakfast", "Kickstart your day with a healthy breakfast. Don't forget to log it!");
            user.sentReminders[today].breakfastStart = true;
        }
        if (hour === 10 && minute === 0 && !reminders.breakfastMissed && !logs.breakfast) { // Simple logic: if no food logged by 10am, assume missed breakfast
            sendEmail(email, "Missed Breakfast?", "Hi! We noticed you haven't logged your breakfast yet. Consistency is key!");
            user.sentReminders[today].breakfastMissed = true;
        }

        // 2. Lunch (1:00 PM (13) Reminder, 2:00 PM (14) Missed Check)
        if (hour === 13 && minute === 0 && !reminders.lunchStart) {
            sendEmail(email, "It's Lunch Time!", "Refuel your body with a nutritious lunch. Using AI to log it takes just seconds!");
            user.sentReminders[today].lunchStart = true;
        }
        if (hour === 14 && minute === 0 && !reminders.lunchMissed && !logs.lunch) {
            sendEmail(email, "Forgot Lunch?", "Hey! You haven't logged any lunch yet. Keep your energy up!");
            user.sentReminders[today].lunchMissed = true;
        }

        // 3. Dinner (8:00 PM (20) Reminder, 9:00 PM (21) Missed Check)
        if (hour === 20 && minute === 0 && !reminders.dinnerStart) {
            sendEmail(email, "Dinner Time", "Time to wind down with a healthy dinner. Snap a pic and log it!");
            user.sentReminders[today].dinnerStart = true;
        }
        if (hour === 21 && minute === 0 && !reminders.dinnerMissed && !logs.dinner) {
            sendEmail(email, "Missed Dinner?", "We missed your dinner log. Everything okay? Don't forget to track!");
            user.sentReminders[today].dinnerMissed = true;
        }

        // 4. End of Day Zero Activity Check (11:00 PM)
        if (hour === 23 && minute === 0 && !reminders.dailySummary && !logs.anyLog) {
            sendEmail(email, "No Activity Today", "We didn't see any food logs from you today. Tomorrow is a new start!");
            user.sentReminders[today].dailySummary = true;
        }
    });

}, 60000); // Check every minute

// Serve static frontend files from 'dist' folder
app.use(express.static(path.join(__dirname, 'dist')));

// Handle React routing, return all requests to React app
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
    console.log("Updated with correct Sender: Ganeshgouli204@gmail.com");
    console.log("Scheduler active for Meal Reminders (9am/10am, 1pm/2pm, 8pm/9pm).");
});
