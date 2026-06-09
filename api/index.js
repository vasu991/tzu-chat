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
const crypto = require("crypto");
const nodemailer = require("nodemailer");

// ---------------------------------------------------------------------------
// Disposable / temporary email domain blocklist
// Blocks throwaway email services from being used during sign-up
// ---------------------------------------------------------------------------
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
  'tempmail.com', 'throwaway.email', 'temp-mail.org', 'fakeinbox.com',
  'sharklasers.com', 'guerrillamailblock.com', 'grr.la', 'dispostable.com',
  'yopmail.com', 'yopmail.fr', 'trashmail.com', 'trashmail.me', 'trashmail.net',
  'maildrop.cc', 'mailnesia.com', 'tempail.com', 'tempr.email',
  'discard.email', 'discardmail.com', 'discardmail.de',
  'getnada.com', 'nada.email', 'anonbox.net',
  'mintemail.com', 'mytemp.email', 'mohmal.com',
  'burnermail.io', 'inboxkitten.com', 'mailsac.com',
  'harakirimail.com', 'tmail.ws', 'tempmailo.com',
  'emailondeck.com', 'crazymailing.com',
  '10minutemail.com', '10minutemail.net', '10minutemail.org',
  '20minutemail.com', '20minutemail.it',
  'mailcatch.com', 'meltmail.com', 'spamgourmet.com',
  'jetable.org', 'incognitomail.org', 'trashymail.com',
  'spamfree24.org', 'spambox.us', 'bugmenot.com',
  'safetymail.info', 'filzmail.com', 'mailexpire.com',
  'tempinbox.com', 'tempomail.fr', 'tempmailaddress.com',
  'throwam.com', 'trash-mail.com', 'wegwerfmail.de', 'wegwerfmail.net',
  'einrot.com', 'e4ward.com', 'disposableemailaddresses.emailmiser.com',
  'sogetthis.com', 'mailinater.com', 'mailmetrash.com',
  'thankyou2010.com', 'spam4.me', 'grr.la',
  'mailnull.com', 'dontreg.com', 'brefmail.com',
  'clrmail.com', 'koszmail.pl', 'rmqkr.net',
  'sharklasers.com', 'spam.la', 'mytrashmail.com',
  'mt2015.com', 'mailforspam.com', 'superstachel.de',
  'trashdevil.com', 'trashemail.de', 'trashmailer.com',
  'armyspy.com', 'cuvox.de', 'dayrep.com', 'einrot.de',
  'fleckens.hu', 'gustr.com', 'jourrapide.com',
  'rhyta.com', 'superrito.com', 'teleworm.us',
]);

/**
 * Check if an email address belongs to a known disposable email provider.
 * @param {string} email
 * @returns {boolean}
 */
function isDisposableEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const domain = email.split('@')[1]?.toLowerCase();
  return domain ? DISPOSABLE_EMAIL_DOMAINS.has(domain) : false;
}

// ---------------------------------------------------------------------------
// Nodemailer transactional email transporter
// ---------------------------------------------------------------------------
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ---------------------------------------------------------------------------
// Email rate limiter – sliding window, in-memory, zero extra dependencies
// Prevents abuse of the transactional email endpoint (forgot-password)
// Limit: 3 emails per IP per hour
// ---------------------------------------------------------------------------
const EMAIL_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const EMAIL_RATE_MAX       = 3;

const emailAttempts = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of emailAttempts) {
    if (now - record.windowStart > EMAIL_RATE_WINDOW_MS) {
      emailAttempts.delete(ip);
    }
  }
}, EMAIL_RATE_WINDOW_MS);

function emailRateLimiter(req, res, next) {
  const ip  = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();

  let record = emailAttempts.get(ip);

  if (!record || now - record.windowStart > EMAIL_RATE_WINDOW_MS) {
    record = { count: 0, windowStart: now };
    emailAttempts.set(ip, record);
  }

  record.count += 1;

  if (record.count > EMAIL_RATE_MAX) {
    const retryAfterSec = Math.ceil(
      (EMAIL_RATE_WINDOW_MS - (now - record.windowStart)) / 1000
    );
    res.set('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      error: 'Too many password reset requests. Please try again later.',
      retryAfter: retryAfterSec,
    });
  }

  next();
}

// ---------------------------------------------------------------------------
// Registration rate limiter – prevents mass account creation
// Limit: 5 sign-ups per IP per 30 minutes
// ---------------------------------------------------------------------------
const REGISTER_RATE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const REGISTER_RATE_MAX       = 5;

const registerAttempts = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of registerAttempts) {
    if (now - record.windowStart > REGISTER_RATE_WINDOW_MS) {
      registerAttempts.delete(ip);
    }
  }
}, REGISTER_RATE_WINDOW_MS);

