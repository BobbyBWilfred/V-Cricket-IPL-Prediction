import express from 'express';
import bcrypt from 'bcryptjs';
import bodyParser from 'body-parser';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import { Server } from 'socket.io'; // Import socket.io

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
    loginCount: { type: Number, default: 0 }, // New field for login count
    lastLogin: { type: Date }, // New field for last login time
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
    pointsAwarded: { type: Boolean, default: false }, // Add this field
    pointsGiven: { type: Number } // To store the number of points awarded (1 or 3)
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
            // Update login count and last login time
            user.loginCount = (user.loginCount || 0) + 1;
            user.lastLogin = new Date();
            await user.save();
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

async function updatePointsForAllUsers() {
    try {
        const matches = await Match.find({ winner: { $ne: null } }); // Get matches with winners
        console.log("Matches with winners:", matches);

        for (const match of matches) {
            console.log(`Checking match: ${match.homeTeam} vs ${match.awayTeam}, Winner: ${match.winner}`);
            const predictions = await Prediction.find({ matchId: match._id, pointsAwarded: false }); // Only check predictions where points haven't been awarded
            console.log(`New predictions for match ${match._id} (not yet awarded):`, predictions);

            const matchDate = new Date(match.date);
            // Ensure the date is treated as UTC before timezone conversion
            const utcMatchDate = new Date(match.date);
            const dayOfWeekIST = new Date(utcMatchDate.getTime() + (5.5 * 60 * 60 * 1000)).getDay();
            const isWeekendMatchIST = (dayOfWeekIST === 0 || dayOfWeekIST === 6);
            const pointsToAward = isWeekendMatchIST ? 3 : 1;

            for (const prediction of predictions) {
                console.log(`Checking prediction for user ${prediction.userId}: Predicted ${prediction.predictedTeam}`);
                if (prediction.predictedTeam === match.winner) {
                    await User.updateOne({ _id: prediction.userId }, { $inc: { points: pointsToAward } });
                    await Prediction.updateOne({ _id: prediction._id }, { pointsAwarded: true, pointsGiven: pointsToAward });
                    console.log(`Points (${pointsToAward}) updated for user ${prediction.userId} for match ${match._id}`);
                } else {
                    await Prediction.updateOne({ _id: prediction._id }, { pointsAwarded: true, pointsGiven: 0 }); // Mark as awarded even if wrong
                    console.log(`Incorrect prediction, points marked as awarded for user ${prediction.userId} for match ${match._id}`);
                }
            }
            console.log('Points update process completed for this match.');
        }
        console.log('Points update process completed for all matches.');
        io.emit('pointsUpdated');
        console.log("Socket.io event pointsUpdated was emitted");
    } catch (error) {
        console.error('Points update error:', error);
    }
}

cron.schedule('0 0 * * *', () => {
    console.log('Running daily points update...');
    updatePointsForAllUsers();
});

// Get matches route
app.get('/matches', async (req, res) => {
    try {
        const matches = await Match.find({}).sort({ date: 1 }); // Sort by date in ascending order (1)
        res.json(matches);
    } catch (error) {
        console.error('Get matches error:', error);
        res.status(500).json({ message: 'Failed to get matches' });
    }
});

