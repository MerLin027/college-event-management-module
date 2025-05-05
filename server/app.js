import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const app = express();

// JWT Secret - should be in .env file in production
const JWT_SECRET = 'super_secret_key_123';
const JWT_EXPIRES_IN = '24h';

// Middleware
app.use(cors());
app.use(express.json());

// Error handler middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err.stack);
  res.status(500).json({ 
    message: 'An unexpected error occurred',
    error: process.env.NODE_ENV === 'production' ? undefined : err.message
  });
});

// In-memory storage
let USERS = [];
let EVENTS = [];
let eventIdCounter = 1;

// Sample data for testing
const initializeSampleData = () => {
  // Create sample users
  if (USERS.length === 0) {
    const { salt, hash } = hashPassword('password123');
    USERS.push({ 
      username: 'admin', 
      hash, 
      salt,
      id: 1,
      createdAt: new Date().toISOString(),
      role: 'admin'
    });
    
    const { salt: salt2, hash: hash2 } = hashPassword('password123');
    USERS.push({ 
      username: 'user', 
      hash: hash2, 
      salt: salt2,
      id: 2,
      createdAt: new Date().toISOString(),
      role: 'user'
    });
  }
  
  // No sample events initialization anymore
};

// Password utils
const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return { salt, hash };
};

const verifyPassword = (password, hash, salt) => {
  const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
};

// Validation utils
const validateInput = (input) => {
  if (!input.username || !input.password) {
    return { valid: false, message: 'Username and password are required' };
  }
  if (input.username.length < 3) {
    return { valid: false, message: 'Username must be at least 3 characters long' };
  }
  if (input.password.length < 6) {
    return { valid: false, message: 'Password must be at least 6 characters long' };
  }
  return { valid: true };
};

const validateEvent = (event) => {
  if (!event.title) {
    return { valid: false, message: 'Event title is required' };
  }
  if (!event.description) {
    return { valid: false, message: 'Event description is required' };
  }
  if (!event.eventType) {
    return { valid: false, message: 'Event type is required' };
  }
  return { valid: true };
};

// Authentication middleware
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization;
  
  console.log('Auth token received:', token ? 'Yes' : 'No');
  
  if (!token) {
    return res.status(401).json({ message: 'Authentication token required' });
  }
  
  try {
    // Verify the token
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('Token verified successfully for user:', decoded.username);
    
    // Set user info in request object
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Token verification error:', err.message);
    
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired', expired: true });
    }
    
    res.status(401).json({ message: 'Invalid authentication token' });
  }
};

// Admin middleware
const adminMiddleware = (req, res, next) => {
  // Find user to check role
  const user = USERS.find(u => u.id === req.user.userId);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied: Admin privileges required' });
  }
  next();
};

// Initialize sample data
initializeSampleData();

// ===============================
// Event Routes
// ===============================

// Get events created by the current user
app.get('/events/user/me', authMiddleware, (req, res) => {
  try {
    const userEvents = EVENTS.filter(event => event.createdBy === req.user.userId);
    res.json(userEvents);
  } catch (error) {
    console.error('Get user events error:', error);
    res.status(500).json({ message: 'Server error fetching user events' });
  }
});

// Get all events (with pagination, filtering, and search)
app.get('/events', authMiddleware, (req, res) => {
  try {
    console.log('User requesting events:', req.user); // Debug log
    
    let filteredEvents = [...EVENTS];
    const {
      search,
      type,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortDir = 'desc'
    } = req.query;
    
    // Search by title or description
    if (search) {
      const searchLower = search.toLowerCase();
      filteredEvents = filteredEvents.filter(event => 
        event.title?.toLowerCase().includes(searchLower) || 
        event.description?.toLowerCase().includes(searchLower)
      );
    }
    
    // Filter by event type
    if (type) {
      filteredEvents = filteredEvents.filter(event => event.eventType === type);
    }
    
    // Ensure all events have the required fields
    filteredEvents = filteredEvents.map(event => ({
      id: event.id,
      title: event.title || '',
      description: event.description || '',
      eventType: event.eventType || 'general',
      imageUrl: event.imageUrl || 'default.jpg',
      createdBy: event.createdBy,
      createdAt: event.createdAt || new Date().toISOString(),
      location: event.location || '',
      startDate: event.startDate || '',
      endDate: event.endDate || ''
    }));
    
    // Sort events (with null check)
    filteredEvents.sort((a, b) => {
      const aValue = a[sortBy] || '';
      const bValue = b[sortBy] || '';
      
      if (sortDir === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
    
    // Calculate pagination
    const startIndex = (Number(page) - 1) * Number(limit);
    const endIndex = startIndex + Number(limit);
    
    // Get paginated events
    const paginatedEvents = filteredEvents.slice(startIndex, endIndex);
    
    console.log(`Returning ${paginatedEvents.length} events, page ${page} of ${Math.ceil(filteredEvents.length / Number(limit))}`);
    
    res.json({
      events: paginatedEvents,
      totalEvents: filteredEvents.length,
      currentPage: Number(page),
      totalPages: Math.ceil(filteredEvents.length / Number(limit)) || 1
    });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ message: 'Server error fetching events' });
  }
});

// Get single event
app.get('/events/:id', authMiddleware, (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const event = EVENTS.find(e => e.id === eventId);
    
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    
    res.json(event);
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({ message: 'Server error fetching event' });
  }
});

