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

// 2. MongoDB Schema & Model Configuration
const esp32GroupSchema = new mongoose.Schema({
    group_data: {
        strings: { type: mongoose.Schema.Types.Mixed }, // Dynamic JSON or Raw Text
        image: {
            url: { type: String, default: null },
            public_id: { type: String, default: null }
        }
    },
    timestamp: {
        iso_time: { type: Date, default: Date.now },
        date: { type: String }, // YYYY-MM-DD
        time: { type: String }  // HH:MM:SS AM/PM
    }
});

// Indexing for faster query execution by date/time
esp32GroupSchema.index({ "timestamp.iso_time": -1 });
esp32GroupSchema.index({ "timestamp.date": 1 });

const ESP32GroupData = mongoose.model('ESP32GroupData', esp32GroupSchema);

// 3. Multer Setup (In-Memory Buffer Storage)
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB Limit
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const cpUpload = upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'json_data', maxCount: 1 }
]);

// 4. ESP32 Data Upload Endpoint
app.post('/upload', (req, res) => {
    cpUpload(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ status: 'error', message: err.message });
        }

        try {
            console.log(`\n[${new Date().toLocaleString()}] 📥 Incoming Request from ESP32`);

            // A. Process JSON / String Payload
            let stringsData = {};
            if (req.body && req.body.json_data) {
                try {
                    stringsData = typeof req.body.json_data === 'string'
                        ? JSON.parse(req.body.json_data)
                        : req.body.json_data;
                } catch (pErr) {
                    stringsData = { raw_text: req.body.json_data };
                }
            }

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

            // C. Formatted Local Time Creation
            const now = new Date();
            const formattedDate = now.toLocaleDateString('sv-SE'); // Outputs YYYY-MM-DD
            const formattedTime = now.toLocaleTimeString();

            // D. Database Record Storage
            const newGroupRecord = new ESP32GroupData({
                group_data: {
                    strings: stringsData,
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
            console.log('💾 Group Data & Image metadata stored in MongoDB!');

            return res.status(200).json({
                status: 'success',
                message: 'String data and Image stored together successfully.',
                dataId: newGroupRecord._id,
                imageUrl: imageUrl,
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

// 5. Query Endpoint by Date
app.get('/data/by-date', async (req, res) => {
    try {
        const { date } = req.query; // e.g. /data/by-date?date=2026-08-28
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

// 6. Asynchronous Database Initializer & Express Bootstrapper
const mongoURI = process.env.MONGODB_URI;

if (mongoURI) {
    mongoose.connect(mongoURI, {
        serverSelectionTimeoutMS: 5000,
        family: 4
    })
    .then(() => console.log('🍃 Connected to MongoDB Atlas Successfully!'))
    .catch(err => console.error('❌ MongoDB Atlas Connection Failed:', err.message));
}

// Local မှာ run ရင် app.listen အလုပ်လုပ်မည်
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Node.js Server listening on port ${PORT}`);
    });
}

// Vercel Serverless အတွက် Export လုပ်ပေးရန်
module.exports = app;
