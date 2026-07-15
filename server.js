const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const mammoth = require('mammoth');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 9719;

// Configure CORS
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Directories setup
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'assignments.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
}

// Password Hashing Helper
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Initialize Default Users
if (!fs.existsSync(USERS_FILE)) {
  const defaultUsers = [
    {
      username: 'admin',
      password: hashPassword('adminpassword'),
      role: 'admin',
      name: 'Administrator'
    },
    {
      username: 'creator',
      password: hashPassword('creatorpassword'),
      role: 'creator',
      name: 'Assignment Creator (Add)'
    },
    {
      username: 'writer',
      password: hashPassword('writerpassword'),
      role: 'writer',
      name: 'Assignment Doer (Do)'
    }
  ];
  fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
}

// Serve static uploads
app.use('/api/uploads', express.static(UPLOADS_DIR));

// Configure Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `${uniqueSuffix}-${cleanName}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 40 * 1024 * 1024 }
});

// Memory Store for Active Sessions (token -> user data)
const activeSessions = {};

// Database Helpers
function readDB() {
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading database file:', err);
    return [];
  }
}

function writeDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error writing to database file:', err);
    return false;
  }
}

function readUsers() {
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading users file:', err);
    return [];
  }
}

function writeUsers(data) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error writing to users file:', err);
    return false;
  }
}

// Authentication Middleware
const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. Please log in.' });
  }

  const token = authHeader.split(' ')[1];
  const session = activeSessions[token];

  if (!session) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }

  req.user = session; // has { username, role, name }
  next();
};

// Role authorization helper
const authorize = (roles = []) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Unauthorized. You do not have permission to perform this action.' });
    }
    next();
  };
};

const GEMINI_SUPPORTED_MIMES = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.mp3': 'audio/mp3',
  '.wav': 'audio/wav',
  '.m4a': 'audio/m4a',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime'
};

// --- Authentication Endpoints ---

// Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const users = readUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

  if (!user || user.password !== hashPassword(password)) {
    return res.status(400).json({ error: 'Invalid username or password.' });
  }

  // Generate Session Token
  const token = crypto.randomBytes(32).toString('hex');
  activeSessions[token] = {
    username: user.username,
    role: user.role,
    name: user.name
  };

  res.json({
    token,
    user: {
      username: user.username,
      role: user.role,
      name: user.name
    }
  });
});

// Logout
app.post('/api/auth/logout', authenticate, (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader.split(' ')[1];
  delete activeSessions[token];
  res.json({ message: 'Logged out successfully.' });
});

// Change Password (Self)
app.post('/api/auth/change-password', authenticate, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }

  const users = readUsers();
  const index = users.findIndex(u => u.username === req.user.username);

  if (index === -1) {
    return res.status(404).json({ error: 'User not found.' });
  }

  if (users[index].password !== hashPassword(currentPassword)) {
    return res.status(400).json({ error: 'Incorrect current password.' });
  }

  users[index].password = hashPassword(newPassword);
  writeUsers(users);
  res.json({ message: 'Password changed successfully.' });
});


// --- User Management (Admin Only) ---

// List Users
app.get('/api/users', authenticate, authorize(['admin']), (req, res) => {
  const users = readUsers().map(u => ({
    username: u.username,
    role: u.role,
    name: u.name
  }));
  res.json(users);
});

// Create User
app.post('/api/users', authenticate, authorize(['admin']), (req, res) => {
  const { username, password, role, name } = req.body;
  if (!username || !password || !role || !name) {
    return res.status(400).json({ error: 'All fields (username, password, role, name) are required.' });
  }

  const allowedRoles = ['admin', 'creator', 'writer'];
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role specified.' });
  }

  const users = readUsers();
  if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ error: 'Username already exists.' });
  }

  const newUser = {
    username: username.trim(),
    password: hashPassword(password),
    role,
    name: name.trim()
  };

  users.push(newUser);
  writeUsers(users);
  res.status(201).json({
    username: newUser.username,
    role: newUser.role,
    name: newUser.name
  });
});

