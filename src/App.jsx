import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
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
import NewHome from './components/NewHome';
import EventDetailModal from './components/EventDetailModal';

function App() {
  const [showInbox, setShowInbox] = useState(false);
  const [inboxData, setInboxData] = useState([]); // Store actual items to track UIDs
  const inboxCount = inboxData.length;
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('familyOpsDarkMode') !== 'false');
  const [selectedEventForDetail, setSelectedEventForDetail] = useState(null); // Event detail modal state

  const capitalizeFirst = (str) => str.charAt(0).toUpperCase() + str.slice(1);

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
    // Fetch weather for Cypressvägen 8, Lidköping (approx 58.4883, 13.1789)
    // Update frequently (every 5 mins)
    const fetchWeather = () => {
      fetch('https://api.open-meteo.com/v1/forecast?latitude=58.4883&longitude=13.1789&current=temperature_2m,weather_code,is_day,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&wind_speed_unit=ms&timezone=Europe%2FBerlin')
        .then(res => res.json())
        .then(data => {
          setWeather(data);
        })
        .catch(e => console.error("Weather fetch failed", e));
    };

    fetchWeather();
    const timer = setInterval(fetchWeather, 300000); // 5 minutes
    return () => clearInterval(timer);
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



  // Name colors for standardizing across the app
  const NAME_COLORS = {
    'Svante': '#ff4757',
    'Sarah': '#5352ed',
    'Algot': '#2ed573',
    'Tuva': '#ff6b81',
    'Leon': '#1e90ff'
  };

  // Google Calendar Mapping
  const GOOGLE_CALENDAR_EMAILS = {
    'Svante (Privat)': 'svante.ortendahl@gmail.com',
    'Svante': 'svante.ortendahl@gmail.com',
    'Sarah (Privat)': 'sarah.ortendahl@gmail.com',
    'Sarah': 'sarah.ortendahl@gmail.com',
    'Familjen': 'family17438490542731545369@group.calendar.google.com',
    'Örtendahls familjekalender': 'family17438490542731545369@group.calendar.google.com'
  };

  const getGoogleCalendarLink = (event, forceSave = false) => {
    if (!event) return 'https://calendar.google.com/calendar/r';

    // Determine target calendar 
    const sourceNameHelper = event.source?.split(' (')[0] + ' (Privat)';
    const calendarId = GOOGLE_CALENDAR_EMAILS[event.source] || GOOGLE_CALENDAR_EMAILS[sourceNameHelper];

    // SCENARIO 1: "Save to Calendar" (Add copy) - For external events unknown to us
    // or if explicitly requested via forceSave
    if (forceSave || !calendarId) {
      const startStr = event.start ? new Date(event.start).toISOString().replace(/-|:|\.\d\d\d/g, "") : "";
      const endStr = event.end ? new Date(event.end).toISOString().replace(/-|:|\.\d\d\d/g, "") : "";

      let url = `https://www.google.com/calendar/render?action=TEMPLATE`;
      url += `&text=${encodeURIComponent(event.summary || 'Event')}`;
      if (startStr && endStr) {
        url += `&dates=${startStr}/${endStr}`;
      }
      if (event.description) {
        url += `&details=${encodeURIComponent(event.description)}`;
      }
      if (event.location && event.location !== 'Okänd plats') {
        url += `&location=${encodeURIComponent(event.location)}`;
      }

      // Pre-select Family Calendar for new/copied events
      const familyEmail = GOOGLE_CALENDAR_EMAILS['Familjen'];
      if (familyEmail) {
        url += `&src=${encodeURIComponent(familyEmail)}`;
      }

      return url;
    }

    // SCENARIO 2: "Edit/View" Private Event
    // Try to construct deep link to SPECIFIC event
    // calendarId is already determined above

    if (calendarId && event.uid && event.uid.includes('@google.com')) {
      // Extract ID part (before @google.com)
      const eventId = event.uid.split('@')[0];
      // EID is base64(eventId + " " + calendarId)
      try {
        const eid = btoa(eventId + " " + calendarId);
        return `https://www.google.com/calendar/event?eid=${eid}`;
      } catch (e) {
        console.error("Failed to construct EID", e);
      }
    }

    // FALLBACK: Agenda View (Calendar Root)
    // This is better than /r/day/DATE because mobile OS usually captures the root URL 
    // to open the app, whereas specific paths might force browser.
    return `https://calendar.google.com/calendar/r`;
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
  const [showMatchModal, setShowMatchModal] = useState(false);
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

  const [newEvent, setNewEvent] = useState({
    summary: '', date: '', time: '', endTime: '', location: '', description: '',
    assignments: { driver: null, packer: null },
    todoList: [],
    assignees: [], // Array for multiple selection
    coords: null,
    category: null
  });

  // Task Input State




  // State for Editing an Event
  const [isEditingEvent, setIsEditingEvent] = useState(false);
  const [editEventData, setEditEventData] = useState(null);
  const [holidays, setHolidays] = useState([]); // Store fetched holidays

  // Lock body scroll when any modal is open
  useEffect(() => {
    const isAnyModalOpen = isEditingEvent;
    if (isAnyModalOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => document.body.classList.remove('modal-open');
  }, [isEditingEvent]);

  // Swipe logic removed per user request

  const [scheduleEvents, setScheduleEvents] = useState([]);
  const [activeTab, setActiveTab] = useState('new-home'); // 'dashboard' | 'schedule' | 'new-home'

  useEffect(() => {
    fetchEvents();
    fetchTasks();
    fetchSchedule();
    fetchHolidays();
  }, []);

  // Poll for inbox updates - Re-run if user changes to ensure correct "seen" filter
  useEffect(() => {
    fetchInbox();
    const inboxTimer = setInterval(fetchInbox, 60000);
    return () => clearInterval(inboxTimer);
  }, [currentUser]); // Re-subscribe when user changes

  const getSeenInboxIds = () => {
    const user = currentUser?.name || 'default';
    const key = `familyOps_seenInbox_${user}`;
    try {
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch { return []; }
  };

  const markCurrentInboxAsSeen = () => {
    if (inboxData.length === 0) return;

    const user = currentUser?.name || 'default';
    const key = `familyOps_seenInbox_${user}`;
    const currentSeen = getSeenInboxIds();
    const newIds = inboxData.map(i => i.uid);
    const combined = [...new Set([...currentSeen, ...newIds])];

    localStorage.setItem(key, JSON.stringify(combined));
    setInboxData([]); // Clear badge immediately
  };

  const fetchInbox = () => {
    fetch(getApiUrl('api/inbox'))
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          const seenIds = new Set(getSeenInboxIds());
          // Filter out seen items for the BADGE (they still show in modal)
          const unseen = data.filter(item => !seenIds.has(item.uid));
          setInboxData(unseen);
        }
      })
      .catch(err => console.error("Error fetching inbox count:", err));
  };

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
        // 1. GLOBAL CLEANUP & ENRICHMENT
        // Remove prefixes like "Svante:", tag Football matches, handle cancellation
        const cleanedData = data.map(ev => {
          let newEv = { ...ev };
          const summary = (ev.summary || '');

          // Remove "Name:" prefixes (e.g. "Svante: ...")
          const namePrefixRegex = /^(Svante|Sarah|Algot|Leon|Tuva|Familjen|Örtendahls):\s*/i;
          if (namePrefixRegex.test(summary)) {
            newEv.summary = summary.replace(namePrefixRegex, '');
          }

          const summaryLower = newEv.summary.toLowerCase();

          // Identify Football matches (Arsenal / ÖIS)
          const isArsenal = newEv.source === 'Arsenal FC' || summaryLower.includes('arsenal');
          const isOis = newEv.source === 'Örgryte IS' || summaryLower.includes('örgryte') || summaryLower.includes('orgryte');

          if ((isArsenal || isOis) && !newEv.category) {
            newEv.category = 'Fotboll';
          }

          // Cancellation
          if (summaryLower.includes('inställd')) {
            newEv.cancelled = true;
          }
          return newEv;
        });

        // 2. DEDUPLICATE (on cleaned data)
        const localEvents = cleanedData.filter(e => e.source === 'FamilyOps' || e.createdBy);
        const externalEvents = cleanedData.filter(e => e.source !== 'FamilyOps' && !e.createdBy);

        const uniqueExternal = externalEvents.filter(ext => {
          const isDuplicate = localEvents.some(loc => {
            const sameSummary = loc.summary.trim().toLowerCase() === ext.summary.trim().toLowerCase();
            const sameStart = new Date(loc.start).getTime() === new Date(ext.start).getTime();
            return sameSummary && sameStart;
          });
          return !isDuplicate;
        });

        const processedData = [...localEvents, ...uniqueExternal];

        setEvents(processedData);
        // Försök hämta koordinater och restid för events (asynkront i bakgrunden)
        enrichEventsWithGeo(processedData).then(enriched => setEvents(enriched));
      })
      .catch(err => console.error("Error fetching events:", err));
  };

  const fetchHolidays = () => {
    const year = new Date().getFullYear();
    // Fetch current year and next year to handle year transition
    const urls = [
      `https://sholiday.faboul.se/dagar/v2.1/${year}`,
      `https://sholiday.faboul.se/dagar/v2.1/${year + 1}`
    ];

    Promise.all(urls.map(url => fetch(url).then(r => r.json())))
      .then(results => {
        const allDays = results.flatMap(data => data.dagar);
        const redDays = allDays.filter(d => d.helgdag); // Only keep days with a holiday name

        const holidayEvents = redDays.map(d => ({
          id: `holiday-${d.datum}`,
          summary: d.helgdag,
          start: d.datum,
          end: d.datum,
          source: 'Helgdag',
          category: 'Helgdag',
          isRedDay: d.rod_dag === 'Ja',
          allDay: true
        }));
        setHolidays(holidayEvents);
      })
      .catch(err => console.error("Error fetching holidays:", err));
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

    // Always show Holidays regardless of person filter (since they apply to everyone)
    if (event.source === 'Helgdag' || event.category === 'Helgdag') return true;

    return isNameInSummary || isAssigned || isInAssigneeList || isSourceMatch;
  };

  // Combine remote events and holidays
  const allEvents = useMemo(() => {
    return [...events, ...holidays];
  }, [events, holidays]);

  // Main List: Filter based on viewMode AND common filters
  const filteredEventsList = allEvents.filter(event => {
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
  const heroEvents = allEvents.filter(event => {
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
  // Include ALL filtered events (including today), sorted by start date
  // Today's events should appear first, followed by future events in chronological order
  const otherEvents = [...filteredEventsList].sort((a, b) => new Date(a.start) - new Date(b.start));

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
    // Show banner for ALL Google Calendar events (to provide edit link)
    // Only FamilyOps (old local events) don't need the banner
    const isExternalSource = event.source && event.source !== 'FamilyOps';

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

    // This function now only handles LOCAL saving
    // Google Calendar saving is handled by the separate <a> tag button

    const startDateTime = new Date(`${newEvent.date}T${newEvent.time}`);
    const endDateTime = new Date(`${newEvent.date}T${newEvent.endTime}`);

    try {
      await fetch(getApiUrl('api/events'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: newEvent.summary,
          location: newEvent.location,
          coords: newEvent.coords,
          description: newEvent.description,
          start: startDateTime.toISOString(),
          end: endDateTime.toISOString(),
          assignees: newEvent.assignees || [],
          assignee: (newEvent.assignees || []).join(', '),
          category: newEvent.category || null,
          source: 'Familjen (Eget)'
        })
      });

      // Close modal and reset form
      setActiveTab('timeline'); // Return to calendar/timeline view
      setNewEvent({
        summary: '',
        location: '',
        description: '',
        assignees: [],
        category: null,
        date: new Date().toISOString().split('T')[0],
        time: '12:00',
        endTime: '13:00'
      });

      fetchEvents();
    } catch (err) {
      console.error("Could not create event", err);
      alert("Något gick fel vid skapande av händelse.");
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
      {/* GLOBAL BACKGROUND - Always Dark per user request */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: -1,
        background: `linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.85)), url('/bg-family.jpg')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed'
      }} />


      {/* Header and modals - always visible */}
      <div>



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



        {/* Modal för att redigera event */}
        {
          isEditingEvent && editEventData && (
            <div className="modal-overlay">
              <div className="modal" style={{ padding: '2rem', position: 'relative', color: 'var(--card-text)' }}>
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
                    color: 'var(--card-text)',
                    padding: '0.25rem',
                    lineHeight: 1
                  }}
                  aria-label="Stäng"
                >×</button>
                <h2>✏️ Redigera händelse</h2>

                {/* Show info banner for external events */}
                {editEventData.isExternalSource && (
                  <div style={{
                    background: (editEventData.source?.includes('Svante') || editEventData.source?.includes('Sarah') || editEventData.source?.includes('Örtendahls familjekalender'))
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
                      {(() => {
                        const rawSource = editEventData.originalSource || editEventData.source || 'Familjen';
                        let source = rawSource.split(' (')[0];
                        if (source === 'Familjen') source = 'Örtendahls familjekalender';

                        const isValidSource = source.includes('Svante') || source.includes('Sarah') || source.includes('Örtendahls familjekalender');
                        const subscriptionSources = ['Villa Lidköping', 'HK Lidköping', 'Råda BK', 'Örgryte IS', 'Vklass', 'Arsenal'];
                        const hasSubscriptionSource = subscriptionSources.some(sub => source.includes(sub));


                        // Clean up source name - remove (Privat), (Redigerad), etc.
                        let displaySource = source.split(' (')[0];

                        // Replace "Familjen" with "Örtendahls familjekalender"
                        if (displaySource === 'Familjen' || displaySource.includes('Familjen')) {
                          displaySource = displaySource.replace('Familjen', 'Örtendahls familjekalender');
                        }

                        // Format message based on source type
                        if (hasSubscriptionSource) {
                          return `Källa: ${source}`;
                        }
                        return `Källa: ${displaySource}`; // keep it simple
                      })()}
                    </span>

                    {/* EDIT Button - ONLY for writable Google sources */}
                    {(() => {
                      const isGoogleWritable = (GOOGLE_CALENDAR_EMAILS[editEventData.source] || GOOGLE_CALENDAR_EMAILS[editEventData.source?.split(' (')[0] + ' (Privat)']) && editEventData.uid?.includes('@google.com');

                      // Strict check: Must be "Writable" AND be a real Google Event to show button
                      if (isGoogleWritable) {
                        return (
                          <a
                            href={getGoogleCalendarLink(editEventData, false)} // Deep Link
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              background: 'white',
                              color: '#2ed573',
                              padding: '0.6rem 1rem',
                              borderRadius: '4px',
                              textDecoration: 'none',
                              fontWeight: '600',
                              fontSize: '0.9rem',
                              whiteSpace: 'nowrap',
                              display: 'inline-block',
                              marginTop: '0.5rem',
                              cursor: 'pointer',
                              textAlign: 'center',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                            }}
                          >
                            Redigera i Google-kalendern ↗️
                          </a>
                        );
                      }

                      // If external/subscription but NOT writable -> Show "Read-Only" badge
                      if (editEventData.isExternalSource) {
                        return (
                          <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'rgba(255,255,255,0.9)', fontStyle: 'italic', background: 'rgba(0,0,0,0.1)', padding: '4px 8px', borderRadius: '4px' }}>
                            Prenumeration - redigeras vid källan
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}

                <form onSubmit={updateEvent} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label>Vad händer? {(editEventData.isExternalSource || !isAdmin) && <span style={{ fontSize: '0.75rem', color: '#888' }}>{editEventData.isExternalSource ? '(extern källa)' : '(visa)'}</span>}</label>
                    <input
                      type="text"
                      required
                      value={editEventData.summary}
                      onChange={e => isAdmin && !editEventData.isExternalSource && setEditEventData({ ...editEventData, summary: e.target.value })}
                      readOnly={editEventData.isExternalSource || !isAdmin}
                      style={(editEventData.isExternalSource || !isAdmin)
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
                        onChange={val => isAdmin && setEditEventData({ ...editEventData, location: val })}
                        onSelect={coords => isAdmin && setEditEventData({ ...editEventData, coords })}
                        disabled={!isAdmin}
                      />
                    </div>
                  </div>

                  {/* Who is this event for? */}
                  <div>
                    <label>👥 Vem gäller det? {!isAdmin && <span style={{ fontSize: '0.75rem', color: '#888' }}>(visa)</span>}</label>
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
                              if (!isAdmin) return; // Prevent children from editing
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
                            disabled={!isAdmin}
                            style={{
                              padding: '0.4rem 0.8rem',
                              borderRadius: '15px',
                              border: '1px solid var(--border-color)',
                              background: isSelected ? '#2ed573' : 'var(--input-bg)',
                              color: isSelected ? 'white' : 'var(--card-text)',
                              fontSize: '0.8rem',
                              cursor: isAdmin ? 'pointer' : 'not-allowed',
                              opacity: isAdmin ? 1 : 0.6,
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
                    <label>📂 Kategori {!isAdmin && <span style={{ fontSize: '0.75rem', color: '#888' }}>(visa)</span>}</label>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                      {['Handboll', 'Fotboll', 'Bandy', 'Dans', 'Skola', 'Kalas', 'Arbete', 'Annat'].map(cat => {
                        const isSelected = editEventData.category === cat;
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => isAdmin && setEditEventData({ ...editEventData, category: cat })}
                            disabled={!isAdmin}
                            style={{
                              padding: '0.4rem 0.8rem',
                              borderRadius: '15px',
                              border: '1px solid var(--border-color)',
                              background: isSelected ? '#646cff' : 'var(--input-bg)',
                              color: isSelected ? 'white' : 'var(--card-text)',
                              fontSize: '0.8rem',
                              cursor: isAdmin ? 'pointer' : 'not-allowed',
                              opacity: isAdmin ? 1 : 0.6,
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
                    <label>Beskrivning & Anteckningar {!isAdmin && <span style={{ fontSize: '0.75rem', color: '#888' }}>(visa)</span>}</label>
                    <textarea
                      placeholder="Anteckningar..."
                      value={editEventData.description}
                      onChange={e => isAdmin && !editEventData.isExternalSource && setEditEventData({ ...editEventData, description: e.target.value })}
                      readOnly={editEventData.isExternalSource || !isAdmin}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: '4px',
                        border: '1px solid #ddd',
                        minHeight: '80px',
                        background: (editEventData.isExternalSource || !isAdmin) ? '#f0f0f0' : 'white',
                        cursor: (editEventData.isExternalSource || !isAdmin) ? 'not-allowed' : 'text',
                        opacity: (editEventData.isExternalSource || !isAdmin) ? 0.7 : 1
                      }}
                    ></textarea>
                  </div>

                  {/* Assignment Controls in Modal - Visible for all, editable only for admin */}
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                      <label>🚗 Vem kör? {!isAdmin && <span style={{ fontSize: '0.75rem', color: '#888' }}>(visa)</span>}</label>
                      <select
                        value={editEventData.assignments?.driver || ''}
                        onChange={e => setEditEventData({
                          ...editEventData,
                          assignments: { ...editEventData.assignments, driver: e.target.value || null }
                        })}
                        disabled={!isAdmin}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          borderRadius: '4px',
                          border: '1px solid #ddd',
                          background: isAdmin ? 'white' : '#f0f0f0',
                          cursor: isAdmin ? 'pointer' : 'not-allowed',
                          opacity: isAdmin ? 1 : 0.7
                        }}
                      >
                        <option value="">Välj...</option>
                        <option value="Svante">Svante</option>
                        <option value="Sarah">Sarah</option>
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label>🎒 Vem packar? {!isAdmin && <span style={{ fontSize: '0.75rem', color: '#888' }}>(visa)</span>}</label>
                      <select
                        value={editEventData.assignments?.packer || ''}
                        onChange={e => setEditEventData({
                          ...editEventData,
                          assignments: { ...editEventData.assignments, packer: e.target.value || null }
                        })}
                        disabled={!isAdmin}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          borderRadius: '4px',
                          border: '1px solid #ddd',
                          background: isAdmin ? 'white' : '#f0f0f0',
                          cursor: isAdmin ? 'pointer' : 'not-allowed',
                          opacity: isAdmin ? 1 : 0.7
                        }}
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
                              // Auto-prefix child's name for non-admin users
                              const finalText = !isAdmin && currentUser?.name
                                ? `${currentUser.name} ${text}`
                                : text;
                              setEditEventData({
                                ...editEventData,
                                todoList: [...(editEventData.todoList || []), { id: Date.now(), text: finalText, done: false }]
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
                          // Auto-prefix child's name for non-admin users
                          const finalText = !isAdmin && currentUser?.name
                            ? `${currentUser.name} ${text}`
                            : text;
                          setEditEventData({
                            ...editEventData,
                            todoList: [...(editEventData.todoList || []), { id: Date.now(), text: finalText, done: false }]
                          });
                          input.value = '';
                        }
                      }} style={{ padding: '0.5rem 1rem', borderRadius: '4px', background: '#646cff', color: 'white', border: 'none', cursor: 'pointer' }}>+</button>
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
                      {isAdmin && !editEventData.isExternalSource && (
                        <button type="button" onClick={() => deleteEvent(editEventData)} style={{
                          padding: '0.5rem 0.8rem', borderRadius: '8px', border: 'none', background: '#ff4757', color: 'white', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.3rem'
                        }} title="Ta bort event">
                          <span>🗑️</span> <span style={{ display: isMobile ? 'none' : 'inline' }}>Ta bort</span>
                        </button>
                      )}
                      {isAdmin && !editEventData.cancelled && (
                        <button type="button" onClick={() => cancelEvent(editEventData)} style={{
                          padding: '0.5rem 0.8rem', borderRadius: '8px', border: 'none', background: '#ffa502', color: 'white', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.3rem'
                        }} title="Ställ in">
                          <span>🚫</span> <span style={{ display: isMobile ? 'none' : 'inline' }}>Ställ in</span>
                        </button>
                      )}
                      {/* Directions button for all users */}
                      {editEventData.coords && (
                        <button type="button" onClick={() => {
                          const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${editEventData.coords.lat},${editEventData.coords.lon}`;
                          window.open(googleMapsUrl, '_blank');
                        }} style={{
                          padding: '0.5rem 0.8rem', borderRadius: '8px', border: 'none', background: '#4285f4', color: 'white', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.3rem'
                        }} title="Vägbeskrivning">
                          <span>🗺️</span> <span style={{ display: isMobile ? 'none' : 'inline' }}>Väg</span>
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button type="button" onClick={() => setIsEditingEvent(false)} style={{
                        padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-main)', cursor: 'pointer', fontSize: '0.9rem'
                      }}>Stäng</button>
                      {isAdmin && (
                        <button type="submit" style={{
                          padding: '0.5rem 1.5rem', borderRadius: '8px', border: 'none', background: '#646cff', color: 'white', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(100, 108, 255, 0.3)'
                        }}>Spara</button>
                      )}
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
                  <button onClick={() => setActiveTab('new-home')} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
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

        {/* Match Modal */}
        {showMatchModal && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000
          }} onClick={() => setShowMatchModal(false)}>
            <div style={{
              background: 'var(--modal-bg)', color: 'var(--card-text)', padding: '1.5rem', borderRadius: '16px',
              width: '90%', maxWidth: '500px', maxHeight: '80vh', overflowY: 'auto',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
            }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0 }}>Kommande matcher ⚽</h3>
                <button onClick={() => setShowMatchModal(false)} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--card-text)' }}>✕</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                {events
                  .filter(e => {
                    const isArsenal = e.source === 'Arsenal FC' || (e.summary || '').toLowerCase().includes('arsenal');
                    const isOis = e.source === 'Örgryte IS' || (e.summary || '').toLowerCase().includes('örgryte');
                    return (isArsenal || isOis) && new Date(e.start) > new Date();
                  })
                  .sort((a, b) => new Date(a.start) - new Date(b.start))
                  .slice(0, 10)
                  .map(match => {
                    const isArsenal = match.source === 'Arsenal FC' || (match.summary || '').toLowerCase().includes('arsenal');
                    const matchDate = new Date(match.start);

                    // Arena Logic
                    let arena = match.location;
                    if (!arena || arena === 'Okänd plats') {
                      const summary = match.summary || '';
                      // Check for "HomeTeam - AwayTeam" pattern
                      const parts = summary.split(' - ');
                      if (parts.length >= 2) {
                        const homeTeam = parts[0].trim();

                        if (isArsenal) {
                          if (homeTeam.toLowerCase().includes('arsenal')) {
                            arena = 'Emirates Stadium';
                          } else {
                            arena = `Bortamatch (${homeTeam})`;
                          }
                        } else {
                          // ÖIS
                          if (homeTeam.toLowerCase().includes('ois') || homeTeam.toLowerCase().includes('örgryte') || homeTeam.toLowerCase().includes('orgryte')) {
                            arena = 'Gamla Ullevi';
                          } else {
                            arena = `Bortamatch (${homeTeam})`;
                          }
                        }
                      } else {
                        arena = 'Okänd arena';
                      }
                    }

                    return (
                      <div key={match.uid} style={{
                        background: 'var(--card-bg)',
                        border: '1px solid var(--input-border)',
                        padding: '1rem',
                        borderRadius: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--card-text-muted)' }}>
                            {matchDate.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })} • {matchDate.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span style={{ fontSize: '1.2rem' }}>{isArsenal ? '🔴⚪' : '🔴🔵'}</span>
                        </div>

                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{match.summary}</div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--card-text-muted)' }}>
                          <span>📍</span> {arena}
                        </div>
                      </div>
                    );
                  })}

                {events.filter(e => {
                  const isArsenal = e.source === 'Arsenal FC' || (e.summary || '').toLowerCase().includes('arsenal');
                  const isOis = e.source === 'Örgryte IS' || (e.summary || '').toLowerCase().includes('örgryte');
                  return (isArsenal || isOis) && new Date(e.start) > new Date();
                }).length === 0 && (
                    <p style={{ textAlign: 'center', fontStyle: 'italic', color: 'var(--card-text-muted)' }}>Inga kommande matcher hittades.</p>
                  )}
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <header className="header" style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr', /* This ensures true centering of the middle element */
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 1rem', /* Ensure padding is symmetric */
          position: 'relative', // Ensure header creates stacking context
          zIndex: 100 // Sit above fixed backgrounds
        }}>
          {/* Left: Home + Title (Title hidden on mobile) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
            {/* Title only shows on desktop */}
            {!isMobile && (
              <h1 style={{ margin: 0, fontSize: '1.5rem', marginRight: '1rem', whiteSpace: 'nowrap' }}>
                Örtendahls familjecentral
              </h1>
            )}

            <button
              onClick={() => setActiveTab('new-home')}
              title="Hem"
              style={{
                background: activeTab === 'new-home' ? '#646cff' : 'transparent',
                color: activeTab === 'new-home' ? 'white' : 'var(--text-main)',
                border: activeTab === 'new-home' ? 'none' : '1px solid var(--border-color)',
                borderRadius: '8px',
                cursor: 'pointer',
                padding: isMobile ? '0.4rem' : '0.5rem',
                fontSize: isMobile ? '1.3rem' : '1.4rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </button>

            {/* Quick Links - only show in HA environment */}
            {(window.location.pathname.includes('ingress') ||
              window.location.pathname.includes('hassio') ||
              window.location.hostname.includes('homeassistant') ||
              window.location.hostname.includes('nabu.casa')) && [
                {
                  name: 'Översikt', url: '/lovelace/Oversikt', icon: (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                      <polyline points="9 22 9 12 15 12 15 22"></polyline>
                    </svg>
                  )
                },
                {
                  name: 'Belysning', url: '/lovelace/hue', icon: (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18h6" />
                      <path d="M10 22h4" />
                      <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
                    </svg>
                  )
                },
                {
                  name: 'Larm', url: '/lovelace/larm', icon: (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                    </svg>
                  )
                },
                {
                  name: 'Bil', url: '/lovelace/bil', icon: (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
                      <circle cx="7" cy="17" r="2" />
                      <circle cx="17" cy="17" r="2" />
                      <path d="M14 17H9" />
                    </svg>
                  )
                }
              ].map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_top"
                  title={link.name}
                  style={{
                    textDecoration: 'none',
                    display: 'flex',  // Anchor tag behaves as container
                    alignItems: 'center',
                    marginLeft: '0.4rem'
                  }}
                >
                  <div
                    style={{
                      background: 'transparent',
                      color: 'var(--text-main)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      padding: isMobile ? '0.4rem' : '0.5rem',
                      fontSize: isMobile ? '1.3rem' : '1.4rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {link.icon}
                  </div>
                </a>
              ))}
          </div>

          {/* Center: Ticker */}
          <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>



            {/* Next Match Ticker REMOVED per user request */}

          </div>



          {/* Right: Menu */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>

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
                  fontSize: isMobile ? '1.3rem' : '1.4rem',
                  position: 'relative' // For badge positioning
                }}
              >
                ☰
                {inboxCount > 0 && currentUser?.role !== 'child' && (
                  <div style={{
                    position: 'absolute',
                    top: '-5px',
                    right: '-5px',
                    background: '#ff4757',
                    color: 'white',
                    borderRadius: '50%',
                    width: '18px',
                    height: '18px',
                    fontSize: '0.7rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    border: '2px solid var(--card-bg)'
                  }}>
                    {inboxCount}
                  </div>
                )}
              </button>

              {showMoreMenu && (
                <>
                  {/* Backdrop to close menu when clicking outside */}
                  <div
                    onClick={() => setShowMoreMenu(false)}
                    style={{
                      position: 'fixed',
                      top: 0,
                      left: 0,
                      width: '100vw',
                      height: '100vh',
                      zIndex: 999, // Just below the menu (which is 1000)
                      cursor: 'default'
                    }}
                  />
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
                    overflow: 'hidden',
                    color: 'var(--card-text)' // Ensure text inherits correct color
                  }}>
                    {currentUser?.role !== 'child' && (
                      <button
                        onClick={() => {
                          markCurrentInboxAsSeen(); // Mark as seen BEFORE opening
                          setShowInbox(true);
                          setShowMoreMenu(false);
                          // fetchInbox(); // No need to fetch immediately, we just cleared it. 
                          // Modal will fetch its own data.
                        }}
                        style={{
                          width: '100%',
                          padding: '0.8rem 1rem',
                          background: 'transparent',
                          border: 'none',
                          borderBottom: '1px solid var(--border-color)',
                          color: 'var(--card-text)',
                          fontSize: '0.95rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          textAlign: 'left',
                          whiteSpace: 'nowrap',
                          justifyContent: 'space-between' // To push count to right
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          📥 Inkorg
                        </span>
                        {inboxCount > 0 && (
                          <span style={{
                            background: '#ff4757',
                            color: 'white',
                            padding: '0.1rem 0.5rem',
                            borderRadius: '10px',
                            fontSize: '0.8rem',
                            fontWeight: 'bold'
                          }}>
                            {inboxCount}
                          </span>
                        )}
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => { fetchTrash(); setViewTrash(true); setShowMoreMenu(false); }}
                        style={{
                          width: '100%',
                          padding: '0.8rem 1rem',
                          background: 'transparent',
                          border: 'none',
                          borderBottom: '1px solid var(--border-color)',
                          color: 'var(--card-text)',
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
                        color: 'var(--card-text)',
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
                    {currentUser && (currentUser.name === 'Svante' || currentUser.name === 'Sarah') && (
                      <button
                        onClick={() => { setActiveTab('dashboard'); setShowMoreMenu(false); }}
                        style={{
                          width: '100%',
                          padding: '0.8rem 1rem',
                          background: 'transparent',
                          border: 'none',
                          borderBottom: '1px solid var(--border-color)',
                          color: 'var(--card-text)',
                          fontSize: '0.95rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          textAlign: 'left',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        📊 Gamla Dashboarden
                      </button>
                    )}
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
                </>
              )}
            </div>
          </div >



        </header >
      </div >
      {/* END of dashboard-only block for header area */}

      {/* Global Back Button for helper views */}
      {
        activeTab !== 'new-home' && activeTab !== 'day-view' && activeTab !== 'create-event' && (
          <div style={{ width: '100%', textAlign: 'left', paddingBottom: '0.5rem' }}>
            <button
              onClick={() => setActiveTab('new-home')}
              style={{
                background: 'transparent', border: 'none', fontSize: '1rem', cursor: 'pointer',
                color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '1rem 0', opacity: 0.8
              }}
            >
              ‹ Tillbaka till start
            </button>
          </div>
        )
      }

      {/* Schedule Tab Content - shown after header */}
      {
        activeTab === 'schedule' && (
          <div className="tab-content" style={{ padding: '1rem' }}>
            <ScheduleViewer events={scheduleEvents} initialStudent={currentUser?.name} />
          </div>
        )
      }

      {/* NEW HOME TEST VIEW */}
      {
        activeTab === 'new-home' && (
          <NewHome
            user={currentUser}
            weather={weather}
            events={(() => {
              if (!currentUser || currentUser.role !== 'child') return events;
              return events.filter(e => {
                const assigned = e.assignees && e.assignees.includes(currentUser.name);
                const isSource = e.source === currentUser.name;
                const isDriver = e.assignments?.driver === currentUser.name;
                const isPacker = e.assignments?.packer === currentUser.name;
                return assigned || isSource || isDriver || isPacker;
              });
            })()}
            tasks={(() => {
              if (!currentUser || currentUser.role !== 'child') return tasks;
              return tasks.filter(t => t.assignee === currentUser.name);
            })()}
            setActiveTab={setActiveTab}
            onOpenModal={openEditModal}
            setSelectedDate={setSelectedDate}
            setViewMode={setViewMode}
            holidays={holidays}
            onOpenEventDetail={setSelectedEventForDetail}
            onOpenMatchModal={() => setShowMatchModal(true)}
            darkMode={darkMode}
          />
        )
      }

      {/* CREATE EVENT VIEW */}
      {
        activeTab === 'create-event' && (
          <div className="create-event-view" style={{ padding: '1rem', maxWidth: '800px', margin: '0 auto', paddingBottom: '80px', color: 'var(--card-text)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h2>✨ Skapa ny händelse</h2>
              {/* Close button that goes back to dashboard */}
              <button
                onClick={() => setActiveTab('timeline')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: 'var(--card-text)',
                  padding: '0.25rem',
                  lineHeight: 1
                }}
                aria-label="Stäng"
              >
                ✕
              </button>
            </div>

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
                <button type="button" onClick={() => setActiveTab('new-home')} style={{
                  padding: '0.75rem 1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-main)', cursor: 'pointer'
                }}>Avbryt</button>
                {(() => {
                  const hasSvante = newEvent.assignees.includes('Svante');
                  const hasSarah = newEvent.assignees.includes('Sarah');
                  const hasChildren = newEvent.assignees.some(name => ['Algot', 'Tuva', 'Leon'].includes(name));
                  const isFamily = newEvent.assignees.length === 0; // "Hela familjen"

                  // Determine target label
                  // LOGIC: Defaults to Family if children involved or mixed.
                  // Only pure single-parent events go to private calendars.
                  let googleTarget = 'Familjen';

                  if (hasSvante && !hasSarah && !hasChildren && !isFamily) googleTarget = 'Svante';
                  else if (hasSarah && !hasSvante && !hasChildren && !isFamily) googleTarget = 'Sarah';

                  // If forced target by explicit assignee selection logic above fails, it remains 'Familjen'

                  if (googleTarget) {
                    const baseDate = (newEvent.date || '').replace(/-/g, '');
                    const startTime = (newEvent.time || '12:00').replace(/:/g, '') + '00';
                    const endTime = (newEvent.endTime || newEvent.time || '13:00').replace(/:/g, '') + '00';
                    const dates = `${baseDate}T${startTime}/${baseDate}T${endTime}`;

                    const text = encodeURIComponent(newEvent.summary || 'Ny händelse');
                    const details = encodeURIComponent(`${newEvent.description || ''}\n\n(Skapad via Family-Ops)`);
                    const location = encodeURIComponent(newEvent.location || '');

                    // Add src parameter to pre-select calendar
                    const targetEmail = GOOGLE_CALENDAR_EMAILS[googleTarget === 'Familjen' ? 'Familjen' : `${googleTarget} (Privat)`];
                    let googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}&location=${location}`;
                    if (targetEmail) {
                      googleUrl += `&src=${encodeURIComponent(targetEmail)}`;
                    }

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                        <a
                          href={googleUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setActiveTab('new-home')}
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
                          📅 {googleTarget === 'Familjen' ? 'Skapa i familjens Google-kalender' : `Skapa i ${googleTarget}s Google-kalender`} ↗
                        </a>
                        <button
                          type="submit"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#888',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            textDecoration: 'underline'
                          }}
                        >
                          eller spara bara lokalt
                        </button>
                      </div>
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
        )
      }

      {/* DAY VIEW (Full Page) */}
      {
        activeTab === 'day-view' && (
          <div className="day-view-container" style={{ padding: '1rem', maxWidth: '800px', margin: '0 auto', paddingBottom: '80px', minHeight: '100vh', background: 'var(--bg-color)' }}>

            {/* Header with Navigation */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', marginTop: '0.5rem' }}>
              <button
                onClick={() => setActiveTab('new-home')}
                style={{
                  background: 'transparent', border: 'none', fontSize: '1rem', cursor: 'pointer',
                  color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.4rem',
                  opacity: 0.8
                }}
              >
                ‹ Tillbaka
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button onClick={() => changeDay(-1)} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-main)', opacity: 0.7 }}>‹</button>
                <div style={{ textAlign: 'center', lineHeight: '1.2' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{capitalizeFirst(selectedDate.toLocaleDateString('sv-SE', { weekday: 'long' }))}</div>
                  <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                    {selectedDate.getDate()} {selectedDate.toLocaleDateString('sv-SE', { month: 'short' })}
                  </div>
                </div>
                <button onClick={() => changeDay(1)} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-main)', opacity: 0.7 }}>›</button>
              </div>

              <div style={{ width: '60px' }}></div> {/* Spacer for center alignment */}
            </div>

            {/* Content List */}
            <div className="day-view-content" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {(() => {
                const combined = [];
                const now = new Date(); // Used for sorting past/future events if needed

                // 1. Add Tasks
                heroTasks.forEach(task => {
                  combined.push({ type: 'task', data: task });
                });

                // 2. Add Events
                heroEvents.forEach(event => {
                  combined.push({ type: 'event', data: event });
                });

                if (combined.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: '4rem 1rem', opacity: 0.6, fontStyle: 'italic' }}>
                      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>☕</div>
                      Inga händelser eller uppgifter denna dag.
                    </div>
                  );
                }

                // 3. Sort Combined List
                combined.sort((a, b) => {
                  const getCategory = (item) => {
                    if (item.type === 'task') {
                      return item.data.done ? 0 : 3; // Done tasks first or last? Usually Done last if focusing on todo. User didn't specify, sticking to previous logic: Done (0), Future Evt (2), Undone Task (3). Wait, previous logic was weird.
                      // Let's optimize: Undone Task (0), Future Event (1), Done Task (2), Past Event (3)?
                      // User wants "Flow". Time based.
                      return item.data.done ? 3 : 0;
                    } else {
                      // Event
                      return 1;
                    }
                  };

                  // Simple Sort by Time for events, tasks at top/bottom depending
                  if (a.type === 'event' && b.type === 'event') {
                    return new Date(a.data.start) - new Date(b.data.start);
                  }
                  if (a.type === 'task' && b.type === 'task') return 0;
                  if (a.type === 'event') return 1; // Events after tasks? Or time based?
                  return -1;
                });

                // RE-SORTING based on TIME for everything roughly?
                // Let's stick to the previous grouping which seemed accepted:
                // Tasks mixed in?
                // Let's simply map them nicely.

                return combined.map((item) => {
                  const key = item.type === 'task' ? `task-${item.data.id}` : `event-${item.data.uid}`;

                  if (item.type === 'task') {
                    const task = item.data;
                    return (
                      <div key={key} className="card" style={{ padding: '0.8rem', background: 'var(--card-bg)', color: 'var(--text-main)', borderLeft: '4px solid #2ed573', opacity: task.done ? 0.6 : 1, borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 'bold', textDecoration: task.done ? 'line-through' : 'none', fontSize: '1rem' }}>{task.done ? '✅' : '⬜'} {task.text}</span>
                          <span style={{ fontSize: '0.7rem', background: 'rgba(46, 213, 115, 0.2)', padding: '2px 6px', borderRadius: '4px', color: '#2ed573' }}>Uppgift</span>
                        </div>
                        {task.assignee && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>👤 {task.assignee}</div>}
                      </div>
                    );
                  } else {
                    const event = item.data;
                    let sourceClass = '';
                    if (event.source === 'Svante (Privat)') sourceClass = 'source-svante';
                    if (event.source === 'Sarah (Privat)') sourceClass = 'source-mamma';

                    const assignments = event.assignments || {};
                    const isFullyAssigned = assignments.driver && assignments.packer;

                    return (
                      <div key={key} className={`card ${sourceClass} ${isFullyAssigned ? 'assigned' : ''}`}
                        style={{
                          cursor: 'pointer',
                          background: 'var(--card-bg)',
                          color: 'var(--text-main)',
                          padding: '0.8rem',
                          borderRadius: '12px',
                          border: '1px solid var(--border-color)',
                          borderLeft: `4px solid ${event.source && event.source.includes('Svante') ? '#ff7675' : '#74b9ff'}`,
                          marginBottom: '0.5rem',
                          ...(event.cancelled ? { opacity: 0.6, textDecoration: 'line-through' } : {})
                        }}
                        onClick={(e) => { e.stopPropagation(); openEditModal(event); }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', opacity: 0.8, fontSize: '0.8rem' }}>
                          <span>
                            {new Date(event.start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                            {' - '}
                            {new Date(event.end).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 5px', borderRadius: '4px', fontSize: '0.7em' }}>{event.source || 'Familjen'}</span>
                        </div>

                        <h3 style={{ fontSize: '1.2rem', margin: '0 0 0.3rem 0', lineHeight: '1.3' }}>{event.summary}</h3>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                          <span>📍 {event.location || 'Plats ej angiven'}</span>
                        </div>

                        {event.travelTime && (
                          <div style={{ marginTop: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(255,255,255,0.1)', padding: '0.3rem 0.6rem', borderRadius: '6px', fontSize: '0.8rem' }}>
                            <span>🚗</span>
                            <span>{formatDuration(event.travelTime.duration)}</span>
                          </div>
                        )}
                      </div>
                    );
                  }
                })
              }
              )()}
            </div>
          </div>
        )
      }

      {/* Dashboard content continues here - Only visible activeTab === 'dashboard' */}
      <div style={{ display: (activeTab === 'dashboard' || activeTab === 'timeline' || activeTab === 'todos') ? 'block' : 'none' }}>

        {/* Greeting Section - Above Hero - ONLY DASHBOARD */}
        <div style={{ padding: '0.5rem 1rem 0.2rem', textAlign: 'left', marginTop: '0.5rem', display: activeTab === 'dashboard' ? 'block' : 'none' }}>
          <p style={{ margin: 0, fontSize: isMobile ? '1.2rem' : '1.4rem', fontWeight: 'bold', color: 'var(--text-main)' }}>
            Hej {currentUser.name}!
          </p>
        </div>

        {/* Today Hero Section - ONLY DASHBOARD */}
        <div
          className={`${getHeroClass()} has-custom-bg`}
          style={{
            '--hero-bg': `url(${heroCustomImg})`,
            display: activeTab === 'dashboard' ? 'flex' : 'none'
          }}
        >
          <div className="hero-header" style={{ width: '100%', marginBottom: '0.5rem' }}>
            {/* Date row */}
            <h2 style={{ fontSize: isMobile ? '1.4rem' : '2.2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', margin: 0, marginBottom: '0.3rem', marginTop: '-0.3rem' }}>
              <button
                onClick={() => changeDay(-1)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'white',
                  fontSize: isMobile ? '4rem' : '3rem', /* Larger on mobile for easier touch */
                  fontWeight: '300',
                  cursor: 'pointer',
                  opacity: 0.8,
                  padding: '0 0.2rem',
                  textShadow: '0 2px 5px rgba(0,0,0,0.5)',
                  lineHeight: 1
                }}
              >
                ‹
              </button>
              <span style={{ textAlign: 'center', flexGrow: 1, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                {isToday(selectedDate)
                  ? `Idag, ${selectedDate.toLocaleDateString('sv-SE', { weekday: 'long' })}, ${selectedDate.getDate()} ${selectedDate.toLocaleDateString('sv-SE', { month: 'long' })}`
                  : `${capitalizeFirst(selectedDate.toLocaleDateString('sv-SE', { weekday: 'long' }))}, ${selectedDate.getDate()} ${selectedDate.toLocaleDateString('sv-SE', { month: 'long' })}`
                }
              </span>
              <button
                onClick={() => changeDay(1)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'white',
                  fontSize: isMobile ? '4rem' : '3rem', /* Larger on mobile for easier touch */
                  fontWeight: '300',
                  cursor: 'pointer',
                  opacity: 0.8,
                  padding: '0 0.2rem',
                  textShadow: '0 2px 5px rgba(0,0,0,0.5)',
                  lineHeight: 1
                }}
              >
                ›
              </button>
            </h2>
            {(() => {
              const holidayToday = holidays.find(h => isSameDay(h.start, selectedDate));
              if (holidayToday) {
                return (
                  <div style={{ textAlign: 'center', color: '#ff6b6b', fontWeight: 'bold', textShadow: '0 1px 3px rgba(0,0,0,0.8)', fontSize: '1.1rem', marginTop: '-0.3rem', marginBottom: '0.5rem' }}>
                    🎄 {holidayToday.summary} 🎄
                  </div>
                );
              }
            })()}

            {/* Clock + Weather row */}
            {/* Clock + Weather row */}
            <div style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'space-between', gap: '1rem' }}>
              <div style={{
                fontSize: isMobile ? '1rem' : '2rem', /* Match Weather Temp */
                fontWeight: 'bold',
                lineHeight: '1',
                background: 'rgba(255,255,255,0.2)',
                padding: isMobile ? '0.2rem 0.4rem' : '0.5rem 1rem',
                borderRadius: '10px',
                backdropFilter: 'blur(5px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: isMobile ? '85px' : '130px', /* Fixed identical width */
                minWidth: isMobile ? '85px' : '130px',
              }}>
                {currentTime.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="weather-widget"
                style={{
                  cursor: 'pointer',
                  background: 'rgba(255,255,255,0.2)',
                  padding: isMobile ? '0.2rem 0.4rem' : '0.5rem 1rem',
                  borderRadius: '10px', /* Match Clock */
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center', /* Center content */
                  width: isMobile ? '85px' : '130px', /* Fixed identical width */
                  minWidth: isMobile ? '85px' : '130px',
                  gap: '0.5rem',
                  backdropFilter: 'blur(5px)',
                  zIndex: 10
                }}
                onClick={() => window.open('https://www.yr.no/nb/v%C3%A6rvarsel/daglig-tabell/2-2703382/Sverige/V%C3%A4stra%20G%C3%B6talands%20l%C3%A4n/Lidk%C3%B6pings%20Kommun/Jakobstorp', '_blank')}
                title="Se prognos hos YR"
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
                          padding: isMobile ? '0.2rem' : '0.6rem',
                          background: 'rgba(255,255,255,0.2)', /* Match weather widget */
                          backdropFilter: 'blur(5px)',
                          color: 'white',
                          maxWidth: isMobile ? '110px' : '220px',
                          margin: isMobile ? '0' : '0 auto',
                          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                          textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                          position: isMobile ? 'absolute' : 'relative',
                          bottom: isMobile ? '2px' : 'auto',
                          left: isMobile ? '50%' : 'auto',
                          transform: isMobile ? 'translateX(-50%)' : 'none',
                          zIndex: 5,
                          border: 'none', /* Remove grey strip from .card class */
                          borderRadius: '10px' /* Match weather widget radius */
                        }}
                      >
                        <h3 style={{ margin: '0 0 0.1rem 0', fontSize: isMobile ? '0.65rem' : '0.9rem' }}>
                          Dagens händelser
                        </h3>
                        <p style={{ margin: 0, fontSize: isMobile ? '0.65rem' : '0.8rem' }}>
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
                                onClick={(e) => { e.stopPropagation(); openEditModal(event); }}
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
                                    openEditModal(event);
                                  }}
                                  style={{ cursor: 'pointer', color: event.coords ? '#4a90e2' : 'inherit', textDecoration: event.coords ? 'underline' : 'none' }}
                                  title="Klicka för att se detaljer">
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
              color: 'var(--card-text)',
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
                  overflowY: 'auto',
                  color: 'var(--card-text)'
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
                      color: 'var(--card-text)',
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
                            color: filterChild === child ? 'white' : 'var(--card-text)',
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
                            color: filterCategory === cat ? 'white' : 'var(--card-text)',
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
        <div className={`main-content-grid ${viewMode === 'week' ? 'week-view-active' : ''} ${activeTab !== 'dashboard' ? 'single-view-active' : ''}`} style={isMobile ? {
          marginTop: '0',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        } : { marginTop: '0' }}>
          {/* Left: Timeline / Calendar View */}
          <div className="timeline-section" style={{
            display: (activeTab === 'dashboard' || activeTab === 'timeline') ? 'block' : 'none',
            flex: (activeTab === 'timeline') ? '1 1 100%' : '2' // Full width if standalone
          }}>


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
                  { id: 'week', label: `Vecka ${getWeekNumber(selectedDate)}` },
                  { id: 'month', label: selectedDate.toLocaleDateString('sv-SE', { month: 'long' }) },
                  { id: 'create', label: '+ Ny händelse' },
                  { id: 'history', label: 'Historik' }
                ].map(view => (
                  <button
                    key={view.id}
                    onClick={() => {
                      if (view.id === 'create') {
                        setNewEvent({
                          summary: '',
                          location: '',
                          description: '',
                          assignees: [],
                          category: null,
                          date: selectedDate.toLocaleDateString('sv-SE'), // Use currently selected date
                          time: '12:00',
                          endTime: '13:00'
                        });
                        setActiveTab('create-event');
                      } else {
                        setViewMode(view.id);
                      }
                    }}
                    style={{
                      background: viewMode === view.id ? 'var(--card-bg)' : 'transparent',
                      color: viewMode === view.id ? 'var(--card-text)' : 'var(--text-muted)',
                      border: 'none',
                      borderRadius: '24px',
                      padding: '0.6rem 1rem',
                      fontSize: '0.9rem',
                      cursor: 'pointer',
                      fontWeight: viewMode === view.id ? '600' : '500',
                      boxShadow: viewMode === view.id ? '0 4px 12px rgba(0,0,0,0.2)' : 'none',
                      transition: 'all 0.2s ease',
                      whiteSpace: 'nowrap',
                      flex: 1,
                      textAlign: 'center',
                      opacity: viewMode === view.id ? 1 : 0.7
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
                  <span style={{ color: 'var(--text-main)' }}>
                    📅 Kommande händelser
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
                          onClick={() => {
                            if (window.confirm('Vill du skapa en ny händelse?')) {
                              changeDay(Math.floor((d.date - selectedDate) / (1000 * 60 * 60 * 24))); // Select this day
                              setNewEvent({ ...newEvent, date: d.date.toLocaleDateString('sv-SE') }); // Pre-fill date
                              setActiveTab('create-event'); // Open creator
                            }
                          }}
                        >
                          {(() => {
                            const isRed = holidays.some(h => isSameDay(h.start, d.date) && h.isRedDay);
                            return (
                              <div style={{ textAlign: 'right', fontWeight: 'bold', marginBottom: '0.2rem', color: isRed ? '#ff4757' : 'inherit' }}>{d.day}</div>
                            );
                          })()}
                          {dayEvents.slice(0, 4).map(ev => {
                            let sourceClass = '';
                            if (ev.source.includes('Svante')) sourceClass = 'source-svante';
                            if (ev.source.includes('Sarah')) sourceClass = 'source-mamma';
                            return (
                              <div key={ev.uid}
                                className={`calendar-event ${ev.date < new Date() ? 'done' : ''} ${sourceClass}`}
                                style={{ textDecoration: ev.cancelled ? 'line-through' : 'none', opacity: ev.cancelled ? 0.6 : 1 }}
                                title={ev.summary}
                                onClick={(e) => { e.stopPropagation(); openEditModal(ev); }}>
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
                      const dayEvents = filteredEventsList
                        .filter(e => isSameDay(e.start, d))
                        .sort((a, b) => new Date(a.start) - new Date(b.start));
                      const isTodayHeader = isSameDay(d, new Date());
                      return (
                        <div
                          key={d.toISOString()}
                          className="week-column"
                          id={isTodayHeader ? 'today-column' : undefined}
                          style={{
                            flex: 1,
                            background: 'var(--card-bg)',
                            borderRadius: '24px',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            cursor: 'pointer' // Indicate clickable background
                          }}
                          onClick={() => {
                            // Clicking the column background opens create event for that day
                            if (window.confirm('Vill du skapa en ny händelse?')) {
                              setSelectedDate(d);
                              setNewEvent({ ...newEvent, date: d.toLocaleDateString('sv-SE') });
                              setActiveTab('create-event');
                            }
                          }}
                        >
                          <div className="week-column-header" style={{
                            padding: '1rem',
                            textAlign: 'center',
                            background: isTodayHeader ? '#2ed573' : 'rgba(255,255,255,0.03)',
                            color: isTodayHeader ? 'white' : 'var(--text-main)',
                            fontWeight: 'bold',
                            borderBottom: '1px solid rgba(255,255,255,0.05)'
                          }}>
                            <div style={{ textTransform: 'capitalize', fontSize: '1.1rem' }}>{d.toLocaleDateString('sv-SE', { weekday: 'short' })}</div>
                            <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>{d.getDate()}/{d.getMonth() + 1}</div>
                          </div>
                          <div className="week-column-body" style={{ padding: '0.5rem', flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {dayEvents.map(ev => {
                              let sourceClass = '';
                              if (ev.source.includes('Svante')) sourceClass = 'source-svante';
                              if (ev.source.includes('Sarah')) sourceClass = 'source-mamma';
                              const colorClass = getAssignedColorClass(ev);

                              // Get border color based on assignee
                              const getBorderColor = () => {
                                const summary = (ev.summary || '').toLowerCase();
                                const assignees = ev.assignees || [];
                                const assigneesLower = assignees.map(a => a.toLowerCase()).join(' ');

                                if (assigneesLower.includes('algot') || summary.includes('algot')) return '#3498db'; // Blue
                                if (assigneesLower.includes('leon') || summary.includes('leon')) return '#2ed573'; // Green
                                if (assigneesLower.includes('tuva') || summary.includes('tuva')) return '#9b59b6'; // Purple
                                if (assigneesLower.includes('svante') || summary.includes('svante')) return '#ff7675'; // Red
                                if (assigneesLower.includes('sarah') || summary.includes('sarah')) return '#f1c40f'; // Yellow
                                return '#74b9ff'; // Default blue
                              };

                              return (
                                <div key={ev.uid}
                                  className={`card ${sourceClass} ${colorClass}`}
                                  style={{
                                    padding: '0.8rem',
                                    fontSize: '0.8rem',
                                    marginBottom: '0',
                                    borderRadius: '16px',
                                    background: 'rgba(255,255,255,0.08)',
                                    border: 'none',
                                    borderLeft: `4px solid ${getBorderColor()}`,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.2rem',
                                    lineHeight: '1.3'
                                  }}
                                  onClick={(e) => { e.stopPropagation(); openEditModal(ev); }}
                                >
                                  <div style={{ fontWeight: 'bold', opacity: 0.9 }}>
                                    {new Date(ev.start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                  <div style={{ fontWeight: 600, fontSize: '0.9rem', textDecoration: ev.cancelled ? 'line-through' : 'none' }}>
                                    {ev.cancelled && <span style={{ color: '#ff4757', marginRight: '0.2rem' }}>🚫</span>}
                                    {ev.summary}
                                  </div>
                                  {ev.location && ev.location !== 'Okänd plats' && (
                                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                                      📍 {ev.location}
                                    </div>
                                  )}

                                  <div style={{ transform: 'scale(0.9)', transformOrigin: 'top left', marginLeft: '-2px', marginTop: '0.2rem' }}>
                                    {renderTravelInfo(ev)}
                                  </div>

                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem', marginTop: '0.2rem' }}>
                                    {ev.assignments && (ev.assignments.driver || ev.assignments.packer) && (
                                      <>
                                        {ev.assignments.driver && <span style={{ fontSize: '0.7em', background: 'rgba(255,255,255,0.15)', padding: '2px 6px', borderRadius: '4px' }}>🚗 {ev.assignments.driver}</span>}
                                        {ev.assignments.packer && <span style={{ fontSize: '0.7em', background: 'rgba(255,255,255,0.15)', padding: '2px 6px', borderRadius: '4px' }}>🎒 {ev.assignments.packer}</span>}
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
                otherEvents.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Inga kommande händelser matchar filtret.</p>
                ) : (
                  (() => {
                    let lastDate = null;
                    let lastWeek = null;
                    return otherEvents.map((event, index) => {
                      const eventDate = new Date(event.start);
                      const eventDateStr = eventDate.toLocaleDateString('sv-SE');
                      const eventWeek = getWeekNumber(eventDate);

                      // Check if new week
                      const showWeekSeparator = lastWeek !== null && lastWeek !== eventWeek;
                      // Check if new day (within same week or not)
                      const showDaySeparator = lastDate !== eventDateStr;

                      lastDate = eventDateStr;
                      lastWeek = eventWeek;

                      let sourceClass = '';
                      if (event.source === 'Svante (Privat)') sourceClass = 'source-svante';
                      if (event.source === 'Sarah (Privat)') sourceClass = 'source-mamma';
                      const assignments = event.assignments || {};
                      const isFullyAssigned = assignments.driver && assignments.packer;
                      const colorClass = getAssignedColorClass(event);

                      return (
                        <Fragment key={event.uid}>
                          {/* Week separator */}
                          {showWeekSeparator && (
                            <div style={{
                              margin: '1.5rem 0 1rem 0',
                              padding: '0.4rem 1rem',
                              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                              borderRadius: '12px',
                              color: 'white',
                              fontWeight: 'bold',
                              fontSize: '1rem',
                              textAlign: 'center',
                              boxShadow: '0 4px 6px rgba(102, 126, 234, 0.3)'
                            }}>
                              <span style={{ fontSize: '1.2rem', marginRight: '0.5rem' }}>📅</span> Vecka {eventWeek}
                            </div>
                          )}

                          {/* Day separator */}
                          {showDaySeparator && (
                            <div style={{
                              margin: '2rem 0 0.5rem 0',
                              padding: '0.5rem 1rem',
                              background: 'transparent',
                              borderRadius: '8px',
                              fontWeight: '600',
                              fontSize: '0.9rem',
                              color: 'var(--text-muted)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.6rem'
                            }}>
                              <span style={{ color: holidays.some(h => isSameDay(h.start, eventDate) && h.isRedDay) ? '#ff4757' : 'inherit' }}>
                                {(() => {
                                  const dateStr = eventDate.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
                                  const tomorrow = new Date();
                                  tomorrow.setDate(tomorrow.getDate() + 1);
                                  const isTomorrow = isSameDay(eventDate, tomorrow);

                                  if (isToday(eventDate)) {
                                    // "Idag, söndag 29 december" - lowercase day name
                                    return <><strong style={{ marginRight: '0.3rem' }}>Idag,</strong>{dateStr}</>;
                                  } else if (isTomorrow) {
                                    // "Imorgon, måndag 30 december" - lowercase day name
                                    return <><strong style={{ marginRight: '0.3rem' }}>Imorgon,</strong>{dateStr}</>;
                                  } else {
                                    // "Tisdag 31 december" - capitalize first letter
                                    return dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
                                  }
                                })()}
                              </span>
                            </div>
                          )}

                          {/* Event card */}
                          <div className={`card ${sourceClass} ${colorClass} ${isFullyAssigned ? 'assigned' : ''}`}
                            style={{
                              cursor: 'pointer',
                              padding: '1rem',
                              marginBottom: '0.8rem',
                              borderRadius: '24px',
                              background: 'var(--card-bg)',
                              border: '1px solid var(--border-color)',
                              borderLeft: `4px solid ${event.source && event.source.includes('Svante') ? '#ff7675' : '#74b9ff'}`,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.2rem'
                            }}
                            onClick={() => openEditModal(event)}
                          >
                            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.85rem' }}>
                              <span className="time" style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>
                                {new Date(event.start).toLocaleString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span className="source-badge" style={{ opacity: 0.7, fontSize: '0.8em' }}>
                                {(() => {
                                  const source = event.source || 'Familjen';
                                  // If it's a subscription source that was auto-imported through the family calendar
                                  const subscriptionSources = ['Villa Lidköping', 'HK Lidköping', 'Råda BK', 'Örgryte IS', 'Vklass', 'Arsenal'];
                                  const hasSubscriptionSource = subscriptionSources.some(sub => source.includes(sub));

                                  // Replace "Familjen" with "Örtendahls familjekalender"
                                  if (source === 'Familjen' || source.includes('Familjen')) {
                                    return source.replace('Familjen', 'Örtendahls familjekalender');
                                  }

                                  // If it's a subscription source, show "Source genom Örtendahls familjekalender"
                                  if (hasSubscriptionSource) {
                                    return `${source} genom Örtendahls familjekalender`;
                                  }

                                  return source;
                                })()}
                              </span>
                            </div>
                            {(() => {
                              const isPast = event.end && new Date(event.end) < new Date();
                              const shouldStrikethrough = event.cancelled || isPast;
                              return (
                                <h3 style={{ textDecoration: shouldStrikethrough ? 'line-through' : 'none', color: shouldStrikethrough ? 'var(--text-muted)' : 'var(--card-text)', fontSize: '1.1rem', fontWeight: '600', margin: '0 0 0.2rem 0', opacity: isPast ? 0.6 : 1 }}>
                                  {event.cancelled && <span style={{ color: '#ff4757', marginRight: '0.5rem', fontSize: '0.8em', textDecoration: 'none', display: 'inline-block' }}>INSTÄLLD</span>}
                                  {isPast && !event.cancelled && <span style={{ color: 'var(--text-muted)', marginRight: '0.5rem', fontSize: '0.8em', textDecoration: 'none', display: 'inline-block' }}>PASSERAD</span>}
                                  {event.summary}
                                </h3>
                              );
                            })()}
                            <p className="location" onClick={(e) => { e.stopPropagation(); openEditModal(event); }}
                              style={{ cursor: 'pointer', color: event.coords ? '#4a90e2' : 'var(--text-muted)', textDecoration: event.coords ? 'underline' : 'none', fontSize: '0.9rem', margin: '0' }}
                              title={event.coords ? "Se på karta" : "Ingen plats"}>
                              📍 {event.location || 'Hemma/Okänd plats'}
                            </p>
                            {renderTravelInfo(event)}
                            <div className="actions" onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                              {isAdmin && renderAssignmentControl(event, 'driver')}
                              {isAdmin && renderAssignmentControl(event, 'packer')}
                            </div>
                          </div>
                        </Fragment>
                      );
                    });
                  })()
                )
              )}
            </div>
          </div >

          {/* Right: Todo */}
          <div className="todo-section" style={{
            display: (activeTab === 'dashboard' || activeTab === 'todos') ? 'block' : 'none',
            flex: (activeTab === 'todos') ? '1 1 100%' : '1' // Full width if standalone
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderLeft: '4px solid #2ed573', paddingLeft: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h2 style={{ margin: 0 }}>
                  ✅ Att göra
                </h2>
                {/* Navigation for specific views */}
                {(activeTab === 'todos' || viewMode === 'week') && (
                  <div style={{ display: 'flex', alignItems: 'center', marginLeft: '0.5rem', background: 'var(--bg-secondary)', padding: '0.2rem', borderRadius: '8px' }}>
                    <button onClick={() => changeDay(-7)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-main)' }}>‹</button>
                    <span style={{ margin: '0 0.5rem', fontWeight: 'bold' }}>v.{getWeekNumber(selectedDate)}</span>
                    <button onClick={() => changeDay(7)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-main)' }}>›</button>
                  </div>
                )}
                {/* Fallback label for other modes */}
                {!(activeTab === 'todos' || viewMode === 'week') && (
                  <span style={{ fontSize: '1.2rem', fontWeight: 'bold', marginLeft: '0.5rem' }}>
                    ({viewMode === 'month' ? selectedDate.toLocaleDateString('sv-SE', { month: 'long' }) :
                      viewMode === 'upcoming' ? 'Kommande' :
                        `v.${getWeekNumber(selectedDate)}`})
                  </span>
                )}
              </div>
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
      {/* Inbox Modal */}
      <InboxModal
        isOpen={showInbox}
        onClose={() => {
          setShowInbox(false);
          fetchInbox(); // Refresh to ensure sync (e.g. if new items arrived while open)
        }}
        onImport={(item) => {
          // We rely on polling or close to update badge, but since badge is usually 0 when open, this is fine
        }}
        getGoogleLink={getGoogleCalendarLink}
      />

      {/* Event Detail Modal */}
      {
        selectedEventForDetail && (
          <EventDetailModal
            event={selectedEventForDetail}
            allEvents={allEvents}
            onClose={() => setSelectedEventForDetail(null)}
            onEdit={openEditModal}
            onNavigate={setSelectedEventForDetail}
            onShowAllUpcoming={() => {
              setSelectedEventForDetail(null);
              setViewMode('upcoming');
              setActiveTab('timeline'); // Switch to dedicated timeline/calendar view
              // Optional: Scroll to top or specific element if needed
            }}
            getGoogleCalendarLink={getGoogleCalendarLink}
          />
        )
      }

    </div >
  )
}

export default App
