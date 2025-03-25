<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=">
    <link rel="stylesheet" href="style.css">

    <title>IPL Match Predictor</title>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>

</head>
<body>
    <div class="login-container" id="loginContainer">
        <h2>Login</h2>
        <input type="text" id="username" placeholder="Username"><br><br>
        <input type="password" id="password" placeholder="Password"><br><br>
        <button onclick="login()">Login</button>
    </div>

    <div class="user-info" id="userInfo" style="display: none;"></div>

    <div class="matches-container" id="matchesContainer" style="display: none;">
        <h2>Matches</h2>
        <div id="matchesList"></div>
    </div>

    <div class="today-predictions-container" id="todayPredictionsContainer" style="display: none;">
        <h2>Today's Predictions</h2>
        <div id="todayPredictionsList"></div>
    </div>

    <div class="leaderboard-container" id="leaderboardContainer" style="display: none;">
        <h2>Leaderboard</h2>
        <table>
            <thead>
                <tr>
                    <th>Username</th>
                    <th>Points</th>
                </tr>
            </thead>
            <tbody id="leaderboardBody"></tbody>
        </table>
    </div>

    <script>
        let currentUser = null;
        let matches = [];

        async function login() {
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;

            try {
                const response = await axios.post('/login', { username, password });
                if (response.data.success) {
        currentUser = response.data.user;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        if (currentUser) {
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('matchesContainer').style.display = 'block';
    document.getElementById('userInfo').textContent = `Welcome, ${currentUser.username}!`;
    document.getElementById('userInfo').style.display = 'block';
    loadMatches();
}
    } else {
                    Swal.fire('Error', 'Invalid credentials', 'error');
                }
            } catch (error) {
                console.error('Login error:', error);
                Swal.fire('Error', 'Login failed', 'error');
            }
        }
        function formatDateTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString("en-IN", { 
        weekday: 'short', 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: true 
    });
}
function getTeamColor(teamName) {
    const teamColors = {
        'Chennai Super Kings': '#FFD700',
        'Mumbai Indians': '#006BB3', 
        'Royal Challengers Bangalore': '#ff002e', 
        'Kolkata Knight Riders': '#3D0075', 
        'Delhi Capitals': '#1779C2', 
        'Rajasthan Royals': '#174985', 
        'Punjab Kings': '#ff005a', 
        'Sunrisers Hyderabad': '#FF8200', 
        'Lucknow Super Giants': '#0000ff', 
        'Gujarat Titans': '#00e1ff' 
    };
    return teamColors[teamName] || '#808080'; 
}
async function loadMatches() {
    try {
        // 1. Fetch all matches from the server
        const response = await axios.get('/matches');
        matches = response.data;

        // 2. Get the HTML element where matches will be displayed
        const matchesList = document.getElementById('matchesList');
        matchesList.innerHTML = ''; // Clear existing matches

        // 3. Check if a user is logged in
        if (!currentUser) {
            console.error("No user logged in!");
            return; // Exit if no user
        }

        // 4. Fetch user predictions for this user
        const userPredictionsRes = await axios.get(`/user-predictions/${currentUser._id}`);
        // 5. Structure the predictions for easier access
        const userPredictions = userPredictionsRes.data.reduce((acc, pred) => {
            acc[pred.matchId] = pred; // Store the whole prediction object
            return acc;
        }, {});

        // 6. Loop through each match to display it
        for (const match of matches) {
            // 7. Create a new div for each match
            const matchDiv = document.createElement('div');
            matchDiv.classList.add('match-item');

            // 8. Prepare the prediction display
            let predictionDisplay = '';

            // 9. Check if the user has a prediction for this match
            if (userPredictions[match._id]) {
                // 10. Display the user's prediction
                predictionDisplay = `<p class="prediction-result">You predicted: ${userPredictions[match._id].predictedTeam}</p>`;

                // 11. Check if the match has a winner
                if (match.winner) {
                    // 12. Check if the user's prediction was correct
                    if (match.winner === userPredictions[match._id].predictedTeam) {
                        // 13. Check if points have already been awarded
                        if (userPredictions[match._id].pointsAwarded) {
                            predictionDisplay += '<p class="prediction-result">Correct! 1 point awarded.</p>';
                        } else {
                            // 14. Award points if they haven't been awarded yet
                            predictionDisplay += '<p class="prediction-result">Correct! You get 1 point.</p>';
                            await axios.post('/updateUserPoints', { userId: currentUser._id, matchId: match._id });

                            // 15. Refetch user predictions to update the pointsAwarded field
                            const updatedPredictions = await axios.get(`/user-predictions/${currentUser._id}`);
                            userPredictionsRes.data = updatedPredictions.data;
                        }
                    } else {
                        // 16. Display if the prediction was wrong
                        predictionDisplay += '<p class="prediction-result">Wrong! You get 0 points.</p>';
                    }
                    // 17. Display the actual winner of the match
                    predictionDisplay += `<p class="prediction-result">Winner was: ${match.winner}</p>`;
                }
            } else {
                // 18. Display if there is no prediction yet
                predictionDisplay = '<p class="prediction-result">No prediction yet.</p>';
            }

            // 19. Construct the HTML for the match display
            matchDiv.innerHTML = `
                <p><strong>${match.homeTeam} vs ${match.awayTeam}</strong></p>
                <p>${formatDateTime(match.date)} (${match.venue})</p>
                ${predictionDisplay}
                <div style="display: flex; justify-content: center;">
                    <div class="team-circle" onclick="predict('${match._id}', '${match.homeTeam}')" style="background-color: ${getTeamColor(match.homeTeam)}">${match.homeTeam}</div>
                    <div class="team-circle" onclick="predict('${match._id}', '${match.awayTeam}')" style="background-color: ${getTeamColor(match.awayTeam)}">${match.awayTeam}</div>
                </div>
            `;

            // 20. Add the match div to the matches list
            matchesList.appendChild(matchDiv);
        }

        // 21. Load the leaderboard after displaying all matches
        loadLeaderboard();
        await loadTodayPredictions();
    } catch (error) {
        // 22. Handle errors during the process
        console.error('Load matches error:', error);
        Swal.fire('Error', 'Failed to load matches', 'error');
    }
}

