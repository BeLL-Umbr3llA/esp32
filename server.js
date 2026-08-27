require('dotenv').config();
const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Cloudinary Setup
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// 2. Database Connection Handling for Vercel Serverless
const mongoURI = process.env.MONGODB_URI;

if (!mongoURI) {
    console.error('❌ MONGODB_URI is missing in environment variables!');
}

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
        console.log('🍃 Connected to MongoDB Atlas Successfully!');
    } catch (err) {
        console.error('❌ MongoDB Atlas Connection Failed:', err.message);
    }
};

// Middleware to ensure DB connection on every Vercel request
app.use(async (req, res, next) => {
    await connectDB();
    next();
});

// 3. MongoDB Schema & Model Configuration (Refined Schema)
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

// 4. Multer Setup
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const cpUpload = upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'json_data', maxCount: 1 }
]);

// 5. Routes Definition

// Root Route (Server & DB Health Status)
app.get('/', (req, res) => {
    const dbState = mongoose.connection.readyState;
    const states = { 0: 'Disconnected ❌', 1: 'Connected 🍃', 2: 'Connecting ⏳', 3: 'Disconnecting 🔄' };

    res.status(200).json({
        status: 'online',
        message: 'ESP32 Backend Server is Running! 🚀',
        database: states[dbState] || 'Unknown'
    });
});

// ESP32 Data Upload Endpoint
app.post('/upload', (req, res) => {
    cpUpload(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ status: 'error', message: err.message });
        }

        try {
            console.log(`\n[${new Date().toLocaleString()}] 📥 Incoming Request from ESP32`);

            // A. Process Processed JSON Data (class & confidence)
            let parsedData = {};
            if (req.body && req.body.json_data) {
                try {
                    parsedData = typeof req.body.json_data === 'string'
                        ? JSON.parse(req.body.json_data)
                        : req.body.json_data;
                } catch (pErr) {
                    console.error('⚠️ JSON Parsing Failed:', pErr.message);
                }
            }

            // Extract specific fields with fallback values
            const detectedClass = parsedData.class || 'unknown';
            const detectedConfidence = Number(parsedData.confidence) || 0;

            console.log(`🏷️ Class: ${detectedClass} | 🎯 Confidence: ${detectedConfidence}%`);

            // B. Cloudinary Image Stream Handling
            let imageUrl = null;
            let publicId = null;
            const imageFile = req.files && req.files['image'] ? req.files['image'][0] : null;

            if (imageFile) {
                const uploadToCloudinary = () => {
                    return new Promise((resolve, reject) => {
                        const stream = cloudinary.uploader.upload_stream(
                            { folder: 'esp32_captures' },
                            (error, result) => {
                                if (error) return reject(error);
                                resolve(result);
                            }
                        );
                        stream.on('error', (streamErr) => reject(streamErr));
                        stream.end(imageFile.buffer);
                    });
                };

                const cloudResult = await uploadToCloudinary();
                imageUrl = cloudResult.secure_url;
                publicId = cloudResult.public_id;
            }

            // C. Time Formatting (Myanmar Time / Server Local Time)
            const now = new Date();
            const formattedDate = now.toLocaleDateString('sv-SE'); // Format: YYYY-MM-DD
            const formattedTime = now.toLocaleTimeString();       // Format: HH:MM:SS AM/PM

            // D. Save Structured Data to Database
            const newGroupRecord = new ESP32GroupData({
                group_data: {
                    strings: {
                        class: detectedClass,
                        confidence: detectedConfidence
                    },
                    image: {
                        url: imageUrl,
                        public_id: publicId
                    }
                },
                timestamp: {
                    iso_time: now,
                    date: formattedDate,
                    time: formattedTime
                }
            });

            await newGroupRecord.save();
            console.log('💾 Clean Structured Data & Image metadata saved successfully!');

            return res.status(200).json({
                status: 'success',
                message: 'Data saved successfully.',
                dataId: newGroupRecord._id,
                savedData: {
                    class: detectedClass,
                    confidence: detectedConfidence,
                    imageUrl: imageUrl
                },
                savedAt: {
                    date: formattedDate,
                    time: formattedTime
                }
            });

        } catch (error) {
            console.error('❌ Server Internal Error:', error);
            return res.status(500).json({ status: 'error', message: error.message });
        }
    });
});

// Query Endpoint by Date
app.get('/data/by-date', async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) {
            return res.status(400).json({ status: 'error', message: 'Please provide date parameter (?date=YYYY-MM-DD)' });
        }

        const records = await ESP32GroupData.find({ "timestamp.date": date })
            .sort({ "timestamp.iso_time": -1 });

        return res.status(200).json({
            status: 'success',
            count: records.length,
            date: date,
            records: records
        });
    } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
});

// Local Development Server Listener
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Node.js Server listening on port ${PORT}`);
    });
}

// 6. Export app for Vercel Serverless Function
module.exports = app;
