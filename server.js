require('dotenv').config();
const express = require('express');
const cors = require('cors'); // CORS Middleware ထည့်သွင်းခြင်း
const multer = require('multer');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS Setup (Live Server Port 5500 သို့မဟုတ် Cross-Origin Request များကို ခွင့်ပြုပေးခြင်း)
app.use(cors());

// Middleware Setup
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cloudinary Configuration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// MongoDB Connection Setup
const mongoURI = process.env.MONGODB_URI;


const connectDB = async () => {
    // 1 ဖြစ်နေရင် (Connected ဖြစ်နေရင်) ရှေ့ဆက်ရန်
    if (mongoose.connection.readyState === 1) {
        return;
    }
    
    // Connecting ဖြစ်နေဆဲအချိန်တွင် နောက်ထပ် connect ထပ်မခေါ်ရန်
    if (mongoose.connection.readyState === 2) {
        console.log('⏳ Waiting for existing MongoDB connection...');
        return;
    }

    try {
        await mongoose.connect(mongoURI, { 
            serverSelectionTimeoutMS: 5000,
            // family: 4 ကို ဖယ်ရှားလိုက်ပါ (ဒါကြောင့် Network / Atlas Timeout ခကြာခဏ ဖြစ်တတ်ပါသည်)
        });
        console.log('🍃 Connected to MongoDB Atlas');
    } catch (err) {
        console.error('❌ Database Connection Error:', err.message);
        // DB ချိတ်ဆက်မှု မရပါက Error Throw လုပ်ပေးရမည်
        throw new Error('Database Connection Failed: ' + err.message);
    }
};

// Express Middleware for Vercel / Serverless support
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
        // DB မရပါက API ကို ဆက်မသွားစေဘဲ 500 Error တိုက်ရိုက် ပြန်ပေးမည်
        return res.status(500).json({ 
            success: false, 
            message: 'Database connection fail ဖြစ်နေပါသည်။ ကျေးဇူးပြု၍ MongoDB Atlas IP Whitelist သို့မဟုတ် MONGO_URI ကို စစ်ဆေးပါ။' 
        });
    }
});


// Express Middleware for Vercel / Serverless support
app.use(async (req, res, next) => {
    await connectDB();
    next();
})

// Mongoose Schema & Model (ESP32 Data)
const esp32GroupSchema = new mongoose.Schema({
    group_data: {
        strings: {
            class: { type: String, required: true, default: 'unknown' },
            confidence: { type: Number, required: true, default: 0 }
        },
        image: {
            url: { type: String, default: null },
            public_id: { type: String, default: null }
        }
    },
    timestamp: {
        iso_time: { type: Date, default: Date.now },
        date: { type: String },
        time: { type: String }
    }
});

esp32GroupSchema.index({ "timestamp.iso_time": -1 });
esp32GroupSchema.index({ "timestamp.date": 1 });

const ESP32GroupData = mongoose.models.ESP32GroupData || mongoose.model('ESP32GroupData', esp32GroupSchema);

// Mongoose Schema & Model (Admin / Login User)
const adminUserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});

const AdminUser = mongoose.models.AdminUser || mongoose.model('AdminUser', adminUserSchema);

// Multer Memory Storage Configuration
const storage = multer.memoryStorage();
const upload = multer({ storage: storage, limits: { fileSize: 10 * 1024 * 1024 } });
const cpUpload = upload.fields([{ name: 'image', maxCount: 1 }, { name: 'json_data', maxCount: 1 }]);