async function predict(matchId, team) {
    const match = matches.find(m => m._id === matchId);
    if (isMatchStarted(match.date)) {
        Swal.fire('Error', 'Match has already started. Predictions are closed.', 'error');
        return;
    }

    Swal.fire({
        title: 'Confirm Prediction',
        text: `Predict ${team} to win?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Yes',
        cancelButtonText: 'No'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                await axios.post('/predict', { matchId, team, userId: currentUser._id });
                Swal.fire('Success', 'Prediction saved!', 'success');
                loadMatches();
            } catch (error) {
                Swal.fire('Error', error.response.data.message || 'Failed to save prediction', 'error');
            }
        }
    });
}

function isMatchStarted(matchDate) {
    return new Date() > new Date(matchDate);
}

// Function to fetch and display today's predictions
async function loadTodayPredictions() {
    try {
        console.log('Client-side matches:', matches);

        const response = await axios.get('/today-predictions');
        const predictions = response.data;

        console.log('Received predictions:', predictions);

        const predictionsList = document.getElementById('todayPredictionsList');
        predictionsList.innerHTML = '';

        if (!predictions || predictions.length === 0) {
            console.log('No predictions found for today.');
            predictionsList.innerHTML = '<p>No predictions for today yet.</p>';
            document.getElementById('todayPredictionsContainer').style.display = 'block';
            return;
        }

        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setUTCDate(today.getUTCDate() + 1);

        const todayMatches = matches.filter(match => {
            const matchDate = new Date(match.date);
            const utcMatchDate = new Date(
                matchDate.getUTCFullYear(),
                matchDate.getUTCMonth(),
                matchDate.getUTCDate(),
                matchDate.getUTCHours(),
                matchDate.getUTCMinutes(),
                matchDate.getUTCSeconds()
            );
            return utcMatchDate >= today && utcMatchDate < tomorrow;
        });

        console.log('Matches for today:', todayMatches);

        // Corrected filter
        const predictionsForToday = predictions.filter(prediction => {
            return todayMatches.some(match => {
                return match.homeTeam === prediction.homeTeam && match.awayTeam === prediction.awayTeam;
            });
        });

        console.log('Predictions for today:', predictionsForToday);

        if (predictionsForToday.length === 0) {
            console.log('No predictions for today\'s matches.');
            predictionsList.innerHTML = '<p>No predictions for today\'s matches.</p>';
            document.getElementById('todayPredictionsContainer').style.display = 'block';
            return;
        }

        const predictionsByMatch = {};

        predictionsForToday.forEach(prediction => {
            const matchKey = `${prediction.homeTeam} vs ${prediction.awayTeam}`;
            if (!predictionsByMatch[matchKey]) {
                predictionsByMatch[matchKey] = [];
            }
            predictionsByMatch[matchKey].push(prediction);
        });

        console.log('Predictions by match:', predictionsByMatch);

        for (const matchKey in predictionsByMatch) {
            const matchPredictions = predictionsByMatch[matchKey];
            const matchDiv = document.createElement('div');
            matchDiv.innerHTML = `
                <p><strong>${matchKey}</strong></p>
                <ul>
                    ${matchPredictions.map(p => `<li>${p.username} predicted: ${p.predictedTeam}</li>`).join('')}
                </ul>
            `;
            predictionsList.appendChild(matchDiv);
        }

        document.getElementById('todayPredictionsContainer').style.display = 'block';
    } catch (error) {
        console.error('Today predictions error:', error);
        Swal.fire('Error', 'Failed to load today\'s predictions', 'error');
    }
}

        async function loadLeaderboard() {
            try {
                const response = await axios.get('/leaderboard');
                const leaderboardBody = document.getElementById('leaderboardBody');
                leaderboardBody.innerHTML = '';
                response.data.forEach(user => {
                    const row = document.createElement('tr');
                    row.innerHTML = `<td>${user.username}</td><td>${user.points}</td>`;
                    leaderboardBody.appendChild(row);
                });
                document.getElementById('leaderboardContainer').style.display = 'block';
            } catch (error) {
                console.error('Leaderboard error:', error);
                Swal.fire('Error', 'Failed to load leaderboard', 'error');
            }
        }

        
    </script>
</body>
</html>