// ===============================
// Auth Routes
// ===============================

app.post('/register', (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validate input
    const validation = validateInput({ username, password });
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }
    
    // Check if username exists
    if (USERS.find(u => u.username === username)) {
      return res.status(400).json({ message: 'Username already exists' });
    }
    
    // Hash password
    const { salt, hash } = hashPassword(password);
    
    // Create user
    const newUser = { 
      username, 
      hash, 
      salt,
      id: USERS.length + 1,
      role: 'user', // Default role
      createdAt: new Date().toISOString()
    };
    
    USERS.push(newUser);
    res.status(201).json({ message: 'Registration successful' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

app.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validate input
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }
    
    // Find user
    const user = USERS.find(u => u.username === username);
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    
    // Verify password
    const isValid = verifyPassword(password, user.hash, user.salt);
    if (!isValid) return res.status(401).json({ message: 'Invalid credentials' });
    
    // Generate token
    const token = jwt.sign(
      { 
        userId: user.id,
        username: user.username,
        role: user.role
      }, 
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    res.json({ 
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

app.get('/user', authMiddleware, (req, res) => {
  try {
    const user = USERS.find(u => u.id === req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    res.json({
      id: user.id,
      username: user.username,
      role: user.role
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ===============================
// Event Routes
// ===============================

// Create event
app.post('/events', authMiddleware, (req, res) => {
  try {
    const eventData = req.body;
    
    // Validate event data
    const validation = validateEvent(eventData);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }
    
    const newEvent = {
      ...eventData,
      id: eventIdCounter++,
      createdBy: req.user.userId,
      createdAt: new Date().toISOString(),
      imageUrl: eventData.imageUrl || 'default.jpg'
    };
    
    EVENTS.push(newEvent);
    res.status(201).json(newEvent);
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ message: 'Server error creating event' });
  }
});

// Update event
app.put('/events/:id', authMiddleware, (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const eventIndex = EVENTS.findIndex(e => e.id === eventId);
    
    if (eventIndex === -1) {
      return res.status(404).json({ message: 'Event not found' });
    }
    
    // Check if user is owner or admin
    const event = EVENTS[eventIndex];
    const isOwner = event.createdBy === req.user.userId;
    const isAdmin = req.user.role === 'admin';
    
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'You do not have permission to edit this event' });
    }
    
    // Update the event
    EVENTS[eventIndex] = { 
      ...EVENTS[eventIndex], 
      ...req.body,
      updatedAt: new Date().toISOString()
    };
    
    res.json(EVENTS[eventIndex]);
  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({ message: 'Server error updating event' });
  }
});

// Delete event
app.delete('/events/:id', authMiddleware, (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const eventIndex = EVENTS.findIndex(e => e.id === eventId);
    
    if (eventIndex === -1) {
      return res.status(404).json({ message: 'Event not found' });
    }
    
    // Check if user is owner or admin
    const event = EVENTS[eventIndex];
    const isOwner = event.createdBy === req.user.userId;
    const isAdmin = req.user.role === 'admin';
    
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'You do not have permission to delete this event' });
    }
    
    // Remove the event
    EVENTS.splice(eventIndex, 1);
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ message: 'Server error deleting event' });
  }
});

// ===============================
// Admin Routes
// ===============================

// Get all users (admin only)
app.get('/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  try {
    // Don't send sensitive data
    const safeUsers = USERS.map(user => ({
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt
    }));
    
    res.json(safeUsers);
  } catch (error) {
    console.error('Admin get users error:', error);
    res.status(500).json({ message: 'Server error fetching users' });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Server initialized with ${USERS.length} users and ${EVENTS.length} events`);
  
  if (USERS.length > 0) {
    console.log('Available test users:');
    USERS.forEach(user => {
      console.log(`- ${user.username} (${user.role})`);
    });
    console.log('Test password for all users: password123');
  }
});

export default app;
