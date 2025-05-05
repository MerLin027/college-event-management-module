import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';

const app = express();

app.use(cors());
app.use(express.json());

// In-memory storage
let USERS = [];
let EVENTS = [];
let eventIdCounter = 1;

// Authentication middleware
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ message: 'Authentication token required' });
  
  try {
    const decoded = jwt.verify(token, 'super_secret_key_123');
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid authentication token' });
  }
};

app.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (USERS.find(u => u.username === username)) {
    return res.status(400).json({ message: 'Username already exists' });
  }
  USERS.push({ username, password, id: USERS.length + 1 });
  res.json({ message: 'Registration successful' });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = USERS.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });
  
  const token = jwt.sign({ userId: user.id }, 'super_secret_key_123');
  res.json({ token });
});

app.get('/events', authMiddleware, (req, res) => {
  res.json(EVENTS);
});

app.post('/events', authMiddleware, (req, res) => {
  const newEvent = {
    ...req.body,
    id: eventIdCounter++,
    createdBy: req.user.userId,
    imageUrl: req.body.imageUrl || 'default.jpg'
  };
  EVENTS.push(newEvent);
  res.json(newEvent);
});

app.put('/events/:id', authMiddleware, (req, res) => {
  const eventId = parseInt(req.params.id);
  const eventIndex = EVENTS.findIndex(e => e.id === eventId);
  if (eventIndex === -1) return res.status(404).json({ message: 'Event not found' });
  
  EVENTS[eventIndex] = { ...EVENTS[eventIndex], ...req.body };
  res.json(EVENTS[eventIndex]);
});

app.delete('/events/:id', authMiddleware, (req, res) => {
  const eventId = parseInt(req.params.id);
  EVENTS = EVENTS.filter(e => e.id !== eventId);
  res.json({ message: 'Event deleted successfully' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