app.post('/upload', (req, res) => {
    cpUpload(req, res, async (err) => {
        if (err) return res.status(400).json({ status: 'error', message: err.message });

        try {
            let parsedData = {};
            if (req.body && req.body.json_data) {
                try {
                    parsedData = typeof req.body.json_data === 'string' ? JSON.parse(req.body.json_data) : req.body.json_data;
                } catch (pErr) { 
                    console.error('JSON Parse Error:', pErr.message); 
                }
            }

            const detectedClass = parsedData.class || 'unknown';
            const detectedConfidence = Number(parsedData.confidence) || 0;

            let imageUrl = null;
            let publicId = null;
            const imageFile = req.files && req.files['image'] ? req.files['image'][0] : null;

            if (imageFile) {
                const cloudResult = await new Promise((resolve, reject) => {
                    const stream = cloudinary.uploader.upload_stream({ folder: 'esp32_captures' }, (error, result) => {
                        if (error) return reject(error);
                        resolve(result);
                    });
                    stream.end(imageFile.buffer);
                });
                imageUrl = cloudResult.secure_url;
                publicId = cloudResult.public_id;
            }

            // Asia/Yangon (UTC+6:30) Time Calculation
            const now = new Date();
            const mmTime = new Date(now.getTime() + (6.5 * 60 * 60 * 1000));

            // Date string: YYYY-MM-DD
            const formattedDate = mmTime.toISOString().split('T')[0];

            // Time string: hh:mm:ss AM/PM
            const formattedTime = mmTime.toLocaleTimeString('en-US', {
                timeZone: 'UTC',
                hour12: true,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            const newRecord = new ESP32GroupData({
                group_data: {
                    strings: { class: detectedClass, confidence: detectedConfidence },
                    image: { url: imageUrl, public_id: publicId }
                },
                timestamp: { 
                    iso_time: now,
                    date: formattedDate,
                    time: formattedTime
                }
            });

            await newRecord.save();
            return res.status(200).json({ status: 'success', message: 'Data logged successfully.' });
        } catch (error) {
            return res.status(500).json({ status: 'error', message: error.message });
        }
    });
});

// -----------------------------------------------------------------------------
// 2. Dashboard Analytics API (Specific Date Search + Presets)
// -----------------------------------------------------------------------------
app.get('/api/dashboard/summary', async (req, res) => {
    try {
        const { range, date } = req.query;
        let queryCondition = {};
        const now = new Date();

        if (date) {
            queryCondition = { "timestamp.date": date };
        } else {
            let startDate;
            const mmNow = new Date(now.getTime() + (6.5 * 60 * 60 * 1000));

            if (range === 'week') {
                startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
            } else if (range === 'month') {
                startDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
            } else {
                const mmTodayStart = new Date(Date.UTC(
                    mmNow.getUTCFullYear(),
                    mmNow.getUTCMonth(),
                    mmNow.getUTCDate(),
                    0, 0, 0
                ));
                startDate = new Date(mmTodayStart.getTime() - (6.5 * 60 * 60 * 1000));
            }

            queryCondition = { "timestamp.iso_time": { $gte: startDate } };
        }

        const records = await ESP32GroupData.find(queryCondition).sort({ "timestamp.iso_time": -1 });
        const latestRecord = await ESP32GroupData.findOne().sort({ "timestamp.iso_time": -1 });

        const classCounts = {};
        let totalConfidence = 0;
        const misclassifications = [];

        records.forEach(r => {
            const cName = r.group_data.strings.class;
            const conf = r.group_data.strings.confidence;

            classCounts[cName] = (classCounts[cName] || 0) + 1;
            totalConfidence += conf;

            if (conf < 70 || cName.toLowerCase() === 'unknown') {
                misclassifications.push(r);
            }
        });

        const totalObjects = records.length;
        const avgConfidence = totalObjects > 0 ? (totalConfidence / totalObjects).toFixed(1) : 0;
        const misclassCount = misclassifications.length;

        return res.status(200).json({
            status: 'success',
            summary: {
                totalObjects,
                avgConfidence,
                misclassCount,
                classCounts,
                latestRecord,
                misclassifications,
                records
            }
        });
    } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
});




app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username နှင့် Password ထည့်သွင်းရန် လိုအပ်ပါသည်။' });
        }

        const user = await AdminUser.findOne({ username });

        if (!user) {
            return res.status(401).json({ success: false, message: 'Access Denied: ဤ Username ဖြင့် အကောင့်မရှိပါ။' });
        }

        if (user.password !== password) {
            return res.status(401).json({ success: false, message: 'Access Denied: Password မှားယွင်းနေပါသည်။' });
        }

        // Database ထဲက role ကို တိုက်ရိုက်ယူပြီး ပို့ပေးပါ (မရှိမှသာ default ပေးမည်)
        return res.status(200).json({ 
            success: true, 
            message: 'Login successful', 
            username: user.username,
            role: user.role || 'Dept Account' 
        });

    } catch (err) {
        console.error('Login API Error:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
});


async function handlePasswordChangeSubmit(e) {
    e.preventDefault();
    const currentPassword = document.getElementById('current-pass').value.trim();
    const newPassword = document.getElementById('new-password').value.trim();
    
    // Token အစား localStorage ထဲက username ကို ယူခြင်း
    const username = localStorage.getItem('username');

    if (!username) {
        showCenterModal("အသုံးပြုသူ အချက်အလက် မတွေ့ပါ။ ကျေးဇူးပြု၍ ပြန်လည် Login ဝင်ပါ။", 'error');
        return;
    }

    try {
        const res = await fetch('/api/auth/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            // Token မပါတော့ဘဲ username, currentPassword, newPassword ကို ပို့ပါမည်
            body: JSON.stringify({ username, currentPassword, newPassword })
        });

        const data = await res.json();

        if (res.ok && data.success) {
            closeChangePasswordModal();
            showCenterModal("Password ပြောင်းလဲခြင်း အောင်မြင်ပါသည်။", 'success');
            e.target.reset(); // Form ကို ရှင်းလင်းရန်
        } else {
            showCenterModal(data.message || "Password ပြောင်းလဲရာတွင် အမှားအယွင်းရှိသည်။", 'error');
        }
    } catch (error) {
        console.error("Password Change Error:", error);
        showCenterModal("ဆာဗာချိတ်ဆက်မှု အမှားအယွင်းရှိသည်။", 'error');
    }
}



// Root Route - Serve Frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// -----------------------------------------------------------------------------
// Server Boot Sequence (Explicit MongoDB Connection on Startup)
// -----------------------------------------------------------------------------
const startServer = async () => {
    // 1. DB ကို တိုက်ရိုက် ဦးစွာ ချိတ်ဆက်မည်
    await connectDB();

    // 2. Server ကို Local Environment တွင် စတင် run မည်
    if (process.env.NODE_ENV !== 'production') {
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Dashboard server active at http://localhost:${PORT}`);
        });
    }
};

startServer();

module.exports = app;
