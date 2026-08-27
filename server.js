require('dotenv').config();
const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Gemini API Setup
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 2. Cloudinary Setup
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// 3. Database Connection Handling
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
        console.log('🍃 Connected to MongoDB Atlas Successfully!');
    } catch (err) {
        console.error('❌ MongoDB Connection Error:', err.message);
    }
};

app.use(async (req, res, next) => {
    await connectDB();
    next();
});

// 4. Schema (ESP32 Data + Gemini Verification)
const esp32GroupSchema = new mongoose.Schema({
    group_data: {
        strings: {
            class: { type: String, required: true },       // ESP32 က ပို့လိုက်သည့် class
            confidence: { type: Number, required: true },  // ESP32 က ပို့လိုက်သည့် confidence
            is_correct: { type: Boolean, required: true }  // Gemini က စစ်ပေးသည့် True/False
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

const ESP32GroupData = mongoose.models.ESP32GroupData || mongoose.model('ESP32GroupData', esp32GroupSchema);

const storage = multer.memoryStorage();
const upload = multer({ storage: storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const cpUpload = upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'json_data', maxCount: 1 }
]);

// 5. Gemini Image Verification Helper
async function verifyImageWithGemini(imageBuffer, esp32Class) {
    try {
        const prompt = `
        Look at this image. Is this object a "${esp32Class}"?
        Reply strictly with JSON format without markdown blocks:
        {
            "is_correct": true or false
        }`;

        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: [
                prompt,
                {
                    inlineData: {
                        mimeType: 'image/jpeg',
                        data: imageBuffer.toString('base64')
                    }
                }
            ],
            config: {
                responseMimeType: "application/json"
            }
        });

        const resJson = JSON.parse(response.text.trim());
        return resJson.is_correct === true;
    } catch (error) {
        console.error('⚠️ Gemini Verification Failed:', error.message);
        return false;
    }
}

// 6. Routes
app.get('/', (req, res) => {
    res.status(200).json({ status: 'online', message: 'ESP32 Server Ready! 🚀' });
});

app.post('/upload', (req, res) => {
    cpUpload(req, res, async (err) => {
        if (err) return res.status(400).json({ status: 'error', message: err.message });

        try {
            console.log(`\n[${new Date().toLocaleString()}] 📥 Incoming Upload Request`);

            // A. ESP32 Data ရယူခြင်း
            let parsedData = {};
            if (req.body && req.body.json_data) {
                try {
                    parsedData = typeof req.body.json_data === 'string'
                        ? JSON.parse(req.body.json_data)
                        : req.body.json_data;
                } catch (pErr) {
                    console.error('⚠️ JSON Parse Error:', pErr.message);
                }
            }

            const esp32Class = parsedData.class || 'unknown';
            const esp32Confidence = Number(parsedData.confidence) || 0;

            const imageFile = req.files && req.files['image'] ? req.files['image'][0] : null;
            let imageUrl = null;
            let publicId = null;
            let isCorrect = false;

            if (imageFile) {
                // Cloudinary Upload
                const uploadToCloudinary = () => {
                    return new Promise((resolve, reject) => {
                        const stream = cloudinary.uploader.upload_stream(
                            { folder: 'esp32_captures' },
                            (error, result) => {
                                if (error) return reject(error);
                                resolve(result);
                            }
                        );
                        stream.end(imageFile.buffer);
                    });
                };

                const cloudResult = await uploadToCloudinary();
                imageUrl = cloudResult.secure_url;
                publicId = cloudResult.public_id;

                // Gemini Verification (ESP32 ရဲ့ Class နဲ့ တိုက်စစ်ခြင်း)
                console.log(`🤖 Gemini Verifying if image matches: "${esp32Class}"...`);
                isCorrect = await verifyImageWithGemini(imageFile.buffer, esp32Class);
                console.log(`🎯 Verification Result: ${isCorrect ? '✅ MATCHED (true)' : '❌ MISMATCHED (false)'}`);
            }

            // B. Database ထဲသိမ်းဆည်းခြင်း (ESP32 Data + Gemini's is_correct)
            const now = new Date();
            const formattedDate = now.toLocaleDateString('sv-SE');
            const formattedTime = now.toLocaleTimeString();

            const newRecord = new ESP32GroupData({
                group_data: {
                    strings: {
                        class: esp32Class,
                        confidence: esp32Confidence,
                        is_correct: isCorrect
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

            await newRecord.save();
            console.log('💾 Record successfully saved to MongoDB!');

            return res.status(200).json({
                status: 'success',
                savedData: {
                    class: esp32Class,
                    confidence: esp32Confidence,
                    is_correct: isCorrect,
                    imageUrl: imageUrl
                }
            });

        } catch (error) {
            console.error('❌ Server Internal Error:', error);
            return res.status(500).json({ status: 'error', message: error.message });
        }
    });
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));
}

module.exports = app;
