import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('token'))
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isRegister, setIsRegister] = useState(false)
  const [events, setEvents] = useState([])
  const [newEvent, setNewEvent] = useState({ title: '', description: '' })
  const [error, setError] = useState('')

  useEffect(() => {
    if (isLoggedIn) {
      fetch('http://localhost:5000/events', {
        headers: {
          'Authorization': localStorage.getItem('token')
        }
      })
        .then(r => r.json())
        .then(data => setEvents(data))
        .catch(error => console.error('Error fetching events:', error))
    }
  }, [isLoggedIn, events])

  const handleAuth = async () => {
    try {
      const url = isRegister ? 'register' : 'login'
      const res = await fetch(`http://localhost:5000/${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      const data = await res.json()

      if (data.token) {
        localStorage.setItem('token', data.token)
        setIsLoggedIn(true)
        alert('Login successful')
      } else {
        alert(data.message || 'Authentication failed')
      }
    } catch {
      setError('An error occurred during authentication')
    }
  }

  const createEvent = async () => {
    const res = await fetch('http://localhost:5000/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': localStorage.getItem('token')
      },
      body: JSON.stringify(newEvent)
    })
    const data = await res.json()
    setEvents([...events, data])
    setNewEvent({ title: '', description: '' })
  }

  const logout = () => {
    localStorage.removeItem('token')
    setIsLoggedIn(false)
  }

  return (
    <div style={{ padding: '20px' }}>
      {!isLoggedIn ? (
        <div>
          <h2>{isRegister ? 'Register' : 'Login'}</h2>
          {error && <p style={{ color: 'red' }}>{error}</p>}
          <input
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
          />
          <br />
          <input
            placeholder="Password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          <br />
          <button onClick={handleAuth}>
            {isRegister ? 'Register' : 'Login'}
          </button>
          <button onClick={() => setIsRegister(!isRegister)}>
            Switch to {isRegister ? 'Login' : 'Register'}
          </button>
        </div>
      ) : (
        <div>
          <button onClick={logout}>Logout</button>

          <div style={{ marginTop: '20px' }}>
            <h3>Create New Event</h3>
            <input
              placeholder="Event Title"
              value={newEvent.title}
              onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
            />
            <br />
            <textarea
              placeholder="Description"
              value={newEvent.description}
              onChange={e => setNewEvent({ ...newEvent, description: e.target.value })}
            />
            <br />
            <button onClick={createEvent}>Create Event</button>
          </div>

          <div style={{ marginTop: '20px' }}>
            <h3>Events</h3>
            {events.map(event => (
              <div key={event.id} style={{
                border: '1px solid #ccc',
                padding: '10px',
                marginBottom: '10px'
              }}>
                <h4>{event.title}</h4>
                <p>{event.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
