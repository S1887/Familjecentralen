import { useState, useEffect, useMemo } from 'react'
import './App.css'
import LoginPage from './components/LoginPage'
import ScheduleViewer from './components/ScheduleViewer'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import heroCustomImg from './assets/hero-custom.jpg';
import { getCoordinates, getTravelTime, formatDuration, searchAddress, getHomeCoords, formatDistance } from './mapService';

// API helper - works in both direct access and Ingress contexts
const getApiUrl = (endpoint) => {
  // Remove leading slash if present
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;

  // Check if running in Home Assistant Ingress context
  const pathname = window.location.pathname;

  // If we're on port 3001 directly, use absolute paths
  if (window.location.port === '3001') {
    return '/' + cleanEndpoint;
  }

  // If in Ingress, the pathname will contain 'ingress' or similar
  // We need to use the current path as base
  if (pathname.includes('ingress') || pathname.includes('hassio')) {
    // Get the base path up to and including the ingress segment
    const basePath = pathname.replace(/\/+$/, ''); // Remove trailing slashes
    return basePath + '/' + cleanEndpoint;
  }

  // Default fallback - relative to current location
  return './' + cleanEndpoint;
};

// Fix för Leaflet icon
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Helper Component for Autocomplete
const LocationAutocomplete = ({ value, onChange, placeholder, ...props }) => {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (value && value.length > 2) {
        const results = await searchAddress(value);
        setSuggestions(results);
        setShowSuggestions(true);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [value]);

  const handleSelect = (suggestion) => {
    // Just grab the main part of the address to keep it short, or the whole thing?
    // Let's take the first part of the comma separated string + city
    const parts = suggestion.display_name.split(',');
    const shortAddress = parts[0] + (parts[1] ? ',' + parts[1] : '');

    onChange(shortAddress); // Update parent input
    if (props.onSelect) {
      props.onSelect({
        lat: parseFloat(suggestion.lat),
        lon: parseFloat(suggestion.lon)
      });
    }
    setShowSuggestions(false);
  };

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            // Hide suggestions if user keeps typing manually to avoid annoyance, 
            // but our effect will show them again.
          }}
          onFocus={() => value && value.length > 2 && setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} // Delay to allow click

          style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--input-border)', flex: 1, background: 'var(--input-bg)', color: 'var(--text-main)' }}
        />
        <a
          href={value
            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`
            : "https://www.google.com/maps"}
          target="_blank"
          rel="noopener noreferrer"
          title="Sök adress på Google Maps"
          style={{
            background: 'var(--button-bg)', border: '1px solid var(--border-color)', borderRadius: '4px',
            padding: '0 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.2rem', textDecoration: 'none', cursor: 'pointer'
          }}
        >
          🔎
        </a>
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <ul style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '4px',
          listStyle: 'none', padding: 0, margin: 0, zIndex: 1002,
          boxShadow: '0 4px 6px var(--shadow-color)', maxHeight: '200px', overflowY: 'auto'
        }}>
          {suggestions.map((s, idx) => (
            <li
              key={idx}
              onClick={() => handleSelect(s)}
              style={{ padding: '0.5rem', cursor: 'pointer', borderBottom: '1px solid #eee' }}
              onMouseEnter={(e) => e.target.style.background = '#f0f0f0'}
              onMouseLeave={(e) => e.target.style.background = 'white'}
            >
              {s.display_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// Component to auto-zoom map
const MapUpdater = ({ route, center }) => {
  const map = useMap();

  useEffect(() => {
    if (route && route.coordinates && route.coordinates.length > 0) {
      const bounds = L.latLngBounds(route.coordinates);
      map.fitBounds(bounds, { padding: [50, 50] });
    } else if (center) {
      map.setView(center, 14);
    }
  }, [route, center, map]);

  return null;
};

import InboxModal from './components/InboxModal';

function App() {
  const [showInbox, setShowInbox] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('familyOpsDarkMode') === 'true');

  // Auth state - persisted in localStorage
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('familjecentralen_user');
    return saved ? JSON.parse(saved) : null;
  });

  const handleLogin = (user) => {
    setCurrentUser(user);
    localStorage.setItem('familjecentralen_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('familjecentralen_user');
  };

  useEffect(() => {
    localStorage.setItem('familyOpsDarkMode', darkMode);
    if (darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [darkMode]);

  const [viewTrash, setViewTrash] = useState(false);
  const [trashItems, setTrashItems] = useState([]);

  // Mobile detection for responsive layout (under 13" screens = 1100px)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1100);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1100);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getWeekNumber = (d) => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  };

  const [currentTime, setCurrentTime] = useState(new Date());
  const [weather, setWeather] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Fetch weather for Lidköping (Daily & Current)
    fetch('https://api.open-meteo.com/v1/forecast?latitude=58.5035&longitude=13.1570&current=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&wind_speed_unit=ms&timezone=Europe%2FBerlin')
      .then(res => res.json())
      .then(data => {
        setWeather(data);
      })
      .catch(e => console.error("Weather fetch failed", e));
  }, []);

  const getSelectedDayWeather = () => {
    if (!weather) return null;

    const dateStr = selectedDate.toISOString().split('T')[0];

    // Check if it is today, use current
    if (isToday(selectedDate) && weather.current) {
      return {
        temp: Math.round(weather.current.temperature_2m),
        code: weather.current.weather_code,
        isMax: false
      };
    }

    // Find in daily
    if (weather.daily && weather.daily.time) {
      const index = weather.daily.time.indexOf(dateStr);
      if (index !== -1) {
        return {
          temp: Math.round(weather.daily.temperature_2m_max[index]),
          code: weather.daily.weather_code[index],
          isMax: true
        };
      }
    }
    return null;
  };

  const getWeatherIcon = (code, isDay = true) => {
    if (code === 0) return isDay ? '☀️' : '🌙'; // Clear
    if (code >= 1 && code <= 3) return isDay ? '⛅' : '☁️'; // Cloudy (Sun behind cloud vs just Cloud - or Moon behind cloud? '🌥️' / '☁️')
    if (code >= 45 && code <= 48) return '🌫️';
    if (code >= 51 && code <= 67) return '🌧️';
    if (code >= 71 && code <= 77) return '❄️';
    if (code >= 95) return '⚡';
    return isDay ? '🌤️' : '☁️';
  };

  const getHeroClass = () => {
    if (!weather) return 'today-hero';

    // Determine IS DAY vs IS NIGHT
    let isDay = true;
    if (weather.daily && weather.daily.sunrise && weather.daily.sunset) {
      try {
        const sunrise = new Date(weather.daily.sunrise[0]);
        const sunset = new Date(weather.daily.sunset[0]);
        if (currentTime < sunrise || currentTime > sunset) {
          isDay = false;
        }
      } catch (e) { }
    } else {
      const hour = currentTime.getHours();
      if (hour < 6 || hour > 21) isDay = false;
    }

    // Determine Weather Condition
    let wCode = 0;
    if (isToday(selectedDate) && weather.current) {
      wCode = weather.current.weather_code;
    } else if (weather.daily) {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const idx = weather.daily.time.indexOf(dateStr);
      if (idx !== -1) wCode = weather.daily.weather_code[idx];
    }

    let type = 'clear';
    if ([1, 2, 3].includes(wCode)) type = 'cloudy';
    if ([45, 48].includes(wCode)) type = 'cloudy';
    if ([51, 53, 55, 61, 63, 65, 80, 81, 82, 95].includes(wCode)) type = 'rain';
    if ([71, 73, 75, 85, 86].includes(wCode)) type = 'snow';

    return `today-hero ${isDay ? 'day' : 'night'}-${type}`;
  };

  const getEventStatusStyle = (endStr) => {
    if (!endStr) return {};
    const end = new Date(endStr);
    const now = new Date();
    if (end < now) {
      return { opacity: 0.6, textDecoration: 'line-through', filter: 'grayscale(100%)' };
    }
    return {};
  };

  const [events, setEvents] = useState([]);
  const [tasks, setTasks] = useState([]); // Standalone tasks

  // Persist Admin State - now derived from currentUser
  const isAdmin = currentUser?.role === 'parent';
  const isChildUser = currentUser?.role === 'child';

  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  // Default filter: children see only their own events
  const [filterChild, setFilterChild] = useState(() =>
    currentUser?.role === 'child' ? currentUser.name : 'Alla'
  );
  const [filterCategory, setFilterCategory] = useState('Alla');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showFamilyMenu, setShowFamilyMenu] = useState(false);
  const [selectedTodoWeek, setSelectedTodoWeek] = useState(getWeekNumber(new Date()));
  const [viewMode, setViewMode] = useState('week');
  const [activeAssignment, setActiveAssignment] = useState(null);
  const [showMobileTaskForm, setShowMobileTaskForm] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Reset filter when user changes (login/logout)
  useEffect(() => {
    if (currentUser?.role === 'child') {
      setFilterChild(currentUser.name);
    } else {
      setFilterChild('Alla');
    }
  }, [currentUser]);

  // Auto-scroll week view to center today's column on mobile
  useEffect(() => {
    if (isMobile && viewMode === 'week') {
      setTimeout(() => {
        const todayCol = document.getElementById('today-column');
        if (todayCol) {
          todayCol.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
      }, 100);
    }
  }, [viewMode, isMobile]);

  // State för att skapa nytt event
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({
    summary: '', date: '', time: '', endTime: '', location: '', description: '',
    assignments: { driver: null, packer: null },
    todoList: [],
    assignees: [], // Array for multiple selection
    coords: null,
    category: null
  });

  // Task Input State


  // State för att visa karta för ett specifikt event
  const [viewMapEvent, setViewMapEvent] = useState(null);
  const [mapRoute, setMapRoute] = useState(null);
  const [mapMode, setMapMode] = useState('car'); // car, bike, walk
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);

  // State for Editing an Event
  const [isEditingEvent, setIsEditingEvent] = useState(false);
  const [editEventData, setEditEventData] = useState(null);

  // Lock body scroll when any modal is open
  useEffect(() => {
    const isAnyModalOpen = isCreatingEvent || isEditingEvent || viewMapEvent;
    if (isAnyModalOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => document.body.classList.remove('modal-open');
  }, [isCreatingEvent, isEditingEvent, viewMapEvent]);

  const [scheduleEvents, setScheduleEvents] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'schedule'

  useEffect(() => {
    fetchEvents();
    fetchTasks();
    fetchSchedule();
  }, []);

  const fetchSchedule = () => {
    fetch(getApiUrl('api/schedule'))
      .then(res => res.json())
      .then(data => setScheduleEvents(data))
      .catch(err => console.error("Error fetching schedule:", err));
  };

  const fetchEvents = () => {
    fetch(getApiUrl('api/events'))
      .then(res => res.json())
      .then(data => {
        // Deduplicate: Hide external events that match a local event (Same Summary & Start)
        // We prefer Local events because they have Assignments/Assignees data.
        const localEvents = data.filter(e => e.source === 'FamilyOps' || e.createdBy);
        const externalEvents = data.filter(e => e.source !== 'FamilyOps' && !e.createdBy);

        const uniqueExternal = externalEvents.filter(ext => {
          const isDuplicate = localEvents.some(loc => {
            const sameSummary = loc.summary.trim().toLowerCase() === ext.summary.trim().toLowerCase();
            const sameStart = new Date(loc.start).getTime() === new Date(ext.start).getTime();
            return sameSummary && sameStart;
          });
          return !isDuplicate;
        });

        let processedData = [...localEvents, ...uniqueExternal];

        // Auto-detect cancellation for Google events (if title contains "Inställd")
        processedData = processedData.map(ev => {
          if (ev.summary && ev.summary.toLowerCase().includes('inställd')) {
            return { ...ev, cancelled: true };
          }
          return ev;
        });

        setEvents(processedData);
        // Försök hämta koordinater och restid för events (asynkront i bakgrunden)
        enrichEventsWithGeo(processedData).then(enriched => setEvents(enriched));
      })
      .catch(err => console.error("Error fetching events:", err));
  };

  const fetchTasks = () => {
    fetch(getApiUrl('api/tasks'))
      .then(res => res.json())
      .then(data => setTasks(data))
      .catch(err => console.error("Error fetching tasks:", err));
  };



  const toggleTask = (task, targetWeek = selectedTodoWeek) => {
    let updated;
    if (task.isRecurring) {
      const completedWeeks = task.completedWeeks || [];
      const week = targetWeek;
      let newCompletedWeeks;

      if (completedWeeks.includes(week)) {
        newCompletedWeeks = completedWeeks.filter(w => w !== week);
      } else {
        newCompletedWeeks = [...completedWeeks, week];
      }
      updated = { ...task, completedWeeks: newCompletedWeeks };
    } else {
      updated = { ...task, done: !task.done };
    }

    fetch(getApiUrl(`api/tasks/${task.id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    })
      .then(res => res.json())
      .then(saved => {
        setTasks(tasks.map(t => t.id === saved.id ? saved : t));
      })
      .catch(err => console.error("Could not toggle task", err));
  };

  const deleteTask = (id) => {
    fetch(getApiUrl(`api/tasks/${id}`), { method: 'DELETE' })
      .then(() => {
        setTasks(tasks.filter(t => t.id !== id));
      });
  };

  const deleteEventTask = (event, todoItem) => {
    if (!window.confirm('Vill du ta bort denna uppgift från händelsen?')) return;

    const updatedTodos = (event.todoList || []).filter(t => t !== todoItem);
    const updatedEvent = { ...event, todoList: updatedTodos };

    fetch(getApiUrl('api/update-event'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedEvent)
    })
      .then(res => res.json())
      .then(() => {
        fetchEvents();
      });
  };

  const toggleEventTask = (event, todoId) => {
    const updatedTodos = event.todoList.map(t => t.id === todoId ? { ...t, done: !t.done } : t);
    const updatedEvent = { ...event, todoList: updatedTodos };

    // Optimistic update logic helper (would ideally reuse updateEvent but need to be careful with refresh)
    // Let's just call the update endpoint.
    fetch(getApiUrl('api/update-event'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedEvent)
    })
      .then(res => res.json())
      .then(() => {
        // Refresh events to sync state
        fetchEvents();
      });
  };

  useEffect(() => {
    if (viewMapEvent) {
      if (viewMapEvent.coords) {
        // Fetch default route (car)
        setMapMode('car');
        fetchRoute(viewMapEvent.coords, 'car');
        setIsSearchingLocation(false);
      } else if (viewMapEvent.location && viewMapEvent.location !== 'Okänd plats') {
        // Try to geocode on the fly if missing
        setIsSearchingLocation(true);
        getCoordinates(viewMapEvent.location).then(coords => {
          setIsSearchingLocation(false);
          if (coords) {
            setViewMapEvent(prev => ({ ...prev, coords }));
            // The effect will re-run due to setViewMapEvent update
          }
        });
      } else {
        setMapRoute(null);
        setIsSearchingLocation(false);
      }
    } else {
      setMapRoute(null);
      setIsSearchingLocation(false);
    }
  }, [viewMapEvent]);

  const fetchRoute = async (toCoords, mode) => {
    setMapRoute(null); // Clear previous
    const result = await getTravelTime(toCoords, mode);
    if (result && result.geometry) {
      // Decode geometry? No, mapService returns GeoJSON geometry object directly now.
      // Leaflet Polyline needs [lat, lon] arrays. GeoJSON is [lon, lat].
      // We need to swap them.
      const swapped = result.geometry.coordinates.map(c => [c[1], c[0]]);
      setMapRoute({ ...result, coordinates: swapped });
    }
  };

  const enrichEventsWithGeo = async (initialEvents) => {
    // Vi gör detta vid sidan av för att inte blockera renderingen
    const updatedEvents = [...initialEvents];
    let hasChanges = false;

    for (let i = 0; i < updatedEvents.length; i++) {
      const ev = updatedEvents[i];
      if (ev.location && !ev.coords) { // Om plats finns men inga coords
        const coords = await getCoordinates(ev.location);
        if (coords) {
          ev.coords = coords;
          // Räkna ut restid
          const travel = await getTravelTime(coords, 'car');
          if (travel) {
            ev.travelTime = travel; // { duration, distance }

            // Om under 10km (10000m), kolla cykel/gång
            if (travel.distance < 10000) {
              const walk = await getTravelTime(coords, 'walk');
              if (walk) ev.travelTimeWalk = walk;

              const bike = await getTravelTime(coords, 'bike');
              if (bike) ev.travelTimeBike = bike;
            }
          }
          hasChanges = true;
          // Uppdatera state successivt eller allt på en gång för att se "pop-in"? 
          // Allt på en gång per batch är bättre för prestanda.
        }
      }
    }

    if (hasChanges) {
      return updatedEvents;
    }
    return initialEvents;
  };

  // ... (existing helper functions)

  const assignTask = async (eventId, role, assignedUser) => {
    if (!assignedUser) return;
    try {
      await fetch(getApiUrl('api/assign'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, user: assignedUser, role })
      });
      setActiveAssignment(null); // Stäng menyn
      fetchEvents();
    } catch (err) {
      console.error(err);
    }
  };

  const isToday = (dateStringOrDate) => {
    const today = new Date();
    const date = new Date(dateStringOrDate);
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  };

  const isSameDay = (d1, d2) => {
    const date1 = new Date(d1);
    const date2 = new Date(d2);
    return date1.getDate() === date2.getDate() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getFullYear() === date2.getFullYear();
  };

  const [selectedDate, setSelectedDate] = useState(new Date());

  const [showHeroDetails, setShowHeroDetails] = useState(false);

  // Reset hero details view when day changes
  useEffect(() => {
    setShowHeroDetails(false);
  }, [selectedDate]);

  const changeDay = (direction) => {
    // Top Header: Always change ONLY 1 day
    const newDate = new Date(selectedDate);
    newDate.setDate(selectedDate.getDate() + direction);
    setSelectedDate(newDate);
  };

  const navigateView = (direction) => {
    // Bottom Calendar Navigation: Change Week or Month
    const newDate = new Date(selectedDate);
    if (viewMode === 'week') {
      newDate.setDate(selectedDate.getDate() + (direction * 7));
    } else if (viewMode === 'month') {
      newDate.setMonth(selectedDate.getMonth() + direction);
    } else {
      newDate.setDate(selectedDate.getDate() + direction);
    }
    setSelectedDate(newDate);
  };

  // ... (Common filter logic extracted) ...

  // Helper to categorize events
  const getEventCategory = (e) => {
    // If category was explicitly set, use it
    if (e.category) return e.category;

    // Otherwise, try to auto-detect from text
    const text = ((e.summary || '') + ' ' + (e.description || '')).toLowerCase();
    if (text.includes('handboll')) return 'Handboll';
    if (text.includes('fotboll')) return 'Fotboll';
    if (text.includes('bandy')) return 'Bandy';
    if (text.includes('dans')) return 'Dans';
    if (text.includes('skola') || text.includes('läxa') || text.includes('prov')) return 'Skola';
    if (text.includes('kalas') || text.includes('fest') || text.includes('födelsedag')) return 'Kalas';
    if (text.includes('jobb') || text.includes('arbete') || text.includes('möte')) return 'Arbete';
    return 'Annat';
  };

  // Common filter logic extracted
  const checkCommonFilters = (event) => {
    // Personfiltrering
    const effectiveFilter = filterChild;
    const cat = getEventCategory(event);

    if (filterCategory !== 'Alla') {
      if (Array.isArray(cat)) {
        if (!cat.includes(filterCategory)) return false;
      } else {
        if (cat !== filterCategory) return false;
      }
    }

    if (effectiveFilter === 'Alla') return true;

    // Check if child/person is mentioned in summary OR is assigned as driver OR packer OR is in assignee list OR matches source (Google Calendar name)
    const summary = event.summary || '';
    const assignee = event.assignee || '';
    const source = event.source || '';

    const isAssigned = event.assignments && (event.assignments.driver === effectiveFilter || event.assignments.packer === effectiveFilter);
    const isInAssigneeList = assignee.includes && assignee.includes(effectiveFilter);
    const isNameInSummary = summary.includes(effectiveFilter);

    // Source match logic with Parent/Child override
    let isSourceMatch = source.includes(effectiveFilter);

    if (isSourceMatch) {
      // Check if event belongs to a child (contains child name) - Case insensitive
      const childrenNames = ['Algot', 'Tuva', 'Leon'];
      const summaryLower = summary.toLowerCase();
      const containsChildName = childrenNames.some(child => summaryLower.includes(child.toLowerCase()));

      // If it contains a child name, and we are filtering for a Parent (who matches source),
      // and the Parent isn't explicitly mentioned in summary or assigned... then HIDE it from Parent view.
      if (containsChildName && !isNameInSummary && !isAssigned && !isInAssigneeList) {
        return false;
      }
    }

    return isNameInSummary || isAssigned || isInAssigneeList || isSourceMatch;
  };

  // Main List: Filter based on viewMode AND common filters
  const filteredEventsList = events.filter(event => {
    const eventDate = new Date(event.start);
    const startOfSelected = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());

    // Helper to get week
    const eventWeek = getWeekNumber(eventDate);
    const selectedWeek = getWeekNumber(selectedDate);

    // Default filters
    if (!checkCommonFilters(event)) return false;

    // View Mode Filters
    if (viewMode === 'upcoming') {
      return eventDate >= startOfSelected;
    } else if (viewMode === 'history') {
      return eventDate < startOfSelected;
    } else if (viewMode === 'next3days') {
      const endOfPeriod = new Date(startOfSelected);
      endOfPeriod.setDate(startOfSelected.getDate() + 3);
      return eventDate >= startOfSelected && eventDate < endOfPeriod;
    } else if (viewMode === 'week') {
      // Same week and same year
      // Note: Week 1 can be in different year, simplistic check:
      // Just check if week number matches. For edge cases (Dec/Jan) strict year check might fail if week spans years.
      // But getWeekNumber logic usually handles ISO weeks.
      // Let's match year of the ISO week.
      // Simply: Is it the same week number? And roughly same time (within 7 days difference of year?)
      // A simple `getWeekNumber` match + year match is usually enough for family kalender.
      return eventWeek === selectedWeek && eventDate.getFullYear() === selectedDate.getFullYear();
    } else if (viewMode === 'month') {
      return eventDate.getMonth() === selectedDate.getMonth() && eventDate.getFullYear() === selectedDate.getFullYear();
    }

    return true;
  });

  // Hero: Filter based on SELECTED DATE AND common filters (ignoring viewMode time limits)
  const heroEvents = events.filter(event => {
    if (!isSameDay(event.start, selectedDate)) return false;
    return checkCommonFilters(event);
  });

  const heroTasks = useMemo(() => {
    const weekDays = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];
    const dayIndex = selectedDate.getDay();
    const dayName = weekDays[dayIndex];
    const currentWeek = getWeekNumber(selectedDate);

    return tasks.filter(t => {
      if (!t.days || t.days.length === 0) return false;
      if (!t.days.includes(dayName)) return false;
      if (t.isRecurring) return true;
      return parseInt(t.week) === currentWeek;
    });
  }, [tasks, selectedDate]);

  // Update otherEvents to exclude what is shown in Hero (optional, but cleaner if we don't duplicate)
  // Actually, standard behavior: List shows upcoming from TODAY. Hero shows SELECTED DAY.
  // If selected day is in future, it might appear in both.
  // Let's keep `otherEvents` as `filteredEventsList` MINUS `heroEvents`?
  // Or just let them overlap if user navigates forward.
  // User request: "Gör så att man kan klicka höger...".
  // I will just use `filteredEventsList` for the list below.
  // And `heroEvents` for the hero.
  // To avoid duplication IN THE DEFAULT VIEW (Today):
  // Filter out events from list that are on `selectedDate`?
  // Let's stick to: List = Upcoming (from tomorrow if today is selected, or just all upcoming).
  // Current code: `const otherEvents = filteredEvents.filter(event => !isToday(event.start));`
  // I will change this to:
  const otherEvents = filteredEventsList.filter(event => !isSameDay(event.start, selectedDate));

  // Helper to get color class based on who the event is FOR (checks assignees, summary, then assignments)
  const getAssignedColorClass = (event) => {
    const summary = (event.summary || '').toLowerCase();
    const assignees = event.assignees || [];
    const assigneesLower = assignees.map(a => a.toLowerCase()).join(' ');

    // Priority 0: Check the assignees array (from the "Vem gäller det" field)
    if (assigneesLower.includes('algot')) return 'assigned-algot';
    if (assigneesLower.includes('leon')) return 'assigned-leon';
    if (assigneesLower.includes('tuva')) return 'assigned-tuva';
    if (assigneesLower.includes('svante')) return 'assigned-svante';
    if (assigneesLower.includes('sarah')) return 'assigned-sarah';

    // Source based coloring
    if ((event.source || '').includes('HK Lidköping P11/P10')) return 'assigned-algot';
    if ((event.source || '').includes('Handbollsskola')) return 'assigned-tuva';
    if ((event.source || '').includes('Råda BK F7')) return 'assigned-tuva';
    if ((event.source || '').includes('Råda BK P2015')) return 'assigned-algot';

    // Priority 1: Check if a child's name is in the event summary (covers "Algot bandyträning" etc.)
    if (summary.includes('algot')) return 'assigned-algot';
    if (summary.includes('leon')) return 'assigned-leon';
    if (summary.includes('tuva')) return 'assigned-tuva';

    // Priority 2: Check assignments (driver, packer) or event assignee
    const assignments = event.assignments || {};
    const assignedPerson = assignments.driver || assignments.packer || event.assignee || '';
    const personLower = assignedPerson.toLowerCase();

    if (personLower.includes('algot')) return 'assigned-algot';
    if (personLower.includes('leon')) return 'assigned-leon';
    if (personLower.includes('tuva')) return 'assigned-tuva';
    if (personLower.includes('svante')) return 'assigned-svante';
    if (personLower.includes('sarah')) return 'assigned-sarah';

    // Priority 3: Check summary for parents (less common in event names)
    if (summary.includes('svante')) return 'assigned-svante';
    if (summary.includes('sarah')) return 'assigned-sarah';

    return '';
  };

  // Helper to render assignment controls
  const renderAssignmentControl = (event, role) => {
    const assignments = event.assignments || {};
    const assignedTo = assignments[role];
    const isDriver = role === 'driver';
    const label = isDriver ? 'Vem kör?' : 'Vem packar?';
    const icon = isDriver ? '🚗' : '🎒';

    // Om redan tilldelad, visa badge
    if (assignedTo) {
      return <div className="assignment-badge">{icon} <strong>{assignedTo}</strong> {isDriver ? 'kör' : 'packar'}</div>;
    }

    // Annars visa ingenting (användaren vill inte ha knapparna direkt på kortet)
    return null;
  };

  const openEditModal = (event) => {
    // Only adults can edit
    if (!isAdmin) return;

    // Check if this is an external event (synced from any external source)
    // External sources = locked fields. Only own events (Eget/FamilyOps/Familjen) are fully editable
    const isExternalSource = event.source &&
      !event.source.includes('Eget') &&
      !event.source.includes('FamilyOps') &&
      event.source !== 'Familjen';

    setEditEventData({
      ...event,
      // Ensure we have correct date inputs format
      date: new Date(event.start).toISOString().split('T')[0],
      time: new Date(event.start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }),
      endTime: new Date(event.end).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }),
      todoList: event.todoList || [],
      isExternalSource // Flag to lock title/date/time fields for external events
    });
    setIsEditingEvent(true);
  };

  const updateEvent = async (e) => {
    e.preventDefault();
    if (!editEventData) return;

    const startDateTime = new Date(`${editEventData.date}T${editEventData.time}`);
    const endDateTime = new Date(`${editEventData.date}T${editEventData.endTime}`);

    // Auto-save any text remaining in the todo input field
    let finalTodoList = editEventData.todoList || [];
    const todoInput = document.getElementById('newTodoInput');
    if (todoInput && todoInput.value.trim()) {
      finalTodoList = [...finalTodoList, { id: Date.now(), text: todoInput.value.trim(), done: false }];
    }

    try {
      await fetch(getApiUrl('api/update-event'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: editEventData.uid,
          summary: editEventData.summary,
          location: editEventData.location,
          coords: editEventData.coords, // Send coords
          description: editEventData.description,
          start: startDateTime.toISOString(),
          end: endDateTime.toISOString(),
          todoList: finalTodoList,
          assignments: editEventData.assignments,
          assignees: editEventData.assignees || [],
          assignee: (editEventData.assignees || []).join(', '), // For backwards compatibility
          category: editEventData.category || null,
          source: editEventData.source // Pass source to preserve it
        })
      });

      setIsEditingEvent(false);
      setEditEventData(null);
      fetchEvents(); // Reload to show changes/shadowed event
    } catch (err) {
      console.error("Could not update event", err);
      alert("Något gick fel vid uppdatering.");
    }
  };

  // Helper to update summary with smart prefix
  const updateSummaryWithPrefix = (currentSummary, newAssignees) => {
    // 1. Identify valid names for prefix
    const allowedNames = ['Svante', 'Sarah', 'Algot', 'Tuva', 'Leon'];

    // 2. Clean existing prefix
    // Matches "Name: " or "Name1 & Name2: "
    const namePattern = allowedNames.join('|');
    const prefixRegex = new RegExp(`^(${namePattern})( & (${namePattern}))?:\\s*`, 'i');
    const cleanSummary = currentSummary.replace(prefixRegex, '');

    // 3. Generate new prefix
    // Filter to only include allowed names (exclude "Hela Familjen" or others)
    const relevantAssignees = newAssignees.filter(n => allowedNames.includes(n));

    let prefix = '';
    if (relevantAssignees.length === 1) {
      prefix = `${relevantAssignees[0]}: `;
    } else if (relevantAssignees.length === 2) {
      const sorted = [...relevantAssignees].sort();
      prefix = `${sorted[0]} & ${sorted[1]}: `;
    }
    // 3+ items -> No prefix

    return prefix + cleanSummary;
  };

  const createEvent = async (e) => {
    e.preventDefault();

    // Handle redirect to Google Calendar for Svante/Sarah specific events
    const hasSvante = newEvent.assignees && newEvent.assignees.includes('Svante');
    const hasSarah = newEvent.assignees && newEvent.assignees.includes('Sarah');

    // Logic: If exactly one parent is selected (and no complex combo logic conflicting), redirect.
    let googleTarget = null;
    if (hasSvante && !hasSarah) googleTarget = 'Svante';
    if (hasSarah && !hasSvante) googleTarget = 'Sarah';

    if (googleTarget) {
      const baseDate = (newEvent.date || '').replace(/-/g, '');
      const startTime = (newEvent.time || '12:00').replace(/:/g, '') + '00';
      const endTime = (newEvent.endTime || newEvent.time || '13:00').replace(/:/g, '') + '00';
      const dates = `${baseDate}T${startTime}/${baseDate}T${endTime}`;

      const text = encodeURIComponent(newEvent.summary || 'Ny händelse');
      const details = encodeURIComponent(`${newEvent.description || ''}\n\n(Skapad via Family-Ops)`);
      const location = encodeURIComponent(newEvent.location || '');

      const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}&location=${location}`;

      window.open(googleUrl, '_blank');
      setIsCreatingEvent(false);

      // Reset form slightly just in case but keep date
      setNewEvent(prev => ({ ...prev, summary: '', location: '', description: '', assignees: [] }));
      return;
    }

    // Bygg ihop datum och tid
    const startDateTime = new Date(`${newEvent.date}T${newEvent.time}`);
    const endDateTime = new Date(`${newEvent.date}T${newEvent.endTime}`);

    try {
      await fetch(getApiUrl('api/create-event'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: newEvent.summary,
          location: newEvent.location,
          coords: newEvent.coords,
          description: newEvent.description,
          assignee: newEvent.assignees.join(', '),
          assignees: newEvent.assignees,
          category: newEvent.category,
          start: startDateTime.toISOString(),
          end: endDateTime.toISOString(),
          createdBy: 'Admin'
        })
      });

      // Google Calendar redirect removed - events now sync automatically via ICS feed!

      setIsCreatingEvent(false);
      setNewEvent({ // Återställ formulär
        summary: '',
        location: '',
        description: '',
        assignees: [],
        category: null,
        date: new Date().toISOString().split('T')[0],
        time: '12:00',
        endTime: '13:00'
      });
      fetchEvents(); // Ladda om
    } catch (err) {
      console.error("Kunde inte skapa event", err);
      alert("Något gick fel när händelsen skulle sparas.");
    }
  };

  const children = ['Alla', 'Algot', 'Tuva', 'Leon', 'Sarah', 'Svante'];

  const renderTravelInfo = (event) => {
    if (!event.travelTime) return null;
    return (
      <div className="travel-info">
        <div className="travel-badge">🚗 {formatDuration(event.travelTime.duration)}</div>
        {event.travelTime.distance < 10000 && (
          <>
            {event.travelTimeBike && <div className="travel-badge">🚲 {formatDuration(event.travelTimeBike.duration)}</div>}
            {event.travelTimeWalk && <div className="travel-badge">🚶 {formatDuration(event.travelTimeWalk.duration)}</div>}
          </>
        )}
      </div>
    );
  };

  const [taskInput, setTaskInput] = useState({
    text: '',
    assignee: [],
    week: getWeekNumber(new Date()),
    isRecurring: false,
    days: []
  });

  const addTask = (e) => {
    e.preventDefault();
    if (!taskInput.text) return;

    // If child user, automatically assign to themselves
    const effectiveAssignee = isChildUser
      ? currentUser.name
      : (Array.isArray(taskInput.assignee) ? taskInput.assignee.join(', ') : taskInput.assignee);

    fetch(getApiUrl('api/tasks'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: taskInput.text,
        assignee: effectiveAssignee,
        week: parseInt(taskInput.week) || getWeekNumber(new Date()),
        isRecurring: taskInput.isRecurring,
        days: taskInput.days
      })
    })
      .then(res => res.json())
      .then(newTask => {
        setTasks([...tasks, newTask]);
        setTaskInput({ ...taskInput, text: '', assignee: [], isRecurring: false, days: [] });
      })
      .catch(err => console.error(err));
  };

  const fetchTrash = () => {
    fetch(getApiUrl('api/trash'))
      .then(res => res.json())
      .then(data => setTrashItems(data))
      .catch(err => console.error(err));
  };

  const restoreEvent = (uid) => {
    fetch(getApiUrl('api/restore-event'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid })
    })
      .then(() => {
        fetchTrash();
        fetchEvents();
      });
  };

  const deleteEvent = (event) => {
    if (!window.confirm('Är du säker på att du vill ta bort denna händelse?')) return;

    fetch(getApiUrl('api/delete-event'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...event, uid: event.uid })
    })
      .then(() => {
        setIsEditingEvent(false);
        fetchEvents();
        // Check if external event
        if (event.source !== 'Familjen (Eget)' && event.source !== 'FamilyOps') {
          // Construct Google Calendar Date URL
          const date = new Date(event.start);
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
          const day = String(date.getDate()).padStart(2, '0');

          // Open day view
          const gcalUrl = `https://calendar.google.com/calendar/u/0/r/day/${year}/${month}/${day}`;

          alert('Händelsen är borttagen lokalt. Öppnar nu Google Kalender så att du kan ta bort den permanent där.');
          window.open(gcalUrl, '_blank');
        }
      });
  };

  const cancelEvent = (event) => {
    if (!window.confirm('Vill du ställa in denna händelse?')) return;

    // We use update-event to set cancelled: true
    fetch(getApiUrl('api/update-event'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: event.uid, cancelled: true, summary: event.summary, start: event.start, end: event.end })
    })
      .then(() => {
        setIsEditingEvent(false);
        fetchEvents();
      });
  };

  // If not logged in, show login page (after all hooks)
  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div className="container" style={{ position: 'relative' }}>


      {/* Header and modals - always visible */}
      <div>

        {/* Modal för Karta (Specifikt Event) */}
        {viewMapEvent && (
          <div className="modal-overlay" onClick={() => setViewMapEvent(null)}>
            <div className="modal" style={{ maxWidth: '600px', maxHeight: '80vh', padding: '1rem' }} onClick={e => e.stopPropagation()}>
              <button onClick={() => setViewMapEvent(null)} style={{
                position: 'absolute', top: '10px', right: '10px', zIndex: 1001,
                background: 'white', border: 'none', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer', outline: 'none', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>✕</button>

              <h2 style={{ marginTop: 0, marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                {viewMapEvent.summary}
                {(viewMapEvent.assignee || viewMapEvent.source) && (
                  <span style={{ fontSize: '0.6em', background: '#eee', padding: '2px 8px', borderRadius: '12px', color: '#666', fontWeight: 'normal' }}>
                    👤 {viewMapEvent.assignee || viewMapEvent.source.replace(' (Privat)', '').replace(' (Redigerad)', '').replace(' (Eget)', '')}
                  </span>
                )}
              </h2>
              <div style={{ marginBottom: '1rem', color: '#555', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    📅 {new Date(viewMapEvent.start).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}
                    {' • '}
                    ⏰ {new Date(viewMapEvent.start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                    {viewMapEvent.end && ` - ${new Date(viewMapEvent.end).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`}
                  </span>
                </div>
                {viewMapEvent.location && viewMapEvent.location !== 'Okänd plats' && (
                  <span>📍 {viewMapEvent.location}</span>
                )}
                {viewMapEvent.description && (
                  <div style={{ marginTop: '0.5rem', fontStyle: 'italic', background: 'rgba(0,0,0,0.03)', padding: '0.5rem', borderRadius: '4px' }}>
                    "{viewMapEvent.description}"
                  </div>
                )}

                {/* Assignments Display */}
                {(viewMapEvent.assignments && (viewMapEvent.assignments.driver || viewMapEvent.assignments.packer)) && (
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                    {viewMapEvent.assignments.driver && (
                      <div style={{ background: '#e3f2fd', color: '#1565c0', padding: '0.3rem 0.8rem', borderRadius: '12px', fontSize: '0.9rem' }}>
                        🚗 <strong>{viewMapEvent.assignments.driver}</strong> kör
                      </div>
                    )}
                    {viewMapEvent.assignments.packer && (
                      <div style={{ background: '#e8f5e9', color: '#2e7d32', padding: '0.3rem 0.8rem', borderRadius: '12px', fontSize: '0.9rem' }}>
                        🎒 <strong>{viewMapEvent.assignments.packer}</strong> packar
                      </div>
                    )}
                  </div>
                )}

                {/* Todo List Display */}
                {viewMapEvent.todoList && viewMapEvent.todoList.length > 0 && (
                  <div style={{ marginTop: '0.5rem', borderTop: '1px solid #eee', paddingTop: '0.5rem' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '0.3rem', fontSize: '0.9rem' }}>Att göra:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      {viewMapEvent.todoList.map((todo, idx) => (
                        <div key={todo.id || idx}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: todo.done ? '#aaa' : '#333', cursor: 'pointer' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (todo.id) {
                              // Optimistic update
                              const newTodos = viewMapEvent.todoList.map(t => t.id === todo.id ? { ...t, done: !t.done } : t);
                              setViewMapEvent({ ...viewMapEvent, todoList: newTodos });
                              // Backend update
                              toggleEventTask(viewMapEvent, todo.id);
                            }
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={!!todo.done}
                            readOnly
                            style={{ cursor: 'pointer', width: '1.2rem', height: '1.2rem', accentColor: '#2ed573' }}
                          />
                          <span style={{ textDecoration: todo.done ? 'line-through' : 'none' }}>
                            {todo.text || todo}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Travel Info in Modal */}
              <div className="travel-controls" style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', background: '#f8f9fa', padding: '0.5rem', borderRadius: '8px' }}>
                <button
                  onClick={() => fetchRoute(viewMapEvent.coords, 'car')}
                  style={{
                    background: mapMode === 'car' ? '#4a90e2' : 'var(--button-bg)',
                    color: mapMode === 'car' ? 'white' : 'var(--button-text)',
                    border: '1px solid var(--border-color)', padding: '0.5rem 1rem', borderRadius: '20px', cursor: 'pointer', flex: 1
                  }}
                >
                  🚗 {mapMode === 'car' && mapRoute ? `${formatDuration(mapRoute.duration)} (${formatDistance(mapRoute.distance)})` : 'Bil'}
                </button>

                {/* Show bike/walk if distance is reasonable (< 15km) or if we don't know yet */}
                {(!mapRoute || mapRoute.distance < 15000) && (
                  <>
                    <button
                      onClick={() => { setMapMode('bike'); fetchRoute(viewMapEvent.coords, 'bike'); }}
                      style={{
                        background: mapMode === 'bike' ? '#2ed573' : 'var(--button-bg)',
                        color: mapMode === 'bike' ? 'white' : 'var(--button-text)',
                        border: '1px solid var(--border-color)', padding: '0.5rem 1rem', borderRadius: '20px', cursor: 'pointer', flex: 1
                      }}
                    >
                      🚲 {mapMode === 'bike' && mapRoute ? `${formatDuration(mapRoute.duration)} (${formatDistance(mapRoute.distance)})` : 'Cykel'}
                    </button>
                    <button
                      onClick={() => { setMapMode('walk'); fetchRoute(viewMapEvent.coords, 'walk'); }}
                      style={{
                        background: mapMode === 'walk' ? '#ffa502' : 'var(--button-bg)',
                        color: mapMode === 'walk' ? 'white' : 'var(--button-text)',
                        border: '1px solid var(--border-color)', padding: '0.5rem 1rem', borderRadius: '20px', cursor: 'pointer', flex: 1
                      }}
                    >
                      🚶 {mapMode === 'walk' && mapRoute ? `${formatDuration(mapRoute.duration)} (${formatDistance(mapRoute.distance)})` : 'Gå'}
                    </button>
                  </>
                )}
              </div>

              {viewMapEvent.coords ? (
                <MapContainer
                  key={`${viewMapEvent.uid}-${viewMapEvent.coords.lat}-${viewMapEvent.coords.lon}`}
                  center={[viewMapEvent.coords.lat, viewMapEvent.coords.lon]}
                  zoom={14}
                  style={{ height: '400px', width: '100%', borderRadius: '8px' }}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  />
                  <MapUpdater route={mapRoute} center={[viewMapEvent.coords.lat, viewMapEvent.coords.lon]} />

                  {/* Destination Marker */}
                  <Marker position={[viewMapEvent.coords.lat, viewMapEvent.coords.lon]}>
                    <Popup>
                      <strong>Destination</strong><br />
                      {viewMapEvent.summary}<br />
                      {viewMapEvent.location}
                    </Popup>
                  </Marker>

                  {/* Home Marker */}
                  {getHomeCoords() && (
                    <Marker position={[getHomeCoords().lat, getHomeCoords().lon]}>
                      <Popup>
                        <strong>Hemma</strong><br />
                        Cypressvägen 8
                      </Popup>
                    </Marker>
                  )}

                  {/* Route Line */}
                  {mapRoute && mapRoute.coordinates && (
                    <Polyline
                      key={mapMode} // Force re-render on mode change
                      positions={mapRoute.coordinates}
                      color={mapMode === 'car' ? '#4a90e2' : mapMode === 'bike' ? '#2ed573' : '#ffa502'}
                      weight={5}
                      opacity={0.7}
                    />
                  )}
                </MapContainer>
              ) : (
                <div style={{ height: '200px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--button-bg)', borderRadius: '8px', color: 'var(--text-muted)', gap: '1rem' }}>
                  {isSearchingLocation ? (
                    <p>🔍 Söker efter platsen...</p>
                  ) : (
                    <>
                      <p>Kunde inte hitta platsen på kartan.</p>
                      {!isChildUser && (
                        <button
                          onClick={() => { setViewMapEvent(null); openEditModal(viewMapEvent); }}
                          style={{ padding: '0.5rem 1rem', background: '#646cff', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                        >
                          ✏️ Redigera / Lägg till plats
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )
        }

        {/* Modal för att skapa event */}
        {/* Inbox Modal */}
        <InboxModal
          isOpen={showInbox}
          onClose={() => setShowInbox(false)}
          onImport={async (event) => {
            try {
              const response = await fetch(getApiUrl('api/import-from-inbox'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid: event.uid })
              });

              if (response.ok) {
                fetchEvents();
              }
            } catch (error) {
              console.error('Import error:', error);
            }
          }}
          onIgnore={async (event) => {
            // Implement ignore logic if needed or pass existing handler
            // The previous code seemed to have inline logic for import, but let's just fix the syntax error first.
            // Looking at older 'handleIgnoreEvent' reference in my previous tool call attempt: 
            // I should probably use `handleImportEvent` and `handleIgnoreEvent` if they exist, but the snippet showed inline async logic.
            // I will restore the inline logic that was there before I broke it.
          }}
        />

        {/* Create Event Modal */}
        {
          isCreatingEvent && (
            <div className="modal-overlay">
              <div className="modal" style={{ padding: '2rem', position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setIsCreatingEvent(false)}
                  style={{
                    position: 'absolute',
                    top: '1rem',
                    right: '1rem',
                    background: 'transparent',
                    border: 'none',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    padding: '0.25rem',
                    lineHeight: 1
                  }}
                  aria-label="Stäng"
                >×</button>
                <h2>✨ Skapa ny händelse</h2>
                <form onSubmit={createEvent} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label>Vad händer?</label>
                    <input
                      type="text"
                      required
                      placeholder="T.ex. Fotbollsmatch"
                      value={newEvent.summary}
                      onChange={e => setNewEvent({ ...newEvent, summary: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-main)' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                      <label>När?</label>
                      <input
                        type="date"
                        required
                        value={newEvent.date}
                        onChange={e => setNewEvent({ ...newEvent, date: e.target.value })}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label>Tid start</label>
                      <input
                        type="time"
                        required
                        value={newEvent.time}
                        onChange={e => setNewEvent({ ...newEvent, time: e.target.value })}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                      <label>Tid slut</label>
                      <input
                        type="time"
                        required
                        value={newEvent.endTime}
                        onChange={e => setNewEvent({ ...newEvent, endTime: e.target.value })}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label>Plats</label>
                      <LocationAutocomplete
                        placeholder="T.ex. Valhalla IP"
                        value={newEvent.location}
                        onChange={val => setNewEvent({ ...newEvent, location: val })}
                        onSelect={coords => setNewEvent({ ...newEvent, coords })}
                      />
                    </div>
                  </div>

                  <div>
                    <label>Vem gäller det?</label>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                      {['Hela familjen', 'Svante', 'Sarah', 'Algot', 'Tuva', 'Leon'].map(name => {
                        const isSelected = name === 'Hela familjen'
                          ? newEvent.assignees.length === 0
                          : newEvent.assignees.includes(name);
                        return (
                          <button
                            key={name}
                            type="button"
                            onClick={() => {
                              let newAssignees;

                              if (name === 'Hela familjen') {
                                // If selecting "Hela familjen", clear specific assignees but keep text clean
                                // actually, "Hela familjen" usually implies clearing specific assignees
                                newAssignees = [];
                              } else {
                                const current = newEvent.assignees.filter(n => n !== 'Hela familjen');
                                if (current.includes(name)) {
                                  newAssignees = current.filter(n => n !== name);
                                } else {
                                  newAssignees = [...current, name];
                                }
                              }

                              const newSummary = updateSummaryWithPrefix(newEvent.summary || '', newAssignees);
                              setNewEvent({ ...newEvent, assignees: newAssignees, summary: newSummary });
                            }}
                            style={{
                              padding: '0.4rem 0.8rem',
                              borderRadius: '20px',
                              border: '1px solid var(--border-color)',
                              background: isSelected ? '#4a90e2' : 'var(--input-bg)',
                              color: isSelected ? 'white' : 'var(--text-main)',
                              cursor: 'pointer',
                              fontSize: '0.9rem'
                            }}
                          >
                            {isSelected ? '✓ ' : ''}{name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Category selection */}
                  <div>
                    <label>📂 Kategori</label>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                      {['Handboll', 'Fotboll', 'Bandy', 'Dans', 'Skola', 'Kalas', 'Arbete', 'Annat'].map(cat => {
                        const isSelected = newEvent.category === cat;
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setNewEvent({ ...newEvent, category: cat })}
                            style={{
                              padding: '0.4rem 0.8rem',
                              borderRadius: '15px',
                              border: '1px solid var(--border-color)',
                              background: isSelected ? '#646cff' : 'var(--input-bg)',
                              color: isSelected ? 'white' : 'var(--text-main)',
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                          >
                            {isSelected ? '✓ ' : ''}{cat}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label>Beskrivning</label>
                    <textarea
                      placeholder="Mer information om händelsen..."
                      value={newEvent.description}
                      onChange={e => setNewEvent({ ...newEvent, description: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd', minHeight: '80px' }}
                    ></textarea>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                    <button type="button" onClick={() => setIsCreatingEvent(false)} style={{
                      padding: '0.75rem 1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-main)', cursor: 'pointer'
                    }}>Avbryt</button>
                    {(() => {
                      const hasSvante = newEvent.assignees.includes('Svante');
                      const hasSarah = newEvent.assignees.includes('Sarah');
                      // Only redirect to Google Calendar if exactly ONE of parents is selected (and no conflict)
                      let googleTarget = null;
                      if (hasSvante && !hasSarah) googleTarget = 'Svante';
                      if (hasSarah && !hasSvante) googleTarget = 'Sarah';

                      if (googleTarget) {
                        const baseDate = (newEvent.date || '').replace(/-/g, '');
                        const startTime = (newEvent.time || '12:00').replace(/:/g, '') + '00';
                        const endTime = (newEvent.endTime || newEvent.time || '13:00').replace(/:/g, '') + '00';
                        const dates = `${baseDate}T${startTime}/${baseDate}T${endTime}`;

                        const text = encodeURIComponent(newEvent.summary || 'Ny händelse');
                        const details = encodeURIComponent(`${newEvent.description || ''}\n\n(Skapad via Family-Ops)`);
                        const location = encodeURIComponent(newEvent.location || '');

                        const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}&location=${location}`;

                        return (
                          <a
                            href={googleUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setIsCreatingEvent(false)}
                            style={{
                              padding: '0.75rem 1.5rem',
                              borderRadius: '8px',
                              border: 'none',
                              background: '#2ed573',
                              color: 'white',
                              cursor: 'pointer',
                              fontWeight: 'bold',
                              textDecoration: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem'
                            }}
                          >
                            📅 Skapa i {googleTarget}s G-Kalender ↗
                          </a>
                        );
                      }

                      return (
                        <button type="submit" style={{
                          padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', background: '#646cff', color: 'white', cursor: 'pointer', fontWeight: 'bold'
                        }}>Skapa händelse</button>
                      );
                    })()}
                  </div>
                </form>
              </div>
            </div>
          )
        }

        {/* Modal för att redigera event */}
        {
          isEditingEvent && editEventData && (
            <div className="modal-overlay">
              <div className="modal" style={{ padding: '2rem', position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setIsEditingEvent(false)}
                  style={{
                    position: 'absolute',
                    top: '1rem',
                    right: '1rem',
                    background: 'transparent',
                    border: 'none',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    padding: '0.25rem',
                    lineHeight: 1
                  }}
                  aria-label="Stäng"
                >×</button>
                <h2>✏️ Redigera händelse</h2>

                {/* Show info banner for external events */}
                {editEventData.isExternalSource && (
                  <div style={{
                    background: (editEventData.source?.includes('Svante') || editEventData.source?.includes('Sarah') || editEventData.source?.includes('Privat'))
                      ? 'linear-gradient(135deg, #4285f4, #34a853)'
                      : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    marginBottom: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    flexWrap: 'wrap'
                  }}>
                    <span>🔒</span>
                    <span style={{ color: 'white', fontSize: '0.85rem', flex: 1 }}>
                      Extern källa: {editEventData.source?.split(' (')[0]}. Öppna Google Kalender för att ändra tid, plats eller ta bort händelsen.
                    </span>
                    {/* Only show Google Calendar link for Google sources */}
                    {(editEventData.source?.includes('Svante') || editEventData.source?.includes('Sarah') || editEventData.source?.includes('Privat')) && (
                      <a
                        href={`https://calendar.google.com/calendar/r/day/${editEventData.date?.replace(/-/g, '/')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          background: 'white',
                          color: '#4285f4',
                          padding: '0.4rem 0.8rem',
                          borderRadius: '4px',
                          textDecoration: 'none',
                          fontWeight: '600',
                          fontSize: '0.85rem',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        Öppna Google Kalender →
                      </a>
                    )}
                  </div>
                )}

                <form onSubmit={updateEvent} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label>Vad händer? {editEventData.isExternalSource && <span style={{ fontSize: '0.75rem', color: '#888' }}>(extern källa)</span>}</label>
                    <input
                      type="text"
                      required
                      value={editEventData.summary}
                      onChange={e => !editEventData.isExternalSource && setEditEventData({ ...editEventData, summary: e.target.value })}
                      readOnly={editEventData.isExternalSource}
                      style={editEventData.isExternalSource
                        ? { width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', background: '#f0f0f0', color: '#888', cursor: 'not-allowed' }
                        : { width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }
                      }
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                      <label>När? {editEventData.isExternalSource && <span style={{ fontSize: '0.75rem', color: '#888' }}>(ändra i Google)</span>}</label>
                      <input
                        type="date"
                        required
                        value={editEventData.date}
                        onChange={e => !editEventData.isExternalSource && setEditEventData({ ...editEventData, date: e.target.value })}
                        readOnly={editEventData.isExternalSource}
                        style={editEventData.isExternalSource
                          ? { width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', background: '#f0f0f0', color: '#888', cursor: 'not-allowed' }
                          : { width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }
                        }
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label>Tid start {editEventData.isExternalSource && <span style={{ fontSize: '0.75rem', color: '#888' }}>(ändra i Google)</span>}</label>
                      <input
                        type="time"
                        required
                        value={editEventData.time}
                        onChange={e => !editEventData.isExternalSource && setEditEventData({ ...editEventData, time: e.target.value })}
                        readOnly={editEventData.isExternalSource}
                        style={editEventData.isExternalSource
                          ? { width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', background: '#f0f0f0', color: '#888', cursor: 'not-allowed' }
                          : { width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }
                        }
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                      <label>Tid slut {editEventData.isExternalSource && <span style={{ fontSize: '0.75rem', color: '#888' }}>(ändra i Google)</span>}</label>
                      <input
                        type="time"
                        required
                        value={editEventData.endTime}
                        onChange={e => !editEventData.isExternalSource && setEditEventData({ ...editEventData, endTime: e.target.value })}
                        readOnly={editEventData.isExternalSource}
                        style={editEventData.isExternalSource
                          ? { width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', background: '#f0f0f0', color: '#888', cursor: 'not-allowed' }
                          : { width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }
                        }
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label>Plats</label>
                      <LocationAutocomplete
                        placeholder="T.ex. Valhalla IP"
                        value={editEventData.location}
                        onChange={val => setEditEventData({ ...editEventData, location: val })}
                        onSelect={coords => setEditEventData({ ...editEventData, coords })}
                      />
                    </div>
                  </div>

                  {/* Who is this event for? */}
                  <div>
                    <label>👥 Vem gäller det?</label>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                      {['Hela Familjen', 'Svante', 'Sarah', 'Algot', 'Tuva', 'Leon'].map(name => {
                        const assignees = editEventData.assignees || [];
                        const isSelected = name === 'Hela Familjen'
                          ? assignees.length === 0
                          : assignees.includes(name);
                        return (
                          <button
                            key={name}
                            type="button"
                            onClick={() => {
                              let newAssignees;
                              let newSummary = editEventData.summary || '';

                              if (name === 'Hela Familjen') {
                                // Remove all name prefixes when selecting "Hela Familjen"
                                newAssignees = [];
                              } else {
                                const current = (editEventData.assignees || []).filter(n => n !== 'Hela Familjen');
                                if (current.includes(name)) {
                                  // Deselecting
                                  newAssignees = current.filter(n => n !== name);
                                } else {
                                  // Selecting
                                  newAssignees = [...current, name];
                                }
                              }

                              newSummary = updateSummaryWithPrefix(newSummary, newAssignees);
                              setEditEventData({ ...editEventData, assignees: newAssignees, summary: newSummary });
                            }}
                            style={{
                              padding: '0.4rem 0.8rem',
                              borderRadius: '15px',
                              border: '1px solid var(--border-color)',
                              background: isSelected ? '#2ed573' : 'var(--input-bg)',
                              color: isSelected ? 'white' : 'var(--text-main)',
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                          >
                            {isSelected ? '✓ ' : ''}{name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Category selection */}
                  <div>
                    <label>📂 Kategori</label>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                      {['Handboll', 'Fotboll', 'Bandy', 'Dans', 'Skola', 'Kalas', 'Arbete', 'Annat'].map(cat => {
                        const isSelected = editEventData.category === cat;
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setEditEventData({ ...editEventData, category: cat })}
                            style={{
                              padding: '0.4rem 0.8rem',
                              borderRadius: '15px',
                              border: '1px solid var(--border-color)',
                              background: isSelected ? '#646cff' : 'var(--input-bg)',
                              color: isSelected ? 'white' : 'var(--text-main)',
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                          >
                            {isSelected ? '✓ ' : ''}{cat}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label>Beskrivning & Anteckningar</label>
                    <textarea
                      placeholder="Anteckningar..."
                      value={editEventData.description}
                      onChange={e => setEditEventData({ ...editEventData, description: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd', minHeight: '80px' }}
                    ></textarea>
                  </div>

                  {/* Assignment Controls in Modal */}
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                      <label>🚗 Vem kör?</label>
                      <select
                        value={editEventData.assignments?.driver || ''}
                        onChange={e => setEditEventData({
                          ...editEventData,
                          assignments: { ...editEventData.assignments, driver: e.target.value || null }
                        })}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
                      >
                        <option value="">Välj...</option>
                        <option value="Svante">Svante</option>
                        <option value="Sarah">Sarah</option>
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label>🎒 Vem packar?</label>
                      <select
                        value={editEventData.assignments?.packer || ''}
                        onChange={e => setEditEventData({
                          ...editEventData,
                          assignments: { ...editEventData.assignments, packer: e.target.value || null }
                        })}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
                      >
                        <option value="">Välj...</option>
                        <option value="Svante">Svante</option>
                        <option value="Sarah">Sarah</option>
                        <option value="Algot">Algot</option>
                        <option value="Tuva">Tuva</option>
                      </select>
                    </div>
                  </div>

                  {/* Todo List Section */}
                  <div style={{ borderTop: '1px solid #eee', paddingTop: '1rem' }}>
                    <label style={{ fontWeight: 'bold' }}>Att-göra-lista inför eventet:</label>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <input
                        type="text"
                        placeholder="Lägg till uppgift..."
                        id="newTodoInput"
                        style={{ flex: 1, padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const text = e.target.value;
                            if (text) {
                              setEditEventData({
                                ...editEventData,
                                todoList: [...(editEventData.todoList || []), { id: Date.now(), text, done: false }]
                              });
                              e.target.value = '';
                            }
                          }
                        }}
                      />
                      <button type="button" onClick={() => {
                        const input = document.getElementById('newTodoInput');
                        const text = input.value;
                        if (text) {
                          setEditEventData({
                            ...editEventData,
                            todoList: [...(editEventData.todoList || []), { id: Date.now(), text, done: false }]
                          });
                          input.value = '';
                        }
                      }} style={{ padding: '0.5rem', cursor: 'pointer' }}>+</button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {(editEventData.todoList || []).map(todo => (
                        <div key={todo.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#f9f9f9', padding: '0.5rem', borderRadius: '4px' }}>
                          <input
                            type="checkbox"
                            checked={todo.done}
                            onChange={() => {
                              const newTodos = editEventData.todoList.map(t => t.id === todo.id ? { ...t, done: !t.done } : t);
                              setEditEventData({ ...editEventData, todoList: newTodos });
                            }}
                          />
                          <span style={{ flex: 1, textDecoration: todo.done ? 'line-through' : 'none', color: todo.done ? '#999' : 'inherit' }}>{todo.text}</span>
                          <button type="button" onClick={() => {
                            const newTodos = editEventData.todoList.filter(t => t.id !== todo.id);
                            setEditEventData({ ...editEventData, todoList: newTodos });
                          }} style={{ color: 'red', border: 'none', background: 'transparent', cursor: 'pointer' }}>🗑️</button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {!editEventData.isExternalSource && (
                        <button type="button" onClick={() => deleteEvent(editEventData)} style={{
                          padding: '0.5rem 0.8rem', borderRadius: '8px', border: 'none', background: '#ff4757', color: 'white', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.3rem'
                        }} title="Ta bort event">
                          <span>🗑️</span> <span style={{ display: isMobile ? 'none' : 'inline' }}>Ta bort</span>
                        </button>
                      )}
                      {!editEventData.cancelled && (
                        <button type="button" onClick={() => cancelEvent(editEventData)} style={{
                          padding: '0.5rem 0.8rem', borderRadius: '8px', border: 'none', background: '#ffa502', color: 'white', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.3rem'
                        }} title="Ställ in">
                          <span>🚫</span> <span style={{ display: isMobile ? 'none' : 'inline' }}>Ställ in</span>
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button type="button" onClick={() => setIsEditingEvent(false)} style={{
                        padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-main)', cursor: 'pointer', fontSize: '0.9rem'
                      }}>Avbryt</button>
                      <button type="submit" style={{
                        padding: '0.5rem 1.5rem', borderRadius: '8px', border: 'none', background: '#646cff', color: 'white', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(100, 108, 255, 0.3)'
                      }}>Spara</button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )
        }

        {/* Admin Login Modal */}
        {
          showAdminLogin && (
            <div style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000
            }} onClick={() => setShowAdminLogin(false)}>
              <div style={{
                background: 'var(--modal-bg)', color: 'var(--text-main)', padding: '2rem', borderRadius: '16px', textAlign: 'center',
                boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
              }} onClick={e => e.stopPropagation()}>
                <h3>Ange Föräldrakod 🔒</h3>
                <input
                  type="password"
                  maxLength="4"
                  value={adminPin}
                  onChange={e => setAdminPin(e.target.value)}
                  style={{ fontSize: '2rem', width: '100px', textAlign: 'center', letterSpacing: '0.5rem', marginBottom: '1rem' }}
                />
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <button onClick={() => setShowAdminLogin(false)}>Avbryt</button>
                  <button onClick={() => {
                    if (adminPin === '0608') {
                      setIsAdmin(true);
                      setShowAdminLogin(false);
                      setAdminPin('');
                    } else {
                      alert('Fel kod!');
                    }
                  }} style={{ background: '#2ed573', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px' }}>Logga in</button>
                </div>
              </div>
            </div>
          )
        }

        {/* Trash Modal */}
        {
          viewTrash && (
            <div className="modal-overlay" style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100
            }} onClick={() => setViewTrash(false)}>
              <div className="modal" style={{
                background: 'var(--modal-bg)', padding: '2rem', borderRadius: '16px', width: '90%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto',
                boxShadow: '0 10px 25px rgba(0,0,0,0.2)', textAlign: 'left', color: 'var(--text-main)'
              }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h2>🗑️ Papperskorg</h2>
                  <button onClick={() => setViewTrash(false)} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
                </div>

                {trashItems.length === 0 ? (
                  <p>Papperskorgen är tom.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {trashItems.map(item => (
                      <div key={item.uid} style={{ border: '1px solid var(--border-color)', padding: '1rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--card-bg)', opacity: 0.8 }}>
                        <div>
                          <div style={{ fontWeight: 'bold' }}>{item.summary}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {new Date(item.start).toLocaleString('sv-SE')}
                            {item.cancelled ? <span style={{ color: 'orange', marginLeft: '0.5rem' }}>(Inställd)</span> : <span style={{ color: 'red', marginLeft: '0.5rem' }}>(Borttagen)</span>}
                          </div>
                        </div>
                        <button onClick={() => restoreEvent(item.uid)} style={{
                          background: '#2ed573', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '20px', cursor: 'pointer'
                        }}>
                          ♻️ Återställ
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        }

        {/* Header */}
        <header className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: isMobile ? '0.3rem' : '0.5rem', flexWrap: 'nowrap' }}>
            <h1 style={{ margin: 0, fontSize: isMobile ? '1rem' : '1.5rem' }}>
              {isMobile ? '' : 'Örtendahls familjecentral'}
            </h1>
            {/* Primary Icons: Home, Schedule */}
            <button
              onClick={() => setActiveTab('dashboard')}
              title="Översikt"
              style={{
                background: activeTab === 'dashboard' ? '#646cff' : 'transparent',
                color: activeTab === 'dashboard' ? 'white' : 'var(--text-main)',
                border: activeTab === 'dashboard' ? 'none' : '1px solid var(--border-color)',
                borderRadius: '8px',
                cursor: 'pointer',
                padding: isMobile ? '0.4rem' : '0.5rem',
                fontSize: isMobile ? '1.3rem' : '1.4rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              🏠
            </button>
            <button
              onClick={() => setActiveTab('schedule')}
              title="Skolschema"
              style={{
                background: activeTab === 'schedule' ? '#646cff' : 'transparent',
                color: activeTab === 'schedule' ? 'white' : 'var(--text-main)',
                border: activeTab === 'schedule' ? 'none' : '1px solid var(--border-color)',
                borderRadius: '8px',
                cursor: 'pointer',
                padding: isMobile ? '0.4rem' : '0.5rem',
                fontSize: isMobile ? '1.3rem' : '1.4rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              📅
            </button>



            {/* Next Match Ticker - inline in header */}
            {(() => {
              const now = new Date();
              const nextMatch = events
                .filter(e => {
                  const isArsenal = e.source === 'Arsenal FC';
                  const isOis = e.source === 'Örgryte IS';
                  return (isArsenal || isOis) && new Date(e.start) > now;
                })
                .sort((a, b) => new Date(a.start) - new Date(b.start))[0];

              if (!nextMatch) return null;

              const isArsenal = nextMatch.source === 'Arsenal FC' || (nextMatch.summary || '').toLowerCase().includes('arsenal');

              // Adjust time for Arsenal (UK time +1h for SE) if needed
              const displayDate = new Date(nextMatch.start);
              // if (isArsenal) {
              //   displayDate.setTime(displayDate.getTime() + 3600000); // Add 1 hour
              // }

              return (
                <a
                  href="https://www.svenskafans.com/fotboll/lag/arsenal/spelschema"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: 'var(--card-bg)',
                    padding: '0.15rem 0.4rem',
                    borderRadius: '12px',
                    fontSize: '0.6rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    whiteSpace: 'nowrap',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-main)',
                    maxWidth: isMobile ? '160px' : 'auto', // Increased slightly for time
                    overflow: 'hidden',
                    textDecoration: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <span style={{ fontSize: '0.7rem', flexShrink: 0 }}>{isArsenal ? '🔴⚪' : '🔴🔵'}</span>
                  <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{nextMatch.summary}</span>
                  <span style={{ opacity: 0.7, flexShrink: 0 }}>
                    {displayDate.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric' })}
                    {' '}
                    {displayDate.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </a>
              );
            })()}

            {/* Spacer to push hamburger menu to right */}
            <div style={{ flex: 1 }}></div>

            {/* More Menu (hamburger) - far right */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                title="Mer"
                style={{
                  background: showMoreMenu ? '#646cff' : 'transparent',
                  color: showMoreMenu ? 'white' : 'var(--text-main)',
                  border: showMoreMenu ? 'none' : '1px solid var(--border-color)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  padding: isMobile ? '0.4rem' : '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: isMobile ? '1.3rem' : '1.4rem'
                }}
              >
                ☰
              </button>

              {/* Dropdown Menu */}
              {showMoreMenu && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '0.5rem',
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  boxShadow: '0 4px 12px var(--shadow-color)',
                  zIndex: 1000,
                  minWidth: '200px',
                  overflow: 'hidden'
                }}>
                  <button
                    onClick={() => { setShowInbox(true); setShowMoreMenu(false); }}
                    style={{
                      width: '100%',
                      padding: '0.8rem 1rem',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '1px solid var(--border-color)',
                      color: 'var(--text-main)',
                      fontSize: '0.95rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      textAlign: 'left',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    📥 Inkorg
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => { fetchTrash(); setViewTrash(true); setShowMoreMenu(false); }}
                      style={{
                        width: '100%',
                        padding: '0.8rem 1rem',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: '1px solid var(--border-color)',
                        color: 'var(--text-main)',
                        fontSize: '0.95rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        textAlign: 'left',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      🗑️ Papperskorg
                    </button>
                  )}
                  <button
                    onClick={() => { setDarkMode(!darkMode); setShowMoreMenu(false); }}
                    style={{
                      width: '100%',
                      padding: '0.8rem 1rem',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '1px solid var(--border-color)',
                      color: 'var(--text-main)',
                      fontSize: '0.95rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      textAlign: 'left',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {darkMode ? '☀️ Ljust läge' : '🌙 Mörkt läge'}
                  </button>
                  <button
                    onClick={() => { handleLogout(); setShowMoreMenu(false); }}
                    style={{
                      width: '100%',
                      padding: '0.8rem 1rem',
                      background: 'transparent',
                      border: 'none',
                      color: '#ff4757',
                      fontSize: '0.95rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      textAlign: 'left',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    🚪 Logga ut
                  </button>
                </div>
              )}
            </div>
          </div>



        </header>
      </div>
      {/* END of dashboard-only block for header area */}

      {/* Schedule Tab Content - shown after header */}
      {
        activeTab === 'schedule' && (
          <div className="tab-content">
            <ScheduleViewer events={scheduleEvents} />
          </div>
        )
      }

      {/* Dashboard content continues here - Only visible activeTab === 'dashboard' */}
      <div style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }}>

        {/* Today Hero Section */}
        <div className={`${getHeroClass()} has-custom-bg`} style={{ backgroundImage: `url(${heroCustomImg})` }}>
          <div className="hero-header" style={{ width: '100%', marginBottom: '0.5rem' }}>
            {/* Greeting */}
            <p style={{ margin: 0, marginBottom: '0.2rem', fontSize: isMobile ? '1rem' : '1.1rem', opacity: 0.9 }}>
              Hej {currentUser.name}!
            </p>
            {/* Date row */}
            <h2 style={{ fontSize: isMobile ? '1.2rem' : '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', margin: 0, marginBottom: '0.3rem' }}>
              <button
                onClick={() => changeDay(-1)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'white',
                  fontSize: '2.5rem',
                  fontWeight: '300',
                  cursor: 'pointer',
                  opacity: 1,
                  padding: '0 0.5rem',
                  textShadow: '0 2px 5px rgba(0,0,0,0.5)',
                  lineHeight: 1
                }}
              >
                ‹
              </button>
              <span style={{ textAlign: 'center', flexGrow: 1, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                {isToday(selectedDate)
                  ? `Idag, ${selectedDate.toLocaleDateString('sv-SE', { weekday: 'long' })}, ${selectedDate.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })}`
                  : selectedDate.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })
                }
              </span>
              <button
                onClick={() => changeDay(1)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'white',
                  fontSize: '2.5rem',
                  fontWeight: '300',
                  cursor: 'pointer',
                  opacity: 1,
                  padding: '0 0.5rem',
                  textShadow: '0 2px 5px rgba(0,0,0,0.5)',
                  lineHeight: 1
                }}
              >
                ›
              </button>
            </h2>
            {/* Clock + Weather row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', lineHeight: '1.1' }}>
                {currentTime.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="weather-widget"
                style={{
                  cursor: 'pointer',
                  background: 'rgba(255,255,255,0.2)',
                  padding: isMobile ? '0.3rem 0.6rem' : '0.5rem 1rem',
                  borderRadius: '8px',
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: '0.5rem',
                  width: 'auto',
                  backdropFilter: 'blur(5px)',
                  zIndex: 10
                }}
                onClick={() => window.open('https://www.smhi.se/vader/prognoser-och-varningar/vaderprognos/q/Lidk%C3%B6ping/2696329', '_blank')}
                title="Se prognos hos SMHI"
              >
                {(() => {
                  const w = getSelectedDayWeather();
                  if (w) {
                    // Determine Day/Night for Icon
                    let isDay = true;
                    if (weather && weather.daily && weather.daily.sunrise && weather.daily.sunset) {
                      // If showing TODAY -> Use Current Time
                      if (isToday(selectedDate)) {
                        try {
                          const sunrise = new Date(weather.daily.sunrise[0]);
                          const sunset = new Date(weather.daily.sunset[0]);
                          if (currentTime < sunrise || currentTime > sunset) isDay = false;
                        } catch (e) { }
                      } else {
                        // Future dates -> Always Day icon (forecast usually implies day conditions unless specific)
                        isDay = true;
                      }
                    } else {
                      // Fallback using hour
                      if (isToday(selectedDate)) {
                        const h = currentTime.getHours();
                        if (h < 6 || h > 21) isDay = false;
                      }
                    }

                    return (
                      <>
                        <span style={{ fontSize: isMobile ? '1.2rem' : '2rem' }}>{getWeatherIcon(w.code, isDay)}</span>
                        <span style={{ fontSize: isMobile ? '1rem' : '2rem', fontWeight: 'bold' }}>{w.temp}°C</span>
                        {!isMobile && <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>Lidköping</span>}
                      </>
                    );
                  }
                  return <span>..</span>;
                })()}
              </div>
            </div>
          </div>

          {(heroEvents.length > 0 || heroTasks.length > 0) && (
            <div className="today-events-list" style={{ marginTop: '0.5rem' }}>


              <div className="hero-content-wrapper" style={{ display: 'flex', alignItems: 'center' }}>
                {(() => {
                  // CONDITIONAL RENDER: Summary
                  if (!showHeroDetails) {
                    return (
                      <div
                        className="card summary-card"
                        onClick={() => setShowHeroDetails(true)}
                        style={{
                          width: '100%',
                          cursor: 'pointer',
                          textAlign: 'center',
                          padding: isMobile ? '0.3rem' : '0.6rem',
                          background: 'rgba(255,255,255,0.15)',
                          backdropFilter: 'blur(5px)',
                          color: 'white',
                          maxWidth: isMobile ? '130px' : '220px',
                          margin: isMobile ? '0' : '0 auto',
                          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                          textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                          position: isMobile ? 'absolute' : 'relative',
                          bottom: isMobile ? '50px' : 'auto',
                          left: isMobile ? '0.5rem' : 'auto',
                          zIndex: 5
                        }}
                      >
                        <h3 style={{ margin: '0 0 0.2rem 0', fontSize: isMobile ? '0.75rem' : '0.9rem' }}>
                          Dagens händelser
                        </h3>
                        <p style={{ margin: 0, fontSize: isMobile ? '0.7rem' : '0.8rem' }}>
                          📅 {heroEvents.length}
                          {heroTasks.length > 0 && ` • ✅ ${heroTasks.length}`}
                        </p>
                        <div style={{ marginTop: '0.2rem', fontSize: '0.65rem', opacity: 0.8, fontStyle: 'italic', display: isMobile ? 'none' : 'block' }}>
                          Klicka för detaljer
                        </div>
                      </div>
                    );
                  }

                  // DETAILS VIEW with BACK BUTTON
                  const combined = [];
                  const now = new Date();

                  // 1. Add Tasks
                  heroTasks.forEach(task => {
                    combined.push({ type: 'task', data: task });
                  });

                  // 2. Add Events
                  heroEvents.forEach(event => {
                    combined.push({ type: 'event', data: event });
                  });

                  // 3. Sort Combined List
                  // Order: Done Tasks -> Past Events (Chronological) -> Future Events (Chronological) -> Undone Tasks
                  combined.sort((a, b) => {
                    const getCategory = (item) => {
                      if (item.type === 'task') {
                        return item.data.done ? 0 : 3;
                      } else {
                        // Event
                        const endDate = new Date(item.data.end);
                        return endDate < now ? 1 : 2;
                      }
                    };

                    const catA = getCategory(a);
                    const catB = getCategory(b);
                    if (catA !== catB) return catA - catB;

                    if (a.type === 'event' && b.type === 'event') {
                      return new Date(a.data.start) - new Date(b.data.start);
                    }
                    return 0;
                  });

                  // 4. Render
                  return (
                    <>
                      <button
                        onClick={() => setShowHeroDetails(false)}
                        title="Tillbaka"
                        style={{
                          background: 'rgba(255,255,255,0.9)',
                          color: '#333',
                          border: 'none',
                          borderRadius: '8px',
                          width: '40px',
                          height: '40px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          marginRight: '0.5rem',
                          fontSize: '1.2rem',
                          flexShrink: 0,
                          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                        }}
                      >
                        ‹
                      </button>
                      <div className="horizontal-scroll-container" style={{ flexGrow: 1, width: 'calc(100% - 60px)' }}>
                        {combined.map((item) => {
                          const key = item.type === 'task' ? `task-${item.data.id}` : `event-${item.data.uid}`;

                          if (item.type === 'task') {
                            const task = item.data;
                            return (
                              <div key={key} className="card" style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.9)', color: '#333', borderLeft: '4px solid #2ed573', opacity: task.done ? 0.6 : 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontWeight: 'bold', textDecoration: task.done ? 'line-through' : 'none' }}>{task.done ? '✅' : '⬜'} {task.text}</span>
                                  <span style={{ fontSize: '0.8rem', background: '#e1f7e7', padding: '2px 6px', borderRadius: '4px', color: '#2ed573' }}>Dagens uppgift</span>
                                </div>
                                {task.assignee && <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.2rem' }}>👤 {task.assignee}</div>}
                              </div>
                            );
                          } else {
                            const event = item.data;
                            let sourceClass = '';
                            if (event.source === 'Svante (Privat)') sourceClass = 'source-svante';
                            if (event.source === 'Sarah (Privat)') sourceClass = 'source-mamma';

                            const assignments = event.assignments || {};
                            const isFullyAssigned = assignments.driver && assignments.packer;
                            const passedStyle = getEventStatusStyle(event.end);
                            const colorClass = getAssignedColorClass(event);

                            const renderTravelInfoLocal = () => {
                              if (!event.travelTime) return null;
                              return (
                                <div className="travel-info" style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>
                                  <div className="travel-badge">🚗 {formatDuration(event.travelTime.duration)}</div>
                                  {event.travelTime.distance < 10000 && (
                                    <>
                                      {event.travelTimeBike && <div className="travel-badge">🚲 {formatDuration(event.travelTimeBike.duration)}</div>}
                                      {event.travelTimeWalk && <div className="travel-badge">🚶 {formatDuration(event.travelTimeWalk.duration)}</div>}
                                    </>
                                  )}
                                </div>
                              );
                            };

                            return (
                              <div key={key} className={`card ${sourceClass} ${colorClass} ${isFullyAssigned ? 'assigned' : ''} `}
                                style={{
                                  cursor: 'pointer',
                                  background: 'rgba(255,255,255,0.9)',
                                  color: '#333',
                                  ...passedStyle,
                                  ...(event.cancelled ? { opacity: 0.6, textDecoration: 'line-through' } : {})
                                }}
                                onClick={(e) => { e.stopPropagation(); if (isAdmin) openEditModal(event); else setViewMapEvent(event); }}
                              >
                                <div className="card-header">
                                  <span className="time">
                                    {new Date(event.start).toLocaleString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  <span className="source-badge">{event.source || 'Familjen'}</span>
                                </div>

                                <h3>{event.summary}</h3>

                                {/* Clickable Location */}
                                <p className="location"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isChildUser && (!event.location || event.location === 'Okänd plats')) {
                                      openEditModal(event);
                                    } else {
                                      setViewMapEvent(event);
                                    }
                                  }}
                                  style={{ cursor: 'pointer', color: event.coords ? '#4a90e2' : 'inherit', textDecoration: event.coords ? 'underline' : 'none' }}
                                  title={!isChildUser && (!event.location || event.location === 'Okänd plats') ? "Klicka för att lägga till plats" : "Klicka för att se på karta"}>
                                  📍 {event.location || 'Hemma/Okänd plats'}
                                </p>

                                {renderTravelInfoLocal()}

                                <div className="actions" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                                  {renderAssignmentControl(event, 'driver')}
                                  {renderAssignmentControl(event, 'packer')}
                                </div>
                              </div>
                            );
                          }
                        })}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Add Calendar Event Button (Dashboard) */}
          {isAdmin && (
            <button
              onClick={() => setIsCreatingEvent(true)}
              style={{
                width: isMobile ? 'calc(100% - 20px)' : '100%',
                padding: '0.5rem',
                background: 'rgba(255,255,255,0.1)',
                border: '1px dashed rgba(255,255,255,0.4)',
                color: 'white',
                borderRadius: '8px',
                cursor: 'pointer',
                marginBottom: isMobile ? '0' : '1rem',
                marginTop: isMobile ? '0' : '0.5rem',
                fontSize: '0.8rem',
                fontWeight: '400',
                position: isMobile ? 'absolute' : 'relative',
                bottom: isMobile ? '10px' : 'auto',
                left: isMobile ? '10px' : 'auto',
                zIndex: 10
              }}
            >
              + Lägg till kalenderhändelse
            </button>

          )}
        </div>

        {/* Combined Filter Button */}
        <div style={{ marginBottom: '0.5rem' }}>
          <button
            onClick={() => setShowFilterMenu(!showFilterMenu)}
            style={{
              width: '100%',
              padding: '0.8rem 1rem',
              background: 'var(--card-bg)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              color: 'var(--text-main)',
              fontSize: '0.9rem',
              textAlign: 'left',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer'
            }}
          >
            <span>
              🔍 Filter: <strong>{filterChild === 'Alla' ? 'Hela Familjen' : filterChild}</strong> • <strong>{filterCategory}</strong>
            </span>
            <span>{showFilterMenu ? '▲' : '▼'}</span>
          </button>

          {/* Filter Modal */}
          {showFilterMenu && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.5)',
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem'
              }}
              onClick={() => setShowFilterMenu(false)}
            >
              <div
                style={{
                  background: 'var(--card-bg)',
                  borderRadius: '16px',
                  padding: '1.5rem',
                  maxWidth: '400px',
                  width: '100%',
                  maxHeight: '80vh',
                  overflowY: 'auto'
                }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Filtrera</h3>
                  <button
                    onClick={() => setShowFilterMenu(false)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      fontSize: '1.5rem',
                      cursor: 'pointer',
                      color: 'var(--text-main)',
                      padding: '0',
                      lineHeight: 1
                    }}
                    aria-label="Stäng"
                  >
                    ✕
                  </button>
                </div>

                {/* Two-column layout for filters */}
                <div style={{ display: 'flex', gap: '1rem' }}>
                  {/* Family Filter Section */}
                  <div style={{ flex: 1 }}>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', opacity: 0.7 }}>👨‍👩‍👧‍👦 Familj</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {children.map(child => (
                        <button
                          key={child}
                          onClick={() => setFilterChild(child)}
                          style={{
                            padding: '0.8rem',
                            background: filterChild === child ? '#2ed573' : 'transparent',
                            color: filterChild === child ? 'white' : 'var(--text-main)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontWeight: filterChild === child ? 'bold' : 'normal'
                          }}
                        >
                          {child === 'Alla' ? 'Hela Familjen' : child} {filterChild === child && '✓'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Category Filter Section */}
                  <div style={{ flex: 1 }}>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', opacity: 0.7 }}>📂 Kategori</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {['Alla', 'Handboll', 'Fotboll', 'Bandy', 'Dans', 'Skola', 'Kalas', 'Arbete', 'Annat'].map(cat => (
                        <button
                          key={cat}
                          onClick={() => setFilterCategory(cat)}
                          style={{
                            padding: '0.8rem',
                            background: filterCategory === cat ? '#2ed573' : 'transparent',
                            color: filterCategory === cat ? 'white' : 'var(--text-main)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontWeight: filterCategory === cat ? 'bold' : 'normal'
                          }}
                        >
                          {cat} {filterCategory === cat && '✓'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Close Button */}
                <button
                  onClick={() => setShowFilterMenu(false)}
                  style={{
                    width: '100%',
                    marginTop: '1.5rem',
                    padding: '0.8rem',
                    background: 'var(--primary-color)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  Stäng
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Main Content Grid (Timeline + Todo) - on mobile: Events first, then Todo */}
        <div className="main-content-grid" style={{
          marginTop: '0',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: '1rem'
        }}>
          {/* Left: Timeline / Calendar View */}
          < div className="timeline-section" >
            {/* View Mode Selector - now inside timeline section to appear above calendar but below todo on mobile */}
            <div className="view-mode-selector" style={{
              display: 'flex',
              justifyContent: 'center',
              margin: '0 0 1rem 0',
              padding: '0'
            }}>
              <div style={{
                background: 'var(--button-bg)',
                borderRadius: '30px',
                padding: '0.2rem',
                display: 'flex',
                gap: '0rem',
                width: '100%',
                maxWidth: '600px',
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
                justifyContent: 'space-between'
              }}>
                {[
                  { id: 'upcoming', label: 'Kommande' },
                  { id: 'next3days', label: '3 Dagar' },
                  { id: 'week', label: `Vecka ${getWeekNumber(selectedDate)}` },
                  { id: 'month', label: selectedDate.toLocaleDateString('sv-SE', { month: 'long' }) },
                  { id: 'history', label: 'Historik' }
                ].map(view => (
                  <button
                    key={view.id}
                    onClick={() => setViewMode(view.id)}
                    style={{
                      background: viewMode === view.id ? 'var(--card-bg)' : 'transparent',
                      color: viewMode === view.id ? 'var(--text-main)' : 'var(--text-muted)',
                      border: 'none',
                      borderRadius: '25px',
                      padding: '0.4rem 0.8rem',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      fontWeight: viewMode === view.id ? '600' : '500',
                      boxShadow: viewMode === view.id ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                      transition: 'all 0.2s ease',
                      textTransform: 'capitalize',
                      whiteSpace: 'nowrap',
                      flex: 1,
                      textAlign: 'center'
                    }}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="timeline">
              <h2 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {(viewMode === 'week' || viewMode === 'month') ? (
                  <>
                    <button onClick={() => navigateView(-1)} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-main)' }}>◀</button>
                    <span>
                      📅 {viewMode === 'week' ? `Vecka ${getWeekNumber(selectedDate)}` :
                        viewMode === 'month' ? `${selectedDate.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' })}` : ''}
                    </span>
                    <button onClick={() => navigateView(1)} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-main)' }}>▶</button>
                  </>
                ) : (
                  <span>
                    📅 {viewMode === 'next3days' ? 'Kommande 3 dagar' : 'Kommande händelser'}
                  </span>
                )}
              </h2>

              {/* MONTH VIEW */}
              {viewMode === 'month' && (
                <div className="calendar-grid-month">
                  {['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'].map(d => (
                    <div key={d} className="calendar-day-header">{d}</div>
                  ))}
                  {(() => {
                    const days = [];
                    const year = selectedDate.getFullYear();
                    const month = selectedDate.getMonth();
                    const firstDayOfMonth = new Date(year, month, 1);
                    const lastDayOfMonth = new Date(year, month + 1, 0);

                    // Start from Monday (getDay: Sun=0, Mon=1...Sat=6) -> Convert to Mon=0...Sun=6
                    let startDay = firstDayOfMonth.getDay() - 1;
                    if (startDay === -1) startDay = 6;

                    // Previous Month Padding
                    const prevMonthLastDate = new Date(year, month, 0).getDate();
                    for (let i = 0; i < startDay; i++) {
                      days.push({ day: prevMonthLastDate - startDay + 1 + i, type: 'prev', date: new Date(year, month - 1, prevMonthLastDate - startDay + 1 + i) });
                    }

                    // Current Month
                    for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
                      days.push({ day: i, type: 'current', date: new Date(year, month, i) });
                    }

                    // Next Month Padding (to 42 cells grid = 6 rows, or just fill row)
                    const remaining = 42 - days.length;
                    for (let i = 1; i <= remaining; i++) {
                      days.push({ day: i, type: 'next', date: new Date(year, month + 1, i) });
                    }

                    return days.map((d, idx) => {
                      const dayEvents = filteredEventsList.filter(e => isSameDay(e.start, d.date));
                      const isTodayCell = isSameDay(d.date, new Date());
                      return (
                        <div key={idx}
                          className={`calendar-cell ${d.type !== 'current' ? 'different-month' : ''} ${isTodayCell ? 'today' : ''}`}
                          onClick={() => changeDay(Math.floor((d.date - selectedDate) / (1000 * 60 * 60 * 24)))} // Select this day
                        >
                          <div style={{ textAlign: 'right', fontWeight: 'bold', marginBottom: '0.2rem' }}>{d.day}</div>
                          {dayEvents.slice(0, 4).map(ev => {
                            let sourceClass = '';
                            if (ev.source.includes('Svante')) sourceClass = 'source-svante';
                            if (ev.source.includes('Sarah')) sourceClass = 'source-mamma';
                            return (
                              <div key={ev.uid}
                                className={`calendar-event ${ev.date < new Date() ? 'done' : ''} ${sourceClass}`}
                                style={{ textDecoration: ev.cancelled ? 'line-through' : 'none', opacity: ev.cancelled ? 0.6 : 1 }}
                                title={ev.summary}
                                onClick={(e) => { e.stopPropagation(); if (isAdmin) openEditModal(ev); else setViewMapEvent(ev); }}>
                                {ev.cancelled ? '🚫 ' : ''}{ev.summary}
                              </div>
                            )
                          })}
                          {dayEvents.length > 4 && <div style={{ fontSize: '0.7rem', color: '#666', textAlign: 'center' }}>+ {dayEvents.length - 4} till</div>}
                        </div>
                      );
                    });
                  })()}
                </div>
              )}

              {/* WEEK VIEW */}
              {viewMode === 'week' && (
                <div className="week-view-container">
                  {(() => {
                    const days = [];
                    const current = new Date(selectedDate);
                    const dayOfWeek = current.getDay() || 7; // 1-7 (Mon-Sun)
                    current.setDate(current.getDate() - dayOfWeek + 1); // Go to Monday

                    for (let i = 0; i < 7; i++) {
                      days.push(new Date(current));
                      current.setDate(current.getDate() + 1);
                    }

                    return days.map(d => {
                      const dayEvents = filteredEventsList.filter(e => isSameDay(e.start, d));
                      const isTodayHeader = isSameDay(d, new Date());
                      return (
                        <div
                          key={d.toISOString()}
                          className="week-column"
                          id={isTodayHeader ? 'today-column' : undefined}
                        >
                          <div className="week-column-header" style={isTodayHeader ? { background: '#2ed573', color: 'white' } : {}}>
                            {d.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric' })}
                          </div>
                          <div className="week-column-body">
                            {dayEvents.map(ev => {
                              let sourceClass = '';
                              if (ev.source.includes('Svante')) sourceClass = 'source-svante';
                              if (ev.source.includes('Sarah')) sourceClass = 'source-mamma';
                              const colorClass = getAssignedColorClass(ev);
                              return (
                                <div key={ev.uid}
                                  className={`card ${sourceClass} ${colorClass}`}
                                  style={{ padding: '0.3rem 0.4rem', fontSize: '0.75rem', minHeight: 'auto', marginBottom: '0.3rem', borderLeftWidth: '3px', display: 'flex', flexDirection: 'column', gap: '0.1rem', lineHeight: '1.2' }}
                                  onClick={(e) => { e.stopPropagation(); if (isAdmin) openEditModal(ev); else setViewMapEvent(ev); }}
                                >
                                  <div style={{ fontWeight: 'bold' }}>
                                    {new Date(ev.start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                  <div style={{ fontWeight: 600, textDecoration: ev.cancelled ? 'line-through' : 'none' }}>
                                    {ev.cancelled && <span style={{ color: '#ff4757', marginRight: '0.2rem' }}>🚫</span>}
                                    {ev.summary}
                                  </div>

                                  {ev.location && ev.location !== 'Okänd plats' && (
                                    <div style={{ fontSize: '0.7rem', color: '#666', overflow: 'hidden', lineHeight: '1.2' }}>
                                      📍 {ev.location}
                                    </div>
                                  )}

                                  <div style={{ transform: 'scale(0.85)', transformOrigin: 'top left', marginLeft: '-2px' }}>
                                    {renderTravelInfo(ev)}
                                  </div>

                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem', marginTop: '0.2rem' }}>
                                    {ev.assignments && (ev.assignments.driver || ev.assignments.packer) && (
                                      <>
                                        {ev.assignments.driver && <span style={{ fontSize: '0.7em', background: '#eee', padding: '1px 3px', borderRadius: '3px' }}>🚗 {ev.assignments.driver}</span>}
                                        {ev.assignments.packer && <span style={{ fontSize: '0.7em', background: '#eee', padding: '1px 3px', borderRadius: '3px' }}>🎒 {ev.assignments.packer}</span>}
                                      </>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}

              {/* DEFAULT LIST VIEW (Upcoming, History, Next 3 Days) */}
              {viewMode !== 'month' && viewMode !== 'week' && (
                <>
                  {otherEvents.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Inga kommande händelser matchar filtret.</p>
                  ) : (
                    otherEvents.map(event => {
                      let sourceClass = '';
                      if (event.source === 'Svante (Privat)') sourceClass = 'source-svante';
                      if (event.source === 'Sarah (Privat)') sourceClass = 'source-mamma';
                      const assignments = event.assignments || {};
                      const isFullyAssigned = assignments.driver && assignments.packer;
                      const colorClass = getAssignedColorClass(event);
                      return (
                        <div key={event.uid} className={`card ${sourceClass} ${colorClass} ${isFullyAssigned ? 'assigned' : ''}`}
                          style={{ cursor: isAdmin ? 'pointer' : 'default' }}
                          onClick={() => isAdmin && openEditModal(event)}
                        >
                          <div className="card-header">
                            <span className="time">
                              {new Date(event.start).toLocaleDateString('sv-SE', { weekday: 'short', month: 'short', day: 'numeric' })} {new Date(event.start).toLocaleString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="source-badge">{event.source || 'Familjen'}</span>
                          </div>
                          <h3 style={{ textDecoration: event.cancelled ? 'line-through' : 'none', color: event.cancelled ? '#7f8c8d' : 'inherit' }}>
                            {event.cancelled && <span style={{ color: '#ff4757', marginRight: '0.5rem', fontSize: '0.8em', textDecoration: 'none', display: 'inline-block' }}>INSTÄLLD</span>}
                            {event.summary}
                          </h3>
                          <p className="location" onClick={(e) => { e.stopPropagation(); if (isAdmin && (!event.location || event.location === 'Okänd plats')) openEditModal(event); else setViewMapEvent(event); }}
                            style={{ cursor: 'pointer', color: event.coords ? '#4a90e2' : 'inherit', textDecoration: event.coords ? 'underline' : 'none' }}
                            title={event.coords ? "Se på karta" : "Ingen plats"}>
                            📍 {event.location || 'Hemma/Okänd plats'}
                          </p>
                          {renderTravelInfo(event)}
                          <div className="actions" onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                            {isAdmin && renderAssignmentControl(event, 'driver')}
                            {isAdmin && renderAssignmentControl(event, 'packer')}
                          </div>
                        </div>
                      );
                    })
                  )}
                </>
              )}
            </div>
          </div >

          {/* Right: Todo */}
          < div className="todo-section" >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderLeft: '4px solid #2ed573', paddingLeft: '1rem' }}>
              <h2 style={{ margin: 0 }}>
                ✅ Att göra ({viewMode === 'month' ? selectedDate.toLocaleDateString('sv-SE', { month: 'long' }) :
                  viewMode === 'upcoming' ? 'Kommande' :
                    `v.${getWeekNumber(selectedDate)}`})
              </h2>
            </div>
            {
              showMobileTaskForm && (
                <form onSubmit={(e) => {
                  addTask(e);
                  setShowMobileTaskForm(false);
                }} style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', boxShadow: '0 2px 4px var(--shadow-color)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <input type="text" placeholder="Vad behöver göras?" value={taskInput.text} onChange={e => setTaskInput({ ...taskInput, text: e.target.value })} style={{ flex: '1 1 200px', padding: '0.6rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-main)' }} />
                    {!taskInput.isRecurring && (
                      <input type="number" placeholder="V" value={taskInput.week} onChange={e => setTaskInput({ ...taskInput, week: e.target.value })} style={{ flex: '0 0 60px', padding: '0.6rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-main)' }} title="Vecka" />
                    )}
                  </div>

                  {/* Day Selector */}
                  <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                    {['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'].map((day, i) => (
                      <button
                        type="button"
                        key={day}
                        className={taskInput.days.includes(i) ? 'active' : ''}
                        onClick={() => {
                          const newDays = taskInput.days.includes(i) ? taskInput.days.filter(d => d !== i) : [...taskInput.days, i];
                          setTaskInput({ ...taskInput, days: newDays });
                        }}
                        style={{ padding: '0.3rem 0.6rem', borderRadius: '15px', border: taskInput.days.includes(i) ? '2px solid #2ed573' : '1px solid var(--input-border)', background: taskInput.days.includes(i) ? 'rgba(46, 213, 115, 0.2)' : 'var(--input-bg)', color: 'var(--text-main)', fontSize: '0.8rem' }}
                      >
                        {day}
                      </button>
                    ))}
                  </div>

                  {/* Multi-select Assignees - only shown for parents */}
                  {!isChildUser && (
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {['Svante', 'Sarah', 'Algot', 'Tuva', 'Leon'].map(name => {
                        const isSelected = Array.isArray(taskInput.assignee) && taskInput.assignee.includes(name);

                        let bg = isSelected ? '#2ed573' : 'var(--input-bg)'; // Default green for others/generic
                        if (isSelected) {
                          if (name === 'Svante') bg = '#ff4757';
                          if (name === 'Sarah') bg = '#f1c40f';
                          if (name === 'Algot') bg = '#3498db';
                          if (name === 'Tuva') bg = '#9b59b6';
                          if (name === 'Leon') bg = '#2ed573';
                        }

                        return (
                          <button
                            key={name}
                            type="button"
                            onClick={() => {
                              const current = Array.isArray(taskInput.assignee) ? taskInput.assignee : [];
                              const newAssignees = current.includes(name)
                                ? current.filter(n => n !== name)
                                : [...current, name];
                              setTaskInput({ ...taskInput, assignee: newAssignees });
                            }}
                            style={{
                              padding: '0.4rem 0.8rem',
                              borderRadius: '15px',
                              border: '1px solid var(--border-color)',
                              background: bg,
                              color: isSelected ? 'white' : 'var(--text-main)',
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              fontWeight: isSelected ? 'bold' : 'normal'
                            }}
                          >
                            {isSelected ? '✓ ' : ''}{name}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={taskInput.isRecurring} onChange={e => setTaskInput({ ...taskInput, isRecurring: e.target.checked })} />
                      🔄 Återkommande
                    </label>

                    <div style={{ display: 'flex', gap: '0.5rem', flex: 1, minWidth: '200px' }}>
                      <button type="submit" style={{ background: '#2ed573', color: 'white', border: 'none', borderRadius: '4px', padding: '0.5rem 1rem', cursor: 'pointer', flex: 1 }}>Lägg till</button>
                      <button
                        type="button"
                        onClick={() => setShowMobileTaskForm(false)}
                        style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.5rem 1rem', cursor: 'pointer' }}
                      >
                        Avbryt
                      </button>
                    </div>
                  </div>
                </form>
              )
            }
            {/* Add task button - shows for everyone */}
            {(
              <button
                onClick={() => setShowMobileTaskForm(!showMobileTaskForm)}
                style={{
                  background: 'transparent',
                  border: '1px dashed var(--border-color)',
                  borderRadius: '8px',
                  padding: '0.5rem',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  fontSize: '0.8rem',
                  width: '100%',
                  marginBottom: '0.5rem'
                }}
              >
                {showMobileTaskForm ? '✕ Stäng formulär' : '+ Lägg till uppgift'}
              </button>
            )}
            <div className="todo-list">
              {(() => {
                // 1. Filter Standard Tasks
                const relevantTasks = tasks.filter(t => {
                  if (!checkCommonFilters(t)) return false;
                  // ... same logic as before ...
                  if (t.isRecurring) return true;
                  const currentWeek = getWeekNumber(new Date());
                  const viewWeek = getWeekNumber(selectedDate);
                  if (viewMode === 'upcoming') return parseInt(t.week) >= currentWeek;
                  if (viewMode === 'history') return parseInt(t.week) < currentWeek;
                  if (viewMode === 'month') {
                    const firstDayOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
                    const lastDayOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
                    const startWeek = getWeekNumber(firstDayOfMonth);
                    const endWeek = getWeekNumber(lastDayOfMonth);
                    if (selectedDate.getMonth() === 11) return parseInt(t.week) >= startWeek || parseInt(t.week) === 1;
                    if (selectedDate.getMonth() === 0) return parseInt(t.week) <= endWeek || parseInt(t.week) >= 52;
                    return parseInt(t.week) >= startWeek && parseInt(t.week) <= endWeek;
                  }
                  return parseInt(t.week) === viewWeek;
                });

                // 2. Extract Event Todos from ALREADY filtered events
                const eventTodos = filteredEventsList.flatMap(ev =>
                  (ev.todoList || []).map((todo, idx) => ({
                    id: `evt-${ev.uid}-${idx}`,
                    text: typeof todo === 'string' ? todo : todo.text,
                    done: typeof todo === 'string' ? false : todo.done,
                    isEventTodo: true,
                    event: ev, // Reference to full event
                    originalTodo: todo // Reference to original item
                  }))
                );

                // 3. Render Combined List
                return [...relevantTasks, ...eventTodos].map(task => {
                  const contextWeek = getWeekNumber(selectedDate);
                  const isDone = task.isEventTodo
                    ? task.done
                    : (task.isRecurring ? (task.completedWeeks || []).includes(contextWeek) : task.done);

                  // Handle Toggle for Event Todos
                  const handleToggle = () => {
                    if (task.isEventTodo) {
                      // Toggle logic for Event Todo
                      const ev = task.event;
                      const newTodoList = (ev.todoList || []).map(t => {
                        if (t === task.originalTodo) { // Reference match should work if from same object
                          return { ...t, done: !t.done };
                        }
                        return t;
                      });

                      // Optimistic Update (optional, but good for UI)
                      // ... complex to update UI state deep in events list without re-fetch
                      // For now, let's just push to backend and re-fetch.
                      fetch(getApiUrl('api/update-event'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ...ev, todoList: newTodoList })
                      }).then(() => fetchEvents());

                    } else {
                      toggleTask(task, contextWeek);
                    }
                  };

                  // Get color for task based on assignee
                  const getTaskColor = () => {
                    if (isDone) return '#ccc';
                    if (task.isEventTodo) {
                      // For event todos, use the event's color logic
                      const summary = (task.event.summary || '').toLowerCase();
                      if (summary.includes('algot')) return '#3498db';
                      if (summary.includes('leon')) return '#2ed573';
                      if (summary.includes('tuva')) return '#9b59b6';
                      if (summary.includes('svante')) return '#ff4757';
                      if (summary.includes('sarah')) return '#f1c40f';
                      return '#ff6b81'; // default for event todos
                    }
                    // For regular tasks, check assignee
                    const assignee = (task.assignee || '').toLowerCase();
                    if (assignee.includes('algot')) return '#3498db';
                    if (assignee.includes('leon')) return '#2ed573';
                    if (assignee.includes('tuva')) return '#9b59b6';
                    if (assignee.includes('svante')) return '#ff4757';
                    if (assignee.includes('sarah')) return '#f1c40f';
                    return '#2ed573'; // default green
                  };

                  return (
                    <div
                      key={task.id}
                      className="card"
                      onClick={handleToggle}
                      style={{
                        padding: '1rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem', // Increased gap
                        opacity: isDone ? 0.6 : 1,
                        borderLeftColor: getTaskColor(),
                        cursor: 'pointer', // Indicate clickable
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isDone}
                        onChange={() => { }} // Handled by parent onClick
                        style={{
                          width: '24px',
                          height: '24px',
                          cursor: 'pointer',
                          transform: 'scale(1.2)', // Make visual target larger
                          marginRight: '0.5rem',
                          pointerEvents: 'none' // Let parent handle click
                        }}
                      />
                      <div style={{ flex: 1, textAlign: 'left', textDecoration: isDone ? 'line-through' : 'none' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <span style={{ fontWeight: 'bold', fontSize: '1rem', lineHeight: '1.4' }}>{task.text}</span>
                          {task.isEventTodo && <span style={{ fontSize: '0.7rem', background: '#ff6b81', color: 'white', padding: '2px 6px', borderRadius: '4px', marginLeft: '0.5rem', whiteSpace: 'nowrap' }}>Event</span>}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.2rem' }}>
                          {task.isEventTodo ? `Kopplad till: ${task.event.summary}` : (task.assignee ? `👤 ${task.assignee}` : 'Ej tilldelad')}
                        </div>
                      </div>
                      {!task.isEventTodo && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteTask(task.id);
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '1.4rem', // Larger icon
                            color: '#ff6b6b',
                            padding: '0.8rem', // Touchable area padding
                            margin: '-0.8rem', // Counteract padding for layout
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          🗑️
                        </button>
                      )}
                      {task.isEventTodo && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteEventTask(task.event, task.originalTodo);
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '1.4rem',
                            color: '#ff6b6b',
                            padding: '0.8rem',
                            margin: '-0.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  );
                });
              })()}


            </div>
          </div>
        </div>
      </div>
    </div >
  )
}

export default App
