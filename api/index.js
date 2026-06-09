const express = require('express');
const app = express();
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();
const jwt = require('jsonwebtoken');
const cookieParser = require("cookie-parser");
const bcrypt = require('bcryptjs');
const User = require('./models/User.js');
const Message = require("./models/Message.js");
const ws = require('ws');
const fs = require("fs");

// ---------------------------------------------------------------------------
// Rate limiter – sliding window, in-memory, zero extra dependencies
// ---------------------------------------------------------------------------
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX        = 5;              // max attempts per window

// Map<ip, { count: number, windowStart: number }>
const loginAttempts = new Map();

// Purge entries older than one window to keep memory bounded
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of loginAttempts) {
    if (now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
      loginAttempts.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW_MS);

function loginRateLimiter(req, res, next) {
  const ip  = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();

  let record = loginAttempts.get(ip);

  // Start a fresh window if none exists or the previous window has expired
  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    record = { count: 0, windowStart: now };
    loginAttempts.set(ip, record);
  }

  record.count += 1;

  if (record.count > RATE_LIMIT_MAX) {
    const retryAfterSec = Math.ceil(
      (RATE_LIMIT_WINDOW_MS - (now - record.windowStart)) / 1000
    );
    res.set('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      error: 'Too many login attempts. Please try again later.',
      retryAfter: retryAfterSec,
    });
  }

  next();
}

const jwtSecret = process.env.JWT_SECRET;
const bcryptSalt = bcrypt.genSaltSync(10);

// Ensure uploads directory exists to prevent ENOENT errors on file upload
const uploadsDir = __dirname + "/uploads";
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log('Connected to Mongoose!!'))
  .catch((err) => console.error('Error connecting to Mongoose:', err.message));

app.use("/api/uploads", express.static(__dirname + "/uploads"));
app.use(express.json());
app.use(cookieParser());
app.use(cors({
    credentials: true,
    origin: [process.env.LOCAL_CLIENT_URL, process.env.PROD_CLIENT_URL],
}));

async function getUserDataFromRequest(req) {
  return new Promise((resolve, reject) => {
    const token = req.cookies?.token;
    if (token) {
        jwt.verify(token, jwtSecret, {}, (err, userData) => {
            if(err) {
              reject("Invalid token");
            } else {
              resolve(userData);
            }
        });
    }
    else {
      reject("no token");
    }
  });
}

app.get('/api/test', (req, res) => {
    res.json("test ok");
});

app.get("/api/messages/:userId", async (req, res) => {
  try {
    const {userId} = req.params;
    const userData = await getUserDataFromRequest(req);
    const ourUserId = userData.userId;
    const messages = await Message.find({
      sender: {$in: [userId, ourUserId]},
      recipient: {$in: [userId, ourUserId]},
    })
    .sort({createdAt: 1});
    res.json(messages);
  } catch (err) {
    res.status(401).json({ error: "Unauthorized or token missing" });
  }
});

app.get("/api/people", async (req, res) => {
  try {
    const users = await User.find({}, {"_id": 1, username: 1});
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/profile', (req, res) => {
    const token = req.cookies?.token;
    if (token) {
        jwt.verify(token, jwtSecret, {}, (err, userData) => {
            if(err) {
              res.status(401).json('invalid token');
            } else {
              res.json(userData);
            }
        });
    }
    else {
        res.status(401).json('no token');
    }
});

app.post("/api/login", loginRateLimiter, async (req, res) => {
  try {
    const {username, password} = req.body;
    const foundUser = await User.findOne({username});
    
    if (!foundUser) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    const passOK = bcrypt.compareSync(password, foundUser.password);
    if (!passOK) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    
    jwt.sign({userId:foundUser._id, username}, jwtSecret, {}, (err, token) => {
      if (err) throw err;
      res.cookie('token', token, {sameSite:'none', secure:true}).json({
        id: foundUser._id,
      });
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/logout', (req,res) => {
  res.cookie('token', '', {sameSite:'none', secure:true}).json('ok');
});

app.post('/api/register', async (req,res) => {
    const {username,password} = req.body;
    try {
      const hashedPassword = bcrypt.hashSync(password, bcryptSalt);
      const createdUser = await User.create({
        username:username,
        password:hashedPassword,
      });
      jwt.sign({userId:createdUser._id, username}, jwtSecret, {}, (err, token) => {
        if (err) throw err;
        res.cookie('token', token, {sameSite:'none', secure:true}).status(201).json({
          id: createdUser._id,
        });
      });
    } catch(err) {
      if (err.code === 11000) {
        return res.status(400).json({ error: 'Username already exists' });
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  });

const server = app.listen(process.env.PORT || 4040, () => {
    console.log(`Server running on port ${process.env.PORT || 4040}`);
});

const wss = new ws.WebSocketServer({server});

wss.on("connection", (conn, req) => {
  console.log("ws connected!!");

  function notifyAboutOnlinePeople() {
    [...wss.clients].forEach(client => {
      client.send(JSON.stringify({
        online: [...wss.clients].map(c => ({userId: c.userId, username: c.username})),
     }));
    });
  }

  conn.isAlive = true;

  conn.timer = setInterval(() => {
    conn.ping();
    conn.deathTimer = setTimeout(() => {
      conn.isAlive = false;
      clearInterval(conn.timer);
      conn.terminate();
      notifyAboutOnlinePeople();
      console.log("death");
    }, 1000);
  }, 5000);

  conn.on("pong", () => {
    clearTimeout(conn.deathTimer);
  });

  const cookies = req.headers.cookie;
  if(cookies) {
    const tokenCookieString = cookies.split(';').find( (str) => str.trim().startsWith("token=")) || cookies;
    if(tokenCookieString) {
      const token = tokenCookieString.split('=')[1];
      if(token) {
        jwt.verify(token, jwtSecret, {}, (err, userData) => {
          if(err) {
            console.error("JWT verification error in WS:", err.message);
          } else {
            const {userId, username} = userData;
            conn.userId = userId;
            conn.username = username;
            notifyAboutOnlinePeople();
          }
        });
      }
    }
  }

  conn.on("message", async (message) => {
    try {
      const messageData = JSON.parse(message.toString());
      const {recipient, text, file} = messageData;
      let filename = null;
      
      if(file) {
        const parts = file.name.split('.');
        const ext = parts[parts.length - 1];
        filename = Date.now() + '.' + ext;
        const path = __dirname + '/uploads/' + filename;
        const bufferData = Buffer.from(file.data.split(',')[1], 'base64');
        fs.writeFile(path, bufferData, (err) => {
          if (err) {
            console.error("Failed to save file:", err);
          } else {
            console.log("file saved: " + path);
          }
        });
      }

      if(recipient && (text || file)) {
        const messageDoc = await Message.create({
          sender: conn.userId,
          recipient,
          text,
          file: file ? filename : null,
        });
        
        [...wss.clients]
        .filter(c => c.userId === recipient)
        .forEach(c => c.send(JSON.stringify({
           text,
           sender: conn.userId,
           recipient,
           file: file ? filename : null,
           _id: messageDoc._id,
           createdAt: messageDoc.createdAt
          })));
      }
    } catch (err) {
      console.error("Error processing WS message:", err);
    }
  });
  
  notifyAboutOnlinePeople();
});
