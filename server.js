require('dotenv').config();
const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const mongoURI = process.env.MONGODB_URI;
let isConnected = false;

const connectDB = async () => {
    if (isConnected || mongoose.connection.readyState === 1) {
        isConnected = true;
        return;
    }
    try {
        await mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 5000, family: 4 });
        isConnected = true;
        console.log('🍃 Connected to MongoDB Atlas');
    } catch (err) {
        console.error('❌ Database Connection Error:', err.message);
    }
};

app.use(async (req, res, next) => {
    await connectDB();
    next();
});

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

const storage = multer.memoryStorage();
const upload = multer({ storage: storage, limits: { fileSize: 10 * 1024 * 1024 } });
const cpUpload = upload.fields([{ name: 'image', maxCount: 1 }, { name: 'json_data', maxCount: 1 }]);

// ESP32 Upload Endpoint (မြန်မာစံတော်ချိန်ဖြင့် သိမ်းဆည်းရန် ပြင်ဆင်ထားပါသည်)
app.post('/upload', (req, res) => {
    cpUpload(req, res, async (err) => {
        if (err) return res.status(400).json({ status: 'error', message: err.message });

        try {
            let parsedData = {};
            if (req.body && req.body.json_data) {
                try {
                    parsedData = typeof req.body.json_data === 'string' ? JSON.parse(req.body.json_data) : req.body.json_data;
                } catch (pErr) { console.error('JSON Parse Error:', pErr.message); }
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

            // --- မြန်မာစံတော်ချိန် (Asia/Yangon - UTC+6:30) တွက်ချက်ခြင်း ---
            const now = new Date();
            const mmTime = new Date(now.getTime() + (6.5 * 60 * 60 * 1000));

            // ရက်စွဲ YYYY-MM-DD ပုံစံထုတ်ခြင်း
            const formattedDate = mmTime.toISOString().split('T')[0];

            // အချိန် hh:mm:ss AM/PM ပုံစံထုတ်ခြင်း
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
                    iso_time: now,       // Database Filter များအတွက် UTC အတိုင်းထားမည်
                    date: formattedDate, // မြန်မာစံတော်ချိန် ရက်စွဲ
                    time: formattedTime  // မြန်မာစံတော်ချိန် အချိန်
                }
            });

            await newRecord.save();
            return res.status(200).json({ status: 'success', message: 'Data logged successfully.' });
        } catch (error) {
            return res.status(500).json({ status: 'error', message: error.message });
        }
    });
});

// Full Dashboard Analytics API (မြန်မာစံတော်ချိန်အတိုင်း Filter စစ်ပေးမည်)
app.get('/api/dashboard/summary', async (req, res) => {
    try {
        const { range } = req.query; // 'day', 'week', 'month'
        
        const now = new Date();
        const mmNow = new Date(now.getTime() + (6.5 * 60 * 60 * 1000));
        let startDate;

        if (range === 'week') {
            startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        } else if (range === 'month') {
            startDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        } else {
            // Day Filter: မြန်မာစံတော်ချိန် ယနေ့ 00:00:00 မှ စတင်တွက်ချက်ခြင်း
            const mmTodayStart = new Date(Date.UTC(
                mmNow.getUTCFullYear(),
                mmNow.getUTCMonth(),
                mmNow.getUTCDate(),
                0, 0, 0
            ));
            startDate = new Date(mmTodayStart.getTime() - (6.5 * 60 * 60 * 1000));
        }

        const records = await ESP32GroupData.find({ "timestamp.iso_time": { $gte: startDate } }).sort({ "timestamp.iso_time": -1 });
        const latestRecord = await ESP32GroupData.findOne().sort({ "timestamp.iso_time": -1 });

        const classCounts = {};
        let totalConfidence = 0;
        const misclassifications = [];

        records.forEach(r => {
            const cName = r.group_data.strings.class;
            const conf = r.group_data.strings.confidence;

            classCounts[cName] = (classCounts[cName] || 0) + 1;
            totalConfidence += conf;

            // Misclassification Threshold: Confidence < 70% or class 'unknown'
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

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Dashboard server active at http://localhost:${PORT}`));
}

module.exports = app;
