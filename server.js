require('dotenv').config();
const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Static Middleware & View Engine Setup
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2. Cloudinary Setup
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// 3. Database Connection (Vercel Ready)
const mongoURI = process.env.MONGODB_URI;
let isConnected = false;

const connectDB = async () => {
    if (isConnected || mongoose.connection.readyState === 1) {
        isConnected = true;
        return;
    }
    try {
        await mongoose.connect(mongoURI, {
            serverSelectionTimeoutMS: 5000,
            family: 4
        });
        isConnected = true;
        console.log('🍃 MongoDB Atlas Connected.');
    } catch (err) {
        console.error('❌ MongoDB Connection Error:', err.message);
    }
};

app.use(async (req, res, next) => {
    await connectDB();
    next();
});

// 4. Schema Definition
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

// Multer Config
const storage = multer.memoryStorage();
const upload = multer({ storage: storage, limits: { fileSize: 10 * 1024 * 1024 } });
const cpUpload = upload.fields([{ name: 'image', maxCount: 1 }, { name: 'json_data', maxCount: 1 }]);

// 5. ESP32 Data Upload Endpoint
app.post('/upload', (req, res) => {
    cpUpload(req, res, async (err) => {
        if (err) return res.status(400).json({ status: 'error', message: err.message });

        try {
            let parsedData = {};
            if (req.body && req.body.json_data) {
                try {
                    parsedData = typeof req.body.json_data === 'string' ? JSON.parse(req.body.json_data) : req.body.json_data;
                } catch (pErr) { console.error('JSON Error:', pErr.message); }
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

            const now = new Date();
            const formattedDate = now.toLocaleDateString('sv-SE');
            const formattedTime = now.toLocaleTimeString();

            const newRecord = new ESP32GroupData({
                group_data: {
                    strings: { class: detectedClass, confidence: detectedConfidence },
                    image: { url: imageUrl, public_id: publicId }
                },
                timestamp: { iso_time: now, date: formattedDate, time: formattedTime }
            });

            await newRecord.save();
            return res.status(200).json({ status: 'success', message: 'Data logged successfully.' });
        } catch (error) {
            return res.status(500).json({ status: 'error', message: error.message });
        }
    });
});

// 6. Analytics API Routes for Dashboard
app.get('/api/dashboard/summary', async (req, res) => {
    try {
        const { range } = req.query; // 'day', 'week', 'month'
        let startDate = new Date();

        if (range === 'week') startDate.setDate(startDate.getDate() - 7);
        else if (range === 'month') startDate.setMonth(startDate.getMonth() - 1);
        else startDate.setHours(0, 0, 0, 0); // 'day'

        const records = await ESP32GroupData.find({ "timestamp.iso_time": { $gte: startDate } }).sort({ "timestamp.iso_time": -1 });
        const latestRecord = await ESP32GroupData.findOne().sort({ "timestamp.iso_time": -1 });

        // Calculate Class Distribution
        const classCounts = {};
        let totalConfidence = 0;

        records.forEach(r => {
            const cName = r.group_data.strings.class;
            classCounts[cName] = (classCounts[cName] || 0) + 1;
            totalConfidence += r.group_data.strings.confidence;
        });

        const totalObjects = records.length;
        const avgConfidence = totalObjects > 0 ? (totalConfidence / totalObjects).toFixed(1) : 0;

        return res.status(200).json({
            status: 'success',
            summary: {
                totalObjects,
                avgConfidence,
                classCounts,
                latestRecord,
                records
            }
        });
    } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Dashboard Server on port ${PORT}`));
}

module.exports = app;
