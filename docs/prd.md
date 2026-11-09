# Requirements Document

## 1. Application Overview

**Application Name**: GIS-Based Emergency Response System - LDRRMO Diplahan

**Description**: A unified React + Vite application and PWA serving LDRRMO Diplahan. The system provides emergency reporting, GIS incident mapping, IoT flood monitoring, responder coordination, and administrative management. Its PHP API uses XAMPP-hosted MySQL and PHP sessions; the frontend polls the API for updates.

---

## 2. Users and Use Cases

**Target Users**:
- Residents of Diplahan (report emergencies, receive alerts)
- LDRRMO Staff and Supervisors (respond to incidents, monitor map)
- Administrators (manage users, system config, analytics)

**Core Use Cases**:
- Resident submits an emergency report with GPS coordinates and photo/video
- LDRRMO responder views real-time incident map and assigns response teams
- System ingests IoT flood sensor data and triggers threshold-based alerts
- Administrator manages user accounts, reviews audit logs, and configures IoT devices
- Caller/SMS emergency is manually logged and assigned to a responder

---

## 3. Page Structure and Functional Description

### 3.1 Page Hierarchy

```
Unified React Web Application
├── Public Landing Page
├── Authentication
│   ├── Register
│   └── Login
├── Resident Portal
│   ├── Submit Emergency Report
│   ├── My Reports (status tracking)
│   ├── Incident Map (view nearby incidents)
│   └── Evacuation Routes and Shelter Locations
├── LDRRMO Responder Dashboard
│   ├── Real-Time Incident Map
│   ├── Incoming Reports
│   ├── Responder Assignment
│   ├── Responder GPS Tracking
│   ├── Evacuation Center Management
│   ├── IoT Flood Monitoring Dashboard
│   ├── Caller/SMS Emergency Log
│   └── Notification Broadcasting
└── Administrator Panel
    ├── User Management
    ├── System Configuration
    ├── IoT Device Management
    ├── Audit Logs
    └── Analytics Dashboard
```

### 3.2 Public Landing Page

- Displays system name, LDRRMO Diplahan branding, and brief description
- Provides navigation links to Login and Register
- No authentication required

### 3.3 Authentication

**Register**:
- Resident self-registration: full name, contact number, address, email, password
- Role assigned as Resident by default
- Authentication uses PHP sessions, password hashes, and server-side CSRF protection

**Login**:
- Email and password login for all roles
- On successful login, user is redirected to the appropriate portal based on role (Resident, LDRRMO Staff, Supervisor, Admin)
- Role-based routing enforced on all protected routes

### 3.4 Resident Portal

**Submit Emergency Report**:
- Select emergency type: fire, flood, medical, accident, or other
- Select severity level: low, moderate, high, critical
- Auto-capture GPS coordinates via Browser Geolocation API, or choose a Diplahan barangay and an OpenStreetMap street when mapped
- Manually selected streets start at an approximate mapped point; the resident can tap the Diplahan map to place the exact incident pin before submitting
- OpenStreetMap street lookup requires internet access and sends the selected barangay search to the public Photon geocoder; unmapped streets remain locatable by dropping a pin on the map
- Optional photo/video attachment
- Text description field
- Offline queuing: report is stored locally and submitted when connectivity is restored
- On submission, report is saved to the database and a confirmation is shown

**My Reports**:
- List of reports submitted by the logged-in resident
- Each entry shows report type, severity, submission date/time, and current status (open, in-progress, resolved, closed)

**Incident Map**:
- Leaflet.js map with OpenStreetMap tiles
- Displays markers for nearby active incidents
- Displays evacuation center markers and flood zone overlays
- Resident's current GPS location shown on map

**Evacuation Routes and Shelter Locations**:
- List and map view of registered evacuation centers and safe zones
- Route visualization from resident's current location to nearest shelter

### 3.5 LDRRMO Responder Dashboard

Accessible to roles: LDRRMO Staff, Supervisor, Admin.

**Real-Time Incident Map**:
- Leaflet.js map with OpenStreetMap tiles
- Real-time incident markers with color-coded severity
- Responder GPS location markers use saved location updates and periodic refresh
- Evacuation center markers
- Flood zone overlays
- Clicking a marker opens incident detail panel

**Incoming Reports**:
- List of all active emergency reports with type, severity, location, reporter name, and timestamp
- Filter by status, type, and severity
- Open report detail to view full information including attached photos/videos

**Responder Assignment**:
- Assign one or more responders to an incident
- Update incident status: open, in-progress, resolved, closed
- Add status update notes
- Generate after-action report on incident closure

**Responder GPS Tracking**:
- Real-time display of all active responder GPS locations on the incident map
- Responder location updates sent from their device

**Evacuation Center Management**:
- Add, edit, and deactivate evacuation centers and safe zones
- Each center stores name, address, GPS coordinates, capacity, and current status

