# Nasida Attend: Next-Gen AI Attendance System

#### An enterprise-grade attendance solution powered by Face Recognition, Geographic Fencing, and Interactive Liveness Detection.

---

## Key Features

### AI Face Recognition
*   **Precision Matching**: High-accuracy face identification using pgvector and face-api.js.
*   **Sub-Second Enrollment**: Enroll users in seconds with a few frames.
*   **Similarity Enforcement**: Adjustable match thresholds to eliminate false positives.

### Interactive Liveness Detection (Anti-Spoofing)
*   **Live Proof-of-Life**: Prevents photo and screen-capture fraud.
*   **Head-Turn Challenge**: Interactive prompts ensure the user is a real, 3D person.
*   **Auto-Capture**: Seamlessly records attendance only after liveness is verified.

### Geofencing & Location Awareness
*   **Precision Guarding**: Configurable office radii (meters) to ensure physical presence.
*   **Real-time Diagnostics**: Detailed feedback for out-of-range users.
*   **GPS Verification**: High-precision coordinate tracking (6 decimal places).

### Configurable Operations
*   **Dynamic Workdays**: Admins can configure open/closed days (e.g., Mon-Fri).
*   **Global Presence**: Unified management for multiple office locations.
*   **Premium Reporting**: Printer-friendly, professional attendance reports with watermarking.

---

## Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React + Vite + TypeScript |
| **Styling** | Tailwind CSS + Lucide Icons |
| **Database** | Supabase (PostgreSQL) |
| **Search/Vector** | pgvector (Vector distance search) |
| **AI/ML** | face-api.js (TensorFlow.js) |
| **UI Components** | shadcn/ui + Radix UI |

---

## Getting Started

### Prerequisites
- Node.js (v18+)
- Supabase Project with pgvector enabled

### Local Setup

```sh
# 1. Clone the repository
git clone <YOUR_GIT_URL>
cd nasida-attend

# 2. Install dependencies
npm install

# 3. Setup Environment
# Create a .env file with your Supabase credentials
# VITE_SUPABASE_URL=your_url
# VITE_SUPABASE_ANON_KEY=your_key

# 4. Start Development
npm run dev
```

### Database Initialization
Run the provided SQL scripts in your Supabase SQL Editor to initialize:
- office_locations (with working_days)
- profiles (with face_embedding)
- Custom RPCs for geofenced identification.

---

## Design Philosophy
Nasida Attend is built with a focus on Premium User Experience. From the smooth CSS-only splash screens to the interactive AI-guided capture, every interaction is designed to feel fast, secure, and state-of-the-art.

---
*Built for High-Stakes Attendance.*