app.post('/predict', async (req, res) => {
    const { matchId, team, userId } = req.body;

    try {
        const match = await Match.findById(matchId);
        if (!match) {
            return res.status(404).json({ message: 'Match not found' });
        }

        if (new Date() > new Date(match.date)) {
            return res.status(400).json({ message: 'Match has already started. Predictions are closed.' });
        }

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

app.post('/admin/trigger-leaderboard-update', async (req, res) => {
    console.log('Manual leaderboard update triggered by admin.');
    try {
        await updatePointsForAllUsers();
        res.json({ message: 'Leaderboard update triggered successfully.' });
    } catch (error) {
        console.error('Error triggering leaderboard update:', error);
        res.status(500).json({ message: 'Failed to trigger leaderboard update.' });
    }
});

app.get('/prediction/:matchId/:userId', async (req, res) => {
    const { matchId, userId } = req.params;
    try {
        const prediction = await Prediction.findOne({ matchId, userId });

        if (!prediction) {
            return res.json({ predictedTeam: null, pointsAwarded: false, pointsGiven: null });
        }

        console.log(`Prediction found for match ${matchId} and user ${userId}:`, prediction); // Added log

        res.json({
            predictedTeam: prediction.predictedTeam,
            pointsAwarded: prediction.pointsAwarded,
            pointsGiven: prediction.pointsGiven
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

        console.log("Today:", today);
        console.log("Tomorrow:", tomorrow);

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

            console.log("Match Date String:", matchDateString);
            console.log("Match Date:", matchDate);
            console.log("UTC Match Date:", utcMatchDate);

            // Compare UTC dates
            return utcMatchDate >= today && utcMatchDate < tomorrow;
        });

        console.log("Filtered Matches:", filteredMatches);

        const predictions = await Prediction.find({
            matchId: { $in: filteredMatches.map(match => match._id) }
        }).populate('userId', 'username').populate('matchId', 'homeTeam awayTeam');

        const formattedPredictions = predictions.map(prediction => ({
            username: prediction.userId.username,
            predictedTeam: prediction.predictedTeam,
            homeTeam: prediction.matchId.homeTeam,
            awayTeam: prediction.matchId.awayTeam,
        }));

        console.log("Formatted Predictions:", formattedPredictions);

        res.json(formattedPredictions);
    } catch (error) {
        console.error('Today predictions error:', error);
        res.status(500).json({ message: 'Failed to get today\'s predictions' });
    }
});
app.post('/updateUserPoints', async (req, res) => {
    const { userId, matchId } = req.body;
    console.log(`Manual updateUserPoints triggered for user ${userId} and match ${matchId}`); // Added log
    try {
        const match = await Match.findById(matchId);
        console.log("match data:", match);
        const prediction = await Prediction.findOne({ userId: userId, matchId: matchId });
        console.log("prediction data:", prediction);

        if (match && prediction && match.winner === prediction.predictedTeam && !prediction.pointsAwarded) {
            const matchDate = new Date(match.date);
            const utcMatchDate = new Date(match.date);
            const dayOfWeekIST = new Date(utcMatchDate.getTime() + (5.5 * 60 * 60 * 1000)).getDay();
            const isWeekendMatchIST = (dayOfWeekIST === 0 || dayOfWeekIST === 6);
            const pointsToAward = isWeekendMatchIST ? 3 : 1;

            await User.updateOne({ _id: userId }, { $inc: { points: pointsToAward } });
            await Prediction.updateOne({ _id: prediction._id }, { pointsAwarded: true, pointsGiven: pointsToAward });

            const updatedUser = await User.findById(userId);
            res.json({ message: 'User points updated', user: updatedUser });
            console.log(`Points (${pointsToAward}) updated for user ${userId} for match ${matchId}`);
            io.emit('pointsUpdated');
            console.log("Socket.io event pointsUpdated was emitted");
        } else if (prediction && prediction.pointsAwarded) {
            res.status(400).json({ message: 'Points already awarded for this prediction.' });
            console.log(`Points already awarded for user ${userId} and match ${matchId}`);
        }
         else {
            res.status(400).json({ message: 'User points not updated (either incorrect prediction or match not finished).' });
            console.log(`Points not updated for user ${userId} for match ${matchId}`);
        }
    } catch (error) {
        console.error('Update user points error:', error);
        res.status(500).json({ message: 'Failed to update user points' });
    }
});


app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});


const io = new Server(server, { // Initialize socket.io with the server
    cors: {
        origin: "*", // allow all origins
        methods: ["GET", "POST"]
    }
});

io.on('connection', (socket) => {
    console.log('A user connected');
    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});