**IoT Flood Monitoring Dashboard**:
- Real-time charts displaying water level and rainfall data from registered IoT sensors
- Current sensor readings with timestamps
- Threshold-based alert indicators: when a sensor reading exceeds a configured threshold, an alert is triggered and displayed

**Caller/SMS Emergency Log**:
- Manual entry form: caller name, contact number, reported location (manual GPS input or address), emergency type, description
- Log is saved to the database and appears as an incident that can be assigned to a responder
- List view of all caller/SMS-logged incidents

**Notification Broadcasting**:
- Compose and send broadcast messages to all residents or a selected group
- Notification channels: in-app broadcast, push notification to PWA, SMS via configured gateway, email
- Sent notification history log

### 3.6 Administrator Panel

Accessible to role: Admin only.

**User Management**:
- View, create, edit, and deactivate user accounts (residents, responders, admins)
- Assign and change user roles
- Search and filter users by role, name, or status

**System Configuration**:
- Configure SMS gateway settings
- Configure notification thresholds and default alert messages
- Manage system-wide parameters

**IoT Device Management**:
- Register, edit, and deactivate IoT sensor devices
- Each device stores device ID, name, location (GPS coordinates), type (water level, rainfall), and status
- Configure alert thresholds per device

**Audit Logs**:
- Chronological log of all significant system actions: logins, report submissions, assignments, status changes, user management actions, configuration changes
- Filter by user, action type, and date range
- Export audit log as CSV

**Analytics Dashboard**:
- Summary statistics: total incidents by type and status, response times, active responders
- Incident trend charts over configurable date ranges
- IoT sensor historical data charts

---

## 4. Business Rules and Logic

### 4.1 Role-Based Access Control

| Role | Accessible Areas |
|---|---|
| Resident | Resident Portal only |
| LDRRMO Staff | Responder Dashboard (no broadcast, no evacuation center management) |
| Supervisor | Full Responder Dashboard |
| Admin | Full Responder Dashboard + Administrator Panel |

- Protected routes are checked in the frontend, and the PHP API independently enforces the current account's role for every protected operation
- Unauthorized access attempts redirect to login

### 4.2 Incident Lifecycle

- Status flow: open -> in-progress -> resolved -> closed
- Only Supervisor and Admin can mark an incident as resolved or closed
- Closing an incident requires an after-action report entry

### 4.3 IoT Alert Triggers

- When a sensor reading exceeds the configured threshold for that device, the system automatically creates an alert notification
- Alert is displayed on the IoT dashboard and dispatched as a broadcast notification to all residents

### 4.4 Offline Queuing (Resident PWA)

- Emergency reports created without connectivity are stored in local device storage
- When connectivity is restored, queued reports are automatically submitted to the backend API

### 4.5 Real-Time Location Updates

- Residents sharing location during an active emergency send GPS coordinates to the backend at regular intervals
- Responders on active assignments send GPS coordinates to the backend at regular intervals
- Both are displayed as live markers on the incident map

### 4.6 Notification Dispatch

- Push notifications are dispatched to PWA subscribers
- SMS alerts are sent via the configured SMS gateway
- In-app broadcasts are stored in the notifications table and shown on refresh. SMS, email, and push channels require separately configured delivery providers and must not be reported as delivered otherwise.
- Email notifications are sent via the configured email service

---

## 5. Exceptions and Edge Cases

| Scenario | Handling |
|---|---|
| GPS unavailable on report submission | User is prompted to enter location manually; submission is not blocked |
| Offline report submission | Report queued locally; submitted automatically when online |
| Duplicate report submission | Backend checks for reports from the same user within a short time window for the same location and type; duplicate flagged for review |
| IoT sensor offline | Sensor status shown as offline on dashboard; last known reading displayed with timestamp |
| PHP session expired | User is redirected to login page |
| Unauthorized role access | Redirect to appropriate portal; action denied |
| SMS gateway failure | Notification dispatch logs the failure; in-app and push notifications still sent |

---

## 6. Acceptance Criteria

1. A new resident registers an account, logs in, and is directed to the Resident Portal.
2. The resident submits an emergency report with GPS coordinates, emergency type, severity, and an optional photo attachment.
3. The submitted report appears immediately on the LDRRMO Responder Dashboard incident map as a new marker and in the incoming reports list.
4. An LDRRMO Supervisor logs in, opens the report, assigns a responder, and updates the incident status to in-progress.
5. The resident views the updated status of their report in My Reports.
6. The Supervisor broadcasts a notification; the resident receives it as an in-app message.
7. The Supervisor marks the incident as resolved and submits an after-action report, then closes the incident.
8. An Admin logs in, views the audit log entry for the closed incident, and reviews the analytics dashboard showing the incident count.

---

## 7. Out of Scope for This Release

- Native iOS or Android mobile application (system uses PWA)
- Video streaming or live camera feeds
- Multi-language / localization support
- Offline map tile caching
- Inter-agency data sharing with external government systems
- Automated AI-based incident classification
- Payment or billing features
- Social features (comments, likes, sharing)
