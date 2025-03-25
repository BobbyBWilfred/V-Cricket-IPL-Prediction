import express from 'express';
import bcrypt from 'bcryptjs';
import bodyParser from 'body-parser';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 5000;

mongoose.connect('mongodb+srv://BobbyBWilfred:Legendbob2005%23@bbwCluster.0ctao.mongodb.net/bbwDatabase?retryWrites=true&w=majority&appName=BBWCluster', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

const userSchema = new mongoose.Schema({
    username: String,
    password: String,
    points: { type: Number, default: 0 },
});

const matchSchema = new mongoose.Schema({
    homeTeam: String,
    awayTeam: String,
    date: Date,
    venue: String,
    winner: String,
});

const predictionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match' },
    predictedTeam: String,
    hasChanged: { type: Boolean, default: false },
    pointsAwarded: { type: Boolean, default: false } // Add this field
});

const User = mongoose.model('User', userSchema);
const Match = mongoose.model('Match', matchSchema);
const Prediction = mongoose.model('Prediction', predictionSchema);

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

app.get('/favicon.ico', (req, res) => res.status(204));

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (passwordMatch) {
            res.json({ success: true, user: { _id: user._id, username: user.username } });
        } else {
            res.json({ success: false, message: 'Invalid password' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Login failed' });
    }
});

app.get('/user-predictions/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const predictions = await Prediction.find({ userId });
        res.json(predictions);
    } catch (error) {
        console.error('User predictions error:', error);
        res.status(500).json({ message: 'Failed to fetch user predictions' });
    }
});

// Get matches route
app.get('/matches', async (req, res) => {
    try {
        const matches = await Match.find({});
        res.json(matches);
    } catch (error) {
        console.error('Get matches error:', error);
        res.status(500).json({ message: 'Failed to get matches' });
    }
});

app.post('/predict', async (req, res) => {
    const { matchId, team, userId } = req.body;
    try {
        const existingPrediction = await Prediction.findOne({ userId, matchId });
        if (existingPrediction) {
            return res.status(400).json({ message: 'Prediction already exists and cannot be changed' });
        } else {
            const newPrediction = new Prediction({ userId, matchId, predictedTeam: team });
            await newPrediction.save();
            res.json({ message: 'Prediction saved' });
        }
    } catch (error) {
        console.error('Prediction error:', error);
        res.status(500).json({ message: 'Failed to save prediction' });
    }
});

app.get('/prediction/:matchId/:userId', async (req, res) => {
    const { matchId, userId } = req.params;
    try {
        const prediction = await Prediction.findOne({ matchId, userId });

        if (!prediction) {
            return res.json({ predictedTeam: null, pointsAwarded: false });
        }

        res.json({
            predictedTeam: prediction.predictedTeam,
            pointsAwarded: prediction.pointsAwarded
        });
    } catch (error) {
        console.error('Get prediction error:', error);
        res.status(500).json({ message: 'Failed to get prediction' });
    }
});

// Leaderboard route
app.get('/leaderboard', async (req, res) => {
    try {
        const users = await User.find({}).sort({ points: -1 });
        res.json(users);
    } catch (error) {
        console.error('Leaderboard error:', error);
        res.status(500).json({ message: 'Failed to get leaderboard' });
    }
});

app.get('/today-predictions', async (req, res) => {
    try {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0); // Set to start of the day UTC
        const tomorrow = new Date(today);
        tomorrow.setUTCDate(today.getUTCDate() + 1);

        const todayMatches = await Match.find({}); // Fetch all matches

        const filteredMatches = todayMatches.filter(match => {
            const matchDateString = match.date;
            const matchDate = new Date(matchDateString); // Parse the date string

            // Convert to UTC
            const utcMatchDate = new Date(
                matchDate.getUTCFullYear(),
                matchDate.getUTCMonth(),
                matchDate.getUTCDate(),
                matchDate.getUTCHours(),
                matchDate.getUTCMinutes(),
                matchDate.getUTCSeconds()
            );

            // Compare UTC dates
            return utcMatchDate >= today && utcMatchDate < tomorrow;
        });

        const predictions = await Prediction.find({
            matchId: { $in: filteredMatches.map(match => match._id) }
        }).populate('userId', 'username').populate('matchId', 'homeTeam awayTeam');

        const formattedPredictions = predictions.map(prediction => ({
            username: prediction.userId.username,
            predictedTeam: prediction.predictedTeam,
            homeTeam: prediction.matchId.homeTeam,
            awayTeam: prediction.matchId.awayTeam,
        }));

        res.json(formattedPredictions);
    } catch (error) {
        console.error('Today predictions error:', error);
        res.status(500).json({ message: 'Failed to get today\'s predictions' });
    }
});

app.post('/updateUserPoints', async (req, res) => {
    const { userId, matchId } = req.body;
    try {
        const match = await Match.findById(matchId);
        const prediction = await Prediction.findOne({ userId: userId, matchId: matchId });

        if (match && prediction && match.winner === prediction.predictedTeam && !prediction.pointsAwarded) {
            await User.updateOne({ _id: userId }, { $inc: { points: 1 } });
            await Prediction.updateOne({ _id: prediction._id }, { pointsAwarded: true });

            // Fetch the updated user and send it back
            const updatedUser = await User.findById(userId);
            res.json({ message: 'User points updated', user: updatedUser });
        } else {
            res.status(400).json({ message: 'User points not updated' });
        }
    } catch (error) {
        console.error('Update user points error:', error);
        res.status(500).json({ message: 'Failed to update user points' });
    }
});



app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