function registerRateLimiter(req, res, next) {
  const ip  = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();

  let record = registerAttempts.get(ip);

  if (!record || now - record.windowStart > REGISTER_RATE_WINDOW_MS) {
    record = { count: 0, windowStart: now };
    registerAttempts.set(ip, record);
  }

  record.count += 1;

  if (record.count > REGISTER_RATE_MAX) {
    const retryAfterSec = Math.ceil(
      (REGISTER_RATE_WINDOW_MS - (now - record.windowStart)) / 1000
    );
    res.set('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      error: 'Too many sign-up attempts from this IP. Please try again later.',
      retryAfter: retryAfterSec,
    });
  }

  next();
}

// ---------------------------------------------------------------------------
// Login rate limiter – prevents brute-force credential attacks
// Limit: 5 login attempts per IP per 15 minutes
// ---------------------------------------------------------------------------
const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOGIN_RATE_MAX       = 5;

const loginAttempts = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of loginAttempts) {
    if (now - record.windowStart > LOGIN_RATE_WINDOW_MS) {
      loginAttempts.delete(ip);
    }
  }
}, LOGIN_RATE_WINDOW_MS);

function loginRateLimiter(req, res, next) {
  const ip  = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();

  let record = loginAttempts.get(ip);

  if (!record || now - record.windowStart > LOGIN_RATE_WINDOW_MS) {
    record = { count: 0, windowStart: now };
    loginAttempts.set(ip, record);
  }

  record.count += 1;

  if (record.count > LOGIN_RATE_MAX) {
    const retryAfterSec = Math.ceil(
      (LOGIN_RATE_WINDOW_MS - (now - record.windowStart)) / 1000
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

app.post('/api/register', registerRateLimiter, async (req,res) => {
    const {username, password, email} = req.body;

    // Email is required for account creation
    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        error: 'A valid email address is required to sign up.',
      });
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Please provide a valid email address.',
      });
    }

    // Block sign-ups from disposable / throwaway email domains
    const emailDomain = email.split('@')[1]?.toLowerCase();
    if (isDisposableEmail(email)) {
      return res.status(400).json({
        error: `Sign-up blocked: "${emailDomain}" is a disposable email domain. Please use a permanent email address.`,
      });
    }

    try {
      const hashedPassword = bcrypt.hashSync(password, bcryptSalt);
      const createdUser = await User.create({
        username:username,
        password:hashedPassword,
        email: email.toLowerCase().trim(),
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

// ---------------------------------------------------------------------------
// File upload rate limiter – prevents storage abuse
// Limit: 10 uploads per IP per hour
// ---------------------------------------------------------------------------
const UPLOAD_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const UPLOAD_RATE_MAX       = 10;

const uploadAttempts = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of uploadAttempts) {
    if (now - record.windowStart > UPLOAD_RATE_WINDOW_MS) {
      uploadAttempts.delete(ip);
    }
  }
}, UPLOAD_RATE_WINDOW_MS);

function uploadRateLimiter(req, res, next) {
  const ip  = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();

  let record = uploadAttempts.get(ip);

  if (!record || now - record.windowStart > UPLOAD_RATE_WINDOW_MS) {
    record = { count: 0, windowStart: now };
    uploadAttempts.set(ip, record);
  }

  record.count += 1;

  if (record.count > UPLOAD_RATE_MAX) {
    const retryAfterSec = Math.ceil(
      (UPLOAD_RATE_WINDOW_MS - (now - record.windowStart)) / 1000
    );
    res.set('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      error: 'Too many file uploads. Please try again later.',
      retryAfter: retryAfterSec,
    });
  }

  next();
}

// ---------------------------------------------------------------------------
// POST /api/upload
// REST file upload endpoint (authenticated, rate-limited).
// Accepts JSON body: { filename: "photo.jpg", data: "base64string..." }
// Stores files in the /uploads directory with a timestamped name.
// Max file size: 5 MB (after base64 decoding).
// ---------------------------------------------------------------------------
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