// Reset User Password
app.put('/api/users/:username/reset-password', authenticate, authorize(['admin']), (req, res) => {
  const { username } = req.params;
  const { newPassword } = req.body;

  if (!newPassword) {
    return res.status(400).json({ error: 'New password is required.' });
  }

  const users = readUsers();
  const index = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());

  if (index === -1) {
    return res.status(404).json({ error: 'User not found.' });
  }

  users[index].password = hashPassword(newPassword);
  writeUsers(users);
  res.json({ message: `Password for user "${username}" reset successfully.` });
});

// Delete User
app.delete('/api/users/:username', authenticate, authorize(['admin']), (req, res) => {
  const { username } = req.params;
  
  if (username.toLowerCase() === req.user.username.toLowerCase()) {
    return res.status(400).json({ error: 'You cannot delete your own admin account.' });
  }

  const users = readUsers();
  const filtered = users.filter(u => u.username.toLowerCase() !== username.toLowerCase());

  if (users.length === filtered.length) {
    return res.status(404).json({ error: 'User not found.' });
  }

  writeUsers(filtered);
  res.json({ message: `User "${username}" deleted successfully.` });
});


// --- Assignment API Endpoints (Role-Protected) ---

// Get all assignments (All Roles)
app.get('/api/assignments', authenticate, (req, res) => {
  const assignments = readDB();
  res.json(assignments);
});

// Create new assignment (Admin & Creator Only)
app.post('/api/assignments', authenticate, authorize(['admin', 'creator']), upload.array('files'), (req, res) => {
  const { code, title, subject, description, dueDate, estimatedEffort, price, priceReceived, tasks, attachments } = req.body;
  const files = req.files || [];
  
  const assignments = readDB();
  
  let parsedTasks = [];
  if (tasks) {
    try {
      parsedTasks = typeof tasks === 'string' ? JSON.parse(tasks) : tasks;
    } catch (e) {
      parsedTasks = typeof tasks === 'string' ? tasks.split('\n').filter(t => t.trim()) : [];
    }
  }

  let parsedAttachments = [];
  if (attachments) {
    try {
      parsedAttachments = typeof attachments === 'string' ? JSON.parse(attachments) : attachments;
    } catch (e) {
      parsedAttachments = [];
    }
  }

  const newUploadedAttachments = files.map(file => ({
    name: file.originalname,
    path: `/api/uploads/${path.basename(file.path)}`,
    mimeType: file.mimetype
  }));

  const combinedAttachments = [...parsedAttachments, ...newUploadedAttachments];
  
  const newAssignment = {
    id: Date.now().toString(),
    code: code || 'Unknown',
    title: title || 'New Assignment',
    subject: subject || 'General',
    description: description || '',
    status: 'Todo',
    dueDate: dueDate || null,
    estimatedEffort: estimatedEffort || 'Medium',
    tasks: parsedTasks.map((t, idx) => ({
      id: `t-${Date.now()}-${idx}`,
      text: typeof t === 'string' ? t : t.text,
      completed: typeof t === 'string' ? false : !!t.completed
    })),
    price: price ? Number(price) : null,
    priceReceived: priceReceived ? Number(priceReceived) : 0,
    attachments: combinedAttachments,
    submissions: [],
    createdAt: new Date().toISOString()
  };

  assignments.push(newAssignment);
  writeDB(assignments);
  res.status(201).json(newAssignment);
});

// Update assignment status or checklist details (Dynamic Authorization)
app.put('/api/assignments/:id', authenticate, (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  
  const assignments = readDB();
  const index = assignments.findIndex(a => a.id === id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Assignment not found' });
  }

  // Permission Checks:
  // Writers and Admins can update status, tasks, and submissions
  // Creators and Admins can update core text fields (code, title, subject, description, dueDate)
  const isWriterAction = 'status' in updates || 'tasks' in updates || 'submissions' in updates;
  const isCreatorAction = 'code' in updates || 'title' in updates || 'subject' in updates || 'description' in updates || 'dueDate' in updates || 'estimatedEffort' in updates || 'price' in updates || 'priceReceived' in updates;

  const role = req.user.role;
  if (role === 'writer' && isCreatorAction) {
    return res.status(403).json({ error: 'Writers do not have permission to modify core assignment guidelines.' });
  }
  if (role === 'creator' && isWriterAction) {
    return res.status(403).json({ error: 'Creators do not have permission to change execution status or checklist progress.' });
  }

  // Merge updates
  assignments[index] = {
    ...assignments[index],
    ...updates,
    tasks: updates.tasks ? updates.tasks.map((t, idx) => ({
      id: t.id || `t-${Date.now()}-${idx}`,
      text: t.text,
      completed: !!t.completed
    })) : assignments[index].tasks
  };

  writeDB(assignments);
  res.json(assignments[index]);
});

