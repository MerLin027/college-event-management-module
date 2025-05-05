import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import './App.css'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('token'))
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isRegister, setIsRegister] = useState(false)
  const [events, setEvents] = useState([])
  const [newEvent, setNewEvent] = useState({ 
    title: '', 
    description: '', 
    eventType: 'general',
    imageUrl: '',
    location: '',
    startDate: '',
    endDate: ''
  })
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [userData, setUserData] = useState(JSON.parse(localStorage.getItem('user')) || null)
  const [rememberMe, setRememberMe] = useState(localStorage.getItem('rememberMe') === 'true')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [validationErrors, setValidationErrors] = useState({})
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [showEventDetails, setShowEventDetails] = useState(false)
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalEvents: 0
  })
  
  // Event types
  const eventTypes = ['general', 'conference', 'workshop', 'social', 'other']

  // Create axios instance with base URL
  const api = axios.create({
    baseURL: 'http://localhost:5000',
    headers: {
      'Content-Type': 'application/json'
    },
    timeout: 5000 // Add timeout to prevent hanging requests
  })

  // Add token to requests if it exists
  api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token')
    if (token) {
      // Ensure consistent token format
      config.headers.Authorization = token
    }
    return config
  }, (error) => {
    return Promise.reject(error)
  })

  // Handle logout function definition moved here to avoid circular reference
  const handleLogout = (message = '') => {
    localStorage.removeItem('token')
    if (!rememberMe) {
      localStorage.removeItem('user')
      localStorage.removeItem('rememberMe')
    }
    setIsLoggedIn(false)
    setEvents([])
    if (message) {
      setError(message)
    }
  }

  // Handle response errors (including token expiry)
  api.interceptors.response.use(
    (response) => response,
    (error) => {
      // Handle token expiration
      if (error.response?.status === 401 && error.response?.data?.expired) {
        handleLogout('Your session has expired. Please login again.')
      }
      return Promise.reject(error)
    }
  )

  const fetchUserData = useCallback(async () => {
    if (!isLoggedIn) return
    
    try {
      const { data } = await api.get('/user')
      setUserData(data)
      
      // Store user data if remember me is checked
      if (rememberMe) {
        localStorage.setItem('user', JSON.stringify(data))
      }
    } catch (error) {
      console.error('Error fetching user data:', error)
      if (error.response?.status === 401) {
        handleLogout()
      }
    }
  }, [api, isLoggedIn, rememberMe])

  const fetchEvents = useCallback(async (page = 1) => {
    try {
      setIsLoading(true)
      console.log('Fetching events...')
      
      const { data } = await api.get('/events', {
        params: {
          page,
          limit: 10
        }
      })
      
      console.log('API response:', data) // Debug log
      
      // Check if data has the new structure with pagination
      if (data && data.events) {
        setEvents(data.events)
        setPagination({
          currentPage: data.currentPage || 1,
          totalPages: data.totalPages || 1,
          totalEvents: data.totalEvents || data.events.length
        })
      } else if (Array.isArray(data)) {
        // Fallback for old API structure
        setEvents(data)
      } else {
        // Handle empty or invalid response
        console.error('Invalid events data structure:', data)
        setEvents([])
      }
    } catch (error) {
      console.error('Error fetching events:', error.response || error)
      
      // Check for network errors
      if (error.code === 'ECONNABORTED' || !error.response) {
        setError('Failed to connect to the server. Please check your connection and try again.')
      } else {
        setError(`Failed to fetch events: ${error.response?.data?.message || error.message}`)
      }
      
      // If unauthorized, handle logout
      if (error.response?.status === 401) {
        handleLogout('Your session has expired. Please login again.')
      }
      
      // Set empty events to prevent UI issues
      setEvents([])
    } finally {
      setIsLoading(false)
    }
  }, [api])

  useEffect(() => {
    if (isLoggedIn) {
      fetchUserData()
      fetchEvents()
    }
  }, [isLoggedIn, fetchUserData, fetchEvents])

  const validateForm = () => {
    const errors = {}
    
    if (!username || username.length < 3) {
      errors.username = 'Username must be at least 3 characters'
    }
    
    if (!password || password.length < 6) {
      errors.password = 'Password must be at least 6 characters'
    }
    
    if (isRegister && password !== passwordConfirm) {
      errors.passwordConfirm = 'Passwords do not match'
    }
    
    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleAuth = async (e) => {
    e.preventDefault()
    setError('')
    
    // Validate form
    if (!validateForm()) {
      return
    }
    
    setIsLoading(true)

    try {
      const url = isRegister ? '/register' : '/login'
      const { data } = await api.post(url, { username, password })

      if (isRegister) {
        setIsRegister(false)
        setError('')
        setPassword('')
        setPasswordConfirm('')
        setValidationErrors({})
        setIsLoading(false)
        return
      }

      if (data.token) {
        // Save the token to localStorage
        localStorage.setItem('token', data.token)
        
        // If remember me is checked, store user data
        if (rememberMe) {
          localStorage.setItem('user', JSON.stringify(data.user))
          localStorage.setItem('rememberMe', 'true')
        } else {
          localStorage.removeItem('user')
          localStorage.removeItem('rememberMe')
        }
        
        setUserData(data.user)
        setIsLoggedIn(true)
        setUsername('')
        setPassword('')
        setPasswordConfirm('')
        setValidationErrors({})
        
        // Fetch events after successful login
        setTimeout(() => fetchEvents(), 500)
      }
    } catch (error) {
      setError(error.response?.data?.message || 'Authentication failed')
      console.error('Authentication error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const createEvent = async () => {
    if (!newEvent.title || !newEvent.description || !newEvent.eventType) {
      setError('Please fill in all required fields')
      return
    }

    try {
      const eventData = {...newEvent}
      
      // Use default image if not provided
      if (!eventData.imageUrl) {
        eventData.imageUrl = 'default.jpg'
      }
      
      await api.post('/events', eventData)
      
      // Refresh events list after creating a new event
      fetchEvents()
      
      setNewEvent({ 
        title: '', 
        description: '', 
        eventType: 'general',
        imageUrl: '',
        location: '',
        startDate: '',
        endDate: ''
      })
      setError('')
    } catch (error) {
      setError(error.response?.data?.message || 'Failed to create event')
      console.error('Error creating event:', error)
    }
  }
  
  const updateEvent = async () => {
    if (!newEvent.title || !newEvent.description || !newEvent.eventType) {
      setError('Please fill in all required fields')
      return
    }
    
    try {
      await api.put(`/events/${newEvent.id}`, newEvent)
      
      // Refresh events list after updating
      fetchEvents()
      
      setNewEvent({ 
        title: '', 
        description: '', 
        eventType: 'general',
        imageUrl: '',
        location: '',
        startDate: '',
        endDate: ''
      })
      setEditMode(false)
      setError('')
    } catch (error) {
      setError(error.response?.data?.message || 'Failed to update event')
      console.error('Error updating event:', error)
    }
  }
  
  const deleteEvent = async (id) => {
    try {
      await api.delete(`/events/${id}`)
      
      // Refresh events list after deleting
      fetchEvents()
    } catch (error) {
      setError('Failed to delete event')
      console.error('Error deleting event:', error)
    }
  }
  
  const handleEditEvent = (event) => {
    setNewEvent({
      id: event.id,
      title: event.title,
      description: event.description,
      eventType: event.eventType || 'general',
      imageUrl: event.imageUrl || '',
      location: event.location || '',
      startDate: event.startDate || '',
      endDate: event.endDate || ''
    })
    setEditMode(true)
    setShowEventDetails(false)
  }
  
  const cancelEdit = () => {
    setNewEvent({ 
      title: '', 
      description: '', 
      eventType: 'general',
      imageUrl: '',
      location: '',
      startDate: '',
      endDate: ''
    })
    setEditMode(false)
  }
  
  const handleViewEvent = (event) => {
    setSelectedEvent(event)
    setShowEventDetails(true)
  }
  
  const handleImageUrlChange = (e) => {
    // This is a simplification for image URL input
    // In a real app, you would use image upload with file input
    setNewEvent({...newEvent, imageUrl: e.target.value})
  }

  return (
    <div>
      {!isLoggedIn ? (
        <div className="auth-container">
          <h1 className="auth-title">{isRegister ? 'Create Account' : 'Welcome Back'}</h1>
          <form className="auth-form" onSubmit={handleAuth}>
            <div className="input-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                className={`input-field ${validationErrors.username ? 'error-input' : ''}`}
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                disabled={isLoading}
                autoComplete="username"
              />
              {validationErrors.username && (
                <div className="error-message">{validationErrors.username}</div>
              )}
            </div>

            <div className="input-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                className={`input-field ${validationErrors.password ? 'error-input' : ''}`}
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                disabled={isLoading}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
              />
              {validationErrors.password && (
                <div className="error-message">{validationErrors.password}</div>
              )}
            </div>

            {isRegister && (
              <div className="input-group">
                <label htmlFor="passwordConfirm">Confirm Password</label>
                <input
                  id="passwordConfirm"
                  className={`input-field ${validationErrors.passwordConfirm ? 'error-input' : ''}`}
                  type="password"
                  value={passwordConfirm}
                  onChange={e => setPasswordConfirm(e.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="new-password"
                />
                {validationErrors.passwordConfirm && (
                  <div className="error-message">{validationErrors.passwordConfirm}</div>
                )}
              </div>
            )}

            {!isRegister && (
              <div className="checkbox-group">
                <input
                  id="rememberMe"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  disabled={isLoading}
                />
                <label htmlFor="rememberMe">Remember me</label>
              </div>
            )}

            {error && <div className="error-message">{error}</div>}

            <div className="button-group">
              <button 
                type="submit" 
                className="auth-button primary"
                disabled={isLoading}
              >
                {isLoading ? 'Please wait...' : (isRegister ? 'Sign Up' : 'Sign In')}
              </button>
              <button 
                type="button"
                className="auth-button secondary"
                onClick={() => {
                  setIsRegister(!isRegister)
                  setError('')
                  setUsername('')
                  setPassword('')
                  setPasswordConfirm('')
                  setValidationErrors({})
                }}
                disabled={isLoading}
              >
                {isRegister ? 'Have an account?' : 'Need an account?'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="home-container">
          <div className="header">
            <div className="welcome-message">
              {userData ? `Welcome, ${userData.username}` : 'Welcome!'}
            </div>
            <button onClick={() => handleLogout()} className="auth-button secondary">Logout</button>
          </div>

          <div className="content-section create-event-container">
            <h3 className="section-title">{editMode ? 'Edit Event' : 'Create New Event'}</h3>
            {error && <p className="error">{error}</p>}
            
            <div className="form-row">
              <div className="input-container">
                <label htmlFor="eventTitle">Event Title</label>
                <input
                  id="eventTitle"
                  placeholder="Enter event title"
                  value={newEvent.title}
                  onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
                  className="input-field"
                />
              </div>
              
              <div className="input-container">
                <label htmlFor="eventType">Event Type</label>
                <select 
                  id="eventType"
                  value={newEvent.eventType}
                  onChange={e => setNewEvent({ ...newEvent, eventType: e.target.value })}
                  className="input-field"
                >
                  {eventTypes.map(type => (
                    <option key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="input-container">
              <label htmlFor="eventDescription">Description</label>
              <textarea
                id="eventDescription"
                placeholder="Enter event description"
                value={newEvent.description}
                onChange={e => setNewEvent({ ...newEvent, description: e.target.value })}
                className="input-field"
                rows="4"
              />
            </div>
            
            <div className="input-container">
              <label htmlFor="imageUrl">Image URL</label>
              <input
                id="imageUrl"
                placeholder="Enter image URL"
                value={newEvent.imageUrl}
                onChange={handleImageUrlChange}
                className="input-field"
              />
              <small className="input-hint">Enter a URL for the event image (optional)</small>
            </div>
            
            <div className="input-container">
              <label htmlFor="location">Location</label>
              <input
                id="location"
                placeholder="Enter event location"
                value={newEvent.location}
                onChange={e => setNewEvent({ ...newEvent, location: e.target.value })}
                className="input-field"
              />
              <small className="input-hint">Where will the event be held? (optional)</small>
            </div>
            
            <div className="form-row">
              <div className="input-container">
                <label htmlFor="startDate">Start Date</label>
                <input
                  id="startDate"
                  type="datetime-local"
                  value={newEvent.startDate}
                  onChange={e => setNewEvent({ ...newEvent, startDate: e.target.value })}
                  className="input-field"
                />
              </div>
              
              <div className="input-container">
                <label htmlFor="endDate">End Date</label>
                <input
                  id="endDate"
                  type="datetime-local"
                  value={newEvent.endDate}
                  onChange={e => setNewEvent({ ...newEvent, endDate: e.target.value })}
                  className="input-field"
                />
              </div>
            </div>
            
            <div className="button-container">
              {editMode ? (
                <>
                  <button onClick={updateEvent} className="auth-button primary">Update Event</button>
                  <button onClick={cancelEdit} className="auth-button secondary">Cancel</button>
                </>
              ) : (
                <button onClick={createEvent} className="auth-button primary">Create Event</button>
              )}
            </div>
          </div>

          <div className="content-section events-container">
            <h3 className="section-title">Events</h3>
            {events.length === 0 ? (
              <div className="empty-state">
                <p>No events yet</p>
                <p className="empty-state-hint">Create your first event using the form above</p>
              </div>
            ) : (
              <>
                <div className="event-list">
                  {events.map(event => (
                    <div key={event.id} className="event-card">
                      <div className="event-header">
                        <h4>{event.title}</h4>
                        <span className="event-type">{event.eventType || 'general'}</span>
                      </div>
                      
                      {event.imageUrl && event.imageUrl !== 'default.jpg' && (
                        <div className="event-image-container">
                          <img 
                            src={event.imageUrl} 
                            alt={event.title} 
                            className="event-image"
                            onError={(e) => {e.target.src = 'default.jpg'; e.target.onerror = null}}
                          />
                        </div>
                      )}
                      
                      <p className="event-description">{
                        event.description.length > 100 
                          ? `${event.description.substring(0, 100)}...` 
                          : event.description
                      }</p>
                      
                      <div className="event-actions">
                        <button onClick={() => handleViewEvent(event)} className="action-button">View</button>
                        <button onClick={() => handleEditEvent(event)} className="action-button">Edit</button>
                        <button onClick={() => deleteEvent(event.id)} className="action-button delete">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Pagination controls */}
                {pagination.totalPages > 1 && (
                  <div className="pagination-controls">
                    <button 
                      className="pagination-button"
                      disabled={pagination.currentPage === 1}
                      onClick={() => fetchEvents(pagination.currentPage - 1)}
                    >
                      Previous
                    </button>
                    
                    <span className="pagination-info">
                      Page {pagination.currentPage} of {pagination.totalPages}
                    </span>
                    
                    <button 
                      className="pagination-button"
                      disabled={pagination.currentPage === pagination.totalPages}
                      onClick={() => fetchEvents(pagination.currentPage + 1)}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          
          {/* Event Details Modal */}
          {showEventDetails && selectedEvent && (
            <div className="modal-overlay" onClick={() => setShowEventDetails(false)}>
              <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>{selectedEvent.title}</h3>
                  <button 
                    className="close-button" 
                    onClick={() => setShowEventDetails(false)}
                  >
                    &times;
                  </button>
                </div>
                
                <div className="modal-type">
                  Type: {selectedEvent.eventType || 'General'}
                </div>
                
                {selectedEvent.location && (
                  <div className="modal-location">
                    Location: {selectedEvent.location}
                  </div>
                )}
                
                {selectedEvent.startDate && (
                  <div className="modal-dates">
                    <div>Starts: {new Date(selectedEvent.startDate).toLocaleString()}</div>
                    {selectedEvent.endDate && (
                      <div>Ends: {new Date(selectedEvent.endDate).toLocaleString()}</div>
                    )}
                  </div>
                )}
                
                {selectedEvent.imageUrl && selectedEvent.imageUrl !== 'default.jpg' && (
                  <div className="modal-image-container">
                    <img 
                      src={selectedEvent.imageUrl} 
                      alt={selectedEvent.title} 
                      className="modal-image"
                      onError={(e) => {e.target.src = 'default.jpg'; e.target.onerror = null}}
                    />
                  </div>
                )}
                
                <div className="modal-description">
                  {selectedEvent.description}
                </div>
                
                <div className="modal-footer">
                  <button 
                    onClick={() => {
                      handleEditEvent(selectedEvent);
                      setShowEventDetails(false);
                    }} 
                    className="auth-button primary"
                  >
                    Edit
                  </button>
                  <button 
                    onClick={() => setShowEventDetails(false)} 
                    className="auth-button secondary"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default App