app.post('/api/upload', uploadRateLimiter, async (req, res) => {
  try {
    const userData = await getUserDataFromRequest(req);

    const { filename, data } = req.body;
    if (!filename || !data) {
      return res.status(400).json({ error: 'filename and data (base64) are required.' });
    }

    // Decode base64 payload (strip optional data-URI prefix)
    const base64Content = data.includes(',') ? data.split(',')[1] : data;
    const buffer = Buffer.from(base64Content, 'base64');

    // Enforce max file size
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return res.status(413).json({
        error: `File too large. Maximum size is ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`,
      });
    }

    // Build a safe, timestamped filename
    const ext  = filename.split('.').pop() || 'bin';
    const safe = `${Date.now()}-${userData.userId}.${ext}`;
    const dest = `${uploadsDir}/${safe}`;

    fs.writeFileSync(dest, buffer);

    return res.status(201).json({
      message: 'File uploaded successfully.',
      file: safe,
      url: `/api/uploads/${safe}`,
      size: buffer.length,
    });
  } catch (err) {
    if (err === 'no token' || err === 'Invalid token') {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/forgot-password
// Transactional email: sends a password-reset link to the user's email.
// Rate-limited to 3 requests per IP per hour → 429 when exceeded.
// ---------------------------------------------------------------------------
app.post('/api/forgot-password', emailRateLimiter, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: 'Username is required.' });
    }

    const user = await User.findOne({ username });

    // Always respond with 200 to avoid username enumeration
    if (!user || !user.email) {
      return res.status(200).json({
        message: 'If that username has an email on file, a reset link has been sent.',
      });
    }

    // Block password resets for accounts registered with disposable emails
    if (isDisposableEmail(user.email)) {
      return res.status(400).json({
        error: 'Password reset is not available for accounts using disposable email addresses. Please contact support.',
      });
    }

    // Generate a secure random reset token (valid for 1 hour)
    const rawToken   = crypto.randomBytes(32).toString('hex');
    const tokenHash  = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt  = new Date(Date.now() + 60 * 60 * 1000);

    user.passwordResetToken   = tokenHash;
    user.passwordResetExpires = expiresAt;
    await user.save();

    const clientUrl  = process.env.LOCAL_CLIENT_URL || 'http://localhost:5173';
    const resetLink  = `${clientUrl}/reset-password?token=${rawToken}&user=${user._id}`;

    // Send the transactional email
    await emailTransporter.sendMail({
      from:    process.env.EMAIL_FROM || '"Tzu Chat" <no-reply@tzuchat.app>',
      to:      user.email,
      subject: 'Reset your Tzu Chat password',
      text: [
        `Hi ${user.username},`,
        '',
        'You requested a password reset for your Tzu Chat account.',
        'Click the link below to set a new password (valid for 1 hour):',
        '',
        resetLink,
        '',
        'If you did not request this, you can safely ignore this email.',
      ].join('\n'),
      html: `
        <p>Hi <strong>${user.username}</strong>,</p>
        <p>You requested a password reset for your Tzu Chat account.</p>
        <p>
          <a href="${resetLink}" style="
            display:inline-block;padding:10px 20px;
            background:#4f46e5;color:#fff;border-radius:6px;
            text-decoration:none;font-family:sans-serif;
          ">Reset my password</a>
        </p>
        <p>This link expires in <strong>1 hour</strong>.</p>
        <p style="color:#888;font-size:12px;">If you did not request this, you can safely ignore this email.</p>
      `,
    });

    return res.status(200).json({
      message: 'If that username has an email on file, a reset link has been sent.',
    });
  } catch (err) {
    console.error('Forgot-password error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/reset-password
// Consumes the reset token and sets the new password.
// ---------------------------------------------------------------------------
app.post('/api/reset-password', async (req, res) => {
  try {
    const { userId, token, newPassword } = req.body;
    if (!userId || !token || !newPassword) {
      return res.status(400).json({ error: 'userId, token, and newPassword are required.' });
    }

    // Enforce minimum password strength on reset
    if (newPassword.length < 8) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters long.',
      });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      _id: userId,
      passwordResetToken:   tokenHash,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token.' });
    }

    user.password             = bcrypt.hashSync(newPassword, bcryptSalt);
    user.passwordResetToken   = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    return res.status(200).json({ message: 'Password updated successfully.' });
  } catch (err) {
    console.error('Reset-password error:', err);
    res.status(500).json({ error: 'Internal server error.' });
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

      // -----------------------------------------------------------------
      // Typing indicator subscription
      // Client sends: { type: 'typing', recipient: '<userId>' }
      // Server forwards to recipient's connections:
      //   { type: 'typing', sender: '<userId>', username: '<name>' }
      // -----------------------------------------------------------------
      if (messageData.type === 'typing') {
        const { recipient } = messageData;
        if (recipient && conn.userId) {
          [...wss.clients]
            .filter(c => c.userId === recipient)
            .forEach(c => c.send(JSON.stringify({
              type: 'typing',
              sender: conn.userId,
              username: conn.username,
            })));
        }
        return; // typing events are fire-and-forget, don't persist
      }

      // -----------------------------------------------------------------
      // Chat message (existing behaviour)
      // -----------------------------------------------------------------
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