// Delete assignment (Admin Only)
app.delete('/api/assignments/:id', authenticate, authorize(['admin']), (req, res) => {
  const { id } = req.params;
  const assignments = readDB();
  const filtered = assignments.filter(a => a.id !== id);
  
  if (assignments.length === filtered.length) {
    return res.status(404).json({ error: 'Assignment not found' });
  }

  writeDB(filtered);
  res.json({ message: 'Assignment deleted successfully' });
});

// Add new reference attachments (Admin & Creator Only)
app.post('/api/assignments/:id/attachments', authenticate, authorize(['admin', 'creator']), upload.array('files'), (req, res) => {
  const { id } = req.params;
  const files = req.files || [];

  if (files.length === 0) {
    return res.status(400).json({ error: 'No files were uploaded.' });
  }

  const assignments = readDB();
  const index = assignments.findIndex(a => a.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Assignment not found' });
  }

  const newAttachments = files.map(file => ({
    name: file.originalname,
    path: `/api/uploads/${path.basename(file.path)}`,
    mimeType: file.mimetype
  }));

  assignments[index].attachments = [
    ...(assignments[index].attachments || []),
    ...newAttachments
  ];

  writeDB(assignments);
  res.json(assignments[index]);
});

// Add new submissions (Admin & Writer Only)
app.post('/api/assignments/:id/submissions', authenticate, authorize(['admin', 'writer']), upload.array('files'), (req, res) => {
  const { id } = req.params;
  const files = req.files || [];

  if (files.length === 0) {
    return res.status(400).json({ error: 'No files were uploaded.' });
  }

  const assignments = readDB();
  const index = assignments.findIndex(a => a.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Assignment not found' });
  }

  const newSubmissions = files.map(file => ({
    name: file.originalname,
    path: `/api/uploads/${path.basename(file.path)}`,
    mimeType: file.mimetype,
    uploadedAt: new Date().toISOString()
  }));

  assignments[index].submissions = [
    ...(assignments[index].submissions || []),
    ...newSubmissions
  ];

  writeDB(assignments);
  res.json(assignments[index]);
});

// Process files/voice with Gemini to extract details (Admin & Creator Only)
app.post('/api/process', authenticate, authorize(['admin', 'creator']), upload.array('files'), async (req, res) => {
  try {
    const { instructions, customApiKey } = req.body;
    const apiKey = customApiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(400).json({ 
        error: 'Gemini API Key is missing. Please set GEMINI_API_KEY in the .env file or enter it in settings.' 
      });
    }

    const files = req.files || [];
    const parts = [];
    let extractedText = '';

    for (const file of files) {
      const ext = path.extname(file.originalname).toLowerCase();
      const filePath = file.path;

      if (GEMINI_SUPPORTED_MIMES[ext]) {
        const fileBuffer = fs.readFileSync(filePath);
        const base64Data = fileBuffer.toString('base64');
        parts.push({
          inlineData: {
            mimeType: GEMINI_SUPPORTED_MIMES[ext],
            data: base64Data
          }
        });
      } else if (ext === '.docx') {
        try {
          const result = await mammoth.extractRawText({ path: filePath });
          extractedText += `\n\n--- Content of Word Document [${file.originalname}] ---\n${result.value}`;
        } catch (docxErr) {
          console.error(`Error parsing docx file ${file.originalname}:`, docxErr);
          extractedText += `\n\n[Could not extract text from Word document: ${file.originalname}]`;
        }
      } else if (ext === '.txt' || ext === '.md') {
        try {
          const text = fs.readFileSync(filePath, 'utf8');
          extractedText += `\n\n--- Content of Text File [${file.originalname}] ---\n${text}`;
        } catch (txtErr) {
          console.error(`Error reading text file ${file.originalname}:`, txtErr);
        }
      } else {
        extractedText += `\n\n[Uploaded unsupported file type: ${file.originalname}]`;
      }
    }

    let userPromptText = `Please analyze the uploaded materials and instructions to extract the assignment details.`;
    if (instructions) {
      userPromptText += `\n\nUser Instructions / Notes:\n${instructions}`;
    }
    if (extractedText) {
      userPromptText += `\n\nExtracted File Text:\n${extractedText}`;
    }

    parts.unshift({ text: userPromptText });

    const systemInstruction = `You are a smart university assignment information extractor. 
Your goal is to parse any text descriptions, voice transcripts, PDF documents, image sheets, or Word files, and output a structured JSON response summarizing the assignment.

Rules:
1. "code": Extract the course code (like CS101, PHY201) or assignment ID. If not found, write "Unknown".
2. "title": Provide a concise, descriptive title.
3. "subject": Identify the course or subject name.
4. "description": Write a thorough summary of the assignment rules, questions, constraints, and requirements in clear Markdown formatting.
5. "dueDate": Extract the due date. Try your best to parse it into an ISO format (YYYY-MM-DD). If no due date is mentioned, return null.
6. "estimatedEffort": Estimate difficulty (Easy, Medium, Hard) and hours needed (e.g. "Medium (6 hours)") based on complexity.
7. "price": Extract the price, payment amount, or payout rate of the assignment if mentioned (e.g., if it says "$150" or "150 USD" or "150", return 150. If no price is mentioned, return null).
8. "tasks": Create a checklist of practical sub-tasks/steps needed to complete this assignment (e.g. ["Research Topic", "Write draft", "Review guidelines", "Create final submission PDF"]).

You MUST respond with a JSON object conforming exactly to this schema:
{
  "code": string,
  "title": string,
  "subject": string,
  "description": string,
  "dueDate": string or null,
  "estimatedEffort": string,
  "price": number or null,
  "tasks": string[]
}`;

    const responseSchema = {
      type: "OBJECT",
      properties: {
        code: { type: "STRING" },
        title: { type: "STRING" },
        subject: { type: "STRING" },
        description: { type: "STRING" },
        dueDate: { type: "STRING", nullable: true },
        estimatedEffort: { type: "STRING" },
        price: { type: "NUMBER", nullable: true },
        tasks: {
          type: "ARRAY",
          items: { type: "STRING" }
        }
      },
      required: ["code", "title", "subject", "description", "dueDate", "estimatedEffort", "price", "tasks"]
    };

    const requestBody = {
      contents: [{ role: "user", parts: parts }],
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: responseSchema
      }
    };

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    console.log(`Sending request to Gemini API (model: gemini-2.5-flash)...`);
    const apiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!apiResponse.ok) {
      const errorData = await apiResponse.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Gemini API responded with status ${apiResponse.status}`);
    }

    const apiData = await apiResponse.json();
    const resultText = apiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) {
      throw new Error('Empty response from Gemini API.');
    }

    const assignmentData = JSON.parse(resultText);
    const attachments = files.map(file => ({
      name: file.originalname,
      path: `/api/uploads/${path.basename(file.path)}`,
      mimeType: file.mimetype
    }));

    res.json({
      ...assignmentData,
      attachments: attachments
    });

  } catch (error) {
    console.error('Error processing assignment materials:', error);
    res.status(500).json({ error: error.message || 'Failed to process assignment materials.' });
  }
});

// Serve frontend in production
const frontendBuildPath = path.join(__dirname, 'client', 'dist');
if (fs.existsSync(frontendBuildPath)) {
  app.use(express.static(frontendBuildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendBuildPath, 'index.html'));
  });
}

// Start Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Smart Assignment Tracker listening on port ${PORT}`);
  console.log(`📂 Database file stored at: ${DB_FILE}`);
  console.log(`📎 Uploads folder created at: ${UPLOADS_DIR}`);
  console.log(`====================================================`);
});
